const fs = require('fs');

let css = `
/* --- UI Style Switch (themeSwitch.html) --- */
.ui-switch {
    --ui-switch-hue: 223;
    --ui-switch-trans-dur: 0.4s;
    --ui-switch-trans-timing: cubic-bezier(0.83, 0, 0.17, 1);
    font-size: 20px; /* Adjust size to fit in settings */
    display: inline-block;
    position: relative;
    border-radius: 0.75em;
    -webkit-tap-highlight-color: transparent;
    margin: 0;
}

.ui-switch__input,
.ui-switch__scene {
    display: block;
    position: relative;
}

.ui-switch__input {
    border-radius: 0.75em;
    -webkit-tap-highlight-color: transparent;
    background-image: linear-gradient(hsl(213, 90%, 60%), hsl(193, 70%, 60%));
    box-shadow: 0 0 0 0.125em hsla(var(--ui-switch-hue), 90%, 50%, 0);
    cursor: pointer;
    outline: transparent;
    width: 3em;
    height: 1.5em;
    -webkit-appearance: none;
    appearance: none;
    transition: box-shadow 0.15s linear;
    margin: 0;
    font-size: inherit;
}

.ui-switch__input:focus-visible {
    box-shadow: 0 0 0 0.125em hsla(var(--ui-switch-hue), 90%, 50%, 1);
}

.ui-switch__input:before {
    background-color: hsl(3, 90%, 50%);
    background-image: linear-gradient(hsla(253, 90%, 50%, 1), hsla(253, 90%, 50%, 0));
    border-radius: inherit;
    content: "";
    display: block;
    opacity: 0;
    position: absolute;
    width: inherit;
    height: inherit;
    top: 0;
    left: 0;
    transition:
        background-color var(--ui-switch-trans-dur) var(--ui-switch-trans-timing),
        opacity var(--ui-switch-trans-dur) var(--ui-switch-trans-timing);
}

.ui-switch__cloud,
.ui-switch__handle,
.ui-switch__handle-side,
.ui-switch__handle-side circle,
.ui-switch__moon-hole,
.ui-switch__star,
.ui-switch__star use,
.ui-switch__stars {
    transition:
        opacity var(--ui-switch-trans-dur) var(--ui-switch-trans-timing),
        transform var(--ui-switch-trans-dur) var(--ui-switch-trans-timing);
}

.ui-switch__cloud {
    transform: translate(34px, 9px);
    transform-origin: 4.5px 4px;
}

.ui-switch__cloud:nth-child(2) {
    transform: translate(24px, 13px) scale(0.8);
    transition-delay: 0.2s;
}

.ui-switch__cloud:nth-child(3) {
    transform: translate(24px, 5px) scale(0.6);
    transition-delay: 0.1s;
}

.ui-switch__handle {
    transform: translate(12px, 12px);
}

.ui-switch__moon-hole {
    transform: translate(16px, 0);
}

.ui-switch__scene {
    pointer-events: none;
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: auto;
}

.ui-switch__star,
.ui-switch__star use {
    transform-origin: 2px 2px;
}

.ui-switch__star {
    transform: translate(28px, 14px) scale(0) rotate(20deg);
}

.ui-switch__star use {
    transform: scale(0);
}

.ui-switch__star:nth-child(2) {
    transform: translate(21px, 13px) scale(0) rotate(-20deg);
}

.ui-switch__star:nth-child(3) {
    transform: translate(17px, 10px) scale(0) rotate(20deg);
}

.ui-switch__star:nth-child(4) {
    transform: translate(24px, 6px) scale(0) rotate(-20deg);
}

.ui-switch__star:nth-child(5) {
    transform: translate(31px, 5px) scale(0) rotate(20deg);
}

.ui-switch__stars {
    opacity: 0;
}

.ui-switch__text {
    overflow: hidden;
    position: absolute;
    width: 1px;
    height: 1px;
}

.ui-switch__input:checked:before {
    background-color: hsl(223, 90%, 60%);
    opacity: 1;
}

.ui-switch__input:checked + .ui-switch__scene .ui-switch__cloud {
    opacity: 0;
    transform: translate(34px, 24px);
    transition-duration: 0.25s, var(--ui-switch-trans-dur);
    transition-delay: 0s;
}

.ui-switch__input:checked + .ui-switch__scene .ui-switch__cloud:nth-child(2) {
    transform: translate(24px, 24px) scale(0.8);
}

.ui-switch__input:checked + .ui-switch__scene .ui-switch__cloud:nth-child(3) {
    transform: translate(24px, 24px) scale(0.6);
}

.ui-switch__input:checked + .ui-switch__scene .ui-switch__handle {
    transform: translate(36px, 12px);
}

.ui-switch__input:checked + .ui-switch__scene .ui-switch__handle-side:first-child circle:nth-child(2) {
    transform: scale(0.75);
}

.ui-switch__input:checked + .ui-switch__scene .ui-switch__handle-side:nth-child(2),
.ui-switch__input:checked + .ui-switch__scene .ui-switch__stars {
    opacity: 1;
}

.ui-switch__input:checked + .ui-switch__scene .ui-switch__moon-hole {
    transform: translate(0, 0);
}

.ui-switch__input:checked + .ui-switch__scene .ui-switch__star {
    transform: translate(18px, 14px) scale(1) rotate(-20deg);
}

.ui-switch__input:checked + .ui-switch__scene .ui-switch__star use {
    transform: scale(1);
    transition:
        opacity var(--ui-switch-trans-dur) var(--ui-switch-trans-timing),
        transform 0.5s cubic-bezier(0.65, 0, 0.35, 2);
}

.ui-switch__input:checked + .ui-switch__scene .ui-switch__star:nth-child(2) {
    transform: translate(11px, 13px) scale(0.8) rotate(20deg);
}

.ui-switch__input:checked + .ui-switch__scene .ui-switch__star:nth-child(2),
.ui-switch__input:checked + .ui-switch__scene .ui-switch__star:nth-child(2) use {
    transition-delay: 0.2s;
}

.ui-switch__input:checked + .ui-switch__scene .ui-switch__star:nth-child(3) {
    transform: translate(7px, 10px) scale(0.6) rotate(-20deg);
}

.ui-switch__input:checked + .ui-switch__scene .ui-switch__star:nth-child(3),
.ui-switch__input:checked + .ui-switch__scene .ui-switch__star:nth-child(3) use {
    transition-delay: 0.05s;
}

.ui-switch__input:checked + .ui-switch__scene .ui-switch__star:nth-child(4) {
    transform: translate(14px, 6px) scale(0.6) rotate(20deg);
}

.ui-switch__input:checked + .ui-switch__scene .ui-switch__star:nth-child(4),
.ui-switch__input:checked + .ui-switch__scene .ui-switch__star:nth-child(4) use {
    transition-delay: 0.15s;
}

.ui-switch__input:checked + .ui-switch__scene .ui-switch__star:nth-child(5) {
    transform: translate(21px, 5px) scale(0.4) rotate(-20deg);
}

.ui-switch__input:checked + .ui-switch__scene .ui-switch__star:nth-child(5),
.ui-switch__input:checked + .ui-switch__scene .ui-switch__star:nth-child(5) use {
    transition-delay: 0.1s;
}

/* Pristine state */
.ui-switch--pristine,
.ui-switch--pristine *,
.ui-switch--pristine *:before {
    transition: none !important;
}
`;

