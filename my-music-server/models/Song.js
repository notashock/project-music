// models/Song.js
import mongoose from 'mongoose';

const songSchema = new mongoose.Schema({
    filename: { type: String, required: true },
    
    // Notice we removed 'unique: true' from here!
    relative_path: { type: String, required: true }, 
    
    // 🚀 RELATIONAL STABILITY: Links the song to its specific root folder
    root_folder: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'RootFolder', 
        required: true 
    }, 
    
    // 🚀 TRANSACTIONAL STABILITY: Keeps the song hidden until you click "Confirm"
    is_confirmed: { type: Boolean, default: false }, 
    
    title: { type: String, default: 'Unknown Title' },
    artist: { type: String, default: 'Unknown Artist' },
    album: { type: String, default: 'Unknown Album' },
    thumbnail_path: { type: String, default: null }
}, {
    timestamps: true // Automatically adds createdAt and updatedAt
});

// 🚀 BULLETPROOF DUPLICATE PREVENTION (Compound Index)
// This tells MongoDB: "Only block a duplicate if the relative_path AND the root_folder are exactly the same."
songSchema.index({ relative_path: 1, root_folder: 1 }, { unique: true });

export default mongoose.model('Song', songSchema);