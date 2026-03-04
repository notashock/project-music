import fs from 'fs/promises';
import { constants } from 'fs';
import path from 'path';

export const fileSentinel = {
    // Check if a path exists and is readable
    async canAccess(targetPath) {
        try {
            await fs.access(targetPath, constants.R_OK);
            return true;
        } catch {
            return false;
        }
    },

    // Safeguard against Directory Traversal attacks
    safeJoin(root, relative) {
        const joined = path.resolve(root, relative);
        if (!joined.startsWith(path.resolve(root))) {
            throw new Error("Security Violation: Unauthorized path access attempted.");
        }
        return joined;
    },

    // Fetch file metadata safely without crashing the server
    async getStats(targetPath) {
        try {
            return await fs.stat(targetPath);
        } catch (err) {
            console.error(`Sentinel Alert: ${err.message}`);
            return null;
        }
    }
};