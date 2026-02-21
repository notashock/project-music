require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const connectDB = require('./config/dbconfig');
const songRoutes = require('./routes/songRoutes');
const Song = require('./models/Song'); // Import your Mongoose Schema

const app = express();
const PORT = process.env.PORT || 3000;

// Connect to Local MongoDB
connectDB();

// Middleware
app.use(express.json());
app.use('/thumbs', express.static(path.join(__dirname, 'metadata', 'thumbnails')));

// Mount your new Controller Routes
app.use('/api/songs', songRoutes);

// ==========================================
// TEMPORARY FRONTEND (View MongoDB Songs)
// ==========================================
app.get('/', async (req, res) => {
    try {
        // Fetch all songs directly from MongoDB, newest first
        const songs = await Song.find().sort({ createdAt: -1 });

        let html = `
        <!DOCTYPE html>
        <html>
        <head>
            <title>My Scratch Music Server</title>
            <style>
                body { font-family: sans-serif; background: #121212; color: white; padding: 20px; max-width: 800px; margin: 0 auto; }
                .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #282828; padding-bottom: 10px; margin-bottom: 20px; }
                .btn { background: #1db954; color: white; border: none; padding: 10px 20px; border-radius: 20px; cursor: pointer; font-weight: bold; }
                .btn:hover { background: #1ed760; }
                .song-card { display: flex; align-items: center; background: #1e1e1e; margin-bottom: 10px; padding: 10px; border-radius: 8px; }
                .song-card img { width: 60px; height: 60px; border-radius: 4px; margin-right: 15px; object-fit: cover; background: #282828; }
                .info { flex-grow: 1; }
                .info h4 { margin: 0; font-size: 16px; }
                .info p { margin: 5px 0 0; color: #b3b3b3; font-size: 14px; }
                audio { height: 35px; outline: none; }
            </style>
        </head>
        <body>
            <div class="header">
                <h1>My Music Vault (${songs.length} tracks)</h1>
                <button class="btn" onclick="scanLibrary()">Scan for New Music</button>
            </div>
            <div id="status"></div>
            <div class="song-list">
        `;

        if (songs.length === 0) {
            html += `<p style="color: #b3b3b3;">Database is empty. Click "Scan for New Music" to load songs from your folder.</p>`;
        } else {
            songs.forEach(song => {
                const streamUrl = `/stream?path=${encodeURIComponent(song.full_path)}`;
                
                // Fallback to a placeholder if the thumbnail didn't generate
                let thumbUrl = 'https://via.placeholder.com/60x60/282828/ffffff?text=%E2%99%AA';
                if (song.thumbnail_path) {
                    thumbUrl = `/thumbs/${path.basename(song.thumbnail_path)}`;
                }

                html += `
                    <div class="song-card">
                        <img src="${thumbUrl}" alt="Cover">
                        <div class="info">
                            <h4>${song.title}</h4>
                            <p>${song.artist} • ${song.album}</p>
                        </div>
                        <audio controls src="${streamUrl}" preload="none"></audio>
                    </div>
                `;
            });
        }

        html += `
            </div>
            
            <script>
                // JavaScript to connect the UI button to your API route
                function scanLibrary() {
                    const statusDiv = document.getElementById('status');
                    statusDiv.innerHTML = '<p style="color: #1db954; margin-bottom: 15px;">Scanning library... Please wait.</p>';
                    
                    fetch('/api/songs/scan', { method: 'POST' })
                        .then(response => response.json())
                        .then(data => {
                            if(data.error) throw new Error(data.error);
                            alert(data.message + "\\nNew songs added: " + (data.newSongsAdded || 0));
                            window.location.reload(); // Refresh the page to show new songs
                        })
                        .catch(error => {
                            console.error('Error:', error);
                            statusDiv.innerHTML = '<p style="color: red; margin-bottom: 15px;">Error scanning library. Check terminal.</p>';
                        });
                }
            </script>
        </body>
        </html>
        `;

        res.send(html);

    } catch (err) {
        console.error("Error loading UI:", err);
        res.status(500).send("Internal Server Error: Could not fetch from MongoDB");
    }
});

// ==========================================
// THE STREAMING ENGINE
// ==========================================
app.get('/stream', (req, res) => {
    const filePath = req.query.path;

    if (!filePath || !fs.existsSync(filePath)) {
        return res.status(404).send("File not found on disk");
    }

    const stat = fs.statSync(filePath);
    const range = req.headers.range;

    if (range) {
        const parts = range.replace(/bytes=/, "").split("-");
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : stat.size - 1;
        const chunksize = (end - start) + 1;
        const file = fs.createReadStream(filePath, {start, end});
        
        res.writeHead(206, {
            'Content-Range': `bytes ${start}-${end}/${stat.size}`,
            'Accept-Ranges': 'bytes',
            'Content-Length': chunksize,
            'Content-Type': 'audio/mpeg',
        });
        file.pipe(res);
    } else {
        res.writeHead(200, {
            'Content-Length': stat.size,
            'Content-Type': 'audio/mpeg',
        });
        fs.createReadStream(filePath).pipe(res);
    }
});

app.listen(PORT, () => {
    console.log(`Server running at http://127.0.0.1:${PORT}`);
});