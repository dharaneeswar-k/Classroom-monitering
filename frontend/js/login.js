/* ── login.js ── */

const API_URL = 'http://localhost:5000/api';
let selectedRole = 'student';

const roleConfig = {
    student: { label: 'Roll Number / Register ID', placeholder: 'Enter your register number' },
    faculty: { label: 'Faculty ID / Email', placeholder: 'Enter your faculty ID or email' },
    admin: { label: 'Admin ID / Email', placeholder: 'Enter your admin ID or email' }
};

function selectRole(role) {
    selectedRole = role;
    document.querySelectorAll('.role-tab-btn').forEach(btn => btn.classList.remove('active'));
    document.getElementById(`tab-${role}`).classList.add('active');

    const cfg = roleConfig[role];
    document.getElementById('id-label').textContent = cfg.label;
    document.getElementById('identifier').placeholder = cfg.placeholder;
    document.getElementById('identifier').value = '';
    document.getElementById('identifier').focus();

    const err = document.getElementById('error-msg');
    err.classList.remove('active');
    err.textContent = '';
}

async function handleLogin(e) {
    e.preventDefault();

    const identifier = document.getElementById('identifier').value.trim();
    const password = document.getElementById('password').value;
    const errorEl = document.getElementById('error-msg');
    const btn = document.getElementById('submitBtn');
    const btnText = document.getElementById('btn-text');
    const btnArrow = document.getElementById('btn-arrow');

    errorEl.classList.remove('active');
    errorEl.textContent = '';

    btn.disabled = true;
    btnText.textContent = 'Authenticating…';
    btnArrow.textContent = '⏳';

    try {
        const res = await fetch(`${API_URL}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ identifier, password })
        });

        const data = await res.json();

        if (res.ok) {
            if (data.role !== selectedRole) {
                throw { customMsg: `This account is registered as a ${data.role}. Please select the correct role.` };
            }

            localStorage.setItem('token', data.token);
            localStorage.setItem('user', JSON.stringify(data));

            const targets = {
                admin: 'admin_dashboard.html',
                faculty: 'faculty_dashboard.html',
                student: 'student_dashboard.html'
            };
            window.location.href = targets[data.role] || 'index.html';
        } else {
            showError(data.message || 'Login failed. Please check your credentials.');
        }

    } catch (err) {
        if (err.customMsg) {
            showError(err.customMsg);
        } else {
            showError('Cannot connect to server. Is the backend running?');
        }
    } finally {
        btn.disabled = false;
        btnText.textContent = 'Sign In';
        btnArrow.textContent = '→';
    }
}

function showError(msg) {
    const el = document.getElementById('error-msg');
    el.textContent = msg;
    el.classList.add('active');
}

// Auto-redirect if already logged in
window.addEventListener('load', () => {
    const user = JSON.parse(localStorage.getItem('user') || 'null');
    if (user && user.token) {
        const targets = { admin: 'admin_dashboard.html', faculty: 'faculty_dashboard.html', student: 'student_dashboard.html' };
        if (targets[user.role]) window.location.href = targets[user.role];
    }
});
