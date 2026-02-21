const mongoose = require('mongoose');

const facultySchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    department: { type: String, required: true },
    assignedClassrooms: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Classroom' }],
    status: { type: String, enum: ['active', 'inactive'], default: 'active' }
}, { timestamps: true });

module.exports = mongoose.model('Faculty', facultySchema);
