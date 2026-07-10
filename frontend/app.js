const API_BASE_URL = '/api'; 
const DEFAULT_AVATAR = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxMDAgMTAwIj48Y2lyY2xlIGN4PSI1MCIgY3k9IjUwIiByPSI1MCIgZmlsbD0iI2RkZCIvPjxjaXJjbGUgY3g9IjUwIiBjeT0iMzkiIHI9IjE4IiBmaWxsPSIjOTk5Ii8+PHBhdGggZD0iTTIyLDgwIGEzMCwyMCAwIDAsMSw1NiwwIHoiIGZpbGw9IiM5OTkiLz48L3N2Zz4=';

let currentUser = null;

// Initialize Telegram Web App
const tg = window.Telegram.WebApp;
tg.expand();

document.addEventListener('DOMContentLoaded', () => {
    initApp();
});

async function initApp() {
    let tgUser = tg.initDataUnsafe?.user;
    
    if (!tgUser) {
        tgUser = {
            id: 12345678,
            username: "TestUser_" + Math.floor(Math.random() * 1000),
        };
    }

    try {
        const payload = { 
            telegram_id: tgUser.id.toString(), 
            username: tgUser.username || tgUser.first_name || 'Anonymous'
        };
        const res = await fetch(`${API_BASE_URL}/auth`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Auth failed');
        currentUser = data.user;
        
        if (!currentUser.photo_url) {
            showPhotoModal();
        } else {
            setupUI();
            loadPosts();
        }
    } catch (error) {
        console.error("Failed to auth user:", error);
        const usernameEl = document.getElementById('username');
        if (usernameEl) usernameEl.innerText = "Error loading user";
    }
}

function showPhotoModal() {
    const modal = document.getElementById('photo-modal');
    modal.classList.add('active');

    const skipBtn = document.getElementById('skip-btn');
    const photoForm = document.getElementById('photo-form');
    const photoInput = document.getElementById('photo-input');
    const photoPreviewImg = document.getElementById('photo-preview-img');

    if (photoInput && photoPreviewImg) {
        photoInput.onchange = (e) => {
            if (e.target.files && e.target.files[0]) {
                const reader = new FileReader();
                reader.onload = (e) => {
                    photoPreviewImg.src = e.target.result;
                }
                reader.readAsDataURL(e.target.files[0]);
            }
        };
    }

    skipBtn.onclick = async () => {
        try {
            const res = await fetch(`${API_BASE_URL}/skip-profile`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ user_id: currentUser.id })
            });
            const data = await res.json();
            if (data.success) {
                currentUser.photo_url = data.photo_url;
                modal.classList.remove('active');
                setupUI();
                loadPosts();
            }
        } catch(e) { console.error(e); }
    };

    photoForm.onsubmit = async (e) => {
        e.preventDefault();
        const fileInput = document.getElementById('photo-input');
        if (fileInput.files.length === 0) return alert('Please select a photo first');

        const formData = new FormData();
        formData.append('photo', fileInput.files[0]);
        formData.append('user_id', currentUser.id);

        try {
            const res = await fetch(`${API_BASE_URL}/upload-profile`, {
                method: 'POST',
                body: formData
            });
            const data = await res.json();
            if (data.success) {
                currentUser.photo_url = data.photo_url;
                modal.classList.remove('active');
                setupUI();
                loadPosts();
            }
        } catch(e) { console.error(e); }
    };
}

function getAvatarUrl(url) {
    if (!url || url === 'default') return DEFAULT_AVATAR;
    return url;
}

