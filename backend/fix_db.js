const mongoose = require('mongoose');
const dotenv = require('dotenv');

dotenv.config();

const fixDatabaseIndices = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to MongoDB');

        const db = mongoose.connection.db;

        // ── Fix Students ──
        const studentsCollection = db.collection('students');
        try {
            await studentsCollection.dropIndex('rollNo_1');
            console.log('✔ Dropped stale rollNo_1 index from students.');
        } catch {
            console.log('– rollNo_1 not found on students (already clean).');
        }

        // ── Fix Cameras ──
        const camerasCollection = db.collection('cameras');
        try {
            await camerasCollection.dropIndex('cameraCode_1');
            console.log('✔ Dropped stale cameraCode_1 index from cameras.');
        } catch {
            console.log('– cameraCode_1 not found on cameras (already clean).');
        }

        // ── Fix Classrooms ──
        const classroomsCollection = db.collection('classrooms');
        // Print all existing indexes so we can see if there are any other stale ones
        const classroomIndexes = await classroomsCollection.indexes();
        console.log('Current classroom indexes:', JSON.stringify(classroomIndexes, null, 2));

        // List all camera indexes for reference
        const cameraIndexes = await camerasCollection.indexes();
        console.log('Current camera indexes:', JSON.stringify(cameraIndexes, null, 2));

        console.log('\n✅ Database index cleanup completed successfully.');
        process.exit(0);
    } catch (error) {
        console.error('Error during index cleanup:', error);
        process.exit(1);
    }
};

fixDatabaseIndices();
