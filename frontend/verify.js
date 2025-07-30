// verify.js - Updated to show modal after results

document.addEventListener('DOMContentLoaded', function() {
    // DOM Elements
    const verificationForm = document.getElementById('verificationForm');
    const resultsSection = document.getElementById('results-section');
    const newSearchBtn = document.getElementById('new-search');
    const possibleMatchesContainer = document.getElementById('possible-matches-container');
    
    // Create possible matches container if it doesn't exist
    if (!possibleMatchesContainer) {
        const container = document.createElement('div');
        container.id = 'possible-matches-container';
        container.className = 'mt-8 hidden';
        resultsSection.querySelector('.max-w-3xl').appendChild(container);
    }

    // Create modal if it doesn't exist
    if (!document.getElementById('better-results-modal')) {
        const modalHTML = `
        <div id="better-results-modal" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 hidden">
            <div class="bg-white rounded-xl max-w-md w-full mx-4 p-6">
                <div class="flex justify-between items-center mb-4">
                    <h3 class="text-xl font-bold font-serif">Get Better Verification Results</h3>
                    <button id="close-modal" class="text-gray-500 hover:text-gray-700">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="mb-6">
                    <div class="bg-blue-100 p-3 rounded-full inline-block mb-4">
                        <i class="fas fa-crown text-blue-600 text-xl"></i>
                    </div>
                    <p class="text-gray-700 mb-4">Sign up for free to unlock:</p>
                    <ul class="space-y-2 text-gray-600">
                        <li class="flex items-start">
                            <i class="fas fa-check-circle text-green-500 mt-1 mr-2"></i>
                            <span>AI-powered scanning with higher accuracy</span>
                        </li>
                        <li class="flex items-start">
                            <i class="fas fa-check-circle text-green-500 mt-1 mr-2"></i>
                            <span>Full verification history</span>
                        </li>
                        <li class="flex items-start">
                            <i class="fas fa-check-circle text-green-500 mt-1 mr-2"></i>
                            <span>Advanced safety features</span>
                        </li>
                    </ul>
                </div>
                <div class="flex flex-col sm:flex-row gap-4">
                    <a href="mobile/signup.html" class="health-gradient hover:opacity-90 text-white px-6 py-3 rounded-lg font-medium text-center shadow-lg hover:shadow-xl transition-all">
                        Sign Up Free
                    </a>
                    <button id="skip-modal" class="border border-gray-300 text-gray-700 px-6 py-3 rounded-lg font-medium hover:bg-gray-50 transition-all">
                        Continue as Guest
                    </button>
                </div>
            </div>
        </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHTML);
    }

    // Check if we're on the verify page
    if (!verificationForm) return;

    // Form submission handler
    verificationForm.addEventListener('submit', async function(e) {
        e.preventDefault();

        // Get form values
        const productName = document.getElementById('drug-name').value.trim();
        const nafdacNumber = document.getElementById('nafdac-number').value.trim();

        // Validate at least one field is filled
        if (!productName && !nafdacNumber) {
            showToast('Please enter either a drug name or NAFDAC number', 'error');
            return;
        }

        // Show loading state
        showLoading(true);

        try {
            const response = await verifyDrug(productName, nafdacNumber);
            displayVerificationResults(response);
            resultsSection.classList.remove('hidden');
            
            // Scroll to results
            setTimeout(() => {
                resultsSection.scrollIntoView({ 
                    behavior: 'smooth', 
                    block: 'start' 
                });
            }, 300);

            // Show modal if partial matches or low confidence
            if (response.status === 'HIGH_SIMILARITY' || 
                response.status === 'UNKNOWN' || 
                (response.match_score && response.match_score < 80)) {
                setTimeout(() => {
                    showBetterResultsModal();
                }, 1000);
            }
            
        } catch (error) {
            console.error('Verification error:', error);
            showToast('An error occurred while verifying. Please try again.', 'error');
        } finally {
            showLoading(false);
        }
    });

    // New search button handler
    newSearchBtn.addEventListener('click', function() {
        // Hide results section
        resultsSection.classList.add('hidden');

        // Reset form
        verificationForm.reset();

        // Scroll to form
        setTimeout(() => {
            document.getElementById('verify-section').scrollIntoView({ behavior: 'smooth' });
        }, 100);
    });

    // Function to show better results modal
    function showBetterResultsModal() {
        const modal = document.getElementById('better-results-modal');
        const closeBtn = document.getElementById('close-modal');
        const skipBtn = document.getElementById('skip-modal');

        modal.classList.remove('hidden');
        document.body.style.overflow = 'hidden';

        // Close modal handlers
        closeBtn.addEventListener('click', function() {
            modal.classList.add('hidden');
            document.body.style.overflow = '';
        });

        skipBtn.addEventListener('click', function() {
            modal.classList.add('hidden');
            document.body.style.overflow = '';
        });

        // Close when clicking outside
        modal.addEventListener('click', function(e) {
            if (e.target === modal) {
                modal.classList.add('hidden');
                document.body.style.overflow = '';
            }
        });
    }

    // Function to verify drug with backend
    async function verifyDrug(productName, nafdacNumber) {
        const requestData = {
            product_name: productName || null,
            nafdac_reg_no: nafdacNumber || null
        };

        const response = await fetch('https://lyre-4m8l.onrender.com/api/test_verify/drug', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestData)
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.detail || 'Verification failed');
        }

        return await response.json();
    }

    // Display verification results
    function displayVerificationResults(data) {
        // Set status based on verification result
        const status = data.status || 'UNKNOWN';
        const matchScore = data.match_score || 0;
        const message = data.message || 'Verification complete';

        // Update status elements
        updateStatusElements(status, matchScore, message);

        // Update progress circle
        updateProgressCircle(matchScore);

        // Update drug details if available
        const drugDetails = document.getElementById('drug-details');
        if (data.product_name) {
            drugDetails.classList.remove('hidden');
            document.getElementById('detail-name').textContent = data.product_name || '-';
            document.getElementById('detail-reg-no').textContent = data.nafdac_reg_no || '-';
            document.getElementById('detail-dosage').textContent = data.dosage_form || '-';
            document.getElementById('detail-strengths').textContent = data.strength || '-';
        } else {
            drugDetails.classList.add('hidden');
        }

        // Show possible matches if available
        const possibleMatchesContainer = document.getElementById('possible-matches-container');
        if (data.possible_matches && data.possible_matches.length > 0) {
            possibleMatchesContainer.classList.remove('hidden');
            possibleMatchesContainer.innerHTML = `
                <h3 class="text-lg font-bold font-serif mb-4">Possible Matching Drugs</h3>
                <div class="grid grid-cols-1 gap-4">
                    ${data.possible_matches.map(match => `
                        <div class="bg-white p-4 rounded-lg shadow border border-gray-200">
                            <div class="flex justify-between items-start">
                                <div>
                                    <h4 class="font-bold text-primary">${match.product_name}</h4>
                                    <p class="text-sm text-gray-600">Manufacturer: ${match.manufacturer || 'Unknown'}</p>
                                </div>
                                <span class="bg-blue-100 text-blue-800 text-xs font-medium px-2.5 py-0.5 rounded-full">
                                    ${match.match_score}% match
                                </span>
                            </div>
                            <div class="mt-2 grid grid-cols-2 gap-2 text-sm">
                                <div>
                                    <span class="font-medium">NAFDAC No:</span> ${match.nafdac_reg_no || '-'}
                                </div>
                                <div>
                                    <span class="font-medium">Dosage:</span> ${match.dosage_form || '-'}
                                </div>
                            </div>
                            <div class="mt-2">
                                <button class="text-primary hover:text-secondary text-sm font-medium flex items-center">
                                    <i class="fas fa-info-circle mr-1"></i> View details
                                </button>
                            </div>
                        </div>
                    `).join('')}
                </div>
            `;
        } else {
            possibleMatchesContainer.classList.add('hidden');
        }
    }

    // Update status elements based on verification status
    function updateStatusElements(status, score, message) {
        const statusBadge = document.getElementById('status-badge');
        const statusIcon = document.getElementById('status-icon');
        const statusTitle = document.getElementById('status-title');
        const statusMessage = document.getElementById('status-message');
        const statusFooterText = document.getElementById('status-footer-text');
        const matchScoreContainer = document.getElementById('match-score-container');
        const matchScoreBar = document.getElementById('match-score-bar');
        const matchScoreText = document.getElementById('match-score-text');
        const statusFooter = document.getElementById('status-footer');

        // Reset classes
        statusBadge.className = 'inline-block px-3 py-1 rounded-full text-white font-medium mb-4 text-sm';
        statusIcon.className = 'absolute inset-0 flex items-center justify-center text-3xl';

        // Set based on status
        switch (status) {
            case 'VERIFIED':
                statusBadge.classList.add('bg-verified');
                statusBadge.textContent = 'Verified';
                statusIcon.innerHTML = '<i class="fas fa-check-circle text-verified"></i>';
                statusTitle.textContent = 'Drug Verified Successfully';
                statusFooterText.textContent = 'This drug is verified by NAFDAC and matches official records.';
                break;

            case 'HIGH_SIMILARITY':
                statusBadge.classList.add('bg-partial');
                statusBadge.textContent = 'High Similarity';
                statusIcon.innerHTML = '<i class="fas fa-exclamation-circle text-partial"></i>';
                statusTitle.textContent = 'Highly Similar Drug Found';
                statusFooterText.textContent = 'The drug details are highly similar but not an exact match. Review carefully.';
                break;

            case 'PARTIAL_MATCH':
                statusBadge.classList.add('bg-partial');
                statusBadge.textContent = 'Partial Match';
                statusIcon.innerHTML = '<i class="fas fa-adjust text-partial"></i>';
                statusTitle.textContent = 'Partial Match Found';
                statusFooterText.textContent = 'Some key fields match. Please verify batch number, manufacturer, or NAFDAC number.';
                break;

            case 'COMMON_NAME_MATCH':
                statusBadge.classList.add('bg-partial');
                statusBadge.textContent = 'Name Match';
                statusIcon.innerHTML = '<i class="fas fa-prescription-bottle-alt text-partial"></i>';
                statusTitle.textContent = 'Matched by Name Only';
                statusFooterText.textContent = 'Matched using product name. Please cross-check NAFDAC number or packaging.';
                break;

            case 'CONFLICT_WARNING':
                statusBadge.classList.add('bg-conflict');
                statusBadge.textContent = 'Conflict Warning';
                statusIcon.innerHTML = '<i class="fas fa-exclamation-triangle text-conflict"></i>';
                statusTitle.textContent = 'Verification Conflict';
                statusFooterText.textContent = 'This drug has conflicting entries or mismatched records. Caution advised.';
                break;

            case 'FLAGGED':
                statusBadge.classList.add('bg-flagged');
                statusBadge.textContent = 'Flagged';
                statusIcon.innerHTML = '<i class="fas fa-flag text-flagged"></i>';
                statusTitle.textContent = 'Flagged as Suspicious';
                statusFooterText.textContent = 'This drug has been flagged by users or authorities. Avoid using it.';
                break;

            case 'UNKNOWN':
                statusBadge.classList.add('bg-unknown');
                statusBadge.textContent = 'Not Found';
                statusIcon.innerHTML = '<i class="fas fa-question-circle text-unknown"></i>';
                statusTitle.textContent = 'No Exact Match';
                statusFooterText.textContent = 'No matching drug was found. You may review similar matches below.';
                break;

            default:
                statusBadge.classList.add('bg-gray-500');
                statusBadge.textContent = 'Unrecognized';
                statusIcon.innerHTML = '<i class="fas fa-question text-white"></i>';
                statusTitle.textContent = 'Status Not Recognized';
                statusFooterText.textContent = 'The system returned an unexpected status. Please try again or contact support.';
        }


        statusMessage.textContent = message;

        // List of statuses where match score should be shown
        const showScoreStatuses = ['VERIFIED', 'HIGH_SIMILARITY', 'PARTIAL_MATCH', 'COMMON_NAME_MATCH', 'CONFLICT_WARNING'];

        // Show match score if it's meaningful
        if (showScoreStatuses.includes(status) && score > 0) {
            matchScoreContainer.classList.remove('hidden');
            matchScoreBar.style.width = `${score}%`;
            matchScoreText.textContent = `${score}%`;
        } else {
            matchScoreContainer.classList.add('hidden');
        }

        // Show footer if status is not UNKNOWN or unrecognized
        if (status !== 'UNKNOWN' && status !== 'UNRECOGNIZED') {
            statusFooter.classList.remove('hidden');
        } else {
            statusFooter.classList.add('hidden');
        }

    // Update progress circle visualization
    function updateProgressCircle(score) {
        const radius = 40;
        const circumference = 2 * Math.PI * radius;
        const offset = circumference - (score / 100) * circumference;
        const progressCircle = document.getElementById('progress-circle');

        progressCircle.style.strokeDasharray = `${circumference} ${circumference}`;
        progressCircle.style.strokeDashoffset = offset;
    }

    // Show loading state
    function showLoading(show) {
        const submitButton = verificationForm.querySelector('button[type="submit"]');
        
        if (show) {
            submitButton.disabled = true;
            submitButton.innerHTML = `
                <i class="fas fa-circle-notch fa-spin mr-2"></i> Verifying...
            `;
        } else {
            submitButton.disabled = false;
            submitButton.innerHTML = `
                <i class="fas fa-shield-alt mr-2"></i> Verify Medication
            `;
        }
    }

    // Show toast notification
    function showToast(message, type = 'info') {
        const toast = document.createElement('div');
        toast.className = `fixed bottom-4 right-4 px-6 py-3 rounded-lg shadow-lg text-white font-medium z-50 animate__animated animate__fadeInUp ${
            type === 'error' ? 'bg-red-500' : 'bg-blue-500'
        }`;
        toast.textContent = message;
        document.body.appendChild(toast);

        // Remove toast after 5 seconds
        setTimeout(() => {
            toast.classList.add('animate__fadeOutDown');
            setTimeout(() => toast.remove(), 500);
        }, 5000);
    }
});