function setupUI() {
    
    const profileImg = document.getElementById('profile-photo');
    profileImg.src = getAvatarUrl(currentUser.photo_url);
    profileImg.style.display = 'block';

    const formAvatar = document.getElementById('form-avatar');
    if (formAvatar) formAvatar.src = getAvatarUrl(currentUser.photo_url);


    // Image preview logic
    const postImageInput = document.getElementById('post-image');
    const previewContainer = document.getElementById('image-preview-container');
    const previewGrid = document.getElementById('multi-image-preview-grid');
    const removeImgBtn = document.getElementById('remove-img-btn');
    let currentLayoutType = 'single';

    postImageInput.onchange = (e) => {
        if (e.target.files && e.target.files.length > 0) {
            const files = Array.from(e.target.files).slice(0, 3); // Max 3
            
            const img = new Image();
            img.onload = () => {
                const isLandscape = img.width >= img.height;
                const count = files.length;
                
                if (count === 1) {
                    currentLayoutType = 'grid-1';
                } else if (count === 2) {
                    currentLayoutType = isLandscape ? 'grid-2-landscape' : 'grid-2-portrait';
                } else {
                    currentLayoutType = isLandscape ? 'grid-3-landscape' : 'grid-3-portrait';
                }
                
                previewGrid.className = `post-images-grid ${currentLayoutType}`;
                previewGrid.innerHTML = '';
                
                files.forEach((file, index) => {
                    const src = URL.createObjectURL(file);
                    previewGrid.innerHTML += `<img src="${src}" class="post-grid-img img-${index}">`;
                });
                
                previewContainer.style.display = 'block';
            };
            img.src = URL.createObjectURL(files[0]);
        }
    };

    removeImgBtn.onclick = () => {
        postImageInput.value = "";
        previewContainer.style.display = 'none';
        previewGrid.innerHTML = "";
        currentLayoutType = 'single';
    };

    // Setup Post Form
    document.getElementById('post-form').onsubmit = async (e) => {
        e.preventDefault();
        
        const submitBtn = document.getElementById('post-submit-btn');
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.innerText = 'Posting...';
        }

        const contentInput = document.getElementById('post-content');
        const content = contentInput.value.trim();
        const files = postImageInput.files;

        if (!content && files.length === 0) {
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerText = 'Post';
            }
            return;
        }

        const formData = new FormData();
        formData.append('user_id', currentUser.id);
        if (content) formData.append('content', content);
        if (files.length > 0) {
            Array.from(files).slice(0, 3).forEach(file => {
                formData.append('images', file);
            });
            formData.append('layout_type', currentLayoutType);
        }

        try {
            const res = await fetch(`${API_BASE_URL}/posts`, {
                method: 'POST',
                body: formData
            });
            const data = await res.json();
            if (data.post) {
                contentInput.value = '';
                removeImgBtn.click(); // Reset image
                
                const feed = document.getElementById('posts-feed');
                const loadingText = feed.querySelector('.loading-text');
                if (loadingText) loadingText.remove();

                const postHtml = createPostHtml(data.post);
                feed.insertAdjacentHTML('afterbegin', postHtml);
                
                // Close modal
                document.getElementById('create-post-modal').classList.remove('active');
                
                // Ensure we are on home tab
                switchTab('home');
            }
        } catch(e) { 
            console.error(e); 
        } finally {
            const submitBtn = document.getElementById('post-submit-btn');
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerText = 'Post';
            }
        }
    };

    // Active Now Ping
    setInterval(async () => {
        try {
            await fetch(`${API_BASE_URL}/ping`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ user_id: currentUser.id })
            });
        } catch(e) { console.error("Ping error:", e); }
    }, 60000); // 1 minute

    // Users Auto Refresh
    setInterval(() => {
        const isUsers = document.getElementById('nav-users').classList.contains('active');
        if (isUsers) {
            loadAllUsers(true);
        }
    }, 30000); // 30 seconds

    // Initialize Socket.io
    initSocket();
}

let socket;
let pendingNewPosts = [];

function initSocket() {
    socket = io('/', { transports: ['websocket'] });

    socket.on('new_post', (post) => {
        // If it's my own post, I might already have it or I don't want the pill
        if (post.user_id === currentUser.id) {
            // we could automatically prepend it or let the normal API call do it
            // but the normal API call already does it in createPost!
            return;
        }
        
        pendingNewPosts.push(post);
        const pill = document.getElementById('new-posts-pill');
        const countSpan = document.getElementById('new-posts-count');
        countSpan.innerText = `${pendingNewPosts.length} New Post${pendingNewPosts.length > 1 ? 's' : ''}`;
        pill.style.display = 'flex';
    });

    socket.on('post_liked', (data) => {
        const { post_id, likes } = data;
        const likeEl = document.getElementById(`like-count-${post_id}`);
        if (likeEl) {
            likeEl.innerText = `${likes} Likes`;
        }
    });

    socket.on('new_comment', (data) => {
        const { post_id, comments } = data;
        const commentEl = document.getElementById(`comment-count-${post_id}`);
        if (commentEl) {
            commentEl.innerText = `${comments} Comments`;
        }
    });
}

function showNewPosts() {
    const feed = document.getElementById('posts-feed');
    // Prepend all pending posts
    [...pendingNewPosts].forEach(post => {
        feed.insertAdjacentHTML('afterbegin', createPostHtml(post));
    });
    pendingNewPosts = [];
    document.getElementById('new-posts-pill').style.display = 'none';
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// Navigation Functions
function switchTab(tabName, userId = null) {
    document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));
    
    // Hide all main sections
    document.getElementById('posts-feed').style.display = 'none';
    document.getElementById('user-profile-section').style.display = 'none';
    document.getElementById('users-list-section').style.display = 'none';
    document.getElementById('settings-section').style.display = 'none';
    
    if (tabName === 'home') {
        document.getElementById('nav-home').classList.add('active');
        document.getElementById('posts-feed').style.display = 'block';
    } else if (tabName === 'users') {
        document.getElementById('nav-users').classList.add('active');
        document.getElementById('users-list-section').style.display = 'block';
        loadAllUsers();
    } else if (tabName === 'profile') {
        document.getElementById('nav-profile').classList.add('active');
        if (userId) {
            showUserProfile(userId);
        } else {
            showUserProfile(currentUser.id);
        }
    } else if (tabName === 'settings') {
        document.getElementById('nav-settings').classList.add('active');
        document.getElementById('settings-section').style.display = 'block';
    }
}

