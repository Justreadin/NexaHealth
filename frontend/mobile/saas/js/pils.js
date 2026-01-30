// Configuration

const API_BASE_URL = 'https://nexahealth-backend-production.up.railway.app/api/pils';
// DOM Elements
// Add these right after your other DOM element declarations
const manufacturerSearch = document.getElementById('manufacturer-search');
const nafdacSearch = document.getElementById('nafdac-search');
const searchInput = document.getElementById('pil-search');
const searchLoader = document.getElementById('search-loader');
const searchResultsSection = document.getElementById('search-results-section');
const searchResultsContainer = document.getElementById('search-results');
const resultsCount = document.getElementById('results-count');
const searchSuggestions = document.getElementById('search-suggestions');
const featuredSection = document.getElementById('featured-section');
const recentSection = document.getElementById('recent-section');
const savedSection = document.getElementById('saved-section');
const featuredPilContainer = document.getElementById('featured-pil');
const recentPilsContainer = document.getElementById('recent-pils');
const savedPilsContainer = document.getElementById('saved-pils');
const pilModal = document.getElementById('pil-modal');
const closePilModal = document.getElementById('close-pil');
const pilModalContent = document.getElementById('pil-modal-content');
const noResultsState = document.getElementById('no-results');
const reportMissingBtn = document.getElementById('report-missing');
const categoryFiltersContainer = document.getElementById('category-filters');
const savePilBtn = document.getElementById('save-pil');
const downloadPilBtn = document.getElementById('download-pil');
const advancedFiltersBtn = document.getElementById('advanced-filters-btn');
const advancedFilters = document.getElementById('advanced-filters');
const manufacturerFilter = document.getElementById('manufacturer-filter');
const dosageFormFilter = document.getElementById('dosage-form-filter');
const applyFiltersBtn = document.getElementById('apply-filters');
const resetFiltersBtn = document.getElementById('reset-filters');
// Add these to your existing state variables
const drugSearchTab = document.getElementById('drug-search-tab');
const nafdacSearchTab = document.getElementById('nafdac-search-tab');
const drugSearchContainer = document.getElementById('drug-search-container');
const nafdacSearchContainer = document.getElementById('nafdac-search-container');
let currentSearchType = 'drug'; // 'drug' or 'nafdac'


// State
const urlParams = new URLSearchParams(window.location.search);
const pilId = urlParams.get('id');
let currentPilId = null;
let debounceTimer;
let currentSearchTerm = '';
let currentCategory = 'all';
let currentManufacturer = '';
let currentDosageForm = '';
let availableCategories = new Set();

document.addEventListener('DOMContentLoaded', function() {
    loadInitialData();
    setupEventListeners();;
})

// Load initial data
async function loadInitialData() {
    try {
        console.log('Loading initial data...');
        // Load featured PIL
        const featuredPils = await fetchPils({ limit: 1 });
        if (featuredPils.length > 0) {
            renderFeaturedPil(featuredPils[0]);
        }

        // Load recently viewed
        //const recentPils = await fetchRecentPils();
        //renderRecentPils(recentPils);

        // Load saved PILs
        //const savedPils = await fetchSavedPils();
        //renderSavedPils(savedPils);
    } catch (error) {
        console.error('Error loading initial data:', error);
        if (error.message.includes('401')) {
            window.location.href = 'login.html';
        }
    }
}

// Setup event listeners
function setupEventListeners() {
    // Search functionality with debounce
    searchInput.addEventListener('input', () => {
        clearTimeout(debounceTimer);
        currentSearchTerm = searchInput.value.trim();
        debounceTimer = setTimeout(() => handleSearch({ search: currentSearchTerm }), 300);
    });

    // Manufacturer search
    manufacturerSearch.addEventListener('input', () => {
        clearTimeout(debounceTimer);
        currentManufacturer = manufacturerSearch.value.trim();
        debounceTimer = setTimeout(() => handleSearch({ 
            search: currentSearchTerm,
            manufacturer: currentManufacturer 
        }), 300);
    });

    // NAFDAC search
    nafdacSearch.addEventListener('input', () => {
        clearTimeout(debounceTimer);
        const nafdacValue = nafdacSearch.value.trim();
        debounceTimer = setTimeout(() => {
            if (nafdacValue.length >= 3) {
                handleSearch({ nafdac_no: nafdacValue });
            }
        }, 300);
    });

    // Search tabs
    drugSearchTab.addEventListener('click', () => {
        switchSearchTab('drug');
    });

    nafdacSearchTab.addEventListener('click', () => {
        switchSearchTab('nafdac');
    });


    // Modal close
    closePilModal.addEventListener('click', () => {
        pilModal.classList.add('hidden');
    });

    // Save PIL
    savePilBtn.addEventListener('click', toggleSavePil);

    // Download PIL
    downloadPilBtn.addEventListener('click', downloadPil);

    // Advanced filters toggle
    advancedFiltersBtn.addEventListener('click', function() {
        const filtersPanel = advancedFilters;
        filtersPanel.classList.toggle('hidden');
        
        // Update button icon based on state
        const icon = this.querySelector('i');
        if (filtersPanel.classList.contains('hidden')) {
            icon.classList.remove('fa-times');
            icon.classList.add('fa-sliders-h');
        } else {
            icon.classList.remove('fa-sliders-h');
            icon.classList.add('fa-times');
        }
    });

    applyFiltersBtn.addEventListener('click', () => {
        currentDosageForm = dosageFormFilter.value;
        
        // Perform search based on current search type
        if (currentSearchType === 'drug') {
            handleSearch({ 
                search: currentSearchTerm,
                manufacturer: currentManufacturer,
                dosage_form: currentDosageForm
            });
        } else {
            // For NAFDAC search, just use the current NAFDAC value
            const nafdacValue = nafdacSearch.value.trim();
            if (nafdacValue.length >= 3) {
                handleSearch({ nafdac_no: nafdacValue });
            }
        }
        
        advancedFilters.classList.add('hidden');
    });

    // Reset all filters
    resetFiltersBtn.addEventListener('click', resetFilters);

    window.addEventListener('popstate', function(event) {
        if (pilModal.classList.contains('hidden') === false) {
            pilModal.classList.add('hidden');
            event.preventDefault();
            history.pushState(null, null, window.location.pathname);
        }
    });
}


