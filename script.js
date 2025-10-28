// =======================================================
// DYNAMIC CONTENT MODULE (V4: Correct Category Filtering)
// =======================================================

// --- HYGRAPH CONFIG ---
// 🚨 IMPORTANT: REPLACE THESE PLACEHOLDERS WITH YOUR ACTUAL VALUES 🚨
const HYGRAPH_ENDPOINT = 'https://ap-south-1.cdn.hygraph.com/content/cmh8iphfl01xf07w7s3zgyjxz/master'; // Your Hygraph GraphQL endpoint

// --- GraphQL Query to fetch all necessary data ---
const ALBUMS_QUERY = `
query GetAllAlbums {
  photoAlbums(stage: PUBLISHED) {
    title 
    subtitle
    category # CRUCIAL: Used to filter content for the correct page
    cover { url }
    galleryImages { url }
  }
}
`;

// 1. Fetch data from the CMS API
async function fetchAlbums() {
    try {
        const response = await fetch(HYGRAPH_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query: ALBUMS_QUERY }),
        });
        if (!response.ok) {
            console.error(`Hygraph API Error: ${response.status} ${response.statusText}`);
            return [];
        }
        const json = await response.json();
        return json.data.photoAlbums || [];
    } catch (error) {
        console.error("Fetch failed:", error);
        return []; 
    }
}

// 2. Build and inject the HTML tiles
function renderGallery(allAlbums, targetCategory) {
    const grid = document.querySelector('.portfolio-grid');
    if (!grid) return;
    
    // 🚨 CORRECT FILTERING: Only render albums matching the page's category 🚨
    const albumsToRender = allAlbums.filter(album => album.category === targetCategory);

    let galleryHTML = '';
    albumsToRender.forEach(album => {
        const imageList = album.galleryImages.map(img => img.url);
        const imageListJSON = JSON.stringify(imageList);
        const coverImageUrl = album.cover ? album.cover.url : '';
        
        galleryHTML += `
            <a href="#"
                class="grid-item"
                style="background-image: url('${coverImageUrl}');"
                data-images='${imageListJSON}'>
                <div class="grid-item-title">
                    <h3>${album.title} <span>${album.subtitle}</span></h3>
                </div>
            </a>
        `;
    });
    grid.innerHTML = galleryHTML;
    
    // After rendering, bind the click handlers to the new elements
    bindDynamicTileClicks(); 
}

// 3. New Click Handler (Replaces the old hardcoded loop)
function bindDynamicTileClicks() {
    document.querySelectorAll('.grid-item').forEach(tile => {
        tile.addEventListener('click', (e) => {
            e.preventDefault();

            const listAttr = tile.getAttribute('data-images');
            let setArray = [];

            if (listAttr) {
                try {
                    setArray = JSON.parse(listAttr);
                } catch (err) {
                    console.error("Failed to parse JSON from data-images:", err);
                    return;
                }
            }
            
            // This assumes your custom openLightbox function is globally available
            if (setArray.length && typeof openLightbox !== 'undefined') {
                 openLightbox(setArray, 0); 
            }
        });
    });
}

// 4. Initialization Function (Called immediately)
async function initializeDynamicContent() {
    let targetCategory = '';

    // Determine Page Type (matching your HTML titles)
    if (document.title.includes('Models')) {
        targetCategory = 'FIGURES'; 
    } else if (document.title.includes('Nature')) {
        targetCategory = 'FORMS';
    } 
    
    // Only proceed if we are on a recognized gallery page
    if (targetCategory) {
        const allAlbums = await fetchAlbums(); 
        renderGallery(allAlbums, targetCategory); // Passes the necessary filter!
    }
}

// 5. Execute the initialization immediately
initializeDynamicContent();

// -------------------------------------------------------------------------



// Prevent right-click / long-press save (casual protection)
document.addEventListener('contextmenu', function (e) {
  e.preventDefault();
}, false);