async function loadAllUsers(silent = false) {
    const container = document.getElementById('users-list-container');
    if (!silent) {
        if (!container.innerHTML.includes('user-list-item')) {
            container.innerHTML = '<p class="loading-text">Loading users...</p>';
        }
    }
    
    try {
        const res = await fetch(`${API_BASE_URL}/users`);
        const data = await res.json();
        
        if (data.users && data.users.length > 0) {
            if (!silent) container.innerHTML = '';
            
            data.users.forEach(user => {
                const existingUser = document.getElementById(`user-item-${user.id}`);
                const isActive = user.is_active;
                
                if (existingUser && silent) {
                    const avatarWrapper = existingUser.querySelector('.avatar-wrapper');
                    if (avatarWrapper) {
                        let dot = avatarWrapper.querySelector('.active-dot');
                        if (isActive && !dot) {
                            avatarWrapper.insertAdjacentHTML('beforeend', '<div class="active-dot"></div>');
                        } else if (!isActive && dot) {
                            dot.remove();
                        }
                    }
                } else if (!existingUser) {
                    const photoUrl = user.photo_url || 'https://via.placeholder.com/150';
                    const bio = user.bio || 'No bio available';
                    
                    const userHtml = `
                        <div class="user-list-item" id="user-item-${user.id}" onclick="switchTab('profile', '${user.id}');">
                            <div class="avatar-wrapper">
                                <img src="${photoUrl}" alt="${user.username}" class="user-list-avatar">
                                ${isActive ? '<div class="active-dot"></div>' : ''}
                            </div>
                            <div class="user-list-info">
                                <h3 class="user-list-name">${user.username}</h3>
                                <p class="user-list-bio">${bio}</p>
                            </div>
                        </div>
                    `;
                    container.insertAdjacentHTML('beforeend', userHtml);
                }
            });
        } else {
            container.innerHTML = '<p class="loading-text" style="text-align:center;">No users found.</p>';
        }
    } catch (e) {
        console.error("Error loading users:", e);
        container.innerHTML = '<p class="loading-text" style="color:var(--like-color); text-align:center;">Failed to load users.</p>';
    }
}

function showPostsFeed() {
    switchTab('home');
}

// Theme Functions
function setTheme(mode) {
    if (mode === 'dark') {
        document.body.classList.add('dark-mode');
        document.getElementById('dark-mode-btn').classList.replace('secondary-btn', 'primary-btn');
        document.getElementById('light-mode-btn').classList.replace('primary-btn', 'secondary-btn');
        localStorage.setItem('theme', 'dark');
    } else {
        document.body.classList.remove('dark-mode');
        document.getElementById('light-mode-btn').classList.replace('secondary-btn', 'primary-btn');
        document.getElementById('dark-mode-btn').classList.replace('primary-btn', 'secondary-btn');
        localStorage.setItem('theme', 'light');
    }
}

// Initialize theme from local storage
const savedTheme = localStorage.getItem('theme');
if (savedTheme === 'dark') {
    setTheme('dark');
}

function showMyProfile() {
    switchTab('profile');
}

function openCreatePostModal() {
    document.getElementById('create-post-modal').classList.add('active');
}

async function loadPosts(silent = false) {
    const feed = document.getElementById('posts-feed');
    if (!silent) {
        // Only show loading text if not silently refreshing
        if (!feed.innerHTML.includes('post-item')) {
            feed.innerHTML = '<p class="loading-text">Loading...</p>';
        }
    }
    try {
        const res = await fetch(`${API_BASE_URL}/posts?user_id=${currentUser.id}`);
        const data = await res.json();
        
        if (data.posts && data.posts.length > 0) {
            if (silent) {
                [...data.posts].reverse().forEach(post => {
                    const existingPost = document.getElementById(`post-${post.id}`);
                    if (existingPost) {
                        const likeEl = document.getElementById(`like-count-${post.id}`);
                        if (likeEl) likeEl.innerText = `${post.like_count} Likes`;
                        
                        const commentEl = document.getElementById(`comment-count-${post.id}`);
                        if (commentEl) commentEl.innerText = `${post.comment_count} Comments`;
                        
                        const avatarWrapper = existingPost.querySelector('.avatar-wrapper');
                        if (avatarWrapper) {
                            let dot = avatarWrapper.querySelector('.active-dot');
                            if (post.is_active && !dot) {
                                avatarWrapper.insertAdjacentHTML('beforeend', '<div class="active-dot"></div>');
                            } else if (!post.is_active && dot) {
                                dot.remove();
                            }
                        }
                    } else {
                        feed.insertAdjacentHTML('afterbegin', createPostHtml(post));
                    }
                });
            } else {
                feed.innerHTML = data.posts.map(post => createPostHtml(post)).join('');
            }
        } else {
            feed.innerHTML = '<p class="loading-text">No posts yet. Be the first to say something!</p>';
        }
    } catch(e) {
        feed.innerHTML = '<p class="loading-text">Error loading posts.</p>';
        console.error(e);
    }
}