function switchSearchTab(tab) {
    if (tab === 'drug') {
        drugSearchTab.classList.add('active');
        nafdacSearchTab.classList.remove('active');
        drugSearchContainer.classList.remove('hidden');
        nafdacSearchContainer.classList.add('hidden');
        currentSearchType = 'drug';
    } else {
        nafdacSearchTab.classList.add('active');
        drugSearchTab.classList.remove('active');
        nafdacSearchContainer.classList.remove('hidden');
        drugSearchContainer.classList.add('hidden');
        currentSearchType = 'nafdac';
    }
    
    // Clear search fields when switching tabs
    searchInput.value = '';
    manufacturerSearch.value = '';
    nafdacSearch.value = '';
    
    // Reset to default view
    resetFilters();
}

// Reset all filters
function resetFilters() {
    // Reset state
    currentSearchTerm = '';
    currentManufacturer = '';
    currentCategory = 'all';
    currentDosageForm = '';
    
    // Reset UI elements
    searchInput.value = '';
    manufacturerSearch.value = '';
    nafdacSearch.value = '';
    dosageFormFilter.value = '';
    
    // Reset category filters
    document.querySelectorAll('.category-filter').forEach(btn => {
        btn.classList.remove('active-category');
        if (btn.dataset.category === 'all') {
            btn.classList.add('active-category');
        }
    });
    
    // Close advanced filters
    advancedFilters.classList.add('hidden');
    
    // Reset the icon
    const icon = advancedFiltersBtn.querySelector('i');
    icon.classList.remove('fa-times');
    icon.classList.add('fa-sliders-h');
    
    // Show default content
    searchResultsSection.classList.add('hidden');
    featuredSection.classList.remove('hidden');
    recentSection.classList.remove('hidden');
    savedSection.classList.remove('hidden');
    noResultsState.classList.add('hidden');
    
    // Reload initial data
    loadInitialData();
}

// ✅ Handle search (unified)
async function handleSearch(params = {}) {
    try {
        showLoader();
        
        // Switch UI to search mode
        searchResultsSection.classList.remove('hidden');
        featuredSection.classList.add('hidden');
        //recentSection.classList.add('hidden');
        //savedSection.classList.add('hidden');

        // Add filters if it's a drug search
        if (params.search) {
            if (currentCategory !== 'all') params.category = currentCategory;
            if (currentDosageForm) params.dosage_form = currentDosageForm;
            if (currentManufacturer) params.manufacturer = currentManufacturer;
            params.limit = 100;
        }

        const response = await fetchPils(params);

        if (response.length === 0) {
            noResultsState.classList.remove('hidden');
            searchResultsSection.classList.add('hidden');
        } else {
            noResultsState.classList.add('hidden');
            renderSearchResults(response);

            if (!params.nafdac_no) {
                updateAvailableCategories(response);
            } else {
                searchSuggestions.classList.add("hidden");
            }
        }

    } catch (error) {
        console.error('Search error:', error);
    } finally {
        hideLoader();
    }
}

function showLoader() {
    searchLoader.classList.remove('hidden');
}

function hideLoader() {
    searchLoader.classList.add('hidden');
}

// Update available categories based on search results
function updateAvailableCategories(pils) {
    availableCategories.clear();
    
    // Collect all unique categories from the search results
    pils.forEach(pil => {
        if (pil.category) {
            availableCategories.add(pil.category);
        }
    });
    
    // Update the category filters UI
    renderCategoryFilters();
}

