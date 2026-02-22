import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import RootFolder from '../models/RootFolder.js';
import Song from '../models/Song.js';

// ES Module polyfill for __dirname
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// 1. ADD a new Root Folder manually
export const addRootFolder = async (req, res) => {
    try {
        const { targetPath, name, thumbPath } = req.body;

        if (!targetPath || !fs.existsSync(targetPath)) {
            return res.status(400).json({ error: "Provided music path does not exist on the server." });
        }

        // 🚀 LOGICAL FIX: Align with songController. Generate a unique, safe folder name per root.
        const safeFolderName = targetPath.replace(/[^a-zA-Z0-9]/g, '_');
        const defaultThumb = path.join(__dirname, '..', 'metadata', 'thumbnails', safeFolderName);
        
        const finalThumbPath = thumbPath || defaultThumb;

        if (!fs.existsSync(finalThumbPath)) {
            fs.mkdirSync(finalThumbPath, { recursive: true });
        }

        const newRoot = await RootFolder.create({
            path: targetPath,
            name: name || path.basename(targetPath),
            thumb_path: finalThumbPath
        });

        res.status(201).json({ message: "Root folder added successfully", root: newRoot });
    } catch (error) {
        if (error.code === 11000) {
            return res.status(400).json({ error: "This folder is already registered." });
        }
        res.status(500).json({ error: "Failed to add root folder" });
    }
};

// 2. GET all Root Folders
export const getAllRoots = async (req, res) => {
    try {
        const roots = await RootFolder.find().sort({ createdAt: -1 });
        res.status(200).json(roots);
    } catch (error) {
        res.status(500).json({ error: "Failed to fetch root folders" });
    }
};

// 3. UPDATE a Root Folder
export const updateRootFolder = async (req, res) => {
    try {
        const { name, thumb_path } = req.body;
        
        const updatedRoot = await RootFolder.findByIdAndUpdate(
            req.params.id,
            { name, thumb_path },
            { new: true } 
        );

        if (!updatedRoot) return res.status(404).json({ message: "Root folder not found" });
        res.status(200).json({ message: "Root updated", root: updatedRoot });
    } catch (error) {
        res.status(500).json({ error: "Failed to update root folder" });
    }
};

// 4. DELETE a Root Folder (Cascading Delete)
export const deleteRootFolder = async (req, res) => {
    try {
        const rootId = req.params.id;
        const rootDoc = await RootFolder.findById(rootId);
        
        if (!rootDoc) return res.status(404).json({ message: "Root folder not found" });

        const songsToDelete = await Song.find({ root_folder: rootId });
        let deletedThumbs = 0;
        
        // 🚀 RELIABILITY FIX: Wrap the file deletion in a try/catch. 
        // If one thumbnail was manually deleted by the user, we don't want the whole loop to crash.
        for (const song of songsToDelete) {
            if (song.thumbnail_path) {
                const thumbFullPath = path.join(rootDoc.thumb_path, song.thumbnail_path);
                try {
                    if (fs.existsSync(thumbFullPath)) {
                        fs.unlinkSync(thumbFullPath);
                        deletedThumbs++;
                    }
                } catch (err) {
                    console.error(`Failed to delete thumbnail for ${song.title}:`, err.message);
                }
            }
        }

        // Step B: Delete all songs from the database
        const deletedSongs = await Song.deleteMany({ root_folder: rootId });

        // Step C: Delete the RootFolder document
        await RootFolder.findByIdAndDelete(rootId);

        // 🚀 CLEANUP OPTIMIZATION: Attempt to remove the entire thumbnail directory to keep the hard drive clean
        try {
            if (fs.existsSync(rootDoc.thumb_path)) {
                // Warning: We only do this if you know it's purely a thumbnail directory.
                fs.rmSync(rootDoc.thumb_path, { recursive: true, force: true });
            }
        } catch (err) {
            console.error("Could not remove root thumbnail directory:", err.message);
        }

        res.status(200).json({ 
            message: "Root folder and all associated songs removed successfully.",
            songsWiped: deletedSongs.deletedCount,
            thumbnailsCleaned: deletedThumbs
        });
    } catch (error) {
        res.status(500).json({ error: "Failed to delete root folder" });
    }
};