function createPostHtml(post) {
    const date = new Date(post.created_at).toLocaleString();
    const isActive = post.is_active;

    return `
        <div class="post-item" id="post-${post.id}">
            <div class="post-header">
                <div class="avatar-wrapper">
                    <img src="${getAvatarUrl(post.photo_url)}" alt="${post.username}" class="avatar clickable-user" onclick="showUserProfile('${post.user_id}')">
                    ${isActive ? '<div class="active-dot"></div>' : ''}
                </div>
                <div class="post-meta">
                    <span class="post-author clickable-user" onclick="showUserProfile('${post.user_id}')">${post.username}</span>
                    <span class="post-date">${date}</span>
                </div>
            </div>
            <div class="post-body">${escapeHtml(post.content || '')}</div>
            ${post.image_urls && post.image_urls.length > 0 ? `
                <div class="post-images-grid ${post.layout_type}">
                    ${post.image_urls.map((url, i) => `<img src="${url}" class="post-grid-img img-${i}" onclick="viewFullScreenImage('${url}')">`).join('')}
                </div>
            ` : (post.image_url ? `<img src="${post.image_url}" class="post-image" onclick="viewFullScreenImage('${post.image_url}')">` : '')}
            
            <div class="post-stats">
                <span id="like-count-${post.id}" onclick="viewPostLikes('${post.id}')" style="cursor: pointer;">${post.like_count} Likes</span>
                <span id="comment-count-${post.id}">${post.comment_count} Comments</span>
            </div>
            
            <div class="post-actions-fb">
                <button class="fb-interaction-btn heart-btn ${post.has_liked ? 'liked' : ''}" id="like-btn-${post.id}" onclick="toggleLike('${post.id}')">
                    <svg viewBox="0 0 24 24" width="20" height="20" class="heart-icon"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>
                    Like
                </button>
                <button class="fb-interaction-btn" onclick="openCommentsBottomSheet('${post.id}')">
                    <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M21.99 4c0-1.1-.89-2-1.99-2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h14l4 4-.01-18z"/></svg>
                    Comment
                </button>
            </div>
        </div>
    `;
}

async function toggleLike(postId) {
    try {
        const res = await fetch(`${API_BASE_URL}/posts/${postId}/like`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_id: currentUser.id })
        });
        const data = await res.json();
        if (data.success) {
            const btn = document.getElementById(`like-btn-${postId}`);
            if (data.liked) {
                btn.classList.add('liked');
            } else {
                btn.classList.remove('liked');
            }
            document.getElementById(`like-count-${postId}`).innerText = `${data.likes} Likes`;
        }
    } catch(e) { console.error(e); }
}

// --- Comments Bottom Sheet Feature ---
let replyingToCommentId = null;
const sheetOverlay = document.getElementById('comments-sheet-overlay');
const sheet = document.getElementById('comments-sheet');
const dragArea = document.getElementById('sheet-drag-area');
const sheetCommentsList = document.getElementById('sheet-comments-list');
const sheetCommentForm = document.getElementById('sheet-comment-form');
const sheetCommentInput = document.getElementById('sheet-comment-input');
const replyingIndicator = document.getElementById('replying-indicator');
const replyingText = document.getElementById('replying-text');

function formatTimeAgo(dateString) {
    const d = new Date(dateString);
    const now = new Date();
    const diffSeconds = Math.floor((now - d) / 1000);
    if (diffSeconds < 60) return 'Just now';
    const diffMinutes = Math.floor(diffSeconds / 60);
    if (diffMinutes < 60) return `${diffMinutes} m`;
    const diffHours = Math.floor(diffMinutes / 60);
    if (diffHours < 24) return `${diffHours} h`;
    return `${Math.floor(diffHours / 24)} d`;
}

