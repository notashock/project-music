// routes/songRoutes.js
const express = require('express');
const router = express.Router();
const songController = require('../controllers/songController');

// Trigger the scanner (Send a POST request here to update the library)
router.post('/scan', songController.scanLibrary);

// Standard CRUD operations
router.get('/', songController.getAllSongs);
router.get('/:id', songController.getSongById);
router.delete('/:id', songController.deleteSong);

module.exports = router;