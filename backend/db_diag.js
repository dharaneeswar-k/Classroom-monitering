const mongoose = require('mongoose');
require('dotenv').config();

const run = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('--- DB DIAGNOSTIC ---');

        const db = mongoose.connection.db;

        const students = await db.collection('students').find().toArray();
        console.log(`TOTAL STUDENTS: ${students.length}`);
        for (const s of students) {
            console.log(`Student ID: ${s._id} | RegNo: ${s.registerNumber} | ClassRef: ${s.classroomId}`);
        }

        const classrooms = await db.collection('classrooms').find().toArray();
        console.log(`TOTAL CLASSROOMS: ${classrooms.length}`);
        for (const c of classrooms) {
            console.log(`Classroom ID: ${c._id} | Name: ${c.name}`);
        }

        const sessions = await db.collection('classsessions').find({ status: 'active' }).toArray();
        console.log(`TOTAL ACTIVE SESSIONS: ${sessions.length}`);
        for (const s of sessions) {
            console.log(`Session ID: ${s._id} | ClassRef: ${s.classroomId}`);
        }

        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
};

run();
