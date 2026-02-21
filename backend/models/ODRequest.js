const mongoose = require('mongoose');

const odRequestSchema = new mongoose.Schema({
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
    // Day-level OD: store the date as YYYY-MM-DD string (e.g. "2026-02-20")
    // classSessionId removed — OD now covers the entire day, not a single session
    requestDate: { type: String, required: true },   // YYYY-MM-DD
    requestedFacultyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Faculty', required: true },
    reason: { type: String, required: true },
    status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' }
}, { timestamps: true });

// Prevent duplicate day OD per student
odRequestSchema.index({ studentId: 1, requestDate: 1 }, { unique: true });

module.exports = mongoose.model('ODRequest', odRequestSchema);
