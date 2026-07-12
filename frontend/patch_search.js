const fs = require('fs');

// 1. Update style.css
let css = fs.readFileSync('frontend/style.css', 'utf8');
const searchCss = `
/* --- Search Bar Glass UI --- */
#search-bar-container {
    background: var(--glass-bg) !important;
    backdrop-filter: var(--glass-blur) !important;
    -webkit-backdrop-filter: var(--glass-blur) !important;
    border-bottom: 1px solid var(--glass-border) !important;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1) !important;
    margin-bottom: 10px;
    border-radius: 0 0 16px 16px;
}

#search-bar-container .search-input-wrapper {
    background: rgba(255, 255, 255, 0.1) !important;
    border: 1px solid rgba(255, 255, 255, 0.2) !important;
    box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.05);
}

[data-theme='dark'] #search-bar-container .search-input-wrapper {
    background: rgba(0, 0, 0, 0.2) !important;
    border: 1px solid rgba(255, 255, 255, 0.05) !important;
    box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.2);
}

#search-suggestions {
    background: var(--glass-bg) !important;
    backdrop-filter: var(--glass-blur) !important;
    -webkit-backdrop-filter: var(--glass-blur) !important;
    border: 1px solid var(--glass-border) !important;
    box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.15) !important;
    border-radius: 12px !important;
    top: calc(100% + 5px) !important;
}

.suggestion-item {
    padding: 12px 15px;
    border-bottom: 1px solid var(--glass-border);
    cursor: pointer;
    color: var(--text-color);
}
.suggestion-item:last-child {
    border-bottom: none;
}
.suggestion-item:hover {
    background: rgba(255, 255, 255, 0.1);
}
[data-theme='dark'] .suggestion-item:hover {
    background: rgba(255, 255, 255, 0.05);
}
`;
if (!css.includes('/* --- Search Bar Glass UI --- */')) {
    fs.appendFileSync('frontend/style.css', '\\n' + searchCss);
}

// 2. Update index.html
let html = fs.readFileSync('frontend/index.html', 'utf8');
const oldHtml = `        <!-- Search Bar Container -->
        <div id="search-bar-container"
            style="display: none; padding: 10px 15px; background: var(--bg-color); border-bottom: 1px solid var(--border-color); position: relative; z-index: 100;">
            <div style="display: flex; gap: 5px; align-items: center;">
                <button onclick="toggleSearch()"
                    style="background: none; border: none; color: var(--text-color); cursor: pointer; padding: 0; display: flex; align-items: center;">
                    <svg viewBox="0 0 24 24" width="28" height="28" fill="currentColor">
                        <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z" />
                    </svg>
                </button>
                <div
                    style="flex: 1; display: flex; align-items: center; background: var(--comment-bg, #f0f2f5); border-radius: 8px; padding: 6px 12px; gap: 8px;">
                    <svg viewBox="0 0 24 24" width="20" height="20" fill="var(--secondary-color)">
                        <path
                            d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z" />
                    </svg>
                    <input type="text" id="search-input" placeholder="Search..."
                        style="flex: 1; border: none; background: transparent; color: var(--text-color); outline: none; font-size: 1rem; caret-color: var(--like-color);">
                </div>
                <button onclick="performSearch(document.getElementById('search-input').value)"
                    style="background: none; border: none; color: var(--primary-color); font-weight: 600; font-size: 1rem; cursor: pointer; padding: 0; margin-right: 5px;">Search</button>
            </div>
            <!-- Suggestions Dropdown -->
            <div id="search-suggestions"
                style="display: none; position: absolute; top: 100%; left: 10px; right: 10px; background: var(--white); border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.2); margin-top: 5px; z-index: 101; max-height: 250px; overflow-y: auto;">
                <!-- Filled by JS -->
            </div>
        </div>`;
const newHtml = `        <!-- Search Bar Container -->
        <div id="search-bar-container"
            style="display: none; padding: 10px 15px; position: relative; z-index: 100;">
            <div style="display: flex; gap: 5px; align-items: center;">
                <button onclick="toggleSearch()"
                    style="background: none; border: none; color: var(--text-color); cursor: pointer; padding: 0; display: flex; align-items: center;">
                    <svg viewBox="0 0 24 24" width="28" height="28" fill="currentColor">
                        <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z" />
                    </svg>
                </button>
                <div class="search-input-wrapper"
                    style="flex: 1; display: flex; align-items: center; border-radius: 12px; padding: 8px 12px; gap: 8px;">
                    <svg viewBox="0 0 24 24" width="20" height="20" fill="var(--text-color)" style="opacity: 0.7;">
                        <path
                            d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z" />
                    </svg>
                    <input type="text" id="search-input" placeholder="Search..."
                        style="flex: 1; border: none; background: transparent; color: var(--text-color); outline: none; font-size: 1rem; caret-color: var(--like-color);">
                </div>
                <button onclick="performSearch(document.getElementById('search-input').value)"
                    style="background: none; border: none; color: var(--primary-color); font-weight: 600; font-size: 1rem; cursor: pointer; padding: 0; margin-left: 5px;">Search</button>
            </div>
            <!-- Suggestions Dropdown -->
            <div id="search-suggestions"
                style="display: none; position: absolute; left: 10px; right: 10px; z-index: 101; max-height: 250px; overflow-y: auto;">
                <!-- Filled by JS -->
            </div>
        </div>`;
html = html.replace(oldHtml, newHtml);

// Bump version
html = html.replace(/<link rel="stylesheet" href="style.css\?v=[0-9]+">/, '<link rel="stylesheet" href="style.css?v=' + Date.now() + '">');
fs.writeFileSync('frontend/index.html', html);
console.log('Search glass UI patched!');
