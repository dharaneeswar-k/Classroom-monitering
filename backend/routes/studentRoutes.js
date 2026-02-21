const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/authMiddleware');
const {
    getAttendanceSummary,
    getAttendanceDetails,
    submitODRequest,
    getEligibleFaculty,
    getProfile,
    getMyAttendanceHistory,
    getMyDailyAttendance,
    getMyODRequests
} = require('../controllers/studentController');

// All routes require authentication and student role
router.use(protect);
router.use(authorize('student'));

router.route('/profile')
    .get(getProfile);

router.route('/eligible-faculty')
    .get(getEligibleFaculty);

router.route('/attendance/summary')
    .get(getAttendanceSummary);

router.route('/attendance/details')
    .get(getAttendanceDetails);

router.route('/attendance/history')
    .get(getMyAttendanceHistory);

// New: daily rollup from DailyAttendance model
router.route('/attendance/daily')
    .get(getMyDailyAttendance);

router.route('/od-requests')
    .get(getMyODRequests)
    .post(submitODRequest);

module.exports = router;
