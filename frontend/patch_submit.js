const fs = require('fs');
let css = fs.readFileSync('frontend/glass.css', 'utf8');
css = css.replace(/\.comment-submit\s*{[^}]+}/, `.comment-submit {
    background: var(--primary-color) !important;
    color: #ffffff !important;
    border: none !important;
    border-radius: 50% !important;
}`);
fs.writeFileSync('frontend/glass.css', css);

let html = fs.readFileSync('frontend/index.html', 'utf8');
html = html.replace(/style\.css\?v=\d+/g, 'style.css?v=82');
html = html.replace(/glass\.css\?v=\d+/g, 'glass.css?v=2');
fs.writeFileSync('frontend/index.html', html);
