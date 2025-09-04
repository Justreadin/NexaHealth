import { trackPage, trackEvent, trackButtonClick, trackFormSubmission, trackVerification } from "./firebase.js";

// Make functions available globally
window.trackEvent = trackEvent;
window.trackButtonClick = trackButtonClick;
window.trackFormSubmission = trackFormSubmission;
window.trackVerification = trackVerification;

document.addEventListener('DOMContentLoaded', function() {
    trackPage("verify");
    
    let startTime = Date.now();
    window.addEventListener('beforeunload', function() {
        const timeSpent = Date.now() - startTime;
        trackEvent('time_on_page', {
            time_spent: timeSpent,
            page_name: 'verify'
        });
    });

    if (window.tippy) {
        tippy('[data-tippy-content]', {
            animation: 'scale',
            duration: 200,
            arrow: true
        });
    }

    const verificationForm = document.getElementById('verificationForm');
    const resultsSection = document.getElementById('results-section');
    const newSearchBtn = document.getElementById('new-search');
    
    initContainers();
    
    if (!verificationForm) return;

    verificationForm.addEventListener('submit', async function(e) {
        e.preventDefault();
         // Track form submission attempt
        const formData = {
        drug_name: document.getElementById('drug-name').value.trim(),
        nafdac_number: document.getElementById('nafdac-number').value.trim()
        };
        
    trackFormSubmission('drug_verification', formData);
    trackVerification('attempt', 'started', formData);
    
        await handleVerification();
    });
      newSearchBtn.addEventListener('click', function() {
            trackButtonClick('new_search', 'results_section');
            resetSearch();
        });

     document.addEventListener('click', function(e) {
        if (e.target.matches('#close-modal, #skip-modal')) {
        trackButtonClick('modal_close', 'better_results_modal');
        }
        
        if (e.target.closest('a[href*="signup.html"]')) {
        trackButtonClick('signup_cta', e.target.closest('section').id || 'unknown_location');
        }
        
        if (e.target.closest('a[href*="login.html"]')) {
        trackButtonClick('login_cta', e.target.closest('section').id || 'unknown_location');
        }
    });


    // Scroll tracking
    let maxScroll = 0;
    const sections = document.querySelectorAll('section');
    const sectionVisibility = {};
    
    sections.forEach(section => {
        sectionVisibility[section.id] = false;
    });
    
    window.addEventListener('scroll', function() {
        const currentScroll = (window.scrollY / (document.documentElement.scrollHeight - window.innerHeight)) * 100;
        
        if (currentScroll > maxScroll) {
            maxScroll = currentScroll;
            
            // Track major scroll milestones
            if (maxScroll > 25 && maxScroll < 26) {
                trackEvent('scroll_depth', { depth: '25%' });
            } else if (maxScroll > 50 && maxScroll < 51) {
                trackEvent('scroll_depth', { depth: '50%' });
            } else if (maxScroll > 75 && maxScroll < 76) {
                trackEvent('scroll_depth', { depth: '75%' });
            } else if (maxScroll > 90 && maxScroll < 91) {
                trackEvent('scroll_depth', { depth: '90%' });
            }
        }
        
        // Track section visibility
        sections.forEach(section => {
            const rect = section.getBoundingClientRect();
            const isVisible = (rect.top <= window.innerHeight / 2) && (rect.bottom >= window.innerHeight / 2);
            
            if (isVisible && !sectionVisibility[section.id]) {
                sectionVisibility[section.id] = true;
                trackEvent('section_view', { 
                    section_id: section.id,
                    section_name: section.querySelector('h1, h2, h3')?.textContent || 'unnamed'
                });
            }
        });
    });

    // Outbound link tracking
    document.addEventListener('click', function(e) {
        const link = e.target.closest('a');
        if (link && link.href && link.hostname !== window.location.hostname) {
            e.preventDefault();
            trackEvent('outbound_link_click', {
                link_url: link.href,
                link_text: link.textContent.substring(0, 100)
            });
            
            // Open link after a short delay to ensure tracking is sent
            setTimeout(() => {
                window.open(link.href, '_blank');
            }, 150);
        }
    });

    function initContainers() {
        if (!document.getElementById('possible-matches-container')) {
            const container = document.createElement('div');
            container.id = 'possible-matches-container';
            container.className = 'mt-8 hidden';
            resultsSection.querySelector('.max-w-3xl').appendChild(container);
        }

        if (!document.getElementById('better-results-modal')) {
            createBetterResultsModal();
        }
    }

    function createBetterResultsModal() {
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
        </div>`;
        document.body.insertAdjacentHTML('beforeend', modalHTML);
    }

    // Handle the verification process
    async function handleVerification() {
        const { productName, nafdacNumber } = getFormValues();
        
        if (!validateInputs(productName, nafdacNumber)) return;
        
        showLoading(true);

        try {
            const response = await verifyDrug(productName, nafdacNumber);
             trackVerification('success', response.status || 'unknown', {
                drug_name: productName,
                nafdac_number: nafdacNumber,
                match_score: response.match_score || 0,
                has_possible_matches: !!(response.possible_matches && response.possible_matches.length)
                });
            processVerificationResponse(response);
        } catch (error) {
            trackVerification('error', 'failed', {
                drug_name: productName,
                nafdac_number: nafdacNumber,
                error_message: error.message
            });
            handleVerificationError(error);
        } finally {
            showLoading(false);
        }
    }

    // Get form values
    function getFormValues() {
        return {
            productName: document.getElementById('drug-name').value.trim(),
            nafdacNumber: document.getElementById('nafdac-number').value.trim()
        };
    }

    // Validate form inputs
    function validateInputs(productName, nafdacNumber) {
        if (!productName && !nafdacNumber) {
            showToast('Please enter either a drug name or NAFDAC number', 'error');
            return false;
        }
        
        return true;
    }

    // Verify drug with backend API
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

    // Process the verification response
    function processVerificationResponse(response) {
        const normalizedData = normalizeResponseData(response);
        
        // Detect mismatches between name and NAFDAC number
        if (normalizedData.match_details) {
            const nameMatch = normalizedData.match_details.find(d => d.field === 'product_name');
            const nafdacMatch = normalizedData.match_details.find(d => d.field === 'nafdac_reg_no');
            
            if (nameMatch && nafdacMatch) {
                // If one matches well but the other doesn't
                if (nameMatch.score > 70 && nafdacMatch.score < 50) {
                    normalizedData.conflict_warning = 'NAFDAC number mismatch';
                } 
                else if (nafdacMatch.score > 70 && nameMatch.score < 50) {
                    normalizedData.conflict_warning = 'Drug name mismatch';
                }
                // If both exist but neither matches well
                else if (nameMatch.input_value && nafdacMatch.input_value && 
                        nameMatch.score < 50 && nafdacMatch.score < 50) {
                    normalizedData.conflict_warning = 'Both name and NAFDAC number mismatch';
                }
            }
        }

        // Determine if we should show drug info
        const shouldShowDrugInfo = 
            normalizedData.status !== 'UNKNOWN' || 
            normalizedData.match_score > 0 ||
            (normalizedData.product_name && normalizedData.nafdac_reg_no);
        
        // Special case: When we have "Unknown" but with possible matches
        if (normalizedData.status === 'UNKNOWN' && normalizedData.possible_matches?.length > 0) {
            normalizedData.status = 'PARTIAL_MATCH';
        }
        
        displayVerificationResults(normalizedData, shouldShowDrugInfo);
        resultsSection.classList.remove('hidden');
        
        setTimeout(() => {
            resultsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
            showModalIfNeeded(normalizedData);
        }, 300);

         const status = determineVerificationStatus(normalizedData);
          trackEvent('verification_result', {
            status: status,
            match_score: normalizedData.match_score || 0,
            has_conflict: !!normalizedData.conflict_warning,
            possible_matches_count: normalizedData.possible_matches ? normalizedData.possible_matches.length : 0
        });
    }

    // Normalize API response data
    function normalizeResponseData(data) {
        // Handle cases where backend returns no data
        if (!data) {
            return {
                status: 'UNKNOWN',
                product_name: '',
                nafdac_reg_no: '',
                match_score: 0,
                possible_matches: []
            };
        }
        
        return {
            ...data,
            product_name: data.product_name?.trim() || '',
            nafdac_reg_no: formatNafdacNumber(data.nafdac_reg_no),
            match_score: Math.round(data.match_score || 0),
            possible_matches: (data.possible_matches || []).map(match => ({
                ...match,
                product_name: match.product_name?.trim() || 'Unknown',
                nafdac_reg_no: formatNafdacNumber(match.nafdac_reg_no),
                match_score: Math.round(match.match_score || 0)
            }))
        };
    }

    // Format NAFDAC number for display
    function formatNafdacNumber(number) {
        if (!number) return '';
        // Standardize format to A4-123456
        const cleaned = number.replace(/[^A-Za-z0-9]/g, '');
        if (/^[A-Za-z]\d+$/.test(cleaned)) {
            return `${cleaned[0]}${cleaned[1]}-${cleaned.substring(2)}`;
        }
        return number;
    }

    // Show modal if results are uncertain
    function showModalIfNeeded(data) {
        if (shouldShowModal(data)) {
            setTimeout(() => {
                showBetterResultsModal();
            }, 1000);
        }
    }

    // Determine if we should show the modal
    function shouldShowModal(data) {
        // Don't show for verified drugs
        if (data.status === 'VERIFIED') return false;
        
        // Show for uncertain results or low scores
        return ['HIGH_SIMILARITY', 'PARTIAL_MATCH', 'UNKNOWN'].includes(data.status) || 
               (data.match_score && data.match_score < 80);
    }

    // Show the better results modal
    function showBetterResultsModal() {
            trackEvent('modal_view', {
            modal_name: 'better_results',
            trigger: 'verification_uncertain'
        });
        const modal = document.getElementById('better-results-modal');
        const closeBtn = document.getElementById('close-modal');
        const skipBtn = document.getElementById('skip-modal');

        modal.classList.remove('hidden');
        document.body.style.overflow = 'hidden';

        // Close modal handlers
        const closeModal = () => {
            modal.classList.add('hidden');
            document.body.style.overflow = '';
        };

        closeBtn.addEventListener('click', closeModal);
        skipBtn.addEventListener('click', closeModal);

        // Close when clicking outside
        modal.addEventListener('click', function(e) {
            if (e.target === modal) closeModal();
        });
    }

    // Handle verification errors
    function handleVerificationError(error) {
        console.error('Verification error:', error);
        showToast(error.message || 'An error occurred while verifying. Please try again.', 'error');
        
        // Show error state in UI
        resultsSection.classList.remove('hidden');
        document.getElementById('drug-details').classList.add('hidden');
        document.getElementById('possible-matches-container').classList.add('hidden');
        
        updateStatusElements('ERROR', 0, 'Verification failed');
        updateStatusIndicator('ERROR', {});
    }

    // Reset the search form
    function resetSearch() {
        trackEvent('user_action', {
            action: 'reset_search',
            location: 'results_section'
        });
        resultsSection.classList.add('hidden');
        verificationForm.reset();
        
        setTimeout(() => {
            document.getElementById('verify-section').scrollIntoView({ behavior: 'smooth' });
        }, 100);
    }

    // Display verification results
    function displayVerificationResults(data, showDrugInfo = true) {
        const status = determineVerificationStatus(data);
        let message = generateStatusMessage(status, data);
        
        // Add conflict warning to message if exists
        if (data.conflict_warning) {
            message += ` (${data.conflict_warning})`;
        }

        updateStatusElements(status, data.match_score, message);
        updateProgressCircle(data.match_score);
        updateStatusIndicator(status, data);
        
        // Special handling for completely unknown drugs
        if (status === 'UNKNOWN' && !showDrugInfo) {
            showDrugNotFoundState();
        } else {
            updateDrugDetails(data);
        }
        
        updatePossibleMatches(data);
    }

    function showDrugNotFoundState() {
        const drugDetails = document.getElementById('drug-details');
        const drugName = document.getElementById('drug-name').value.trim();
        const nafdacNumber = document.getElementById('nafdac-number').value.trim();
        
        drugDetails.classList.remove('hidden');
        drugDetails.innerHTML = `
            <div class="bg-red-50 border-l-4 border-red-400 p-4">
                <div class="flex">
                    <div class="flex-shrink-0">
                        <i class="fas fa-exclamation-triangle text-red-400 text-xl"></i>
                    </div>
                    <div class="ml-3">
                        <h3 class="text-lg font-medium text-red-800">Drug Not Found</h3>
                        <div class="mt-2 text-sm text-red-700">
                            <p>This drug was not found in our verified NAFDAC database.</p>
                            <div class="mt-4 space-y-3">
                                <a href="report.html#report-form?drug=${encodeURIComponent(drugName)}&nafdac=${encodeURIComponent(nafdacNumber)}" 
                                class="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-red-600 hover:bg-red-700 transition-colors">
                                    <i class="fas fa-flag mr-2"></i> Report Suspicious Drug
                                </a>
                                <button onclick="showBetterResultsModal()" 
                                        class="ml-2 inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md shadow-sm text-gray-700 bg-white hover:bg-gray-50 transition-colors">
                                    <i class="fas fa-crown mr-2 text-yellow-500"></i> Get Better Results
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }
    // Determine verification status
    function determineVerificationStatus(data) {
        // Handle explicit statuses first
        if (data.status === 'VERIFIED') return 'VERIFIED';
        if (data.status === 'FLAGGED') return 'FLAGGED';
        if (data.status === 'CONFLICT_WARNING') return 'CONFLICT_WARNING';
        if (data.status === 'ERROR') return 'ERROR';
        
        // Score-based determination
        if (data.match_score >= 90) return 'VERIFIED';
        if (data.match_score >= 70) return 'HIGH_SIMILARITY';
        if (data.possible_matches?.length > 0) return 'PARTIAL_MATCH';
        
        // If we have any drug info but low score
        if (data.product_name || data.nafdac_reg_no) {
            return 'PARTIAL_MATCH';
        }
        
        return 'UNKNOWN';
    }

    // Generate appropriate status message
    function generateStatusMessage(status, data) {
        const messages = {
            'VERIFIED': `Verified with ${data.match_score}% confidence`,
            'HIGH_SIMILARITY': `Close match found (${data.match_score}% similarity)`,
            'PARTIAL_MATCH': data.possible_matches?.length > 0
                ? `ℹpossible matches found check medications below`
                : data.match_score > 0
                    ? `Potential match found (${data.match_score}% similarity)`
                    : 'Possible match found',
            'CONFLICT_WARNING': 'Conflicting details detected',
            'FLAGGED': 'Flagged for safety concerns',
            'UNKNOWN': 'Drug not found in our database',
            'ERROR': 'Verification failed'
        };
        
        return messages[status] || 'Verification complete';
    }

    // Update status indicator UI
    function updateStatusIndicator(status, data) {
        const indicator = document.getElementById('drug-status-indicator') || createStatusIndicator();
        const config = getStatusConfiguration(status, data);
        
        indicator.className = `drug-status ${config.class}`;
        indicator.innerHTML = buildStatusIndicatorHTML(config, data);
    }

    // Create status indicator if it doesn't exist
    function createStatusIndicator() {
        const indicator = document.createElement('div');
        indicator.id = 'drug-status-indicator';
        document.querySelector('#results-section .max-w-3xl').prepend(indicator);
        return indicator;
    }

    function getStatusConfiguration(status, data) {
        const baseUrl = window.location.href.split('/').slice(0, 3).join('/');
        const drugParam = encodeURIComponent(data.product_name || '');
        const nafdacParam = encodeURIComponent(data.nafdac_reg_no || '');
        
        // Detect specific mismatches
        let conflictMessage = '';
        if (data.conflict_warning) {
            conflictMessage = ` - ${data.conflict_warning}`;
        } else if (data.match_details) {
            const nameMatch = data.match_details.find(d => d.field === 'product_name');
            const nafdacMatch = data.match_details.find(d => d.field === 'nafdac_reg_no');
            
            if (nameMatch && nafdacMatch) {
                if (nameMatch.score > 70 && nafdacMatch.score < 50) {
                    conflictMessage = ' - NAFDAC number mismatch';
                } 
                else if (nafdacMatch.score > 70 && nameMatch.score < 50) {
                    conflictMessage = ' - Drug name mismatch';
                }
                else if (nameMatch.score < 50 && nafdacMatch.score < 50) {
                    conflictMessage = ' - Both name and NAFDAC number mismatch';
                }
            }
        }

        const configurations = {
            'VERIFIED': {
                class: 'status-verified',
                title: 'Verified Medication',
                description: 'Approved by NAFDAC and verified in our system' + conflictMessage,
                icon: 'fa-check-circle',
                color: 'text-verified',
                actions: [
                    {
                        text: 'View Product Leaflet',
                        icon: 'fa-file-prescription',
                        url: `pil.html`,
                        class: 'view-pil-btn health-gradient hover:opacity-90'
                    },
                    {
                        text: 'Share Verification',
                        icon: 'fa-share-alt',
                        url: '#',
                        class: 'bg-blue-600 hover:bg-blue-700 share-verification',
                        onClick: `shareVerification('${drugParam}')`
                    }
                ]
            },
            'HIGH_SIMILARITY': {
                class: 'status-partial',
                title: 'Potential Match Found',
                description: `Similar medication found (${data.match_score}% match), verify details carefully` + conflictMessage,
                icon: 'fa-exclamation-circle',
                color: 'text-partial',
                actions: [
                    {
                        text: 'View Product Leaflet',
                        icon: 'fa-file-prescription',
                        url: `pil.html`,
                        class: 'view-pil-btn health-gradient hover:opacity-90'
                    },
                    {
                        text: 'Report Concerns',
                        icon: 'fa-flag',
                        url: `report.html#report-form?drug=${drugParam}&nafdac=${nafdacParam}`,
                        class: 'bg-yellow-600 hover:bg-yellow-700'
                    }
                ]
            },
            'PARTIAL_MATCH': {
                class: 'status-partial',
                title: data.possible_matches?.length > 0 
                    ? 'Possible Matches Found' 
                    : 'Potential Match',
                description: (data.possible_matches?.length > 0
                    ? 'Review similar medications below'
                    : 'This may be a match, verify details carefully') + conflictMessage,
                icon: 'fa-exclamation-circle',
                color: 'text-partial',
                actions: [
                    {
                        text: 'Report Drug',
                        icon: 'fa-flag',
                        url: `report.html#report-form?drug=${drugParam}&nafdac=${nafdacParam}`,
                        class: 'bg-red-600 hover:bg-red-700'
                    },
                    {
                        text: 'Try Advanced Search',
                        icon: 'fa-search-plus',
                        url: '#',
                        class: 'bg-blue-600 hover:bg-blue-700',
                        onClick: "showBetterResultsModal()"
                    }
                ]
            },
            'CONFLICT_WARNING': {
                class: 'status-conflict',
                title: 'Verification Warning',
                description: 'Conflicting details detected in our records' + (conflictMessage || ' - Please verify both name and NAFDAC number'),
                icon: 'fa-exclamation-triangle',
                color: 'text-conflict',
                actions: [
                    {
                        text: 'View Product Info',
                        icon: 'fa-file-prescription',
                        url: `pil.html`,
                        class: 'view-pil-btn bg-gray-600 hover:bg-gray-700'
                    },
                    {
                        text: 'Report Issue',
                        icon: 'fa-flag',
                        url: `report.html#report-form?drug=${drugParam}&nafdac=${nafdacParam}`,
                        class: 'bg-red-600 hover:bg-red-700'
                    }
                ]
            },
            'FLAGGED': {
                class: 'status-flagged',
                title: 'Safety Alert',
                description: 'This medication has been flagged for safety concerns' + conflictMessage,
                icon: 'fa-flag',
                color: 'text-flagged',
                actions: [
                    {
                        text: 'View Details',
                        icon: 'fa-file-prescription',
                        url: `pil.html`,
                        class: 'view-pil-btn bg-gray-600 hover:bg-gray-700'
                    },
                    {
                        text: 'Report Now',
                        icon: 'fa-exclamation-triangle',
                        url: `report.html#report-form?drug=${drugParam}&nafdac=${nafdacParam}`,
                        class: 'bg-red-600 hover:bg-red-700'
                    }
                ]
            },
            'UNKNOWN': {
                class: 'status-unknown',
                title: 'Drug Not Found',
                description: 'No matching records found in NAFDAC database' + conflictMessage,
                icon: 'fa-question-circle',
                color: 'text-unknown',
                actions: [
                    {
                        text: 'Report Suspicious Drug',
                        icon: 'fa-exclamation-triangle',
                        url: `report.html#report-form`,
                        class: 'bg-red-600 hover:bg-red-700'
                    },
                    {
                        text: 'Try Advanced Search',
                        icon: 'fa-search-plus',
                        url: '#',
                        class: 'bg-blue-600 hover:bg-blue-700',
                        onClick: "showBetterResultsModal()"
                    }
                ]
            },
            'ERROR': {
                class: 'status-error',
                title: 'Verification Error',
                description: 'Could not complete verification' + conflictMessage,
                icon: 'fa-times-circle',
                color: 'text-error',
                actions: [
                    {
                        text: 'Try Again',
                        icon: 'fa-redo',
                        url: '#',
                        class: 'bg-blue-600 hover:bg-blue-700',
                        onClick: "document.getElementById('verificationForm').dispatchEvent(new Event('submit'))"
                    },
                    {
                        text: 'Report Problem',
                        icon: 'fa-bug',
                        url: `report.html#report-form?type=technical`,
                        class: 'bg-gray-600 hover:bg-gray-700'
                    }
                ]
            }
        };

        const config = configurations[status] || configurations['UNKNOWN'];
        
        // Special handling for conflict cases
        if (conflictMessage) {
            // Add warning icon to title for conflicts
            config.title = `⚠️ ${config.title}`;
            
            // For verified status with conflicts, change to warning
            if (status === 'VERIFIED' && conflictMessage) {
                config.class = 'status-conflict';
                config.icon = 'fa-exclamation-triangle';
                config.color = 'text-conflict';
            }
        }
        
        return config;
    }

    // Build HTML for status indicator
    function buildStatusIndicatorHTML(config, data) {
        const actionsHTML = config.actions.map(action => {
            const onClick = action.onClick ? `onclick="${action.onClick}"` : '';
            return `
                <a href="${action.url}" ${onClick}
                   class="${action.class} text-white py-2 px-4 rounded-lg text-sm font-medium inline-flex items-center mr-2 mb-2 transition-colors">
                    <i class="fas ${action.icon} mr-2"></i> ${action.text}
                </a>
            `;
        }).join('');

        return `
            <div class="drug-status-content">
                <div class="flex items-start">
                    <div class="mr-4">
                        <i class="fas ${config.icon} text-2xl ${config.color} status-icon"></i>
                    </div>
                    <div class="flex-1">
                        <h3 class="text-lg font-bold font-serif mb-1">${config.title}</h3>
                        <p class="text-gray-700 mb-3">${config.description}</p>
                        <div class="action-buttons">
                            ${actionsHTML}
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    // Update drug details section
    function updateDrugDetails(data) {
        const drugDetails = document.getElementById('drug-details');
        
        if (!data.product_name && !data.nafdac_reg_no) {
            drugDetails.classList.add('hidden');
            return;
        }

        drugDetails.classList.remove('hidden');

        const nameMismatch = data.conflict_warning?.includes('name');
        const nafdacMismatch = data.conflict_warning?.includes('NAFDAC');
        
        document.getElementById('detail-name').innerHTML = `
            ${data.product_name || 'Unknown product'}
            ${nameMismatch ? '<span class="ml-2 text-xs text-red-500">(mismatch)</span>' : ''}
        `;
        
        document.getElementById('detail-reg-no').innerHTML = `
            ${data.nafdac_reg_no || 'Not available'}
            ${nafdacMismatch ? '<span class="ml-2 text-xs text-red-500">(mismatch)</span>' : ''}
        `;
        
        document.getElementById('detail-dosage').textContent = data.dosage_form || 'Not specified';
        document.getElementById('detail-strengths').textContent = data.strength || 'Not specified';
        
    }

    function updatePossibleMatches(data) {
        const container = document.getElementById('possible-matches-container');
        
        if (!data.possible_matches?.length) {
            container.classList.add('hidden');
            return;
        }

        container.classList.remove('hidden');
        container.innerHTML = `
            <h3 class="text-lg font-bold font-serif mb-4">Possible Matching Drugs</h3>
            <div class="grid grid-cols-1 gap-4">
                ${data.possible_matches.map(match => `
                    <div class="bg-white p-4 rounded-lg shadow border border-gray-200 hover:shadow-md transition-shadow">
                        <div class="flex justify-between items-start">
                            <div>
                                <h4 class="font-bold text-primary">${match.product_name}</h4>
                                <p class="text-sm text-gray-600">${match.manufacturer || 'Unknown manufacturer'}</p>
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
                        <div class="mt-3 flex space-x-2">
                            <a href="pil.html?drug=${encodeURIComponent(match.product_name)}" 
                            class="text-primary hover:text-secondary text-sm font-medium flex items-center">
                                <i class="fas fa-info-circle mr-1"></i> View details
                            </a>
                            <a href="report.html#report-form?drug=${encodeURIComponent(match.product_name)}&nafdac=${encodeURIComponent(match.nafdac_reg_no || '')}" 
                            class="text-red-600 hover:text-red-700 text-sm font-medium flex items-center ml-4">
                                <i class="fas fa-flag mr-1"></i> Report
                            </a>
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
    }
    // Update status elements (badge, icon, etc.)
    function updateStatusElements(status, score, message) {
        const elements = {
            badge: document.getElementById('status-badge'),
            icon: document.getElementById('status-icon'),
            title: document.getElementById('status-title'),
            message: document.getElementById('status-message'),
            footerText: document.getElementById('status-footer-text'),
            matchContainer: document.getElementById('match-score-container'),
            matchBar: document.getElementById('match-score-bar'),
            matchText: document.getElementById('match-score-text'),
            footer: document.getElementById('status-footer')
        };

        const statusConfigs = {
            'VERIFIED': {
                badgeClass: 'bg-verified',
                badgeText: 'Verified',
                icon: 'fa-check-circle',
                iconColor: 'text-verified',
                title: 'Verified Successfully',
                footerText: 'NAFDAC-approved medication'
            },
            'HIGH_SIMILARITY': {
                badgeClass: 'bg-partial',
                badgeText: 'Partial Match',
                icon: 'fa-exclamation-circle',
                iconColor: 'text-partial',
                title: 'Potential Match Found',
                footerText: 'Verify details carefully'
            },
            'PARTIAL_MATCH': {
                badgeClass: 'bg-partial',
                badgeText: 'Possible Match',
                icon: 'fa-exclamation-circle',
                iconColor: 'text-partial',
                title: 'Possible Matches Found',
                footerText: 'Review similar medications below'
            },
            'CONFLICT_WARNING': {
                badgeClass: 'bg-conflict',
                badgeText: 'Conflict Detected',
                icon: 'fa-exclamation-triangle',
                iconColor: 'text-conflict',
                title: 'Verification Warning',
                footerText: 'Conflicting information found'
            },
            'FLAGGED': {
                badgeClass: 'bg-flagged',
                badgeText: 'Safety Alert',
                icon: 'fa-flag',
                iconColor: 'text-flagged',
                title: 'Flagged Medication',
                footerText: 'Reported for safety concerns'
            },
            'UNKNOWN': {
                badgeClass: 'bg-unknown',
                badgeText: 'Not Found',
                icon: 'fa-question-circle',
                iconColor: 'text-unknown',
                title: 'Verification Complete',
                footerText: 'No matching records found'
            },
            'ERROR': {
                badgeClass: 'bg-red-500',
                badgeText: 'Error',
                icon: 'fa-times-circle',
                iconColor: 'text-red-500',
                title: 'Verification Failed',
                footerText: 'Could not complete verification'
            }
        };

        const config = statusConfigs[status] || statusConfigs['UNKNOWN'];

        // Update badge
        elements.badge.className = 'inline-block px-3 py-1 rounded-full text-white font-medium mb-4 text-sm';
        elements.badge.classList.add(config.badgeClass);
        elements.badge.textContent = config.badgeText;

        // Update icon
        elements.icon.className = 'absolute inset-0 flex items-center justify-center text-3xl';
        elements.icon.innerHTML = `<i class="fas ${config.icon} ${config.iconColor}"></i>`;

        // Update text elements
        elements.title.textContent = config.title;
        elements.message.textContent = message;
        elements.footerText.textContent = config.footerText;

        // Update match score
        if (status !== 'UNKNOWN' && status !== 'ERROR' && score > 0) {
            elements.matchContainer.classList.remove('hidden');
            elements.matchBar.style.width = `${score}%`;
            elements.matchText.textContent = `${score}%`;
        } else {
            elements.matchContainer.classList.add('hidden');
        }

        // Update footer visibility
        elements.footer.classList.toggle('hidden', status === 'UNKNOWN' || status === 'ERROR');
    }

    // Update progress circle visualization
    function updateProgressCircle(score) {
        const radius = 40;
        const circumference = 2 * Math.PI * radius;
        const offset = circumference - (score / 100) * circumference;
        const progressCircle = document.getElementById('progress-circle');

        if (progressCircle) {
            progressCircle.style.strokeDasharray = `${circumference} ${circumference}`;
            progressCircle.style.strokeDashoffset = offset;
        }
    }

    // Show loading state
    function showLoading(show) {
        const submitButton = verificationForm.querySelector('button[type="submit"]');
        
        if (show) {
            submitButton.disabled = true;
            submitButton.innerHTML = `
                <i class="fas fa-circle-notch fa-spin mr-2"></i> Verifying...
            `;
            
            // Clear previous results
            resultsSection.classList.add('hidden');
            document.getElementById('drug-details').classList.add('hidden');
            document.getElementById('possible-matches-container').classList.add('hidden');
        } else {
            submitButton.disabled = false;
            submitButton.innerHTML = `
                <i class="fas fa-shield-alt mr-2"></i> Verify Medication
            `;
        }
    }

    // Show toast notification
    function showToast(message, type = 'info') {
        trackEvent('toast_shown', {
            toast_type: type,
            toast_message: message.substring(0, 100) // Limit length
        });
        // Remove existing toasts
        document.querySelectorAll('.toast-notification').forEach(el => el.remove());
        
        const toast = document.createElement('div');
        toast.className = `toast-notification fixed bottom-4 right-4 px-6 py-3 rounded-lg shadow-lg text-white font-medium z-50 animate__animated animate__fadeInUp ${
            type === 'error' ? 'bg-red-500' : 
            type === 'success' ? 'bg-green-500' : 'bg-blue-500'
        }`;
        toast.innerHTML = `
            <div class="flex items-center">
                <i class="fas ${
                    type === 'error' ? 'fa-exclamation-circle' : 
                    type === 'success' ? 'fa-check-circle' : 'fa-info-circle'
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

    // Make functions available globally
    window.showBetterResultsModal = showBetterResultsModal;
    window.shareVerification = function(drugName) {
        trackButtonClick('share_verification', 'status_indicator');
        // Implement share functionality
        if (navigator.share) {
            navigator.share({
                title: 'Drug Verification Result',
                text: `I verified ${drugName} on NexaHealth`,
                url: window.location.href
            }).catch(err => {
                showToast('Sharing failed', 'error');
            });
        } else {
            showToast('Web Share API not supported', 'error');
        }
    };
});