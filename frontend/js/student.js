/* ── student.js ── */

const API_URL = 'http://localhost:5000/api';
let token = '';
let chartInstance = null;

window.onload = async () => {
    const userStr = localStorage.getItem('user');
    if (!userStr) { window.location.href = 'index.html'; return; }
    const user = JSON.parse(userStr);
    if (user.role !== 'student') { window.location.href = 'index.html'; return; }

    token = user.token;
    document.getElementById('userNameDisplay').innerText = user.name;
    document.getElementById('userRegNo').innerText = user.registerNumber || '';
    document.getElementById('userInitials').innerText = user.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();

    await loadProfile();
    await loadSummary();
    loadDetails();
    loadHistory();
    loadDailyRollup();
    loadFormDropdowns();
    loadODRequestHistory();
};

/* ---- Profile ---- */
async function loadProfile() {
    try {
        const data = await fetchAPI('student/profile');
        if (data.registerNumber) document.getElementById('userRegNo').innerText = data.registerNumber;
        if (data.imageUrl) {
            const av = document.getElementById('userInitials');
            av.innerHTML = `<img src="${data.imageUrl}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">`;
            av.style.background = 'transparent';
            av.style.border = '2px solid var(--primary-color)';
        }
    } catch (e) { /* silent */ }
}

/* ---- Navigation ---- */
function switchTab(tabName, el) {
    document.querySelectorAll('.tab-content').forEach(t => t.classList.add('hidden'));
    document.querySelectorAll('.sidebar-item').forEach(i => i.classList.remove('active'));
    document.getElementById(`tab-${tabName}`).classList.remove('hidden');
    if (el) el.classList.add('active');
    const titles = { overview: 'Personal Analytics', od: 'Request On-Duty (OD)', history: 'Attendance History' };
    document.getElementById('pageTitle').innerText = titles[tabName];
}

function logout() { localStorage.clear(); window.location.href = 'index.html'; }

/* ---- API helper ---- */
async function fetchAPI(endpoint, options = {}) {
    const res = await fetch(`${API_URL}/${endpoint}`, {
        ...options,
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json', ...options.headers }
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
}

/* ---- Summary + Cumulative ---- */
async function loadSummary() {
    try {
        const data = await fetchAPI('student/attendance/summary');

        const pct = parseFloat(data.percentage) || 0;
        document.getElementById('attPercentage').innerText = pct.toFixed(1) + '%';
        document.getElementById('attPresent').innerText = (data.present ?? 0) + ' ses';
        document.getElementById('attAbsent').innerText = (data.absent ?? 0) + ' ses';
        document.getElementById('attOD').innerText = (data.od ?? 0) + ' ses';

        const total = data.total ?? 0;
        const attended = (data.present ?? 0) + (data.od ?? 0);
        const cumPct = total === 0 ? 0 : Math.round((attended / total) * 100);

        document.getElementById('cumTotal').innerText = total + ' ses';
        document.getElementById('cumAttended').innerText = attended + ' ses';
        document.getElementById('cumPct').innerText = cumPct + '%';

        if (data.totalSessions > 0) {
            document.getElementById('cumTotal').innerText = data.totalSessions + ' ses';
            document.getElementById('cumAttended').innerText = data.attendedSessions + ' ses';
            const dp = parseFloat(data.cumulativePercentage) || 0;
            document.getElementById('cumPct').innerText = dp.toFixed(1) + '%';
            document.getElementById('cumStatus').innerText = 'From daily rollup records';
            document.getElementById('cumPctBar').style.width = dp + '%';
            document.getElementById('cumPctBar').style.background = dp >= 75 ? 'var(--success)' : dp >= 50 ? 'var(--warning)' : 'var(--danger)';
        } else {
            document.getElementById('cumStatus').innerText = 'Based on session records';
            document.getElementById('cumPctBar').style.width = cumPct + '%';
            document.getElementById('cumPctBar').style.background = cumPct >= 75 ? 'var(--success)' : cumPct >= 50 ? 'var(--warning)' : 'var(--danger)';
        }

        const ctx = document.getElementById('attendanceChart').getContext('2d');
        if (chartInstance) chartInstance.destroy();
        chartInstance = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: ['Present', 'Absent', 'OD'],
                datasets: [{
                    data: [data.present || 0, data.absent || 0, data.od || 0],
                    backgroundColor: ['#10b981', '#ef4444', '#f59e0b'],
                    borderWidth: 0, hoverOffset: 4
                }]
            },
            options: {
                plugins: {
                    legend: { position: 'bottom', labels: { color: '#0f172a', font: { family: 'Inter', weight: 500 }, padding: 20 } }
                },
                cutout: '72%',
                responsive: true
            }
        });
    } catch (e) { console.error('Summary error:', e); }
}