// Render dynamic category filters
function renderCategoryFilters() {
    // Clear existing filters
    categoryFiltersContainer.innerHTML = '';
    
    // Add reset button as the first item
    const resetButton = document.createElement('button');
    resetButton.dataset.category = 'all';
    resetButton.className = `search-pill bg-white border ${currentCategory === 'all' ? 'border-blue-200 text-blue-600' : 'border-gray-200 text-gray-600'} px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap category-filter ${currentCategory === 'all' ? 'active-category' : ''}`;
    resetButton.innerHTML = '<i class="fas fa-times mr-1"></i>';
    resetButton.title = 'Reset filters';
    
    resetButton.addEventListener('click', () => {
        resetFilters();
    });
    
    categoryFiltersContainer.appendChild(resetButton);
    
    // Add available categories
    const categoryIcons = {
        "Prescription-only Medicine (POM)": "fa-prescription",
        "Over-the-counter (OTC)": "fa-pills",
        "Herbal Medicine": "fa-leaf",
        "Supplement": "fa-capsules",
        "Vaccine": "fa-syringe"
    };
    
    availableCategories.forEach(category => {
        const icon = categoryIcons[category] || "fa-tag";
        const button = document.createElement('button');
        button.dataset.category = category;
        button.className = `search-pill bg-white border border-gray-200 text-gray-600 px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap category-filter ${currentCategory === category ? 'active-category' : ''}`;
        button.innerHTML = `<i class="fas ${icon} mr-1"></i> ${category.split(' ')[0]}`;
        
        button.addEventListener('click', () => {
            currentCategory = category;
            document.querySelectorAll('.category-filter').forEach(btn => {
                btn.classList.remove('active-category');
            });
            button.classList.add('active-category');
            handleSearch();
        });
        
        categoryFiltersContainer.appendChild(button);
    });
}

async function fetchWithAuth(url, options = {}) {
    try {
        // Get token from Auth service
        const token =
            sessionStorage.getItem('nexahealth_pharmacy_token') ||
            localStorage.getItem('nexahealth_pharmacy_token');
        console.log("Access token:", token);
        
        if (!token) {
            window.App.Auth.clearAuth();
            window.location.href = 'login.html';
            throw new Error('No access token found');
        }

        const headers = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
            ...options.headers
        };

        // Make the initial request
        const response = await fetch(url, { 
            ...options, 
            headers,
            credentials: 'include'  // Important for session cookies
        });

        // Handle 401 unauthorized (token might be expired)
        if (response.status === 401) {
            try {
                // Attempt to refresh token
                const newToken = await window.App.Auth.refreshToken();
                
                // Retry with new token
                headers['Authorization'] = `Bearer ${newToken}`;
                const retryResponse = await fetch(url, { 
                    ...options, 
                    headers,
                    credentials: 'include'
                });
                
                return retryResponse;
            } catch (refreshError) {
                console.error('Token refresh failed:', refreshError);
                window.App.Auth.clearAuth();
                window.location.href = 'login.html';
                throw refreshError;
            }
        }

        return response;
    } catch (error) {
        console.error('Fetch error:', error);
        throw error;
    }
}

async function fetchPils(params = {}) {
    const url = new URL(API_BASE_URL);
    Object.entries(params).forEach(([key, value]) => {
        if (value) url.searchParams.append(key, value);
    });

    try {
        const response = await fetchWithAuth(url);
        const data = await response.json();
        
        if (data.suggestions && data.suggestions.length > 0) {
            showSearchSuggestions(data.suggestions);
        } else {
            searchSuggestions.classList.add('hidden');
        }
        
        return data.results || [];
    } catch (error) {
        console.error('Failed to fetch PILs:', error);
        throw error;
    }
}
/**** 
async function fetchRecentPils(limit = 5) {
    try {
        const url = new URL(`${API_BASE_URL}/recent`);
        url.searchParams.set('limit', limit);
        
        const response = await fetchWithAuth(url);
        
        if (response.status === 404) {
            // Handle case where no recent PILs exist yet
            console.log('No recent PILs found - returning empty array');
            return [];
        }
        
        if (!response.ok) {
            throw new Error('Failed to fetch recent PILs');
        }
        
        return await response.json();
    } catch (error) {
        console.error('Failed to fetch recent PILs:', error);
        // Return empty array instead of throwing error
        return [];
    }
}
const SAVED_API_URL = API_BASE_URL.replace('/pils', '');  // becomes /api

async function fetchSavedPils(limit = 5) {
    try {
        const url = new URL(`${SAVED_API_URL}/saved`);
        url.searchParams.set('limit', limit);

        const response = await fetchWithAuth(url);

        if (!response.ok) {
            console.error('Error fetching saved PILs:', response.status);
            return [];
        }

        const data = await response.json();
        return Array.isArray(data) ? data : [];
    } catch (error) {
        console.error('Network error fetching saved PILs:', error);
        return [];
    }
}
***/
async function fetchPilDetails(pilId) {
    try {
        const url = `${API_BASE_URL}/${pilId}`;
        const response = await fetchWithAuth(url);
        return await response.json();
    } catch (error) {
        console.error('Failed to fetch PIL details:', error);
        throw error;
    }
}

