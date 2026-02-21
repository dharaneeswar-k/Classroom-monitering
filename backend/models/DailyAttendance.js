const mongoose = require('mongoose');

const dailyAttendanceSchema = new mongoose.Schema({
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
    classroomId: { type: mongoose.Schema.Types.ObjectId, ref: 'Classroom', required: true },
    date: { type: String, required: true }, // Format: YYYY-MM-DD for easy grouping
    totalSessions: { type: Number, default: 0 },
    attendedSessions: { type: Number, default: 0 },
    percentage: { type: Number, default: 0 }
}, { timestamps: true });

// Ensure a student only has one daily record per classroom per date
dailyAttendanceSchema.index({ studentId: 1, classroomId: 1, date: 1 }, { unique: true });

module.exports = mongoose.model('DailyAttendance', dailyAttendanceSchema);
