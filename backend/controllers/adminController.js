const Classroom = require('../models/Classroom');
const Camera = require('../models/Camera');
const User = require('../models/User');

// --- Classrooms --- //

// @desc    Create a new classroom
// @route   POST /api/admin/classrooms
// @access  Private/Admin
exports.createClassroom = async (req, res) => {
    try {
        const { name, department, year } = req.body;
        const classroom = await Classroom.create({ name, department, year: Number(year) });
        res.status(201).json(classroom);
    } catch (error) {
        console.error('STUCK ON CREATE CLASSROOM ERROR:', error);
        res.status(400).json({ message: error.message });
    }
};

// @desc    Get all classrooms
// @route   GET /api/admin/classrooms
// @access  Private/Admin
exports.getClassrooms = async (req, res) => {
    try {
        const classrooms = await Classroom.find({});
        res.json(classrooms);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Update a classroom
// @route   PUT /api/admin/classrooms/:id
// @access  Private/Admin
exports.updateClassroom = async (req, res) => {
    try {
        const { name, department, year, status } = req.body;
        const classroom = await Classroom.findById(req.params.id);
        if (!classroom) return res.status(404).json({ message: 'Classroom not found' });

        if (name) classroom.name = name;
        if (department) classroom.department = department;
        if (year) classroom.year = year;
        if (status) classroom.status = status;

        await classroom.save();
        res.json(classroom);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

// @desc    Delete a classroom
// @route   DELETE /api/admin/classrooms/:id
// @access  Private/Admin
exports.deleteClassroom = async (req, res) => {
    try {
        const classroom = await Classroom.findById(req.params.id);
        if (!classroom) return res.status(404).json({ message: 'Classroom not found' });
        await Classroom.findByIdAndDelete(req.params.id);
        res.json({ message: 'Classroom removed' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};


// --- Cameras --- //

// @desc    Create a new camera and assign to classroom
// @route   POST /api/admin/cameras
// @access  Private/Admin
exports.createCamera = async (req, res) => {
    try {
        const { name, streamUrl, classroomId } = req.body;
        const camera = await Camera.create({ name, streamUrl, classroomId });
        res.status(201).json(camera);
    } catch (error) {
        console.error('STUCK ON CREATE CAMERA ERROR:', error);
        res.status(400).json({ message: error.message });
    }
};

// @desc    Get all cameras
// @route   GET /api/admin/cameras
// @access  Private/Admin
exports.getCameras = async (req, res) => {
    try {
        const cameras = await Camera.find({}).populate('classroomId', 'name department');
        res.json(cameras);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Update a camera
// @route   PUT /api/admin/cameras/:id
// @access  Private/Admin
exports.updateCamera = async (req, res) => {
    try {
        const { name, streamUrl, classroomId, status } = req.body;
        const camera = await Camera.findById(req.params.id);
        if (!camera) return res.status(404).json({ message: 'Camera not found' });

        if (name) camera.name = name;
        if (streamUrl) camera.streamUrl = streamUrl;
        if (classroomId) camera.classroomId = classroomId;
        if (status) camera.status = status;

        await camera.save();
        res.json(camera);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

// @desc    Delete a camera
// @route   DELETE /api/admin/cameras/:id
// @access  Private/Admin
exports.deleteCamera = async (req, res) => {
    try {
        const camera = await Camera.findById(req.params.id);
        if (!camera) return res.status(404).json({ message: 'Camera not found' });
        await Camera.findByIdAndDelete(req.params.id);
        res.json({ message: 'Camera removed' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};


// --- Users (Faculty & Students Base) --- //

// @desc    Get all users
// @route   GET /api/admin/users
// @access  Private/Admin
exports.getUsers = async (req, res) => {
    try {
        const users = await User.find({}).select('-password');
        res.json(users);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const bcrypt = require('bcryptjs');
const Student = require('../models/Student');
const Faculty = require('../models/Faculty');
const cloudinary = require('../config/cloudinary');

// @desc    Create a new user (Admin, Faculty, or Student)
// @route   POST /api/admin/users
// @access  Private/Admin
exports.createUser = async (req, res) => {
    try {
        const { name, email, password, role, registerNumber, department, year, classroomId } = req.body;

        let userExists;
        if (role === 'student' && registerNumber) {
            userExists = await User.findOne({ registerNumber });
        } else if (email) {
            userExists = await User.findOne({ email });
        }

        if (userExists) {
            return res.status(400).json({ message: 'User already exists' });
        }

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password || '12345', salt); // Default password '12345'

        const user = await User.create({
            name,
            email: role !== 'student' ? email : undefined,
            registerNumber: role === 'student' ? registerNumber : undefined,
            password: hashedPassword,
            role
        });

        // Create associated profile
        const classroomsArray = req.body.classroomIds || (classroomId ? [classroomId] : []);

        if (role === 'student') {
            let imageUrl = null;

            // Upload to Cloudinary if file exists
            if (req.file) {
                imageUrl = await new Promise((resolve, reject) => {
                    const uploadStream = cloudinary.uploader.upload_stream(
                        { folder: 'smart_classroom_students' },
                        (error, result) => {
                            if (error) reject(error);
                            else resolve(result.secure_url);
                        }
                    );
                    const { Readable } = require('stream');
                    const readableStream = new Readable();
                    readableStream._read = () => { };
                    readableStream.push(req.file.buffer);
                    readableStream.push(null);
                    readableStream.pipe(uploadStream);
                });
            }

            await Student.create({
                userId: user._id,
                registerNumber,
                department: department || 'General',
                year: year || 1,
                classroomId: classroomsArray.length > 0 ? classroomsArray[0] : null,
                imageUrl: imageUrl
            });
        } else if (role === 'faculty') {
            await Faculty.create({
                userId: user._id,
                department: department || 'General',
                assignedClassrooms: classroomsArray
            });
        }

        res.status(201).json(user);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

// @desc    Update a user
// @route   PUT /api/admin/users/:id
// @access  Private/Admin
exports.updateUser = async (req, res) => {
    try {
        const user = await User.findById(req.params.id);
        if (!user) return res.status(404).json({ message: 'User not found' });

        const { name, email, registerNumber, department, year, classroomId, status, password } = req.body;

        user.name = name || user.name;
        user.status = status || user.status;

        if (user.role === 'student' && registerNumber) user.registerNumber = registerNumber;
        if (user.role !== 'student' && email) user.email = email;

        if (password) {
            const salt = await bcrypt.genSalt(10);
            user.password = await bcrypt.hash(password, salt);
        }

        await user.save();

        const classroomsArray = req.body.classroomIds || (classroomId ? [classroomId] : []);

        if (user.role === 'student') {
            const student = await Student.findOne({ userId: user._id });
            if (student) {
                if (registerNumber) student.registerNumber = registerNumber;
                if (department) student.department = department;
                if (year) student.year = year;
                if (classroomsArray.length > 0) student.classroomId = classroomsArray[0];
                await student.save();
            }
        } else if (user.role === 'faculty') {
            const faculty = await Faculty.findOne({ userId: user._id });
            if (faculty) {
                if (department) faculty.department = department;
                if (req.body.classroomIds || classroomId) {
                    faculty.assignedClassrooms = classroomsArray;
                }
                await faculty.save();
            }
        }

        res.json(user);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

// @desc    Delete a user
// @route   DELETE /api/admin/users/:id
// @access  Private/Admin
exports.deleteUser = async (req, res) => {
    try {
        const user = await User.findById(req.params.id);
        if (!user) return res.status(404).json({ message: 'User not found' });

        if (user.role === 'student') await Student.findOneAndDelete({ userId: user._id });
        else if (user.role === 'faculty') await Faculty.findOneAndDelete({ userId: user._id });

        // Also clean up their attendance if applicable
        const Attendance = require('../models/Attendance');
        await Attendance.deleteMany({ studentId: user._id });

        await User.findByIdAndDelete(req.params.id);

        res.json({ message: 'User removed' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};
