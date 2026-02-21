const fs = require('fs');
const path = require('path');
const mm = require('music-metadata');
const Song = require('../models/Song');

// Helper function to recursively find all MP3s in a directory
async function getMp3Files(dir) {
    let results = [];
    const list = await fs.promises.readdir(dir, { withFileTypes: true });
    for (const file of list) {
        const fullPath = path.resolve(dir, file.name);
        if (file.isDirectory()) {
            results = results.concat(await getMp3Files(fullPath));
        } else if (file.name.toLowerCase().endsWith('.mp3')) {
            results.push({ name: file.name, fullPath });
        }
    }
    return results;
}

// ==========================================
// THE SMART SCANNER FUNCTION
// ==========================================
exports.scanLibrary = async (req, res) => {
    try {
        const musicDir = process.env.MUSIC_DIR || req.body.folderPath;

        if (!musicDir || !fs.existsSync(musicDir)) {
            return res.status(400).json({ error: `Music directory not found: ${musicDir}` });
        }

        const thumbDir = path.join(__dirname, '..', 'metadata', 'thumbnails');
        if (!fs.existsSync(thumbDir)) {
            fs.mkdirSync(thumbDir, { recursive: true });
        }

        // 1. Get all MP3s currently on the hard drive
        const diskFiles = await getMp3Files(musicDir);

        // 2. Get all songs currently in the database
        // We only select 'full_path' to save memory
        const existingSongs = await Song.find({}, 'full_path');
        
        // Convert to a Set for lightning-fast lookups
        const existingPaths = new Set(existingSongs.map(song => song.full_path));

        // 3. Filter out files that are already in the database
        const newFiles = diskFiles.filter(file => !existingPaths.has(file.fullPath));

        let addedCount = 0;

        // 4. ONLY process the brand new files
        if (newFiles.length > 0) {
            console.log(`Detected ${newFiles.length} new songs. Processing...`);
            
            for (const file of newFiles) {
                try {
                    const metadata = await mm.parseFile(file.fullPath);
                    const title = metadata.common.title || file.name.replace('.mp3', '');
                    const artist = metadata.common.artist || 'Unknown Artist';
                    const album = metadata.common.album || 'Unknown Album';
                    let thumbnailPath = null;

                    const picture = metadata.common.picture?.[0];
                    if (picture) {
                        const thumbName = `${title}_${artist}`.replace(/[^a-z0-9]/gi, '_').toLowerCase() + '.jpg';
                        const thumbFullPath = path.join(thumbDir, thumbName);
                        fs.writeFileSync(thumbFullPath, picture.data);
                        thumbnailPath = thumbFullPath;
                    }

                    // Use .create() since we already proved it doesn't exist in the DB
                    await Song.create({
                        filename: file.name,
                        full_path: file.fullPath,
                        title,
                        artist,
                        album,
                        thumbnail_path: thumbnailPath
                    });

                    addedCount++;
                    console.log(`➕ Added: ${title}`);
                } catch (err) {
                    console.error(`Skipping unreadable file ${file.name}:`, err.message);
                }
            }
        } else {
            console.log("Library is already up to date.");
        }

        res.status(200).json({ 
            message: "Boom! Sync complete", 
            totalFilesOnDisk: diskFiles.length,
            newSongsAdded: addedCount 
        });

    } catch (error) {
        console.error("Scanning error:", error);
        res.status(500).json({ error: "Failed to scan library" });
    }
};

// ==========================================
// CRUD OPERATIONS
// ==========================================

// READ ALL
exports.getAllSongs = async (req, res) => {
    try {
        const songs = await Song.find().sort({ createdAt: -1 });
        res.status(200).json(songs);
    } catch (error) {
        res.status(500).json({ error: "Failed to fetch songs" });
    }
};

// READ ONE
exports.getSongById = async (req, res) => {
    try {
        const song = await Song.findById(req.params.id);
        if (!song) return res.status(404).json({ message: "Song not found" });
        res.status(200).json(song);
    } catch (error) {
        res.status(500).json({ error: "Failed to fetch song" });
    }
};

// DELETE
exports.deleteSong = async (req, res) => {
    try {
        const song = await Song.findByIdAndDelete(req.params.id);
        if (!song) return res.status(404).json({ message: "Song not found" });
        
        // Optional: Also delete the thumbnail from the hard drive here to save space
        if (song.thumbnail_path && fs.existsSync(song.thumbnail_path)) {
            fs.unlinkSync(song.thumbnail_path);
        }

        res.status(200).json({ message: "Song deleted from database" });
    } catch (error) {
        res.status(500).json({ error: "Failed to delete song" });
    }
};