let styleCSS = fs.readFileSync('frontend/style.css', 'utf8');
if (!styleCSS.includes('.ui-switch__input')) {
    fs.appendFileSync('frontend/style.css', '\\n' + css);
    console.log('Appended UI Switch CSS to style.css');
}

let html = fs.readFileSync('frontend/index.html', 'utf8');

const oldHtml = `<div class="theme-segmented-control">
                                        <div id="classic-ui-btn" class="theme-segment" onclick="setUiStyle('classic')">
                                            Classic</div>
                                        <div id="glass-ui-btn" class="theme-segment active"
                                            onclick="setUiStyle('glass')">Glass
                                        </div>
                                    </div>`;

const newHtml = `<label class="ui-switch">
                                        <input class="ui-switch__input" type="checkbox" role="switch" id="ui-style-switch" onchange="setUiStyle(this.checked ? 'glass' : 'classic')">
                                        <svg class="ui-switch__scene" viewBox="0 0 48 24" width="48px" height="24px" aria-hidden="true">
                                            <symbol id="ui-switch-cloud" viewBox="0 0 10 6">
                                                <path d="m7.5,1c-.238,0-.463.049-.675.125-.55-.681-1.381-1.125-2.325-1.125-1.13,0-2.103.633-2.614,1.556-.124-.033-.251-.056-.386-.056-.828,0-1.5.672-1.5,1.5s.672,1.5,1.5,1.5c.134,0,.262-.023.386-.056.511.924,1.484,1.556,2.614,1.556.943,0,1.775-.444,2.325-1.125.212.076.437.125.675.125,1.105,0,2-.895,2-2s-.895-2-2-2Z" />
                                            </symbol>
                                            <symbol id="ui-switch-star" viewBox="0 0 4 4">
                                                <path d="m2.277.172l.379.767c.045.091.132.154.233.169l.847.123c.253.037.355.348.171.527l-.613.597c-.073.071-.106.173-.089.273l.145.843c.043.252-.222.445-.448.326l-.757-.398c-.09-.047-.197-.047-.287,0l-.757.398c-.227.119-.491-.073-.448-.326l.145-.843c.017-.1-.016-.202-.089-.273L.094,1.758c-.183-.179-.082-.49.171-.527l.847-.123c.101-.015.188-.078.233-.169l.379-.767c.113-.23.441-.23.554,0Z" />
                                            </symbol>
                                            <defs>
                                                <linearGradient id="ui-switch-sun1" x1="0" y1="0" x2="0" y2="1">
                                                    <stop offset="0" stop-color="hsl(18,90%,50%)" />
                                                    <stop offset="1" stop-color="hsl(43,90%,50%)" />
                                                </linearGradient>
                                                <linearGradient id="ui-switch-sun2" x1="0" y1="0" x2="0" y2="1">
                                                    <stop offset="0" stop-color="hsl(43,90%,50%)" />
                                                    <stop offset="1" stop-color="hsl(33,90%,50%)" />
                                                </linearGradient>
                                                <linearGradient id="ui-switch-moon1" x1="0" y1="0" x2="0" y2="1">
                                                    <stop offset="0" stop-color="hsl(213,90%,95%)" />
                                                    <stop offset="1" stop-color="hsl(213,90%,85%)" />
                                                </linearGradient>
                                                <linearGradient id="ui-switch-moon2" x1="0" y1="0" x2="0" y2="1">
                                                    <stop offset="0" stop-color="hsla(213,90%,95%,0)" />
                                                    <stop offset="1" stop-color="hsla(213,90%,95%,1)" />
                                                </linearGradient>
                                                <linearGradient id="ui-switch-moon3" x1="0" y1="0" x2="0" y2="1">
                                                    <stop offset="0" stop-color="hsla(213,90%,75%,1)" />
                                                    <stop offset="1" stop-color="hsla(213,90%,75%,0)" />
                                                </linearGradient>
                                                <linearGradient id="ui-switch-cloud1" x1="0" y1="0" x2="0" y2="1">
                                                    <stop offset="0" stop-color="hsla(0,0%,100%,1)" />
                                                    <stop offset="1" stop-color="hsla(0,0%,100%,0)" />
                                                </linearGradient>
                                            </defs>
                                            <g class="ui-switch__stars" fill="hsl(213,90%,95%)">
                                                <g class="ui-switch__star" transform="translate(28,14) scale(0)">
                                                    <use href="#ui-switch-star" width="4px" height="4px" />
                                                </g>
                                                <g class="ui-switch__star" transform="translate(21,13) scale(0)">
                                                    <use href="#ui-switch-star" width="4px" height="4px" />
                                                </g>
                                                <g class="ui-switch__star" transform="translate(17,10) scale(0)">
                                                    <use href="#ui-switch-star" width="4px" height="4px" />
                                                </g>
                                                <g class="ui-switch__star" transform="translate(24,6) scale(0)">
                                                    <use href="#ui-switch-star" width="4px" height="4px" />
                                                </g>
                                                <g class="ui-switch__star" transform="translate(31,5) scale(0)">
                                                    <use href="#ui-switch-star" width="4px" height="4px" />
                                                </g>
                                            </g>
                                            <g class="ui-switch__handle" transform="translate(12,12)">
                                                <g class="ui-switch__handle-side">
                                                    <circle r="8" fill="url(#ui-switch-sun1)" />
                                                    <circle r="6.5" fill="url(#ui-switch-sun2)" />
                                                </g>
                                                <g class="ui-switch__handle-side" opacity="0">
                                                    <circle r="8" fill="url(#ui-switch-moon1)" />
                                                    <circle r="6.5" fill="url(#ui-switch-moon2)" />
                                                    <clipPath id="ui-switch-moon-clip">
                                                        <circle class="ui-switch__moon-hole" r="1.5" cx="-6" cy="2" />
                                                        <circle class="ui-switch__moon-hole" r="1.5" cx="-1" cy="3" />
                                                        <circle class="ui-switch__moon-hole" r="2" cx="-1" cy="8" />
                                                        <circle class="ui-switch__moon-hole" r="1" cx="2" cy="0" />
                                                        <circle class="ui-switch__moon-hole" r="5" cx="8" cy="6" />
                                                    </clipPath>
                                                    <circle r="8" fill="url(#ui-switch-moon3)" clip-path="url(#ui-switch-moon-clip)" />
                                                </g>
                                            </g>
                                            <g fill="url(#ui-switch-cloud1)">
                                                <use class="ui-switch__cloud" href="#ui-switch-cloud" width="10" height="6" transform="translate(34,9)" />
                                                <use class="ui-switch__cloud" href="#ui-switch-cloud" width="10" height="6" transform="translate(24,13) scale(0.8)" />
                                                <use class="ui-switch__cloud" href="#ui-switch-cloud" width="10" height="6" transform="translate(24,5) scale(0.6)" />
                                            </g>
                                        </svg>
                                        <span class="ui-switch__text">UI Style</span>
                                    </label>`;

