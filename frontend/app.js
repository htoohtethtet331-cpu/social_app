const API_BASE_URL = '/api'; 
var currentUser = null;
var currentProfileUserId = null;
var currentProfileUsername = null;
var currentUserFollows = { following: [], followers: [] };
window.activeStoryUsers = {};

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
        
        try {
            const followMapRes = await fetch(`${API_BASE_URL}/users/${currentUser.id}/follow-map`);
            if (followMapRes.ok) {
                currentUserFollows = await followMapRes.json();
            }
        } catch (e) {
            console.error('Error fetching follow map', e);
        }
        
        setupUI();
        initSocket();
        await loadActiveStories();
        fetchInitialNotifications();
        loadPosts();
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

        try {
            const photoUrl = await uploadFileToCloudinary(fileInput.files[0], 'image');
            const res = await fetch(`${API_BASE_URL}/upload-profile`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ user_id: currentUser.id, photo_url: photoUrl })
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
    
    const appBarProfilePic = document.getElementById('app-bar-profile-pic');
    if (appBarProfilePic) appBarProfilePic.src = getAvatarUrl(currentUser.photo_url);

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
            const files = Array.from(e.target.files);
            
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

        showGlassUploadModal('Uploading post...');
        let image_urls = [];
        if (files.length > 0) {
            for (let file of Array.from(files)) {
                const isVideo = file.type.startsWith('video/');
                try {
                    const url = await uploadFileToCloudinary(file, isVideo ? 'video' : 'image');
                    image_urls.push(url);
                } catch(e) {
                    console.error('Upload failed', e);
                }
            }
        }

        try {
            const res = await fetch(`${API_BASE_URL}/posts`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    user_id: currentUser.id,
                    content: content || '',
                    layout_type: currentLayoutType,
                    image_urls: image_urls
                })
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
                
                showGlassSuccess({
                    title: 'Successfully uploaded',
                    subtitle: 'Your post is now live!',
                    viewText: 'View Your post',
                    onView: () => {
                        setTimeout(() => {
                            const newPost = document.getElementById(`post-${data.post.id}`);
                            if (newPost) newPost.scrollIntoView({behavior: 'smooth', block: 'center'});
                        }, 300);
                    }
                });
            } else {
                hideGlassModal();
                alert('Error: ' + data.error);
            }
        } catch (err) {
            console.error(err);
            hideGlassModal();
            alert('Failed to connect to server');
        } finally {
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
    }, 15000); // Poll every 15s

    // Initialize Privacy Setting
    if (currentUser && currentUser.is_private) {
        const privacyToggle = document.getElementById('privacy-toggle');
        if (privacyToggle) privacyToggle.checked = true;
    }

    // Initialize Socket.io
    initSocket();
}

async function togglePrivacy(isPrivate) {
    if (!currentUser) return;
    try {
        const res = await fetch(`${API_BASE_URL}/users/${currentUser.id}/privacy`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ is_private: isPrivate })
        });
        const data = await res.json();
        if (res.ok) {
            currentUser.is_private = data.is_private;
        } else {
            throw new Error(data.error);
        }
    } catch(err) {
        console.error('Error toggling privacy', err);
        alert('Failed to update privacy settings');
        const toggle = document.getElementById('privacy-toggle');
        if (toggle) toggle.checked = !isPrivate;
    }
}

// --- Follow Feature ---
async function toggleFollow(targetId, btnElement) {
    if (!currentUser) return;
    
    const isFollowingNow = currentUserFollows.following.includes(targetId);
    
    // Optimistic UI update
    let previousState = {
        class: btnElement.className,
        text: btnElement.querySelector('#follow-btn-text') ? btnElement.querySelector('#follow-btn-text').innerText : btnElement.innerText
    };
    
    let isMutualIfFollow = currentUserFollows.followers.includes(targetId);
    
    if (isFollowingNow) {
        // Optimistic Unfollow
        currentUserFollows.following = currentUserFollows.following.filter(id => id !== targetId);
        updateFollowButtonUI(btnElement, false, false, currentUserFollows.followers.includes(targetId));
        if (currentProfileUserId === targetId) {
            let el = document.getElementById('profile-stats-followers');
            el.innerText = Math.max(0, parseInt(el.innerText) - 1);
        }
    } else {
        // Optimistic Follow
        currentUserFollows.following.push(targetId);
        updateFollowButtonUI(btnElement, true, isMutualIfFollow, currentUserFollows.followers.includes(targetId));
        if (currentProfileUserId === targetId) {
            let el = document.getElementById('profile-stats-followers');
            el.innerText = parseInt(el.innerText) + 1;
        }
    }

    try {
        const res = await fetch(`${API_BASE_URL}/users/${targetId}/follow`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ follower_id: currentUser.id })
        });
        const data = await res.json();
        
        if (!res.ok) throw new Error(data.error || 'Failed to toggle follow');
        
        // Sync with actual server state
        if (data.action === 'followed') {
            if (!currentUserFollows.following.includes(targetId)) currentUserFollows.following.push(targetId);
            updateFollowButtonUI(btnElement, true, data.isMutual);
        } else {
            currentUserFollows.following = currentUserFollows.following.filter(id => id !== targetId);
            updateFollowButtonUI(btnElement, false, false);
        }
        
    } catch (e) {
        console.error(e);
        // Rollback
        if (isFollowingNow) {
            currentUserFollows.following.push(targetId); // Revert unfollow
            if (currentProfileUserId === targetId) {
                let el = document.getElementById('profile-stats-followers');
                el.innerText = parseInt(el.innerText) + 1;
            }
            updateFollowButtonUI(btnElement, true, false, currentUserFollows.followers.includes(targetId));
        } else {
            currentUserFollows.following = currentUserFollows.following.filter(id => id !== targetId); // Revert follow
            if (currentProfileUserId === targetId) {
                let el = document.getElementById('profile-stats-followers');
                el.innerText = Math.max(0, parseInt(el.innerText) - 1);
            }
            updateFollowButtonUI(btnElement, false, false, currentUserFollows.followers.includes(targetId));
        }
        
        btnElement.className = previousState.class;
        if (btnElement.querySelector('#follow-btn-text')) {
            btnElement.querySelector('#follow-btn-text').innerText = previousState.text;
        } else {
            btnElement.innerText = previousState.text;
        }
        
        if (e.message.includes('Too fast')) {
            // Provide visual feedback for rate limiting
            const originalText = btnElement.querySelector('#follow-btn-text') ? btnElement.querySelector('#follow-btn-text').innerText : btnElement.innerText;
            if (btnElement.querySelector('#follow-btn-text')) {
                btnElement.querySelector('#follow-btn-text').innerText = 'Slow down';
            } else {
                btnElement.innerText = 'Slow down';
            }
            setTimeout(() => {
                if (btnElement.querySelector('#follow-btn-text')) {
                    btnElement.querySelector('#follow-btn-text').innerText = originalText;
                } else {
                    btnElement.innerText = originalText;
                }
            }, 2000);
        }
    }
}

