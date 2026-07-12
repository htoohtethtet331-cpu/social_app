const fs = require('fs');

// 1. Appending to style.css
let css = fs.readFileSync('frontend/style.css', 'utf8');
const switchCSS = `
/* --- Animated Theme Switch --- */
.switch {
    --switch-hue: 223;
    --switch-trans-dur: 0.3s;
    --switch-trans-timing: cubic-bezier(0.76, 0.05, 0.24, 0.95);
    --switch-trans-timing-in: cubic-bezier(0.76, 0.05, 0.86, 0.06);
    --switch-trans-timing-out: cubic-bezier(0.05, 0.76, 0.06, 0.86);
    position: relative;
    font-size: 20px; /* Made it slightly bigger to match UI */
    display: inline-block;
}

.switch__icon,
.switch__input {
    display: block;
}

.switch__icon {
    position: absolute;
    top: 0.375em;
    right: 0.375em;
    width: 0.75em;
    height: 0.75em;
    transition:
        opacity calc(var(--switch-trans-dur) / 2),
        transform calc(var(--switch-trans-dur) / 2);
    pointer-events: none;
}

.switch__icon polyline {
    transition: stroke-dashoffset calc(var(--switch-trans-dur) / 2);
}

.switch__icon--light,
.switch__icon--light polyline {
    transition-delay: calc(var(--switch-trans-dur) / 2);
    transition-timing-function: var(--switch-trans-timing-out);
}

.switch__icon--dark {
    opacity: 0;
    transform: translateX(-0.75em) rotate(30deg) scale(0.75);
    transition-timing-function: var(--switch-trans-timing-in);
}

.switch__input {
    background-color: hsl(210, 90%, 70%);
    border-radius: 0.75em;
    box-shadow:
        0 0 0 0.125em hsla(var(--switch-hue), 90%, 50%, 0),
        0.125em 0.125em 0.25em hsla(var(--switch-hue), 90%, 10%, 0.2);
    outline: transparent;
    position: relative;
    width: 3em;
    height: 1.5em;
    -webkit-appearance: none;
    appearance: none;
    -webkit-tap-highlight-color: transparent;
    transition:
        background-color var(--switch-trans-dur) var(--switch-trans-timing),
        box-shadow 0.15s linear;
    cursor: pointer;
    margin: 0;
}

.switch__input:focus-visible {
    box-shadow:
        0 0 0 0.125em hsl(var(--switch-hue), 90%, 50%),
        0.125em 0.125em 0.25em hsla(var(--switch-hue), 90%, 10%, 0.2);
}

.switch__input:before,
.switch__input:after {
    content: "";
    display: block;
    position: absolute;
}

.switch__input:before {
    background-color: hsl(50, 90%, 50%);
    border-radius: inherit;
    mask-image: linear-gradient(120deg, hsl(0, 0%, 0%) 20%, hsla(0, 0%, 0%, 0) 80%);
    -webkit-mask-image: linear-gradient(120deg, hsl(0, 0%, 0%) 20%, hsla(0, 0%, 0%, 0) 80%);
    inset: 0;
    transition: background-color var(--switch-trans-dur) var(--switch-trans-timing);
}

.switch__input:after {
    background-color: hsl(0, 0%, 100%);
    border-radius: 50%;
    box-shadow: 0.05em 0.05em 0.05em hsla(var(--switch-hue), 90%, 10%, 0.1);
    top: 0.125em;
    left: 0.125em;
    width: 1.25em;
    height: 1.25em;
    transition:
        background-color var(--switch-trans-dur) var(--switch-trans-timing),
        transform var(--switch-trans-dur) var(--switch-trans-timing);
    z-index: 1;
}

.switch__input:checked {
    background-color: hsl(290, 90%, 40%);
}

.switch__input:checked:before {
    background-color: hsl(220, 90%, 40%);
}

.switch__input:checked:after {
    background-color: hsl(0, 0%, 0%);
    transform: translateX(1.5em);
}

.switch__input:checked~.switch__icon--light,
.switch__input:checked~.switch__icon--light polyline {
    transition-delay: 0s;
    transition-timing-function: var(--switch-trans-timing-in);
}

.switch__input:checked~.switch__icon--light {
    opacity: 0;
    transform: translateX(-0.75em) rotate(-30deg) scale(0.75);
}

.switch__input:checked~.switch__icon--light polyline {
    stroke-dashoffset: 1.5;
}

.switch__input:checked~.switch__icon--dark {
    opacity: 1;
    transform: translateX(-1.5em);
    transition-delay: calc(var(--switch-trans-dur) / 2);
    transition-timing-function: var(--switch-trans-timing-out);
}

.switch__sr {
    overflow: hidden;
    position: absolute;
    width: 1px;
    height: 1px;
}
`;
if (!css.includes('.switch__input:checked:after')) {
    fs.appendFileSync('frontend/style.css', switchCSS);
    console.log('style.css patched with switch CSS');
}