if (html.includes(oldHtml)) {
    html = html.replace(oldHtml, newHtml);
    html = html.replace(/style\.css\?v=\d+/g, 'style.css?v=83');
    html = html.replace(/app\.js\?v=\d+/g, 'app.js?v=81');
    fs.writeFileSync('frontend/index.html', html);
    console.log('Replaced UI style switch in index.html');
}

// Update app.js to sync the ui-style-switch
let app = fs.readFileSync('frontend/app.js', 'utf8');

const oldAppLogic = `window.setUiStyle = function(style) {
    const isGlass = style === 'glass';
    const stylesheet = document.getElementById('ui-style-stylesheet');
    const glassBtn = document.getElementById('glass-ui-btn');
    const classicBtn = document.getElementById('classic-ui-btn');

    if (isGlass) {
        stylesheet.href = 'glass.css?v=' + Date.now();
        localStorage.setItem('uiStyle', 'glass');
        if (glassBtn && classicBtn) {
            glassBtn.classList.add('active');
            classicBtn.classList.remove('active');
        }
    } else {
        stylesheet.href = 'classic.css?v=' + Date.now();
        localStorage.setItem('uiStyle', 'classic');
        if (glassBtn && classicBtn) {
            classicBtn.classList.add('active');
            glassBtn.classList.remove('active');
        }
    }
}`;

