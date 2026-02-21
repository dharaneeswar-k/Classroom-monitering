const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/authMiddleware');
const upload = require('../middleware/uploadMiddleware');
const {
    createClassroom,
    getClassrooms,
    updateClassroom,
    deleteClassroom,
    createCamera,
    getCameras,
    updateCamera,
    deleteCamera,
    getUsers,
    createUser,
    updateUser,
    deleteUser
} = require('../controllers/adminController');

// All routes require authentication and admin role
router.use(protect);
router.use(authorize('admin'));

router.route('/classrooms')
    .post(createClassroom)
    .get(getClassrooms);

router.route('/classrooms/:id')
    .put(updateClassroom)
    .delete(deleteClassroom);

router.route('/cameras')
    .post(createCamera)
    .get(getCameras);

router.route('/cameras/:id')
    .put(updateCamera)
    .delete(deleteCamera);

router.route('/users')
    .post(upload.single('image'), createUser)
    .get(getUsers);

router.route('/users/:id')
    .put(updateUser)
    .delete(deleteUser);

module.exports = router;