/* ---- Recent Sessions ---- */
async function loadDetails() {
    try {
        const data = await fetchAPI('student/attendance/details');
        const tbody = document.querySelector('#detailsTable tbody');

        if (!data.length) {
            tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:2rem; color:var(--text-muted);">No session history yet.</td></tr>`;
            return;
        }

        tbody.innerHTML = data.slice(0, 10).map(r => {
            const session = r.classSessionId;
            const dateStr = session ? new Date(session.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
            const sessionName = (session && session.sessionName) ? session.sessionName : '—';
            const badgeClass = r.status === 'present' ? 'badge-success' : r.status === 'od' ? 'badge-warning' : 'badge-danger';
            const scoreColor = r.engagementScore > 50 ? 'var(--success)' : 'var(--danger)';

            let behaviorsHtml = '<span style="color:var(--text-muted);">—</span>';
            if (r.status === 'present' && r.behaviors && r.behaviors.length > 0) {
                behaviorsHtml = `<div class="behavior-box">` +
                    r.behaviors.slice(-4).map(b =>
                        `<span class="badge" style="background:var(--danger-bg);color:var(--danger);font-size:0.68rem;">${b.signalType}</span>`
                    ).join('') + `</div>`;
            } else if (r.status === 'absent') {
                behaviorsHtml = `<span class="badge badge-danger" style="font-size:0.68rem;">Not Detected</span>`;
            } else if (r.status === 'od') {
                behaviorsHtml = `<span class="badge badge-warning" style="font-size:0.68rem;">OD Protected</span>`;
            }

            const scoreText = r.status === 'od' ? '100% (OD)' : (r.engagementScore ?? 0) + '%';

            return `<tr>
                <td style="color:var(--text-muted);">${dateStr}</td>
                <td style="font-weight:500;">${sessionName}</td>
                <td><span class="badge ${badgeClass}">${r.status}</span></td>
                <td>${behaviorsHtml}</td>
                <td style="font-weight:600;color:${scoreColor};">${scoreText}</td>
            </tr>`;
        }).join('');
    } catch (e) { console.error('Details error:', e); }
}

/* ---- History Tab ---- */
async function loadHistory() {
    const date = document.getElementById('historyDate') ? document.getElementById('historyDate').value : '';
    const month = document.getElementById('historyMonth') ? document.getElementById('historyMonth').value : '';
    // HTML id is 'historyTable' (not 'historySessionTable')
    const tbody = document.querySelector('#historyTable tbody');
    if (!tbody) { console.error('historyTable tbody not found'); return; }
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:2rem;color:var(--text-muted);">Loading...</td></tr>`;

    try {
        let params = '';
        if (date) params = `?date=${date}`;
        else if (month) params = `?month=${month}`;

        // Route is /attendance/history (not /attendance/sessions)
        const data = await fetchAPI(`student/attendance/history${params}`);

        if (!data || !data.length) {
            tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:2rem;color:var(--text-muted);">No session records found for this period.</td></tr>`;
            return;
        }

        tbody.innerHTML = data.map(r => {
            // r.date comes as full ISO string from the server — use toLocaleDateString directly
            const dateStr = r.date ? new Date(r.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
            const sessionName = r.sessionName ?? '—';
            const duration = r.durationMinutes != null ? `${r.durationMinutes} min` : '—';
            const statusBadge = r.status === 'present' ? 'badge-success' : r.status === 'od' ? 'badge-warning' : 'badge-danger';
            const scoreColor = r.engagementScore > 50 ? 'var(--success)' : 'var(--danger)';
            const scoreText = r.status === 'od' ? '100% (OD)' : (r.engagementScore ?? 0) + '%';

            return `<tr>
                <td style="color:var(--text-muted);">${dateStr}</td>
                <td style="font-weight:500;">${sessionName}</td>
                <td style="font-size:0.85rem;color:var(--text-muted);">${duration}</td>
                <td><span class="badge ${statusBadge}">${r.status}</span></td>
                <td style="font-weight:600;color:${scoreColor};">${scoreText}</td>
            </tr>`;
        }).join('');
    } catch (e) {
        console.error('History error:', e);
        tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:2rem;color:var(--danger);">Failed to load session history. Please try again.</td></tr>`;
    }
}

/* ---- Daily Rollup ---- */
async function loadDailyRollup() {
    const month = document.getElementById('historyMonth').value;
    const tbody = document.querySelector('#dailyRollupTable tbody');

    try {
        const data = await fetchAPI(`student/attendance/daily${month ? `?month=${month}` : ''}`);

        if (!data || !data.length) {
            tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;padding:2rem;color:var(--text-muted);">No daily records found for this period.</td></tr>`;
            return;
        }

        tbody.innerHTML = data.map(r => {
            const pctColor = r.percentage >= 75 ? 'var(--success)' : r.percentage >= 50 ? 'var(--warning)' : 'var(--danger)';
            const pctBg = r.percentage >= 75 ? '#f0fdf4' : r.percentage >= 50 ? '#fffbeb' : '#fef2f2';
            const room = (r.classroomId && r.classroomId.name) ? r.classroomId.name : 'Classroom';

            // Parse YYYY-MM-DD as LOCAL date to avoid UTC midnight shift to prev day in IST
            const [yr, mo, dy] = (r.date || '').split('-');
            const localDate = new Date(+yr, +mo - 1, +dy);
            const dateStr = isNaN(localDate) ? r.date : localDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

            return `<tr>
                <td>
                    <span style="display:inline-block; background:#eff6ff; color:var(--primary-color); font-weight:700; font-size:0.8rem; padding:3px 10px; border-radius:20px;">${dateStr}</span>
                </td>
                <td><span class="badge badge-neutral">${room}</span></td>
                <td>
                    <div style="display:flex; align-items:center; gap:8px;">
                        <div style="flex:1; height:6px; background:#e2e8f0; border-radius:9999px; max-width:80px; overflow:hidden;">
                            <div style="height:100%; width:${r.percentage}%; background:${pctColor}; border-radius:9999px;"></div>
                        </div>
                        <span style="font-size:0.78rem; color:var(--text-muted); white-space:nowrap;">${r.attendedSessions} / ${r.totalSessions} sessions</span>
                    </div>
                </td>
                <td>
                    <span style="display:inline-block; font-weight:700; font-size:0.9rem; padding:4px 12px; border-radius:20px; background:${pctBg}; color:${pctColor};">${r.percentage}%</span>
                </td>
            </tr>`;
        }).join('');
    } catch (e) {
        console.error('Daily rollup error:', e);
        document.querySelector('#dailyRollupTable tbody').innerHTML = `<tr><td colspan="4" style="text-align:center;padding:2rem;color:var(--danger);">Failed to load daily attendance summary.</td></tr>`;
    }
}

/* ---- OD Form Dropdowns ---- */
async function loadFormDropdowns() {
    try {
        const faculties = await fetchAPI('student/eligible-faculty');
        document.getElementById('odFaculty').innerHTML = faculties.length
            ? faculties.map(f => `<option value="${f._id}">Prof. ${f.name}</option>`).join('')
            : '<option value="">No faculty assigned</option>';
    } catch (e) { console.error('Dropdown error:', e); }
}

async function loadODRequestHistory() {
    try {
        const data = await fetchAPI('student/od-requests');
        const tbody = document.querySelector('#odStatusTable tbody');

        if (!data.length) {
            tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; padding:2rem; color:var(--text-muted);">No OD requests submitted yet.</td></tr>`;
            return;
        }

        tbody.innerHTML = data.map(r => {
            const statusClass = r.status === 'approved' ? 'badge-success' : (r.status === 'rejected' ? 'badge-danger' : 'badge-warning');
            const dateStr = new Date(r.requestDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

            return `<tr>
                <td style="font-weight:600; color:var(--primary-color);">${dateStr}</td>
                <td style="font-weight:500;">Prof. ${r.facultyName}</td>
                <td style="max-width: 250px; white-space: normal; font-size: 0.85rem; color: var(--text-muted);">${r.reason}</td>
                <td><span class="badge ${statusClass}">${r.status}</span></td>
            </tr>`;
        }).join('');
    } catch (e) { console.error('OD History error:', e); }
}

/* ---- OD Submit ---- */
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('odForm').addEventListener('submit', async e => {
        e.preventDefault();
        const payload = {
            requestDate: document.getElementById('odDate').value,
            requestedFacultyId: document.getElementById('odFaculty').value,
            reason: document.getElementById('odReason').value
        };
        if (!payload.requestDate || !payload.requestedFacultyId) {
            showODMsg('Please select a date and faculty.', false);
            return;
        }
        const btn = e.target.querySelector('button[type="submit"]');
        btn.disabled = true; btn.innerText = 'Submitting...';
        try {
            const res = await fetch(`${API_URL}/student/od-requests`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            btn.disabled = false; btn.innerText = 'Submit Request';
            if (res.ok) {
                showODMsg('OD Request submitted successfully.', true);
                e.target.reset();
                loadSummary();
                loadODRequestHistory();
            } else {
                const err = await res.json();
                showODMsg(err.message || 'Failed to submit request.', false);
            }
        } catch (err) {
            btn.disabled = false; btn.innerText = 'Submit Request';
            showODMsg('Network error. Please try again.', false);
        }
    });
});

function showODMsg(text, ok) {
    const el = document.getElementById('odMsg');
    el.innerText = text;
    el.style.color = ok ? 'var(--success)' : 'var(--danger)';
}
