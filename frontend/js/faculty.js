/* ── faculty.js ── */

const API_URL = 'http://localhost:5000/api';
let token = '';
let currentSessionId = null;
let pollInterval = null;
let timerInterval = null;
let sessionStartTime = null;
let historyView = 'daily';

window.onload = async () => {
    const userStr = localStorage.getItem('user');
    if (!userStr) { window.location.href = 'index.html'; return; }
    const user = JSON.parse(userStr);
    if (user.role !== 'faculty') { window.location.href = 'index.html'; return; }

    token = user.token;
    document.getElementById('userNameDisplay').innerText = `Prof. ${user.name}`;
    document.getElementById('userInitials').innerText = user.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();

    await loadClassrooms();
    loadODRequests();
};

function switchTab(tabName, el) {
    document.querySelectorAll('.tab-content').forEach(t => t.classList.add('hidden'));
    document.querySelectorAll('.sidebar-item').forEach(i => i.classList.remove('active'));

    document.getElementById(`tab-${tabName}`).classList.remove('hidden');
    if (el) el.classList.add('active');

    const titles = {
        'session': 'Live Classroom Monitoring',
        'od': 'On-Duty Management',
        'history': 'Attendance Records & History'
    };
    document.getElementById('pageTitle').innerText = titles[tabName];

    if (tabName === 'od') loadODRequests();
}

function logout() {
    if (pollInterval) clearInterval(pollInterval);
    if (timerInterval) clearInterval(timerInterval);
    localStorage.clear();
    window.location.href = 'index.html';
}

