// =======================================================
// lightbox-core.js (Custom Lightbox, UI Effects, and Initialization)
// Must be loaded AFTER dynamic-api.js
// =======================================================

// Prevent right-click / long-press save (casual protection)
document.addEventListener('contextmenu', function (e) {
  e.preventDefault();
}, false);

// --- Global variables needed by Lightbox functions ---
let currentSet    = [];
let currentIndex  = 0;
let zoomed        = false; 
let scale         = 1;
let offsetX       = 0;
let offsetY       = 0;
let isDragging      = false;
let dragStartX      = 0;
let dragStartY      = 0;
let baseOffsetX     = 0;
let baseOffsetY     = 0;
let movedDuringDrag = false;
let velX            = 0;
let velY            = 0;
let lastMoveTime    = 0;
let lastMoveX       = 0;
let lastMoveY       = 0;
let momentumActive  = false;
let innerW      = 0;
let innerH      = 0;
let baseImgW    = 0;
let baseImgH    = 0;
let scaleNative = 2; 

// --- Lightbox DOM Elements (defined globally after DOM build) ---
let lb, closeBtn, arrowLeft, arrowRight, inner, imgEl, creditEl;

// --- CORE LIGHTBOX FUNCTIONS (Defined globally) ---
function applyPortraitClass() {
    if (!imgEl || !imgEl.naturalWidth || !imgEl.naturalHeight) return;
    const ratio = imgEl.naturalWidth / imgEl.naturalHeight;
    const portrait = ratio < 1; 
    if (portrait) {
      imgEl.classList.add('portrait');
      if (creditEl) creditEl.classList.add('portrait');
    } else {
      imgEl.classList.remove('portrait');
      if (creditEl) creditEl.classList.remove('portrait');
    }
}
function measureBaseImageSize() {
    if (!inner || !imgEl) return;
    const iRect = inner.getBoundingClientRect();
    innerW = iRect.width;
    innerH = iRect.height;
    const natW = imgEl.naturalWidth;
    const natH = imgEl.naturalHeight;
    if (!natW || !natH) { baseImgW = innerW; baseImgH = innerH; scaleNative = 2; return; }
    const imgRatio = natW / natH;
    const boxRatio = innerW / innerH;
    if (imgRatio > boxRatio) { baseImgW = innerW; baseImgH = innerW / imgRatio; } 
    else { baseImgH = innerH; baseImgW = innerH * imgRatio; }
    const scaleW = natW / baseImgW;
    const scaleH = natH / baseImgH;
    scaleNative = Math.max(scaleW, scaleH);
}
function clampOffsets() {
    if (!zoomed) return;
    const zoomW = scale * baseImgW;
    const zoomH = scale * baseImgH;
    const maxX = Math.max(0, (zoomW - innerW) / 2);
    const maxY = Math.max(0, (zoomH - innerH) / 2);
    if (offsetX >  maxX) offsetX =  maxX;
    if (offsetX < -maxX) offsetX = -maxX;
    if (offsetY >  maxY) offsetY =  maxY;
    if (offsetY < -maxY) offsetY = -maxY;
}
function applyTransform() {
    if (!imgEl) return;
    clampOffsets();
    imgEl.style.transform = `translate(${offsetX}px, ${offsetY}px) scale(${scale})`;
    imgEl.style.transition = zoomed ? 'none' : 'transform .2s ease';
}
function showArrows(visible) {
    if (!arrowLeft || !arrowRight) return;
    if (visible && currentSet.length > 1) {
      arrowLeft.classList.remove('hidden');
      arrowRight.classList.remove('hidden');
    } else {
      arrowLeft.classList.add('hidden');
      arrowRight.classList.add('hidden');
    }
}
function enterFitMode() {
    zoomed = false; scale = 1; offsetX = 0; offsetY = 0; velX = 0; velY = 0; momentumActive = false;
    if (inner) {
        inner.classList.remove('zoomed');
        inner.style.cursor = 'zoom-in';
    }
    showArrows(true);
    applyTransform();
}
function enterZoomMode() {
    measureBaseImageSize();
    zoomed = true;
    const targetScale = Math.min(2, scaleNative);
    scale = targetScale; offsetX = 0; offsetY = 0; velX = 0; velY = 0; momentumActive = false;
    if (inner) {
        inner.classList.add('zoomed');
        inner.style.cursor = 'grab';
    }
    showArrows(false);
    applyTransform();
}
function animateMomentum() {
    if (!momentumActive) return;
    velX *= 0.92; velY *= 0.92;
    if (Math.abs(velX) < 0.05 && Math.abs(velY) < 0.05) { momentumActive = false; return; }
    offsetX += velX; offsetY += velY;
    applyTransform();
    requestAnimationFrame(animateMomentum);
}
function showImage(index) {
    if (!imgEl) return;
    currentIndex = index;
    imgEl.src = currentSet[currentIndex];
    imgEl.onload = () => { applyPortraitClass(); enterFitMode(); };
}
function openLightbox(setArray, startIndex = 0) {
    if (!lb) return; 
    currentSet = setArray;
    showImage(startIndex);
    lb.classList.add('open');
}
window.openLightbox = openLightbox; // Expose the function globally
function closeLightbox() {
    if (!lb) return;
    lb.classList.remove('open');
    enterFitMode();
}
function showPrev() {
    if (zoomed || currentSet.length < 2) return;
    const newIndex = (currentIndex - 1 + currentSet.length) % currentSet.length;
    showImage(newIndex);
}
function showNext() {
    if (zoomed || currentSet.length < 2) return;
    const newIndex = (currentIndex + 1) % currentSet.length;
    showImage(newIndex);
}

