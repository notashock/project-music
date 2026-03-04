import express from 'express';
import { 
    addRootFolder, 
    getAllRoots, 
    updateRootFolder, 
    deleteRootFolder 
} from '../controllers/rootController.js'; // 🚀 MUST include the .js extension in ES Modules!

const router = express.Router();

// ==========================================
// ROOT FOLDER MANAGEMENT ROUTES
// ==========================================

// 1. Add a new root folder manually
router.post('/', addRootFolder);

// 2. Get all registered root folders
router.get('/', getAllRoots);

// 3. Update a specific root folder's name or settings
router.put('/:id', updateRootFolder);

// 4. Delete a root folder AND all of its associated songs
router.delete('/:id', deleteRootFolder);

export default router;