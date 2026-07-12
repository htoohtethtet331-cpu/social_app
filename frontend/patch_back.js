const fs = require('fs');
let app = fs.readFileSync('frontend/app.js', 'utf8');

// 1. Remove the old `isDrawerOpen` block
app = app.replace(/let isDrawerOpen = false;[\s\S]*?(?=\/\/ Notifications Drawer Logic)/, '');

// 2. Insert the unified State Manager
const unifiedLogic = `
let isDrawerOpen = false;
let isCommentsOpen = false;
let isUsersListOpen = false;

window.updateTelegramBackButton = function() {
    if (window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.BackButton) {
        if (isDrawerOpen || isCommentsOpen || isUsersListOpen) {
            window.Telegram.WebApp.BackButton.show();
        } else {
            window.Telegram.WebApp.BackButton.hide();
        }
    }
};

window.addEventListener('popstate', (e) => {
    if (isUsersListOpen) {
        isUsersListOpen = false;
        document.getElementById('users-list-modal').classList.remove('active');
        updateTelegramBackButton();
    } else if (isCommentsOpen) {
        isCommentsOpen = false;
        const sheet = document.getElementById('comments-sheet');
        const sheetOverlay = document.getElementById('comments-sheet-overlay');
        if(sheet) {
            sheet.style.transform = '';
            sheet.classList.remove('open');
        }
        setTimeout(() => {
            if(sheetOverlay) sheetOverlay.style.display = 'none';
            if(document.getElementById('sheet-comments-list')) document.getElementById('sheet-comments-list').innerHTML = '';
            if(typeof cancelReply === 'function') cancelReply();
        }, 300);
        updateTelegramBackButton();
    } else if (isDrawerOpen) {
        isDrawerOpen = false;
        const drawer = document.getElementById('notifications-drawer');
        const backdrop = document.getElementById('notifications-backdrop');
        if (drawer) drawer.classList.remove('active');
        if (backdrop) backdrop.classList.remove('active');
        updateTelegramBackButton();
    }
});

if (window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.BackButton) {
    window.Telegram.WebApp.BackButton.onClick(() => {
        if (isDrawerOpen || isCommentsOpen || isUsersListOpen) {
            history.back();
        }
    });
}
`;
app = app.replace('// Navigation Functions', unifiedLogic + '\n// Navigation Functions');

// 3. Update toggleNotificationsDrawer
app = app.replace(/function toggleNotificationsDrawer\(\) \{[\s\S]*?(?=\}\n\nasync function loadAllUsers)/, `function toggleNotificationsDrawer() {
    const drawer = document.getElementById('notifications-drawer');
    const backdrop = document.getElementById('notifications-backdrop');
    if (drawer.classList.contains('active')) {
        drawer.classList.remove('active');
        backdrop.classList.remove('active');
        
        if (isDrawerOpen) {
            isDrawerOpen = false;
            history.back();
        }
        updateTelegramBackButton();
    } else {
        drawer.classList.add('active');
        backdrop.classList.add('active');
        
        if (!isDrawerOpen) {
            history.pushState({drawer: true}, '');
            isDrawerOpen = true;
        }
        updateTelegramBackButton();
        
        if (typeof isNotificationsLoaded !== 'undefined' && !isNotificationsLoaded) {
            loadNotifications();
            markNotificationsRead();
            isNotificationsLoaded = true;
        }
    }
}`);

// 4. Update openCommentsBottomSheet
app = app.replace(/async function openCommentsBottomSheet\(postId\) \{([\s\S]*?)sheetCommentsList\.innerHTML = '<div class="cat-loader-container">/, `async function openCommentsBottomSheet(postId) {
    if (!isCommentsOpen) {
        history.pushState({comments: true}, '');
        isCommentsOpen = true;
    }
    updateTelegramBackButton();
$1sheetCommentsList.innerHTML = '<div class="cat-loader-container">`);

// 5. Update closeCommentsBottomSheet
app = app.replace(/function closeCommentsBottomSheet\(\) \{([\s\S]*?)cancelReply\(\);\n    \}, 300\);\n\}/, `function closeCommentsBottomSheet() {$1cancelReply();
    }, 300);
    if (isCommentsOpen) {
        isCommentsOpen = false;
        history.back();
    }
    updateTelegramBackButton();
}`);

// 6. Update openUsersListModal
app = app.replace(/async function openUsersListModal\(type, userId\) \{([\s\S]*?)modal\.classList\.add\('active'\);/, `async function openUsersListModal(type, userId) {
    if (!isUsersListOpen) {
        history.pushState({usersList: true}, '');
        isUsersListOpen = true;
    }
    updateTelegramBackButton();
$1modal.classList.add('active');`);

// 7. Add global closeUsersListModal function
app += `

window.closeUsersListModal = function() {
    document.getElementById('users-list-modal').classList.remove('active');
    if (isUsersListOpen) {
        isUsersListOpen = false;
        history.back();
    }
    updateTelegramBackButton();
};
`;

fs.writeFileSync('frontend/app.js', app);

// Update index.html
let html = fs.readFileSync('frontend/index.html', 'utf8');
html = html.replace(/onclick="document\.getElementById\('users-list-modal'\)\.classList\.remove\('active'\)"/g, 'onclick="closeUsersListModal()"');
fs.writeFileSync('frontend/index.html', html);

console.log("Patch applied successfully!");
