const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('./models/User');
const Classroom = require('./models/Classroom');
const Camera = require('./models/Camera');
const Student = require('./models/Student');
const Faculty = require('./models/Faculty');
require('dotenv').config();

const seedData = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to DB. Clearing old data...');

        await User.deleteMany({});
        await Classroom.deleteMany({});
        await Camera.deleteMany({});
        await Student.deleteMany({});
        await Faculty.deleteMany({});

        const salt = await bcrypt.genSalt(10);
        const password = await bcrypt.hash('12345', salt);

        // 1. Create Users
        console.log('Creating Admin...');
        const admin = await User.create({ name: 'Super Admin', email: 'admin@school.edu', password, role: 'admin' });

        console.log('=================================');
        console.log('✅ Seeding Complete! Use the following credentials to login:');
        console.log('Admin login: admin@school.edu / 12345');
        console.log('=================================');

        process.exit(0);
    } catch (error) {
        console.error('Error seeding data:', error);
        process.exit(1);
    }
};

seedData();
