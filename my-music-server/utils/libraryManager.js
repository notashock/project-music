import fsPromises from 'fs/promises';
import Song from '../models/Song.js';
import { fileSentinel } from './fileSentinel.js';

export const libraryManager = {
    // ==========================================
    // 1. CLEAN ORPHANS (Deleted/Moved Files)
    // ==========================================
    async cleanOrphans(rootId, rootThumbPath, diskFilePathsSet) {
        let removedCount = 0;
        let thumbsCleaned = 0;
        
        // Fetch ALL songs in the database for this specific root folder
        const existingSongs = await Song.find({ root_folder: rootId });

        for (const song of existingSongs) {
            // If the database song's relative path is NO LONGER in the set of actual disk files...
            if (!diskFilePathsSet.has(song.relative_path)) {
                
                // A. Delete the thumbnail image safely
                if (song.thumbnail_path && rootThumbPath) {
                    const thumbFullPath = fileSentinel.safeJoin(rootThumbPath, song.thumbnail_path);
                    if (await fileSentinel.canAccess(thumbFullPath)) {
                        await fsPromises.unlink(thumbFullPath);
                        thumbsCleaned++;
                    }
                }

                // B. Delete the database record
                await Song.findByIdAndDelete(song._id);
                removedCount++;
            }
        }

        return { removedCount, thumbsCleaned };
    },

    // ==========================================
    // 2. FIND LOGICAL DUPLICATES (Cross-Folder)
    // ==========================================
    async findDuplicates() {
        // Use MongoDB Aggregation to group songs by their metadata
        const duplicates = await Song.aggregate([
            { $match: { is_confirmed: true } }, // Only check confirmed songs
            {
                $group: {
                    // Group by Title and Artist (converted to lowercase to catch slight typos)
                    _id: { 
                        title: { $toLower: "$title" }, 
                        artist: { $toLower: "$artist" } 
                    },
                    count: { $sum: 1 },
                    // Push the actual full song documents into an array so we can see them
                    songs: { $push: "$$ROOT" } 
                }
            },
            { $match: { count: { $gt: 1 } } }, // Only keep groups that have MORE than 1 copy
            { $sort: { count: -1 } } // Sort by worst offenders first
        ]);

        return duplicates;
    }
};