const mongoose = require('mongoose');

const cameraSchema = new mongoose.Schema({
    name: { type: String, required: true },
    streamUrl: { type: String, required: true },
    classroomId: { type: mongoose.Schema.Types.ObjectId, ref: 'Classroom', required: true },
    status: { type: String, enum: ['active', 'inactive'], default: 'active' }
}, { timestamps: true });

module.exports = mongoose.model('Camera', cameraSchema);
