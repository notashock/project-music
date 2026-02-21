// models/Song.js
const mongoose = require('mongoose');

const songSchema = new mongoose.Schema({
    filename: { type: String, required: true },
    full_path: { type: String, required: true, unique: true }, // unique prevents duplicates
    title: { type: String, default: 'Unknown Title' },
    artist: { type: String, default: 'Unknown Artist' },
    album: { type: String, default: 'Unknown Album' },
    thumbnail_path: { type: String, default: null }
}, {
    timestamps: true // Automatically adds createdAt and updatedAt
});

module.exports = mongoose.model('Song', songSchema);