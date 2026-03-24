import fsPromises from 'fs/promises'; // 🚀 Upgraded to asynchronous FS
import path from 'path';
import { fileURLToPath } from 'url';
import * as mm from 'music-metadata';
import Song from '../models/Song.js';
import RootFolder from '../models/RootFolder.js';
import { fileSentinel } from '../utils/fileSentinel.js'; // 🚀 Import the Sentinel
import { libraryManager } from '../utils/libraryManager.js'; // 🚀 Import the Library Manager

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function getMp3Files(dir) {
    let results = [];
    const list = await fsPromises.readdir(dir, { withFileTypes: true });
    for (const file of list) {
        // Safe join to prevent traversal during recursive reads
        const fullPath = fileSentinel.safeJoin(dir, file.name); 
        if (file.isDirectory()) {
            results = results.concat(await getMp3Files(fullPath));
        } else if (file.name.toLowerCase().endsWith('.mp3')) {
            results.push({ name: file.name, fullPath });
        }
    }
    return results;
}

export const stageScan = async (req, res) => {
    try {
        const folderPath = req.body?.folderPath;
        let rootFoldersToScan = [];

        if (folderPath) {
            // 🚀 Replaced existsSync with non-blocking Sentinel
            if (!(await fileSentinel.canAccess(folderPath))) {
                return res.status(404).json({ error: `Directory not found or unreadable: ${folderPath}` });
            }

            let rootDoc = await RootFolder.findOne({ path: folderPath });
            if (!rootDoc) {
                const safeFolderName = folderPath.replace(/[^a-zA-Z0-9]/g, '_');
                const rootThumbDir = path.join(__dirname, '..', 'metadata', 'thumbnails', safeFolderName);
                
                if (!(await fileSentinel.canAccess(rootThumbDir))) {
                    await fsPromises.mkdir(rootThumbDir, { recursive: true });
                }

                rootDoc = await RootFolder.create({
                    path: folderPath,
                    name: path.basename(folderPath),
                    thumb_path: rootThumbDir
                });
            }
            rootFoldersToScan.push(rootDoc);
        } else {
            rootFoldersToScan = await RootFolder.find();
            if (rootFoldersToScan.length === 0) {
                return res.status(400).json({ error: "No existing root folders found." });
            }
        }

        let totalAddedCount = 0;
        let scanErrors = [];

        for (const rootDoc of rootFoldersToScan) {
            try {
                // 🚀 If an external drive was unplugged, the Sentinel catches it safely
                if (!(await fileSentinel.canAccess(rootDoc.path))) {
                    console.warn(`⚠️ Sentinel Alert: Skipping missing or locked directory: ${rootDoc.path}`);
                    continue; 
                }

                if (!(await fileSentinel.canAccess(rootDoc.thumb_path))) {
                    await fsPromises.mkdir(rootDoc.thumb_path, { recursive: true });
                }

                const diskFiles = await getMp3Files(rootDoc.path);
                
                // 🚀 ORPHAN SWEEPER: Delete DB records for songs missing from the disk
                const diskFilePathsSet = new Set(diskFiles.map(file => path.relative(rootDoc.path, file.fullPath)));
                const cleanupStats = await libraryManager.cleanOrphans(rootDoc._id, rootDoc.thumb_path, diskFilePathsSet);
                
                if (cleanupStats.removedCount > 0) {
                    console.log(`🧹 Swept ${cleanupStats.removedCount} missing songs from ${rootDoc.name}`);
                }

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
                                
                                // 🚀 Non-blocking thumbnail write
                                if (!(await fileSentinel.canAccess(thumbFullPath))) {
                                    await fsPromises.writeFile(thumbFullPath, picture.data);
                                }
                            }

                            return {
                                filename: file.name,
                                relative_path: relative_path,
                                root_folder: rootDoc._id, 
                                title, artist, 
                                album: metadata.common.album || 'Unknown Album',
                                thumbnail_path: thumbName,
                                is_confirmed: false
                            };
                        } catch (err) {
                            console.warn(`Sentinel skipped corrupted metadata for ${file.name}`);
                            return null;
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
        console.error("CRITICAL Scan error:", error);
        res.status(500).json({ error: "Failed to scan libraries", details: error.message });
    }
};

export const confirmScan = async (req, res) => {
    try {
        const result = await Song.updateMany({ is_confirmed: false }, { $set: { is_confirmed: true } });
        res.status(200).json({ message: "Library updated successfully!", songsConfirmed: result.modifiedCount });
    } catch (error) {
        res.status(500).json({ error: "Failed to confirm songs" });
    }
};

export const rollbackScan = async (req, res) => {
    try {
        const stagedSongs = await Song.find({ is_confirmed: false }).populate('root_folder');
        let deletedThumbs = 0;
        
        for (const song of stagedSongs) {
            if (song.thumbnail_path && song.root_folder) {
                const thumbFullPath = fileSentinel.safeJoin(song.root_folder.thumb_path, song.thumbnail_path);
                if (await fileSentinel.canAccess(thumbFullPath)) {
                    await fsPromises.unlink(thumbFullPath); // 🚀 Non-blocking delete
                    deletedThumbs++;
                }
            }
        }

        const result = await Song.deleteMany({ is_confirmed: false });
        res.status(200).json({ message: "Scan discarded safely.", songsRemoved: result.deletedCount, thumbnailsCleaned: deletedThumbs });
    } catch (error) {
        res.status(500).json({ error: "Failed to rollback scan" });
    }
};

// ==========================================
// CRUD OPERATIONS
// ==========================================

export const getAllSongs = async (req, res) => {
    try {
        const songs = await Song.find({ is_confirmed: true }).populate('root_folder', 'path name thumb_path').sort({ createdAt: -1 });
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
            const thumbFullPath = fileSentinel.safeJoin(song.root_folder.thumb_path, song.thumbnail_path);
            if (await fileSentinel.canAccess(thumbFullPath)) {
                await fsPromises.unlink(thumbFullPath);
            }
        }

        await Song.findByIdAndDelete(req.params.id);
        res.status(200).json({ message: "Song deleted from database" });
    } catch (error) {
        res.status(500).json({ error: "Failed to delete song" });
    }
};

// ==========================================
// DUPLICATE MANAGEMENT
// ==========================================

export const getDuplicates = async (req, res) => {
    try {
        const duplicates = await libraryManager.findDuplicates();
        res.status(200).json(duplicates);
    } catch (error) {
        res.status(500).json({ error: "Failed to fetch duplicates" });
    }
};