async function recordPilView(pilId) {
    try {
        const url = `${API_BASE_URL}/${pilId}/view`;
        const response = await fetchWithAuth(url, { method: 'POST' });
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            console.warn('View recording failed:', errorData.detail || response.status);
            return null;
        }
        
        // Only refresh recent list if view was successfully recorded
        try {
            const recentPils = await fetchRecentPils();
            renderRecentPils(recentPils);
        } catch (refreshError) {
            console.error('Error refreshing recent list:', refreshError);
        }
        
        return await response.json();
    } catch (error) {
        console.error('Failed to record view:', error);
        return null;
    }
}

async function toggleSavePil() {
    if (!currentPilId) return;

    try {
        // Check authentication first
        if (!window.App.Auth.isAuthenticated()) {
            window.App.Auth.storeRedirectUrl();
            window.location.href = 'login.html';
            return;
        }

        const url = `${API_BASE_URL}/${currentPilId}/save`;
        const response = await fetchWithAuth(url, { method: 'POST' });
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.detail || 'Failed to save leaflet');
        }

        // Get the actual saved state from the response
        const result = await response.json();
        const isSaved = result.saved;

        // Update UI immediately
        savePilBtn.classList.toggle('text-blue-600', !isSaved);
        savePilBtn.classList.toggle('text-yellow-500', isSaved);

        // Show feedback to user
        function showToast(message, type = 'info') {
            const toast = document.createElement('div');
            toast.className = `fixed bottom-4 right-4 px-4 py-2 rounded-md shadow-md text-white ${
                type === 'error' ? 'bg-red-500' : 
                type === 'success' ? 'bg-green-500' : 'bg-blue-500'
            } z-50`;
            toast.textContent = message;
            document.body.appendChild(toast);
            
            setTimeout(() => {
                toast.classList.add('opacity-0', 'transition-opacity', 'duration-300');
                setTimeout(() => toast.remove(), 300);
            }, 3000);
        }

        // Refresh saved list (don't block on this)
        setTimeout(async () => {
            try {
                const savedPils = await fetchSavedPils();
                renderSavedPils(savedPils);
            } catch (error) {
                console.error('Error refreshing saved list:', error);
            }
        }, 0);

        return result;
    } catch (error) {
        console.error('Error saving PIL:', error);
        showToast(error.message || 'Failed to save leaflet', 'error');
        throw error;
    }
}

function downloadPil(pilId = currentPilId) {
    if (!pilId) return;
    
    // In a real implementation, this would download the PDF
    alert(`Downloading PIL with ID: ${pilId}`);
    // window.open(`${API_BASE_URL}/${pilId}/download`, '_blank');
}

function reportMissingDrug() {
    // In a real implementation, this would open a form or make an API call
    alert('Reporting missing drug feature would open a form');
    // window.open(`${API_BASE_URL}/report-missing`, '_blank');
}

// Render Functions
function renderSearchResults(pils) {
    resultsCount.textContent = `${pils.length} ${pils.length === 1 ? 'result' : 'results'}`;
    
    searchResultsContainer.innerHTML = pils.map(pil => `
        <div class="pil-card bg-white rounded-xl shadow-sm p-4 border border-gray-100 flex items-center" data-pil-id="${pil.id}">
            <div class="bg-blue-100 p-2 rounded-lg mr-3">
                <i class="fas fa-pills text-blue-600"></i>
            </div>
            <div class="flex-1">
                <h4 class="font-medium text-gray-800">${pil.product_name}</h4>
                <p class="text-xs text-gray-500">${pil.manufacturer?.name || 'Unknown'} • NAFDAC: ${pil.identifiers?.nafdac_reg_no || 'N/A'}</p>
                <div class="flex flex-wrap gap-1 mt-2">
                    ${pil.tags?.map(tag => `
                        <span class="pill-tag bg-blue-50 text-blue-600 px-2 py-1 rounded-full text-xs">${tag}</span>
                    `).join('')}
                </div>
            </div>
            <div class="flex items-center space-x-2">
                <button class="p-2 text-blue-600 hover:bg-blue-50 rounded-full save-pil-btn" data-pil-id="${pil.id}">
                    <i class="fas fa-bookmark"></i>
                </button>
                <i class="fas fa-chevron-right text-gray-400"></i>
            </div>
        </div>
    `).join('');

    // Add event listeners to search results
    document.querySelectorAll('.pil-card[data-pil-id]').forEach(card => {
        card.addEventListener('click', () => showPilModal(card.dataset.pilId));
    });

    document.querySelectorAll('.save-pil-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            currentPilId = btn.dataset.pilId;
            toggleSavePil();
        });
    });
}

