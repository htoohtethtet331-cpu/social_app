const fs = require('fs');

// 1. Refactor style.css and create glass.css
let css = fs.readFileSync('frontend/style.css', 'utf8');

const auroraStart = css.indexOf('/* Beautiful Animated Aurora Background Effect */');
const auroraEnd = css.indexOf('.app-container {'); // right after aurora
let auroraCss = '';
if (auroraStart !== -1 && auroraEnd !== -1) {
    auroraCss = css.substring(auroraStart, auroraEnd);
    css = css.substring(0, auroraStart) + css.substring(auroraEnd);
}

const glassOverridesStart = css.indexOf('/* =========================================\n   APPLE GLASS UI (GLASSMORPHISM) OVERRIDES\n   ========================================= */');
let glassOverridesCss = '';
if (glassOverridesStart !== -1) {
    glassOverridesCss = css.substring(glassOverridesStart);
    css = css.substring(0, glassOverridesStart);
}

// Write style.css
fs.writeFileSync('frontend/style.css', css);

// Write glass.css
fs.writeFileSync('frontend/glass.css', auroraCss + '\n' + glassOverridesCss);
console.log('glass.css created and removed from style.css');

// 2. Patch index.html
let html = fs.readFileSync('frontend/index.html', 'utf8');

// Add glass.css link
const linkTag = '<link rel="stylesheet" href="style.css?v=73">';
const newLinkTag = '<link rel="stylesheet" href="style.css?v=74">\n    <link id="glass-theme-stylesheet" rel="stylesheet" href="glass.css?v=1">';
if (!html.includes('glass-theme-stylesheet')) {
    html = html.replace(linkTag, newLinkTag);
}

// Add toggle button in Settings
const themeHtml = `                                <div class="settings-action">
                                    <div class="theme-segmented-control">
                                        <div id="light-mode-btn" class="theme-segment active"
                                            onclick="setTheme('light')">Light</div>
                                        <div id="dark-mode-btn" class="theme-segment" onclick="setTheme('dark')">Dark
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>`;
const newThemeHtml = themeHtml + `
                        <div class="settings-card" style="margin-top: 15px;">
                            <div class="settings-row" style="cursor: default;">
                                <div class="settings-icon-wrapper"
                                    style="background: rgba(255, 45, 85, 0.1); color: #ff2d55;">
                                    <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
                                        <path d="M22 16.5h-2.18c-.34-.99-.86-1.89-1.5-2.66l1.54-1.54L18.44 11l-1.54 1.54c-.78-.65-1.68-1.17-2.67-1.51V8.86h-2v2.18c-.99.34-1.89.86-2.67 1.51L8 11 6.58 12.42l1.54 1.54c-.65.78-1.17 1.68-1.51 2.67H4.42v2h2.18c.34.99.86 1.89 1.5 2.66l-1.54 1.54L8 24.24l1.54-1.54c.78.65 1.68 1.17 2.67 1.51V26.4h2v-2.18c.99-.34 1.89-.86 2.67-1.51l1.54 1.54 1.42-1.42-1.54-1.54c.65-.78 1.17-1.68 1.51-2.67h2.18v-2zm-10.5 4.5c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5z" />
                                    </svg>
                                </div>
                                <div class="settings-info">
                                    <h4>UI Style</h4>
                                    <p>Glass or Classic UI</p>
                                </div>
                                <div class="settings-action">
                                    <div class="theme-segmented-control">
                                        <div id="classic-ui-btn" class="theme-segment"
                                            onclick="setUiStyle('classic')">Classic</div>
                                        <div id="glass-ui-btn" class="theme-segment active" onclick="setUiStyle('glass')">Glass
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>`;
if (!html.includes('UI Style')) {
    html = html.replace(themeHtml, newThemeHtml);
}
fs.writeFileSync('frontend/index.html', html);
console.log('index.html patched');

// 3. Patch app.js
let app = fs.readFileSync('frontend/app.js', 'utf8');
const themeLogic = `function setTheme(theme) {
    const isDark = theme === 'dark';
    if (isDark) {
        document.body.classList.add('dark-mode');
        document.getElementById('dark-mode-btn').classList.add('active');
        document.getElementById('light-mode-btn').classList.remove('active');
    } else {
        document.body.classList.remove('dark-mode');
        document.getElementById('light-mode-btn').classList.add('active');
        document.getElementById('dark-mode-btn').classList.remove('active');
    }
    localStorage.setItem('theme', theme);
}`;

const newThemeLogic = themeLogic + `

// UI Style Logic
function setUiStyle(style) {
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
}
`;

if (!app.includes('function setUiStyle')) {
    app = app.replace(themeLogic, newThemeLogic);
    
    // Add initialization logic
    const initLogic = `    // Init theme
    const savedTheme = localStorage.getItem('theme') || 'light';
    setTheme(savedTheme);`;
    const newInitLogic = `    // Init theme
    const savedTheme = localStorage.getItem('theme') || 'light';
    setTheme(savedTheme);
    
    // Init UI Style
    const savedUiStyle = localStorage.getItem('uiStyle') || 'glass';
    setUiStyle(savedUiStyle);`;
    app = app.replace(initLogic, newInitLogic);
}

fs.writeFileSync('frontend/app.js', app);
console.log('app.js patched');
