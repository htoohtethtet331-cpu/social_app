let adminKey = localStorage.getItem('unichat_admin_key');

// DOM Elements
const loginOverlay = document.getElementById('login-overlay');
const loginBtn = document.getElementById('login-btn');
const passwordInput = document.getElementById('admin-password');
const loginError = document.getElementById('login-error');
const dashboardContainer = document.getElementById('dashboard-container');
const navLinks = document.querySelectorAll('.nav-links li[data-target]');
const sections = document.querySelectorAll('.content-section');
const pageTitle = document.getElementById('page-title');

// Base API
const API_BASE = '/api/admin';

// Initialize
if (adminKey) {
    loadDashboard();
}

// Login
loginBtn.addEventListener('click', async () => {
    const pwd = passwordInput.value;
    if (!pwd) return;
    
    // Test key with stats API
    try {
        const res = await fetch(`${API_BASE}/stats`, {
            headers: { 'x-admin-key': pwd }
        });
        if (res.ok) {
            adminKey = pwd;
            localStorage.setItem('unichat_admin_key', pwd);
            loginOverlay.classList.remove('active');
            loadDashboard();
        } else {
            loginError.textContent = "Invalid master password!";
        }
    } catch (err) {
        loginError.textContent = "Server error!";
    }
});

// Logout
document.getElementById('logout-btn').addEventListener('click', () => {
    localStorage.removeItem('unichat_admin_key');
    adminKey = null;
    dashboardContainer.classList.add('hidden');
    loginOverlay.classList.add('active');
    passwordInput.value = '';
    loginError.textContent = '';
});

// Navigation
navLinks.forEach(link => {
    link.addEventListener('click', () => {
        navLinks.forEach(l => l.classList.remove('active'));
        link.classList.add('active');
        const target = link.getAttribute('data-target');
        sections.forEach(sec => sec.classList.remove('active'));
        document.getElementById(target).classList.add('active');
        pageTitle.textContent = link.textContent.trim();
        
        if (target === 'users-section') loadUsers();
        if (target === 'posts-section') loadPosts();
    });
});

async function apiFetch(endpoint, options = {}) {
    if (!options.headers) options.headers = {};
    options.headers['x-admin-key'] = adminKey;
    if (options.body && !(options.body instanceof FormData)) {
        options.headers['Content-Type'] = 'application/json';
    }
    const res = await fetch(API_BASE + endpoint, options);
    if (res.status === 401) {
        document.getElementById('logout-btn').click();
        throw new Error('Unauthorized');
    }
    return res.json();
}

async function loadDashboard() {
    loginOverlay.classList.remove('active');
    dashboardContainer.classList.remove('hidden');
    try {
        const stats = await apiFetch('/stats');
        document.getElementById('stat-users').textContent = stats.users || 0;
        document.getElementById('stat-posts').textContent = stats.posts || 0;
        document.getElementById('stat-comments').textContent = stats.comments || 0;
        document.getElementById('stat-likes').textContent = stats.likes || 0;
    } catch (err) {
        console.error(err);
    }
}

// =====================================
// Users
// =====================================
async function loadUsers() {
    try {
        const users = await apiFetch('/users');
        const tbody = document.querySelector('#users-table tbody');
        tbody.innerHTML = '';
        users.forEach(user => {
            const photo = user.photo_url || '../assets/default-avatar.png';
            const date = new Date(user.created_at || user.last_active || Date.now()).toLocaleDateString();
            tbody.innerHTML += `
                <tr>
                    <td><img src="${photo}" class="avatar-img" onerror="this.src='../assets/default-avatar.png'"></td>
                    <td><strong>${user.username || 'Unknown'}</strong></td>
                    <td>${user.telegram_id || '-'}</td>
                    <td>${date}</td>
                    <td>
                        <button class="action-btn edit" onclick="openEditUser('${user.id}', '${user.username || ''}', '${user.bio || ''}')"><i class="fas fa-edit"></i></button>
                        <button class="action-btn delete" onclick="deleteUser('${user.id}')"><i class="fas fa-trash"></i></button>
                    </td>
                </tr>
            `;
        });
    } catch (err) { console.error(err); }
}