function showSearchSuggestions(suggestions) {
    const suggestionsContainer = searchSuggestions.querySelector('div');
    suggestionsContainer.innerHTML = suggestions.map(suggestion => `
        <span class="suggestion-pill px-3 py-1 rounded-full text-xs font-medium" data-suggestion="${suggestion}">
            ${suggestion}
        </span>
    `).join('');

    // Add click handlers to suggestions
    document.querySelectorAll('[data-suggestion]').forEach(suggestion => {
        suggestion.addEventListener('click', () => {
            searchInput.value = suggestion.dataset.suggestion;
            currentSearchTerm = suggestion.dataset.suggestion;
            handleSearch();
        });
    });

    searchSuggestions.classList.remove('hidden');
}

function renderFeaturedPil(pil) {
    currentPilId = pil.id;
    
    featuredPilContainer.innerHTML = `
        <div class="flex items-start">
            <div class="bg-blue-100 p-3 rounded-lg mr-4">
                <i class="fas fa-pills text-blue-600 text-xl"></i>
            </div>
            <div class="flex-1">
                <h3 class="font-bold text-gray-800 mb-1">${pil.product_name}</h3>
                <p class="text-sm text-gray-600 mb-2">${pil.manufacturer?.name || 'Unknown'} • NAFDAC: ${pil.identifiers?.nafdac_reg_no || 'N/A'}</p>
                <div class="flex flex-wrap gap-2 mb-3">
                    ${pil.tags?.map(tag => `
                        <span class="pill-tag bg-blue-50 text-blue-600 px-2 py-1 rounded-full text-xs">${tag}</span>
                    `).join('')}
                </div>
                <p class="text-sm text-gray-700 mb-4">${pil.description || 'No description available'}</p>
                <div class="flex space-x-2">
                    <button class="flex-1 health-gradient hover:opacity-90 text-white py-2 rounded-lg text-sm font-medium flex items-center justify-center view-pil-btn" data-pil-id="${pil.id}">
                        <i class="fas fa-eye mr-2"></i> View
                    </button>
                    <button class="flex-1 bg-white border border-blue-600 text-blue-600 py-2 rounded-lg text-sm font-medium flex items-center justify-center hover:bg-blue-50 download-pil-btn" data-pil-id="${pil.id}">
                        <i class="fas fa-download mr-2"></i> PDF
                    </button>
                </div>
            </div>
        </div>
    `;

    // Add event listeners to new buttons
    document.querySelectorAll('.view-pil-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            showPilModal(btn.dataset.pilId);
        });
    });

    document.querySelectorAll('.download-pil-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            downloadPil(btn.dataset.pilId);
        });
    });

    // Make entire card clickable
    featuredPilContainer.onclick = () => showPilModal(pil.id);
}

function renderRecentPils(pils) {
    if (pils.length === 0) {
        recentPilsContainer.innerHTML = `
            <div class="text-center py-4 text-gray-400">
                <p>No recently viewed leaflets</p>
            </div>
        `;
        return;
    }

    recentPilsContainer.innerHTML = pils.slice(0, 5).map(pil => `
        <div class="pil-card bg-white rounded-xl shadow-sm p-4 border border-gray-100 flex items-center" data-pil-id="${pil.id}">
            <div class="bg-blue-100 p-2 rounded-lg mr-3">
                <i class="fas fa-pills text-blue-600"></i>
            </div>
            <div class="flex-1">
                <h4 class="font-medium text-gray-800">${pil.product_name}</h4>
                <p class="text-xs text-gray-500">${pil.manufacturer?.name || 'Unknown'} • NAFDAC: ${pil.identifiers?.nafdac_reg_no || 'N/A'}</p>
                <div class="text-xs text-gray-400 mt-1">
                    Viewed ${formatTimeAgo(pil.last_viewed)}
                </div>
            </div>
            <div class="flex items-center space-x-2">
                <button class="p-2 text-blue-600 hover:bg-blue-50 rounded-full save-pil-btn" data-pil-id="${pil.id}">
                    <i class="fas ${pil.saved ? 'fa-bookmark text-yellow-500' : 'fa-bookmark'}"></i>
                </button>
                <i class="fas fa-chevron-right text-gray-400"></i>
            </div>
        </div>
    `).join('');

    // Add event listeners
    document.querySelectorAll('.pil-card[data-pil-id]').forEach(card => {
        card.addEventListener('click', () => showPilModal(card.dataset.pilId));
    });

    document.querySelectorAll('.save-pil-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            currentPilId = btn.dataset.pilId;
            await toggleSavePil();
        });
    });
}