async function fetchAPI(endpoint, options = {}) {
    const res = await fetch(`${API_URL}/${endpoint}`, {
        ...options,
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json', ...options.headers }
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
}

async function loadClassrooms() {
    try {
        const data = await fetchAPI('faculty/classrooms');
        const select = document.getElementById('classroomSelect');
        const historySelect = document.getElementById('historyClassroomSelect');

        if (data.length) {
            const options = data.map(c => `<option value="${c._id}">${c.name} (${c.department})</option>`).join('');
            select.innerHTML = options;
            historySelect.innerHTML = `<option value="">Select a classroom...</option>` + options;
        } else {
            select.innerHTML = '<option value="">No rooms assigned</option>';
            historySelect.innerHTML = '<option value="">No rooms assigned</option>';
        }
    } catch (e) { console.error('Failed to load classrooms:', e); }
}

function startSessionTimer() {
    sessionStartTime = Date.now();
    const display = document.getElementById('sessionTimerDisplay');
    display.style.display = 'inline-block';
    if (timerInterval) clearInterval(timerInterval);
    timerInterval = setInterval(() => {
        const elapsed = Math.floor((Date.now() - sessionStartTime) / 1000);
        const h = String(Math.floor(elapsed / 3600)).padStart(2, '0');
        const m = String(Math.floor((elapsed % 3600) / 60)).padStart(2, '0');
        const s = String(elapsed % 60).padStart(2, '0');
        display.innerText = `${h}:${m}:${s}`;
    }, 1000);
}

function stopSessionTimer() {
    if (timerInterval) clearInterval(timerInterval);
    timerInterval = null;
    document.getElementById('sessionTimerDisplay').style.display = 'none';
}

async function startSession() {
    const select = document.getElementById('classroomSelect');
    const sessionName = document.getElementById('sessionNameInput').value.trim();

    if (!select.value) return alert('Select a classroom');
    if (!sessionName) return alert('Session Name is required');

    const startBtn = document.getElementById('startBtn');
    startBtn.disabled = true;
    startBtn.innerText = 'Starting...';

    try {
        const session = await fetchAPI('faculty/sessions', {
            method: 'POST', body: JSON.stringify({ classroomId: select.value, sessionName })
        });

        if (session._id) {
            currentSessionId = session._id;

            try {
                const aiRes = await fetch('http://localhost:5001/start-mocking', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ classSessionId: session._id, classroomId: select.value })
                });
                const aiData = await aiRes.json();
                console.log(`[AI] Tracking ${aiData.tracked} students across ${aiData.cameras ? aiData.cameras.length : 1} cameras`);

                const videoGrid = document.getElementById('videoGrid');
                const placeholder = document.getElementById('videoPlaceholder');
                placeholder.style.display = 'none';

                // Dynamically create a labeled feed wrapper for each camera
                if (aiData.cameras && aiData.cameras.length > 0) {
                    console.log(`[AI] Tracking ${aiData.tracked} students across ${aiData.cameras.length} cameras`);
                    aiData.cameras.forEach(cam => {
                        // Support both old (string) and new ({id, name}) formats
                        const camId = (typeof cam === 'object') ? cam.id : cam;
                        const camName = (typeof cam === 'object') ? cam.name : camId;

                        const wrapper = document.createElement('div');
                        wrapper.style.cssText = 'display: flex; flex-direction: column; gap: 6px;';

                        const label = document.createElement('div');
                        label.style.cssText = 'color: #22c55e; font-size: 0.75rem; font-family: monospace; font-weight: 600; letter-spacing: 0.05em; padding-left: 4px;';
                        label.textContent = `📷 ${camName}`;

                        const img = document.createElement('img');
                        img.className = 'ai-video-feed';
                        img.src = `http://localhost:5001/video_feed?cameraId=${camId}&t=${Date.now()}`;
                        img.style.cssText = 'width: 100%; height: auto; border-radius: 8px; border: 2px solid #22c55e;';

                        wrapper.appendChild(label);
                        wrapper.appendChild(img);
                        videoGrid.appendChild(wrapper);
                    });
                } else {
                    // Fallback if no specific cameras returned
                    const img = document.createElement('img');
                    img.src = `http://localhost:5001/video_feed?t=${Date.now()}`;
                    img.style.cssText = 'width: 100%; height: auto; border-radius: 8px;';
                    videoGrid.appendChild(img);
                }
            } catch (aiErr) {
                console.warn('Python AI layer disconnected:', aiErr);
                document.getElementById('videoPlaceholder').innerText = 'AI Layer Offline — Attendance will not be auto-tracked.';
            }

            startBtn.style.display = 'none';
            startBtn.disabled = false;
            startBtn.innerText = 'Start Active Session';
            document.getElementById('endBtn').style.display = 'inline-flex';
            document.getElementById('classroomSelect').disabled = true;
            document.getElementById('sessionNameInput').disabled = true;

            const statusSpan = document.getElementById('sessionStatus');
            statusSpan.innerText = `"${sessionName}" — Live`;
            statusSpan.style.background = 'var(--success-bg)';
            statusSpan.style.color = 'var(--success)';

            document.getElementById('liveDashboard').style.display = 'block';
            startSessionTimer();
            pollInterval = setInterval(pollAttendance, 3000);
        }
    } catch (e) {
        startBtn.disabled = false;
        startBtn.innerText = 'Start Active Session';
        alert('Error starting session: ' + e.message);
    }
}

async function endSession() {
    if (!currentSessionId) return;
    const endBtn = document.getElementById('endBtn');
    endBtn.disabled = true;
    endBtn.innerText = 'Processing...';

    try {
        await fetchAPI(`faculty/sessions/${currentSessionId}/end`, { method: 'PUT' });

        try { await fetch('http://localhost:5001/stop-mocking', { method: 'POST' }); } catch (e) { }

        const videoGrid = document.getElementById('videoGrid');
        // Remove all feed wrappers (camera label + img)
        while (videoGrid.firstChild && videoGrid.firstChild.id !== 'videoPlaceholder') {
            videoGrid.removeChild(videoGrid.firstChild);
        }
        const placeholder = document.getElementById('videoPlaceholder');
        placeholder.innerText = 'Awaiting AI Feed Initialization...';
        placeholder.style.display = 'block';

        clearInterval(pollInterval);
        stopSessionTimer();
        currentSessionId = null;

        endBtn.disabled = false;
        endBtn.innerText = 'End Session';
        document.getElementById('startBtn').style.display = 'inline-flex';
        document.getElementById('endBtn').style.display = 'none';
        document.getElementById('classroomSelect').disabled = false;
        document.getElementById('sessionNameInput').disabled = false;
        document.getElementById('sessionNameInput').value = '';

        const statusSpan = document.getElementById('sessionStatus');
        statusSpan.innerText = 'Session Ended — Attendance Saved';
        statusSpan.style.background = '#f0fdf4';
        statusSpan.style.color = 'var(--success)';

        setTimeout(() => {
            statusSpan.innerText = 'No active session';
            statusSpan.style.background = 'var(--bg-main)';
            statusSpan.style.color = 'var(--text-muted)';
        }, 5000);

    } catch (e) {
        endBtn.disabled = false;
        endBtn.innerText = 'End Session';
        alert('Error ending session: ' + e.message);
    }
}

