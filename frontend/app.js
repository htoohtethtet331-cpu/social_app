const API_BASE_URL = '/api'; 
let currentUser = null;

// Initialize Telegram Web App
const tg = window.Telegram.WebApp;
tg.expand();

document.addEventListener('DOMContentLoaded', () => {
    initApp();
    setupLightboxEvents();
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
            initSocket();
            fetchInitialNotifications();
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

function createProgressiveImageHtml(url, classNames = '', onClickCode = '') {
    if (!url) return '';
    if (url.includes('res.cloudinary.com')) {
        const parts = url.split('/upload/');
        if (parts.length === 2) {
            const tinyUrl = parts[0] + '/upload/w_50,e_blur:1000/' + parts[1];
            return `<img src="${tinyUrl}" data-src="${url}" class="${classNames} progressive-img blur" ${onClickCode} onload="loadHighResImage(this)">`;
        }
    }
    return `<img src="${url}" class="${classNames}" ${onClickCode}>`;
}

function loadHighResImage(img) {
    if (!img.dataset.src || img.classList.contains('loaded')) return;
    const highRes = new Image();
    highRes.onload = () => {
        img.src = img.dataset.src;
        img.classList.remove('blur');
        img.classList.add('loaded');
        img.removeAttribute('onload');
    };
    highRes.src = img.dataset.src;
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
                
                previewGrid.className = `preview-images-container preview-grid-${count}`;
                previewGrid.innerHTML = '';
                
                files.forEach((file, index) => {
                    const src = URL.createObjectURL(file);
                    previewGrid.innerHTML += `<img src="${src}" class="post-grid-img img-${index}" onclick="viewFullScreenImage(event, '${src}')">`;
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

    socket.on(`new_notification_${currentUser.id}`, (notif) => {
        unreadNotificationsCount++;
        updateNotificationBadge();
        // If we are currently on the notifications tab, reload it
        if (document.getElementById('nav-notifications') && document.getElementById('nav-notifications').classList.contains('active')) {
            loadNotifications();
            markNotificationsRead();
        }
    });
}

// Notification Logic
let unreadNotificationsCount = 0;

function updateNotificationBadge() {
    const badge = document.getElementById('nav-notification-badge');
    if (!badge) return;
    if (unreadNotificationsCount > 0) {
        badge.innerText = unreadNotificationsCount > 99 ? '99+' : unreadNotificationsCount;
        badge.style.display = 'flex';
    } else {
        badge.style.display = 'none';
    }
}

async function fetchInitialNotifications() {
    try {
        const res = await fetch(`${API_BASE_URL}/notifications?user_id=${currentUser.id}`);
        const data = await res.json();
        if (data.notifications) {
            unreadNotificationsCount = data.notifications.filter(n => n.status === 'unread').length;
            updateNotificationBadge();
        }
    } catch(e) { console.error(e); }
}

async function loadNotifications() {
    const feed = document.getElementById('notifications-feed');
    try {
        const res = await fetch(`${API_BASE_URL}/notifications?user_id=${currentUser.id}`);
        const data = await res.json();
        if (data.notifications && data.notifications.length > 0) {
            feed.innerHTML = data.notifications.map(n => {
                let text = '';
                if (n.type === 'like') text = 'liked your post.';
                else if (n.type === 'comment') text = 'commented on your post.';
                else if (n.type === 'reply') text = 'replied to your comment.';
                else if (n.type === 'favorite') text = 'favorited your post.';
                else if (n.type === 'story_like') text = 'liked your story.';
                
                const time = formatTimeAgo(n.created_at);
                const bgClass = n.status === 'unread' ? 'unread' : '';
                return `
                    <div class="notification-item ${bgClass}" onclick="handleNotificationClick('${n.type}', '${n.post_id || n.story_id}', '${n.comment_id || ''}')">
                        <img src="${getAvatarUrl(n.actor_id ? n.actor_id.photo_url : null)}" class="notification-avatar" onerror="handleImageError(this)">
                        <div class="notification-content">
                            <p class="notification-text"><strong>${n.actor_id ? n.actor_id.username : 'Someone'}</strong> ${text}</p>
                            <p class="notification-time">${time}</p>
                        </div>
                    </div>
                `;
            }).join('');
        } else {
            feed.innerHTML = '<p class="loading-text" style="text-align:center;">No notifications yet.</p>';
        }
    } catch(e) {
        feed.innerHTML = '<p class="loading-text" style="text-align:center;">Failed to load notifications.</p>';
    }
}

async function markNotificationsRead() {
    try {
        await fetch(`${API_BASE_URL}/notifications/read`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_id: currentUser.id })
        });
        unreadNotificationsCount = 0;
        updateNotificationBadge();
    } catch(e) { console.error(e); }
}

async function handleNotificationClick(type, id, commentId) {
    if (['like', 'comment', 'reply', 'favorite'].includes(type)) {
        switchTab('home'); 
        setTimeout(async () => {
            const postElement = document.getElementById(`post-${id}`);
            if (postElement) {
                postElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
                if ((type === 'comment' || type === 'reply') && commentId) {
                    await openCommentsBottomSheet(id);
                    setTimeout(() => {
                        highlightComment(commentId);
                    }, 500);
                } else {
                    postElement.style.transition = 'background-color 0.5s';
                    postElement.style.backgroundColor = 'rgba(69, 189, 98, 0.1)';
                    setTimeout(() => {
                        postElement.style.backgroundColor = 'var(--bg-color)';
                        setTimeout(() => postElement.style.transition = '', 500);
                    }, 2000);
                }
            }
        }, 300);
    } else if (type === 'story_like') {
        switchTab('profile'); 
    }
}

function highlightComment(commentId) {
    const commentEl = document.getElementById(`comment-${commentId}`);
    if (commentEl) {
        const sheetCommentsList = document.getElementById('sheet-comments-list');
        sheetCommentsList.scrollTo({
            top: commentEl.offsetTop - 50,
            behavior: 'smooth'
        });
        
        commentEl.querySelector('.comment-bubble').classList.add('highlight-fade');
        setTimeout(() => {
            commentEl.querySelector('.comment-bubble').classList.remove('highlight-fade');
        }, 3000);
    }
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
    document.getElementById('notifications-section').style.display = 'none';
    
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
    } else if (tabName === 'notifications') {
        const navNotif = document.getElementById('nav-notifications');
        if (navNotif) navNotif.classList.add('active');
        document.getElementById('notifications-section').style.display = 'block';
        loadNotifications();
        markNotificationsRead();
    } else if (tabName === 'settings') {
        // no nav item to add active to since it's an icon in the header now
        document.getElementById('settings-section').style.display = 'block';
    }
}

