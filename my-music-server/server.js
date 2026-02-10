const express = require('express');
const fs = require('fs');
const path = require('path');
const mm = require('music-metadata');

const app = express();
const PORT = 3000;
const CONFIG_FILE = './config.json';

app.use(express.urlencoded({ extended: true })); // To handle the form submission

// Helper: Get the saved path from config.json
function getSavedPath() {
    if (fs.existsSync(CONFIG_FILE)) {
        const data = JSON.parse(fs.readFileSync(CONFIG_FILE));
        return data.musicPath;
    }
    return null;
}

// 1. MAIN ROUTE: Display list or ask for path
app.get('/', (req, res) => {
    const musicPath = getSavedPath();

    if (!musicPath) {
        // No path saved? Show the setup form
        return res.send(`
            <h1>Music Server Setup</h1>
            <p>Please enter the full path to your music folder:</p>
            <form action="/set-path" method="POST">
                <input type="text" name="path" placeholder="C:/Users/Name/Music" style="width: 300px;" required>
                <button type="submit">Save Path</button>
            </form>
        `);
    }

    // Path exists? Scan for MP3s
    fs.readdir(musicPath, (err, files) => {
        if (err) return res.status(500).send("Invalid path. <a href='/reset'>Reset Path</a>");

        const songs = files.filter(file => file.endsWith('.mp3'));
        
        let html = `<h1>Your Library</h1><ul>`;
        songs.forEach(song => {
            html += `<li><a href="/stream?name=${encodeURIComponent(song)}">${song}</a></li>`;
        });
        html += `</ul><p><a href="/reset">Change Folder</a></p>`;
        
        res.send(html);
    });
});

// 2. SET PATH: Save the user's input
app.post('/set-path', (req, res) => {
    const newPath = req.body.path;
    fs.writeFileSync(CONFIG_FILE, JSON.stringify({ musicPath: newPath }));
    res.redirect('/');
});

// 3. RESET: Clear the config
app.get('/reset', (req, res) => {
    if (fs.existsSync(CONFIG_FILE)) fs.unlinkSync(CONFIG_FILE);
    res.redirect('/');
});

// 4. STREAM: Stream the requested file
app.get('/stream', (req, res) => {
    const songName = req.query.name;
    const musicPath = getSavedPath();
    const filePath = path.join(musicPath, songName);

    if (!fs.existsSync(filePath)) return res.status(404).send("File not found");

    const stat = fs.statSync(filePath);
    const head = {
        'Content-Length': stat.size,
        'Content-Type': 'audio/mpeg',
    };
    res.writeHead(200, head);
    fs.createReadStream(filePath).pipe(res);
});

app.get('/api/songs', async (req, res) => {
    const musicPath = getSavedPath();
    if (!musicPath) return res.status(400).json({ error: "No path set" });

    try {
        const files = fs.readdirSync(musicPath).filter(file => file.endsWith('.mp3'));
        
        // Loop through files and extract metadata
        const songData = await Promise.all(files.map(async (file) => {
            const filePath = path.join(musicPath, file);
            const metadata = await mm.parseFile(filePath);
            
            return {
                filename: file,
                title: metadata.common.title || file,
                artist: metadata.common.artist || "Unknown Artist",
                album: metadata.common.album || "Unknown Album",
                duration: metadata.format.duration
            };
        }));

        res.json(songData);
    } catch (err) {
        res.status(500).json({ error: "Failed to scan folder" });
    }
});

// NEW ROUTE: Fetch album art for a specific song
app.get('/api/art', async (req, res) => {
    const songName = req.query.name;
    const filePath = path.join(getSavedPath(), songName);

    try {
        const metadata = await mm.parseFile(filePath);
        const picture = metadata.common.picture && metadata.common.picture[0];

        if (picture) {
            res.contentType(picture.format);
            res.send(picture.data);
        } else {
            // Send a default placeholder if no art exists
            res.redirect('https://via.placeholder.com/300?text=No+Cover');
        }
    } catch (err) {
        res.status(404).send("Art not found");
    }
});

app.listen(PORT, () => {
    console.log(`Server started at http://localhost:${PORT}`);
});