function openEditUser(id, username, bio) {
    document.getElementById('edit-user-id').value = id;
    document.getElementById('edit-user-username').value = username !== 'undefined' ? username : '';
    document.getElementById('edit-user-bio').value = bio !== 'undefined' ? bio : '';
    document.getElementById('edit-user-modal').classList.add('active');
}

async function saveUser() {
    const id = document.getElementById('edit-user-id').value;
    const username = document.getElementById('edit-user-username').value;
    const bio = document.getElementById('edit-user-bio').value;
    try {
        await apiFetch(`/users/${id}`, {
            method: 'PUT',
            body: JSON.stringify({ username, bio })
        });
        closeModal('edit-user-modal');
        Swal.fire('Saved!', 'User has been updated.', 'success');
        loadUsers();
    } catch (err) {
        Swal.fire('Error', 'Failed to update user', 'error');
    }
}

async function deleteUser(id) {
    const result = await Swal.fire({
        title: 'Are you sure?',
        text: "This will delete the user and ALL their posts, likes, and comments!",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#ef4444',
        confirmButtonText: 'Yes, delete it!'
    });
    if (result.isConfirmed) {
        try {
            await apiFetch(`/users/${id}`, { method: 'DELETE' });
            Swal.fire('Deleted!', 'User has been deleted.', 'success');
            loadUsers();
        } catch (err) {
            Swal.fire('Error', 'Failed to delete user', 'error');
        }
    }
}

// =====================================
// Posts
// =====================================
async function loadPosts() {
    try {
        const posts = await apiFetch('/posts');
        const tbody = document.querySelector('#posts-table tbody');
        tbody.innerHTML = '';
        posts.forEach(post => {
            const author = post.user_id ? post.user_id.username : 'Deleted User';
            const date = new Date(post.created_at).toLocaleDateString();
            let media = '-';
            if (post.image_url) {
                if (post.image_url.includes('video')) {
                    media = `<video src="${post.image_url}" class="media-preview" muted></video>`;
                } else {
                    media = `<img src="${post.image_url}" class="media-preview">`;
                }
            }
            tbody.innerHTML += `
                <tr>
                    <td><strong>${author}</strong></td>
                    <td><div class="content-snippet">${post.content || ''}</div></td>
                    <td>${media}</td>
                    <td>${date}</td>
                    <td>
                        <button class="action-btn edit" onclick="openEditPost('${post.id}', '${(post.content || '').replace(/'/g, "\\'")}')"><i class="fas fa-edit"></i></button>
                        <button class="action-btn delete" onclick="deletePost('${post.id}')"><i class="fas fa-trash"></i></button>
                    </td>
                </tr>
            `;
        });
    } catch (err) { console.error(err); }
}

function openEditPost(id, content) {
    document.getElementById('edit-post-id').value = id;
    document.getElementById('edit-post-content').value = content !== 'undefined' ? content : '';
    document.getElementById('edit-post-modal').classList.add('active');
}

async function savePost() {
    const id = document.getElementById('edit-post-id').value;
    const content = document.getElementById('edit-post-content').value;
    try {
        await apiFetch(`/posts/${id}`, {
            method: 'PUT',
            body: JSON.stringify({ content })
        });
        closeModal('edit-post-modal');
        Swal.fire('Saved!', 'Post has been updated.', 'success');
        loadPosts();
    } catch (err) {
        Swal.fire('Error', 'Failed to update post', 'error');
    }
}

async function deletePost(id) {
    const result = await Swal.fire({
        title: 'Are you sure?',
        text: "This will delete the post and its comments!",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#ef4444',
        confirmButtonText: 'Yes, delete it!'
    });
    if (result.isConfirmed) {
        try {
            await apiFetch(`/posts/${id}`, { method: 'DELETE' });
            Swal.fire('Deleted!', 'Post has been deleted.', 'success');
            loadPosts();
        } catch (err) {
            Swal.fire('Error', 'Failed to delete post', 'error');
        }
    }
}

// Utilities
function closeModal(id) {
    document.getElementById(id).classList.remove('active');
}