async function loadAllUsers(silent = false) {
    const container = document.getElementById('users-list-container');
    if (!silent) {
        if (!container.innerHTML.includes('user-list-item')) {
            const skeletonHtml = `
                <div class="user-list-item" style="border: none;">
                    <div class="avatar-wrapper">
                        <div class="skeleton skeleton-avatar"></div>
                    </div>
                    <div class="user-list-info" style="flex: 1; margin-left: 10px;">
                        <div class="skeleton skeleton-text short"></div>
                        <div class="skeleton skeleton-text full"></div>
                    </div>
                </div>
            `.repeat(4);
            container.innerHTML = skeletonHtml;
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
                                <img src="${photoUrl}" alt="${user.username}" class="user-list-avatar" onerror="handleImageError(this)">
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
        // Only show skeletons if not silently refreshing
        if (!feed.innerHTML.includes('post-item')) {
            const skeletonHtml = `
                <div class="skeleton-post">
                    <div class="skeleton-header">
                        <div class="skeleton skeleton-avatar"></div>
                        <div class="skeleton-header-info">
                            <div class="skeleton skeleton-text short"></div>
                            <div class="skeleton skeleton-text medium"></div>
                        </div>
                    </div>
                    <div class="skeleton skeleton-text full"></div>
                    <div class="skeleton skeleton-text full"></div>
                    <div class="skeleton skeleton-text medium"></div>
                    <div class="skeleton skeleton-image"></div>
                </div>
            `.repeat(3);
            feed.innerHTML = skeletonHtml;
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
                    <img src="${getAvatarUrl(post.photo_url)}" alt="${post.username}" class="avatar clickable-user" onclick="showUserProfile('${post.user_id}')" onerror="handleImageError(this)">
                    ${isActive ? '<div class="active-dot"></div>' : ''}
                </div>
                <div class="post-meta">
                    <span class="post-author clickable-user" onclick="showUserProfile('${post.user_id}')">${post.username}</span>
                    <span class="post-date">${date}</span>
                </div>
            </div>
            <div class="post-body">${escapeHtml(post.content || '')}</div>
            ${post.image_urls && post.image_urls.length > 0 ? `
                <div class="preview-images-container preview-grid-${post.image_urls.length}">
                    ${post.image_urls.map((url, i) => createProgressiveImageHtml(url, `post-grid-img img-${i}`, `onclick="viewFullScreenImage(event, '${url}')"`)).join('')}
                </div>
            ` : (post.image_url ? createProgressiveImageHtml(post.image_url, 'post-image', `onclick="viewFullScreenImage(event, '${post.image_url}')"`) : '')}
            
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
                <button class="fb-interaction-btn fav-btn ${post.has_favorited ? 'favorited' : ''}" id="fav-btn-${post.id}" onclick="toggleFavorite('${post.id}')">
                    <svg viewBox="0 0 24 24" width="20" height="20" class="fav-icon"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"></path></svg>
                    Favorite
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
    } catch (e) {
        console.error(e);
    }
}

async function toggleFavorite(postId) {
    try {
        const res = await fetch(`${API_BASE_URL}/posts/${postId}/favorite`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_id: currentUser.id })
        });
        const data = await res.json();
        if (data.success) {
            const btn = document.getElementById(`fav-btn-${postId}`);
            if (btn) {
                if (data.favorited) {
                    btn.classList.add('favorited');
                } else {
                    btn.classList.remove('favorited');
                }
            }
        }
    } catch (e) {
        console.error(e);
    }
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
    const isReply = !!c.replied_to_username;
    const contentHtml = isReply 
        ? `<span style="color: var(--primary-color); font-weight: bold;">@${escapeHtml(c.replied_to_username)}</span> ${escapeHtml(c.content)}`
        : escapeHtml(c.content);

    return `
        <div class="comment-item" id="comment-${c.id}">
            <img src="${getAvatarUrl(c.photo_url)}" class="comment-avatar clickable-user" onclick="showUserProfile('${c.user_id}'); closeCommentsBottomSheet();" onerror="handleImageError(this)">
            <div class="comment-bubble-wrapper">
                <div class="comment-bubble">
                    <div class="comment-author-name clickable-user" onclick="showUserProfile('${c.user_id}'); closeCommentsBottomSheet();">${escapeHtml(c.username)}</div>
                    <div class="comment-text">${contentHtml}</div>
                </div>
                <div class="comment-actions">
                    <span class="comment-time">${formatTimeAgo(c.created_at)}</span>
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
let startScrollTop = 0;

function handleTouchStart(e) {
    startY = e.touches[0].clientY;
    currentY = startY;
    isDragging = false;
    
    // Check if touch is on the scrollable list
    const list = e.target.closest('.sheet-content');
    if (list) {
        startScrollTop = list.scrollTop;
    } else {
        startScrollTop = 0;
    }
    sheet.style.transition = 'none';
}

function handleTouchMove(e) {
    currentY = e.touches[0].clientY;
    const diff = currentY - startY;
    
    // If scrolling down on the list (meaning pulling content down) and we are at the top
    if (startScrollTop === 0 && diff > 0) {
        isDragging = true;
        sheet.style.transform = `translateY(${diff}px)`;
        // If we are dragging the sheet, prevent the scroll container from trying to overscroll
        if (e.cancelable) e.preventDefault();
    }
}

function handleTouchEnd() {
    if (!isDragging) return;
    isDragging = false;
    sheet.style.transition = 'transform 0.3s cubic-bezier(0.1, 0.8, 0.3, 1)';
    const diff = currentY - startY;
    if (diff > 100) { // Dragged down enough
        closeCommentsBottomSheet();
    } else { // Snap back
        sheet.style.transform = '';
    }
}

dragArea.addEventListener('touchstart', handleTouchStart, {passive: true});
dragArea.addEventListener('touchmove', (e) => {
    isDragging = true; // Drag area always drags
    currentY = e.touches[0].clientY;
    const diff = currentY - startY;
    if (diff > 0) {
        sheet.style.transform = `translateY(${diff}px)`;
    }
}, {passive: true});
dragArea.addEventListener('touchend', handleTouchEnd);

sheetCommentsList.addEventListener('touchstart', handleTouchStart, {passive: true});
sheetCommentsList.addEventListener('touchmove', handleTouchMove, {passive: false}); // non-passive to allow preventDefault
sheetCommentsList.addEventListener('touchend', handleTouchEnd);

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
        
        userPostsFeed.innerHTML = `
            <div class="skeleton-post">
                <div class="skeleton-header">
                    <div class="skeleton skeleton-avatar"></div>
                    <div class="skeleton-header-info">
                        <div class="skeleton skeleton-text short"></div>
                        <div class="skeleton skeleton-text medium"></div>
                    </div>
                </div>
                <div class="skeleton skeleton-text full"></div>
                <div class="skeleton skeleton-text full"></div>
                <div class="skeleton skeleton-text medium"></div>
            </div>
        `.repeat(2);
        
        const hlContainer = document.getElementById('profile-highlights-container');
        hlContainer.style.display = 'flex';
        hlContainer.innerHTML = `
            <div class="highlight-item"><div class="skeleton skeleton-avatar" style="width:70px; height:70px; border-radius:50%;"></div></div>
            <div class="highlight-item"><div class="skeleton skeleton-avatar" style="width:70px; height:70px; border-radius:50%;"></div></div>
            <div class="highlight-item"><div class="skeleton skeleton-avatar" style="width:70px; height:70px; border-radius:50%;"></div></div>
        `;

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
                document.getElementById('view-archive-btn').style.display = 'flex';
                document.getElementById('add-story-btn').style.display = 'flex';
                document.getElementById('cover-camera-btn').style.display = 'flex';
                document.getElementById('avatar-camera-btn').style.display = 'flex';
            } else {
                document.getElementById('edit-profile-btn').style.display = 'none';
                document.getElementById('view-archive-btn').style.display = 'none';
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
            setupStoryTouchEvents();
            playStory();
        } else {
            showUserProfile(userId);
        }
    } catch(e) { console.error("Error fetching stories", e); }
}

let isStoryPaused = false;
let storyTimeRemaining = STORY_DURATION;
let storyStartTime = 0;

function setupStoryTouchEvents() {
    const mediaContainer = document.getElementById('story-media-container');
    
    // Prevent adding multiple listeners
    const newContainer = mediaContainer.cloneNode(true);
    mediaContainer.parentNode.replaceChild(newContainer, mediaContainer);
    
    newContainer.addEventListener('touchstart', () => {
        isStoryPaused = true;
        clearTimeout(storyTimer);
        const video = newContainer.querySelector('video');
        if (video) video.pause();
        
        const fill = document.getElementById(`story-progress-fill-${currentStoryIndex}`);
        if (fill) {
            fill.style.width = getComputedStyle(fill).width;
            fill.style.transition = 'none';
        }
        storyTimeRemaining -= (Date.now() - storyStartTime);
    });
    
    newContainer.addEventListener('touchend', () => {
        isStoryPaused = false;
        const video = newContainer.querySelector('video');
        if (video) video.play();
        
        const fill = document.getElementById(`story-progress-fill-${currentStoryIndex}`);
        if (fill && !video) {
            fill.style.transition = `width ${storyTimeRemaining}ms linear`;
            fill.style.width = '100%';
        }
        storyStartTime = Date.now();
        if (!video) {
            storyTimer = setTimeout(nextStory, storyTimeRemaining);
        }
    });
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
    
    storyTimeRemaining = STORY_DURATION;
    storyStartTime = Date.now();
    
    // Track View
    fetch(`${API_BASE_URL}/stories/${story.id}/view`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: currentUser.id })
    }).catch(e => console.error("Error tracking view", e));

    // Update Viewers Button UI
    const viewersBtn = document.getElementById('story-viewers-btn');
    if (story.user_id === currentUser.id) {
        viewersBtn.style.display = 'flex';
        document.getElementById('story-viewers-count').innerText = story.viewers ? story.viewers.length : 0;
    } else {
        viewersBtn.style.display = 'none';
    }
    
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
    if (currentStoryIndex < currentStories.length - 1) {
        currentStoryIndex++;
        playStory();
    } else {
        closeStoryViewer();
    }
}

function prevStory() {
    if (currentStoryIndex > 0) {
        currentStoryIndex--;
        playStory();
    } else {
        // Restart the first story
        playStory();
    }
}

function closeStoryViewer() {
    clearTimeout(storyTimer);
    document.getElementById('story-viewer-modal').style.display = 'none';
    document.getElementById('story-viewers-modal').classList.remove('active');
    const mediaContainer = document.getElementById('story-media-container');
    mediaContainer.innerHTML = ''; // Stop video
    currentStories = [];
}

async function toggleStoryViewers() {
    const modal = document.getElementById('story-viewers-modal');
    if (modal.classList.contains('active')) {
        modal.classList.remove('active');
        return;
    }
    const story = currentStories[currentStoryIndex];
    if (!story) return;
    
    const list = document.getElementById('story-viewers-list');
    list.innerHTML = '<p style="text-align:center; padding: 20px;">Loading viewers...</p>';
    modal.classList.add('active');
    
    try {
        const res = await fetch(`${API_BASE_URL}/stories/${story.id}/view`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_id: currentUser.id })
        });
        const data = await res.json();
        if (data.success && data.viewers) {
            document.getElementById('story-viewers-count').innerText = data.viewers.length;
            if (data.viewers.length === 0) {
                list.innerHTML = '<p class="text-center text-muted" style="padding: 20px;">No viewers yet</p>';
            } else {
                list.innerHTML = data.viewers.map(v => {
                    const user = v.user_id || {};
                    return `
                    <div class="user-list-item" onclick="showUserProfile('${user._id || user.id}')" style="cursor: pointer; display: flex; align-items: center; gap: 10px; padding: 10px; border-bottom: 1px solid var(--border-color);">
                        <img src="${getAvatarUrl(user.photo_url)}" class="avatar" style="width: 40px; height: 40px;">
                        <div>
                            <strong>${escapeHtml(user.username || 'Unknown')}</strong>
                            <div class="text-muted" style="font-size: 0.8em;">${formatTimeAgo(v.viewed_at)}</div>
                        </div>
                    </div>`;
                }).join('');
            }
        }
    } catch(e) {
        list.innerHTML = '<p class="text-center text-muted" style="padding: 20px;">Error loading viewers</p>';
    }
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
                    <img src="${getAvatarUrl(l.photo_url)}" alt="Avatar" onerror="handleImageError(this)">
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
                <img src="${getAvatarUrl(l.photo_url)}" alt="Avatar" onerror="handleImageError(this)">
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
// --- Lightbox Logic ---
let lbScale = 1;
let lbTransX = 0;
let lbTransY = 0;
let lbLastX = 0;
let lbLastY = 0;
let lbInitPinchDist = null;
let lbInitScale = 1;
let lbIsDragging = false;

function setupLightboxEvents() {
    const modal = document.getElementById('image-viewer-modal');
    
    modal.addEventListener('touchstart', (e) => {
        if (e.touches.length === 2) {
            lbInitPinchDist = Math.hypot(
                e.touches[0].clientX - e.touches[1].clientX,
                e.touches[0].clientY - e.touches[1].clientY
            );
            lbInitScale = lbScale;
            lbIsDragging = false;
        } else if (e.touches.length === 1) {
            lbIsDragging = true;
            lbLastX = e.touches[0].clientX;
            lbLastY = e.touches[0].clientY;
        }
    }, { passive: false });

    modal.addEventListener('touchmove', (e) => {
        if (!modal.classList.contains('active')) return;
        e.preventDefault();
        
        if (e.touches.length === 2 && lbInitPinchDist) {
            const currentDist = Math.hypot(
                e.touches[0].clientX - e.touches[1].clientX,
                e.touches[0].clientY - e.touches[1].clientY
            );
            lbScale = Math.min(Math.max(1, lbInitScale * (currentDist / lbInitPinchDist)), 4);
            updateLightboxTransform(false);
        } else if (e.touches.length === 1 && lbIsDragging) {
            const deltaX = e.touches[0].clientX - lbLastX;
            const deltaY = e.touches[0].clientY - lbLastY;
            lbLastX = e.touches[0].clientX;
            lbLastY = e.touches[0].clientY;
            
            if (lbScale > 1) {
                lbTransX += deltaX;
                lbTransY += deltaY;
                updateLightboxTransform(false);
            } else {
                if (deltaY > 15) {
                    closeFullScreenImage();
                }
            }
        }
    }, { passive: false });

    modal.addEventListener('touchend', (e) => {
        if (e.touches.length < 2) lbInitPinchDist = null;
        if (e.touches.length === 0) {
            lbIsDragging = false;
            // Snap back
            if (lbScale <= 1) {
                lbScale = 1;
                lbTransX = 0;
                lbTransY = 0;
                updateLightboxTransform(true);
            }
        }
    });
}

function updateLightboxTransform(animate) {
    const img = document.getElementById('full-screen-image');
    img.style.transition = animate ? 'transform 0.3s ease-out' : 'none';
    img.style.transform = `translate(${lbTransX}px, ${lbTransY}px) scale(${lbScale})`;
}

function viewFullScreenImage(event, url) {
    if (!url) return;
    const target = event.target;
    const rect = target.getBoundingClientRect();
    
    const modal = document.getElementById('image-viewer-modal');
    const img = document.getElementById('full-screen-image');
    
    img.src = url;
    document.body.classList.add('modal-open');
    modal.classList.add('active');
    
    lbScale = 1;
    lbTransX = 0;
    lbTransY = 0;
    
    // Set initial position based on clicked image
    img.style.transition = 'none';
    img.style.width = `${rect.width}px`;
    img.style.height = `${rect.height}px`;
    // Center calculation logic
    const centerX = window.innerWidth / 2;
    const centerY = window.innerHeight / 2;
    const targetCenterX = rect.left + rect.width / 2;
    const targetCenterY = rect.top + rect.height / 2;
    
    const startX = targetCenterX - centerX;
    const startY = targetCenterY - centerY;
    
    img.style.transform = `translate(${startX}px, ${startY}px) scale(1)`;
    
    // Force layout reflow
    void img.offsetWidth;
    
    // Animate to center
    img.style.transition = 'transform 0.3s ease-out, width 0.3s ease-out, height 0.3s ease-out';
    img.style.width = '100%';
    img.style.height = '100vh';
    img.style.transform = `translate(0px, 0px) scale(1)`;
}

function closeFullScreenImage() {
    const modal = document.getElementById('image-viewer-modal');
    const img = document.getElementById('full-screen-image');
    
    modal.classList.remove('active');
    document.body.classList.remove('modal-open');
    
    setTimeout(() => {
        img.src = '';
        img.style.transform = '';
        img.style.transition = '';
    }, 300);
}

// Favorites in Settings
function showFavorites() {
    document.getElementById('settings-menu').style.display = 'none';
    document.getElementById('favorites-container').style.display = 'block';
    loadFavorites();
}

function hideFavorites() {
    document.getElementById('favorites-container').style.display = 'none';
    document.getElementById('settings-menu').style.display = 'block';
}

async function loadFavorites() {
    const feed = document.getElementById('favorites-feed');
    feed.innerHTML = '<p class="text-center text-muted mt-4">Loading favorites...</p>';
    try {
        const res = await fetch(`${API_BASE_URL}/favorites?user_id=${currentUser.id}`);
        const data = await res.json();
        
        if (data.posts && data.posts.length > 0) {
            feed.innerHTML = data.posts.map(post => createPostHtml(post)).join('');
        } else {
            feed.innerHTML = '<p class="text-center text-muted mt-4">No favorites yet.</p>';
        }
    } catch (e) {
        console.error(e);
        feed.innerHTML = '<p class="text-center text-muted mt-4">Failed to load favorites.</p>';
    }
}

async function viewStoryArchive() {
    const modal = document.getElementById('archive-modal');
    const feed = document.getElementById('archive-feed');
    feed.innerHTML = '<p class="text-center text-muted" style="grid-column: span 3; padding: 20px;">Loading archive...</p>';
    modal.classList.add('active');
    
    try {
        const res = await fetch(`${API_BASE_URL}/stories/archive?user_id=${currentUser.id}`);
        const data = await res.json();
        
        if (data.stories && data.stories.length > 0) {
            feed.innerHTML = data.stories.map(story => {
                const mediaHtml = story.media_type === 'video' 
                    ? `<video src="${story.media_url}" style="width:100%; height:120px; object-fit:cover;"></video>`
                    : `<img src="${story.media_url}" style="width:100%; height:120px; object-fit:cover;">`;
                return `
                <div style="position:relative; cursor:pointer;" onclick="viewArchivedStory(event, '${story.id}')">
                    ${mediaHtml}
                    <div style="position:absolute; bottom:5px; right:5px; background:rgba(0,0,0,0.5); padding:2px 5px; border-radius:10px; font-size:0.7rem; color:white;">
                        ${new Date(story.created_at).toLocaleDateString()}
                    </div>
                </div>`;
            }).join('');
            
            window.archivedStories = data.stories;
        } else {
            feed.innerHTML = '<p class="text-center text-muted" style="grid-column: span 3; padding: 20px;">No archived stories found.</p>';
        }
    } catch(e) {
        feed.innerHTML = '<p class="text-center text-muted" style="grid-column: span 3; padding: 20px;">Error loading archive</p>';
    }
}

function viewArchivedStory(event, storyId) {
    if (!window.archivedStories) return;
    const story = window.archivedStories.find(s => s.id === storyId);
    if (story) {
        viewFullScreenImage(event, story.media_url);
    }
}
