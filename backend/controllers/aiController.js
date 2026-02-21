const AIEvent = require('../models/AIEvent');
const Attendance = require('../models/Attendance');

// Constants for engagement penalty
const PENALTIES = {
    sleeping: 20,
    yawning: 5,
    laughing: 10,
    phone_usage: 15,
    looking_away: 3
};

// @desc    Receive raw AI detection event
// @route   POST /api/ai/events
// @access  Internal Network Only (In production, restrict via IP/Secret)
exports.receiveAIEvent = async (req, res) => {
    try {
        const { studentId, cameraId, classSessionId, timestamp, signals } = req.body;

        // 1. Create Raw AI Event
        const aiEvent = await AIEvent.create({
            studentId,
            cameraId,
            classSessionId,
            timestamp: timestamp || new Date(),
            signals
        });

        // 2. Process / Aggregate Attendance & Engagement logic

        // Check if there is an existing Attendance record for this student + session
        let attendance = await Attendance.findOne({ studentId, classSessionId });

        if (!attendance) {
            // First time seeing student in this session -> Mark Present
            attendance = new Attendance({
                studentId,
                classSessionId,
                status: 'present',
                engagementScore: 100,
                behaviors: [],
                source: 'ai'
            });
        }

        // IMPORTANT: OD overrides everything. 
        // We only track engagement if they are specifically marked 'present'.
        // If they were absent but now seen, override to present (unless OD).

        if (attendance.status === 'absent') {
            attendance.status = 'present';
        }

        if (attendance.status === 'present') {
            // Calculate penalty based on active signals
            let totalPenalty = 0;
            const now = new Date();

            // Helper function to check if a signal was recently penalized (Debounce / Deduplication for Multi-Camera)
            const isDuplicate = (type) => {
                const recent = attendance.behaviors.filter(b => b.signalType === type);
                if (recent.length === 0) return false;
                const lastTime = new Date(recent[recent.length - 1].timestamp);
                const diffSecs = (now - lastTime) / 1000;
                return diffSecs < 60; // 60 seconds cooldown for the same penalty type
            };

            if (signals.sleeping && !isDuplicate('sleeping')) {
                totalPenalty += PENALTIES.sleeping;
                attendance.behaviors.push({ signalType: 'sleeping', timestamp: now, penalty: PENALTIES.sleeping });
            }
            if (signals.yawning && !isDuplicate('yawning')) {
                totalPenalty += PENALTIES.yawning;
                attendance.behaviors.push({ signalType: 'yawning', timestamp: now, penalty: PENALTIES.yawning });
            }
            if (signals.laughing && !isDuplicate('laughing')) {
                totalPenalty += PENALTIES.laughing;
                attendance.behaviors.push({ signalType: 'laughing', timestamp: now, penalty: PENALTIES.laughing });
            }
            if (signals.phone_usage && !isDuplicate('phone_usage')) {
                totalPenalty += PENALTIES.phone_usage;
                attendance.behaviors.push({ signalType: 'phone_usage', timestamp: now, penalty: PENALTIES.phone_usage });
            }
            if (signals.looking_away && !isDuplicate('looking_away')) {
                totalPenalty += PENALTIES.looking_away;
                attendance.behaviors.push({ signalType: 'looking_away', timestamp: now, penalty: PENALTIES.looking_away });
            }

            // Deduct penalty (Minimum score is 0)
            if (totalPenalty > 0) {
                attendance.engagementScore = Math.max(0, attendance.engagementScore - totalPenalty);
            }

            // Save the updated attendance and engagement
            await attendance.save();
        }

        res.status(201).json({ success: true, aiEventId: aiEvent._id });
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

const Classroom = require('../models/Classroom');
const Camera = require('../models/Camera');
const Student = require('../models/Student');
const Faculty = require('../models/Faculty');

// @desc    Sync all data needed for the AI layer (Classrooms, Cameras, Students with images, Faculty)
// @route   GET /api/ai/sync
// @access  Internal Network Only
exports.syncData = async (req, res) => {
    try {
        const classrooms = await Classroom.find();
        const cameras = await Camera.find().populate('classroomId', 'name');
        const students = await Student.find({ imageUrl: { $ne: null } }).populate('userId', 'name registerNumber status');
        const faculty = await Faculty.find().populate('userId', 'name status');

        res.json({
            classrooms,
            cameras,
            students,
            faculty
        });
    } catch (error) {
        res.status(500).json({ message: 'Error syncing data: ' + error.message });
    }
};

// @desc    Mark a student as absent (Used if not seen for 30s)
// @route   POST /api/ai/absent
// @access  Internal Network Only
exports.markAbsent = async (req, res) => {
    try {
        const { studentId, classSessionId } = req.body;

        let attendance = await Attendance.findOne({ studentId, classSessionId });

        if (!attendance) {
            attendance = new Attendance({
                studentId,
                classSessionId,
                status: 'absent',
                engagementScore: 0,
                behaviors: [],
                source: 'ai'
            });
            await attendance.save();
        } else if (attendance.status === 'present') {
            // Do nothing if they were already marked present. Or perhaps change to absent?
            // Usually if they were present once, we don't automatically override back to absent after 30s, 
            // because the 30s logic is meant for initial detection.
        }

        res.status(200).json({ success: true });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};