function renderCommentBubble(c) {
    const timeAgo = formatTimeAgo(c.created_at);
    return `
        <div class="comment-item" id="comment-${c.id}">
            <img src="${getAvatarUrl(c.photo_url)}" class="comment-avatar clickable-user" onclick="showUserProfile('${c.user_id}'); closeCommentsBottomSheet();">
            <div class="comment-bubble-wrapper">
                <div class="comment-bubble">
                    <div class="comment-author-name clickable-user" onclick="showUserProfile('${c.user_id}'); closeCommentsBottomSheet();">${c.username}</div>
                    <div class="comment-text">${escapeHtml(c.content)}</div>
                </div>
                <div class="comment-actions">
                    <span>${timeAgo}</span>
                    <button class="comment-action-btn" onclick="replyToComment('${c.id}', '${escapeHtml(c.username)}')">Reply</button>
                </div>
            </div>
        </div>
    `;
}

async function openCommentsBottomSheet(postId) {
    currentCommentPostId = postId;
    replyingToCommentId = null;
    replyingIndicator.style.display = 'none';
    sheetOverlay.style.display = 'flex';
    // Trigger animation
    setTimeout(() => {
        sheet.classList.add('open');
    }, 10);

    sheetCommentsList.innerHTML = '<p class="loading-text">Loading comments...</p>';
    
    try {
        const res = await fetch(`${API_BASE_URL}/posts/${postId}/comments`);
        const data = await res.json();
        if (data.comments && data.comments.length > 0) {
            // Group comments
            const parents = data.comments.filter(c => !c.parent_id);
            const replies = data.comments.filter(c => c.parent_id);
            
            let html = '';
            parents.forEach(p => {
                html += `<div class="comment-thread">`;
                html += renderCommentBubble(p);
                
                // Find replies
                const childReplies = replies.filter(r => r.parent_id === p.id);
                if (childReplies.length > 0) {
                    html += `<div class="nested-comments">`;
                    childReplies.forEach(r => {
                        html += `<div class="nested-comment">
                                    <div class="comment-connector"></div>
                                    ${renderCommentBubble(r)}
                                 </div>`;
                    });
                    html += `</div>`;
                }
                html += `</div>`;
            });
            
            sheetCommentsList.innerHTML = html;
        } else {
            sheetCommentsList.innerHTML = '<p class="loading-text">No comments yet. Be the first to comment!</p>';
        }
        // Scroll to bottom
        sheetCommentsList.scrollTop = sheetCommentsList.scrollHeight;
    } catch(e) {
        sheetCommentsList.innerHTML = '<p class="loading-text">Error loading comments.</p>';
    }
}

function closeCommentsBottomSheet() {
    sheet.classList.remove('open');
    setTimeout(() => {
        sheetOverlay.style.display = 'none';
        currentCommentPostId = null;
        cancelReply();
        sheet.style.transform = ''; // reset drag
    }, 300);
}

function replyToComment(commentId, username) {
    replyingToCommentId = commentId;
    replyingText.innerText = `Replying to ${username}...`;
    replyingIndicator.style.display = 'flex';
    sheetCommentInput.focus();
}

function cancelReply() {
    replyingToCommentId = null;
    replyingIndicator.style.display = 'none';
}

// Drag to close logic
let startY = 0;
let currentY = 0;
let isDragging = false;

dragArea.addEventListener('touchstart', (e) => {
    startY = e.touches[0].clientY;
    isDragging = true;
    sheet.style.transition = 'none'; // disable transition while dragging
}, {passive: true});

dragArea.addEventListener('touchmove', (e) => {
    if (!isDragging) return;
    currentY = e.touches[0].clientY;
    const diff = currentY - startY;
    if (diff > 0) {
        sheet.style.transform = `translateY(${diff}px)`;
    }
}, {passive: true});

dragArea.addEventListener('touchend', () => {
    if (!isDragging) return;
    isDragging = false;
    sheet.style.transition = 'transform 0.3s cubic-bezier(0.1, 0.8, 0.3, 1)';
    const diff = currentY - startY;
    if (diff > 100) { // Dragged down enough
        closeCommentsBottomSheet();
    } else { // Snap back
        sheet.style.transform = 'translateY(0)';
    }
});

// Close when clicking overlay
sheetOverlay.addEventListener('click', (e) => {
    if (e.target === sheetOverlay) closeCommentsBottomSheet();
});

// Submit comment from bottom sheet
sheetCommentForm.onsubmit = async (e) => {
    e.preventDefault();
    if (!currentCommentPostId) return;
    
    const content = sheetCommentInput.value;
    sheetCommentInput.value = '';
    const parentId = replyingToCommentId;
    cancelReply();
    
    try {
        const res = await fetch(`${API_BASE_URL}/posts/${currentCommentPostId}/comments`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_id: currentUser.id, content, parent_id: parentId })
        });
        const data = await res.json();
        if (data.comment) {
            // Re-fetch and re-render entire sheet to get proper ordering
            // This is easier to ensure nested structure is perfect
            openCommentsBottomSheet(currentCommentPostId);
            
            // Update comment count on main post if visible
            const countEl = document.getElementById(`comment-count-${currentCommentPostId}`);
            if (countEl) {
                // To be exact, fetch posts or simply increment
                const currentCount = parseInt(countEl.innerText) || 0;
                countEl.innerText = `${currentCount + 1} Comments`;
            }
        }
    } catch(e) { console.error("Error submitting comment", e); }
};

