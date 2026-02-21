const Attendance = require('../models/Attendance');
const Student = require('../models/Student');
const ODRequest = require('../models/ODRequest');
const Faculty = require('../models/Faculty');
const ClassSession = require('../models/ClassSession');
const DailyAttendance = require('../models/DailyAttendance');

/** Returns 'YYYY-MM-DD' in LOCAL timezone (avoids UTC midnight shift in IST/UTC+5:30) */
function localDateString(date) {
    const d = date instanceof Date ? date : new Date(date);
    const yr = d.getFullYear();
    const mo = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${yr}-${mo}-${day}`;
}

// @desc    Get student attendance summary (session-level stats)
// @route   GET /api/student/attendance/summary
// @access  Private/Student
exports.getAttendanceSummary = async (req, res) => {
    try {
        const student = await Student.findOne({ userId: req.user._id });
        if (!student) return res.status(404).json({ message: 'Student profile not found' });

        // Only count attendance from completed sessions
        const attendanceRecords = await Attendance.find({ studentId: student._id })
            .populate({ path: 'classSessionId', match: { status: 'completed' }, select: 'status' });

        let present = 0, absent = 0, od = 0;
        attendanceRecords.forEach(record => {
            if (!record.classSessionId) return; // Skip if session was not completed (filtered by match)
            if (record.status === 'present') present++;
            else if (record.status === 'absent') absent++;
            else if (record.status === 'od') od++;
        });

        const total = present + absent + od;
        const percentage = total === 0 ? 0 : ((present + od) / total) * 100;

        // Also get cumulative daily attendance for overall %
        const dailyRecords = await DailyAttendance.find({ studentId: student._id });
        let dailyTotal = 0, dailyAttended = 0;
        dailyRecords.forEach(d => {
            dailyTotal += d.totalSessions;
            dailyAttended += d.attendedSessions;
        });
        const dailyPercentage = dailyTotal === 0 ? 0 : (dailyAttended / dailyTotal) * 100;

        res.json({
            total,
            present,
            absent,
            od,
            percentage: percentage.toFixed(2),
            cumulativePercentage: dailyPercentage.toFixed(2),
            totalSessions: dailyTotal,
            attendedSessions: dailyAttended
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Get detailed attendance records (session-level with behaviors)
// @route   GET /api/student/attendance/details
// @access  Private/Student
exports.getAttendanceDetails = async (req, res) => {
    try {
        const student = await Student.findOne({ userId: req.user._id });
        if (!student) return res.status(404).json({ message: 'Student profile not found' });

        const recordsRaw = await Attendance.find({ studentId: student._id })
            .populate({
                path: 'classSessionId',
                match: { status: 'completed' },
                select: 'date startTime endTime sessionName durationMinutes status'
            })
            .sort({ 'createdAt': -1 });

        // Filter out active/abandoned sessions
        const records = recordsRaw.filter(r => r.classSessionId);

        res.json(records);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Submit an OD request (day-level)
// @route   POST /api/student/od-requests
// @access  Private/Student
exports.submitODRequest = async (req, res) => {
    try {
        const { requestDate, requestedFacultyId, reason } = req.body;

        // Validate date format
        if (!requestDate || !/^\d{4}-\d{2}-\d{2}$/.test(requestDate)) {
            return res.status(400).json({ message: 'requestDate must be in YYYY-MM-DD format' });
        }

        const student = await Student.findOne({ userId: req.user._id });
        if (!student) return res.status(404).json({ message: 'Student profile not found' });

        // Prevent duplicate OD request for the same day
        const existingReq = await ODRequest.findOne({ studentId: student._id, requestDate });
        if (existingReq) {
            return res.status(400).json({ message: `OD Request already submitted for ${requestDate}` });
        }

        const odRequest = await ODRequest.create({
            studentId: student._id,
            requestDate,
            requestedFacultyId,
            reason
        });

        res.status(201).json(odRequest);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

// @desc    Get eligible faculty for OD requests
// @route   GET /api/student/eligible-faculty
// @access  Private/Student
exports.getEligibleFaculty = async (req, res) => {
    try {
        const student = await Student.findOne({ userId: req.user._id });
        if (!student || !student.classroomId) return res.status(404).json({ message: 'Student classroom assignment not found' });

        const faculties = await Faculty.find({ assignedClassrooms: student.classroomId })
            .populate('userId', 'name email');

        const result = faculties.map(f => ({
            _id: f._id,
            name: f.userId.name
        }));

        res.json(result);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Get student profile
// @route   GET /api/student/profile
// @access  Private/Student
exports.getProfile = async (req, res) => {
    try {
        const student = await Student.findOne({ userId: req.user._id })
            .populate('userId', 'name email role status')
            .populate('classroomId', 'name department year');

        if (!student) return res.status(404).json({ message: 'Student profile not found' });

        res.json(student);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Get student's session-wise attendance history (with filters)
// @route   GET /api/student/attendance/history?date=YYYY-MM-DD&month=YYYY-MM
// @access  Private/Student
exports.getMyAttendanceHistory = async (req, res) => {
    try {
        const student = await Student.findOne({ userId: req.user._id });
        if (!student) return res.status(404).json({ message: 'Student profile not found' });

        // Build date filter on the ClassSession level, forcing completed status
        let sessionFilter = { status: 'completed' };
        if (req.query.date) {
            // Create IST-aware range (UTC+5:30) for that full local day
            const start = new Date(req.query.date + 'T00:00:00.000+05:30');
            const end = new Date(req.query.date + 'T23:59:59.999+05:30');
            sessionFilter.date = { $gte: start, $lte: end };
        } else if (req.query.month) {
            const [year, month] = req.query.month.split('-').map(Number);
            // First and last moment of the month in IST
            const start = new Date(`${year}-${String(month).padStart(2, '0')}-01T00:00:00.000+05:30`);
            const lastDay = new Date(year, month, 0).getDate();
            const end = new Date(`${year}-${String(month).padStart(2, '0')}-${lastDay}T23:59:59.999+05:30`);
            sessionFilter.date = { $gte: start, $lte: end };
        }

        // If date/month filter specified, first get matching session IDs
        let queryFilter = { studentId: student._id };
        if (Object.keys(sessionFilter).length > 0) {
            const matchedSessions = await ClassSession.find(sessionFilter).select('_id');
            const sessionIds = matchedSessions.map(s => s._id);
            queryFilter.classSessionId = { $in: sessionIds };
        }

        const history = await Attendance.find(queryFilter)
            .populate({
                path: 'classSessionId',
                select: 'date sessionName startTime endTime durationMinutes'
            })
            .sort({ createdAt: -1 });

        const mapped = history.map(h => {
            const sess = h.classSessionId;

            // Calculate duration from timestamps — more reliable than the stored field,
            // since durationMinutes is only set when endSession is explicitly called.
            let durationMinutes = null;
            if (sess) {
                if (sess.startTime && sess.endTime) {
                    // Compute from actual timestamps
                    durationMinutes = Math.round(
                        (new Date(sess.endTime) - new Date(sess.startTime)) / 60000
                    );
                } else if (sess.durationMinutes != null) {
                    // Fallback to stored value if timestamps are missing
                    durationMinutes = sess.durationMinutes;
                }
            }

            return {
                _id: h._id,
                status: h.status,
                engagementScore: h.engagementScore,
                source: h.source,
                date: sess ? sess.date : h.createdAt,
                sessionName: (sess && sess.sessionName) ? sess.sessionName : null,
                durationMinutes   // null = no data, 0 = < 1 min, N = N minutes
            };
        });

        res.json(mapped);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Get student's daily attendance rollup (calculated live from session data)
// @route   GET /api/student/attendance/daily?month=YYYY-MM&year=YYYY
// @access  Private/Student
exports.getMyDailyAttendance = async (req, res) => {
    try {
        const student = await Student.findOne({ userId: req.user._id });
        if (!student) return res.status(404).json({ message: 'Student profile not found' });

        // 1. Get all attendance records for this student and populate session info
        const attendanceRecords = await Attendance.find({ studentId: student._id })
            .populate({
                path: 'classSessionId',
                match: { status: 'completed' },
                select: 'date classroomId status',
                populate: { path: 'classroomId', select: 'name' }
            });

        // 2. Aggregate by date
        const dailyMap = {};

        attendanceRecords.forEach(record => {
            if (!record.classSessionId) return;

            const dateStr = localDateString(record.classSessionId.date);

            // Filter by month/year if requested
            if (req.query.month && !dateStr.startsWith(req.query.month)) return;
            if (req.query.year && !dateStr.startsWith(req.query.year)) return;

            if (!dailyMap[dateStr]) {
                dailyMap[dateStr] = {
                    date: dateStr,
                    classroomId: record.classSessionId.classroomId,
                    totalSessions: 0,
                    attendedSessions: 0
                };
            }

            dailyMap[dateStr].totalSessions += 1;
            if (record.status === 'present' || record.status === 'od') {
                dailyMap[dateStr].attendedSessions += 1;
            }
        });

        // 3. Convert map to array and calculate percentages
        const result = Object.values(dailyMap).map(day => ({
            ...day,
            percentage: day.totalSessions > 0 ? Math.round((day.attendedSessions / day.totalSessions) * 100) : 0
        }));

        // 4. Sort by date descending
        result.sort((a, b) => new Date(b.date) - new Date(a.date));

        res.json(result);
    } catch (error) {
        console.error('[getMyDailyAttendance]', error);
        res.status(500).json({ message: error.message });
    }
};

// @desc    Get student's own OD requests
// @route   GET /api/student/od-requests
// @access  Private/Student
exports.getMyODRequests = async (req, res) => {
    try {
        const student = await Student.findOne({ userId: req.user._id });
        if (!student) return res.status(404).json({ message: 'Student profile not found' });

        const requests = await ODRequest.find({ studentId: student._id })
            .populate({
                path: 'requestedFacultyId',
                select: 'userId',
                populate: { path: 'userId', select: 'name' }
            })
            .sort({ createdAt: -1 });

        // Map for cleaner response
        const mapped = requests.map(r => ({
            _id: r._id,
            requestDate: r.requestDate,
            facultyName: (r.requestedFacultyId && r.requestedFacultyId.userId) ? r.requestedFacultyId.userId.name : 'Unknown',
            reason: r.reason,
            status: r.status,
            createdAt: r.createdAt
        }));

        res.json(mapped);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};
