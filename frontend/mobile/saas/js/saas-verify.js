// pharmacy-verify.js - Drug Verification for Pharmacy SaaS
document.addEventListener('DOMContentLoaded', function() {
    if (!document.getElementById('verification-form')) {
        return; // Skip initialization if not on pharmacy verify page
    }
    
    // DOM Elements
    const verificationForm = document.getElementById('verification-form');
    const drugNameInput = document.getElementById('drug-name');
    const manufacturerInput = document.getElementById('manufacturer');
    const nafdacInput = document.getElementById('nafdac-number');
    const resultSection = document.getElementById('result-section');
    const resultContent = document.getElementById('result-content');
    const newVerificationBtn = document.getElementById('new-verification');

    // Token configuration
    const TOKEN_KEYS = [
        'nexahealth_pharmacy_token',
        'access_token'
    ];

    // API Configuration
    const API_BASE_URL = 'https://lyre-4m8l.onrender.com';
    const REQUEST_TIMEOUT = 15000;

    // Initialize
    initializeVerification();

    function initializeVerification() {
        setupEventListeners();
        checkAuthentication();
    }

    function setupEventListeners() {
        // Form submission
        verificationForm.addEventListener('submit', handleVerificationSubmit);
        
        // New verification button
        newVerificationBtn.addEventListener('click', resetVerificationForm);
        
        // Input validation - only basic validation now
        setupInputValidation();
    }

    function getAuthToken() {
        for (const k of TOKEN_KEYS) {
            const v = sessionStorage.getItem(k) || localStorage.getItem(k);
            if (v) return v;
        }
        return null;
    }

    function isAuthenticated() {
        return !!getAuthToken();
    }

    function checkAuthentication() {
        if (!isAuthenticated()) {
            showAlert('Please log in to verify drugs', 'error');
            setTimeout(() => {
                window.location.href = 'index.html';
            }, 2000);
            return false;
        }
        return true;
    }

    function setupInputValidation() {
        // Only basic validation - ensure at least one field is filled
        const inputs = [drugNameInput, manufacturerInput, nafdacInput];
        
        inputs.forEach(input => {
            input.addEventListener('input', function() {
                clearFieldError(this);
                updateSubmitButtonState();
            });
        });
    }

    function updateSubmitButtonState() {
        const submitButton = verificationForm.querySelector('button[type="submit"]');
        const hasAnyInput = drugNameInput.value.trim() || 
                           manufacturerInput.value.trim() || 
                           nafdacInput.value.trim();
        
        submitButton.disabled = !hasAnyInput;
        submitButton.classList.toggle('opacity-50', !hasAnyInput);
        submitButton.classList.toggle('cursor-not-allowed', !hasAnyInput);
    }

    async function makeAuthenticatedRequest(endpoint, options = {}) {
        const url = `${API_BASE_URL}${endpoint}`;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

        try {
            const token = getAuthToken();
            if (!token) {
                throw new Error('No authentication token found');
            }

            const defaultHeaders = {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            };

            const response = await fetch(url, {
                ...options,
                headers: {
                    ...defaultHeaders,
                    ...options.headers
                },
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            // Handle token expiration
            if (response.status === 401) {
                clearAuth();
                throw new Error('Session expired. Please login again.');
            }

            return response;

        } catch (error) {
            clearTimeout(timeoutId);
            if (error.name === 'AbortError') {
                throw new Error('Request timeout. Please check your connection.');
            }
            throw error;
        }
    }

    function clearAuth() {
        TOKEN_KEYS.forEach(key => {
            sessionStorage.removeItem(key);
            localStorage.removeItem(key);
        });
    }

    async function handleVerificationSubmit(e) {
        e.preventDefault();
        
        if (!checkAuthentication()) {
            return;
        }

        // Validate form - now only check if at least one field is filled
        if (!validateForm()) {
            return;
        }

        try {
            showLoadingState();
            
            const verificationData = {
                product_name: drugNameInput.value.trim() || undefined,
                manufacturer: manufacturerInput.value.trim() || undefined,
                nafdac_reg_no: nafdacInput.value.trim() || undefined
            };

            // Remove undefined values
            Object.keys(verificationData).forEach(key => {
                if (verificationData[key] === undefined) {
                    delete verificationData[key];
                }
            });

            console.log('Sending verification data:', verificationData);

            const response = await makeAuthenticatedRequest('/api/verify/drug', {
                method: 'POST',
                body: JSON.stringify(verificationData)
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.detail || `Verification failed with status ${response.status}`);
            }

            const data = await response.json();
            displayVerificationResults(data);

        } catch (error) {
            console.error('Verification error:', error);
            showErrorState('Verification Failed', error.message || 'Unable to verify medication. Please try again.');
        }
    }

    function validateForm() {
        const drugName = drugNameInput.value.trim();
        const manufacturer = manufacturerInput.value.trim();
        const nafdac = nafdacInput.value.trim();
        
        // Check if at least one field is filled
        if (!drugName && !manufacturer && !nafdac) {
            showAlert('Please enter at least one search criteria (drug name, manufacturer, or NAFDAC number)', 'error');
            drugNameInput.focus();
            return false;
        }

        return true;
    }

    function showFieldError(inputElement, message) {
        clearFieldError(inputElement);
        
        inputElement.classList.add('border-red-500', 'focus:ring-red-500');
        
        const errorDiv = document.createElement('div');
        errorDiv.className = 'text-red-500 text-xs mt-1 flex items-center';
        errorDiv.innerHTML = `<i class="fas fa-exclamation-circle mr-1"></i> ${message}`;
        
        inputElement.parentNode.appendChild(errorDiv);
    }

    function clearFieldError(inputElement) {
        inputElement.classList.remove('border-red-500', 'focus:ring-red-500');
        inputElement.classList.add('border-gray-300', 'focus:ring-blue-500');
        
        const existingError = inputElement.parentNode.querySelector('.text-red-500');
        if (existingError) {
            existingError.remove();
        }
    }

    function showLoadingState() {
        resultSection.classList.remove('hidden');
        resultContent.innerHTML = `
            <div class="text-center py-8">
                <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
                <p class="text-gray-600">Verifying medication...</p>
                <p class="text-sm text-gray-500 mt-2">Searching our database for matches</p>
            </div>
        `;
        
        // Scroll to results
        resultSection.scrollIntoView({ behavior: 'smooth' });
    }

    function showErrorState(title, message) {
        resultContent.innerHTML = `
            <div class="text-center py-6">
                <div class="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <i class="fas fa-exclamation-triangle text-red-600 text-2xl"></i>
                </div>
                <h4 class="text-lg font-semibold text-gray-800 mb-2">${title}</h4>
                <p class="text-gray-600 mb-4">${message}</p>
                <button onclick="resetVerificationForm()" 
                    class="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg transition-colors">
                    Try Again
                </button>
            </div>
        `;
    }

    function displayVerificationResults(data) {
        console.log("Verification Results:", data);
        
        const statusConfig = getStatusConfig(data.status);
        const trustScore = data.match_score || 0;
        
        // Determine search type for better messaging
        const searchType = getSearchType(data);
        
        resultContent.innerHTML = `
            <div class="space-y-4">
                <!-- Status Header -->
                <div class="${statusConfig.bgColor} ${statusConfig.textColor} rounded-xl p-4 text-center">
                    <div class="flex items-center justify-center mb-2">
                        <i class="${statusConfig.icon} text-2xl mr-2"></i>
                        <h4 class="text-lg font-semibold">${statusConfig.title}</h4>
                    </div>
                    <p class="text-sm opacity-90">${getEnhancedMessage(data, searchType)}</p>
                </div>

                <!-- Search Criteria Used -->
                <div class="bg-blue-50 rounded-xl p-3">
                    <h5 class="font-semibold text-blue-800 mb-2 flex items-center text-sm">
                        <i class="fas fa-search mr-2"></i>
                        Search Criteria
                    </h5>
                    <div class="text-sm text-blue-700">
                        ${getSearchCriteriaText()}
                    </div>
                </div>

                <!-- Drug Information -->
                ${data.product_name || data.manufacturer || data.nafdac_reg_no ? `
                <div class="bg-gray-50 rounded-xl p-4">
                    <h5 class="font-semibold text-gray-800 mb-3 flex items-center">
                        <i class="fas fa-pills text-blue-600 mr-2"></i>
                        ${data.product_name ? 'Matched Drug Information' : 'Search Results'}
                    </h5>
                    <div class="space-y-2">
                        ${data.product_name ? `
                        <div class="flex justify-between">
                            <span class="text-gray-600">Product Name:</span>
                            <span class="font-medium">${escapeHtml(data.product_name)}</span>
                        </div>
                        ` : ''}
                        
                        ${data.manufacturer ? `
                        <div class="flex justify-between">
                            <span class="text-gray-600">Manufacturer:</span>
                            <span class="font-medium">${escapeHtml(data.manufacturer)}</span>
                        </div>
                        ` : ''}
                        
                        ${data.nafdac_reg_no ? `
                        <div class="flex justify-between">
                            <span class="text-gray-600">NAFDAC Number:</span>
                            <span class="font-medium">${escapeHtml(data.nafdac_reg_no)}</span>
                        </div>
                        ` : ''}
                    </div>
                </div>
                ` : ''}

                <!-- Trust Score -->
                <div class="bg-white border border-gray-200 rounded-xl p-4">
                    <div class="flex justify-between items-center mb-2">
                        <span class="text-sm font-medium text-gray-700">Match Confidence</span>
                        <span class="text-sm font-bold ${getTrustScoreColor(trustScore)}">${trustScore}%</span>
                    </div>
                    <div class="w-full bg-gray-200 rounded-full h-2.5">
                        <div class="h-2.5 rounded-full ${getTrustScoreBarColor(trustScore)}" 
                             style="width: ${trustScore}%"></div>
                    </div>
                    <p class="text-xs text-gray-500 mt-1">${getTrustScoreText(trustScore, data, searchType)}</p>
                </div>

                <!-- Additional Information -->
                ${getAdditionalInfoHTML(data)}

                <!-- Action Buttons -->
                <div class="space-y-3 pt-2">
                    ${getActionButtonsHTML(data)}
                </div>

                <!-- Possible Matches -->
                ${getPossibleMatchesHTML(data)}
            </div>
        `;
    }

    function getSearchType(data) {
        const drugName = drugNameInput.value.trim();
        const manufacturer = manufacturerInput.value.trim();
        const nafdac = nafdacInput.value.trim();

        if (nafdac && !drugName && !manufacturer) return 'nafdac_only';
        if (manufacturer && !drugName && !nafdac) return 'manufacturer_only';
        if (drugName && !manufacturer && !nafdac) return 'drugname_only';
        if (drugName && manufacturer && !nafdac) return 'drugname_manufacturer';
        if (drugName && nafdac && !manufacturer) return 'drugname_nafdac';
        if (manufacturer && nafdac && !drugName) return 'manufacturer_nafdac';
        return 'combined';
    }

    function getSearchCriteriaText() {
        const criteria = [];
        if (drugNameInput.value.trim()) criteria.push(`Drug Name: "${drugNameInput.value.trim()}"`);
        if (manufacturerInput.value.trim()) criteria.push(`Manufacturer: "${manufacturerInput.value.trim()}"`);
        if (nafdacInput.value.trim()) criteria.push(`NAFDAC: "${nafdacInput.value.trim()}"`);
        
        return criteria.join(' • ');
    }

    function getEnhancedMessage(data, searchType) {
        if (data.message) return data.message;

        const baseMessage = getStatusConfig(data.status).message;
        
        // Enhance message based on search type
        switch(searchType) {
            case 'nafdac_only':
                return `NAFDAC search: ${baseMessage.toLowerCase()}`;
            case 'manufacturer_only':
                return `Manufacturer search: ${baseMessage.toLowerCase()}`;
            case 'drugname_only':
                return `Drug name search: ${baseMessage.toLowerCase()}`;
            default:
                return baseMessage;
        }
    }

    function getStatusConfig(status) {
        const configs = {
            'verified': {
                bgColor: 'bg-green-100',
                textColor: 'text-green-800',
                icon: 'fas fa-check-circle',
                title: 'Verified Medication',
                message: 'This medication has been verified and is safe for dispensing.'
            },
            'high_similarity': {
                bgColor: 'bg-blue-100',
                textColor: 'text-blue-800',
                icon: 'fas fa-lightbulb',
                title: 'Possible Match Found',
                message: 'High similarity match found. Please verify details.'
            },
            'partial_match': {
                bgColor: 'bg-yellow-100',
                textColor: 'text-yellow-800',
                icon: 'fas fa-exclamation-circle',
                title: 'Partial Match',
                message: 'Partial match found. Additional verification recommended.'
            },
            'low_confidence': {
                bgColor: 'bg-orange-100',
                textColor: 'text-orange-800',
                icon: 'fas fa-question-circle',
                title: 'Low Confidence',
                message: 'Unable to verify with high confidence.'
            },
            'unknown': {
                bgColor: 'bg-red-100',
                textColor: 'text-red-800',
                icon: 'fas fa-exclamation-triangle',
                title: 'No Match Found',
                message: 'No matching medication found in our database.'
            }
        };
        
        return configs[status] || configs['unknown'];
    }

    function getTrustScoreColor(score) {
        if (score >= 80) return 'text-green-600';
        if (score >= 50) return 'text-yellow-600';
        return 'text-red-600';
    }

    function getTrustScoreBarColor(score) {
        if (score >= 80) return 'bg-green-500';
        if (score >= 50) return 'bg-yellow-500';
        return 'bg-red-500';
    }

    function getTrustScoreText(score, data, searchType) {
        if (data.requires_nafdac && score >= 70) {
            return 'Good match, but complete NAFDAC number would improve confidence';
        }
        
        switch(searchType) {
            case 'nafdac_only':
                if (score >= 80) return 'High confidence NAFDAC match';
                if (score >= 50) return 'Moderate confidence NAFDAC match';
                return 'Low confidence NAFDAC match';
            case 'manufacturer_only':
                if (score >= 80) return 'High confidence manufacturer match';
                if (score >= 50) return 'Moderate confidence manufacturer match';
                return 'Low confidence manufacturer match';
            case 'drugname_only':
                if (score >= 80) return 'High confidence drug name match';
                if (score >= 50) return 'Moderate confidence drug name match';
                return 'Low confidence drug name match';
            default:
                if (score >= 80) return 'High confidence in verification';
                if (score >= 50) return 'Moderate confidence in verification';
                return 'Low confidence in verification';
        }
    }

    function getAdditionalInfoHTML(data) {
        let html = '';
        
        if (data.dosage_form || data.strength) {
            html += `
                <div class="bg-blue-50 rounded-xl p-4">
                    <h5 class="font-semibold text-blue-800 mb-2 flex items-center">
                        <i class="fas fa-info-circle mr-2"></i>
                        Additional Details
                    </h5>
                    <div class="grid grid-cols-2 gap-2 text-sm">
                        ${data.dosage_form ? `
                        <div>
                            <span class="text-blue-600">Dosage Form:</span>
                            <span class="ml-1 font-medium">${escapeHtml(data.dosage_form)}</span>
                        </div>
                        ` : ''}
                        ${data.strength ? `
                        <div>
                            <span class="text-blue-600">Strength:</span>
                            <span class="ml-1 font-medium">${escapeHtml(data.strength)}</span>
                        </div>
                        ` : ''}
                    </div>
                </div>
            `;
        }
        
        return html;
    }

    function getActionButtonsHTML(data) {
        let buttons = '';
        
        if (data.status === 'verified' && data.pil_id) {
            buttons += `
                <button onclick="viewPatientLeaflet('${data.pil_id}')" 
                    class="w-full bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-lg font-medium flex items-center justify-center transition-colors">
                    <i class="fas fa-file-alt mr-2"></i> View Patient Leaflet
                </button>
            `;
        }
        
        // Show "Add More Details" button for partial matches
        if ((data.status === 'partial_match' || data.status === 'low_confidence') && data.match_score < 80) {
            buttons += `
                <button onclick="focusOnEmptyFields()" 
                    class="w-full border border-blue-600 text-blue-600 hover:bg-blue-600 hover:text-white py-3 rounded-lg font-medium flex items-center justify-center transition-colors">
                    <i class="fas fa-plus-circle mr-2"></i> Add More Details
                </button>
            `;
        }
        
        // Show report button for unverified or suspicious drugs
        if (data.status !== 'verified' || data.match_score < 80) {
            const escapedProductName = (data.product_name || '').replace(/'/g, "\\'");
            const escapedNafdac = (data.nafdac_reg_no || '').replace(/'/g, "\\'");
            const escapedManufacturer = (data.manufacturer || '').replace(/'/g, "\\'");
            
            buttons += `
                <button onclick="reportSuspiciousDrug('${escapedProductName}', '${escapedNafdac}', '${escapedManufacturer}')" 
                    class="w-full bg-red-600 hover:bg-red-700 text-white py-3 rounded-lg font-medium flex items-center justify-center transition-colors">
                    <i class="fas fa-exclamation-triangle mr-2"></i> Report Suspicious Drug
                </button>
            `;
        }
        
        return buttons;
    }

    function getPossibleMatchesHTML(data) {
        if (!data.possible_matches || data.possible_matches.length === 0) {
            return '';
        }
        
        let matchesHTML = `
            <div class="border-t border-gray-200 pt-4">
                <h5 class="font-semibold text-gray-800 mb-3 flex items-center">
                    <i class="fas fa-lightbulb text-yellow-500 mr-2"></i>
                    Similar Medications Found
                </h5>
                <div class="space-y-3">
        `;
        
        data.possible_matches.forEach(match => {
            const similarity = match.similarity_percentage || match.match_score || 0;
            const similarityColor = similarity >= 80 ? 'text-green-600' : 
                                  similarity >= 50 ? 'text-yellow-600' : 'text-red-600';
            const similarityIcon = similarity >= 80 ? 'fa-check-circle' : 
                                 similarity >= 50 ? 'fa-exclamation-circle' : 'fa-times-circle';
            
            matchesHTML += `
                <div class="bg-white border border-gray-200 rounded-lg p-3">
                    <div class="flex justify-between items-start mb-2">
                        <div class="flex-1">
                            <h6 class="font-medium text-gray-800">${escapeHtml(match.product_name || 'Unknown')}</h6>
                            <p class="text-sm text-gray-600">${escapeHtml(match.manufacturer || 'Unknown manufacturer')}</p>
                        </div>
                        <div class="flex items-center ${similarityColor} ml-2">
                            <i class="fas ${similarityIcon} mr-1"></i>
                            <span class="font-semibold">${similarity}%</span>
                        </div>
                    </div>
                    <div class="flex justify-between items-center text-xs">
                        <span class="bg-gray-100 px-2 py-1 rounded-full text-gray-600">
                            ${match.nafdac_reg_no ? `NAFDAC: ${match.nafdac_reg_no}` : 'No NAFDAC'}
                        </span>
                        <button onclick="selectPossibleMatch('${escapeHtml(match.product_name || '')}', '${escapeHtml(match.manufacturer || '')}', '${escapeHtml(match.nafdac_reg_no || '')}')" 
                            class="text-blue-600 hover:text-blue-800 font-medium">
                            Use This
                        </button>
                    </div>
                </div>
            `;
        });
        
        matchesHTML += `
                </div>
            </div>
        `;
        
        return matchesHTML;
    }

    function resetVerificationForm() {
        verificationForm.reset();
        resultSection.classList.add('hidden');
        clearAllFieldErrors();
        updateSubmitButtonState();
        
        // Scroll back to form
        verificationForm.scrollIntoView({ behavior: 'smooth' });
    }

    function clearAllFieldErrors() {
        const inputs = [drugNameInput, manufacturerInput, nafdacInput];
        inputs.forEach(input => clearFieldError(input));
    }

    function escapeHtml(unsafe) {
        if (!unsafe) return '';
        return unsafe
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    function showAlert(message, type = 'info') {
        // Create a simple alert system
        const alert = document.createElement('div');
        alert.className = `fixed top-4 right-4 px-6 py-4 rounded-lg shadow-lg text-white z-50 transform transition-all duration-300 ${
            type === 'error' ? 'bg-red-500' : 
            type === 'success' ? 'bg-green-500' : 'bg-blue-500'
        }`;
        
        alert.innerHTML = `
            <div class="flex items-center justify-between">
                <div class="flex items-center">
                    <i class="fas ${
                        type === 'error' ? 'fa-exclamation-circle' : 
                        type === 'success' ? 'fa-check-circle' : 'fa-info-circle'
                    } mr-2"></i>
                    <span>${message}</span>
                </div>
                <button class="ml-4 text-white hover:text-white/80 focus:outline-none" onclick="this.parentElement.parentElement.remove()">
                    <i class="fas fa-times"></i>
                </button>
            </div>
        `;

        // Remove any existing alerts
        const existingAlerts = document.querySelectorAll('.fixed.top-4.right-4');
        existingAlerts.forEach(alert => alert.remove());

        // Add to DOM
        document.body.appendChild(alert);

        // Auto-remove after delay
        setTimeout(() => {
            if (alert.parentElement) {
                alert.remove();
            }
        }, type === 'error' ? 8000 : 5000);
    }

    // Global functions for button actions
    window.focusNafdacInput = function() {
        nafdacInput.focus();
        nafdacInput.scrollIntoView({ behavior: 'smooth' });
    };

    window.focusOnEmptyFields = function() {
        // Focus on the first empty field to help users add more details
        if (!drugNameInput.value.trim()) {
            drugNameInput.focus();
        } else if (!manufacturerInput.value.trim()) {
            manufacturerInput.focus();
        } else if (!nafdacInput.value.trim()) {
            nafdacInput.focus();
        }
        verificationForm.scrollIntoView({ behavior: 'smooth' });
    };

    window.selectPossibleMatch = function(name, manufacturer, nafdac) {
        drugNameInput.value = name || '';
        manufacturerInput.value = manufacturer || '';
        nafdacInput.value = nafdac || '';
        updateSubmitButtonState();
        resetVerificationForm();
    };

    window.viewPatientLeaflet = function(pilId) {
        showAlert('Patient leaflet viewer would open for ID: ' + pilId, 'info');
        // Implement PIL viewer integration here
    };

    window.reportSuspiciousDrug = function(drugName, nafdacNumber, manufacturer) {
        const reportData = {
            drugName: drugName,
            nafdacNumber: nafdacNumber,
            manufacturer: manufacturer,
            reporterType: 'pharmacy',
            timestamp: new Date().toISOString(),
            searchCriteria: getSearchCriteriaText()
        };
        
        localStorage.setItem('pharmacyDrugReport', JSON.stringify(reportData));
        showAlert('Redirecting to report form...', 'info');
        
        setTimeout(() => {
            window.location.href = 'pharmacy-report.html?source=verification';
        }, 1500);
    };

    // Make reset function globally available
    window.resetVerificationForm = resetVerificationForm;

    // Initialize submit button state
    updateSubmitButtonState();

    // Export utility functions for potential reuse
    window.PharmacyVerify = {
        getAuthToken,
        isAuthenticated,
        makeAuthenticatedRequest,
        clearAuth,
        updateSubmitButtonState
    };
});