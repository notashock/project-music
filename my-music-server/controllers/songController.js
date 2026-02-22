import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as mm from 'music-metadata';
import Song from '../models/Song.js';
import RootFolder from '../models/RootFolder.js';

// ES Module polyfill for __dirname
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Helper function to recursively find all MP3s
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
// 1. STAGE SCAN (Hybrid: Target or Global)
// ==========================================
export const stageScan = async (req, res) => {
    try {
        // Safely extract folderPath (handles cases where req.body is empty)
        const folderPath = req.body?.folderPath;
        let rootFoldersToScan = [];

        // Scenario A: User provided a specific folder path
        if (folderPath) {
            if (!fs.existsSync(folderPath)) {
                return res.status(404).json({ error: `Directory not found on disk: ${folderPath}` });
            }

            let rootDoc = await RootFolder.findOne({ path: folderPath });
            if (!rootDoc) {
                const safeFolderName = folderPath.replace(/[^a-zA-Z0-9]/g, '_');
                const rootThumbDir = path.join(__dirname, '..', 'metadata', 'thumbnails', safeFolderName);
                
                if (!fs.existsSync(rootThumbDir)) {
                    fs.mkdirSync(rootThumbDir, { recursive: true });
                }

                rootDoc = await RootFolder.create({
                    path: folderPath,
                    name: path.basename(folderPath),
                    thumb_path: rootThumbDir
                });
            }
            rootFoldersToScan.push(rootDoc);

        } else {
            // Scenario B: Global Sync (No path provided)
            rootFoldersToScan = await RootFolder.find();
            if (rootFoldersToScan.length === 0) {
                return res.status(400).json({ 
                    error: "No existing root folders found in database. Please provide a folderPath to register one." 
                });
            }
        }

        let totalAddedCount = 0;
        let scanErrors = [];

        // Loop through the determined folder(s) safely
        for (const rootDoc of rootFoldersToScan) {
            try {
                if (!fs.existsSync(rootDoc.path)) {
                    console.warn(`⚠️ Skipping missing directory: ${rootDoc.path}`);
                    continue; 
                }

                if (!fs.existsSync(rootDoc.thumb_path)) {
                    fs.mkdirSync(rootDoc.thumb_path, { recursive: true });
                }

                const diskFiles = await getMp3Files(rootDoc.path);
                const existingDocs = await Song.find({ root_folder: rootDoc._id }, { relative_path: 1, _id: 0 }).lean();
                const existingSet = new Set(existingDocs.map(doc => doc.relative_path));

                const newFiles = diskFiles.filter(file => !existingSet.has(path.relative(rootDoc.path, file.fullPath)));

                if (newFiles.length === 0) continue; 

                const BATCH_SIZE = 50;
                for (let i = 0; i < newFiles.length; i += BATCH_SIZE) {
                    const chunk = newFiles.slice(i, i + BATCH_SIZE);
                    
                    const chunkPromises = chunk.map(async (file) => {
                        const relative_path = path.relative(rootDoc.path, file.fullPath);
                        try {
                            const metadata = await mm.parseFile(file.fullPath);
                            const title = metadata.common.title || file.name.replace('.mp3', '');
                            const artist = metadata.common.artist || 'Unknown Artist';
                            
                            let thumbName = null;
                            const picture = metadata.common.picture?.[0];
                            if (picture) {
                                thumbName = `${title}_${artist}`.replace(/[^a-z0-9]/gi, '_').toLowerCase() + '.jpg';
                                const thumbFullPath = path.join(rootDoc.thumb_path, thumbName);
                                if (!fs.existsSync(thumbFullPath)) fs.writeFileSync(thumbFullPath, picture.data);
                            }

                            return {
                                filename: file.name,
                                relative_path: relative_path,
                                root_folder: rootDoc._id, 
                                title,
                                artist,
                                album: metadata.common.album || 'Unknown Album',
                                thumbnail_path: thumbName,
                                is_confirmed: false // STAGED
                            };
                        } catch (err) {
                            console.warn(`Could not parse metadata for ${file.name}:`, err.message);
                            return null; // Skip corrupted files without crashing the whole scan
                        }
                    });

                    const validSongs = (await Promise.all(chunkPromises)).filter(song => song !== null);
                    if (validSongs.length > 0) {
                        await Song.insertMany(validSongs, { ordered: false });
                        totalAddedCount += validSongs.length;
                    }
                }
            } catch (folderError) {
                console.error(`❌ Error processing folder ${rootDoc.path}:`, folderError);
                scanErrors.push(`Failed on ${rootDoc.name}: ${folderError.message}`);
            }
        }

        res.status(200).json({ 
            message: "Scan cycle complete.", 
            newSongsStaged: totalAddedCount,
            foldersScanned: rootFoldersToScan.length,
            errors: scanErrors.length > 0 ? scanErrors : undefined
        });

    } catch (error) {
        // 🚀 EXPOSE THE REAL ERROR TO POSTMAN
        console.error("CRITICAL Scan error:", error);
        res.status(500).json({ 
            error: "Failed to scan libraries", 
            details: error.message 
        });
    }
};

