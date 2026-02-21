const mongoose = require('mongoose');

const attendanceSchema = new mongoose.Schema({
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
    classSessionId: { type: mongoose.Schema.Types.ObjectId, ref: 'ClassSession', required: true },
    status: { type: String, enum: ['present', 'absent', 'od'], required: true },
    engagementScore: { type: Number, default: 100 },
    behaviors: [{
        signalType: String, // 'eyesClosed', 'yawning', 'lookingAway'
        timestamp: Date,
        penalty: Number
    }],
    source: { type: String, enum: ['ai', 'od'], required: true }
}, { timestamps: true });

// Prevent duplicate records: one record per student per session
attendanceSchema.index({ studentId: 1, classSessionId: 1 }, { unique: true });

module.exports = mongoose.model('Attendance', attendanceSchema);
