document.addEventListener('DOMContentLoaded', function() {
    // DOM Elements
    const hamburger = document.getElementById('hamburger');
    const mobileMenu = document.getElementById('mobile-menu');
    const searchForm = document.getElementById('searchForm');
    const searchInput = document.getElementById('drug-search');
    const resultsSection = document.createElement('section');
    const viewLeafletBtn = document.querySelector('.view-leaflet-btn');
    const pilModal = document.getElementById('pil-modal');
    const closePilBtn = document.getElementById('close-pil');
    
    // Create results section if it doesn't exist
    resultsSection.id = 'search-results';
    resultsSection.className = 'py-16 bg-white hidden';
    resultsSection.innerHTML = `
        <div class="container mx-auto px-4">
            <div class="max-w-3xl mx-auto">
                <div class="flex justify-between items-center mb-6">
                    <h2 class="text-2xl font-bold font-serif">Search Results</h2>
                    <button id="new-search" class="text-primary hover:text-secondary font-medium flex items-center">
                        <i class="fas fa-redo mr-2"></i> New Search
                    </button>
                </div>
                <div id="results-container" class="space-y-6"></div>
                <div id="loading-indicator" class="hidden text-center py-12">
                    <div class="inline-block loader mb-4"></div>
                    <p class="text-gray-600">Searching for leaflets...</p>
                </div>
            </div>
        </div>
    `;
    document.querySelector('section.bg-white').before(resultsSection);
    
    // Mobile menu toggle with animation
    if (hamburger && mobileMenu) {
        hamburger.addEventListener('click', function() {
            mobileMenu.classList.toggle('hidden');
            document.body.style.overflow = mobileMenu.classList.contains('hidden') ? '' : 'hidden';
            
            // Animate hamburger icon
            const lines = this.querySelectorAll('.hamburger-line');
            if (mobileMenu.classList.contains('hidden')) {
                lines[0].style.transform = '';
                lines[1].style.opacity = '';
                lines[2].style.transform = '';
            } else {
                lines[0].style.transform = 'translateY(8px) rotate(45deg)';
                lines[1].style.opacity = '0';
                lines[2].style.transform = 'translateY(-8px) rotate(-45deg)';
            }
        });
    }
    
    // Enhanced search form submission with debounce
    if (searchForm) {
        let searchTimeout;
        
        // Real-time search on input (with debounce)
        searchInput.addEventListener('input', function() {
            clearTimeout(searchTimeout);
            if (this.value.trim().length >= 2) {
                searchTimeout = setTimeout(() => {
                    searchForm.dispatchEvent(new Event('submit'));
                }, 500);
            }
        });
        
        searchForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            const searchTerm = searchInput.value.trim();
            
            if (searchTerm.length < 2) {
                showToast('Please enter at least 2 characters to search', 'error');
                return;
            }
            
            try {
                // Show loading state
                const submitBtn = searchForm.querySelector('button[type="submit"]');
                const originalBtnText = submitBtn.innerHTML;
                submitBtn.innerHTML = '<i class="fas fa-circle-notch fa-spin mr-2"></i> Searching...';
                submitBtn.disabled = true;
                
                document.getElementById('loading-indicator').classList.remove('hidden');
                document.getElementById('results-container').innerHTML = '';
                resultsSection.classList.remove('hidden');
                
                // Call API to search for leaflets
                const response = await searchLeaflets(searchTerm);
                
                // Display results
                displaySearchResults(response.results);
                
                // Show suggestions if available
                if (response.suggestions && response.suggestions.length > 0) {
                    showSuggestions(response.suggestions);
                }
                
            } catch (error) {
                console.error('Search error:', error);
                showToast(error.message || 'An error occurred while searching. Please try again.', 'error');
                document.getElementById('results-container').innerHTML = `
                    <div class="text-center py-12">
                        <i class="fas fa-exclamation-triangle text-red-400 text-4xl mb-4"></i>
                        <h3 class="text-lg font-medium text-gray-700 mb-2">Search Failed</h3>
                        <p class="text-gray-500">${error.message || 'Please try your search again'}</p>
                    </div>
                `;
            } finally {
                // Reset button state
                const submitBtn = searchForm.querySelector('button[type="submit"]');
                submitBtn.innerHTML = '<i class="fas fa-search mr-2"></i> Search Leaflets';
                submitBtn.disabled = false;
                document.getElementById('loading-indicator').classList.add('hidden');
            }
        });
    }
    
    // Show search suggestions
    function showSuggestions(suggestions) {
        const suggestionsHTML = `
            <div class="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
                <h4 class="font-medium text-blue-800 mb-2">Did you mean:</h4>
                <div class="flex flex-wrap gap-2">
                    ${suggestions.map(suggestion => `
                        <button class="suggestion-btn bg-white text-blue-600 hover:bg-blue-100 px-3 py-1 rounded-full text-sm font-medium border border-blue-200">
                            ${suggestion}
                        </button>
                    `).join('')}
                </div>
            </div>
        `;
        
        const resultsContainer = document.getElementById('results-container');
        if (resultsContainer.firstChild) {
            resultsContainer.insertAdjacentHTML('afterbegin', suggestionsHTML);
        } else {
            resultsContainer.innerHTML = suggestionsHTML;
        }
        
        // Add event listeners to suggestion buttons
        document.querySelectorAll('.suggestion-btn').forEach(btn => {
            btn.addEventListener('click', function() {
                searchInput.value = this.textContent;
                searchForm.dispatchEvent(new Event('submit'));
            });
        });
    }
    
    // New search button
    document.addEventListener('click', function(e) {
        if (e.target && e.target.id === 'new-search') {
            resultsSection.classList.add('hidden');
            searchInput.value = '';
            searchInput.focus();
        }
    });
    
    // View sample leaflet button
    if (viewLeafletBtn) {
        viewLeafletBtn.addEventListener('click', function() {
            showLeafletModal({
                id: 'sample-pil',
                product_name: 'Paracetamol 500mg Tablets',
                generic_name: 'Paracetamol',
                dosage_form: 'Tablets',
                strength: '500mg',
                description: 'White, capsule-shaped tablets with "P500" marked on one side.',
                manufacturer: {
                    name: 'GSK Pharmaceuticals',
                    country: 'United Kingdom'
                },
                identifiers: {
                    nafdac_reg_no: 'A4-100147'
                },
                documents: {
                    pil: {
                        therapeutic_use: {
                            description: "For the relief of mild to moderate pain and fever",
                            indications: ["Headache", "Toothache", "Muscle pain", "Fever"]
                        },
                        contraindications: "Hypersensitivity to paracetamol or any excipients",
                        administration: {
                            method: "Oral",
                            dosage: "Adults: 1-2 tablets every 4-6 hours as needed",
                            precautions: ["Do not exceed 8 tablets in 24 hours", "Consult doctor if symptoms persist"]
                        },
                        side_effects: {
                            rare: ["Skin rash", "Blood disorders"],
                            very_rare: ["Serious skin reactions"]
                        },
                        storage: ["Store below 25°C", "Keep in original packaging"]
                    }
                },
                category: "ANALGESICS"
            });
        });
    }
    
    // Close leaflet modal
    if (closePilBtn) {
        closePilBtn.addEventListener('click', function() {
            pilModal.classList.add('hidden');
            document.body.style.overflow = '';
        });
    }
    
    // Close modal when clicking outside
    pilModal.addEventListener('click', function(e) {
        if (e.target === this) {
            this.classList.add('hidden');
            document.body.style.overflow = '';
        }
    });
    
    // Search leaflets API call
    async function searchLeaflets(searchTerm) {
        const response = await fetch(`https://lyre-4m8l.onrender.com/api/test_pil/?search=${encodeURIComponent(searchTerm)}`);
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.detail || 'Search failed');
        }
        
        return await response.json();
    }
    
    // Display search results with proper data mapping
    function displaySearchResults(results) {
        const resultsContainer = document.getElementById('results-container');
        
        if (!results || results.length === 0) {
            resultsContainer.innerHTML = `
                <div class="text-center py-12">
                    <i class="fas fa-search text-gray-300 text-5xl mb-4"></i>
                    <h3 class="text-xl font-medium text-gray-600 mb-2">No leaflets found</h3>
                    <p class="text-gray-500">Try a different search term or check the spelling.</p>
                </div>
            `;
            return;
        }
        
        resultsContainer.innerHTML = results.map(pil => `
            <div class="pil-card bg-white rounded-xl shadow-lg overflow-hidden transition-all hover:shadow-md">
                <div class="p-6">
                    <div class="flex flex-col sm:flex-row gap-4">
                        <div class="bg-blue-100 text-blue-600 p-3 rounded-lg flex-shrink-0 self-start">
                            <i class="fas fa-pills text-xl"></i>
                        </div>
                        <div class="flex-1">
                            <div class="flex flex-col md:flex-row md:items-start md:justify-between gap-2 mb-3">
                                <div>
                                    <h3 class="text-xl font-bold font-serif">${pil.product_name}</h3>
                                    <p class="text-gray-600">${pil.generic_name || ''}</p>
                                </div>
                                ${pil.category ? `<span class="bg-gray-100 text-gray-800 text-xs px-2 py-1 rounded-full self-start">${pil.category}</span>` : ''}
                            </div>
                            
                            <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                                <div>
                                    <p class="text-sm text-gray-700"><strong class="text-gray-800">Manufacturer:</strong> ${pil.manufacturer?.name || 'Unknown'}</p>
                                    <p class="text-sm text-gray-700"><strong class="text-gray-800">NAFDAC No:</strong> ${pil.identifiers?.nafdac_reg_no || 'Not specified'}</p>
                                </div>
                                <div>
                                    <p class="text-sm text-gray-700"><strong class="text-gray-800">Dosage Form:</strong> ${pil.dosage_form || 'N/A'}</p>
                                    <p class="text-sm text-gray-700"><strong class="text-gray-800">Strength:</strong> ${pil.strength || 'N/A'}</p>
                                </div>
                            </div>
                            
                            ${pil.description ? `
                                <div class="mb-3">
                                    <p class="text-sm text-gray-700 line-clamp-2">${pil.description}</p>
                                </div>
                            ` : ''}
                            
                            <div class="flex flex-col xs:flex-row gap-3 pt-2">
                                <button class="view-pil-btn health-gradient hover:opacity-90 text-white py-2 px-4 rounded-lg text-sm font-medium flex items-center justify-center" 
                                        data-pil-id="${pil.id}">
                                    <i class="fas fa-eye mr-2"></i> View Details
                                </button>
                                <button class="download-pil-btn border border-primary text-primary hover:bg-blue-50 py-2 px-4 rounded-lg text-sm font-medium flex items-center justify-center" 
                                        data-pil-id="${pil.id}">
                                    <i class="fas fa-download mr-2"></i> Download
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `).join('');
        
        // Add event listeners to view buttons
        document.querySelectorAll('.view-pil-btn').forEach(btn => {
            btn.addEventListener('click', async function() {
                const pilId = this.getAttribute('data-pil-id');
                try {
                    const pil = await getPilDetails(pilId);
                    showLeafletModal(pil);
                } catch (error) {
                    console.error('Error loading leaflet:', error);
                    showToast('Could not load leaflet details', 'error');
                }
            });
        });
        
        // Add event listeners to download buttons
        document.querySelectorAll('.download-pil-btn').forEach(btn => {
            btn.addEventListener('click', function () {
                const pilId = this.getAttribute('data-pil-id');
                
                // Show login prompt instead of downloading
                showToast('Please log in to download the leaflet.', 'info');
            });
        });
    }
    
    // Get PIL details API call
    async function getPilDetails(pilId) {
        const response = await fetch(`https://lyre-4m8l.onrender.com/api/test_pil/${pilId}`);
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.detail || 'Failed to get leaflet details');
        }
        
        return await response.json();
    }
    
    // Show leaflet modal with proper data mapping
    function showLeafletModal(pil) {
        const modalContent = pilModal.querySelector('.p-6');
        
        // Format indications if available
        const indications = pil.documents?.pil?.therapeutic_use?.indications || [];
        const formattedIndications = indications.length > 0 
            ? `<ul class="list-disc pl-5 mt-1 space-y-1">${indications.map(i => `<li>${i}</li>`).join('')}</ul>`
            : '<p class="text-gray-500 text-sm">No indications provided</p>';
        
        // Format side effects if available
        const sideEffects = pil.documents?.pil?.side_effects || {};
        const formattedSideEffects = [];
        
        for (const [frequency, effects] of Object.entries(sideEffects)) {
            if (effects && effects.length > 0) {
                formattedSideEffects.push(`
                    <div class="mt-2">
                        <span class="font-medium capitalize">${frequency}:</span>
                        <ul class="list-disc pl-5 mt-1">
                            ${effects.map(effect => `<li>${effect}</li>`).join('')}
                        </ul>
                    </div>
                `);
            }
        }
        
        // Update modal content with PIL data
        modalContent.innerHTML = `
            <div class="sticky top-0 bg-white p-4 -mx-6 -mt-6 border-b flex items-center z-10">
                <button id="close-pil" class="text-gray-500 mr-4">
                    <i class="fas fa-chevron-left"></i>
                </button>
                <h2 class="font-bold text-lg font-serif text-gray-800 truncate flex-1">${pil.product_name}</h2>
            </div>
            
            <!-- Locked content notice for guests -->
            <div class="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
                <div class="flex items-start">
                    <i class="fas fa-lock text-blue-500 mt-1 mr-3"></i>
                    <div>
                        <h3 class="font-medium text-blue-800">Full Leaflet Locked</h3>
                        <p class="text-sm text-blue-700 mt-1">
                            To view complete drug information, please <a href="login.html" class="font-medium underline-animation">sign in</a> or <a href="register.html" class="font-medium underline-animation">create an account</a>.
                        </p>
                    </div>
                </div>
            </div>
            
            <!-- Leaflet preview -->
            <div class="mb-8 space-y-6">
                <!-- Basic Info -->
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <p class="text-sm text-gray-700"><strong>Generic Name:</strong> ${pil.generic_name || 'N/A'}</p>
                        <p class="text-sm text-gray-700"><strong>Manufacturer:</strong> ${pil.manufacturer?.name || 'Unknown'}</p>
                    </div>
                    <div>
                        <p class="text-sm text-gray-700"><strong>Dosage Form:</strong> ${pil.dosage_form || 'N/A'}</p>
                        <p class="text-sm text-gray-700"><strong>Strength:</strong> ${pil.strength || 'N/A'}</p>
                    </div>
                </div>
                
                <!-- Description -->
                ${pil.description ? `
                    <div>
                        <h4 class="font-bold text-gray-800 mb-2 flex items-center">
                            <i class="fas fa-info-circle text-blue-500 mr-2"></i>
                            Description
                        </h4>
                        <p class="text-gray-600 text-sm">${pil.description}</p>
                    </div>
                ` : ''}
                
                <!-- Indications -->
                <div>
                    <h4 class="font-bold text-gray-800 mb-2 flex items-center">
                        <i class="fas fa-tags text-blue-500 mr-2"></i>
                        Indications
                    </h4>
                    ${formattedIndications}
                </div>
                
                <!-- Dosage -->
                ${pil.documents?.pil?.administration?.dosage ? `
                    <div>
                        <h4 class="font-bold text-gray-800 mb-2 flex items-center">
                            <i class="fas fa-prescription-bottle-alt text-blue-500 mr-2"></i>
                            Dosage
                        </h4>
                        <p class="text-gray-600 text-sm">${pil.documents.pil.administration.dosage}</p>
                    </div>
                ` : ''}
                
                <!-- Side Effects -->
                ${formattedSideEffects.length > 0 ? `
                    <div class="bg-red-50 border border-red-200 rounded-lg p-4">
                        <h4 class="font-bold text-red-800 mb-2 flex items-center">
                            <i class="fas fa-exclamation-triangle text-red-500 mr-2"></i>
                            Side Effects
                        </h4>
                        <h4>Login to access</h4>
                    </div>
                ` : ''}
                
                <!-- Storage -->
                ${pil.documents?.pil?.storage?.length > 0 ? `
                    <div class="bg-green-50 border border-green-200 rounded-lg p-4">
                        <h4 class="font-bold text-green-800 mb-2 flex items-center">
                            <i class="fas fa-temperature-low text-green-500 mr-2"></i>
                            Storage Instructions
                        </h4>
                        <ul class="list-disc pl-5 mt-1">
                            Login to access
                        </ul>
                    </div>
                ` : ''}
            </div>
            
            <div class="flex flex-col sm:flex-row gap-3 justify-center py-6 border-t">
                <button id="download-pil" class="health-gradient hover:opacity-90 text-white py-3 px-6 rounded-full font-medium shadow-lg hover:shadow-xl flex items-center justify-center" 
                        data-pil-id="${pil.id}">
                    <i class="fas fa-lock mr-2"></i> Login to Download
                </button>
                <a href="mobile/login.html" class="border-2 border-primary text-primary hover:bg-blue-50 py-3 px-6 rounded-full font-medium transition-all flex items-center justify-center">
                    <i class="fas fa-user-plus mr-2"></i> Sign Up for Full Access
                </a>
            </div>
        `;
        
        // Add download event listener to modal button
        const downloadBtn = modalContent.querySelector('#download-pil');
        if (downloadBtn) {
            downloadBtn.addEventListener('click', function () {
                showToast('Please log in to download the leaflet.', 'info');
            });
        }

        
        // Re-attach close button event
        const newCloseBtn = modalContent.querySelector('#close-pil');
        if (newCloseBtn) {
            newCloseBtn.addEventListener('click', function() {
                pilModal.classList.add('hidden');
                document.body.style.overflow = '';
            });
        }
        
        // Show modal
        pilModal.classList.remove('hidden');
        document.body.style.overflow = 'hidden';
    }
    
    // Download PIL function
    async function downloadPil(pilId) {
        showToast('Preparing leaflet for download...', 'info');
        
        try {
            // Simulate API call delay
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            // In a real implementation, you would fetch the actual PDF from your backend
            // For now, we'll create a dummy PDF
            const pil = await getPilDetails(pilId);
            const blob = new Blob([`
                Product Information Leaflet
                ==========================
                
                Product Name: ${pil.product_name}
                Generic Name: ${pil.generic_name || 'N/A'}
                Manufacturer: ${pil.manufacturer?.name || 'Unknown'}
                NAFDAC Reg: ${pil.identifiers?.nafdac_reg_no || 'Not specified'}
                Dosage Form: ${pil.dosage_form || 'N/A'}
                Strength: ${pil.strength || 'N/A'}
                
                Description:
                ${pil.description || 'No description available'}
                
                Indications:
                ${pil.documents?.pil?.therapeutic_use?.indications?.join('\n- ') || 'No indications provided'}
                
                Dosage:
                ${pil.documents?.pil?.administration?.dosage || 'No dosage information'}
                
                Side Effects:
                ${formatSideEffectsForDownload(pil.documents?.pil?.side_effects)}
                
                Storage:
                ${pil.documents?.pil?.storage?.join('\n- ') || 'No storage instructions'}
                
                This is a simulated download. In a real implementation, this would be the actual PDF file.
            `], { type: 'application/pdf' });
            
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `leaflet-${pil.product_name.replace(/\s+/g, '-').toLowerCase()}.pdf`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            
            showToast('Leaflet download started', 'success');
        } catch (error) {
            console.error('Download error:', error);
            showToast('Failed to prepare leaflet for download', 'error');
        }
    }
    
    // Helper function to format side effects for download
    function formatSideEffectsForDownload(sideEffects) {
        if (!sideEffects) return 'No side effects information';
        
        let result = '';
        for (const [frequency, effects] of Object.entries(sideEffects)) {
            if (effects && effects.length > 0) {
                result += `${frequency.charAt(0).toUpperCase() + frequency.slice(1)}:\n`;
                result += effects.map(e => `- ${e}`).join('\n') + '\n\n';
            }
        }
        
        return result || 'No side effects information';
    }
    
    // Show toast notification
    function showToast(message, type = 'info') {
        // Remove existing toasts
        document.querySelectorAll('[class*="fixed bottom-4 right-4"]').forEach(el => el.remove());
        
        const toast = document.createElement('div');
        toast.className = `fixed bottom-4 right-4 px-6 py-3 rounded-lg shadow-lg text-white font-medium z-50 animate__animated animate__fadeInUp ${
            type === 'error' ? 'bg-red-500' : 
            type === 'success' ? 'bg-green-500' : 
            'bg-blue-500'
        }`;
        toast.innerHTML = `
            <div class="flex items-center">
                <i class="fas ${
                    type === 'error' ? 'fa-exclamation-circle' : 
                    type === 'success' ? 'fa-check-circle' : 
                    'fa-info-circle'
                } mr-2"></i>
                <span>${message}</span>
            </div>
        `;
        document.body.appendChild(toast);
        
        // Remove toast after 5 seconds
        setTimeout(() => {
            toast.classList.add('animate__fadeOutDown');
            setTimeout(() => toast.remove(), 500);
        }, 5000);
    }
});