function escapeHtml(unsafe) {
    if (!unsafe) return '';
    return unsafe
         .replace(/&/g, "&amp;")
         .replace(/</g, "&lt;")
         .replace(/>/g, "&gt;")
         .replace(/"/g, "&quot;")
         .replace(/'/g, "&#039;");
}

// --- User Profile Feature ---
async function showUserProfile(userId) {
    try {
        // Hide main feed
        document.getElementById('posts-feed').style.display = 'none';
        
        // Show profile section
        const profileSection = document.getElementById('user-profile-section');
        const userPostsFeed = document.getElementById('user-posts-feed');
        profileSection.style.display = 'block';
        userPostsFeed.innerHTML = '<p class="loading-text">Loading user profile...</p>';

        // Fetch User Info
        const userRes = await fetch(`${API_BASE_URL}/users/${userId}`);
        const userData = await userRes.json();
        
        if (userData.user) {
            document.getElementById('profile-banner-avatar').src = getAvatarUrl(userData.user.photo_url);
            document.getElementById('profile-banner-cover').src = userData.user.cover_url ? userData.user.cover_url : 'https://via.placeholder.com/600x200?text=No+Cover+Photo';
            document.getElementById('profile-banner-name').innerText = userData.user.username;
            document.getElementById('profile-banner-bio').innerText = userData.user.bio || 'No bio yet.';
            
            const isActive = userData.user.is_active;
            document.getElementById('profile-banner-active-dot').style.display = isActive ? 'block' : 'none';
            
            if (userId === currentUser.id) {
                document.getElementById('edit-profile-btn').style.display = 'flex';
                document.getElementById('add-story-btn').style.display = 'flex';
                document.getElementById('cover-camera-btn').style.display = 'flex';
                document.getElementById('avatar-camera-btn').style.display = 'flex';
            } else {
                document.getElementById('edit-profile-btn').style.display = 'none';
                document.getElementById('add-story-btn').style.display = 'none';
                document.getElementById('cover-camera-btn').style.display = 'none';
                document.getElementById('avatar-camera-btn').style.display = 'none';
            }
        }

        // Fetch User Posts
        const postsRes = await fetch(`${API_BASE_URL}/users/${userId}/posts?user_id=${currentUser.id}`);
        const postsData = await postsRes.json();

        // Fetch User Highlights
        const hlRes = await fetch(`${API_BASE_URL}/users/${userId}/stories?viewer_id=${currentUser.id}`);
        const hlData = await hlRes.json();
        
        const hlContainer = document.getElementById('profile-highlights-container');
        if (hlData.stories && hlData.stories.length > 0) {
            hlContainer.innerHTML = hlData.stories.map((story, i) => `
                <div class="highlight-item" onclick="viewUserStories('${userId}')">
                    <img src="${story.media_url}" class="highlight-circle">
                </div>
            `).join('');
            hlContainer.style.display = 'flex';
        } else {
            hlContainer.style.display = 'none';
        }

        if (postsData.posts && postsData.posts.length > 0) {
            document.getElementById('profile-stats-posts').innerText = postsData.posts.length;
            userPostsFeed.innerHTML = postsData.posts.map(post => createPostHtml(post)).join('');
        } else {
            document.getElementById('profile-stats-posts').innerText = '0';
            userPostsFeed.innerHTML = '<p class="loading-text">This user has no posts yet.</p>';
        }

    } catch (e) {
        console.error("Failed to load user profile", e);
        document.getElementById('user-posts-feed').innerHTML = '<p class="loading-text">Error loading profile.</p>';
    }
}

function closeUserProfile() {
    switchTab('home');
}

function openBioModal() {
    const currentBio = document.getElementById('profile-banner-bio').innerText;
    document.getElementById('bio-input').value = currentBio === 'No bio yet.' ? '' : currentBio;
    document.getElementById('bio-modal').style.display = 'flex';
}

function closeBioModal() {
    document.getElementById('bio-modal').style.display = 'none';
}

document.getElementById('bio-form').onsubmit = async (e) => {
    e.preventDefault();
    const newBio = document.getElementById('bio-input').value;
    try {
        const res = await fetch(`${API_BASE_URL}/users/${currentUser.id}/bio`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ bio: newBio })
        });
        const data = await res.json();
        if (data.success) {
            document.getElementById('profile-banner-bio').innerText = data.bio || 'No bio yet.';
            closeBioModal();
        } else {
            alert(data.error || 'Failed to update bio');
        }
    } catch (e) {
        console.error(e);
        alert('Error updating bio');
    }
};

