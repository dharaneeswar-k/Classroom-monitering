const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    name: { type: String, required: true },
    role: { type: String, enum: ['admin', 'faculty', 'student'], required: true },
    email: { type: String, required: function () { return this.role === 'admin' || this.role === 'faculty'; } },
    registerNumber: { type: String, required: function () { return this.role === 'student'; }, unique: true, sparse: true },
    password: { type: String, required: true },
    status: { type: String, enum: ['active', 'inactive'], default: 'active' }
}, { timestamps: true });

module.exports = mongoose.model('User', userSchema);
