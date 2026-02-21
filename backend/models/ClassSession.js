const mongoose = require('mongoose');

const classSessionSchema = new mongoose.Schema({
    classroomId: { type: mongoose.Schema.Types.ObjectId, ref: 'Classroom', required: true },
    facultyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Faculty', required: true },
    sessionName: { type: String, required: true },
    date: { type: Date, required: true },
    startTime: { type: Date, required: true },
    endTime: { type: Date },
    durationMinutes: { type: Number, default: 0 },
    status: { type: String, enum: ['active', 'completed'], default: 'active' }
}, { timestamps: true });

module.exports = mongoose.model('ClassSession', classSessionSchema);