// Upload Cover Photo from Profile
document.getElementById('cover-upload').onchange = async (e) => {
    if (e.target.files && e.target.files[0]) {
        const formData = new FormData();
        formData.append('cover', e.target.files[0]);
        formData.append('user_id', currentUser.id);

        try {
            const res = await fetch(`${API_BASE_URL}/upload-cover`, {
                method: 'POST',
                body: formData
            });
            const data = await res.json();
            if (data.success) {
                document.getElementById('profile-banner-cover').src = data.cover_url;
            }
        } catch(err) { console.error(err); }
    }
};

// Upload Avatar from Profile
document.getElementById('avatar-upload').onchange = async (e) => {
    if (e.target.files && e.target.files[0]) {
        const formData = new FormData();
        formData.append('photo', e.target.files[0]);
        formData.append('user_id', currentUser.id);

        try {
            const res = await fetch(`${API_BASE_URL}/upload-profile`, {
                method: 'POST',
                body: formData
            });
            const data = await res.json();
            if (data.success) {
                document.getElementById('profile-banner-avatar').src = data.photo_url;
                document.getElementById('profile-photo').src = data.photo_url;
                const formAvatar = document.getElementById('form-avatar');
                if (formAvatar) formAvatar.src = data.photo_url;
                
                currentUser.photo_url = data.photo_url;
                localStorage.setItem('user', JSON.stringify(currentUser));
            }
        } catch(err) { console.error(err); }
    }
};

// --- Stories Feature ---

// Upload Story
document.getElementById('story-upload').onchange = async (e) => {
    if (e.target.files && e.target.files[0]) {
        const formData = new FormData();
        formData.append('media', e.target.files[0]);
        formData.append('user_id', currentUser.id);

        try {
            const res = await fetch(`${API_BASE_URL}/stories`, {
                method: 'POST',
                body: formData
            });
            const data = await res.json();
            if (data.success) {
                alert('Story added successfully!');
            } else {
                alert(data.error || 'Failed to add story');
            }
        } catch(err) { console.error(err); alert('Error uploading story'); }
    }
};

// Story Viewer Logic
let currentStories = [];
let currentStoryIndex = 0;
let storyTimer = null;
const STORY_DURATION = 5000; // 5 seconds per story

async function viewUserStories(userId) {
    try {
        const res = await fetch(`${API_BASE_URL}/users/${userId}/stories?viewer_id=${currentUser.id}`);
        const data = await res.json();
        
        if (data.stories && data.stories.length > 0) {
            currentStories = data.stories;
            currentStoryIndex = 0;
            
            const avatarUrl = data.user ? getAvatarUrl(data.user.photo_url) : getAvatarUrl('default');
            const usernameStr = data.user ? data.user.username : 'User';
            
            document.getElementById('story-avatar').src = avatarUrl;
            document.getElementById('story-username').innerText = usernameStr;
            document.getElementById('story-viewer-modal').style.display = 'flex';
            
            renderStoryProgress();
            playStory();
        } else {
            showUserProfile(userId);
        }
    } catch(e) { console.error("Error fetching stories", e); }
}

function renderStoryProgress() {
    const container = document.getElementById('story-progress-container');
    container.innerHTML = currentStories.map((_, i) => `
        <div class="story-progress-bar">
            <div class="story-progress-fill" id="story-progress-fill-${i}"></div>
        </div>
    `).join('');
}

