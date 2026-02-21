# SMART CLASSROOM AI ATTENDANCE & ENGAGEMENT SYSTEM
## Complete Technical Project Documentation

---
# 1. PROJECT OVERVIEW

## 1.1 Vision
The Smart Classroom AI Attendance & Engagement System is a three-layer architecture designed to automate attendance tracking and monitor student engagement using AI-powered camera observation.

The system ensures:
- Automatic attendance marking
- Multi-camera classroom support
- Real-time faculty monitoring
- Student self-analytics
- OD (On Duty) override mechanism
- Strict separation between AI observation and backend authority

---
# 2. THREE-LAYER ARCHITECTURE

The system follows a strict separation of concerns model.

Frontend Layer (User Interface)
↓
Backend Authority Layer (Decision Engine)
↓
AI Observation Layer (Python)
↓
Physical Cameras

Each layer has clearly defined responsibilities.

---
# 3. AI OBSERVATION LAYER (PYTHON)

## 3.1 Purpose
The AI layer is a non-authoritative observer. It does not take decisions.

It only:
1. Fetches reference metadata at startup
2. Observes camera feeds
3. Emits raw detection events

## 3.2 What AI Does
- Face detection
- Face recognition
- Behavior signal detection
    - Eyes closed
    - Yawning
    - Looking away

## 3.3 What AI Never Does
- Does not mark attendance
- Does not calculate engagement score
- Does not suppress duplicates
- Does not validate classroom logic
- Does not apply thresholds

All logic is handled by backend.

## 3.4 Multi-Camera Principle
If a student appears in two cameras:
- AI emits two independent events
- Backend resolves aggregation

---
# 4. BACKEND AUTHORITY LAYER (NODE.JS + MONGODB)

## 4.1 Purpose
The backend is the brain of the system.

It handles:
- User management
- Classroom management
- Camera mapping
- Attendance resolution
- Engagement scoring
- OD logic
- Conflict resolution

---
# 5. ROLE DEFINITIONS

## 5.1 Admin Role
Admin is the system controller.

Admin can:
- Create classrooms
- Create students
- Create faculties
- Create cameras
- Assign cameras to classrooms
- Assign faculties to classrooms

Admin does not manage attendance manually.

---
## 5.2 Faculty Role
Faculty manages classroom sessions.

Faculty can:
- Login
- Select assigned classroom
- Start class session
- View live attendance
- View activity indicators
- Accept or reject OD requests
- View live camera streams

When a classroom is selected:
- Only that classroom data is shown

---
## 5.3 Student Role
Student can:
- Login
- View attendance percentage
- View daily/monthly attendance
- View behavior flags for attended days
- Submit OD request

If student is absent:
- No behavior data shown

---
# 6. DATABASE DESIGN (MONGODB COLLECTIONS)

## 6.1 users
Stores authentication data for all roles.

Fields:
- _id
- name
- role (admin | faculty | student)
- email (faculty/admin)
- registerNumber (student)
- password (hashed)
- status

---
## 6.2 classrooms
Represents physical classrooms.

Fields:
- _id
- name (CSCA, CSCP, etc.)
- department
- year
- status

---
## 6.3 cameras
Each camera belongs to one classroom.

Fields:
- _id
- name
- streamUrl
- classroomId
- status

One classroom → many cameras

---
## 6.4 students
Academic details.

Fields:
- _id
- userId
- registerNumber
- department
- year
- classroomId
- faceEncoding
- status

---
## 6.5 faculties
Faculty academic mapping.

Fields:
- _id
- userId
- department
- assignedClassrooms [array]
- status

---
## 6.6 class_sessions
Represents one running class.

Fields:
- _id
- classroomId
- facultyId
- date
- startTime
- endTime
- status (active/completed)

---
## 6.7 ai_events
Raw AI detections.

Fields:
- _id
- studentId
- cameraId
- classSessionId
- timestamp
- signals:
    - eyesClosed
    - yawning
    - lookingAway

No logic applied here.

---
## 6.8 attendance
Final authoritative record.

Fields:
- _id
- studentId
- classSessionId
- status (present | absent | od)
- engagementScore
- behaviors []
- source (ai | od)

---
## 6.9 od_requests
OD management.

Fields:
- _id
- studentId
- classSessionId
- requestedFacultyId
- reason
- status (pending | approved | rejected)

---
# 7. ATTENDANCE DECISION LOGIC

For each student per class session:

IF OD approved:
    status = "od"
ELSE IF at least one AI event exists:
    status = "present"
ELSE:
    status = "absent"

OD overrides everything.

---
# 8. ENGAGEMENT SCORE LOGIC (BACKEND ONLY)

Backend aggregates all signals per student during session.

Example scoring model:

Start score = 100

For each signal:
- eyesClosed → -10
- yawning → -5
- lookingAway → -3

Score ranges:
0-30 → Poor
31-60 → Average
61-100 → Good

---
# 9. SYSTEM FLOW

## 9.1 Setup Phase
Admin:
- Creates classrooms
- Adds students
- Adds faculties
- Adds cameras
- Maps cameras to classrooms
- Assigns faculties to classrooms

---
## 9.2 Class Execution Phase

1. Faculty logs in
2. Selects classroom
3. Starts class session
4. Backend marks session as active
5. AI observes cameras
6. AI emits raw events
7. Backend stores ai_events
8. Backend aggregates attendance
9. Faculty dashboard updates live

---
## 9.3 Student Interaction Phase

Student logs in:
- Views attendance percentage
- Filters by date/month
- Sees activity flags for attended days
- Submits OD request if needed

---
# 10. MULTI-CAMERA SYNCHRONIZATION MODEL

If student appears in:
- CAM001
- CAM002

AI emits both events.

Backend:
- Counts student as present once
- Aggregates behavior signals from both feeds
- Prevents duplication

No overriding occurs.

---
# 11. OD PRIORITY SYSTEM

Priority order:
1. OD
2. Present
3. Absent

If OD is approved:
- Attendance = od
- Behavior ignored
- AI signals irrelevant

---
# 12. FRONTEND PANELS

## Admin Panel
- Manage classrooms
- Manage cameras
- Manage students
- Manage faculties

## Faculty Panel
- Classroom selector
- Student attendance table
- Activity indicators
- Live camera streams
- OD approval panel

## Student Panel
- Attendance summary
- Monthly statistics
- Daily breakdown
- Activity flags
- OD request submission

---
# 13. SECURITY DESIGN

- Password hashing
- Role-based access control
- API authentication (JWT recommended)
- AI endpoint restricted to internal access

---
# 14. SCALABILITY DESIGN

- AI layer can scale horizontally per classroom
- Multiple camera workers run in parallel
- Backend event aggregation optimized by indexing studentId + classSessionId
- MongoDB indexing required for:
    - studentId
    - classSessionId
    - timestamp

---
# 15. DEPLOYMENT STRUCTURE

AI Layer → Python server (separate service)
Backend → Node.js server
Database → MongoDB Atlas
Frontend → Static HTML/CSS/JS or hosted web app

---
# 16. PROJECT STRENGTH SUMMARY

This system demonstrates:
- Clean separation of concerns
- Multi-camera event architecture
- Conflict-resilient design
- Real-time analytics
- OD override logic
- Production-style scalability

This is not a basic college project.
This is a system architecture demonstration.

---
# END OF COMPLETE DOCUMENTATION