const newAppLogic = `window.setUiStyle = function(style) {
    const isGlass = style === 'glass';
    const stylesheet = document.getElementById('ui-style-stylesheet');
    const uiStyleSwitch = document.getElementById('ui-style-switch');

    if (isGlass) {
        stylesheet.href = 'glass.css?v=' + Date.now();
        localStorage.setItem('uiStyle', 'glass');
    } else {
        stylesheet.href = 'classic.css?v=' + Date.now();
        localStorage.setItem('uiStyle', 'classic');
    }
    
    if (uiStyleSwitch) {
        // Prevent transitions on initial load
        if (uiStyleSwitch.dataset.pristine !== 'false') {
            uiStyleSwitch.parentElement.classList.add('ui-switch--pristine');
        }
        uiStyleSwitch.checked = isGlass;
        
        // Remove pristine class after small delay so future changes animate
        setTimeout(() => {
            uiStyleSwitch.parentElement.classList.remove('ui-switch--pristine');
            uiStyleSwitch.dataset.pristine = 'false';
        }, 50);
    }
}`;

if (app.includes('window.setUiStyle = function(style) {')) {
    // using regex because the spaces might differ
    app = app.replace(/window\.setUiStyle\s*=\s*function\(style\)\s*\{[\s\S]*?(?=\}\n)/, newAppLogic);
    // actually, let's just do a manual replace using the function body bounds
}

