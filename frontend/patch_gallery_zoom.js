const fs = require('fs');
let app = fs.readFileSync('frontend/app.js', 'utf8');

// 1. Add global variables for zoom
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
app = app.replace('let galleryDidSwipe = false;', 'let galleryDidSwipe = false;\n' + zoomVars);

// 2. Replace the modal.addEventListener('touchstart', ...) in gallery
app = app.replace(/modal\.addEventListener\('touchstart', \(e\) => \{[\s\S]*?\}, \{passive: true\}\);/, `modal.addEventListener('touchstart', (e) => {
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
                } else {
                    galleryTouchStartX = e.changedTouches[0].screenX;
                    galleryTouchStartTime = Date.now();
                    galleryIsSwiping = true;
                    galleryDidSwipe = false;
                    
                    // Remove transitions for smooth 1:1 dragging
                    for (let i = 0; i < currentGalleryUrls.length; i++) {
                        const slide = document.getElementById(\`gallery-slide-\${i}\`);
                        const overlay = document.getElementById(\`gallery-slide-overlay-\${i}\`);
                        if (slide) slide.style.transition = 'none';
                        if (overlay) overlay.style.transition = 'none';
                    }
                }
            }
        }, {passive: false});`);

// 3. Replace touchmove
app = app.replace(/modal\.addEventListener\('touchmove', \(e\) => \{[\s\S]*?\}, \{passive: true\}\);/, `modal.addEventListener('touchmove', (e) => {
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
                e.preventDefault();
                galleryTouchMoveX = e.changedTouches[0].screenX;
                const deltaX = galleryTouchMoveX - galleryTouchStartX;
                if (Math.abs(deltaX) > 10) galleryDidSwipe = true;
                
                const screenWidth = window.innerWidth;
                const progress = deltaX / screenWidth;
                
                // TikTok 3D Stacking Logic
                for (let i = 0; i < currentGalleryUrls.length; i++) {
                    const slide = document.getElementById(\`gallery-slide-\${i}\`);
                    const overlay = document.getElementById(\`gallery-slide-overlay-\${i}\`);
                    if (!slide) continue;
                    
                    if (i === currentGalleryIndex) {
                        if (deltaX < 0) {
                            const scale = Math.max(0.9, 1 - Math.abs(progress) * 0.1);
                            slide.style.transform = \`scale(\${scale})\`;
                            slide.style.zIndex = 5;
                            overlay.style.opacity = Math.abs(progress) * 0.6;
                        } else {
                            slide.style.transform = \`translateX(\${deltaX}px)\`;
                            slide.style.zIndex = 10;
                            overlay.style.opacity = 0;
                        }
                    } else if (i === currentGalleryIndex + 1) {
                        if (deltaX < 0) {
                            slide.style.transform = \`translateX(\${screenWidth + deltaX}px)\`;
                            slide.style.zIndex = 10;
                            overlay.style.opacity = 0;
                        } else {
                            slide.style.transform = \`translateX(100%)\`;
                        }
                    } else if (i === currentGalleryIndex - 1) {
                        if (deltaX > 0) {
                            const scale = Math.min(1, 0.9 + Math.abs(progress) * 0.1);
                            slide.style.transform = \`scale(\${scale})\`;
                            slide.style.zIndex = 5;
                            overlay.style.opacity = 0.6 - Math.abs(progress) * 0.6;
                        } else {
                            slide.style.transform = \`translateX(-100%)\`;
                        }
                    }
                }
            }
        }, {passive: false});`);

// 4. Replace touchend
app = app.replace(/modal\.addEventListener\('touchend', \(e\) => \{[\s\S]*?\}, \{passive: true\}\);/, `modal.addEventListener('touchend', (e) => {
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
                        const maxTransX = (bounds.width * gScale - window.innerWidth) / 2;
                        const maxTransY = (bounds.height * gScale - window.innerHeight) / 2;
                        
                        if (maxTransX > 0) {
                            if (gTransX > maxTransX) gTransX = maxTransX;
                            if (gTransX < -maxTransX) gTransX = -maxTransX;
                        } else { gTransX = 0; }
                        
                        if (maxTransY > 0) {
                            if (gTransY > maxTransY) gTransY = maxTransY;
                            if (gTransY < -maxTransY) gTransY = -maxTransY;
                        } else { gTransY = 0; }
                        updateGalleryImgTransform(true);
                    }
                }
            }
            if (galleryIsSwiping) {
                galleryTouchEndX = e.changedTouches[0].screenX;
                galleryIsSwiping = false;
                handleGallerySwipe();
            }
        }, {passive: false});`);

// 5. Add resetGalleryZoom to handleGallerySwipe and closeGallery
app = app.replace(/function handleGallerySwipe\(\) \{/, 'function handleGallerySwipe() {\n    resetGalleryZoom();');
app = app.replace(/function closeGallery\(e\) \{/, 'function closeGallery(e) {\n    resetGalleryZoom();');
// Reset zoom when opening gallery
app = app.replace(/currentGalleryIndex = startIndex;/, 'currentGalleryIndex = startIndex;\n    resetGalleryZoom();');

fs.writeFileSync('frontend/app.js', app);
console.log('Gallery Zoom logic applied successfully!');
