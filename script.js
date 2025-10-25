// script.js — zoom / pan / nav with clamped pan, momentum, and adaptive zoom

window.addEventListener('DOMContentLoaded', () => {
  // --- HERO ANIMATION ---
  const hero = document.querySelector('.hero');
  if (hero) {
    hero.classList.add('reveal');
    requestAnimationFrame(() => hero.classList.add('in'));
  }

  // --- PORTAL CARD TILT ---
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

  // --- BUILD LIGHTBOX ---
  const lb = document.createElement('div');
  lb.className = 'lightbox';
  lb.innerHTML = `
    <div class="lightbox-close">&times;</div>
    <div class="lightbox-arrow lightbox-arrow-left">&#10094;</div>
    <div class="lightbox-arrow lightbox-arrow-right">&#10095;</div>
    <div class="lightbox-inner">
      <img class="lightbox-img" alt="">
    </div>
  `;
  document.body.appendChild(lb);

  const closeBtn    = lb.querySelector('.lightbox-close');
  const arrowLeft   = lb.querySelector('.lightbox-arrow-left');
  const arrowRight  = lb.querySelector('.lightbox-arrow-right');
  const inner       = lb.querySelector('.lightbox-inner');
  const imgEl       = lb.querySelector('.lightbox-img');

  // --- STATE ---
  let currentSet    = [];
  let currentIndex  = 0;

  let zoomed        = false;   // false = fit mode, true = zoom/pan mode
  let scale         = 1;
  let offsetX       = 0;
  let offsetY       = 0;

  // dragging / momentum state
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

  // geometry for clamping
  // innerW / innerH: size of viewport box
  // baseImgW / baseImgH: displayed photo size in FIT mode (actual image rectangle without black bars)
  // scaleNative: how much we'd have to zoom to hit true pixel resolution (100%)
  let innerW      = 0;
  let innerH      = 0;
  let baseImgW    = 0;
  let baseImgH    = 0;
  let scaleNative = 2; // fallback default

  // --- HELPERS ---

  // Measure how large the image is displayed in FIT mode.
  // This is critical for:
  // - clamped panning
  // - adaptive zoom limit
  function measureBaseImageSize() {
    const iRect = inner.getBoundingClientRect();
    innerW = iRect.width;
    innerH = iRect.height;

    const natW = imgEl.naturalWidth;
    const natH = imgEl.naturalHeight;

    if (!natW || !natH) {
      // Fail-safe: assume it just fills viewport
      baseImgW = innerW;
      baseImgH = innerH;
      scaleNative = 2; // just in case
      return;
    }

    const imgRatio = natW / natH;
    const boxRatio = innerW / innerH;

    if (imgRatio > boxRatio) {
      // Photo is "wider" compared to viewport
      // -> it will hit full viewport width first, height gets letterboxed
      baseImgW = innerW;
      baseImgH = innerW / imgRatio;
    } else {
      // Photo is "taller"
      // -> it will hit full viewport height first, width gets letterboxed
      baseImgH = innerH;
      baseImgW = innerH * imgRatio;
    }

    // Now compute the zoom factor that would show the source pixels 1:1
    // Explanation:
    //   baseImgW is how large we are currently displaying it (fit mode)
    //   natW is how many pixels the image actually has
    // So to get pixel-perfect, you'd need to scale up by (natW / baseImgW).
    //
    // natW/baseImgW and natH/baseImgH should be ~the same because we kept aspect,
    // but we'll be safe and take the larger one.
    const scaleW = natW / baseImgW;
    const scaleH = natH / baseImgH;
    scaleNative = Math.max(scaleW, scaleH);

    // After this:
    //   - scaleNative might be < 2 if the image is already pretty big in fit mode.
    //   - scaleNative might be > 2 if your image is huge and we still haven't hit 100% detail at 2x.
    //
    // We'll respect `min(2, scaleNative)` when zooming.
  }

  // Limit how far we can pan. No drifting off into black void.
  function clampOffsets() {
    if (!zoomed) return;

    // zoomed display size in pixels
    const zoomW = scale * baseImgW;
    const zoomH = scale * baseImgH;

    // If zoomed image is smaller than viewport in that axis: no pan in that axis.
    // If bigger: pan allowed until edge hits edge.
    const maxX = Math.max(0, (zoomW - innerW) / 2);
    const maxY = Math.max(0, (zoomH - innerH) / 2);

    if (offsetX >  maxX) offsetX =  maxX;
    if (offsetX < -maxX) offsetX = -maxX;
    if (offsetY >  maxY) offsetY =  maxY;
    if (offsetY < -maxY) offsetY = -maxY;
  }

  function applyTransform() {
    clampOffsets();
    imgEl.style.transform = `translate(${offsetX}px, ${offsetY}px) scale(${scale})`;
    imgEl.style.transition = zoomed ? 'none' : 'transform .2s ease';
  }

  function showArrows(visible) {
    if (visible && currentSet.length > 1) {
      arrowLeft.classList.remove('hidden');
      arrowRight.classList.remove('hidden');
    } else {
      arrowLeft.classList.add('hidden');
      arrowRight.classList.add('hidden');
    }
  }

  // --- VIEW MODES ---

  function enterFitMode() {
    zoomed         = false;
    scale          = 1;
    offsetX        = 0;
    offsetY        = 0;
    velX           = 0;
    velY           = 0;
    momentumActive = false;

    inner.classList.remove('zoomed');
    inner.style.cursor = 'zoom-in';

    showArrows(true);
    applyTransform();
  }

  function enterZoomMode() {
    // measure true fitted geometry first (for clamping and adaptive zoom)
    measureBaseImageSize();

    zoomed = true;

    // ADAPTIVE ZOOM:
    // We don't want to reveal more than "true detail".
    // We also don't want to go past 2x.
    // So we take the smaller of:
    //   - 2
    //   - scaleNative (zoom factor needed to reach native pixel detail)
    //
    // If scaleNative < 2, we cap at scaleNative.
    // If scaleNative > 2, we cap at 2.
    //
    // This means:
    // - If your image is already basically high-res on screen, user will get <2x.
    // - If your image is huge, user still only gets 2x, not crazy CSI enhance.
    const targetScale = Math.min(2, scaleNative);

    scale          = targetScale;
    offsetX        = 0;
    offsetY        = 0;
    velX           = 0;
    velY           = 0;
    momentumActive = false;

    inner.classList.add('zoomed');
    inner.style.cursor = 'grab';

    showArrows(false); // arrows hidden in zoom mode
    applyTransform();
  }

  // --- MOMENTUM LOOP ---
  function animateMomentum() {
    if (!momentumActive) return;

    // friction
    velX *= 0.92;
    velY *= 0.92;

    // if basically stopped, kill momentum
    if (Math.abs(velX) < 0.05 && Math.abs(velY) < 0.05) {
      momentumActive = false;
      return;
    }

    offsetX += velX;
    offsetY += velY;
    applyTransform();

    requestAnimationFrame(animateMomentum);
  }

  // --- IMAGE MANAGEMENT ---

  function showImage(index) {
    currentIndex = index;
    imgEl.src = currentSet[currentIndex];

    imgEl.onload = () => {
      // When a new image loads we always start fitted
      enterFitMode();
    };
  }

  function openLightbox(setArray, startIndex = 0) {
    currentSet = setArray;
    showImage(startIndex);
    lb.classList.add('open');
  }

  function closeLightbox() {
    lb.classList.remove('open');
    enterFitMode();
  }

  // --- INTERACTIONS (click, drag, keys, etc.) ---

  // Click on image area:
  //   - if fit -> zoom (adaptive)
  //   - if zoom -> go back to fit (unless it was just a drag release)
  inner.addEventListener('click', () => {
    if (movedDuringDrag) {
      movedDuringDrag = false;
      return;
    }

    if (!zoomed) {
      enterZoomMode();
    } else {
      enterFitMode();
    }
  });

  // Start dragging (only if zoomed)
  inner.addEventListener('mousedown', (e) => {
    if (!zoomed) return;

    e.preventDefault(); // stop browser's native image drag ghost

    isDragging      = true;
    movedDuringDrag = false;
    momentumActive  = false; // kill any glide in progress

    dragStartX = e.clientX;
    dragStartY = e.clientY;
    baseOffsetX = offsetX;
    baseOffsetY = offsetY;

    // initialize velocity tracking
    lastMoveTime = performance.now();
    lastMoveX    = e.clientX;
    lastMoveY    = e.clientY;

    inner.style.cursor = 'grabbing';
  });

  // Drag move
  window.addEventListener('mousemove', (e) => {
    if (!isDragging) return;

    const now = performance.now();
    const dx = e.clientX - dragStartX;
    const dy = e.clientY - dragStartY;

    if (Math.abs(dx) > 2 || Math.abs(dy) > 2) {
      movedDuringDrag = true;
    }

    offsetX = baseOffsetX + dx;
    offsetY = baseOffsetY + dy;
    applyTransform();

    // compute velocity for momentum
    const dt = now - lastMoveTime;
    if (dt > 0) {
      velX = (e.clientX - lastMoveX) / dt * 16; // ~px per frame estimate
      velY = (e.clientY - lastMoveY) / dt * 16;
      lastMoveTime = now;
      lastMoveX = e.clientX;
      lastMoveY = e.clientY;
    }
  });

  // Drag end
  window.addEventListener('mouseup', () => {
    if (!isDragging) return;
    isDragging = false;

    inner.style.cursor = zoomed ? 'grab' : 'zoom-in';

    // Start glide if we were zoomed and actually moved
    if (zoomed && movedDuringDrag) {
      momentumActive = true;
      requestAnimationFrame(animateMomentum);
    }
  });

  // --- NAVIGATION (arrows and keyboard) ---

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

  arrowLeft.addEventListener('click', (e) => {
    e.stopPropagation();
    showPrev();
  });

  arrowRight.addEventListener('click', (e) => {
    e.stopPropagation();
    showNext();
  });

  // Keyboard controls:
  // Escape:
  //   - if zoomed -> go back to fit
  //   - if fit   -> close viewer
  // ArrowLeft / ArrowRight:
  //   - only when in fit mode (zoomed = false)
  window.addEventListener('keydown', (e) => {
    if (!lb.classList.contains('open')) return;

    if (e.key === 'Escape') {
      if (zoomed) {
        enterFitMode();
      } else {
        closeLightbox();
      }
    } else if (e.key === 'ArrowLeft') {
      showPrev();
    } else if (e.key === 'ArrowRight') {
      showNext();
    }
  });

  // Clicking the ✕:
  // - If zoomed: go back to fit (stay in gallery)
  // - If already fit: close viewer completely
  closeBtn.addEventListener('click', () => {
    if (zoomed) {
      enterFitMode();
    } else {
      closeLightbox();
    }
  });

  // Clicking the black background (outside the image frame) always closes entirely
  lb.addEventListener('click', (e) => {
    if (e.target === lb) {
      closeLightbox();
    }
  });

  // --- TILE CLICK HANDLER ---
  // Each tile on the grid should look like:
  // <a class="grid-item"
  //    style="background-image: url('images/models/love/cover.jpg');"
  //    data-images="images/models/love/love-01.jpg, images/models/love/love-02.jpg, ...">
  document.querySelectorAll('.grid-item').forEach(tile => {
    tile.addEventListener('click', (e) => {
      e.preventDefault();

      const listAttr = tile.getAttribute('data-images');
      let setArray = [];

      if (listAttr) {
        setArray = listAttr
          .split(',')
          .map(s => s.trim())
          .filter(Boolean);
      }

      // fallback: just use cover itself
      if (!setArray.length) {
        const bg = tile.style.backgroundImage; // url("...")
        if (bg && bg.startsWith('url(')) {
          const url = bg.slice(5, -2);
          setArray = [url];
        }
      }

      if (!setArray.length) return;

      openLightbox(setArray, 0);
    });
  });
});
