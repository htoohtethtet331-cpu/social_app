const fs = require('fs');

let css = fs.readFileSync('frontend/glass.css', 'utf8');

// Replace Aurora completely
const auroraRegex = /body::before\s*{[^}]+}\s*@keyframes aurora\s*{[^}]+}/s;
const auroraReplacement = `body::before {
    content: '';
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    /* Light Mode Aurora */
    background: radial-gradient(circle at 50% 50%, rgba(74, 144, 226, 0.2), transparent 50%),
        radial-gradient(circle at 80% 20%, rgba(255, 105, 180, 0.15), transparent 50%),
        radial-gradient(circle at 20% 80%, rgba(255, 215, 0, 0.15), transparent 50%);
    animation: aurora 20s linear infinite alternate;
    z-index: -1;
}

body.dark-mode::before {
    /* Dark Mode Aurora */
    background: radial-gradient(circle at 50% 50%, rgba(74, 144, 226, 0.15), transparent 50%),
        radial-gradient(circle at 80% 20%, rgba(255, 59, 48, 0.1), transparent 50%),
        radial-gradient(circle at 20% 80%, rgba(52, 199, 89, 0.1), transparent 50%);
}

@keyframes aurora {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
}`;

css = css.replace(/body::before\s*\{[\s\S]*?@keyframes aurora\s*\{[\s\S]*?\}/, auroraReplacement);

// We need to replace hardcoded colors with our new variables
// 1. Text colors
css = css.replace(/color:\s*#(fff|ffffff)\s*!important;/g, "color: var(--text-color) !important;");
css = css.replace(/color:\s*#(fff|ffffff);/g, "color: var(--text-color);");

// EXCEPT for .btn-primary, .btn-secondary where we want white text always (or let's just restore them manually after)
css = css.replace(/\.btn-primary\s*{[^}]+}/, `.btn-primary {
    background: var(--primary-color) !important;
    color: #ffffff !important;
    border: none !important;
    border-radius: 20px !important;
    font-weight: 600;
}`);
css = css.replace(/\.btn-secondary\s*{[^}]+}/, `.btn-secondary {
    background: var(--glass-bg) !important;
    color: var(--text-color) !important;
    border: 1px solid var(--glass-border) !important;
    border-radius: 20px !important;
}`);

// 2. Backgrounds
// .post-item etc. background: rgba(255, 255, 255, 0.1) !important -> var(--glass-bg)
// Already uses var(--glass-bg) and var(--glass-border) for main containers!
// Let's check:
// .post-item, .create-post-section ... { background: var(--glass-bg) !important; ... } -> ALREADY DONE!

// But inputs use rgba(0, 0, 0, 0.3)
css = css.replace(/background:\s*rgba\(0,\s*0,\s*0,\s*0\.3\)\s*!important;/g, "background: var(--glass-input-bg) !important;");
css = css.replace(/border:\s*1px solid rgba\(255,\s*255,\s*255,\s*0\.2\)\s*!important;/g, "border: 1px solid var(--glass-input-border) !important;");

// Search bar input wrapper
css = css.replace(/background:\s*rgba\(255,\s*255,\s*255,\s*0\.1\)\s*!important;/g, "background: var(--glass-input-bg) !important;");

// Placeholders
css = css.replace(/color:\s*rgba\(255,\s*255,\s*255,\s*0\.5\)\s*!important;/g, "color: var(--glass-placeholder) !important;");

// Notification item thicker glass
css = css.replace(/background:\s*rgba\(255,\s*255,\s*255,\s*0\.15\)\s*!important;/g, "background: var(--glass-bg) !important;");

// Stat box
css = css.replace(/\.stat-box\s*{[^}]+}/, `.stat-box {
    background: var(--glass-bg) !important;
    border: 1px solid var(--glass-border) !important;
    border-radius: 12px !important;
    color: var(--text-color) !important;
}`);

fs.writeFileSync('frontend/glass.css', css);
console.log('glass.css patched for light/dark mode');
