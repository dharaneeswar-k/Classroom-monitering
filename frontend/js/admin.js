/* ── admin.js ── Full CRUD for Classrooms, Cameras, and Users */

const API_URL = 'http://localhost:5000/api';
let token = '';
let cachedClassrooms = [];
let cachedCameras = [];
let cachedUsers = [];

let editingClassroomId = null;
let editingCameraId = null;
let editingUserId = null;

window.onload = () => {
    const userStr = localStorage.getItem('user');
    if (!userStr) { window.location.href = 'index.html'; return; }
    const user = JSON.parse(userStr);
    if (user.role !== 'admin') { window.location.href = 'index.html'; return; }

    token = user.token;
    document.getElementById('userNameDisplay').innerText = user.name;
    const initials = user.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
    document.querySelector('.user-avatar').innerText = initials;

    loadClassrooms();
    loadCameras();
    loadUsers();
};

function switchTab(tabName) {
    document.querySelectorAll('.tab-content').forEach(t => t.classList.add('hidden'));
    document.querySelectorAll('.sidebar-item').forEach(i => i.classList.remove('active'));

    document.getElementById(`tab-${tabName}`).classList.remove('hidden');
    event.currentTarget.classList.add('active');

    const titles = {
        'classrooms': 'Classroom Setup',
        'cameras': 'Camera Architecture',
        'users': 'User Account Provisioning'
    };
    document.getElementById('pageTitle').innerText = titles[tabName];
}

function logout() {
    localStorage.clear();
    window.location.href = 'index.html';
}

function openModal(id) {
    document.getElementById(id).classList.add('active');
    if (id === 'userModal') toggleUserFields();
}
function closeModal(id) { document.getElementById(id).classList.remove('active'); }

function toggleUserFields() {
    const role = document.getElementById('uRole').value;
    document.getElementById('uEmailGroup').style.display = (role === 'admin' || role === 'faculty') ? 'block' : 'none';
    document.getElementById('uRegGroup').style.display = (role === 'student') ? 'block' : 'none';
    document.getElementById('uYearDiv').style.display = (role === 'student') ? 'block' : 'none';
    document.getElementById('uDeptDiv').style.display = (role === 'admin') ? 'none' : 'block';
    document.getElementById('uClassroomAssign').style.display = (role === 'faculty' || role === 'student') ? 'block' : 'none';
    document.getElementById('uImageGroup').style.display = (role === 'student' && !editingUserId) ? 'block' : 'none';
}

async function safeJson(res) {
    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
        return res.json();
    }
    // Non-JSON response (e.g. HTML error page) — return a safe fallback
    const text = await res.text();
    return { message: text.substring(0, 200) };
}

async function fetchAPI(endpoint, options = {}) {
    const headers = { 'Authorization': `Bearer ${token}` };
    if (!(options.body instanceof FormData)) {
        headers['Content-Type'] = 'application/json';
    }
    const res = await fetch(`${API_URL}/admin/${endpoint}`, {
        ...options,
        headers: { ...headers, ...options.headers }
    });
    // Auto-logout on unauthorized (stale/invalid token)
    if (res.status === 401) {
        alert('Your session has expired. Please log in again.');
        localStorage.clear();
        window.location.href = 'index.html';
        return null;
    }
    return res;
}

/* ══════════════════════════════════════
   CLASSROOMS
══════════════════════════════════════ */

