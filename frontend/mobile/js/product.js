// Configuration
const API_BASE_URL = 'https://lyre-4m8l.onrender.com/api/pils';

function getQueryParam(param) {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get(param);
}

// DOM Elements
const pilModal = document.getElementById('pil-modal');
const closePilModal = document.getElementById('close-pil');
const pilModalContent = document.getElementById('pil-modal-content');
const savePilBtn = document.getElementById('save-pil');
const downloadPilBtn = document.geaElementById('download-pil');

// State
let currentPilId = null;

// Initialize the product view functionality
export function initProductView() {
    setupEventListeners();
}

function setupEventListeners() {
    // Modal close
    closePilModal.addEventListener('click', () => {
        pilModal.classList.add('hidden');
        history.replaceState(null, null, window.location.pathname);
    });

    // Save PIL
    savePilBtn.addEventListener('click', async () => {
    if (!currentPilId) return;
    
    // Show loading state
    savePilBtn.disabled = true;
    const originalHTML = savePilBtn.innerHTML;
    savePilBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
    
    try {
        await toggleSavePil();
    } catch (error) {
        console.error('Save error:', error);
    } finally {
        // Restore button state
        savePilBtn.disabled = false;
        savePilBtn.innerHTML = originalHTML;
    }
});

    // Download PIL
    downloadPilBtn.addEventListener('click', () => {
        if (!currentPilId) return;
        downloadPil(currentPilId);
    });
}

// Show PIL modal with details
export async function showPilModal(pilId) {
    try {
        currentPilId = pilId;
        showLoadingState();
        
        pilModal.classList.remove('hidden');
        
        // Update history state
        history.replaceState({ pilView: true }, '', window.location.pathname);
        
        // First record the view
        await recordPilView(pilId);
        
        // Then fetch the details
        const pilDetails = await fetchPilDetails(pilId);
        
        if (!pilDetails) {
            throw new Error('No details returned from server');
        }
        
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

function showErrorState(message = 'Failed to load leaflet details') {
    pilModalContent.innerHTML = `
        <div class="text-center py-12 text-gray-400">
            <i class="fas fa-exclamation-triangle text-2xl mb-2"></i>
            <p>${message}</p>
            <button class="mt-4 text-blue-600 text-sm font-medium" onclick="window.location.reload()">
                <i class="fas fa-sync-alt mr-1"></i> Try Again
            </button>
        </div>
    `;
}

function showLoadingState() {
    pilModalContent.innerHTML = `
        <div class="flex justify-center items-center h-64">
            <div class="loader"></div>
        </div>
    `;
}

async function fetchPilDetails(pilId) {
    const url = `${API_BASE_URL}/${pilId}`;
    const token = localStorage.getItem('nexahealth_access_token');
    const headers = {
        'Content-Type': 'application/json',
    };

    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }

    try {
        const response = await fetch(url, {
            method: 'GET',
            headers,
            credentials: 'include',
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.detail || `HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        
        // Add debug logging
        console.log('PIL details response:', data);
        
        if (!data || !data.id) {
            throw new Error('Invalid PIL data received');
        }
        
        return data;
    } catch (error) {
        console.error(`Error fetching PIL details for ID ${pilId}:`, error);
        throw error;
    }
}

async function recordPilView(pilId) {
    const url = `${API_BASE_URL}/${pilId}/view`;
    const token = localStorage.getItem('nexahealth_access_token');
    const headers = {
        'Content-Type': 'application/json',
    };
    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }

    const resp = await fetch(url, {
        method: 'POST',
        headers,
        credentials: 'include',
    });

    if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        console.warn('recordPilView failed:', err.detail || resp.status);
    }

    return resp.ok ? resp.json() : null;
}

async function toggleSavePil() {
    if (!currentPilId) return;

    try {
        const url = `${API_BASE_URL}/${currentPilId}/save`;
        const token = localStorage.getItem('nexahealth_access_token');
        const headers = {
            'Content-Type': 'application/json',
        };
        
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }

        const response = await fetch(url, {
            method: 'POST',
            headers,
            credentials: 'include',
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.detail || 'Failed to save leaflet');
        }

        // Get the actual saved state from the response
        const result = await response.json();
        const isSaved = result.saved; // Assuming backend returns {saved: true/false}

        // Update UI based on actual saved state
        savePilBtn.classList.toggle('text-blue-600', !isSaved);
        savePilBtn.classList.toggle('text-yellow-500', isSaved);

        // Refresh saved list
        try {
            const savedPils = await fetchSavedPils();
            renderSavedPils(savedPils);
        } catch (error) {
            console.error('Error refreshing saved list:', error);
        }

        return result;
    } catch (error) {
        console.error('Error saving PIL:', error);
        throw error;
    }
}

function downloadPil(pilId) {
    if (!pilId) return;
    
    // In a real implementation, this would download the PDF
    alert(`Downloading PIL with ID: ${pilId}`);
    // window.open(`${API_BASE_URL}/${pilId}/download`, '_blank');
}

async function checkIfPilIsSaved(pilId) {
    try {
        const savedPils = await fetchSavedPils();
        return savedPils.some(pil => pil.id.toString() === pilId.toString());
    } catch (error) {
        console.error('Error checking saved status:', error);
        return false;
    }
}

async function fetchSavedPils() {
    const url = `${API_BASE_URL}/saved`;
    const token = localStorage.getItem('nexahealth_access_token');
    const headers = {
        'Content-Type': 'application/json',
    };
    
    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }

    try {
        const response = await fetch(url, {
            headers,
            credentials: 'include',
        });

        if (response.status === 404) {
            // No saved leaflets yet
            return [];
        }

        if (!response.ok) {
            throw new Error('Failed to fetch saved PILs');
        }

        return await response.json();
    } catch (error) {
        console.error('Error fetching saved PILs:', error);
        return [];
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

    document.addEventListener('DOMContentLoaded', () => {
        const pilId = getQueryParam('pil_id');
        if (pilId) {
            showPilModal(pilId);
        }
    });
}