function updateFollowButtonUI(btn, isFollowing, isMutual, isFollower = false) {
    let btnClass = 'primary-btn';
    let btnText = 'Follow';
    
    if (isMutual) {
        btnClass = 'secondary-btn';
        btnText = 'Friends';
    } else if (isFollowing) {
        btnClass = 'secondary-btn';
        btnText = 'Following';
    } else if (isFollower) {
        btnClass = 'primary-btn';
        btnText = 'Follow Back';
    }
    
    if (btn.classList.contains('follow-btn-small')) {
        btn.className = `follow-btn-small btn ${btnClass}`;
        btn.innerText = btnText;
    } else {
        btn.className = `fb-action-btn ${btnClass === 'primary-btn' ? 'primary' : 'secondary'}`;
        const span = btn.querySelector('#follow-btn-text');
        if (span) span.innerText = btnText;
        
        const svg = btn.querySelector('#follow-icon-svg');
        if (svg) {
            svg.style.display = isFollowing || isMutual ? 'none' : 'block';
        }
    }
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
            commentEl.innerText = comments || 0;
        }
    });

    socket.on(`new_notification_${currentUser.id}`, (notif) => {
        unreadNotificationsCount++;
        updateNotificationBadge();
        // If we are currently on the notifications drawer, reload it
        if (document.getElementById('notifications-drawer') && document.getElementById('notifications-drawer').classList.contains('active')) {
            loadNotifications();
            markNotificationsRead();
        }
    });

    socket.on('story_added', async () => {
        await loadActiveStories();
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

// Swipeable Carousel Physics & State
let currentTabIndex = 0; // 0: Home, 1: Users, 2: Profile, 3: Notifications
const tabs = ['home', 'users', 'profile', 'settings'];
let isUsersLoaded = false;
let isProfileLoaded = false;
let isNotificationsLoaded = false;

let touchStartX = 0;
let touchStartY = 0;
let currentTranslate = 0;
let prevTranslate = 0;
let isCarouselDragging = false;
let startDragTime = 0;
let isScrolling = null; // null: undetermined, true: vertical, false: horizontal

document.addEventListener('DOMContentLoaded', () => {
    const swipeWrapper = document.getElementById('swipe-wrapper');
    if (!swipeWrapper) return;

    swipeWrapper.addEventListener('touchstart', touchStart);
    swipeWrapper.addEventListener('touchmove', touchMove, { passive: false });
    swipeWrapper.addEventListener('touchend', touchEnd);
    
    // Initial Indicator sync
    syncNavIndicator();
});

function touchStart(event) {
    if (event.touches.length > 1) return; // ignore multi-touch
    isCarouselDragging = true;
    startDragTime = Date.now();
    touchStartX = event.touches[0].clientX;
    touchStartY = event.touches[0].clientY;
    
    const swipeWrapper = document.getElementById('swipe-wrapper');
    // Remove transition so it follows finger instantly
    swipeWrapper.style.transition = 'none';
    isScrolling = null;
}

function touchMove(event) {
    if (!isCarouselDragging) return;
    
    const currentX = event.touches[0].clientX;
    const currentY = event.touches[0].clientY;
    const diffX = currentX - touchStartX;
    const diffY = currentY - touchStartY;

    // Determine scroll direction on first move
    if (isScrolling === null) {
        isScrolling = Math.abs(diffY) > Math.abs(diffX);
    }

    // If vertical scrolling, ignore horizontal swipe
    if (isScrolling) {
        isCarouselDragging = false;
        return;
    }

    // Prevent default vertical scroll while swiping horizontally
    if (event.cancelable) event.preventDefault();

    // Add resistance at the edges
    const containerWidth = document.getElementById('swipe-container').clientWidth;
    let diffXPercent = (diffX / containerWidth) * 100; // 100% because 1 screen = 100% of 100% wrapper
    let newTranslate = prevTranslate + diffXPercent;
    
    const maxTranslate = 0;
    const minTranslate = -300; // -300% is the 4th screen (index 3)
    
    if (newTranslate > maxTranslate) {
        newTranslate = maxTranslate + (newTranslate - maxTranslate) * 0.2; // Rubber band effect
    } else if (newTranslate < minTranslate) {
        newTranslate = minTranslate + (newTranslate - minTranslate) * 0.2;
    }

    currentTranslate = newTranslate;
    document.getElementById('swipe-wrapper').style.transform = `translateX(${currentTranslate}%)`;
}

function touchEnd(event) {
    if (!isCarouselDragging || isScrolling) return;
    isCarouselDragging = false;

    // dragDistance in percentage
    const dragDistance = currentTranslate - prevTranslate;
    const dragTime = Date.now() - startDragTime;
    // rough velocity: percentage / ms
    const velocity = Math.abs(dragDistance) / dragTime;

    const threshold = 30; // 30% of 100% (1 screen) is 30%

    if (dragDistance < -threshold || (dragDistance < -10 && velocity > 0.05)) {
        if (currentTabIndex < tabs.length - 1) currentTabIndex += 1;
    } else if (dragDistance > threshold || (dragDistance > 10 && velocity > 0.05)) {
        if (currentTabIndex > 0) currentTabIndex -= 1;
    }

    snapToCurrentTab();
}

function snapToCurrentTab() {
    const swipeWrapper = document.getElementById('swipe-wrapper');
    prevTranslate = -currentTabIndex * 100; // 100% per tab
    currentTranslate = prevTranslate;
    
    swipeWrapper.style.transition = 'transform 0.3s cubic-bezier(0.25, 0.8, 0.25, 1)';
    swipeWrapper.style.transform = `translateX(${currentTranslate}%)`;

    updateNavActiveState();
    triggerLazyLoad();
}

function syncNavIndicator() {
    // Removed nav indicator logic
}

function updateNavActiveState() {
    document.querySelectorAll('.nav-item').forEach(btn => btn.classList.remove('active'));
    const activeTabName = tabs[currentTabIndex];
    const navBtn = document.getElementById('nav-' + activeTabName);
    if (navBtn) navBtn.classList.add('active');
}

function triggerLazyLoad() {
    const activeTabName = tabs[currentTabIndex];
    
    if (activeTabName === 'users' && !isUsersLoaded) {
        loadAllUsers();
        isUsersLoaded = true;
    } else if (activeTabName === 'profile' && !isProfileLoaded) {
        if (currentUser) {
            showUserProfile(currentUser.id);
        }
    }
}

// Navigation Functions
function switchTab(tabName, userId = null) {
    if (tabName === 'profile' && userId) {
        showUserProfile(userId);
    }
    
    const index = tabs.indexOf(tabName);
    if (index !== -1) {
        currentTabIndex = index;
        snapToCurrentTab();
    }
}

// Notifications Drawer Logic
function toggleNotificationsDrawer() {
    const drawer = document.getElementById('notifications-drawer');
    const backdrop = document.getElementById('notifications-backdrop');
    if (drawer.classList.contains('active')) {
        drawer.classList.remove('active');
        backdrop.classList.remove('active');
    } else {
        drawer.classList.add('active');
        backdrop.classList.add('active');
        
        if (!isNotificationsLoaded) {
            loadNotifications();
            markNotificationsRead();
            isNotificationsLoaded = true;
        }
    }
}

async function loadAllUsers(silent = false) {
    const container = document.getElementById('explore-users-list');
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
                    
                    const isMutual = currentUserFollows.following.includes(user.id) && currentUserFollows.followers.includes(user.id);
                    const isFollowing = currentUserFollows.following.includes(user.id);
                    
                    let followBtnHtml = '';
                    if (user.id !== currentUser.id) {
                        let btnClass = 'primary-btn';
                        let btnText = 'Follow';
                        if (isMutual) { btnClass = 'secondary-btn'; btnText = 'Friends'; }
                        else if (isFollowing) { btnClass = 'secondary-btn'; btnText = 'Following'; }
            
                        followBtnHtml = `<button class="follow-btn-small btn ${btnClass}" id="follow-user-${user.id}" onclick="event.stopPropagation(); toggleFollow('${user.id}', this)" style="padding: 6px 12px; border-radius: 16px; font-size: 0.9rem;">${btnText}</button>`;
                    }
                    
                    const userHtml = `
                        <div class="user-list-item" id="user-item-${user.id}" onclick="switchTab('profile', '${user.id}');">
                            <div class="avatar-wrapper">
                                <img src="${photoUrl}" alt="${user.username}" class="user-list-avatar" onerror="handleImageError(this)">
                                ${isActive ? '<div class="active-dot"></div>' : ''}
                            </div>
                            <div class="user-list-info" style="flex: 1;">
                                <h3 class="user-list-name">${user.username}</h3>

                            </div>
                            ${followBtnHtml}
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
        await loadActiveStories();
        const res = await fetch(`${API_BASE_URL}/posts?user_id=${currentUser.id}`);
        const data = await res.json();
        
        if (data.posts && data.posts.length > 0) {
            if (silent) {
                [...data.posts].reverse().forEach(post => {
                    const existingPost = document.getElementById(`post-${post.id}`);
                    if (existingPost) {
                        const likeEl = document.getElementById(`like-count-${post.id}`);
                        if (likeEl) likeEl.innerText = post.like_count || 0;
                        
                        const commentEl = document.getElementById(`comment-count-${post.id}`);
                        if (commentEl) commentEl.innerText = post.comment_count || 0;
                        
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

// --- Avatar Rendering Helper ---
function renderAvatarWithStoryRing(user_id, photo_url, username, extraClasses = '') {
    const storyData = window.activeStoryUsers[user_id];
    const avatarImg = `<img src="${getAvatarUrl(photo_url)}" alt="${username}" class="avatar ${extraClasses}" onerror="handleImageError(this)">`;
    
    if (storyData) {
        const ringClass = storyData.has_unseen ? 'unseen' : 'seen';
        // Click Intercept Logic: Open story instead of profile
        return `
            <div class="story-ring-wrapper ${ringClass}" onclick="viewUserStories('${user_id}'); event.stopPropagation();">
                ${avatarImg}
            </div>
        `;
    } else {
        // Normal profile navigation
        return `
            <div class="story-ring-wrapper none" onclick="showUserProfile('${user_id}'); event.stopPropagation();">
                ${avatarImg}
            </div>
        `;
    }
}

async function loadActiveStories() {
    try {
        const res = await fetch(`${API_BASE_URL}/stories?viewer_id=${currentUser.id}`);
        const data = await res.json();
        if (data.raw_grouped) {
            window.activeStoryUsers = data.raw_grouped;
        }
    } catch(err) { console.error('Failed to load active stories', err); }
}

function createPostHtml(post, searchQuery = '', isMinimized = false) {
    const date = new Date(post.created_at).toLocaleString();
    const isActive = post.is_active;

    let contentHtml = escapeHtml(post.content || '');
    if (searchQuery) {
        const safeQuery = escapeHtml(searchQuery).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(`(${safeQuery})`, 'gi');
        contentHtml = contentHtml.replace(regex, '<span class="highlight-neon">$1</span>');
    }

    return `
        <div class="post-item ${isMinimized ? 'post-minimized' : ''}" id="post-${post.id}">
            <div class="post-header">
                <div class="avatar-wrapper">
                    ${renderAvatarWithStoryRing(post.user_id, post.photo_url, post.username, 'clickable-user')}
                    ${isActive ? '<div class="active-dot"></div>' : ''}
                </div>
                <div class="post-meta">
                    <span class="post-author clickable-user" onclick="showUserProfile('${post.user_id}')">${post.username}</span>
                    <span class="post-date">${date}</span>
                </div>
            </div>
            <div class="post-body">${contentHtml}</div>
            ${post.image_urls && post.image_urls.length > 0 ? `
                <div class="preview-images-container ${post.image_urls.length > 1 ? 'preview-grid-2' : 'preview-grid-1'}">
                    ${post.image_urls.slice(0, 2).map((url, i) => {
                        let overlayHtml = '';
                        if (i === 1 && post.image_urls.length > 2) {
                            overlayHtml = `<div class="more-images-overlay">+${post.image_urls.length - 2}</div>`;
                        }
                        const urlsJson = encodeURIComponent(JSON.stringify(post.image_urls));
                        return `<div style="position: relative; width: 100%; height: 100%; cursor: pointer;" onclick="viewFullScreenGallery(event, '${urlsJson}', ${i})">
                            ${createProgressiveImageHtml(url, `post-grid-img img-${i}`, '')}
                            ${overlayHtml}
                        </div>`;
                    }).join('')}
                </div>
            ` : (post.image_url ? createProgressiveImageHtml(post.image_url, 'post-image', `onclick="viewFullScreenGallery(event, '${encodeURIComponent(JSON.stringify([post.image_url]))}', 0)"`) : '')}
            
            <div class="post-actions-fb" style="padding-top: 10px;">
                <div role="button" class="fb-interaction-btn heart-btn ${post.has_liked ? 'liked' : ''}" id="like-btn-${post.id}" onclick="toggleLike('${post.id}')" style="display: flex; gap: 5px; align-items: center;">
                    <svg viewBox="0 0 24 24" width="20" height="20" class="heart-icon"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>
                    <span id="like-count-${post.id}" onclick="event.stopPropagation(); viewPostLikes('${post.id}')">${post.like_count || 0}</span>
                </div>
                <div role="button" class="fb-interaction-btn comment-btn" data-post-id="${post.id}" style="display: flex; gap: 5px; align-items: center;">
                    <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" style="pointer-events: none;"><path d="M21.99 4c0-1.1-.89-2-1.99-2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h14l4 4-.01-18z"/></svg>
                    <span id="comment-count-${post.id}">${post.comment_count || 0}</span>
                </div>
                <div role="button" class="fb-interaction-btn fav-btn ${post.has_favorited ? 'favorited' : ''}" id="fav-btn-${post.id}" onclick="toggleFavorite('${post.id}')" style="display: flex; gap: 5px; align-items: center;">
                    <svg viewBox="0 0 24 24" width="20" height="20" class="fav-icon"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"></path></svg>
                    <span>Favorite</span>
                </div>
            </div>
        </div>
    `;
}

const likeTimeouts = new Map();

async function toggleLike(postId) {
    const btn = document.getElementById(`like-btn-${postId}`);
    const countEl = document.getElementById(`like-count-${postId}`);
    
    if (!btn || !countEl) return;

    // 1. Optimistic UI Update
    const isCurrentlyLiked = btn.classList.contains('liked');
    const newLikedState = !isCurrentlyLiked;
    
    let currentCountMatch = countEl.innerText.match(/\d+/);
    let currentCount = currentCountMatch ? parseInt(currentCountMatch[0]) : 0;
    
    // Immediately apply UI changes
    if (newLikedState) {
        btn.classList.add('liked');
        currentCount++;
    } else {
        btn.classList.remove('liked');
        currentCount--;
    }
    countEl.innerText = currentCount;

    // 2. Debounce Logic
    if (likeTimeouts.has(postId)) {
        clearTimeout(likeTimeouts.get(postId));
    }
    
    const timeout = setTimeout(async () => {
        try {
            const finalAction = btn.classList.contains('liked') ? 'like' : 'unlike';
            
            const res = await fetch(`${API_BASE_URL}/posts/${postId}/like`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ user_id: currentUser.id, action: finalAction })
            });
            
            const data = await res.json();
            
            // 3. Rollback Logic
            if (!data.success) {
                throw new Error("API reported failure");
            }
            
            // Sync exactly with server count just in case
            if (data.likes !== undefined) {
                countEl.innerText = data.likes;
            }
        } catch (e) {
            console.error(e);
            // Revert Optimistic UI Changes
            if (newLikedState) {
                btn.classList.remove('liked');
                currentCount--;
            } else {
                btn.classList.add('liked');
                currentCount++;
            }
            countEl.innerText = currentCount;
            
            // Simple toast/alert for error
            alert("Like ပေး၍ မရပါ");
        }
    }, 500); // 500ms debounce
    
    likeTimeouts.set(postId, timeout);
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
const cancelReplyBtn = document.getElementById('cancel-reply-btn');

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
            <div class="avatar-wrapper" style="margin-right: 10px;">
                ${renderAvatarWithStoryRing(c.user_id, c.photo_url, c.username, 'comment-avatar clickable-user')}
            </div>
            <div class="comment-bubble-wrapper">
                <div class="comment-bubble" onclick="replyToComment('${c.id}', '${escapeHtml(c.username)}')">
                    <div class="comment-author-name">${escapeHtml(c.username)}</div>
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
    if (!postId) return;
    currentCommentPostId = postId;
    cancelReply();
    sheetOverlay.style.display = 'flex';
    // Trigger animation
    setTimeout(() => {
        sheet.classList.add('open');
    }, 10);

    sheetCommentsList.innerHTML = '<div class="cat-loader-container"><div class="cat"><div class="cat__body"></div><div class="cat__body"></div><div class="cat__tail"></div><div class="cat__head"></div></div></div>';
    
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
    sheet.style.transform = ''; // reset inline transform immediately so CSS class takes over
    sheet.classList.remove('open');
    setTimeout(() => {
        sheetOverlay.style.display = 'none';
        sheetCommentsList.innerHTML = '';
        currentCommentPostId = null;
        cancelReply();
    }, 300);
}

function replyToComment(commentId, username) {
    replyingToCommentId = commentId;
    sheetCommentInput.placeholder = `Replying to ${username}`;
    sheetCommentInput.style.borderLeft = '2px solid var(--like-color)';
    sheetCommentInput.style.paddingLeft = '8px';
    cancelReplyBtn.style.display = 'block';
    sheetCommentInput.focus();
}

function cancelReply() {
    replyingToCommentId = null;
    sheetCommentInput.placeholder = 'Write a comment...';
    sheetCommentInput.style.borderLeft = 'none';
    sheetCommentInput.style.paddingLeft = '0';
    cancelReplyBtn.style.display = 'none';
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
                countEl.innerText = currentCount + 1;
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
        // Automatically swipe to Profile tab
        const index = tabs.indexOf('profile');
        if (currentTabIndex !== index) {
            currentTabIndex = index;
            snapToCurrentTab();
        }
        isProfileLoaded = true;
        currentProfileUserId = userId;
        
        const profileSection = document.getElementById('user-profile-section');
        const userPostsFeed = document.getElementById('user-posts-feed');
        
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
            document.getElementById('profile-banner-cover').src = userData.user.cover_url ? userData.user.cover_url : 'data:image/svg+xml;charset=UTF-8,%3Csvg xmlns="http://www.w3.org/2000/svg" width="600" height="200"%3E%3Crect width="100%25" height="100%25" fill="%23cccccc"/%3E%3C/svg%3E';
            document.getElementById('profile-banner-name').innerText = userData.user.username;
            currentProfileUsername = userData.user.username;
            document.getElementById('profile-stats-followers').innerText = userData.user.follower_count || 0;
            document.getElementById('profile-stats-following').innerText = userData.user.following_count || 0;
            document.getElementById('profile-stats-likes').innerText = userData.likes_count || 0;
            const bioEl = document.getElementById('profile-banner-bio');
            bioEl.innerText = userData.user.bio || 'No bio yet.';
            
            const isActive = userData.user.is_active;
            document.getElementById('profile-banner-active-dot').style.display = isActive ? 'block' : 'none';
            
            const followBtn = document.getElementById('follow-profile-btn');
            const otherUserActions = document.getElementById('other-user-actions');
            
            if (userId === currentUser.id) {
                bioEl.onclick = openBioModal;
                bioEl.style.cursor = 'pointer';
                document.getElementById('view-archive-btn').style.display = 'flex';
                document.getElementById('add-story-btn').style.display = 'flex';
                document.getElementById('cover-camera-btn').style.display = 'flex';
                document.getElementById('avatar-camera-btn').style.display = 'flex';
                if (otherUserActions) otherUserActions.style.display = 'none';
            } else {
                bioEl.onclick = null;
                bioEl.style.cursor = 'default';
                document.getElementById('view-archive-btn').style.display = 'none';
                document.getElementById('add-story-btn').style.display = 'none';
                document.getElementById('cover-camera-btn').style.display = 'none';
                document.getElementById('avatar-camera-btn').style.display = 'none';
                
                if (otherUserActions) otherUserActions.style.display = 'flex';
                
                if (followBtn) {
                    followBtn.style.display = 'flex';
                    const isMutual = currentUserFollows.followers.includes(userId) && currentUserFollows.following.includes(userId);
                    const isFollowing = currentUserFollows.following.includes(userId);
                    updateFollowButtonUI(followBtn, isFollowing, isMutual);
                }
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
            userPostsFeed.innerHTML = postsData.posts.map(post => createPostHtml(post)).join('');
        } else {
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
        showGlassUploadModal('Uploading cover...');
        try {
            const coverUrl = await uploadFileToCloudinary(e.target.files[0], 'image');
            const res = await fetch(`${API_BASE_URL}/upload-cover`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ user_id: currentUser.id, cover_url: coverUrl })
            });
            const data = await res.json();
            if (data.success) {
                const bannerCover = document.getElementById('profile-banner-cover');
                if (bannerCover) bannerCover.src = data.cover_url;
                showGlassSuccess({
                    title: 'Successfully uploaded',
                    subtitle: 'Your cover photo is now live!',
                    viewText: 'View Profile',
                    onView: () => { switchTab('profile'); }
                });
            } else {
                hideGlassModal();
            }
        } catch(err) { console.error(err); hideGlassModal(); }
    }
};

// Upload Avatar from Profile
document.getElementById('avatar-upload').onchange = async (e) => {
    if (e.target.files && e.target.files[0]) {
        showGlassUploadModal('Uploading avatar...');
        try {
            const photoUrl = await uploadFileToCloudinary(e.target.files[0], 'image');
            const res = await fetch(`${API_BASE_URL}/upload-profile`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ user_id: currentUser.id, photo_url: photoUrl })
            });
            const data = await res.json();
            if (data.success) {
                const bannerAvatar = document.getElementById('profile-banner-avatar');
                if (bannerAvatar) bannerAvatar.src = data.photo_url;
                
                const profilePhoto = document.getElementById('profile-photo');
                if (profilePhoto) profilePhoto.src = data.photo_url;
                
                const formAvatar = document.getElementById('form-avatar');
                if (formAvatar) formAvatar.src = data.photo_url;
                
                const appBarProfilePic = document.getElementById('app-bar-profile-pic');
                if (appBarProfilePic) appBarProfilePic.src = data.photo_url;
                
                currentUser.photo_url = data.photo_url;
                localStorage.setItem('user', JSON.stringify(currentUser));
                
                showGlassSuccess({
                    title: 'Successfully uploaded',
                    subtitle: 'Your profile picture is now live!',
                    viewText: 'View Profile',
                    onView: () => { switchTab('profile'); }
                });
            } else {
                hideGlassModal();
            }
        } catch(err) { console.error(err); hideGlassModal(); }
    }
};

// --- Stories Feature ---

// Upload Story
document.getElementById('story-upload').onchange = async (e) => {
    if (e.target.files && e.target.files[0]) {
        showGlassUploadModal('Uploading story...');
        try {
            const file = e.target.files[0];
            const isVideo = file.type.startsWith('video/');
            const mediaUrl = await uploadFileToCloudinary(file, isVideo ? 'video' : 'image');
            
            const res = await fetch(`${API_BASE_URL}/stories`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ user_id: currentUser.id, media_url: mediaUrl, media_type: isVideo ? 'video' : 'image' })
            });
            const data = await res.json();
            if (data.success) {
                showGlassSuccess({
                    title: 'Successfully uploaded',
                    subtitle: 'Your story is now live!',
                    viewText: 'View Story',
                    onView: () => { loadActiveStories(); setTimeout(() => viewUserStories(currentUser.id), 500); }
                });
                loadActiveStories();
            } else {
                hideGlassModal();
                alert(data.error || 'Failed to add story');
            }
        } catch(err) { console.error(err); hideGlassModal(); alert('Error uploading story'); }
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
            // Fallback navigation logic
            document.getElementById('story-avatar').onclick = () => { closeStoryViewer(); showUserProfile(userId); };
            document.getElementById('story-username').onclick = () => { closeStoryViewer(); showUserProfile(userId); };
            
            document.getElementById('story-viewer-modal').style.display = 'flex';
            
            // Mark as seen immediately in local state
            if (window.activeStoryUsers[userId]) {
                window.activeStoryUsers[userId].has_unseen = false;
                // Re-render feed and comments to update rings
                const rings = document.querySelectorAll(`.story-ring-wrapper`);
                rings.forEach(ring => {
                    if (ring.getAttribute('onclick').includes(userId)) {
                        ring.classList.remove('unseen');
                        ring.classList.add('seen');
                    }
                });
            }
            
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
        resumeStory();
        return;
    }
    pauseStory();
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
    if (!url && typeof event === 'string') {
        url = event;
        event = null;
    }
    if (!url) return;
    if (event) {
        event.stopPropagation();
    }
    
    let modal = document.getElementById('simple-image-viewer');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'simple-image-viewer';
        // Use inline styles to completely bypass any CSS cache or specificity issues
        modal.style.position = 'fixed';
        modal.style.top = '0';
        modal.style.left = '0';
        modal.style.width = '100vw';
        modal.style.height = '100vh';
        modal.style.backgroundColor = 'rgba(0,0,0,0.95)';
        modal.style.zIndex = '999999';
        modal.style.display = 'none';
        modal.style.alignItems = 'center';
        modal.style.justifyContent = 'center';
        modal.style.opacity = '0';
        modal.style.transition = 'opacity 0.2s ease-in-out';
        
        modal.innerHTML = `
            <div style="position:absolute; top:15px; right:20px; color:white; font-size:35px; cursor:pointer; z-index:2; text-shadow: 0 0 10px rgba(0,0,0,0.8);">&times;</div>
            <img id="simple-full-screen-img" style="max-width:100%; max-height:100%; object-fit:contain; z-index:1; pointer-events:none;">
        `;
        
        modal.onclick = () => {
            modal.style.opacity = '0';
            setTimeout(() => {
                modal.style.display = 'none';
                document.body.style.overflow = ''; // restore scroll
                document.getElementById('simple-full-screen-img').src = '';
            }, 200);
        };
        
        document.body.appendChild(modal);
    }
    
    document.getElementById('simple-full-screen-img').src = url;
    document.body.style.overflow = 'hidden'; // prevent background scroll
    modal.style.display = 'flex';
    // tiny delay for transition to work
    setTimeout(() => {
        modal.style.opacity = '1';
    }, 10);
}

// Global variables for gallery state
let currentGalleryUrls = [];
let currentGalleryIndex = 0;
let galleryTouchStartX = 0;
let galleryTouchEndX = 0;
let galleryTouchMoveX = 0;
let galleryTouchStartTime = 0;
let galleryIsSwiping = false;
let galleryDidSwipe = false;

function viewFullScreenGallery(event, urlsJson, startIndex = 0) {
    if (event) event.stopPropagation();
    
    try {
        currentGalleryUrls = JSON.parse(decodeURIComponent(urlsJson));
    } catch(e) {
        currentGalleryUrls = [];
    }
    
    if (currentGalleryUrls.length === 0) return;
    currentGalleryIndex = startIndex;
    
    let modal = document.getElementById('gallery-image-viewer');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'gallery-image-viewer';
        modal.style.position = 'fixed';
        modal.style.top = '0';
        modal.style.left = '0';
        modal.style.width = '100vw';
        modal.style.height = '100vh';
        modal.style.backgroundColor = 'black'; // TikTok uses solid black for gallery
        modal.style.zIndex = '999999';
        modal.style.display = 'none';
        modal.style.alignItems = 'center';
        modal.style.justifyContent = 'center';
        modal.style.opacity = '0';
        modal.style.transition = 'opacity 0.2s ease-in-out';
        
        modal.innerHTML = `
            <div id="gallery-slides-container" style="position:absolute; top:0; left:0; width:100%; height:100%; overflow:hidden;"></div>
            <div id="gallery-ui-container" style="position:absolute; top:0; left:0; width:100%; height:100%; pointer-events:none; z-index: 100;">
                <div id="gallery-dots-container" style="position:absolute; bottom:25px; left:50%; transform:translateX(-50%); display:flex; gap:8px; align-items:center;"></div>
                <div style="position:absolute; top:50%; left:10px; color:white; font-size:30px; cursor:pointer; text-shadow: 0 0 10px rgba(0,0,0,0.8); transform: translateY(-50%); padding: 20px; pointer-events:auto;" onclick="prevGalleryImage(event)" id="gallery-prev-btn">&#10094;</div>
                <div style="position:absolute; top:50%; right:10px; color:white; font-size:30px; cursor:pointer; text-shadow: 0 0 10px rgba(0,0,0,0.8); transform: translateY(-50%); padding: 20px; pointer-events:auto;" onclick="nextGalleryImage(event)" id="gallery-next-btn">&#10095;</div>
            </div>
        `;
        document.body.appendChild(modal);
        
        // Swiping support
        modal.addEventListener('touchstart', (e) => {
            galleryTouchStartX = e.changedTouches[0].screenX;
            galleryTouchStartTime = Date.now();
            galleryIsSwiping = true;
            galleryDidSwipe = false;
            
            // Remove transitions for smooth 1:1 dragging
            for (let i = 0; i < currentGalleryUrls.length; i++) {
                const slide = document.getElementById(`gallery-slide-${i}`);
                const overlay = document.getElementById(`gallery-slide-overlay-${i}`);
                if (slide) slide.style.transition = 'none';
                if (overlay) overlay.style.transition = 'none';
            }
        }, {passive: true});
        
        modal.addEventListener('touchmove', (e) => {
            if (!galleryIsSwiping) return;
            galleryTouchMoveX = e.changedTouches[0].screenX;
            const deltaX = galleryTouchMoveX - galleryTouchStartX;
            if (Math.abs(deltaX) > 10) galleryDidSwipe = true;
            
            const screenWidth = window.innerWidth;
            const progress = deltaX / screenWidth;
            
            // TikTok 3D Stacking Logic
            for (let i = 0; i < currentGalleryUrls.length; i++) {
                const slide = document.getElementById(`gallery-slide-${i}`);
                const overlay = document.getElementById(`gallery-slide-overlay-${i}`);
                if (!slide) continue;
                
                if (i === currentGalleryIndex) {
                    if (deltaX < 0) { // Swiping left (next)
                        // Current shrinks and darkens
                        const scale = Math.max(0.9, 1 - Math.abs(progress) * 0.1);
                        slide.style.transform = `scale(${scale})`;
                        slide.style.zIndex = 5;
                        overlay.style.opacity = Math.abs(progress) * 0.6;
                    } else { // Swiping right (prev)
                        // Current slides right
                        slide.style.transform = `translateX(${deltaX}px)`;
                        slide.style.zIndex = 10;
                        overlay.style.opacity = 0;
                    }
                } else if (i === currentGalleryIndex + 1) { // Next slide
                    if (deltaX < 0) {
                        // Next comes in from right
                        slide.style.transform = `translateX(${screenWidth + deltaX}px)`;
                        slide.style.zIndex = 10;
                        overlay.style.opacity = 0;
                    } else {
                        slide.style.transform = `translateX(100%)`;
                    }
                } else if (i === currentGalleryIndex - 1) { // Prev slide
                    if (deltaX > 0) {
                        // Prev grows and brightens
                        const scale = Math.min(1, 0.9 + Math.abs(progress) * 0.1);
                        slide.style.transform = `scale(${scale})`;
                        slide.style.zIndex = 5;
                        overlay.style.opacity = 0.6 - Math.abs(progress) * 0.6;
                    } else {
                        slide.style.transform = `translateX(-100%)`;
                    }
                }
            }
        }, {passive: true});
        
        modal.addEventListener('touchend', (e) => {
            if (!galleryIsSwiping) return;
            galleryTouchEndX = e.changedTouches[0].screenX;
            galleryIsSwiping = false;
            handleGallerySwipe();
        }, {passive: true});
        
        // Close on background click
        modal.addEventListener('click', (e) => {
            if (galleryDidSwipe) {
                galleryDidSwipe = false;
                return;
            }
            // Check if clicked exactly on slides container or a slide (not UI)
            if (e.target.classList.contains('gallery-slide') || e.target.tagName === 'IMG' || e.target.id === 'gallery-slides-container') {
                closeGallery();
            }
        });
    }
    
    // Initialize slides
    const container = document.getElementById('gallery-slides-container');
    container.innerHTML = currentGalleryUrls.map((url, i) => `
        <div class="gallery-slide" id="gallery-slide-${i}" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; transform: translateX(${i === currentGalleryIndex ? 0 : (i < currentGalleryIndex ? '-100%' : '100%')}); z-index: ${i === currentGalleryIndex ? 10 : 1};">
            <div class="gallery-slide-overlay" id="gallery-slide-overlay-${i}" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; background: black; opacity: 0; z-index: 2; pointer-events: none;"></div>
            <img src="${url}" style="max-width: 100%; max-height: 100%; object-fit: contain; z-index: 1;">
        </div>
    `).join('');
    
    updateGalleryImageUI();
    document.body.style.overflow = 'hidden';
    modal.style.display = 'flex';
    setTimeout(() => { modal.style.opacity = '1'; }, 10);
    animateToSlide(currentGalleryIndex); // Ensure initial state is perfect
}

function handleGallerySwipe() {
    const deltaX = galleryTouchEndX - galleryTouchStartX;
    const deltaTime = Date.now() - galleryTouchStartTime;
    const velocity = Math.abs(deltaX) / (deltaTime || 1); // px per ms
    
    const threshold = window.innerWidth * 0.4;
    let nextIndex = currentGalleryIndex;
    
    if (deltaX < 0 && (Math.abs(deltaX) > threshold || velocity > 0.5) && currentGalleryIndex < currentGalleryUrls.length - 1) {
        nextIndex = currentGalleryIndex + 1;
    } else if (deltaX > 0 && (Math.abs(deltaX) > threshold || velocity > 0.5) && currentGalleryIndex > 0) {
        nextIndex = currentGalleryIndex - 1;
    }
    
    if (nextIndex === currentGalleryIndex && (deltaX < 0 && currentGalleryIndex === currentGalleryUrls.length - 1 || deltaX > 0 && currentGalleryIndex === 0)) {
        // Swiped past the bounds, close gallery like TikTok
        if (Math.abs(deltaX) > threshold || velocity > 0.5) {
            closeGallery();
            return;
        }
    }
    
    animateToSlide(nextIndex);
}

function animateToSlide(targetIndex) {
    currentGalleryIndex = targetIndex;
    updateGalleryImageUI(); // update dots
    
    // Spring physics in CSS (bounce/damping)
    const springEasing = 'cubic-bezier(0.175, 0.885, 0.32, 1.15)'; 
    const transitionTime = '0.4s';
    
    for (let i = 0; i < currentGalleryUrls.length; i++) {
        const slide = document.getElementById(`gallery-slide-${i}`);
        const overlay = document.getElementById(`gallery-slide-overlay-${i}`);
        if (!slide) continue;
        
        slide.style.transition = `transform ${transitionTime} ${springEasing}`;
        overlay.style.transition = `opacity ${transitionTime} ease-out`;
        
        if (i === currentGalleryIndex) {
            slide.style.transform = `translateX(0px) scale(1)`;
            slide.style.zIndex = 10;
            overlay.style.opacity = 0;
        } else if (i < currentGalleryIndex) {
            slide.style.transform = `scale(0.9)`; // stay underneath and scale down
            slide.style.zIndex = 5;
            overlay.style.opacity = 0.6;
        } else {
            slide.style.transform = `translateX(100%)`; // move right out of view
            slide.style.zIndex = 10;
            overlay.style.opacity = 0;
        }
    }
}

function updateGalleryImageUI() {
    const dotsContainer = document.getElementById('gallery-dots-container');
    const prevBtn = document.getElementById('gallery-prev-btn');
    const nextBtn = document.getElementById('gallery-next-btn');
    
    if (dotsContainer) {
        if (currentGalleryUrls.length > 1) {
            dotsContainer.innerHTML = currentGalleryUrls.map((_, i) => {
                const isActive = i === currentGalleryIndex;
                const size = isActive ? '8px' : '6px';
                const opacity = isActive ? '1' : '0.5';
                return `<div style="width:${size}; height:${size}; border-radius:50%; background:white; opacity:${opacity}; transition:all 0.2s ease;"></div>`;
            }).join('');
        } else {
            dotsContainer.innerHTML = '';
        }
    }
    
    if(prevBtn) prevBtn.style.display = currentGalleryIndex > 0 ? 'block' : 'none';
    if(nextBtn) nextBtn.style.display = currentGalleryIndex < currentGalleryUrls.length - 1 ? 'block' : 'none';
}

function nextGalleryImage(e) {
    if(e) e.stopPropagation();
    if (currentGalleryIndex < currentGalleryUrls.length - 1) {
        animateToSlide(currentGalleryIndex + 1);
    } else {
        closeGallery(); 
    }
}

function prevGalleryImage(e) {
    if(e) e.stopPropagation();
    if (currentGalleryIndex > 0) {
        animateToSlide(currentGalleryIndex - 1);
    } else {
        closeGallery(); 
    }
}

function closeGallery(e) {
    if(e) e.stopPropagation();
    const modal = document.getElementById('gallery-image-viewer');
    if(modal) {
        modal.style.opacity = '0';
        setTimeout(() => {
            modal.style.display = 'none';
            document.body.style.overflow = '';
            document.getElementById('gallery-slides-container').innerHTML = ''; // clear memory
        }, 200);
    }
}

function closeFullScreenImage() {
    // Left for backwards compatibility with any cached HTML
    const oldModal = document.getElementById('image-viewer-modal');
    if (oldModal) {
        oldModal.classList.remove('active');
    }
    const simpleModal = document.getElementById('simple-image-viewer');
    if (simpleModal) {
        simpleModal.style.opacity = '0';
        setTimeout(() => {
            simpleModal.style.display = 'none';
            document.body.style.overflow = '';
        }, 200);
    }
    document.body.classList.remove('modal-open');
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

// --- Search Logic ---
function toggleSearch() {
    const searchContainer = document.getElementById('search-bar-container');
    const searchInput = document.getElementById('search-input');
    const suggestions = document.getElementById('search-suggestions');
    if (searchContainer.style.display === 'none' || searchContainer.style.display === '') {
        searchContainer.style.display = 'block';
        searchInput.focus();
    } else {
        searchContainer.style.display = 'none';
        searchInput.value = '';
        suggestions.style.display = 'none';
        // Reset to normal feed
        loadPosts();
    }
}

let searchTimeout = null;
document.getElementById('search-input').addEventListener('input', (e) => {
    const query = e.target.value.trim();
    const suggestionsContainer = document.getElementById('search-suggestions');
    
    if (searchTimeout) clearTimeout(searchTimeout);
    
    if (query.length < 2) {
        suggestionsContainer.style.display = 'none';
        if (query.length === 0) loadPosts(); // reset if emptied
        return;
    }

    // Debounce API call for 300ms
    searchTimeout = setTimeout(async () => {
        try {
            const res = await fetch(`${API_BASE_URL}/posts/suggest?q=${encodeURIComponent(query)}`);
            const data = await res.json();
            
            if (data.suggestions && data.suggestions.length > 0) {
                suggestionsContainer.innerHTML = data.suggestions.map(s => 
                    `<div class="suggestion-item" onclick="performSearch('${query}')">
                        <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" style="vertical-align: middle; margin-right: 8px;"><path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg>
                        ${s.snippet}
                    </div>`
                ).join('');
                suggestionsContainer.style.display = 'block';
            } else {
                suggestionsContainer.innerHTML = `<div class="suggestion-item" style="color: var(--text-muted);">No suggestions found</div>`;
                suggestionsContainer.style.display = 'block';
            }
        } catch (err) {
            console.error("Suggest error", err);
        }
    }, 300);
});

document.getElementById('search-input').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        const query = e.target.value.trim();
        if (query) {
            performSearch(query);
            document.getElementById('search-suggestions').style.display = 'none';
        }
    }
});

async function performSearch(query) {
    const feed = document.getElementById('posts-feed');
    document.getElementById('search-input').value = query; // update input box if clicked from suggest
    document.getElementById('search-suggestions').style.display = 'none';
    
    feed.innerHTML = '<div class="cat-loader-container"><div class="cat"><div class="cat__body"></div><div class="cat__body"></div><div class="cat__tail"></div><div class="cat__head"></div></div></div>';
    
    try {
        const res = await fetch(`${API_BASE_URL}/posts/search?q=${encodeURIComponent(query)}&current_user_id=${currentUser.id}`);
        const data = await res.json();
        
        if (data.posts && data.posts.length > 0) {
            feed.innerHTML = `<h3 style="padding: 10px 15px; margin: 0; color: var(--text-color);">Search Results for "${escapeHtml(query)}"</h3>` +
                             data.posts.map(post => createPostHtml(post, query, true)).join('');
        } else {
            feed.innerHTML = `<p class="loading-text">No results found for "${escapeHtml(query)}". Try different keywords.</p>`;
        }
    } catch (e) {
        feed.innerHTML = '<p class="loading-text">Error during search.</p>';
        console.error(e);
    }
}

// --- Followers / Following List Feature ---
let currentUsersListType = '';
let currentUsersListId = '';
let currentUsersListCursor = null;
let isFetchingUsersList = false;
let hasMoreUsersList = true;

async function openUsersListModal(type, userId) {
    console.log("openUsersListModal triggered:", type, userId);
    if (!userId) {
        console.warn("openUsersListModal aborted: no userId");
        return;
    }
    const modal = document.getElementById('users-list-modal');
    if (!modal) {
        console.error("openUsersListModal: modal element not found!");
        return;
    }
    const container = modal.querySelector('#users-list-container');
    const title = document.getElementById('users-list-title');
    
    currentUsersListType = type;
    currentUsersListId = userId;
    currentUsersListCursor = null;
    isFetchingUsersList = false;
    hasMoreUsersList = true;
    
    title.innerText = type === 'followers' ? 'Followers' : 'Following';
    container.innerHTML = '<div class="cat-loader-container"><div class="cat"><div class="cat__body"></div><div class="cat__body"></div><div class="cat__tail"></div><div class="cat__head"></div></div></div>';
    
    // FORCE inline styles to bypass aggressive index.html caching on mobile
    modal.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
    modal.style.setProperty('background-color', 'rgba(0, 0, 0, 0.5)', 'important');
    container.style.flex = '1 1 auto';
    container.style.minHeight = '250px';
    container.style.display = 'block'; // Remove flex from container to avoid collapsing entirely
    
    modal.classList.add('active');
    console.log("Modal classes after add:", modal.className);
    console.log("Modal display style:", window.getComputedStyle(modal).display);
    
    if (!container.hasAttribute('data-scroll-listener')) {
        container.addEventListener('scroll', handleUsersListScroll);
        container.setAttribute('data-scroll-listener', 'true');
    }
    
    await fetchAndRenderUsersList(true);
}

async function handleUsersListScroll() {
    const container = document.getElementById('users-list-container');
    if (container.scrollTop + container.clientHeight >= container.scrollHeight - 50) {
        if (!isFetchingUsersList && hasMoreUsersList) {
            await fetchAndRenderUsersList(false);
        }
    }
}

async function fetchAndRenderUsersList(isInitial) {
    if (isFetchingUsersList || !hasMoreUsersList) return;
    isFetchingUsersList = true;
    
    const modal = document.getElementById('users-list-modal');
    const container = modal.querySelector('#users-list-container');
    
    try {
        let url = `${API_BASE_URL}/users/${currentUsersListId}/${currentUsersListType}?current_user_id=${currentUser ? currentUser.id : ''}`;
        if (currentUsersListCursor) {
            url += `&cursor=${currentUsersListCursor}`;
        }
        
        const res = await fetch(url);
        const data = await res.json();
        
        if (!res.ok) {
            if (data.is_private) {
                container.innerHTML = `
                    <div style="text-align:center; padding: 30px 20px;">
                        <svg viewBox="0 0 24 24" width="48" height="48" fill="var(--text-color)" style="opacity:0.5; margin-bottom: 10px;">
                            <path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zM9 6c0-1.66 1.34-3 3-3s3 1.34 3 3v2H9V6zm9 14H6V10h12v10zm-6-3c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2z"/>
                        </svg>
                        <p style="font-weight:bold; color: var(--text-color); margin: 0;">This account is private</p>
                        <p style="font-size:0.9rem; color: #65676b; margin-top:5px;">Follow this account to see their ${currentUsersListType}.</p>
                    </div>`;
                hasMoreUsersList = false;
                isFetchingUsersList = false;
                return;
            }
            throw new Error(data.error || 'Failed to load');
        }
        
        if (isInitial && (!data.users || data.users.length === 0)) {
            container.innerHTML = `<p class="loading-text" style="text-align:center;">No ${currentUsersListType} yet.</p>`;
            hasMoreUsersList = false;
            isFetchingUsersList = false;
            return;
        }
        
        if (isInitial) container.innerHTML = '';
        console.log("Users fetched:", data.users.length, data.users);
        
        const html = data.users.map(user => {
            const isFollowing = currentUserFollows.following.includes(user._id || user.id);
            const isFollower = currentUserFollows.followers.includes(user._id || user.id);
            const isMutual = isFollowing && isFollower;
            let followBtnHtml = '';
            
            if (currentUser && currentUser.id !== (user._id || user.id)) {
                let btnClass = 'primary-btn';
                let btnText = 'Follow';
                if (isMutual) { btnClass = 'secondary-btn'; btnText = 'Friends'; }
                else if (isFollowing) { btnClass = 'secondary-btn'; btnText = 'Following'; }
                else if (isFollower) { btnClass = 'primary-btn'; btnText = 'Follow Back'; }
                
                followBtnHtml = `<button class="follow-btn-small btn ${btnClass}" onclick="event.stopPropagation(); toggleFollow('${user._id || user.id}', this)" style="padding: 6px 12px; border-radius: 16px; font-size: 0.9rem;">${btnText}</button>`;
            }
            
            return `
                <div class="user-list-item" onclick="document.getElementById('users-list-modal').classList.remove('active'); switchTab('profile', '${user._id || user.id}');">
                    <div class="avatar-wrapper">
                        <img src="${getAvatarUrl(user.photo_url)}" alt="${user.username}" class="user-list-avatar" onerror="handleImageError(this)">
                        ${user.is_active ? '<div class="active-dot"></div>' : ''}
                    </div>
                    <div class="user-list-info" style="flex: 1;">
                        <h3 class="user-list-name">${user.username}</h3>

                    </div>
                    ${followBtnHtml}
                </div>
            `;
        }).join('');
        
        container.insertAdjacentHTML('beforeend', html);
        
        if (data.nextCursor) {
            currentUsersListCursor = data.nextCursor;
        } else {
            hasMoreUsersList = false;
        }
    } catch(err) {
        console.error(err);
        if (isInitial) {
            container.innerHTML = '<p class="loading-text" style="text-align:center; color: var(--like-color);">Error loading users.</p>';
        }
    } finally {
        isFetchingUsersList = false;
    }
}

// --- Users List Modal Swipe-to-Close Logic ---
let ulStartY = 0;
let ulCurrentY = 0;
let ulIsDragging = false;
let ulStartScrollTop = 0;
const ulModal = document.getElementById('users-list-modal');
const ulModalContent = ulModal.querySelector('.modal-content');

function ulHandleTouchStart(e) {
    ulStartY = e.touches[0].clientY;
    ulCurrentY = ulStartY;
    ulIsDragging = false;
    
    const container = e.target.closest('#users-list-container');
    ulStartScrollTop = container ? container.scrollTop : 0;
    
    ulModalContent.style.transition = 'none';
}

function ulHandleTouchMove(e) {
    ulCurrentY = e.touches[0].clientY;
    const diff = ulCurrentY - ulStartY;
    
    if (ulStartScrollTop === 0 && diff > 0) {
        ulIsDragging = true;
        ulModalContent.style.transform = `translateY(${diff}px)`;
        if (e.cancelable) e.preventDefault();
    }
}

function ulHandleTouchEnd() {
    if (!ulIsDragging) return;
    ulIsDragging = false;
    ulModalContent.style.transition = 'transform 0.3s cubic-bezier(0.1, 0.8, 0.3, 1)';
    const diff = ulCurrentY - ulStartY;
    
    if (diff > 100) { // Dragged down enough
        ulModal.classList.remove('active');
        setTimeout(() => { ulModalContent.style.transform = ''; }, 300);
    } else { // Snap back
        ulModalContent.style.transform = '';
    }
}

// Attach events when the script loads
const ulContainer = ulModal.querySelector('#users-list-container');
const ulHeader = ulModal.querySelector('.bottom-sheet-handle').parentElement;

ulHeader.addEventListener('touchstart', ulHandleTouchStart, {passive: true});
ulHeader.addEventListener('touchmove', (e) => {
    // If touched on the handle/header, always allow dragging down
    if (e.target.closest('#users-list-container')) return; 
    ulCurrentY = e.touches[0].clientY;
    const diff = ulCurrentY - ulStartY;
    if (diff > 0) {
        ulIsDragging = true;
        ulModalContent.style.transform = `translateY(${diff}px)`;
        if (e.cancelable) e.preventDefault();
    }
}, {passive: false});
ulHeader.addEventListener('touchend', ulHandleTouchEnd);

ulContainer.addEventListener('touchstart', ulHandleTouchStart, {passive: true});
ulContainer.addEventListener('touchmove', ulHandleTouchMove, {passive: false});
ulContainer.addEventListener('touchend', ulHandleTouchEnd);

// Event Delegation for Comment Buttons
document.addEventListener('click', (e) => {
    const commentBtn = e.target.closest('.comment-btn');
    if (commentBtn) {
        const postId = commentBtn.getAttribute('data-post-id');
        openCommentsBottomSheet(postId);
    }
});

// --- Glass UI Modal Logic ---
function showGlassUploadModal(title = "Uploading...") {
    const modal = document.getElementById('glass-upload-modal');
    if (!modal) return;
    const uploadingState = document.getElementById('glass-uploading-state');
    const successState = document.getElementById('glass-success-state');
    const progressBar = document.getElementById('glass-progress-bar');
    const progressText = document.getElementById('glass-progress-text');
    
    uploadingState.querySelector('.glass-title').innerText = title;
    
    progressBar.style.width = '0%';
    progressText.innerText = '0%';
    uploadingState.style.display = 'block';
    successState.style.display = 'none';
    modal.classList.add('active');
}

function updateGlassProgress(percent) {
    const progressBar = document.getElementById('glass-progress-bar');
    const progressText = document.getElementById('glass-progress-text');
    if (progressBar && progressText) {
        progressBar.style.width = percent + '%';
        progressText.innerText = percent + '%';
    }
}

function showGlassSuccess(options = {}) {
    const uploadingState = document.getElementById('glass-uploading-state');
    const successState = document.getElementById('glass-success-state');
    if (!uploadingState || !successState) return;
    
    const titleEl = successState.querySelector('.glass-title');
    const subtitleEl = document.getElementById('glass-success-subtitle');
    const viewBtn = document.getElementById('glass-view-btn');
    const doneBtn = document.getElementById('glass-done-btn');
    
    titleEl.innerText = options.title || "Successfully uploaded";
    subtitleEl.innerHTML = (options.subtitle || "Your post is now live!") + ' <span class="success-checkmark">✔</span>';
    
    if (options.viewText && options.onView) {
        viewBtn.innerText = options.viewText + ' ➔';
        viewBtn.style.display = 'inline-block';
        viewBtn.onclick = () => {
            hideGlassModal();
            options.onView();
        };
    } else {
        viewBtn.style.display = 'none';
    }
    
    doneBtn.onclick = (e) => {
        e.preventDefault();
        hideGlassModal();
        if (options.onDone) options.onDone();
    };
    
    uploadingState.style.display = 'none';
    successState.style.display = 'block';
}

function hideGlassModal() {
    const modal = document.getElementById('glass-upload-modal');
    if (modal) {
        modal.classList.remove('active');
    }
}

// --- Direct Cloudinary Upload Utility ---
async function uploadFileToCloudinary(file, resourceType = "image") {
    return new Promise(async (resolve, reject) => {
        try {
            const sigRes = await fetch(`${API_BASE_URL}/cloudinary-signature`);
            const sigData = await sigRes.json();
            
            if (sigData.error) return reject(sigData.error);
            
            const formData = new FormData();
            formData.append("file", file);
            formData.append("api_key", sigData.api_key);
            formData.append("timestamp", sigData.timestamp);
            formData.append("signature", sigData.signature);
            formData.append("folder", "unichat_uploads");

            const xhr = new XMLHttpRequest();
            const uploadUrl = `https://api.cloudinary.com/v1_1/${sigData.cloud_name}/${resourceType}/upload`;
            
            xhr.open("POST", uploadUrl);
            
            xhr.upload.onprogress = (e) => {
                if (e.lengthComputable) {
                    const percent = Math.round((e.loaded / e.total) * 100);
                    updateGlassProgress(percent);
                }
            };
            
            xhr.onload = () => {
                if (xhr.status === 200) {
                    const response = JSON.parse(xhr.responseText);
                    resolve(response.secure_url);
                } else {
                    reject("Cloudinary upload failed");
                }
            };
            
            xhr.onerror = () => reject("Network error during upload");
            
            xhr.send(formData);
            
        } catch (error) {
            reject(error);
        }
    });
}