// ==========================================
// 2. COMMIT SCAN
// ==========================================
export const confirmScan = async (req, res) => {
    try {
        const result = await Song.updateMany(
            { is_confirmed: false }, 
            { $set: { is_confirmed: true } }
        );

        res.status(200).json({ 
            message: "Library updated successfully!", 
            songsConfirmed: result.modifiedCount 
        });
    } catch (error) {
        res.status(500).json({ error: "Failed to confirm songs" });
    }
};

// ==========================================
// 3. ROLLBACK SCAN 
// ==========================================
export const rollbackScan = async (req, res) => {
    try {
        const stagedSongs = await Song.find({ is_confirmed: false }).populate('root_folder');
        let deletedThumbs = 0;
        
        stagedSongs.forEach(song => {
            if (song.thumbnail_path && song.root_folder) {
                const thumbFullPath = path.join(song.root_folder.thumb_path, song.thumbnail_path);
                if (fs.existsSync(thumbFullPath)) {
                    fs.unlinkSync(thumbFullPath);
                    deletedThumbs++;
                }
            }
        });

        const result = await Song.deleteMany({ is_confirmed: false });

        res.status(200).json({ 
            message: "Scan discarded safely.",
            songsRemoved: result.deletedCount,
            thumbnailsCleaned: deletedThumbs
        });
    } catch (error) {
        res.status(500).json({ error: "Failed to rollback scan" });
    }
};

// ==========================================
// CRUD OPERATIONS
// ==========================================

export const getAllSongs = async (req, res) => {
    try {
        const songs = await Song.find({ is_confirmed: true })
            .populate('root_folder', 'path name thumb_path') 
            .sort({ createdAt: -1 });
        res.status(200).json(songs);
    } catch (error) {
        res.status(500).json({ error: "Failed to fetch songs" });
    }
};

export const getSongById = async (req, res) => {
    try {
        const song = await Song.findById(req.params.id).populate('root_folder', 'path name thumb_path');
        if (!song) return res.status(404).json({ message: "Song not found" });
        res.status(200).json(song);
    } catch (error) {
        res.status(500).json({ error: "Failed to fetch song" });
    }
};

export const deleteSong = async (req, res) => {
    try {
        const song = await Song.findById(req.params.id).populate('root_folder');
        if (!song) return res.status(404).json({ message: "Song not found" });
        
        if (song.thumbnail_path && song.root_folder && song.root_folder.thumb_path) {
            const thumbFullPath = path.join(song.root_folder.thumb_path, song.thumbnail_path);
            if (fs.existsSync(thumbFullPath)) {
                fs.unlinkSync(thumbFullPath);
            }
        }

        await Song.findByIdAndDelete(req.params.id);
        res.status(200).json({ message: "Song deleted from database" });
    } catch (error) {
        res.status(500).json({ error: "Failed to delete song" });
    }
};