const ClassSession = require('../models/ClassSession');
const Faculty = require('../models/Faculty');
const Attendance = require('../models/Attendance');
const DailyAttendance = require('../models/DailyAttendance');
const ODRequest = require('../models/ODRequest');

/**
 * Returns a 'YYYY-MM-DD' string in the SERVER's local timezone.
 * Using toISOString() would give UTC date which is wrong for IST (UTC+5:30)
 * since late-night local dates fall on the previous UTC day.
 */
function localDateString(date) {
    const d = date || new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

// @desc    Start a new class session
// @route   POST /api/faculty/sessions
// @access  Private/Faculty
exports.startSession = async (req, res) => {
    try {
        const { classroomId, sessionName } = req.body;

        if (!sessionName) {
            return res.status(400).json({ message: 'Session name is required' });
        }

        const faculty = await Faculty.findOne({ userId: req.user._id });
        if (!faculty) {
            return res.status(404).json({ message: 'Faculty profile not found' });
        }

        if (!faculty.assignedClassrooms.includes(classroomId)) {
            return res.status(403).json({ message: 'You are not assigned to this classroom' });
        }

        const session = await ClassSession.create({
            classroomId,
            facultyId: faculty._id,
            sessionName,
            date: new Date(),
            startTime: new Date()
        });

        res.status(201).json(session);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

// @desc    Get assigned classrooms
// @route   GET /api/faculty/classrooms
// @access  Private/Faculty
exports.getAssignedClassrooms = async (req, res) => {
    try {
        const faculty = await Faculty.findOne({ userId: req.user._id }).populate('assignedClassrooms');
        if (!faculty) return res.status(404).json({ message: 'Faculty profile not found' });
        res.json(faculty.assignedClassrooms);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    End a class session + calculate daily attendance rollup
// @route   PUT /api/faculty/sessions/:id/end
// @access  Private/Faculty
exports.endSession = async (req, res) => {
    try {
        const session = await ClassSession.findById(req.params.id);
        if (!session) {
            return res.status(404).json({ message: 'Session not found' });
        }

        session.endTime = new Date();
        session.status = 'completed';

        const diffMs = session.endTime - session.startTime;
        session.durationMinutes = Math.round(diffMs / 60000);

        await session.save();

        // --- Phase 6: Daily Attendance Rollup Logic ---
        // Use the date from session.date (not endTime), trimmed to YYYY-MM-DD in UTC
        const dateString = localDateString(session.date);

        // Get all attendance records for THIS session
        const attendanceRecords = await Attendance.find({ classSessionId: session._id });

        // For each student's attendance record in this session:
        // 1. Apply engagement threshold: present + engagement <= 50 => downgrade to absent
        // 2. Upsert DailyAttendance by recounting ALL sessions that day for that student
        for (const record of attendanceRecords) {
            // Apply engagement threshold check (only for AI-tracked present students)
            if (record.status === 'present' && record.source === 'ai' && record.engagementScore <= 50) {
                record.status = 'absent';
                await record.save();
            }

            // Recalculate daily attendance for this student + classroom + date
            // by querying ALL sessions that occurred on this date for this classroom
            const sessionsForDay = await ClassSession.find({
                classroomId: session.classroomId,
                status: 'completed',
                date: {
                    // Use local midnight boundaries to match the localDateString() date key
                    $gte: new Date(dateString + 'T00:00:00.000+05:30'),
                    $lt: new Date(dateString + 'T23:59:59.999+05:30')
                }
            }).select('_id');

            const sessionIds = sessionsForDay.map(s => s._id);

            // Count how many sessions this student attended today
            const studentAttendance = await Attendance.find({
                studentId: record.studentId,
                classSessionId: { $in: sessionIds }
            });

            const totalSessions = sessionIds.length;
            const attendedSessions = studentAttendance.filter(
                a => a.status === 'present' || a.status === 'od'
            ).length;
            const percentage = totalSessions === 0 ? 0 : Math.round((attendedSessions / totalSessions) * 100);

            // Upsert using unique index: studentId + classroomId + date
            await DailyAttendance.findOneAndUpdate(
                {
                    studentId: record.studentId,
                    classroomId: session.classroomId,
                    date: dateString
                },
                {
                    $set: {
                        totalSessions,
                        attendedSessions,
                        percentage
                    }
                },
                { upsert: true, new: true }
            );
        }

        res.json(session);
    } catch (error) {
        console.error('[endSession Error]', error);
        res.status(400).json({ message: error.message });
    }
};

// @desc    Get live attendance for a session (works for active AND completed)
// @route   GET /api/faculty/sessions/:id/attendance
// @access  Private/Faculty
exports.getLiveAttendance = async (req, res) => {
    try {
        const attendance = await Attendance.find({ classSessionId: req.params.id })
            .populate({
                path: 'studentId',
                select: 'registerNumber userId',
                populate: {
                    path: 'userId',
                    select: 'name'
                }
            });
        res.json(attendance);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Get list of sessions for a classroom (for History tab)
// @route   GET /api/faculty/sessions?classroomId=X
// @access  Private/Faculty
exports.getSessionsList = async (req, res) => {
    try {
        const { classroomId } = req.query;
        if (!classroomId) return res.status(400).json({ message: 'classroomId is required' });

        // Fetch both active and completed sessions so faculty can manage abandoned ones
        const sessions = await ClassSession.find({ classroomId })
            .sort({ date: -1 })
            .limit(50);

        // Attach attendance summary to each session
        const result = await Promise.all(sessions.map(async (s) => {
            const records = await Attendance.find({ classSessionId: s._id });
            const present = records.filter(r => r.status === 'present' || r.status === 'od').length;
            const absent = records.filter(r => r.status === 'absent').length;
            return {
                _id: s._id,
                sessionName: s.sessionName,
                date: s.date,
                startTime: s.startTime,
                endTime: s.endTime,
                durationMinutes: s.durationMinutes,
                status: s.status, // Add status to differentiate active vs completed
                present,
                absent,
                totalStudents: present + absent
            };
        }));

        res.json(result);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Get pending OD requests for faculty
// @route   GET /api/faculty/od-requests
// @access  Private/Faculty
exports.getPendingODRequests = async (req, res) => {
    try {
        const faculty = await Faculty.findOne({ userId: req.user._id });
        if (!faculty) return res.status(404).json({ message: 'Faculty profile not found' });

        const requests = await ODRequest.find({ requestedFacultyId: faculty._id, status: 'pending' })
            .populate({
                path: 'studentId',
                select: 'registerNumber userId',
                populate: { path: 'userId', select: 'name' }
            });
        // requestDate is a plain string (YYYY-MM-DD), no populate needed
        res.json(requests);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Approve or reject OD request (day-level: marks ALL sessions on that date as OD)
// @route   PUT /api/faculty/od-requests/:id
// @access  Private/Faculty
exports.respondToODRequest = async (req, res) => {
    try {
        const { status } = req.body;
        if (!['approved', 'rejected'].includes(status)) {
            return res.status(400).json({ message: 'Invalid status' });
        }

        const request = await ODRequest.findById(req.params.id)
            .populate({
                path: 'studentId',
                select: 'classroomId'
            });
        if (!request) return res.status(404).json({ message: 'OD Request not found' });

        request.status = status;
        await request.save();

        if (status === 'approved') {
            // Find the student's classroom so we can scope sessions correctly
            const student = request.studentId; // populated above

            // Find ALL sessions in the student's classroom on the requested date
            const dayStart = new Date(request.requestDate + 'T00:00:00.000Z');
            const dayEnd = new Date(request.requestDate + 'T23:59:59.999Z');

            const sessionsOnDay = await ClassSession.find({
                classroomId: student.classroomId,
                date: { $gte: dayStart, $lte: dayEnd }
            }).select('_id');

            if (sessionsOnDay.length === 0) {
                // No sessions found for this day — still save the OD approval
                // (will take effect when sessions are created retroactively)
                return res.json({ message: 'OD approved. No sessions found on this date yet.', request });
            }

            // Upsert an Attendance record as OD for every session on that day
            const bulkOps = sessionsOnDay.map(sess => ({
                updateOne: {
                    filter: { studentId: student._id, classSessionId: sess._id },
                    update: {
                        $set: {
                            studentId: student._id,
                            classSessionId: sess._id,
                            status: 'od',
                            engagementScore: 100,
                            source: 'od'
                        }
                    },
                    upsert: true
                }
            }));

            await Attendance.bulkWrite(bulkOps);
            console.log(`[OD] Approved for ${request.requestDate}: marked ${sessionsOnDay.length} session(s) as OD.`);
        }

        res.json(request);
    } catch (error) {
        console.error('[respondToODRequest]', error);
        res.status(400).json({ message: error.message });
    }
};

// @desc    Get daily attendance rollup for a classroom (Calculated live from sessions)
// @route   GET /api/faculty/attendance/:classroomId
// @access  Private/Faculty
exports.getAttendanceHistory = async (req, res) => {
    try {
        const { classroomId } = req.params;

        // 1. Find all sessions for this classroom
        const sessions = await ClassSession.find({ classroomId }).select('_id date');
        if (!sessions.length) return res.json([]);

        const sessionIds = sessions.map(s => s._id);

        // 2. Find all attendance records for these sessions
        const attendanceRecords = await Attendance.find({ classSessionId: { $in: sessionIds } })
            .populate({
                path: 'studentId',
                select: 'registerNumber userId',
                populate: { path: 'userId', select: 'name' }
            })
            .populate('classSessionId', 'date');

        // 3. Aggregate data by student + date
        const groupedMap = {}; // key: studentId_date

        attendanceRecords.forEach(record => {
            if (!record.studentId || !record.classSessionId) return;

            const dateStr = localDateString(new Date(record.classSessionId.date));
            const studentId = record.studentId._id.toString();
            const key = `${studentId}_${dateStr}`;

            if (!groupedMap[key]) {
                groupedMap[key] = {
                    date: dateStr,
                    studentId: record.studentId,
                    totalSessions: 0,
                    attendedSessions: 0
                };
            }

            groupedMap[key].totalSessions += 1;
            if (record.status === 'present' || record.status === 'od') {
                groupedMap[key].attendedSessions += 1;
            }
        });

        // 4. Convert map to array and compute percentages
        const result = Object.values(groupedMap).map(day => ({
            ...day,
            percentage: day.totalSessions > 0 ? Math.round((day.attendedSessions / day.totalSessions) * 100) : 0
        }));

        // 5. Sort by date descending, then student name
        result.sort((a, b) => {
            const dateCmp = new Date(b.date) - new Date(a.date);
            if (dateCmp !== 0) return dateCmp;
            const nameA = a.studentId.userId?.name || '';
            const nameB = b.studentId.userId?.name || '';
            return nameA.localeCompare(nameB);
        });

        res.json(result);
    } catch (error) {
        console.error('[getAttendanceHistory Error]', error);
        res.status(500).json({ message: error.message });
    }
};

// @desc    Delete a class session
// @route   DELETE /api/faculty/sessions/:id
// @access  Private/Faculty
exports.deleteSession = async (req, res) => {
    try {
        const session = await ClassSession.findById(req.params.id);
        if (!session) {
            return res.status(404).json({ message: 'Session not found' });
        }

        const dateString = localDateString(session.date);

        // Delete all attendance records for this session
        await Attendance.deleteMany({ classSessionId: session._id });

        // Delete the session itself
        await ClassSession.deleteOne({ _id: session._id });

        // Recalculate DailyAttendance for the affected date and classroom
        // Find all remaining sessions for that day
        const sessionsForDay = await ClassSession.find({
            classroomId: session.classroomId,
            status: 'completed',
            date: {
                $gte: new Date(dateString + 'T00:00:00.000+05:30'),
                $lt: new Date(dateString + 'T23:59:59.999+05:30')
            }
        }).select('_id');

        const sessionIds = sessionsForDay.map(s => s._id);

        if (sessionIds.length === 0) {
            // No sessions left for this day, delete all DailyAttendance records for this classroom and date
            await DailyAttendance.deleteMany({
                classroomId: session.classroomId,
                date: dateString
            });
        } else {
            // Find all students who have a daily attendance record on this day
            const dailyRecords = await DailyAttendance.find({
                classroomId: session.classroomId,
                date: dateString
            });

            for (const daily of dailyRecords) {
                const studentAttendance = await Attendance.find({
                    studentId: daily.studentId,
                    classSessionId: { $in: sessionIds }
                });

                const totalSessions = sessionIds.length;
                const attendedSessions = studentAttendance.filter(
                    a => a.status === 'present' || a.status === 'od'
                ).length;
                const percentage = totalSessions === 0 ? 0 : Math.round((attendedSessions / totalSessions) * 100);

                await DailyAttendance.updateOne(
                    { _id: daily._id },
                    { $set: { totalSessions, attendedSessions, percentage } }
                );
            }
        }

        res.json({ message: 'Session deleted successfully' });
    } catch (error) {
        console.error('[deleteSession Error]', error);
        res.status(500).json({ message: error.message });
    }
};