async function pollAttendance() {
    if (!currentSessionId) return;
    try {
        const data = await fetchAPI(`faculty/sessions/${currentSessionId}/attendance`);

        let present = 0, absent = 0, totalScore = 0;
        let rows = '';

        data.forEach(a => {
            if (a.status === 'present') present++; else absent++;
            totalScore += a.engagementScore;

            const statusBadge = a.status === 'present' ? 'badge-success' : (a.status === 'od' ? 'badge-warning' : 'badge-danger');
            const scoreColor = a.engagementScore > 60 ? 'var(--success)' : (a.engagementScore > 30 ? 'var(--warning)' : 'var(--danger)');

            let flags = '-';
            if (a.status === 'present' && a.behaviors && a.behaviors.length > 0) {
                flags = a.behaviors.slice(-5).map(b => `<span class="badge" style="background:var(--danger-bg); color:var(--danger); font-size: 0.65rem; margin-right: 4px;">${b.signalType}</span>`).join('');
            } else if (a.status === 'absent') {
                flags = '<span class="badge badge-neutral">Not Detected</span>';
            } else if (a.status === 'od') {
                flags = '<span class="badge badge-warning">OD Approved</span>';
            }

            const regNo = a.studentId ? a.studentId.registerNumber : 'N/A';
            const name = (a.studentId && a.studentId.userId && a.studentId.userId.name) ? a.studentId.userId.name : 'Unknown';

            rows += `<tr>
                <td style="font-family: monospace; color: var(--text-muted)">${regNo}</td>
                <td style="font-weight: 500;">${name}</td>
                <td><span class="badge ${statusBadge}">${a.status}</span></td>
                <td>${flags}</td>
                <td style="color:${scoreColor}; font-weight:600;">${a.status === 'od' ? '100% (Protected)' : a.engagementScore + '%'}</td>
            </tr>`;
        });

        document.querySelector('#attendanceTable tbody').innerHTML = rows || '<tr><td colspan="5" style="text-align:center; color:var(--text-muted); padding:1rem;">No attendance data yet...</td></tr>';
        document.getElementById('presentCount').innerText = present;
        document.getElementById('absentCount').innerText = absent;

        if (present > 0) {
            const avg = Math.round(totalScore / present);
            document.getElementById('avgEngagement').innerText = avg + '%';
            const bar = document.getElementById('engBar');
            bar.style.width = avg + '%';
            bar.style.background = avg > 60 ? 'var(--success)' : (avg > 30 ? 'var(--warning)' : 'var(--danger)');
        }
    } catch (e) { console.warn('Poll error:', e); }
}

