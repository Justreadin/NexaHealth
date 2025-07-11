// verify.js - Drug Verification Page Specific JavaScript

class DrugVerifier {
  constructor() {
    this.auth = window.App.Auth;
    this.guestSession = window.App.GuestSession;
  }

  async verifyDrug(productName, nafdacNumber) {
    const isLoggedIn = this.auth.checkAuthStatus();
    
    // Skip guest checks if logged in
    if (!isLoggedIn && this.guestSession.checkGuestLimit()) {
      return null;
    }

    try {
      const headers = {
        'Content-Type': 'application/json'
      };

      if (isLoggedIn) {
        const token = localStorage.getItem('nexahealth_access_token') || 
                     sessionStorage.getItem('nexahealth_access_token');
        headers['Authorization'] = `Bearer ${token}`;
      } else {
        // Ensure guest session exists
        if (!this.guestSession.sessionId) {
          await this.guestSession.createNewSession();
        }
        headers['X-Guest-Session'] = this.guestSession.sessionId || '';
      }

      const requestData = {
        product_name: productName || null,
        nafdac_reg_no: nafdacNumber || null
      };

      const response = await fetch('http://127.0.0.1:800/verify-drug', {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(requestData),
        credentials: 'include'
      });

      if (response.status === 403) {
        this.guestSession.showGuestLimitModal();
        return null;
      }

      if (!response.ok) throw new Error(`API error: ${response.status}`);
      
      return await response.json();
    } catch (error) {
      console.error("Verification Error:", error);
      throw error;
    }
  }
}

// Initialize Drug Verifier Page
document.addEventListener('DOMContentLoaded', () => {
  // Only initialize if we're on the verify page
  if (!document.getElementById('verificationForm')) return;

  const verifier = new DrugVerifier();
  const verificationForm = document.getElementById('verificationForm');
  const verifyButton = document.getElementById('verify-button');
  const buttonText = document.getElementById('button-text');
  const buttonSpinner = document.getElementById('button-spinner');
  const resultsSection = document.getElementById('results-section');
  const newSearchBtn = document.getElementById('new-search');
  const saveResultButton = document.getElementById('save-result');

  // Check for drug parameter in URL and pre-fill form
  const urlParams = new URLSearchParams(window.location.search);
  const drugName = urlParams.get('drug');
  if (drugName) {
    document.getElementById('product-name').value = decodeURIComponent(drugName);
    
    // Highlight the drug name field
    const drugNameField = document.getElementById('product-name');
    drugNameField.focus();
    drugNameField.select();
    
    // Show a brief notification
    const notification = document.createElement('div');
    notification.className = 'bg-blue-100 border-l-4 border-blue-500 text-blue-700 p-4 mb-4 animate__animated animate__fadeInDown';
    notification.innerHTML = `
      <p class="font-medium">Drug from symptoms pre-filled</p>
      <p class="text-sm">We've filled the drug name from your symptom analysis. Click "Verify Drug" to check its authenticity.</p>
    `;
    document.querySelector('#verify-form > div').prepend(notification);
    
    // Remove notification after 5 seconds
    setTimeout(() => {
      notification.classList.add('animate__fadeOutUp');
      setTimeout(() => notification.remove(), 500);
    }, 5000);
  }

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
      const data = await verifier.verifyDrug(productName, nafdacNumber);
      if (!data) return; // Guest limit reached
      
      displayVerificationResults(data);
      resultsSection.classList.remove('hidden');
      
      setTimeout(() => {
        resultsSection.scrollIntoView({ 
          behavior: 'smooth', 
          block: 'start' 
        });
      }, 300);
      
    } catch (error) {
      console.error('Verification error:', error);
      showError('An error occurred while verifying. Please try again.');
    } finally {
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
    document.getElementById('status-title').textContent = getStatusTitle(status);
    document.getElementById('status-message').textContent = data.message || 'Verification complete';

    // Update progress circle
    updateProgressCircle(matchScore);

    // Update drug details if available
    const drugDetails = document.getElementById('drug-details');
    if (data.product_name) {
      drugDetails.classList.remove('hidden');
      document.getElementById('detail-name').textContent = data.product_name || '-';
      document.getElementById('detail-reg-no').textContent = data.nafdac_reg_no || '-';
      document.getElementById('detail-dosage').textContent = data.dosage_form || '-';
      document.getElementById('detail-strengths').textContent = data.strengths || '-';
      document.getElementById('detail-ingredients').textContent = data.ingredients || '-';
    } else {
      drugDetails.classList.add('hidden');
    }

    // Show report button for flagged/conflict drugs
    const reportButton = document.getElementById('report-button');
    if (status === 'flagged' || status === 'conflict_warning') {
      reportButton.classList.remove('hidden');
    } else {
      reportButton.classList.add('hidden');
    }
  }

  // Update status elements based on verification status
  function updateStatusElements(status, score) {
    const statusBadge = document.getElementById('status-badge');
    const statusIcon = document.getElementById('status-icon');
    const statusFooterText = document.getElementById('status-footer-text');
    const matchScoreContainer = document.getElementById('match-score-container');
    const matchScoreBar = document.getElementById('match-score-bar');
    const matchScoreText = document.getElementById('match-score-text');
    const statusFooter = document.getElementById('status-footer');

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
    const progressCircle = document.getElementById('progress-circle');

    progressCircle.style.strokeDasharray = `${circumference} ${circumference}`;
    progressCircle.style.strokeDashoffset = offset;
  }

  // Show error message
  function showError(message) {
    alert(message); // In a real app, you'd show a nicer error message
  }
});