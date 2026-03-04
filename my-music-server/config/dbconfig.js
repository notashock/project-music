import mongoose from 'mongoose';

const connectDB = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/music_vault');
        console.log('✅ MongoDB Connected');
    } catch (error) {
        console.error('❌ DB Error:', error);
        process.exit(1);
    }
};

export default connectDB;