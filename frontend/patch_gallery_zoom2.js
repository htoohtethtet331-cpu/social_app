const fs = require('fs');
let app = fs.readFileSync('frontend/app.js', 'utf8');

const zoomVars = `
// Gallery Zoom State
let gScale = 1;
let gTransX = 0;
let gTransY = 0;
let gInitPinchDist = null;
let gInitScale = 1;
let gIsDragging = false;
let gLastX = 0;
let gLastY = 0;

function updateGalleryImgTransform(smooth = false) {
    const currentImg = document.querySelector(\`#gallery-slide-\${currentGalleryIndex} img\`);
    if (currentImg) {
        currentImg.style.transition = smooth ? 'transform 0.2s ease-out' : 'none';
        currentImg.style.transform = \`translate(\${gTransX}px, \${gTransY}px) scale(\${gScale})\`;
    }
}
function resetGalleryZoom() {
    if (gScale !== 1 || gTransX !== 0 || gTransY !== 0) {
        gScale = 1; gTransX = 0; gTransY = 0;
        updateGalleryImgTransform(true);
    }
}
`;
if (!app.includes('let gScale = 1;')) {
    app = app.replace('let galleryDidSwipe = false;', 'let galleryDidSwipe = false;\n' + zoomVars);
}

const targetStart = `        // Swiping support
        modal.addEventListener('touchstart', (e) => {`;
const newStart = `        // Swiping support
        modal.addEventListener('touchstart', (e) => {
            if (e.touches.length === 2) {
                gInitPinchDist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
                gInitScale = gScale;
                gIsDragging = false;
                galleryIsSwiping = false;
            } else if (e.touches.length === 1) {
                if (gScale > 1) {
                    gIsDragging = true;
                    gLastX = e.touches[0].clientX;
                    gLastY = e.touches[0].clientY;
                    galleryIsSwiping = false;
                } else {`;
app = app.replace(targetStart, newStart);

const targetStartEnd = `            for (let i = 0; i < currentGalleryUrls.length; i++) {
                const slide = document.getElementById(\`gallery-slide-\${i}\`);
                const overlay = document.getElementById(\`gallery-slide-overlay-\${i}\`);
                if (slide) slide.style.transition = 'none';
                if (overlay) overlay.style.transition = 'none';
            }
        }, {passive: true});`;
const newStartEnd = `            for (let i = 0; i < currentGalleryUrls.length; i++) {
                const slide = document.getElementById(\`gallery-slide-\${i}\`);
                const overlay = document.getElementById(\`gallery-slide-overlay-\${i}\`);
                if (slide) slide.style.transition = 'none';
                if (overlay) overlay.style.transition = 'none';
            }
                }
            }
        }, {passive: false});`;
app = app.replace(targetStartEnd, newStartEnd);


const targetMove = `        modal.addEventListener('touchmove', (e) => {
            if (!galleryIsSwiping) return;`;
const newMove = `        modal.addEventListener('touchmove', (e) => {
            if (e.touches.length === 2 && gInitPinchDist) {
                e.preventDefault();
                const currentDist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
                gScale = Math.min(Math.max(1, gInitScale * (currentDist / gInitPinchDist)), 4);
                updateGalleryImgTransform();
            } else if (e.touches.length === 1 && gIsDragging && gScale > 1) {
                e.preventDefault();
                gTransX += (e.touches[0].clientX - gLastX);
                gTransY += (e.touches[0].clientY - gLastY);
                gLastX = e.touches[0].clientX;
                gLastY = e.touches[0].clientY;
                updateGalleryImgTransform();
            } else if (galleryIsSwiping) {
                e.preventDefault();`;
app = app.replace(targetMove, newMove);

const targetMoveEnd = `                }
            }
        }, {passive: true});`;
const newMoveEnd = `                }
            }
        }, {passive: false});`;
// Replace only the first occurrence after touchmove
let moveEndIndex = app.indexOf(targetMoveEnd, app.indexOf("modal.addEventListener('touchmove', (e) => {"));
if (moveEndIndex !== -1) {
    app = app.slice(0, moveEndIndex) + newMoveEnd + app.slice(moveEndIndex + targetMoveEnd.length);
}

const targetEnd = `        modal.addEventListener('touchend', (e) => {
            if (!galleryIsSwiping) return;`;
const newEnd = `        modal.addEventListener('touchend', (e) => {
            if (e.touches.length < 2) gInitPinchDist = null;
            if (e.touches.length === 0) {
                gIsDragging = false;
                if (gScale < 1) {
                    resetGalleryZoom();
                } else if (gScale > 1) {
                    // Snap back to bounds if panned too far
                    const img = document.querySelector(\`#gallery-slide-\${currentGalleryIndex} img\`);
                    if (img) {
                        const bounds = img.getBoundingClientRect();
                        const maxTransX = Math.max(0, (bounds.width * gScale - window.innerWidth) / 2);
                        const maxTransY = Math.max(0, (bounds.height * gScale - window.innerHeight) / 2);
                        
                        if (gTransX > maxTransX) gTransX = maxTransX;
                        if (gTransX < -maxTransX) gTransX = -maxTransX;
                        if (gTransY > maxTransY) gTransY = maxTransY;
                        if (gTransY < -maxTransY) gTransY = -maxTransY;
                        updateGalleryImgTransform(true);
                    }
                }
            }
            if (galleryIsSwiping) {`;
app = app.replace(targetEnd, newEnd);

const targetEndEnd = `            galleryIsSwiping = false;
            handleGallerySwipe();
        }, {passive: true});`;
const newEndEnd = `            galleryIsSwiping = false;
            handleGallerySwipe();
            }
        }, {passive: false});`;
let endEndIndex = app.indexOf(targetEndEnd, app.indexOf("modal.addEventListener('touchend', (e) => {"));
if (endEndIndex !== -1) {
    app = app.slice(0, endEndIndex) + newEndEnd + app.slice(endEndIndex + targetEndEnd.length);
}

// Add resetGalleryZoom
app = app.replace(/function handleGallerySwipe\(\) \{/, 'function handleGallerySwipe() {\n    resetGalleryZoom();');
app = app.replace(/function closeGallery\(e\) \{/, 'function closeGallery(e) {\n    resetGalleryZoom();');
app = app.replace(/currentGalleryIndex = startIndex;/, 'currentGalleryIndex = startIndex;\n    resetGalleryZoom();');

fs.writeFileSync('frontend/app.js', app);
console.log('Gallery Zoom logic applied safely!');
