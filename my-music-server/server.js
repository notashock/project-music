const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 3000;

// Path to your metadata folder
const METADATA_DIR = path.join(__dirname, 'metadata');
const LIBRARY_PATH = path.join(METADATA_DIR, 'library.json');
const THUMBNAILS_DIR = path.join(METADATA_DIR, 'thumbnails');

// 1. Serve Thumbnails as static files
// This allows you to access images via http://localhost:3000/thumbs/image.jpg
app.use('/thumbs', express.static(THUMBNAILS_DIR));

app.get('/', (req, res) => {
    if (!fs.existsSync(LIBRARY_PATH)) {
        return res.status(404).send("<h1>library.json not found!</h1><p>Run your Python scanner first.</p>");
    }

    const library = JSON.parse(fs.readFileSync(LIBRARY_PATH, 'utf-8'));
    
    // Take the first 10 songs
    const top10 = library.slice(0, 10);

    let html = `
    <html>
    <head>
        <title>My Scratch Music Server</title>
        <style>
            body { font-family: sans-serif; background: #121212; color: white; padding: 20px; }
            .song-card { display: flex; align-items: center; background: #1e1e1e; margin-bottom: 10px; padding: 10px; border-radius: 8px; }
            .song-card img { width: 60px; height: 60px; border-radius: 4px; margin-right: 15px; object-fit: cover; }
            .info { flex-grow: 1; }
            .info h4 { margin: 0; }
            .info p { margin: 5px 0 0; color: #b3b3b3; font-size: 0.9em; }
            audio { height: 30px; }
        </style>
    </head>
    <body>
        <h1>Recent 10 Songs</h1>
    `;

    top10.forEach(song => {
        // We use the filename stored in library.json to create the stream link
        const streamUrl = `/stream?path=${encodeURIComponent(song.full_path)}`;
        // Fix thumbnail path for web (it likely has backslashes from Python/Windows)
        const thumbName = song.thumbnail_path ? path.basename(song.thumbnail_path) : '';
        const thumbUrl = thumbName ? `/thumbs/${thumbName}` : 'https://via.placeholder.com/60';

        html += `
            <div class="song-card">
                <img src="${thumbUrl}" alt="Cover">
                <div class="info">
                    <h4>${song.title}</h4>
                    <p>${song.artist} • ${song.album}</p>
                </div>
                <audio controls src="${streamUrl}"></audio>
            </div>
        `;
    });

    html += `</body></html>`;
    res.send(html);
});

// 2. The Streaming Engine
app.get('/stream', (req, res) => {
    const filePath = req.query.path;

    if (!filePath || !fs.existsSync(filePath)) {
        return res.status(404).send("File not found");
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
    console.log(`Server running at http://localhost:${PORT}`);
});