async function loadClassrooms() {
    try {
        const res = await fetchAPI('classrooms');
        if (!res) return;
        const data = await safeJson(res);
        if (!res.ok) { console.error('Failed to load classrooms:', data.message); return; }
        cachedClassrooms = data;

        const tbody = document.querySelector('#classroomTable tbody');
        tbody.innerHTML = data.map(c => `
            <tr>
                <td><span style="font-family: monospace; color: var(--text-light)">#${c._id.substring(c._id.length - 6)}</span></td>
                <td style="font-weight: 500;">${c.name}</td>
                <td>${c.department}</td>
                <td>Year ${c.year}</td>
                <td><span class="badge ${c.status === 'active' ? 'badge-success' : 'badge-danger'}">${c.status}</span></td>
                <td>
                    <button class="btn btn-secondary" style="padding: 0.25rem 0.6rem; font-size: 0.75rem; margin-right: 0.3rem;" onclick="openClassroomModal('${c._id}')">Edit</button>
                    <button class="btn btn-secondary" style="padding: 0.25rem 0.6rem; font-size: 0.75rem; color: var(--danger)" onclick="deleteClassroom('${c._id}')">Delete</button>
                </td>
            </tr>
        `).join('');

        // Populate classroom dropdowns
        const optionsHtml = '<option value="">Select a Classroom...</option>' + data.map(c => `<option value="${c._id}">${c.name} (${c.department})</option>`).join('');
        document.getElementById('camClassroom').innerHTML = optionsHtml;
        document.getElementById('uInitialClassroom').innerHTML = optionsHtml;
    } catch (err) {
        console.error('loadClassrooms error:', err);
    }
}

function openClassroomModal(id = null) {
    editingClassroomId = id;
    document.getElementById('classroomForm').reset();

    const title = document.getElementById('classroomModalTitle');
    const statusGroup = document.getElementById('crStatusGroup');
    const submitBtn = document.getElementById('classroomSubmitBtn');

    if (id) {
        const cr = cachedClassrooms.find(c => c._id === id);
        title.innerText = 'Edit Classroom';
        submitBtn.innerText = 'Update Classroom';
        statusGroup.style.display = 'block';
        if (cr) {
            document.getElementById('crName').value = cr.name || '';
            document.getElementById('crDept').value = cr.department || '';
            document.getElementById('crYear').value = cr.year || '';
            document.getElementById('crStatus').value = cr.status || 'active';
        }
    } else {
        title.innerText = 'Add Classroom';
        submitBtn.innerText = 'Save Classroom';
        statusGroup.style.display = 'none';
    }
    openModal('classroomModal');
}

async function deleteClassroom(id) {
    if (!confirm('Are you sure you want to delete this classroom? This cannot be undone.')) return;
    try {
        const res = await fetchAPI(`classrooms/${id}`, { method: 'DELETE' });
        if (!res) return;
        const data = await safeJson(res);
        if (!res.ok) {
            alert('Delete failed: ' + (data.message || 'Unknown error'));
            return;
        }
        loadClassrooms();
    } catch (e) {
        alert('Failed to delete classroom: ' + e.message);
    }
}

/* ══════════════════════════════════════
   CAMERAS
══════════════════════════════════════ */

async function loadCameras() {
    try {
        const res = await fetchAPI('cameras');
        if (!res) return;
        const data = await safeJson(res);
        if (!res.ok) { console.error('Failed to load cameras:', data.message); return; }
        cachedCameras = data;

        const tbody = document.querySelector('#cameraTable tbody');
        tbody.innerHTML = data.map(c => `
            <tr>
                <td style="font-weight: 500;">${c.name}</td>
                <td style="color: var(--secondary-color); font-family: monospace; font-size: 0.8rem;">${c.streamUrl}</td>
                <td>${c.classroomId ? c.classroomId.name : '<span style="color: var(--danger)">Unassigned</span>'}</td>
                <td><span class="badge ${c.status === 'active' ? 'badge-success' : 'badge-danger'}">${c.status}</span></td>
                <td>
                    <button class="btn btn-secondary" style="padding: 0.25rem 0.6rem; font-size: 0.75rem; margin-right: 0.3rem;" onclick="openCameraModal('${c._id}')">Edit</button>
                    <button class="btn btn-secondary" style="padding: 0.25rem 0.6rem; font-size: 0.75rem; color: var(--danger)" onclick="deleteCamera('${c._id}')">Delete</button>
                </td>
            </tr>
        `).join('');
    } catch (err) {
        console.error('loadCameras error:', err);
    }
}