// 3. New Click Handler (Attaches events to newly rendered tiles)
// This function is defined globally so dynamic-api.js can call it
function bindDynamicTileClicks() {
    document.querySelectorAll('.grid-item').forEach(tile => {
        // Remove listener first to prevent duplicates if this is called multiple times
        tile.removeEventListener('click', handleTileClick); 
        tile.addEventListener('click', handleTileClick);
    });
}
window.bindDynamicTileClicks = bindDynamicTileClicks; // Expose globally

// Separate function to handle the tile click logic
function handleTileClick(e) {
    e.preventDefault();
    const tile = e.currentTarget; 

    const listAttr = tile.getAttribute('data-images');
    let setArray = [];

    if (listAttr) {
        try {
            setArray = JSON.parse(listAttr);
        } catch (err) {
            console.error("Failed to parse JSON from data-images:", err, "Raw data:", listAttr);
            return;
        }
    }
    
    if (setArray.length && typeof openLightbox === 'function') {
         openLightbox(setArray, 0); 
    }
}


// --- MAIN INITIALIZATION LISTENER ---
window.addEventListener('DOMContentLoaded', () => {

  // 🚨 START THE DYNAMIC CONTENT PROCESS 🚨
  if (typeof initializeDynamicContent === 'function') {
      initializeDynamicContent(); // Calls the function from dynamic-api.js
  } else {
      // This error will fire on index.html, which is safe to ignore
      console.log("Note: initializeDynamicContent not found (expected on gallery pages).");
  }


  // --- HERO ANIMATION ---
  const hero = document.querySelector('.hero');
  if (hero) {
    hero.classList.add('reveal');
    requestAnimationFrame(() => hero.classList.add('in'));
  }

  // --- BUILD LIGHTBOX DOM ---
  lb = document.createElement('div');
  lb.className = 'lightbox';
  lb.innerHTML = `
    <div class="lightbox-close">&times;</div>
    <div class="lightbox-arrow lightbox-arrow-left">&#10094;</div>
    <div class="lightbox-arrow lightbox-arrow-right">&#10095;</div>

    <div class="lightbox-inner">
      <img class="lightbox-img" alt="">
      <div class="protect-layer"></div>
      <div class="lightbox-credit">© 2025 Kevin Roden Photography – No unauthorized use</div>
    </div>
  `;
  document.body.appendChild(lb);

  closeBtn    = lb.querySelector('.lightbox-close');
  arrowLeft   = lb.querySelector('.lightbox-arrow-left');
  arrowRight  = lb.querySelector('.lightbox-arrow-right');
  inner       = lb.querySelector('.lightbox-inner');
  imgEl       = lb.querySelector('.lightbox-img');
  creditEl    = lb.querySelector('.lightbox-credit');

  // --- ATTACH LIGHTBOX EVENT HANDLERS ---
  inner.addEventListener('click', () => {
    if (movedDuringDrag) { movedDuringDrag = false; return; }
    if (!zoomed) { enterZoomMode(); } else { enterFitMode(); }
  });
  inner.addEventListener('mousedown', (e) => {
    if (!zoomed) return;
    e.preventDefault();
    isDragging = true; movedDuringDrag = false; momentumActive = false;
    dragStartX = e.clientX; dragStartY = e.clientY;
    baseOffsetX = offsetX; baseOffsetY = offsetY;
    lastMoveTime = performance.now(); lastMoveX = e.clientX; lastMoveY = e.clientY;
    inner.style.cursor = 'grabbing';
  });
  window.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    const now = performance.now(); const dx = e.clientX - dragStartX; const dy = e.clientY - dragStartY;
    if (Math.abs(dx) > 2 || Math.abs(dy) > 2) { movedDuringDrag = true; }
    offsetX = baseOffsetX + dx; offsetY = baseOffsetY + dy;
    applyTransform();
    const dt = now - lastMoveTime;
    if (dt > 0) {
      velX = (e.clientX - lastMoveX) / dt * 16; velY = (e.clientY - lastMoveY) / dt * 16;
      lastMoveTime = now; lastMoveX = e.clientX; lastMoveY = e.clientY;
    }
  });
  window.addEventListener('mouseup', () => {
    if (!isDragging) return;
    isDragging = false;
    inner.style.cursor = zoomed ? 'grab' : 'zoom-in';
    if (zoomed && movedDuringDrag) { momentumActive = true; requestAnimationFrame(animateMomentum); }
  });
  arrowLeft.addEventListener('click', (e) => { e.stopPropagation(); showPrev(); });
  arrowRight.addEventListener('click', (e) => { e.stopPropagation(); showNext(); });
  window.addEventListener('keydown', (e) => {
    if (!lb.classList.contains('open')) return;
    if (e.key === 'Escape') { if (zoomed) { enterFitMode(); } else { closeLightbox(); } } 
    else if (e.key === 'ArrowLeft') { showPrev(); } 
    else if (e.key === 'ArrowRight') { showNext(); }
  });
  closeBtn.addEventListener('click', () => { if (zoomed) { enterFitMode(); } else { closeLightbox(); } });
  lb.addEventListener('click', (e) => { if (e.target === lb) { closeLightbox(); } });
  
  // --- PORTAL CARD TILT (Only runs on index.html) ---
  document.querySelectorAll('.portal-link').forEach(card => {
    card.addEventListener('mousemove', (e) => {
      const r = card.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width - 0.5;
      const y = (e.clientY - r.top) / r.height - 0.5;
      card.style.transform = `perspective(800px) rotateY(${x * 6}deg) rotateX(${-y * 6}deg)`;
    });
    card.addEventListener('mouseleave', () => {
      card.style.transform = 'none';
    });
  });

  // --- NO LONGER NEEDED: The old static tile click handler is removed. ---
  // bindDynamicTileClicks() handles this now.

});