function playStory() {
    clearTimeout(storyTimer);
    
    // Reset all progress fills
    currentStories.forEach((_, i) => {
        const fill = document.getElementById(`story-progress-fill-${i}`);
        if (fill) {
            fill.style.transition = 'none';
            fill.style.width = i < currentStoryIndex ? '100%' : '0%';
        }
    });

    if (currentStoryIndex >= currentStories.length) {
        closeStoryViewer();
        return;
    }

    const story = currentStories[currentStoryIndex];
    const mediaContainer = document.getElementById('story-media-container');
    document.getElementById('story-time').innerText = formatTimeAgo(story.created_at);
    
    // Update Like UI
    const likeIcon = document.getElementById('story-like-icon');
    if (story.has_liked) {
        likeIcon.setAttribute('fill', '#e2264d');
        likeIcon.setAttribute('stroke', '#e2264d');
    } else {
        likeIcon.setAttribute('fill', 'none');
        likeIcon.setAttribute('stroke', 'currentColor');
    }
    document.getElementById('story-like-count').innerText = story.like_count > 0 ? story.like_count : '';
    
    if (story.user_id === currentUser.id && story.like_count > 0) {
        document.getElementById('story-like-count').style.display = 'block';
        document.getElementById('story-like-count').onclick = (e) => {
            e.stopPropagation();
            viewStoryLikes(story.id);
        };
    } else {
        document.getElementById('story-like-count').style.display = 'none';
    }

    document.getElementById('story-like-btn').onclick = (e) => {
        e.stopPropagation();
        toggleStoryLike(story.id);
    };
    
    if (story.media_type === 'video') {
        mediaContainer.innerHTML = `<video src="${story.media_url}" class="story-media" autoplay playsinline></video>`;
        const video = mediaContainer.querySelector('video');
        video.onended = nextStory;
        
        // Progress bar for video
        const fill = document.getElementById(`story-progress-fill-${currentStoryIndex}`);
        if (fill) {
            fill.style.transition = `width linear`;
            video.ontimeupdate = () => {
                if(video.duration) {
                    fill.style.width = `${(video.currentTime / video.duration) * 100}%`;
                }
            };
        }
    } else {
        mediaContainer.innerHTML = `<img src="${story.media_url}" class="story-media">`;
        
        // Progress bar for image
        const fill = document.getElementById(`story-progress-fill-${currentStoryIndex}`);
        if (fill) {
            // small delay to allow transition to apply
            setTimeout(() => {
                fill.style.transition = `width ${STORY_DURATION}ms linear`;
                fill.style.width = '100%';
            }, 50);
        }
        
        storyTimer = setTimeout(nextStory, STORY_DURATION);
    }
}

function nextStory() {
    currentStoryIndex++;
    playStory();
}

function closeStoryViewer() {
    clearTimeout(storyTimer);
    document.getElementById('story-viewer-modal').style.display = 'none';
    const mediaContainer = document.getElementById('story-media-container');
    mediaContainer.innerHTML = ''; // Stop video
    currentStories = [];
}

async function toggleStoryLike(storyId) {
    try {
        const res = await fetch(`${API_BASE_URL}/stories/${storyId}/like`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_id: currentUser.id })
        });
        const data = await res.json();
        if (data.success) {
            const story = currentStories[currentStoryIndex];
            if (story && story.id === storyId) {
                story.has_liked = data.liked;
                story.like_count += data.liked ? 1 : -1;
                
                const likeIcon = document.getElementById('story-like-icon');
                if (story.has_liked) {
                    likeIcon.setAttribute('fill', '#e2264d');
                    likeIcon.setAttribute('stroke', '#e2264d');
                } else {
                    likeIcon.setAttribute('fill', 'none');
                    likeIcon.setAttribute('stroke', 'currentColor');
                }
                document.getElementById('story-like-count').innerText = story.like_count > 0 ? story.like_count : '';
                
                if (story.user_id === currentUser.id && story.like_count > 0) {
                    document.getElementById('story-like-count').style.display = 'block';
                } else {
                    document.getElementById('story-like-count').style.display = 'none';
                }
            }
        }
    } catch(e) { console.error(e); }
}

async function viewPostLikes(postId) {
    try {
        const res = await fetch(`${API_BASE_URL}/posts/${postId}/likes`);
        const data = await res.json();
        
        const list = document.getElementById('post-likes-list');
        if (data.likes && data.likes.length > 0) {
            list.innerHTML = data.likes.map(l => `
                <div class="fb-user-item">
                    <img src="${getAvatarUrl(l.photo_url)}" alt="Avatar">
                    <span>${l.username}</span>
                </div>
            `).join('');
        } else {
            list.innerHTML = '<p class="text-center text-muted mt-4">No likes yet.</p>';
        }
        
        document.getElementById('post-likes-modal').classList.add('active');
    } catch(e) { console.error(e); }
}


async function viewStoryLikes(storyId) {
    clearTimeout(storyTimer);
    const video = document.querySelector('.story-media[autoplay]');
    if (video) video.pause();

    try {
        const res = await fetch(`${API_BASE_URL}/stories/${storyId}/likes`);
        const data = await res.json();
        
        const list = document.getElementById('story-likes-list');
        list.innerHTML = data.likes.map(l => `
            <div class="fb-user-item">
                <img src="${getAvatarUrl(l.photo_url)}" alt="Avatar">
                <span>${l.username}</span>
            </div>
        `).join('');
        
        document.getElementById('story-likes-modal').classList.add('active');
        
        const closeBtn = document.querySelector('#story-likes-modal .fb-close-btn');
        closeBtn.onclick = () => {
            document.getElementById('story-likes-modal').classList.remove('active');
            if (video) video.play();
            else storyTimer = setTimeout(nextStory, STORY_DURATION);
        };
    } catch(e) { console.error(e); }
}

// Full Screen Image Viewer
function viewFullScreenImage(url) {
    if (!url) return;
    const modal = document.getElementById('image-viewer-modal');
    const img = document.getElementById('full-screen-image');
    img.src = url;
    modal.classList.add('active');
}