function openCameraModal(id = null) {
    editingCameraId = id;
    document.getElementById('cameraForm').reset();

    const title = document.getElementById('cameraModalTitle');
    const statusGroup = document.getElementById('camStatusGroup');
    const submitBtn = document.getElementById('cameraSubmitBtn');

    if (id) {
        const cam = cachedCameras.find(c => c._id === id);
        title.innerText = 'Edit Camera';
        submitBtn.innerText = 'Update Camera';
        statusGroup.style.display = 'block';
        if (cam) {
            document.getElementById('camName').value = cam.name || '';
            document.getElementById('camUrl').value = cam.streamUrl || '';
            // Set classroom dropdown — ensure classrooms are loaded first
            const classroomId = cam.classroomId ? (cam.classroomId._id || cam.classroomId) : '';
            document.getElementById('camClassroom').value = classroomId;
            document.getElementById('camStatus').value = cam.status || 'active';
        }
    } else {
        title.innerText = 'Register Camera';
        submitBtn.innerText = 'Link Camera';
        statusGroup.style.display = 'none';
    }
    openModal('cameraModal');
}

async function deleteCamera(id) {
    if (!confirm('Are you sure you want to delete this camera? This cannot be undone.')) return;
    try {
        const res = await fetchAPI(`cameras/${id}`, { method: 'DELETE' });
        if (!res) return;
        const data = await safeJson(res);
        if (!res.ok) {
            alert('Delete failed: ' + (data.message || 'Unknown error'));
            return;
        }
        loadCameras();
    } catch (e) {
        alert('Failed to delete camera: ' + e.message);
    }
}

/* ══════════════════════════════════════
   FORM SUBMIT HANDLERS
══════════════════════════════════════ */

document.addEventListener('DOMContentLoaded', () => {

    // ── Classroom Form ──
    document.getElementById('classroomForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const payload = {
            name: document.getElementById('crName').value,
            department: document.getElementById('crDept').value,
            year: document.getElementById('crYear').value
        };

        if (editingClassroomId) {
            payload.status = document.getElementById('crStatus').value;
        }

        try {
            const method = editingClassroomId ? 'PUT' : 'POST';
            const endpoint = editingClassroomId ? `classrooms/${editingClassroomId}` : 'classrooms';
            const res = await fetch(`${API_URL}/admin/${endpoint}`, {
                method,
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const data = await safeJson(res);
            if (!res.ok) {
                if (res.status === 401) {
                    alert('Session expired. Please log in again.');
                    localStorage.clear(); window.location.href = 'index.html'; return;
                }
                alert('Error: ' + (data.message || 'Server error')); return;
            }
            closeModal('classroomModal');
            editingClassroomId = null;
            loadClassrooms();
            e.target.reset();
        } catch (err) {
            alert('Classroom save failed — is the backend running? ' + err.message);
        }
    });

    // ── Camera Form ──
    document.getElementById('cameraForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const classroomId = document.getElementById('camClassroom').value;
        if (!classroomId) { alert('Please select a classroom before linking the camera.'); return; }

        const payload = {
            name: document.getElementById('camName').value,
            streamUrl: document.getElementById('camUrl').value,
            classroomId: classroomId
        };

        if (editingCameraId) {
            payload.status = document.getElementById('camStatus').value;
        }

        try {
            const method = editingCameraId ? 'PUT' : 'POST';
            const endpoint = editingCameraId ? `cameras/${editingCameraId}` : 'cameras';
            const res = await fetch(`${API_URL}/admin/${endpoint}`, {
                method,
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const data = await safeJson(res);
            if (!res.ok) {
                if (res.status === 401) {
                    alert('Session expired. Please log in again.');
                    localStorage.clear(); window.location.href = 'index.html'; return;
                }
                alert('Camera error: ' + (data.message || 'Server rejected the request')); return;
            }
            closeModal('cameraModal');
            editingCameraId = null;
            loadCameras();
            e.target.reset();
        } catch (err) {
            alert('Camera save failed — is the backend running? ' + err.message);
        }
    });

    // ── User Form ──
    document.getElementById('userForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const role = document.getElementById('uRole').value;
        const formData = new FormData();
        formData.append('name', document.getElementById('uName').value);
        formData.append('role', role);
        formData.append('password', document.getElementById('uPass').value || '12345');

        if (role === 'admin' || role === 'faculty') formData.append('email', document.getElementById('uEmail').value);
        if (role === 'student') {
            formData.append('registerNumber', document.getElementById('uRegNo').value);
            formData.append('year', document.getElementById('uYear').value);
            const imageFile = document.getElementById('uImage').files[0];
            if (imageFile && !editingUserId) formData.append('image', imageFile);
        }
        if (role === 'student' || role === 'faculty') {
            formData.append('department', document.getElementById('uDept').value);
            const crSelection = document.getElementById('uInitialClassroom').value;
            if (crSelection) formData.append('classroomId', crSelection);
        }

        try {
            const method = editingUserId ? 'PUT' : 'POST';
            const endpoint = editingUserId ? `users/${editingUserId}` : 'users';
            const reqOptions = { method, headers: { 'Authorization': `Bearer ${token}` } };
            const isJson = editingUserId && !document.getElementById('uImage').files[0];
            if (isJson) {
                reqOptions.headers['Content-Type'] = 'application/json';
                const plainObj = {};
                formData.forEach((value, key) => plainObj[key] = value);
                reqOptions.body = JSON.stringify(plainObj);
            } else {
                reqOptions.body = formData;
            }

            const res = await fetch(`${API_URL}/admin/${endpoint}`, reqOptions);
            if (!res.ok) { const error = await res.json(); alert('Error: ' + error.message); return; }
            closeModal('userModal');
            loadUsers();
            e.target.reset();
            editingUserId = null;
            toggleUserFields();
        } catch (err) {
            alert('Connection error building user.');
        }
    });
});

