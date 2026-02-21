const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/authMiddleware');
const {
    startSession,
    endSession,
    getLiveAttendance,
    getPendingODRequests,
    respondToODRequest,
    getAssignedClassrooms,
    getAttendanceHistory,
    getSessionsList
} = require('../controllers/facultyController');

router.use(protect);
router.use(authorize('faculty'));

router.route('/classrooms')
    .get(getAssignedClassrooms);

// Sessions: POST to create, GET to list by classroomId query param
router.route('/sessions')
    .post(startSession)
    .get(getSessionsList);

router.route('/sessions/:id')
    .delete(exports.deleteSession = require('../controllers/facultyController').deleteSession);


router.route('/sessions/:id/end')
    .put(endSession);

router.route('/sessions/:id/attendance')
    .get(getLiveAttendance);

router.route('/attendance/:classroomId')
    .get(getAttendanceHistory);

router.route('/od-requests')
    .get(getPendingODRequests);

router.route('/od-requests/:id')
    .put(respondToODRequest);

module.exports = router;
