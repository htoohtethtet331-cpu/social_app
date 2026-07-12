const fs = require('fs');

let app = fs.readFileSync('frontend/app.js', 'utf8');

const oldLogic = `// UI Style Logic
window.setUiStyle = function(style) {
    const isGlass = style === 'glass';
    const glassLink = document.getElementById('glass-theme-stylesheet');
    
    if (isGlass) {
        if (!glassLink) {
            const link = document.createElement('link');
            link.id = 'glass-theme-stylesheet';
            link.rel = 'stylesheet';
            link.href = 'glass.css?v=' + Date.now();
            document.head.appendChild(link);
        }
        document.getElementById('glass-ui-btn').classList.add('active');
        document.getElementById('classic-ui-btn').classList.remove('active');
    } else {
        if (glassLink) {
            glassLink.remove();
        }
        document.getElementById('classic-ui-btn').classList.add('active');
        document.getElementById('glass-ui-btn').classList.remove('active');
    }
    localStorage.setItem('uiStyle', style);
}`;

const newLogic = `// UI Style Logic
window.setUiStyle = function(style) {
    const isGlass = style === 'glass';
    let themeLink = document.getElementById('ui-style-stylesheet');
    
    if (!themeLink) {
        themeLink = document.createElement('link');
        themeLink.id = 'ui-style-stylesheet';
        themeLink.rel = 'stylesheet';
        document.head.appendChild(themeLink);
    }
    
    if (isGlass) {
        themeLink.href = 'glass.css?v=' + Date.now();
        document.getElementById('glass-ui-btn').classList.add('active');
        document.getElementById('classic-ui-btn').classList.remove('active');
    } else {
        themeLink.href = 'classic.css?v=' + Date.now();
        document.getElementById('classic-ui-btn').classList.add('active');
        document.getElementById('glass-ui-btn').classList.remove('active');
    }
    localStorage.setItem('uiStyle', style);
}`;

if (app.includes('window.setUiStyle')) {
    app = app.replace(oldLogic, newLogic);
    fs.writeFileSync('frontend/app.js', app);
    console.log('app.js patched');
} else {
    console.log('Failed to patch app.js - target string not found');
}

let html = fs.readFileSync('frontend/index.html', 'utf8');
html = html.replace(/<link id="glass-theme-stylesheet".*?>/g, '<link id="ui-style-stylesheet" rel="stylesheet" href="glass.css?v=1">');
fs.writeFileSync('frontend/index.html', html);
console.log('index.html patched');

