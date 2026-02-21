const mongoose = require('mongoose');
const dotenv = require('dotenv');
const connectDB = require('./config/db');
const { receiveAIEvent } = require('./controllers/aiController');
const Student = require('./models/Student');
const ClassSession = require('./models/ClassSession');
const Attendance = require('./models/Attendance');
const Camera = require('./models/Camera');

dotenv.config();

// Mock Req/Res objects
const mockRes = () => {
    const res = {};
    res.status = () => res;
    res.json = () => res;
    return res;
};

const runTests = async () => {
    // Requires for mock data
    const Classroom = require('./models/Classroom');
    const User = require('./models/User');

    await connectDB();
    console.log('Connected to DB for testing...');

    // Clean up previous test attendance
    await Attendance.deleteMany();
    await User.deleteMany();
    await Student.deleteMany();
    await Classroom.deleteMany();
    await Camera.deleteMany();
    await ClassSession.deleteMany();

    // Setup Mock Data
    let classroom = await Classroom.findOne();
    if (!classroom) classroom = await Classroom.create({ name: 'Test Room', department: 'CS', year: 1 });

    let camera1 = await Camera.findOne();
    if (!camera1) camera1 = await Camera.create({ name: 'Cam 1', streamUrl: 'http', classroomId: classroom._id });

    let student = await Student.findOne();
    if (!student) {
        student = await Student.create({ userId: new mongoose.Types.ObjectId(), registerNumber: '123', department: 'CS', year: 1, classroomId: classroom._id });
    }

    let session = await ClassSession.findOne({ status: 'active' });
    if (!session) {
        session = await ClassSession.create({ classroomId: classroom._id, facultyId: new mongoose.Types.ObjectId(), date: new Date(), startTime: new Date() });
    }

    const camera2 = new mongoose.Types.ObjectId(); // Mock a second camera ID

    console.log(`Testing with Student: ${student._id}, Session: ${session._id}`);

    // Test 1: First camera detects student yawning
    console.log('\n--- Test 1: Camera 1 Detects Yawning ---');
    await receiveAIEvent({
        body: {
            studentId: student._id,
            cameraId: camera1._id,
            classSessionId: session._id,
            timestamp: new Date(),
            signals: { yawning: true, lookingAway: false, eyesClosed: false }
        }
    }, mockRes());

    let att = await Attendance.findOne({ studentId: student._id, classSessionId: session._id });
    console.log(`Status: ${att.status}, Score: ${att.engagementScore}, Behaviors Count: ${att.behaviors.length}`);
    if (att.engagementScore === 95 && att.behaviors.length === 1) console.log('✅ Passed Test 1');
    else console.log('❌ Failed Test 1');

    // Test 2: Second camera detects yawning 2 seconds later (Duplicate Sync Test)
    console.log('\n--- Test 2: Camera 2 Detects Yawning Immediately (Sync Test) ---');
    await receiveAIEvent({
        body: {
            studentId: student._id,
            cameraId: camera2,
            classSessionId: session._id,
            timestamp: new Date(),
            signals: { yawning: true, lookingAway: false, eyesClosed: false }
        }
    }, mockRes());

    att = await Attendance.findOne({ studentId: student._id, classSessionId: session._id });
    console.log(`Status: ${att.status}, Score: ${att.engagementScore}, Behaviors Count: ${att.behaviors.length}`);
    if (att.engagementScore === 95 && att.behaviors.length === 1) console.log('✅ Passed Test 2 (Deduplicated successfully)');
    else console.log('❌ Failed Test 2');

    // Test 3: Camera 2 detects looking Away (Different signal, should count)
    console.log('\n--- Test 3: Camera 2 Detects Looking Away ---');
    await receiveAIEvent({
        body: {
            studentId: student._id,
            cameraId: camera2,
            classSessionId: session._id,
            timestamp: new Date(),
            signals: { yawning: false, lookingAway: true, eyesClosed: false }
        }
    }, mockRes());

    att = await Attendance.findOne({ studentId: student._id, classSessionId: session._id });
    console.log(`Status: ${att.status}, Score: ${att.engagementScore}, Behaviors Count: ${att.behaviors.length}`);
    if (att.engagementScore === 92 && att.behaviors.length === 2) console.log('✅ Passed Test 3');
    else console.log('❌ Failed Test 3');

    // Test 4: OD Override test
    console.log('\n--- Test 4: OD Status Override ---');
    att.status = 'od';
    await att.save();

    await receiveAIEvent({
        body: {
            studentId: student._id,
            cameraId: camera1._id,
            classSessionId: session._id,
            timestamp: new Date(),
            signals: { yawning: true, lookingAway: true, eyesClosed: true } // Max penalty
        }
    }, mockRes());

    att = await Attendance.findOne({ studentId: student._id, classSessionId: session._id });
    console.log(`Status: ${att.status}, Score: ${att.engagementScore}`);
    if (att.status === 'od' && att.engagementScore === 92) console.log('✅ Passed Test 4 (Ignored penalties due to OD)');
    else console.log('❌ Failed Test 4');

    console.log('\nAll tests complete.');
    process.exit(0);
};

runTests().catch(err => {
    require('fs').writeFileSync('err.txt', err.stack || err.toString());
    console.error(err);
    process.exit(1);
});
