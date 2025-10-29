// =======================================================
// dynamic-api.js (Data Fetching and HTML Injection)
// Must be loaded BEFORE lightbox-core.js
// =======================================================

// --- HYGRAPH CONFIG ---
const HYGRAPH_ENDPOINT = 'https://ap-south-1.cdn.hygraph.com/content/cmh8iphfl01xf07w7s3zgyjxz/master'; 

// --- PAGINATION STATE & CONSTANTS ---
const TILES_PER_PAGE = 8; // How many tiles to load at a time
let currentOffset = 0;    // Tracks how many items we've already loaded
let currentCategory = ''; // Stores 'FIGURES' or 'FORMS'
let loadMoreButton = null;// Reference to the <button>
let grid = null;          // Reference to the .portfolio-grid

// --- Define the two separate GraphQL queries (now with variables) ---
const QUERY_FIGURES = `
query GetFiguresAlbums($limit: Int!, $skip: Int!) {
  photoAlbums(
    stage: PUBLISHED, 
    first: $limit, 
    skip: $skip, 
    where: {category: figures}, 
    orderBy: publishedAt_DESC
  ) { 
    title 
    subtitle
    category
    cover 
    galleryImages
  }
}
`;

const QUERY_FORMS = `
query GetFormsAlbums($limit: Int!, $skip: Int!) {
  photoAlbums(
    stage: PUBLISHED, 
    first: $limit, 
    skip: $skip, 
    where: {category: forms}, 
    orderBy: publishedAt_DESC
  ) { 
    title 
    subtitle
    category
    cover 
    galleryImages
  }
}
`;


// 1. Fetch data from the CMS API
/**
 * Fetches albums for a *specific* category from Hygraph, with pagination.
 * @param {string} targetCategory - The category to fetch ("FIGURES" or "FORMS").
 * @param {int} limit - The number of items to fetch (e.g., TILES_PER_PAGE).
 * @param {int} skip - The number of items to offset (e.g., currentOffset).
 */
async function fetchAlbums(targetCategory, limit, skip) {
    
    let selectedQuery = '';

    // Use an if/else block to select the correct query string
    if (targetCategory === 'FIGURES') {
        selectedQuery = QUERY_FIGURES;
    } else if (targetCategory === 'FORMS') {
        selectedQuery = QUERY_FORMS;
    } else {
        console.error(`Invalid targetCategory: ${targetCategory}`);
        return []; // Stop if the category is not recognized
    }
    
    try {
        const response = await fetch(HYGRAPH_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                query: selectedQuery,
                // Pass the variables to Hygraph
                variables: { limit: limit, skip: skip } 
            }),
        });

        if (!response.ok) {
            console.error(`🛑 HYGRAPH FETCH FAILED (Status: ${response.status})`);
            return [];
        }

        const json = await response.json();
        
        if (json.data && json.data.photoAlbums) {
            return json.data.photoAlbums;
        } else {
            console.warn(`🟡 HYGRAPH OK (Status 200) but zero content was found for category ${targetCategory}.`);
            return [];
        }

    } catch (error) {
        console.error("❌ NETWORK FETCH ERROR! Check URL/Network connection:", error);
        return []; 
    }
}

