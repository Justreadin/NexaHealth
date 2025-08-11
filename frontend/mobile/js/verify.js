document.addEventListener('DOMContentLoaded', function() {
    if (!document.getElementById('manual-verify-form')) return;

    // DOM Elements
    const drugNameInput = document.getElementById('drug-name');
    const manualVerifyForm = document.getElementById('manual-verify-form');
    const verifyButton = document.querySelector('#manual-verify-form button[type="submit"]');
    const confidenceBar = document.getElementById('confidence-bar');
    const confidenceValue = document.getElementById('confidence-value');
    const confidenceText = document.getElementById('confidence-text');
    const manufacturerInput = document.getElementById('manufacturer');
    const nafdacInput = document.getElementById('nafdac-number');
    const resultsModal = document.getElementById('results-modal');

    // Animation Effects
    const animateConfidence = (target) => {
        let current = parseInt(confidenceBar.style.width) || 0;
        const increment = target > current ? 1 : -1;
        
        const animate = () => {
            current += increment;
            confidenceBar.style.width = `${current}%`;
            confidenceValue.textContent = `${current}%`;
            
            if ((increment > 0 && current < target) || (increment < 0 && current > target)) {
                requestAnimationFrame(animate);
            }
        };
        animate();
    };

    // Clear results when starting new verification
    const clearResults = () => {
        resultsModal.classList.add('hidden');
        document.getElementById('drug_name').textContent = '';
        document.getElementById('drug-manufacturer').textContent = '';
        document.getElementById('nafdac_number').textContent = '-';
        document.getElementById('dosage-form').textContent = '-';
        document.getElementById('drug-strength').textContent = '-';
        document.getElementById('last-verified').textContent = '-';
        document.getElementById('trust-score-bar').style.width = '0%';
        document.getElementById('trust-score-value').textContent = '0%';
    };

    // Update UI based on input
    const updateUI = () => {
        const drugName = drugNameInput.value.trim();
        const manufacturer = manufacturerInput.value.trim();
        const nafdac = nafdacInput.value.trim();
        
        // Calculate confidence score
        let confidence = 0;
        if (drugName) confidence += 40;
        if (manufacturer) confidence += 30;
        if (nafdac) confidence += 30;

        // Animate confidence meter
        animateConfidence(confidence);
        
        // Update confidence text
        if (confidence === 0) {
            confidenceText.textContent = "Enter details to begin verification";
        } else if (confidence < 50) {
            confidenceText.textContent = "Good start! Add more details";
        } else if (confidence < 80) {
            confidenceText.textContent = "Looking good! Almost there";
        } else {
            confidenceText.textContent = "Excellent! Ready to verify";
        }

        // Update verify button state
        verifyButton.disabled = confidence === 0;
        verifyButton.classList.toggle('opacity-50', confidence === 0);
        verifyButton.classList.toggle('cursor-not-allowed', confidence === 0);
    };

    // Event Listeners
    drugNameInput.addEventListener('input', updateUI);
    manufacturerInput.addEventListener('input', updateUI);
    nafdacInput.addEventListener('input', updateUI);
    drugNameInput.addEventListener('focus', clearResults);

    // Form Submission
    manualVerifyForm.addEventListener('submit', async function(e) {
        e.preventDefault();
        
        const drugName = drugNameInput.value.trim();
        const manufacturer = manufacturerInput.value.trim();
        const nafdacNumber = nafdacInput.value.trim();
        
        try {
            showLoadingState();
            
            const accessToken = window.App?.Auth?.getAccessToken();
            if (!accessToken) {
                window.location.href = 'login.html';
                return;
            }

            const response = await fetch('https://lyre-4m8l.onrender.com/api/verify/drug', {
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

            if (!response.ok) throw new Error('Verification failed');
            
            const data = await response.json();
            displayVerificationResults(data);
            
        } catch (error) {
            console.error('Error:', error);
            showErrorState('Verification Failed', 'Please check your details and try again');
        }
    });

    // Scanner Modal
    document.getElementById('open-scanner')?.addEventListener('click', () => {
        document.getElementById('scanner-modal').classList.remove('hidden');
    });

    document.getElementById('close-scanner')?.addEventListener('click', () => {
        document.getElementById('scanner-modal').classList.add('hidden');
    });

    document.getElementById('close-results')?.addEventListener('click', () => {
        resultsModal.classList.add('hidden');
    });

    // Initialize
    updateUI();
});

// Show loading state with cool animations
function showLoadingState(message = 'Analyzing medication details...') {
    const statusContainer = document.getElementById('verification-status-container');
    const statusIcon = document.getElementById('status-icon');
    const statusTitle = document.getElementById('status-title');
    const statusMessage = document.getElementById('status-message');
    
    document.getElementById('results-modal').classList.remove('hidden');
    
    // Set loading state with animations
    statusContainer.className = 'rounded-xl p-5 mb-6 text-center border-2 border-blue-100 bg-blue-50';
    statusIcon.innerHTML = '<i class="fas fa-circle-notch fa-spin text-blue-500"></i>';
    statusTitle.textContent = 'Verifying Medication';
    statusMessage.textContent = message;
    
    // Clear previous results
    ['drug_name', 'drug-manufacturer', 'nafdac_number', 'dosage-form', 'drug-strength', 'last-verified'].forEach(id => {
        document.getElementById(id).textContent = id === 'nafdac_number' || id === 'dosage-form' || id === 'drug-strength' || id === 'last-verified' ? '-' : '';
    });
    
    // Reset trust score with animation
    const trustScoreBar = document.getElementById('trust-score-bar');
    trustScoreBar.style.width = '0%';
    trustScoreBar.className = 'h-2.5 rounded-full';
    document.getElementById('trust-score-value').textContent = '0%';
}

// Show error state with visual impact
function showErrorState(title, message) {
    const statusContainer = document.getElementById('verification-status-container');
    const statusIcon = document.getElementById('status-icon');
    const statusTitle = document.getElementById('status-title');
    const statusMessage = document.getElementById('status-message');
    
    // Set error state with animations
    statusContainer.className = 'rounded-xl p-5 mb-6 text-center border-2 border-red-100 bg-red-50 animate-pulse';
    statusIcon.innerHTML = '<i class="fas fa-exclamation-triangle text-red-500 animate-bounce"></i>';
    statusTitle.textContent = title;
    statusMessage.textContent = message;
    
    // Set trust score to 0 with red color
    const trustScoreBar = document.getElementById('trust-score-bar');
    trustScoreBar.style.width = '0%';
    trustScoreBar.className = 'h-2.5 rounded-full bg-red-500';
    document.getElementById('trust-score-value').textContent = '0%';
    document.getElementById('trust-score-text').textContent = 'Verification failed';
}

// Display results with engaging animations
function displayVerificationResults(data) {
    console.log("Verification Data:", data);
    
    const statusContainer = document.getElementById('verification-status-container');
    const statusIcon = document.getElementById('status-icon');
    const statusTitle = document.getElementById('status-title');
    const statusMessage = document.getElementById('status-message');
    const drugNameElement = document.getElementById('drug_name');
    
    // Set status based on verification result
    let statusClass, icon, iconColor;
    if (data.status === 'verified') {
        statusClass = 'verified-status border-green-100 bg-green-50';
        icon = 'fa-check-circle';
        iconColor = 'text-green-500';
    } else if (data.status === 'high_similarity') {
        statusClass = 'warning-status border-yellow-100 bg-yellow-50';
        icon = 'fa-lightbulb';
        iconColor = 'text-yellow-500';
    } else {
        statusClass = 'error-status border-red-100 bg-red-50';
        icon = 'fa-exclamation-triangle';
        iconColor = 'text-red-500';
    }
    
    // Animate status appearance
    statusContainer.className = `rounded-xl p-5 mb-6 text-center border-2 ${statusClass} animate-fade-in`;
    statusIcon.innerHTML = `<i class="fas ${icon} ${iconColor} text-3xl animate-pop-in"></i>`;
    statusTitle.textContent = data.status === 'verified' ? 'Verified Medication' : 
                            data.status === 'high_similarity' ? 'Possible Match Found' : 'Verification Failed';
    statusMessage.textContent = data.message || 'Verification completed';

    // Set drug information with animations
    if (data.product_name) {
        // Animate drug name appearance
        drugNameElement.textContent = '';
        const drugNameText = document.createTextNode(data.product_name);
        drugNameElement.appendChild(drugNameText);
        drugNameElement.classList.add('animate-fade-in');
        
        // Set other details with typewriter effect
        typeWriterEffect('drug-manufacturer', data.manufacturer || 'Manufacturer not specified');
        typeWriterEffect('nafdac_number', data.nafdac_reg_no || 'Not available');
        typeWriterEffect('dosage-form', data.dosage_form || 'Unknown');
        typeWriterEffect('drug-strength', data.strength || 'Not specified');
        
        // Handle last verified date
        let lastVerified = 'Unknown';
        if (data.last_verified) {
            try {
                const date = new Date(data.last_verified);
                lastVerified = date.toLocaleDateString();
            } catch (e) {
                lastVerified = data.last_verified;
            }
        }
        typeWriterEffect('last-verified', lastVerified);
    }

    // Animate trust score
    const trustScore = data.match_score || 0;
    const trustScoreBar = document.getElementById('trust-score-bar');
    const trustScoreValue = document.getElementById('trust-score-value');
    const trustScoreText = document.getElementById('trust-score-text');
    
    // Determine trust score color and text
    let trustColor, trustMessage;
    if (data.confidence === 'high' || trustScore >= 80) {
        trustColor = 'bg-green-500';
        trustMessage = 'High confidence in verification';
    } else if (data.confidence === 'medium' || trustScore >= 50) {
        trustColor = 'bg-yellow-500';
        trustMessage = 'Moderate confidence in verification';
    } else {
        trustColor = 'bg-red-500';
        trustMessage = 'Low confidence in verification';
    }
    
    // Animate trust score bar
    animateValue(0, trustScore, 1000, (value) => {
        trustScoreBar.style.width = `${value}%`;
        trustScoreValue.textContent = `${Math.round(value)}%`;
    });
    
    trustScoreBar.className = `h-2.5 rounded-full ${trustColor}`;
    trustScoreText.textContent = trustMessage;

    // Set crowd reports with counter animation
    const reportCount = data.report_count || 0;
    animateValue(0, reportCount, 1000, (value) => {
        document.getElementById('crowd-report-text').textContent = 
            `Reported ${Math.round(value)} time${value !== 1 ? 's' : ''}`;
    });

    // Set verification info if verified
    const verificationInfoContainer = document.getElementById('verification-info-container');
    if (data.status === 'verified' && data.last_verified) {
        verificationInfoContainer.classList.remove('hidden');
        document.getElementById('verification-info-text').textContent = 'NAFDAC Verified';
        
        let verifiedDate = 'Unknown';
        try {
            const date = new Date(data.last_verified);
            verifiedDate = date.toLocaleDateString();
        } catch (e) {
            verifiedDate = data.last_verified;
        }
        document.getElementById('verification-date').textContent = `Last verified: ${verifiedDate}`;
    } else {
        verificationInfoContainer.classList.add('hidden');
    }

    // Set action buttons
    const actionButtons = document.getElementById('action-buttons-container');
    actionButtons.innerHTML = '';
    
    if (data.status === 'verified' && data.pil_id) {
        // Verified drug - show View PIL button with cool effect
        actionButtons.innerHTML = `
            <button onclick="PILViewer.show('${data.pil_id}')" 
                class="w-full health-gradient hover:opacity-90 text-white py-3 rounded-lg font-medium flex items-center justify-center action-btn transform hover:scale-105 transition-all">
                <i class="fas fa-file-alt mr-2"></i> View Patient Leaflet
            </button>
        `;
    } else {
        // Unverified drug - show Report button
        actionButtons.innerHTML = `
            <button onclick="reportDrug('${escapeHtml(data.product_name || '')}', '${escapeHtml(data.nafdac_reg_no || '')}', '${escapeHtml(data.manufacturer || '')}')" 
                class="w-full bg-red-600 hover:bg-red-700 text-white py-3 rounded-lg font-medium flex items-center justify-center action-btn transform hover:scale-105 transition-all">
                <i class="fas fa-exclamation-triangle mr-2"></i> Report This Drug
            </button>
        `;
    }

    // Show possible matches if available
    const possibleMatchesContainer = document.getElementById('possible-matches-container');
    if (data.possible_matches && data.possible_matches.length > 0) {
        possibleMatchesContainer.classList.remove('hidden');
        const matchesList = document.getElementById('possible-matches-list');
        matchesList.innerHTML = '';
        
        data.possible_matches.forEach((match, index) => {
            // Add slight delay to each match for staggered appearance
            setTimeout(() => {
                const matchElement = document.createElement('div');
                matchElement.className = 'possible-match-card bg-white p-4 rounded-lg border border-gray-200 transform hover:scale-[1.02] transition-all cursor-pointer animate-fade-in';
                matchElement.innerHTML = `
                    <div class="flex items-start">
                        <h4 class="font-medium text-gray-800 flex-1">${escapeHtml(match.product_name || 'Unknown')}</h4>
                    </div>
                    <div class="flex items-center text-xs text-gray-500 mt-1">
                        <span>${escapeHtml(match.manufacturer || 'Unknown')}</span>
                        <span class="mx-2">•</span>
                        <span>${escapeHtml(match.dosage_form || 'Unknown')}</span>
                    </div>
                    <div class="mt-2 flex justify-between items-center">
                        <span class="text-xs bg-blue-50 px-2 py-1 rounded-full text-blue-600">
                            ${match.nafdac_reg_no ? 'NAFDAC: ' + escapeHtml(match.nafdac_reg_no) : 'No NAFDAC'}
                        </span>
                        <div>
                            ${match.pil_id ? `
                            <button onclick="event.stopPropagation();PILViewer.show('${match.pil_id}')" class="text-xs text-blue-600 hover:text-blue-800 mr-2">
                                <i class="fas fa-file-alt mr-1"></i> View PIL
                            </button>
                            ` : ''}
                            <button onclick="event.stopPropagation();selectPossibleMatch('${escapeHtml(match.product_name || '')}', '${escapeHtml(match.manufacturer || '')}', '${escapeHtml(match.nafdac_reg_no || '')}')" 
                                class="text-xs text-blue-600 hover:text-blue-800">
                                <i class="fas fa-check-circle mr-1"></i> Select
                            </button>
                        </div>
                    </div>
                `;
                
                // Add click handler to select the match
                matchElement.addEventListener('click', (e) => {
                    if (!e.target.closest('button')) {
                        selectPossibleMatch(
                            match.product_name || '',
                            match.manufacturer || '',
                            match.nafdac_reg_no || ''
                        );
                    }
                });
                
                matchesList.appendChild(matchElement);
            }, index * 100); // Stagger the animations
        });
    } else {
        possibleMatchesContainer.classList.add('hidden');
    }
}

// Helper functions
function animateValue(start, end, duration, callback) {
    const range = end - start;
    const startTime = performance.now();
    
    const updateValue = (currentTime) => {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const value = start + (progress * range);
        callback(value);
        
        if (progress < 1) {
            requestAnimationFrame(updateValue);
        }
    };
    
    requestAnimationFrame(updateValue);
}

function typeWriterEffect(elementId, text, speed = 20) {
    const element = document.getElementById(elementId);
    if (!element) return;
    
    element.textContent = '';
    let i = 0;
    
    const type = () => {
        if (i < text.length) {
            element.textContent += text.charAt(i);
            i++;
            setTimeout(type, speed);
        }
    };
    
    type();
}

function escapeHtml(unsafe) {
    return unsafe
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

// Global functions
window.reportDrug = function(drugName, nafdacNumber, manufacturer) {
    localStorage.setItem('reportDrugData', JSON.stringify({
        drugName: drugName,
        nafdacNumber: nafdacNumber,
        manufacturer: manufacturer
    }));
    window.location.href = 'report.html';
};

window.selectPossibleMatch = function(name, manufacturer, nafdac) {
    document.getElementById('drug-name').value = name;
    document.getElementById('manufacturer').value = manufacturer;
    document.getElementById('nafdac-number').value = nafdac || '';
    document.getElementById('results-modal').classList.add('hidden');
    
    // Trigger confidence update
    const event = new Event('input');
    document.getElementById('drug-name').dispatchEvent(event);
    
    // Scroll to form
    document.getElementById('manual-section').scrollIntoView({ behavior: 'smooth' });
};

// Add CSS animations
const style = document.createElement('style');
style.textContent = `
    @keyframes fadeIn {
        from { opacity: 0; }
        to { opacity: 1; }
    }
    @keyframes popIn {
        0% { transform: scale(0.5); opacity: 0; }
        60% { transform: scale(1.1); opacity: 1; }
        100% { transform: scale(1); }
    }
    .animate-fade-in {
        animation: fadeIn 0.5s ease-out forwards;
    }
    .animate-pop-in {
        animation: popIn 0.4s cubic-bezier(0.5, 1.5, 0.5, 1.5) forwards;
    }
    .verified-status {
        border-color: #a7f3d0;
        background-color: #ecfdf5;
    }
    .warning-status {
        border-color: #fde68a;
        background-color: #fffbeb;
    }
    .error-status {
        border-color: #fecaca;
        background-color: #fef2f2;
    }
    .health-gradient {
        background: linear-gradient(135deg, #3b82f6 0%, #6366f1 100%);
    }
    .scan-pulse {
        animation: pulse 2s infinite;
    }
    @keyframes pulse {
        0% { box-shadow: 0 0 0 0 rgba(59, 130, 246, 0.7); }
        70% { box-shadow: 0 0 0 10px rgba(59, 130, 246, 0); }
        100% { box-shadow: 0 0 0 0 rgba(59, 130, 246, 0); }
    }
    .possible-match-card:hover {
        box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
    }
`;
document.head.appendChild(style);