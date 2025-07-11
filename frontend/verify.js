// verify.js - Drug Verification Page JavaScript

document.addEventListener('DOMContentLoaded', function() {
    // Mobile Menu Toggle
    const hamburger = document.getElementById('hamburger');
    const mobileMenu = document.getElementById('mobile-menu');

    hamburger.addEventListener('click', () => {
        hamburger.classList.toggle('hamburger-active');
        mobileMenu.classList.toggle('hidden');
    });

    // Close mobile menu when clicking a link
    document.querySelectorAll('#mobile-menu a').forEach(link => {
        link.addEventListener('click', () => {
            hamburger.classList.remove('hamburger-active');
            mobileMenu.classList.add('hidden');
        });
    });

    // Smooth scrolling for anchor links
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function(e) {
            e.preventDefault();

            const targetId = this.getAttribute('href');
            if (targetId === '#') return;

            const targetElement = document.querySelector(targetId);
            if (targetElement) {
                window.scrollTo({
                    top: targetElement.offsetTop - 80,
                    behavior: 'smooth'
                });
            }
        });
    });

    // FAQ Toggle
    document.querySelectorAll('.faq-toggle').forEach(button => {
        button.addEventListener('click', () => {
            const content = button.nextElementSibling;
            const icon = button.querySelector('i');

            content.classList.toggle('hidden');
            icon.classList.toggle('rotate-180');
        });
    });

    // Drug Verification Form Handling
    const verificationForm = document.getElementById('verificationForm');
    const resultsSection = document.getElementById('results-section');
    const newSearchBtn = document.getElementById('new-search');
    const verifyButton = document.getElementById('verify-button');
    const buttonText = document.getElementById('button-text');
    const buttonSpinner = document.getElementById('button-spinner');

    // Status elements
    const statusCard = document.getElementById('status-card');
    const statusBadge = document.getElementById('status-badge');
    const statusTitle = document.getElementById('status-title');
    const statusMessage = document.getElementById('status-message');
    const statusIcon = document.getElementById('status-icon');
    const statusFooter = document.getElementById('status-footer');
    const statusFooterText = document.getElementById('status-footer-text');
    const progressCircle = document.getElementById('progress-circle');
    const matchScoreContainer = document.getElementById('match-score-container');
    const matchScoreBar = document.getElementById('match-score-bar');
    const matchScoreText = document.getElementById('match-score-text');

    // Drug details elements
    const drugDetails = document.getElementById('drug-details');
    const detailName = document.getElementById('detail-name');
    const detailRegNo = document.getElementById('detail-reg-no');
    const detailDosage = document.getElementById('detail-dosage');
    const detailStrengths = document.getElementById('detail-strengths');
    const detailIngredients = document.getElementById('detail-ingredients');

    // Action buttons
    const reportButton = document.getElementById('report-button');
    const saveResultButton = document.getElementById('save-result');

    // Form submission handler
    verificationForm.addEventListener('submit', async function(e) {
        e.preventDefault();

        // Get form values
        const productName = document.getElementById('product-name').value.trim();
        const nafdacNumber = document.getElementById('nafdac-number').value.trim();

        // Validate at least one field is filled
        if (!productName && !nafdacNumber) {
            showError('Please enter either a drug name or NAFDAC number');
            return;
        }

        // Show loading state
        buttonText.textContent = 'Verifying...';
        buttonSpinner.classList.remove('hidden');
        verifyButton.disabled = true;

        try {
            // Prepare request data
            const requestData = {
                product_name: productName || null,
                nafdac_reg_no: nafdacNumber || null
            };

            // Call API
            const response = await fetch('https://lyre-4m8l.onrender.com/verify-drug', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(requestData)
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();

            // Display results
            displayVerificationResults(data);

            // Show results section
            resultsSection.classList.remove('hidden');

            // Scroll to results
            setTimeout(() => {
                resultsSection.scrollIntoView({ behavior: 'smooth' });
            }, 100);

        } catch (error) {
            console.error('Verification error:', error);
            showError('An error occurred while verifying. Please try again.');
        } finally {
            // Reset button state
            buttonText.textContent = 'Verify Drug';
            buttonSpinner.classList.add('hidden');
            verifyButton.disabled = false;
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
            document.getElementById('verify-form').scrollIntoView({ behavior: 'smooth' });
        }, 100);
    });

    // Save result button handler
    saveResultButton.addEventListener('click', function() {
        // In a real app, this would save to local storage or user account
        alert('Verification result saved to your history!');
    });

    // Display verification results
    function displayVerificationResults(data) {
        // Set status based on verification result
        const status = data.status || 'unknown';
        const matchScore = data.match_score || 0;

        // Update status elements
        updateStatusElements(status, matchScore);

        // Update status message
        statusTitle.textContent = getStatusTitle(status);
        statusMessage.textContent = data.message || 'Verification complete';

        // Update progress circle
        updateProgressCircle(matchScore);

        // Update drug details if available
        if (data.product_name) {
            drugDetails.classList.remove('hidden');
            detailName.textContent = data.product_name || '-';
            detailRegNo.textContent = data.nafdac_reg_no || '-';
            detailDosage.textContent = data.dosage_form || '-';
            detailStrengths.textContent = data.strengths || '-';
            detailIngredients.textContent = data.ingredients || '-';
        } else {
            drugDetails.classList.add('hidden');
        }

        // Show report button for flagged/conflict drugs
        if (status === 'flagged' || status === 'conflict_warning') {
            reportButton.classList.remove('hidden');
        } else {
            reportButton.classList.add('hidden');
        }
    }

    // Update status elements based on verification status
    function updateStatusElements(status, score) {
        // Reset classes
        statusBadge.className = 'inline-block px-4 py-2 rounded-full text-white font-medium mb-4 status-badge';
        statusIcon.className = 'absolute inset-0 flex items-center justify-center text-4xl';

        // Set based on status
        switch(status) {
            case 'verified':
                statusBadge.classList.add('bg-verified');
                statusBadge.textContent = 'Verified';
                statusIcon.innerHTML = '<i class="fas fa-check-circle text-verified"></i>';
                statusFooterText.textContent = 'This drug is verified by NAFDAC and matches official records.';
                break;
            case 'partial_match':
                statusBadge.classList.add('bg-partial');
                statusBadge.textContent = 'Partial Match';
                statusIcon.innerHTML = '<i class="fas fa-exclamation-circle text-partial"></i>';
                statusFooterText.textContent = 'Some details match but others don\'t. Verify carefully.';
                break;
            case 'conflict_warning':
                statusBadge.classList.add('bg-conflict');
                statusBadge.textContent = 'Conflict Warning';
                statusIcon.innerHTML = '<i class="fas fa-exclamation-triangle text-conflict"></i>';
                statusFooterText.textContent = 'This drug has conflicting information. Caution advised.';
                break;
            case 'flagged':
                statusBadge.classList.add('bg-flagged');
                statusBadge.textContent = 'Flagged';
                statusIcon.innerHTML = '<i class="fas fa-flag text-flagged"></i>';
                statusFooterText.textContent = 'This drug has been flagged by multiple reports. Do not use.';
                break;
            default: // unknown
                statusBadge.classList.add('bg-unknown');
                statusBadge.textContent = 'Unknown';
                statusIcon.innerHTML = '<i class="fas fa-question-circle text-unknown"></i>';
                statusFooterText.textContent = 'This drug was not found in our verification system.';
        }

        // Show match score if not unknown
        if (status !== 'unknown' && score > 0) {
            matchScoreContainer.classList.remove('hidden');
            matchScoreBar.style.width = `${score}%`;
            matchScoreText.textContent = `${score}%`;
        } else {
            matchScoreContainer.classList.add('hidden');
        }

        // Show footer for all statuses except unknown
        if (status !== 'unknown') {
            statusFooter.classList.remove('hidden');
        } else {
            statusFooter.classList.add('hidden');
        }
    }

    // Get status title based on verification status
    function getStatusTitle(status) {
        switch(status) {
            case 'verified': return 'Drug Verified Successfully';
            case 'partial_match': return 'Partial Match Found';
            case 'conflict_warning': return 'Verification Warning';
            case 'flagged': return 'Drug Flagged as Suspicious';
            default: return 'Verification Complete';
        }
    }

    // Update progress circle visualization
    function updateProgressCircle(score) {
        const radius = 40;
        const circumference = 2 * Math.PI * radius;
        const offset = circumference - (score / 100) * circumference;

        progressCircle.style.strokeDasharray = `${circumference} ${circumference}`;
        progressCircle.style.strokeDashoffset = offset;
    }

    // Show error message
    function showError(message) {
        alert(message); // In a real app, you'd show a nicer error message
    }
});