// 2. Build and inject the HTML tiles
function renderGallery(albumsToRender, targetCategory) {
    // 'grid' is now a global variable, set during init.
    if (!grid) {
        console.error("Error: '.portfolio-grid' element not found.");
        return;
    }
    
    console.log(`DEBUG: Rendering ${albumsToRender.length} albums for category '${targetCategory}'.`);

    if (albumsToRender.length === 0 && currentOffset === 0) {
        // First load, but nothing found. Replace loader with a new message.
        grid.innerHTML = `<p class="grid-loader">No ${targetCategory.toLowerCase()} galleries found.</p>`;
        return;
    }

    let galleryHTML = '';
    albumsToRender.forEach(album => {
        try {
            // --- SAFETY CHECK: Skip album if critical data is missing ---
            if (!album.cover || !album.galleryImages || album.galleryImages.length === 0) {
                console.warn(`SKIPPING ALBUM: "${album.title}" is missing a Cover Image or has 0 Gallery Images.`);
                return; // Skips this album
            }

            const imageList = album.galleryImages.map(img => img['secure_url']); 
            const imageListJSON = JSON.stringify(imageList);
            
            const coverImageUrl = album.cover['secure_url'];
            
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
             console.error(`CRITICAL RENDER CRASH processing album "${album.title}":`, e, "Album data:", album);
        }
    });
    
    // --- UPDATED FINAL INJECTION ---
    if (currentOffset === 0) {
        // This is the FIRST render. Overwrite the <p class="grid-loader">.
        grid.innerHTML = galleryHTML; 
    } else {
        // This is a "Load More" click. Append to the existing tiles.
        grid.innerHTML += galleryHTML; 
    }
    
    // 3. Attach click handlers immediately after injection
    // (This part is unchanged)
    if (typeof bindDynamicTileClicks === 'function') {
        bindDynamicTileClicks(); 
    } else {
        console.error("Error: bindDynamicTileClicks function is not defined. Check lightbox-core.js.");
    }
}

// 4. Initialization Function (Starts the data flow)
async function initializeDynamicContent() {
    // Get references to our global DOM elements
    grid = document.querySelector('.portfolio-grid');
    loadMoreButton = document.getElementById('load-more-btn'); 

    // We already know we are on a gallery page, so no need to check for grid.
    
    let targetCategory = '';
    let pageTitle = '';
    let h1Text = '';

    // --- NEW LOGIC: Read URL parameter ---
    const urlParams = new URLSearchParams(window.location.search);
    const pageType = urlParams.get('page'); // 'figures' or 'forms'
    
    if (pageType === 'figures') {
        targetCategory = 'FIGURES';
        pageTitle = 'Figures | Kevin Roden Photography';
        h1Text = 'Figures';
    } else if (pageType === 'forms') {
        targetCategory = 'FORMS';
        pageTitle = 'Forms | Kevin Roden Photography';
        h1Text = 'Forms';
    } else {
        // Fallback or error
        console.error(`Unknown page type: ${pageType}`);
        document.querySelector('.page-header h1').textContent = 'Error';
        return;
    }

    // --- Set the page title and H1 ---
    document.title = pageTitle;
    document.querySelector('.page-header h1').textContent = h1Text;
    
    if (targetCategory) {
        currentCategory = targetCategory; // Save for later clicks
        
        // Load the FIRST page (offset 0)
        const initialAlbums = await fetchAlbums(currentCategory, TILES_PER_PAGE, 0); 
        
        if (initialAlbums && initialAlbums.length > 0) {
            renderGallery(initialAlbums, currentCategory);
            currentOffset += TILES_PER_PAGE; // Update the offset for the *next* load
        }
        
        // If we got fewer albums than a full page, or 0, hide the button
        if (!initialAlbums || initialAlbums.length < TILES_PER_PAGE) {
            if(loadMoreButton) loadMoreButton.style.display = 'none';
        }
    }

    // Attach the click listener
    if (loadMoreButton) {
        loadMoreButton.addEventListener('click', loadNextPage);
    }
}

// 5. NEW Function to handle "Load More" clicks
async function loadNextPage() {
    if (!currentCategory || !loadMoreButton) return; // Safety check
            
    // Show a loading state
    loadMoreButton.disabled = true;
    loadMoreButton.textContent = 'Loading...';

    // Fetch the NEXT page using the current offset
    const albums = await fetchAlbums(currentCategory, TILES_PER_PAGE, currentOffset);
    
    if (albums && albums.length > 0) {
        renderGallery(albums, currentCategory); // Appends new tiles
        currentOffset += TILES_PER_PAGE; // Increment offset for the *next* click
    }
    
    // If we received 0 albums, or fewer than a full page, hide the button.
    if (!albums || albums.length < TILES_PER_PAGE) {
        loadMoreButton.style.display = 'none';
    }

    // Reset button state
    loadMoreButton.disabled = false;
    loadMoreButton.textContent = 'Load More';
}


// Expose the initialization function globally so lightbox-core.js can call it
window.initializeDynamicContent = initializeDynamicContent;