
document.addEventListener('DOMContentLoaded', function() {
    if (!document.getElementById('manual-verify-form')) {
        return; // Skip initialization if not on verify page
    }
    
    // DOM Elements
    const drugNameInput = document.getElementById('drug-name');
    const manualVerifyForm = document.getElementById('manual-verify-form');
    const verifyButton = document.querySelector('#manual-verify-form button[type="submit"]');
    const confidenceBar = document.getElementById('confidence-bar');
    const confidenceValue = document.getElementById('confidence-value');
    const confidenceText = document.getElementById('confidence-text');
    const manufacturerInput = document.getElementById('manufacturer');
    const nafdacInput = document.getElementById('nafdac-number');

    // Clear previous results when starting new search
    drugNameInput.addEventListener('focus', function() {
        document.getElementById('results-modal').classList.add('hidden');
    });

    // Disable verify button initially
    function updateVerifyButtonState() {
        const hasInput = drugNameInput.value.trim() || 
                        manufacturerInput.value.trim() || 
                        nafdacInput.value.trim();
        
        verifyButton.disabled = !hasInput;
        verifyButton.classList.toggle('opacity-50', !hasInput);
        verifyButton.classList.toggle('cursor-not-allowed', !hasInput);
    }

    // Update confidence meter based on form inputs
    function updateConfidenceMeter() {
        let confidence = 0;
        const drugName = drugNameInput.value.trim();
        const manufacturer = manufacturerInput.value.trim();
        const nafdac = nafdacInput.value.trim();

        if (drugName) confidence += 40;
        if (manufacturer) confidence += 30;
        if (nafdac) confidence += 30;

        confidenceBar.style.width = `${confidence}%`;
        confidenceValue.textContent = `${confidence}%`;

        if (confidence === 0) {
            confidenceText.textContent = "Enter more details to improve accuracy";
        } else if (confidence < 50) {
            confidenceText.textContent = "Good start! Add more details for better results";
        } else if (confidence < 80) {
            confidenceText.textContent = "Looking good! More details increase confidence";
        } else {
            confidenceText.textContent = "Excellent! High confidence in verification";
        }

        updateVerifyButtonState();
    }

    // Update confidence meter on any input change
    drugNameInput.addEventListener('input', updateConfidenceMeter);
    manufacturerInput.addEventListener('input', updateConfidenceMeter);
    nafdacInput.addEventListener('input', updateConfidenceMeter);

    // Form submission - fully integrated with backend
    manualVerifyForm.addEventListener('submit', async function(e) {
        e.preventDefault();
        
        const drugName = drugNameInput.value.trim();
        const manufacturer = manufacturerInput.value.trim();
        const nafdacNumber = nafdacInput.value.trim();
        
        try {
            // Show loading state
            showLoadingState();
            
            const accessToken = window.App?.Auth?.getAccessToken();
            if (!accessToken) {
                console.error("No access token found. Redirecting to login...");
                window.location.href = 'login.html';
                return;
            }

            const response = await fetch('https://nexahealth-backend-production.up.railway.app/api/verify/drug', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${accessToken}`
                },
                body: JSON.stringify({
                    product_name: drugName,
                    manufacturer: manufacturer,
                    nafdac_reg_no: nafdacNumber
                })
            });

            
            if (!response.ok) {
                throw new Error('Verification failed');
            }
            
            const data = await response.json();
            console.log("API Response:", data);
            displayVerificationResults(data);
            
        } catch (error) {
            console.error('Verification error:', error);
            showErrorState('Verification Failed', 'Unable to verify medication. Please try again.');
        }
    });

    // Scanner functionality
    document.getElementById('open-scanner').addEventListener('click', function() {
        document.getElementById('scanner-modal').classList.remove('hidden');
    });

    document.getElementById('close-scanner').addEventListener('click', function() {
        document.getElementById('scanner-modal').classList.add('hidden');
    });

    document.getElementById('close-results').addEventListener('click', function() {
        document.getElementById('results-modal').classList.add('hidden');
    });

    // Barcode capture handler
    document.getElementById('capture-btn').addEventListener('click', async function() {
        document.getElementById('scanner-modal').classList.add('hidden');
        showLoadingState('Verifying barcode...');
        
        try {
            const response = await fetch('https://nexahealth-backend-production.up.railway.app/api/verify/barcode', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ barcode: "SIMULATED_BARCODE" })
            });
            
            if (!response.ok) {
                throw new Error('Barcode verification failed');
            }
            
            const data = await response.json();
            displayVerificationResults(data);
        } catch (error) {
            console.error('Barcode verification error:', error);
            showErrorState('Scan Failed', 'Unable to verify barcode. Please try manual entry.');
        }
    });

    // Toggle flash
    let flashOn = false;
    document.getElementById('toggle-flash').addEventListener('click', function() {
        flashOn = !flashOn;
        this.innerHTML = flashOn ? '<i class="fas fa-bolt text-blue-300"></i>' : '<i class="fas fa-bolt"></i>';
    });

    // Initialize
    updateConfidenceMeter();
    updateVerifyButtonState();
});


function addNafdacSuggestion() {
    const nafdacInput = document.getElementById('nafdac-number');
    const manualSection = document.getElementById('manual-section');
    
    if (!nafdacInput.value.trim()) {
        nafdacInput.focus();
        manualSection.scrollIntoView({ behavior: 'smooth' });
        
        // Show a gentle prompt
        const prompt = document.createElement('div');
        prompt.className = 'fixed bottom-4 right-4 bg-blue-600 text-white p-3 rounded-lg shadow-lg z-50';
        prompt.innerHTML = `
            <div class="flex items-center">
                <i class="fas fa-info-circle mr-2"></i>
                <span>Enter NAFDAC number for complete verification</span>
                <button onclick="this.parentElement.parentElement.remove()" class="ml-4">
                    <i class="fas fa-times"></i>
                </button>
            </div>
        `;
        document.body.appendChild(prompt);
        
        // Auto-remove after 5 seconds
        setTimeout(() => {
            if (prompt.parentElement) {
                prompt.remove();
            }
        }, 5000);
    }
}

// Call this when requires_nafdac is true
if (data.requires_nafdac) {
    // Add a button to help users add NAFDAC
    actionButtons.innerHTML += `
        <button onclick="addNafdacSuggestion()" 
            class="w-full bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-lg font-medium flex items-center justify-center mt-3">
            <i class="fas fa-plus-circle mr-2"></i> Add NAFDAC Number
        </button>
    `;
}

// Show loading state in results modal
function showLoadingState(message = 'Verifying medication...') {
    const statusContainer = document.getElementById('verification-status-container');
    const statusIcon = document.getElementById('status-icon');
    const statusTitle = document.getElementById('status-title');
    const statusMessage = document.getElementById('status-message');
    
    document.getElementById('results-modal').classList.remove('hidden');
    
    // Clear previous results
    document.getElementById('drug-name').textContent = '';
    document.getElementById('drug-manufacturer').textContent = '';
    document.getElementById('nafdac_number').textContent = '-';
    document.getElementById('dosage-form').textContent = '-';
    document.getElementById('drug-strength').textContent = '-';
    document.getElementById('last-verified').textContent = '-';
    
    // Set loading state
    statusContainer.className = 'rounded-xl p-5 mb-6 text-center border-2';
    statusIcon.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i>';
    statusTitle.textContent = 'Verifying Medication';
    statusMessage.textContent = message;
}

// Show error state in results modal
function showErrorState(title, message) {
    const statusContainer = document.getElementById('verification-status-container');
    const statusIcon = document.getElementById('status-icon');
    const statusTitle = document.getElementById('status-title');
    const statusMessage = document.getElementById('status-message');
    
    // Set error state
    statusContainer.className = 'rounded-xl p-5 mb-6 text-center border-2 error-status';
    statusIcon.innerHTML = '<i class="fas fa-exclamation-triangle"></i>';
    statusTitle.textContent = title;
    statusMessage.textContent = message;
}

// Display verification results
// Display verification results
function displayVerificationResults(data) {
    console.log("API Response Data:", data); // Debug log

    const statusContainer = document.getElementById('verification-status-container');
    const statusIcon = document.getElementById('status-icon');
    const statusTitle = document.getElementById('status-title');
    const statusMessage = document.getElementById('status-message');
    
    // Clear previous drug name
    const drugNameElement = document.getElementById('drug_name');
    drugNameElement.innerHTML = '';
    
    // Set status based on verification result with enhanced NAFDAC-only handling
    if (data.status === 'verified') {
        statusContainer.className = 'rounded-xl p-5 mb-6 text-center border-2 verified-status';
        statusIcon.innerHTML = '<i class="fas fa-check-circle"></i>';
        statusTitle.textContent = 'Verified Medication';
        
        // Special handling for NAFDAC-only verified matches
        if (data.requires_confirmation) {
            statusMessage.innerHTML = `
                ${data.message || 'Verified via NAFDAC number'}
                <div class="mt-2 bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-sm text-yellow-800">
                    <i class="fas fa-exclamation-triangle mr-1"></i>
                    <strong>Please confirm:</strong> Does the drug name match exactly what's on the packaging?
                </div>
            `;
        }
    } else if (data.status === 'high_similarity') {
        statusContainer.className = 'rounded-xl p-5 mb-6 text-center border-2 warning-status';
        statusIcon.innerHTML = '<i class="fas fa-lightbulb"></i>';
        statusTitle.textContent = 'Possible Match Found';
    } else if (data.status === 'partial_match') {
        statusContainer.className = 'rounded-xl p-5 mb-6 text-center border-2 warning-status';
        statusIcon.innerHTML = '<i class="fas fa-exclamation-circle"></i>';
        statusTitle.textContent = 'Partial Match';
    } else if (data.status === 'low_confidence') {
        statusContainer.className = 'rounded-xl p-5 mb-6 text-center border-2 error-status';
        statusIcon.innerHTML = '<i class="fas fa-question-circle"></i>';
        statusTitle.textContent = 'Low Confidence';
    } else {
        statusContainer.className = 'rounded-xl p-5 mb-6 text-center border-2 error-status';
        statusIcon.innerHTML = '<i class="fas fa-exclamation-triangle"></i>';
        statusTitle.textContent = 'Verification Failed';
    }

    // Enhanced message handling for NAFDAC-only queries
    if (data.verification_type === "nafdac_only") {
        if (data.status === 'verified') {
            statusMessage.textContent = "Exact NAFDAC match found";
        } else if (data.status === 'partial_match') {
            statusMessage.textContent = "Partial NAFDAC match - verify product details";
        } else if (data.status === 'low_confidence') {
            statusMessage.textContent = "No close NAFDAC match found";
        } else {
            statusMessage.textContent = data.message || 'NAFDAC verification completed';
        }
    } else {
        statusMessage.textContent = data.message || 'Verification completed';
    }

    // Set drug information - only show if we have a product name
    if (data.product_name) {
        // Set drug name
        drugNameElement.textContent = data.product_name;
        
        // Set other drug details with proper fallbacks
        document.getElementById('drug-manufacturer').textContent = data.manufacturer || 'Manufacturer not specified';
        document.getElementById('nafdac_number').textContent = data.nafdac_reg_no || 'Not available';
        document.getElementById('dosage-form').textContent = data.dosage_form || 'Unknown';
        document.getElementById('drug-strength').textContent = data.strength || 'Not specified';
        
        // Handle last verified date
        if (data.last_verified) {
            try {
                const date = new Date(data.last_verified);
                document.getElementById('last-verified').textContent = date.toLocaleDateString();
            } catch (e) {
                document.getElementById('last-verified').textContent = 'Unknown';
            }
        } else {
            document.getElementById('last-verified').textContent = 'Unknown';
        }
    } else {
        // Clear drug details if no product name
        document.getElementById('drug-manufacturer').textContent = 'Not specified';
        document.getElementById('nafdac_number').textContent = 'Not available';
        document.getElementById('dosage-form').textContent = 'Unknown';
        document.getElementById('drug-strength').textContent = 'Not specified';
        document.getElementById('last-verified').textContent = 'Unknown';
    }
    if (data.requires_nafdac) {
        statusMessage.innerHTML = `
            ${data.message || 'Verification completed'}
            <div class="mt-2 bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-800">
                <i class="fas fa-info-circle mr-1"></i>
                <strong>For complete verification:</strong> Enter the NAFDAC number from the drug packaging
            </div>
        `;
    }

    // Set trust score - using match_score from your backend
    const trustScore = data.match_score || 0;
    const trustScoreBar = document.getElementById('trust-score-bar');
    trustScoreBar.style.width = `${trustScore}%`;
    document.getElementById('trust-score-value').textContent = `${trustScore}%`;
    
    // Set trust score text based on your confidence field
    if (data.confidence === 'high' || trustScore >= 80) {
        trustScoreBar.className = 'h-2.5 rounded-full trust-score-high';
        document.getElementById('trust-score-text').textContent = 'High confidence in verification';
    } else if (data.confidence === 'medium' || trustScore >= 50) {
        trustScoreBar.className = 'h-2.5 rounded-full trust-score-medium';
        document.getElementById('trust-score-text').textContent = 'Moderate confidence in verification';
    } else {
        trustScoreBar.className = 'h-2.5 rounded-full trust-score-low';
        document.getElementById('trust-score-text').textContent = 'Low confidence in verification';
    }

    if (data.requires_nafdac && trustScore >= 70) {
        document.getElementById('trust-score-text').textContent = 
            'Good match, but NAFDAC number required for complete verification';
        trustScoreBar.className = 'h-2.5 rounded-full trust-score-medium';
    } else if (data.requires_confirmation && trustScore >= 95) {
        document.getElementById('trust-score-text').textContent = 
            'NAFDAC verified - please confirm drug name matches packaging';
        trustScoreBar.className = 'h-2.5 rounded-full trust-score-high';
    } 

    // Set crowd reports - using report_count from your backend
    const crowdReportsContainer = document.getElementById('crowd-reports-container');
    const crowdReportText = document.getElementById('crowd-report-text');
    
    if (data.report_count !== undefined && data.report_count !== null) {
        crowdReportsContainer.classList.remove('hidden');
        crowdReportText.textContent = `Reported ${data.report_count || 0} time${data.report_count !== 1 ? 's' : ''}`;
    } else {
        crowdReportsContainer.classList.add('hidden');
    }

    // Set verification info - only show for verified drugs
    const verificationInfoContainer = document.getElementById('verification-info-container');
    if (data.status === 'verified' && data.last_verified) {
        verificationInfoContainer.classList.remove('hidden');
        document.getElementById('verification-info-text').textContent = 'NAFDAC Verified';
        try {
            const date = new Date(data.last_verified);
            document.getElementById('verification-date').textContent = 
                `Last verified: ${date.toLocaleDateString()}`;
        } catch (e) {
            document.getElementById('verification-date').textContent = 
                `Last verified: ${data.last_verified}`;
        }
    } else {
        verificationInfoContainer.classList.add('hidden');
    }

    // Action buttons
    const actionButtons = document.getElementById('action-buttons-container');
    actionButtons.innerHTML = '';

    if (data.status === 'verified' && data.pil_id) {
        // Verified drug - show View PIL button
        actionButtons.innerHTML = `
            <button onclick="PILViewer.show('${data.pil_id}')" 
                class="w-full health-gradient text-white py-3 rounded-lg font-medium flex items-center justify-center action-btn">
                <i class="fas fa-file-alt mr-2"></i> View Patient Leaflet
            </button>
        `;
    } else {
        // Unverified drug - show Report button
        const escapedProductName = (data.product_name || '').replace(/'/g, "\\'");
        const escapedNafdac = (data.nafdac_reg_no || '').replace(/'/g, "\\'");
        const escapedManufacturer = (data.manufacturer || '').replace(/'/g, "\\'");
        
        actionButtons.innerHTML = `
            <button onclick="reportDrug('${escapedProductName}', '${escapedNafdac}', '${escapedManufacturer}')" 
                class="w-full bg-red-600 hover:bg-red-700 text-white py-3 rounded-lg font-medium flex items-center justify-center action-btn">
                <i class="fas fa-exclamation-triangle mr-2"></i> Report This Drug
            </button>
        `;
    }

    // Show possible matches if available - enhanced for NAFDAC-only queries
    const possibleMatchesContainer = document.getElementById('possible-matches-container');
    if (data.possible_matches && data.possible_matches.length > 0) {
        possibleMatchesContainer.classList.remove('hidden');
        const matchesList = document.getElementById('possible-matches-list');
        matchesList.innerHTML = '';
        
        // Add header text based on verification type
        let matchesHeader = '';
        if (data.verification_type === "nafdac_only") {
            matchesHeader = '<p class="text-sm text-gray-600 mb-3">Similar NAFDAC numbers found:</p>';
        } else {
            matchesHeader = '<p class="text-sm text-gray-600 mb-3">Similar products found:</p>';
        }
        matchesList.innerHTML = matchesHeader;
        
        data.possible_matches.forEach(match => {
            const escapedProductName = (match.product_name || 'Unknown').replace(/'/g, "\\'");
            const escapedManufacturer = (match.manufacturer || 'Unknown').replace(/'/g, "\\'");
            const escapedNafdac = (match.nafdac_reg_no || '').replace(/'/g, "\\'");
            
            // Get similarity percentage - use match_score or similarity_percentage
            const similarityPercentage = match.similarity_percentage || match.match_score || 0;
            
            // Determine color based on similarity percentage
            let similarityColor = 'text-red-600';
            let similarityIcon = 'fas fa-times-circle';
            
            if (similarityPercentage >= 80) {
                similarityColor = 'text-green-600';
                similarityIcon = 'fas fa-check-circle';
            } else if (similarityPercentage >= 50) {
                similarityColor = 'text-yellow-600';
                similarityIcon = 'fas fa-exclamation-circle';
            }
            
            matchesList.innerHTML += `
                <div class="possible-match-card bg-white p-4 rounded-lg border border-gray-200 mb-3">
                    <div class="flex items-start justify-between">
                        <h4 class="font-medium text-gray-800 flex-1">${match.product_name || 'Unknown'}</h4>
                        <div class="flex items-center ${similarityColor} ml-2">
                            <i class="${similarityIcon} mr-1 text-sm"></i>
                            <span class="font-semibold">${similarityPercentage}%</span>
                        </div>
                    </div>
                    <div class="flex items-center text-xs text-gray-500 mt-1">
                        <span>${match.manufacturer || 'Unknown'}</span>
                        <span class="mx-2">•</span>
                        <span>${match.dosage_form || 'Unknown'}</span>
                    </div>
                    <div class="mt-2 flex justify-between items-center">
                        <span class="text-xs bg-blue-50 px-2 py-1 rounded-full text-blue-600">
                            ${match.nafdac_reg_no ? 'NAFDAC: ' + match.nafdac_reg_no : 'No NAFDAC'}
                        </span>
                        <div>
                            ${match.pil_id ? `
                            <button onclick="viewPIL('${match.pil_id}')" class="text-xs text-blue-600 hover:text-blue-800 mr-2">
                                <i class="fas fa-file-alt mr-1"></i> View PIL
                            </button>
                            ` : ''}
                            <button onclick="selectPossibleMatch('${escapedProductName}', '${escapedManufacturer}', '${escapedNafdac}')" 
                                class="text-xs bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded-full">
                                <i class="fas fa-check-circle mr-1"></i> Select
                            </button>
                        </div>
                    </div>
                </div>
            `;
        });
    } else {
        possibleMatchesContainer.classList.add('hidden');
    }

    // Special handling for NAFDAC-only queries with no matches
    if (data.verification_type === "nafdac_only" && !data.product_name && (!data.possible_matches || data.possible_matches.length === 0)) {
        statusMessage.textContent = "No drug found with this NAFDAC number. Please check the number and try again.";
    }
}
// Report drug function
window.reportDrug = function(drugName, nafdacNumber, manufacturer) {
    localStorage.setItem('reportDrugData', JSON.stringify({
        drugName: drugName,
        nafdacNumber: nafdacNumber,
        manufacturer: manufacturer
    }));
    window.location.href = 'report.html';
};

// Select possible match function
window.selectPossibleMatch = function(name, manufacturer, nafdac) {
    document.getElementById('drug-name').value = name;
    document.getElementById('manufacturer').value = manufacturer;
    document.getElementById('nafdac-number').value = nafdac || '';
    document.getElementById('results-modal').classList.add('hidden');
    const event = new Event('input');
    document.dispatchEvent(event);
    document.getElementById('manual-section').scrollIntoView({ behavior: 'smooth' });
};