window.addEventListener('DOMContentLoaded', () => {
  initializeDynamicContent();
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

  // --- BUILD LIGHTBOX DOM ---
  const lb = document.createElement('div');
  lb.className = 'lightbox';
  lb.innerHTML = `
    <div class="lightbox-close">&times;</div>
    <div class="lightbox-arrow lightbox-arrow-left">&#10094;</div>
    <div class="lightbox-arrow lightbox-arrow-right">&#10095;</div>

    <div class="lightbox-inner">
      <img class="lightbox-img" alt="">
      <div class="protect-layer"></div>
      <div class="lightbox-credit">© 2025 Kevin Roden – No unauthorized use</div>
    </div>
  `;
  document.body.appendChild(lb);

  const closeBtn    = lb.querySelector('.lightbox-close');
  const arrowLeft   = lb.querySelector('.lightbox-arrow-left');
  const arrowRight  = lb.querySelector('.lightbox-arrow-right');
  const inner       = lb.querySelector('.lightbox-inner');
  const imgEl       = lb.querySelector('.lightbox-img');
  const creditEl    = lb.querySelector('.lightbox-credit');

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
  let innerW      = 0;
  let innerH      = 0;
  let baseImgW    = 0;
  let baseImgH    = 0;
  let scaleNative = 2; // fallback default

  // --- HELPERS ---

  // decide if image is portrait or landscape,
  // and move the credit accordingly
  function applyPortraitClass() {
    if (!imgEl.naturalWidth || !imgEl.naturalHeight) return;

    const ratio = imgEl.naturalWidth / imgEl.naturalHeight;
    const portrait = ratio < 1; // true if taller than wide

    if (portrait) {
      imgEl.classList.add('portrait');
      creditEl.classList.add('portrait');
    } else {
      imgEl.classList.remove('portrait');
      creditEl.classList.remove('portrait');
    }
  }

  // figure out how big the image is in "fit to screen"
  function measureBaseImageSize() {
    const iRect = inner.getBoundingClientRect();
    innerW = iRect.width;
    innerH = iRect.height;

    const natW = imgEl.naturalWidth;
    const natH = imgEl.naturalHeight;

    if (!natW || !natH) {
      baseImgW = innerW;
      baseImgH = innerH;
      scaleNative = 2;
      return;
    }

    const imgRatio = natW / natH;
    const boxRatio = innerW / innerH;

    if (imgRatio > boxRatio) {
      baseImgW = innerW;
      baseImgH = innerW / imgRatio;
    } else {
      baseImgH = innerH;
      baseImgW = innerH * imgRatio;
    }

    // how much we’d have to zoom to hit true pixel resolution
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
    measureBaseImageSize();

    zoomed = true;
    const targetScale = Math.min(2, scaleNative);

    scale          = targetScale;
    offsetX        = 0;
    offsetY        = 0;
    velX           = 0;
    velY           = 0;
    momentumActive = false;

    inner.classList.add('zoomed');
    inner.style.cursor = 'grab';

    showArrows(false);
    applyTransform();
  }

  // --- MOMENTUM LOOP ---
  function animateMomentum() {
    if (!momentumActive) return;

    velX *= 0.92;
    velY *= 0.92;

    if (Math.abs(velX) < 0.05 && Math.abs(velY) < 0.05) {
      momentumActive = false;
      return;
    }

    offsetX += velX;
    offsetY += velY;
    applyTransform();

    requestAnimationFrame(animateMomentum);
  }

  // --- IMAGE MGMT ---

  function showImage(index) {
    currentIndex = index;
    imgEl.src = currentSet[currentIndex];

    imgEl.onload = () => {
      // set portrait/landscape class for watermark position
      applyPortraitClass();
      // reset to fit each time we change photo
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

  // --- INTERACTION HANDLERS ---

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

  inner.addEventListener('mousedown', (e) => {
    if (!zoomed) return;

    e.preventDefault();

    isDragging      = true;
    movedDuringDrag = false;
    momentumActive  = false;

    dragStartX = e.clientX;
    dragStartY = e.clientY;
    baseOffsetX = offsetX;
    baseOffsetY = offsetY;

    lastMoveTime = performance.now();
    lastMoveX    = e.clientX;
    lastMoveY    = e.clientY;

    inner.style.cursor = 'grabbing';
  });

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

    const dt = now - lastMoveTime;
    if (dt > 0) {
      velX = (e.clientX - lastMoveX) / dt * 16;
      velY = (e.clientY - lastMoveY) / dt * 16;
      lastMoveTime = now;
      lastMoveX = e.clientX;
      lastMoveY = e.clientY;
    }
  });

  window.addEventListener('mouseup', () => {
    if (!isDragging) return;
    isDragging = false;

    inner.style.cursor = zoomed ? 'grab' : 'zoom-in';

    if (zoomed && movedDuringDrag) {
      momentumActive = true;
      requestAnimationFrame(animateMomentum);
    }
  });

  // --- NAVIGATION ---

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

  // close button logic:
  closeBtn.addEventListener('click', () => {
    if (zoomed) {
      enterFitMode();
    } else {
      closeLightbox();
    }
  });

  // click outside image (black bg) closes fully
  lb.addEventListener('click', (e) => {
    if (e.target === lb) {
      closeLightbox();
    }
  });

  // --- TILE CLICK HANDLER ---
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

      if (!setArray.length) {
        const bg = tile.style.backgroundImage; // url("..."), maybe
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
