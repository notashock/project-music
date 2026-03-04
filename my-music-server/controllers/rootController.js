import fsPromises from 'fs/promises'; // 🚀 Upgraded to asynchronous FS
import path from 'path';
import { fileURLToPath } from 'url';
import RootFolder from '../models/RootFolder.js';
import Song from '../models/Song.js';
import { fileSentinel } from '../utils/fileSentinel.js'; // 🚀 Import the Sentinel

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const addRootFolder = async (req, res) => {
    try {
        const { targetPath, name, thumbPath } = req.body;

        if (!targetPath || !(await fileSentinel.canAccess(targetPath))) {
            return res.status(400).json({ error: "Provided music path is missing or unreadable by the Sentinel." });
        }

        const safeFolderName = targetPath.replace(/[^a-zA-Z0-9]/g, '_');
        const defaultThumb = path.join(__dirname, '..', 'metadata', 'thumbnails', safeFolderName);
        const finalThumbPath = thumbPath || defaultThumb;

        if (!(await fileSentinel.canAccess(finalThumbPath))) {
            await fsPromises.mkdir(finalThumbPath, { recursive: true });
        }

        const newRoot = await RootFolder.create({
            path: targetPath,
            name: name || path.basename(targetPath),
            thumb_path: finalThumbPath
        });

        res.status(201).json({ message: "Root folder added successfully", root: newRoot });
    } catch (error) {
        if (error.code === 11000) return res.status(400).json({ error: "This folder is already registered." });
        res.status(500).json({ error: "Failed to add root folder" });
    }
};

export const getAllRoots = async (req, res) => {
    try {
        const roots = await RootFolder.find().sort({ createdAt: -1 });
        res.status(200).json(roots);
    } catch (error) {
        res.status(500).json({ error: "Failed to fetch root folders" });
    }
};

export const updateRootFolder = async (req, res) => {
    try {
        const { name, thumb_path } = req.body;
        const updatedRoot = await RootFolder.findByIdAndUpdate(req.params.id, { name, thumb_path }, { new: true });
        if (!updatedRoot) return res.status(404).json({ message: "Root folder not found" });
        res.status(200).json({ message: "Root updated", root: updatedRoot });
    } catch (error) {
        res.status(500).json({ error: "Failed to update root folder" });
    }
};

export const deleteRootFolder = async (req, res) => {
    try {
        const rootId = req.params.id;
        const rootDoc = await RootFolder.findById(rootId);
        
        if (!rootDoc) return res.status(404).json({ message: "Root folder not found" });

        const songsToDelete = await Song.find({ root_folder: rootId });
        let deletedThumbs = 0;
        
        for (const song of songsToDelete) {
            if (song.thumbnail_path) {
                try {
                    const thumbFullPath = fileSentinel.safeJoin(rootDoc.thumb_path, song.thumbnail_path);
                    if (await fileSentinel.canAccess(thumbFullPath)) {
                        await fsPromises.unlink(thumbFullPath);
                        deletedThumbs++;
                    }
                } catch (err) {
                    console.error(`Sentinel failed to delete thumbnail for ${song.title}:`, err.message);
                }
            }
        }

        const deletedSongs = await Song.deleteMany({ root_folder: rootId });
        await RootFolder.findByIdAndDelete(rootId);

        try {
            if (await fileSentinel.canAccess(rootDoc.thumb_path)) {
                await fsPromises.rm(rootDoc.thumb_path, { recursive: true, force: true });
            }
        } catch (err) {
            console.error("Sentinel could not remove root thumbnail directory:", err.message);
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