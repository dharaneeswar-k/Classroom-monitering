const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const User = require('../models/User');

const generateToken = (id, role) => {
  return jwt.sign({ id, role }, process.env.JWT_SECRET, { expiresIn: '30d' });
};

// @desc    Register a new user (admin only normally, but keeping open for setup)
// @route   POST /api/auth/register
// @access  Public (for initial setup) / Private (Admin)
exports.register = async (req, res) => {
  try {
    const { name, email, password, role, registerNumber } = req.body;

    // Check if user exists
    let userExists;
    if (role === 'student' && registerNumber) {
      userExists = await User.findOne({ registerNumber });
    } else if (email) {
      userExists = await User.findOne({ email });
    }

    if (userExists) {
      return res.status(400).json({ message: 'User already exists' });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Create user
    const user = await User.create({
      name,
      email: role !== 'student' ? email : undefined,
      registerNumber: role === 'student' ? registerNumber : undefined,
      password: hashedPassword,
      role
    });

    if (user) {
      res.status(201).json({
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        token: generateToken(user._id, user.role)
      });
    } else {
      res.status(400).json({ message: 'Invalid user data' });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Authenticate a user
// @route   POST /api/auth/login
// @access  Public
exports.login = async (req, res) => {
  try {
    const { identifier, password } = req.body; // identifier can be email or registerNumber

    // Find user by email or registerNumber
    const user = await User.findOne({
      $or: [{ email: identifier }, { registerNumber: identifier }]
    });

    if (user && (await bcrypt.compare(password, user.password))) {
      if (user.status !== 'active') {
        return res.status(401).json({ message: 'User account is inactive' });
      }

      res.json({
        _id: user._id,
        name: user.name,
        role: user.role,
        token: generateToken(user._id, user.role)
      });
    } else {
      res.status(401).json({ message: 'Invalid credentials' });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