function renderSavedPils(pils) {
    if (pils.length === 0) {
        savedPilsContainer.innerHTML = `
            <div class="text-center py-8 text-gray-400">
                <i class="fas fa-bookmark text-2xl mb-2"></i>
                <p>No saved leaflets yet</p>
                <p class="text-sm mt-2">Save frequently used leaflets for quick access</p>
            </div>
        `;
        return;
    }

    savedPilsContainer.innerHTML = pils.slice(0, 5).map(pil => `
        <div class="pil-card bg-white rounded-xl shadow-sm p-4 border border-gray-100 flex items-center" data-pil-id="${pil.id}">
            <div class="bg-blue-100 p-2 rounded-lg mr-3">
                <i class="fas fa-pills text-blue-600"></i>
            </div>
            <div class="flex-1">
                <h4 class="font-medium text-gray-800">${pil.product_name}</h4>
                <p class="text-xs text-gray-500">${pil.manufacturer?.name || 'Unknown'} • NAFDAC: ${pil.identifiers?.nafdac_reg_no || 'N/A'}</p>
                <div class="text-xs text-gray-400 mt-1">
                    Saved ${formatTimeAgo(pil.last_viewed)}
                </div>
            </div>
            <div class="flex items-center space-x-2">
                <button class="p-2 text-blue-600 hover:bg-blue-50 rounded-full download-pil-btn" data-pil-id="${pil.id}">
                    <i class="fas fa-download"></i>
                </button>
                <i class="fas fa-chevron-right text-gray-400"></i>
            </div>
        </div>
    `).join('');

    // Add event listeners
    document.querySelectorAll('.pil-card[data-pil-id]').forEach(card => {
        card.addEventListener('click', () => showPilModal(card.dataset.pilId));
    });

    document.querySelectorAll('.download-pil-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            downloadPil(btn.dataset.pilId);
        });
    });
}

// Helper function to format time
function formatTimeAgo(dateString) {
    if (!dateString) return '';
    const date = new Date(dateString);
    const now = new Date();
    const diffInSeconds = Math.floor((now - date) / 1000);
    
    if (diffInSeconds < 60) return 'just now';
    if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)} minutes ago`;
    if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)} hours ago`;
    return `${Math.floor(diffInSeconds / 86400)} days ago`;
}

async function showPilModal(pilId) {
    try {
        currentPilId = pilId;
        showLoadingState();
        
        pilModal.classList.remove('hidden');
        
        // Update history state
        history.replaceState({ pilView: true }, '', window.location.pathname);
        
        // First fetch the details
        const pilDetails = await fetchPilDetails(pilId);
        
        if (!pilDetails) {
            throw new Error('No details returned from server');
        }
        
        // Then record the view (don't await this to prevent blocking)
        recordPilView(pilId).catch(error => {
            console.error('Background view recording failed:', error);
        });
        
        renderPilModalContent(pilDetails);
        
        // Update save button state
        const isSaved = await checkIfPilIsSaved(pilId);
        savePilBtn.classList.toggle('text-yellow-500', isSaved);
        savePilBtn.classList.toggle('text-blue-600', !isSaved);
        
    } catch (error) {
        console.error('Error showing PIL modal:', error);
        showErrorState(error.message || 'Failed to load leaflet details');
    }
}

function showLoadingState() {
    pilModalContent.innerHTML = `
        <div class="flex justify-center items-center h-64">
            <div class="loader"></div>
        </div>
    `;
}

function showErrorState() {
    pilModalContent.innerHTML = `
        <div class="text-center py-12 text-gray-400">
            <i class="fas fa-exclamation-triangle text-2xl mb-2"></i>
            <p>Failed to load leaflet details</p>
            <button class="mt-4 text-blue-600 text-sm font-medium" onclick="window.location.reload()">
                <i class="fas fa-sync-alt mr-1"></i> Try Again
            </button>
        </div>
    `;
}

async function checkIfPilIsSaved(pilId) {
    try {
        const savedPils = await fetchSavedPils();
        return savedPils.some(pil => pil.id === pilId);
    } catch (error) {
        console.error('Error checking saved status:', error);
        return false;
    }
}

