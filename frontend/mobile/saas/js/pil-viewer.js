// Add this at the top of verify.js
const PILViewer = {
    modal: document.getElementById('pil-modal'),
    content: document.getElementById('pil-modal-content'),
    closeBtn: document.getElementById('close-pil'),
    saveBtn: document.getElementById('save-pil'),
    downloadBtn: document.getElementById('download-pil'),
    currentPilId: null,

    init: function() {
        this.closeBtn.addEventListener('click', () => this.close());
        this.saveBtn.addEventListener('click', () => this.toggleSave());
        this.downloadBtn.addEventListener('click', () => this.download());
    },

    show: async function(pilId) {
        this.currentPilId = pilId;
        this.showLoading();
        this.modal.classList.remove('hidden');
        
        try {
            const pilDetails = await this.fetchPilDetails(pilId);
            this.renderPilContent(pilDetails);
            
            // Record view
            await this.recordView(pilId);
            
            // Check if saved
            const isSaved = await this.checkIfSaved(pilId);
            this.updateSaveButton(isSaved);
        } catch (error) {
            console.error('Error loading PIL:', error);
            this.showError('Failed to load leaflet details');
        }
    },

    close: function() {
        this.modal.classList.add('hidden');
        this.content.innerHTML = '';
        this.currentPilId = null;
    },

    showLoading: function() {
        this.content.innerHTML = `
            <div class="flex justify-center items-center h-64">
                <div class="loader"></div>
            </div>
        `;
    },

    showError: function(message) {
        this.content.innerHTML = `
            <div class="text-center py-12 text-gray-400">
                <i class="fas fa-exclamation-triangle text-2xl mb-2"></i>
                <p>${message}</p>
                <button class="mt-4 text-blue-600 text-sm font-medium" onclick="PILViewer.show('${this.currentPilId}')">
                    <i class="fas fa-sync-alt mr-1"></i> Try Again
                </button>
            </div>
        `;
    },

    fetchPilDetails: async function(pilId) {
        const token = localStorage.getItem('nexahealth_access_token');
        if (!token) {
            throw new Error('No access token');
        }

        const response = await fetch(`https://lyre-4m8l.onrender.com/api/pils/${pilId}`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (!response.ok) {
            throw new Error('Failed to fetch PIL');
        }

        return await response.json();
    },

    recordView: async function(pilId) {
        const token = localStorage.getItem('nexahealth_access_token');
        if (!token) return;

        try {
            await fetch(`https://lyre-4m8l.onrender.com/api/pils/${pilId}/view`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
        } catch (error) {
            console.error('Failed to record view:', error);
        }
    },

    toggleSave: async function() {
        if (!this.currentPilId) return;
        
        try {
            const token = localStorage.getItem('nexahealth_access_token');
            if (!token) {
                throw new Error('Not authenticated');
            }

            const response = await fetch(`https://lyre-4m8l.onrender.com/api/pils/${this.currentPilId}/save`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (!response.ok) {
                throw new Error('Failed to save');
            }

            const result = await response.json();
            this.updateSaveButton(result.saved);
            
            // Show toast notification
            showToast(result.saved ? 'Leaflet saved' : 'Leaflet unsaved');
        } catch (error) {
            console.error('Error saving PIL:', error);
            showToast(error.message || 'Failed to save leaflet', 'error');
        }
    },

    download: function() {
        if (!this.currentPilId) return;
        window.open(`https://lyre-4m8l.onrender.com/api/pils/${this.currentPilId}/download`, '_blank');
    },

    checkIfSaved: async function(pilId) {
        try {
            const token = localStorage.getItem('nexahealth_access_token');
            if (!token) return false;

            const response = await fetch('https://lyre-4m8l.onrender.com/api/pils/saved', {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (!response.ok) return false;

            const savedPils = await response.json();
            return savedPils.some(pil => pil.id === pilId);
        } catch (error) {
            console.error('Error checking saved status:', error);
            return false;
        }
    },

    updateSaveButton: function(isSaved) {
        this.saveBtn.classList.toggle('text-blue-600', !isSaved);
        this.saveBtn.classList.toggle('text-yellow-500', isSaved);
    },

    renderPilContent: function(pil) {
        this.content.innerHTML = `
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
                ${this.renderOverviewTab(pil)}
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

        this.setupTabSwitcher();
    },

    renderOverviewTab: function(pil) {
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
                ${this.renderCompositionTab(pil)}
            </div>
            <div id="dosage-tab" class="tab-content hidden">
                ${this.renderDosageTab(pil)}
            </div>
            <div id="side-effects-tab" class="tab-content hidden">
                ${this.renderSideEffectsTab(pil)}
            </div>
        `;
    },

    renderCompositionTab: function(pil) {
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
    },

    renderDosageTab: function(pil) {
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
    },

    renderSideEffectsTab: function(pil) {
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
    },

    setupTabSwitcher: function() {
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
};

// Initialize the PIL viewer when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    PILViewer.init();
});

// Helper function to show toast notifications
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

// Update the viewPIL function in verify.js
window.viewPIL = function(pilId) {
    PILViewer.show(pilId);
};