async function loadODRequests() {
    try {
        const data = await fetchAPI('faculty/od-requests');
        const badge = document.getElementById('odBadge');

        if (data.length > 0) {
            badge.style.display = 'inline-block';
            badge.innerText = data.length;
        } else {
            badge.style.display = 'none';
        }

        if (data.length === 0) {
            document.querySelector('#odTable tbody').innerHTML = `<tr><td colspan="4" style="text-align:center; padding: 2rem; color: var(--text-light);">No pending requests</td></tr>`;
            return;
        }

        document.querySelector('#odTable tbody').innerHTML = data.map(r => {
            const studentName = (r.studentId && r.studentId.userId) ? r.studentId.userId.name : 'Unknown';
            const regNo = r.studentId ? r.studentId.registerNumber : 'N/A';
            const dateStr = new Date(r.requestDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

            return `<tr>
                <td>
                    <div style="font-weight: 500;">${studentName}</div>
                    <div style="font-size: 0.75rem; color: var(--text-muted); font-family: monospace;">${regNo}</div>
                </td>
                <td style="font-weight: 600; color: var(--primary-color);">${dateStr}</td>
                <td style="max-width: 300px; white-space: normal;">${r.reason}</td>
                <td style="display:flex; gap:0.5rem; justify-content: flex-start;">
                    <button class="btn btn-primary" style="padding:0.4rem 0.75rem;" onclick="updateOD('${r._id}', 'approved')">Approve</button>
                    <button class="btn btn-secondary" style="padding:0.4rem 0.75rem;" onclick="updateOD('${r._id}', 'rejected')">Reject</button>
                </td>
            </tr>`;
        }).join('');

    } catch (e) { console.error('OD load error:', e); }
}

async function updateOD(id, status) {
    try {
        await fetchAPI(`faculty/od-requests/${id}`, { method: 'PUT', body: JSON.stringify({ status }) });
        loadODRequests();
    } catch (e) { alert('Failed to update OD status'); }
}

function switchHistoryView(view) {
    historyView = view;
    document.getElementById('btnDailyView').classList.toggle('active', view === 'daily');
    document.getElementById('btnSessionView').classList.toggle('active', view === 'session');
    document.getElementById('historyDailyView').style.display = view === 'daily' ? 'block' : 'none';
    document.getElementById('historySessionView').style.display = view === 'session' ? 'block' : 'none';
    const classroomId = document.getElementById('historyClassroomSelect').value;
    if (classroomId) loadHistoryForClassroom();
}

async function loadHistoryForClassroom() {
    const classroomId = document.getElementById('historyClassroomSelect').value;
    if (!classroomId) return;
    if (historyView === 'daily') await loadDailyHistory(classroomId);
    else await loadSessionHistory(classroomId);
}

async function loadDailyHistory(classroomId) {
    try {
        const data = await fetchAPI(`faculty/attendance/${classroomId}`);
        if (data.length === 0) {
            document.querySelector('#historyTable tbody').innerHTML = `<tr><td colspan="5" style="text-align:center; padding: 2rem; color: var(--text-light);">No daily history records found for this room.</td></tr>`;
            return;
        }

        document.querySelector('#historyTable tbody').innerHTML = data.map(r => {
            const scoreColor = r.percentage >= 75 ? 'var(--success)' : (r.percentage >= 50 ? 'var(--warning)' : 'var(--danger)');
            const scoreBg = r.percentage >= 75 ? '#f0fdf4' : (r.percentage >= 50 ? '#fffbeb' : '#fef2f2');
            const studentName = (r.studentId && r.studentId.userId) ? r.studentId.userId.name : 'Unknown Student';
            const regNo = r.studentId ? r.studentId.registerNumber : 'N/A';

            // Parse YYYY-MM-DD as LOCAL date (avoid UTC midnight shift to prev day in IST)
            const [yr, mo, dy] = (r.date || '').split('-');
            const localDate = new Date(+yr, +mo - 1, +dy);
            const dateStr = isNaN(localDate) ? r.date : localDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

            const sessionBadge = `${r.attendedSessions} / ${r.totalSessions}`;

            return `<tr>
                <td>
                    <span style="display:inline-block; background:#eff6ff; color:var(--primary-color); font-weight:700; font-size:0.8rem; padding:3px 10px; border-radius:20px; letter-spacing:0.02em;">${dateStr}</span>
                </td>
                <td>
                    <div style="font-weight:600; color:var(--text-main);">${studentName}</div>
                </td>
                <td style="font-family:monospace; color:var(--text-muted); font-size:0.85rem;">${regNo}</td>
                <td>
                    <div style="display:flex; align-items:center; gap:8px;">
                        <div style="flex:1; height:6px; background:#e2e8f0; border-radius:9999px; max-width:80px; overflow:hidden;">
                            <div style="height:100%; width:${r.percentage}%; background:${scoreColor}; border-radius:9999px; transition:width 0.4s;"></div>
                        </div>
                        <span style="font-size:0.78rem; color:var(--text-muted); white-space:nowrap;">${sessionBadge} sessions</span>
                    </div>
                </td>
                <td>
                    <span style="display:inline-block; font-weight:700; font-size:0.9rem; padding:4px 12px; border-radius:20px; background:${scoreBg}; color:${scoreColor};">${r.percentage}%</span>
                </td>
            </tr>`;
        }).join('');
    } catch (e) { console.error('Daily history error:', e); }
}

async function loadSessionHistory(classroomId) {
    try {
        const sessions = await fetchAPI(`faculty/sessions?classroomId=${classroomId}`);
        const container = document.getElementById('sessionCardsList');

        if (sessions.length === 0) {
            container.innerHTML = `<div style="text-align:center; padding: 3rem; color: var(--text-muted); background:var(--bg-card); border-radius:var(--radius-lg); border:1px dashed var(--border-color);">No completed sessions found for this classroom.</div>`;
            return;
        }

        // Group sessions by date for visual separation
        const grouped = {};
        sessions.forEach(s => {
            const [yr, mo, dy] = new Date(s.date).toISOString().split('T')[0].split('-');
            const localDate = new Date(+yr, +mo - 1, +dy);
            const key = localDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
            if (!grouped[key]) grouped[key] = [];
            grouped[key].push(s);
        });

        container.innerHTML = Object.entries(grouped).map(([dateLabel, daySessions]) => {
            const cards = daySessions.map(s => {
                const startT = s.startTime ? new Date(s.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--';
                const endT = s.endTime ? new Date(s.endTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--';
                const pct = s.totalStudents > 0 ? Math.round((s.present / s.totalStudents) * 100) : 0;
                const isCompleted = s.status === 'completed';
                const pctColor = isCompleted ? (pct >= 75 ? 'var(--success)' : (pct >= 50 ? 'var(--warning)' : 'var(--danger)')) : 'var(--primary-color)';
                const statusBadge = isCompleted ? '' : '<span style="background:var(--warning); color:#fff; font-size:0.7rem; padding:2px 6px; border-radius:12px; font-weight:700; margin-left:8px;">ACTIVE</span>';
                
                return `<div class="session-card" onclick="openSessionDetail('${s._id}', '${(s.sessionName || '').replace(/'/g, "\\'")}'  , '${dateLabel} &nbsp;${startT}–${endT}')" style="border-left: 3px solid ${pctColor}; ${!isCompleted ? 'opacity: 0.8;' : ''}">
                    <div class="session-card-header">
                        <div>
                            <div class="session-card-name" style="display:flex; align-items:center;">${s.sessionName || 'Unnamed Session'} ${statusBadge}</div>
                            <div class="session-card-meta" style="margin-top:4px; display:flex; gap:12px; flex-wrap:wrap; align-items:center;">
                                <span>🕐 ${startT} – ${endT}</span>
                                <span style="background:#f1f5f9; padding:2px 8px; border-radius:20px; font-size:0.72rem;">⏱ ${dur}</span>
                            </div>
                        </div>
                        <span style="font-size:1.5rem; font-weight:800; color:${pctColor}; background:${pctBg}; padding:4px 14px; border-radius:20px;">${pct}%</span>
                    </div>
                    <div style="display:flex; gap:2rem; margin-top:12px; padding-top:12px; border-top:1px solid var(--border-color);">
                        <div style="display:flex; align-items:center; gap:6px;">
                            <span style="width:10px;height:10px;border-radius:50%;background:var(--success);display:inline-block"></span>
                            <span style="font-weight:600; color:var(--text-main);">${s.present}</span>
                            <span style="color:var(--text-muted); font-size:0.8rem;">Present</span>
                        </div>
                        <div style="display:flex; align-items:center; gap:6px;">
                            <span style="width:10px;height:10px;border-radius:50%;background:var(--danger);display:inline-block"></span>
                            <span style="font-weight:600; color:var(--text-main);">${s.absent}</span>
                            <span style="color:var(--text-muted); font-size:0.8rem;">Absent</span>
                        </div>
                        <div style="margin-left:auto; font-size:0.8rem; color:var(--text-muted); align-self:center;">Click to view details →</div>
                    </div>
                </div>`;
            }).join('');

            return `<div style="margin-bottom:2rem;">
                <div style="display:flex; align-items:center; gap:0.75rem; margin-bottom:0.75rem;">
                    <span style="font-weight:700; font-size:0.85rem; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.05em;">${dateLabel}</span>
                    <div style="flex:1; height:1px; background:var(--border-color);"></div>
                    <span style="font-size:0.75rem; color:var(--text-muted);">${daySessions.length} session${daySessions.length !== 1 ? 's' : ''}</span>
                </div>
                ${cards}
            </div>`;
        }).join('');
    } catch (e) { console.error('Session history error:', e); }
}

async function openSessionDetail(sessionId, name, meta) {
    document.getElementById('modalSessionName').innerText = name;
    document.getElementById('modalSessionMeta').innerText = meta;
    document.getElementById('sessionModal').style.display = 'flex';
    document.querySelector('#modalAttendanceTable tbody').innerHTML = '<tr><td colspan="4" style="text-align:center; padding:1rem;">Loading...</td></tr>';

    const btnDelete = document.getElementById('btnDeleteSession');
    btnDelete.onclick = () => deleteSession(sessionId, name);

    try {
        const data = await fetchAPI(`faculty/sessions/${sessionId}/attendance`);
        if (data.length === 0) {
            document.querySelector('#modalAttendanceTable tbody').innerHTML = '<tr><td colspan="4" style="text-align:center; padding:1rem; color:var(--danger);">Failed to load attendance details</td></tr>';
            return;
        }
        document.querySelector('#modalAttendanceTable tbody').innerHTML = data.map(a => {
            const statusBadge = a.status === 'present' ? 'badge-success' : (a.status === 'od' ? 'badge-warning' : 'badge-danger');
            const scoreColor = a.engagementScore > 50 ? 'var(--success)' : 'var(--danger)';
            const name = (a.studentId && a.studentId.userId) ? a.studentId.userId.name : 'Unknown';
            const regNo = a.studentId ? a.studentId.registerNumber : 'N/A';
            return `<tr>
                <td style="font-weight:500;">${name}</td>
                <td style="font-family:monospace; color:var(--text-muted);">${regNo}</td>
                <td><span class="badge ${statusBadge}">${a.status}</span></td>
                <td style="font-weight:600; color:${scoreColor};">${a.status === 'od' ? '100% (OD)' : a.engagementScore + '%'}</td>
            </tr>`;
        }).join('');
    } catch (e) {
        document.querySelector('#modalAttendanceTable tbody').innerHTML = `<tr><td colspan="4" style="color:var(--danger); padding:1rem;">Failed to load: ${e.message}</td></tr>`;
    }
}

function closeModal(e) {
    if (e.target.id === 'sessionModal') {
        document.getElementById('sessionModal').style.display = 'none';
    }
}

async function deleteSession(sessionId, sessionName) {
    if (!confirm(`Are you sure you want to completely delete the session "${sessionName}"?\nThis action cannot be undone and will remove all attendance records for it.`)) {
        return;
    }

    const btnDelete = document.getElementById('btnDeleteSession');
    const originalHtml = btnDelete.innerHTML;
    btnDelete.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="spin"><circle cx="12" cy="12" r="10"></circle><path d="M12 2a10 10 0 0 1 10 10"></path></svg> Deleting...`;
    btnDelete.disabled = true;

    try {
        await fetchAPI(`faculty/sessions/${sessionId}`, { method: 'DELETE' });
        document.getElementById('sessionModal').style.display = 'none';

        // Refresh the appropriate view
        const classroomId = document.getElementById('historyClassroomSelect').value;
        if (classroomId) {
            if (historyView === 'daily') await loadDailyHistory(classroomId);
            else await loadSessionHistory(classroomId);
        }
    } catch (e) {
        console.error('Failed to delete session:', e);
        alert('Failed to delete session. Please try again.');
    } finally {
        btnDelete.innerHTML = originalHtml;
        btnDelete.disabled = false;
    }
}