function renderPilModalContent(pil) {
    pilModalContent.innerHTML = `
        <!-- Drug Header -->
        <div class="mb-6 text-center">
            <div class="bg-blue-50 p-6 rounded-xl inline-block mb-4">
                <i class="fas fa-pills text-blue-600 text-4xl"></i>
            </div>
            <h3 class="font-bold text-2xl mb-1 text-gray-800">${pil.product_name}</h3>
            <p class="text-gray-500 mb-4">${pil.manufacturer?.name || 'Unknown'} • NAFDAC: ${pil.identifiers?.nafdac_reg_no || 'N/A'}</p>
            
            <!-- Quick Info -->
            <div class="grid grid-cols-3 gap-2 mb-6">
                <div class="bg-blue-50 p-2 rounded-lg text-center">
                    <div class="text-blue-600 mb-1">
                        <i class="fas fa-capsules"></i>
                    </div>
                    <p class="text-xs font-medium">${pil.dosage_form || 'N/A'}</p>
                </div>
                <div class="bg-blue-50 p-2 rounded-lg text-center">
                    <div class="text-blue-600 mb-1">
                        <i class="fas fa-box"></i>
                    </div>
                    <p class="text-xs font-medium">${pil.pack_size || 'N/A'}</p>
                </div>
                <div class="bg-blue-50 p-2 rounded-lg text-center">
                    <div class="text-blue-600 mb-1">
                        <i class="fas fa-calendar-check"></i>
                    </div>
                    <p class="text-xs font-medium">${pil.approval?.expiry_date ? 'Expires: ' + pil.approval.expiry_date : 'N/A'}</p>
                </div>
            </div>
        </div>
        
        <!-- PIL Tabs -->
        <div class="flex border-b border-gray-200 mb-4 overflow-x-auto">
            <button class="tab-active flex-1 py-2 text-sm font-medium text-center min-w-max px-4" data-tab="overview">
                Overview
            </button>
            <button class="tab flex-1 py-2 text-sm font-medium text-center text-gray-500 hover:text-gray-700 min-w-max px-4" data-tab="composition">
                Composition
            </button>
            <button class="tab flex-1 py-2 text-sm font-medium text-center text-gray-500 hover:text-gray-700 min-w-max px-4" data-tab="dosage">
                Dosage
            </button>
            <button class="tab flex-1 py-2 text-sm font-medium text-center text-gray-500 hover:text-gray-700 min-w-max px-4" data-tab="side-effects">
                Side Effects
            </button>
        </div>
        
        <!-- Tab Content Container -->
        <div id="tab-content-container">
            ${renderOverviewTab(pil)}
        </div>
        
        <!-- Important Safety Info -->
        <div class="bg-blue-50 rounded-xl p-4 mb-6">
            <div class="flex items-start">
                <div class="bg-blue-100 p-2 rounded-full mr-3">
                    <i class="fas fa-exclamation-triangle text-blue-600 text-sm"></i>
                </div>
                <div>
                    <p class="text-sm font-medium text-blue-800 mb-1">Important Safety Information</p>
                    <p class="text-xs text-blue-700">${pil.documents?.pil?.contraindications || 'No specific safety information available'}</p>
                </div>
            </div>
        </div>
        
        <!-- Manufacturer Info -->
        <div class="border border-gray-200 rounded-xl p-4">
            <h4 class="font-bold mb-2 text-gray-800 flex items-center">
                <i class="fas fa-industry mr-2 text-blue-600"></i>
                Manufacturer
            </h4>
            <p class="text-sm text-gray-700 mb-1">${pil.manufacturer?.name || 'Unknown manufacturer'}</p>
            <p class="text-xs text-gray-500">Last updated: ${pil.updated_at ? new Date(pil.updated_at).toLocaleDateString() : 'N/A'}</p>
        </div>
    `;

    // Setup tab switching
    setupTabSwitcher(pil);
}

function renderOverviewTab(pil) {
    return `
        <div id="overview-tab" class="tab-content active">
            <div class="mb-8">
                <h4 class="font-bold mb-3 text-blue-800">Description</h4>
                <p class="text-sm text-gray-700 mb-4">${pil.description || 'No description available'}</p>
                
                <h4 class="font-bold mb-3 text-blue-800">Indications</h4>
                <ul class="text-sm text-gray-700 mb-4 list-disc pl-5 space-y-1">
                    ${pil.documents?.pil?.therapeutic_use?.indications?.map(ind => `
                        <li>${ind}</li>
                    `).join('') || '<li>No indications specified</li>'}
                </ul>
                
                <h4 class="font-bold mb-3 text-blue-800">Pharmacology</h4>
                <p class="text-sm text-gray-700">${pil.composition || 'No pharmacology information available'}</p>
            </div>
        </div>
        <div id="composition-tab" class="tab-content hidden">
            ${renderCompositionTab(pil)}
        </div>
        <div id="dosage-tab" class="tab-content hidden">
            ${renderDosageTab(pil)}
        </div>
        <div id="side-effects-tab" class="tab-content hidden">
            ${renderSideEffectsTab(pil)}
        </div>
    `;
}

function renderCompositionTab(pil) {
    return `
        <div class="mb-8">
            <h4 class="font-bold mb-3 text-blue-800">Active Ingredients</h4>
            <p class="text-sm text-gray-700 mb-4">${pil.strength || 'Not specified'}</p>
            
            <h4 class="font-bold mb-3 text-blue-800">Full Composition</h4>
            <p class="text-sm text-gray-700 whitespace-pre-line">${pil.composition || 'No composition information available'}</p>
            
            ${pil.documents?.pil?.interactions?.length ? `
                <h4 class="font-bold mb-3 text-blue-800 mt-6">Drug Interactions</h4>
                <ul class="text-sm text-gray-700 mb-4 list-disc pl-5 space-y-1">
                    ${pil.documents.pil.interactions.map(int => `<li>${int}</li>`).join('')}
                </ul>
            ` : ''}
        </div>
    `;
}

