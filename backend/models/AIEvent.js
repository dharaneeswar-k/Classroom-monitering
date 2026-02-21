const mongoose = require('mongoose');

const aiEventSchema = new mongoose.Schema({
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
    cameraId: { type: mongoose.Schema.Types.ObjectId, ref: 'Camera', required: true },
    classSessionId: { type: mongoose.Schema.Types.ObjectId, ref: 'ClassSession', required: true },
    timestamp: { type: Date, default: Date.now },
    signals: {
        eyesClosed: { type: Boolean, default: false },
        yawning: { type: Boolean, default: false },
        lookingAway: { type: Boolean, default: false }
    }
}, { timestamps: true });

module.exports = mongoose.model('AIEvent', aiEventSchema);
