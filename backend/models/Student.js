const mongoose = require('mongoose');

const studentSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    registerNumber: { type: String, required: true, unique: true },
    department: { type: String, required: true },
    year: { type: Number, required: true },
    classroomId: { type: mongoose.Schema.Types.ObjectId, ref: 'Classroom' },
    faceEncoding: { type: [Number] },
    imageUrl: { type: String },
    status: { type: String, enum: ['active', 'inactive'], default: 'active' }
}, { timestamps: true });

module.exports = mongoose.model('Student', studentSchema);