function renderDosageTab(pil) {
    const admin = pil.documents?.pil?.administration;
    return `
        <div class="mb-8">
            <h4 class="font-bold mb-3 text-blue-800">Administration Method</h4>
            <p class="text-sm text-gray-700 mb-4">${admin?.method || 'Not specified'}</p>
            
            <h4 class="font-bold mb-3 text-blue-800">Recommended Dosage</h4>
            <p class="text-sm text-gray-700 mb-4">${admin?.dosage || 'Dosage to be determined by healthcare provider'}</p>
            
            ${admin?.precautions?.length ? `
                <h4 class="font-bold mb-3 text-blue-800">Precautions</h4>
                <ul class="text-sm text-gray-700 mb-4 list-disc pl-5 space-y-1">
                    ${admin.precautions.map(precaution => `<li>${precaution}</li>`).join('')}
                </ul>
            ` : ''}
        </div>
    `;
}

function renderSideEffectsTab(pil) {
    const sideEffects = pil.documents?.pil?.side_effects;
    return `
        <div class="mb-8">
            ${sideEffects?.very_common?.length ? `
                <div class="mb-6">
                    <h4 class="font-bold mb-3 text-blue-800">Very Common (&gt;1/10)</h4>
                    <ul class="text-sm text-gray-700 list-disc pl-5 space-y-1">
                        ${sideEffects.very_common.map(effect => `<li>${effect}</li>`).join('')}
                    </ul>
                </div>
            ` : ''}
            
            ${sideEffects?.common?.length ? `
                <div class="mb-6">
                    <h4 class="font-bold mb-3 text-blue-800">Common (&gt;1/100 to &lt;1/10)</h4>
                    <ul class="text-sm text-gray-700 list-disc pl-5 space-y-1">
                        ${sideEffects.common.map(effect => `<li>${effect}</li>`).join('')}
                    </ul>
                </div>
            ` : ''}
            
            ${sideEffects?.uncommon?.length ? `
                <div class="mb-6">
                    <h4 class="font-bold mb-3 text-blue-800">Uncommon (&gt;1/1,000 to &lt;1/100)</h4>
                    <ul class="text-sm text-gray-700 list-disc pl-5 space-y-1">
                        ${sideEffects.uncommon.map(effect => `<li>${effect}</li>`).join('')}
                    </ul>
                </div>
            ` : ''}
            
            ${sideEffects?.rare?.length ? `
                <div class="mb-6">
                    <h4 class="font-bold mb-3 text-blue-800">Rare (&gt;1/10,000 to &lt;1/1,000)</h4>
                    <ul class="text-sm text-gray-700 list-disc pl-5 space-y-1">
                        ${sideEffects.rare.map(effect => `<li>${effect}</li>`).join('')}
                    </ul>
                </div>
            ` : ''}
            
            ${sideEffects?.very_rare?.length ? `
                <div class="mb-6">
                    <h4 class="font-bold mb-3 text-blue-800">Very Rare (&lt;1/10,000)</h4>
                    <ul class="text-sm text-gray-700 list-disc pl-5 space-y-1">
                        ${sideEffects.very_rare.map(effect => `<li>${effect}</li>`).join('')}
                    </ul>
                </div>
            ` : ''}
            
            ${sideEffects?.unknown?.length ? `
                <div class="mb-6">
                    <h4 class="font-bold mb-3 text-blue-800">Unknown Frequency</h4>
                    <ul class="text-sm text-gray-700 list-disc pl-5 space-y-1">
                        ${sideEffects.unknown.map(effect => `<li>${effect}</li>`).join('')}
                    </ul>
                </div>
            ` : ''}
        </div>
    `;
}

function setupTabSwitcher(pil) {
    document.querySelectorAll('.tab').forEach(tab => {
        tab.addEventListener('click', function() {
            // Update active tab styling
            document.querySelectorAll('.tab').forEach(t => {
                t.classList.remove('tab-active');
                t.classList.add('text-gray-500', 'hover:text-gray-700');
            });
            this.classList.add('tab-active');
            this.classList.remove('text-gray-500', 'hover:text-gray-700');
            
            // Show the corresponding content
            const tabId = this.dataset.tab;
            document.querySelectorAll('.tab-content').forEach(content => {
                content.classList.add('hidden');
                content.classList.remove('active');
            });
            
            const contentElement = document.getElementById(`${tabId}-tab`);
            if (contentElement) {
                contentElement.classList.remove('hidden');
                contentElement.classList.add('active');
            }
        });
    });
}

// Error handling
window.addEventListener('error', (event) => {
    console.error('Unhandled error:', event.error);
});