/* ══════════════════════════════════════
   USERS
══════════════════════════════════════ */

async function loadUsers() {
    try {
        const res = await fetchAPI('users');
        if (!res) return;
        const data = await safeJson(res);
        if (!res.ok) { console.error('Failed to load users:', data.message); return; }
        cachedUsers = data;

        const tbody = document.querySelector('#userTable tbody');
        tbody.innerHTML = data.map(u => `
            <tr>
                <td style="font-weight: 500;">${u.name}</td>
                <td><span class="badge badge-neutral">${u.role}</span></td>
                <td style="font-family: monospace; color: var(--text-muted)">${u.email || u.registerNumber || '-'}</td>
                <td><span class="badge ${u.status === 'active' ? 'badge-success' : 'badge-danger'}">${u.status}</span></td>
                <td>
                    <button class="btn btn-secondary" style="padding: 0.25rem 0.5rem; font-size: 0.75rem" onclick="openUserModal('${u._id}')">Edit</button>
                    <button class="btn btn-secondary" style="padding: 0.25rem 0.5rem; font-size: 0.75rem; color: var(--danger)" onclick="deleteUser('${u._id}')">Delete</button>
                </td>
            </tr>
        `).join('');
    } catch (err) {
        console.error('loadUsers error:', err);
    }
}

function openUserModal(id = null, defaultRole = 'student') {
    editingUserId = id;
    document.getElementById('userForm').reset();
    const modalTitle = document.querySelector('#userModal h3');
    const roleSelect = document.getElementById('uRole');

    if (id) {
        modalTitle.innerText = 'Edit User';
        const user = cachedUsers.find(u => u._id === id);
        if (user) {
            document.getElementById('uName').value = user.name || '';
            roleSelect.value = user.role || 'student';
            roleSelect.disabled = true;
            document.getElementById('uEmail').value = user.email || '';
            document.getElementById('uRegNo').value = user.registerNumber || '';
        }
    } else {
        modalTitle.innerText = defaultRole === 'student' ? 'Provision New Student' : 'Provision Faculty/Admin';
        roleSelect.value = defaultRole;
        roleSelect.disabled = defaultRole === 'student';
    }
    toggleUserFields();
    openModal('userModal');
}

async function deleteUser(id) {
    if (!confirm('Are you absolutely sure you want to permanently delete this user?')) return;
    try {
        const res = await fetchAPI(`users/${id}`, { method: 'DELETE' });
        if (!res.ok) {
            const err = await res.json();
            alert('Delete failed: ' + (err.message || 'Unknown error'));
            return;
        }
        loadUsers();
    } catch (e) {
        alert('Failed to delete user');
    }
}
