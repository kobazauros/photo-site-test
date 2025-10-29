// =======================================================
// dynamic-api.js (Data Fetching and HTML Injection)
// Must be loaded BEFORE lightbox-core.js
// =======================================================

// --- HYGRAPH CONFIG ---
const HYGRAPH_ENDPOINT = 'https://ap-south-1.cdn.hygraph.com/content/cmh8iphfl01xf07w7s3zgyjxz/master'; 

// --- GraphQL Query to fetch all necessary data ---
const ALBUMS_QUERY = `
query GetAllAlbums {
  photoAlbums { 
    title 
    subtitle
    category
    cover 
    galleryImages
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
            console.error(`🛑 HYGRAPH FETCH FAILED (Status: ${response.status})`);
            return [];
        }

        const json = await response.json();
        // Check for successful data return
        if (json.data && json.data.photoAlbums && json.data.photoAlbums.length > 0) {
            console.log("✅ SUCCESS! Data received:", json.data.photoAlbums.length, "albums");
            return json.data.photoAlbums;
        } else {
            console.warn("🟡 HYGRAPH OK (Status 200) but zero content was found. Check PUBLISHED status.");
            return [];
        }

    } catch (error) {
        console.error("❌ NETWORK FETCH ERROR! Check URL/Network connection:", error);
        return []; 
    }
}

// 2. Build and inject the HTML tiles
function renderGallery(allAlbums, targetCategory) {
    const grid = document.querySelector('.portfolio-grid');
    if (!grid) {
        console.error("Error: '.portfolio-grid' element not found.");
        return;
    }
    
    // Filter the content based on the current page's category (case-insensitive)
    const albumsToRender = allAlbums.filter(album => album.category.toLowerCase() === targetCategory.toLowerCase());

    if (albumsToRender.length === 0) {
        console.warn(`No albums found matching category '${targetCategory}'.`);
        grid.innerHTML = `<p style="text-align:center;">No ${targetCategory.toLowerCase()} galleries found.</p>`;
        return;
    }

    let galleryHTML = '';
    albumsToRender.forEach(album => {
        try {
            // --- FINAL FIX: Use Bracket Notation for guaranteed secure_url access ---
            const imageList = album.galleryImages.map(img => img['secure_url']); 
            const imageListJSON = JSON.stringify(imageList);
            
            const coverImageUrl = album.cover ? album.cover['secure_url'] : '';
            
            const title = album.title || 'Untitled Album';
            const subtitle = album.subtitle || '';

            galleryHTML += `
                <a href="#"
                    class="grid-item"
                    style="background-image: url('${coverImageUrl}');"
                    data-images='${imageListJSON}'>
                    <div class="grid-item-title">
                        <h3>${title} <span>${subtitle}</span></h3>
                    </div>
                </a>
            `;
        } catch (e) {
             console.error(`CRITICAL RENDER CRASH processing album "${album.title}":`, e);
        }
    });
    
    // FINAL INJECTION
    grid.innerHTML = galleryHTML;
    
    // 3. Attach click handlers immediately after injection
    if (typeof bindDynamicTileClicks !== 'function') {
        console.error("Error: bindDynamicTileClicks function is not defined. Check lightbox-core.js.");
    } else {
        bindDynamicTileClicks(); 
    }
}

// 4. Initialization Function (Starts the data flow)
async function initializeDynamicContent() {
    let targetCategory = '';

    // Determine Page Type (matching your HTML titles)
    if (document.title.includes('Models')) {
        targetCategory = 'FIGURES'; 
    } else if (document.title.includes('Nature')) {
        targetCategory = 'FORMS';
    } 
    
    if (targetCategory) {
        const allAlbums = await fetchAlbums(); 
        if (allAlbums && allAlbums.length > 0) {
            renderGallery(allAlbums, targetCategory);
        }
    }
}

// Expose the necessary function globally so the main script can call it
window.initializeDynamicContent = initializeDynamicContent;