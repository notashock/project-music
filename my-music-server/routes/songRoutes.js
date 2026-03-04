import express from 'express';
import { 
    stageScan, 
    confirmScan, 
    rollbackScan, 
    getAllSongs, 
    getSongById, 
    deleteSong,
    getDuplicates // 🚀 Added the new duplicate function
} from '../controllers/songController.js'; 

const router = express.Router();

// ==========================================
// TRANSACTIONAL SCANNER ROUTES
// ==========================================

// 1. Stage the scan (Finds new songs and holds them in a 'pending' state)
router.post('/scan/stage', stageScan);

// 2. Confirm the scan (Changes 'is_confirmed' to true)
router.post('/scan/confirm', confirmScan);

// 3. Rollback the scan (Deletes staged songs and cleans up thumbnails)
router.post('/scan/rollback', rollbackScan);

// ==========================================
// UTILITY & DUPLICATE MANAGEMENT
// ==========================================

// 🚀 CRITICAL: Static routes must go BEFORE dynamic (/:id) routes!
// Find logical duplicates based on metadata
router.get('/duplicates', getDuplicates);

// ==========================================
// STANDARD CRUD OPERATIONS
// ==========================================

// Get all confirmed songs
router.get('/', getAllSongs);

// Get a specific song by ID
router.get('/:id', getSongById);

// Delete a specific song from the library
router.delete('/:id', deleteSong);

export default router;