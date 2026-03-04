// models/RootFolder.js
import mongoose from 'mongoose';

const rootFolderSchema = new mongoose.Schema({
    path: { type: String, required: true, unique: true },
    name: { type: String },
    // 🚀 Stores the absolute path to where thumbnails for this root are saved
    thumb_path: { type: String, required: true } 
}, { timestamps: true });

export default mongoose.model('RootFolder', rootFolderSchema);