// 2. Patching index.html
let html = fs.readFileSync('frontend/index.html', 'utf8');
const oldThemeHtml = `<div class="theme-segmented-control">
                                        <div id="light-mode-btn" class="theme-segment active"
                                            onclick="setTheme('light')">Light</div>
                                        <div id="dark-mode-btn" class="theme-segment" onclick="setTheme('dark')">Dark
                                        </div>
                                    </div>`;
const newThemeHtml = `<label class="switch">
                                        <input class="switch__input" type="checkbox" role="switch" id="theme-switch" onchange="setTheme(this.checked ? 'dark' : 'light')">
                                        <svg class="switch__icon switch__icon--light" viewBox="0 0 12 12" width="12px" height="12px" aria-hidden="true">
                                            <g fill="none" stroke="#fff" stroke-width="1" stroke-linecap="round">
                                                <circle cx="6" cy="6" r="2" />
                                                <g stroke-dasharray="1.5 1.5">
                                                    <polyline points="6 10,6 11.5" transform="rotate(0,6,6)" />
                                                    <polyline points="6 10,6 11.5" transform="rotate(45,6,6)" />
                                                    <polyline points="6 10,6 11.5" transform="rotate(90,6,6)" />
                                                    <polyline points="6 10,6 11.5" transform="rotate(135,6,6)" />
                                                    <polyline points="6 10,6 11.5" transform="rotate(180,6,6)" />
                                                    <polyline points="6 10,6 11.5" transform="rotate(225,6,6)" />
                                                    <polyline points="6 10,6 11.5" transform="rotate(270,6,6)" />
                                                    <polyline points="6 10,6 11.5" transform="rotate(315,6,6)" />
                                                </g>
                                            </g>
                                        </svg>
                                        <svg class="switch__icon switch__icon--dark" viewBox="0 0 12 12" width="12px" height="12px" aria-hidden="true">
                                            <g fill="none" stroke="#fff" stroke-width="1" stroke-linejoin="round" transform="rotate(-45,6,6)">
                                                <path d="m9,10c-2.209,0-4-1.791-4-4s1.791-4,4-4c.304,0,.598.041.883.105-.995-.992-2.367-1.605-3.883-1.605C2.962.5.5,2.962.5,6s2.462,5.5,5.5,5.5c1.516,0,2.888-.613,3.883-1.605-.285.064-.578.105-.883.105Z" />
                                            </g>
                                        </svg>
                                        <span class="switch__sr">Dark Mode</span>
                                    </label>`;
if (html.includes(oldThemeHtml)) {
    html = html.replace(oldThemeHtml, newThemeHtml);
    fs.writeFileSync('frontend/index.html', html);
    console.log('index.html patched with switch HTML');
}

// 3. Patching app.js
let app = fs.readFileSync('frontend/app.js', 'utf8');
const oldThemeLogic = `function setTheme(mode) {
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
}`;
const newThemeLogic = `function setTheme(mode) {
    const isDark = mode === 'dark';
    if (isDark) {
        document.body.classList.add('dark-mode');
        localStorage.setItem('theme', 'dark');
    } else {
        document.body.classList.remove('dark-mode');
        localStorage.setItem('theme', 'light');
    }
    
    // Update the switch UI if it exists
    const themeSwitch = document.getElementById('theme-switch');
    if (themeSwitch) {
        themeSwitch.checked = isDark;
    }
}`;
if (app.includes('document.getElementById(\'dark-mode-btn\')')) {
    app = app.replace(oldThemeLogic, newThemeLogic);
    fs.writeFileSync('frontend/app.js', app);
    console.log('app.js patched for switch UI');
} else if (app.includes('function setTheme(theme) {')) {
    // Wait, earlier I might have changed it to `function setTheme(theme)`? 
    // Let's use a regex to replace setTheme completely if the string replace fails.
}
