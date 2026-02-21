// config/dbconfig.js
const mongoose = require('mongoose');

const connectDB = async () => {
    try {
        // process.env allows Node to read the variables from your .env file
        const conn = await mongoose.connect(process.env.MONGO_URI);
        
        console.log(`✅ Boom! MongoDB Connected: ${conn.connection.host}`);
    } catch (error) {
        console.error(`❌ Connection error: ${error.message}`);
        // Exit process with failure if the database connection drops
        process.exit(1);
    }
};

module.exports = connectDB;