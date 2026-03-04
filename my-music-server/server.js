import 'dotenv/config'; 
import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import os from 'os'; // 🚀 NEW: Required to find your local network IP
import { fileURLToPath } from 'url';

import connectDB from './config/dbconfig.js'; 
import songRoutes from './routes/songRoutes.js';
import rootRoutes from './routes/rootRoutes.js';
import Song from './models/Song.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
// 🚀 Added a fallback port just in case .env is missing it
const PORT = process.env.PORT || 5000;

connectDB();

app.use(express.json());
app.use(cors())
app.use('/api/songs', songRoutes);
app.use('/api/roots', rootRoutes);

// ==========================================
// DYNAMIC THUMBNAIL SERVING
// ==========================================
app.get('/api/thumbs/:id', async (req, res) => {
    try {
        const song = await Song.findById(req.params.id).populate('root_folder');
        
        if (!song || !song.thumbnail_path || !song.root_folder) {
            return res.status(404).send("Thumbnail not found");
        }
        
        const thumbFullPath = path.join(song.root_folder.thumb_path, song.thumbnail_path);
        
        if (fs.existsSync(thumbFullPath)) {
            res.sendFile(thumbFullPath);
        } else {
            res.status(404).send("Thumbnail file missing on disk");
        }
    } catch (err) {
        console.error("Thumbnail fetch error:", err);
        res.status(500).send("Error fetching thumbnail");
    }
});

// ==========================================
// THE SMART STREAMING ENGINE
// ==========================================
app.get('/stream', async (req, res) => {
    try {
        const songId = req.query.id;
        if (!songId) return res.status(400).send("Missing song ID");

        const song = await Song.findById(songId).populate('root_folder');
        if (!song) return res.status(404).send("Song not found in database");

        const rootDir = song.root_folder?.path || process.env.MUSIC_DIR;
        if (!rootDir) {
            return res.status(500).send("No root directory found for this song.");
        }

        const targetPath = path.resolve(rootDir, song.relative_path);

        if (!targetPath.startsWith(path.resolve(rootDir))) {
            return res.status(403).send("Forbidden access outside root directory");
        }

        if (!fs.existsSync(targetPath)) {
            return res.status(404).send("File not found on disk");
        }

        const stat = fs.statSync(targetPath);
        const range = req.headers.range;

        if (range) {
            const parts = range.replace(/bytes=/, "").split("-");
            const start = parseInt(parts[0], 10);
            const end = parts[1] ? parseInt(parts[1], 10) : stat.size - 1;
            const chunksize = (end - start) + 1;
            const file = fs.createReadStream(targetPath, {start, end});
            
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
            fs.createReadStream(targetPath).pipe(res);
        }
    } catch (err) {
        console.error("Stream error:", err);
        res.status(500).send("Internal Server Error");
    }
});

// ==========================================
// NETWORK BROADCAST INITIALIZATION
// ==========================================
const getLocalIP = () => {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            // Find the IPv4 address that is not internal (not 127.0.0.1)
            if (iface.family === 'IPv4' && !iface.internal) {
                return iface.address;
            }
        }
    }
    return 'localhost';
};

// 🚀 Binding to '0.0.0.0' explicitly exposes the server to the local network
app.listen(PORT, '0.0.0.0', () => {
    const ip = getLocalIP();
    console.log(`
    🎵 MUSIC SERVER STATUS: ONLINE
    --------------------------------------
    🏠 Local Admin: http://localhost:${PORT}
    📡 AIR Streaming: http://${ip}:${PORT}
    --------------------------------------
    `);
});