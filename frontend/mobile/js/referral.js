class ReferralSystem {
  constructor() {
    this.referralLink = '';
    this.referralCount = 0;
    this.referralGoal = 3;
    
    this.initElements();
    this.initEventListeners();
    this.loadReferralData();
  }
  
  initElements() {
    this.elements = {
      modal: document.getElementById('referral-modal'),
      openModalBtn: document.getElementById('open-referral-modal'),
      closeModalBtn: document.getElementById('close-referral-modal'),
      referralLinkInput: document.getElementById('referral-link'),
      copyBtn: document.getElementById('copy-referral-link'),
      whatsappBtn: document.getElementById('share-whatsapp'),
      emailBtn: document.getElementById('share-email'),
      progressText: document.getElementById('referral-progress-text'),
      progressBar: document.getElementById('referral-progress-bar')
    };
  }
  
  initEventListeners() {
    this.elements.openModalBtn.addEventListener('click', () => this.openModal());
    this.elements.closeModalBtn.addEventListener('click', () => this.closeModal());
    this.elements.copyBtn.addEventListener('click', () => this.copyReferralLink());
    this.elements.whatsappBtn.addEventListener('click', () => this.shareViaWhatsApp());
    this.elements.emailBtn.addEventListener('click', () => this.shareViaEmail());
    
    // Close modal when clicking outside
    this.elements.modal.addEventListener('click', (e) => {
      if (e.target === this.elements.modal) {
        this.closeModal();
      }
    });
  }
  
  async loadReferralData() {
    try {
      if (!window.App?.Auth) {
        console.error('Auth not initialized');
        return;
      }
      
      // Get user's referral data
      const response = await fetch(`${window.App.Auth.API_BASE_URL}/referrals`, {
        headers: {
          'Authorization': `Bearer ${window.App.Auth.getAccessToken()}`
        }
      });
      
      if (!response.ok) throw new Error('Failed to load referral data');
      
      const data = await response.json();
      this.referralLink = data.referralLink || `${window.location.origin}?ref=${data.referralCode}`;
      this.referralCount = data.referralCount || 0;
      
      this.updateUI();
    } catch (error) {
      console.error('Error loading referral data:', error);
      // Fallback if API fails
      this.referralLink = `${window.location.origin}?ref=${this.generateRandomCode()}`;
      this.updateUI();
    }
  }
  
  generateRandomCode() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
  }
  
  updateUI() {
    // Update progress
    const progressPercent = Math.min((this.referralCount / this.referralGoal) * 100, 100);
    this.elements.progressText.textContent = `${this.referralCount}/${this.referralGoal} referrals`;
    this.elements.progressBar.style.width = `${progressPercent}%`;
    
    // Update modal content
    this.elements.referralLinkInput.value = this.referralLink;
    
    // Add celebration if goal reached
    if (this.referralCount >= this.referralGoal) {
      this.showSuccessMessage();
    }
  }
  
  openModal() {
    this.elements.modal.classList.remove('hidden');
    document.body.classList.add('overflow-hidden');
  }
  
  closeModal() {
    this.elements.modal.classList.add('hidden');
    document.body.classList.remove('overflow-hidden');
  }
  
  copyReferralLink() {
    this.elements.referralLinkInput.select();
    document.execCommand('copy');
    
    // Change button text temporarily
    const originalText = this.elements.copyBtn.innerHTML;
    this.elements.copyBtn.innerHTML = '<i class="fas fa-check mr-1"></i> Copied!';
    
    setTimeout(() => {
      this.elements.copyBtn.innerHTML = originalText;
    }, 2000);
  }
  
  shareViaWhatsApp() {
    const message = `Join me on NexaHealth - the smart way to verify medications and track your health! Use my referral link: ${this.referralLink}`;
    const url = `https://wa.me/?text=${encodeURIComponent(message)}`;
    window.open(url, '_blank');
  }
  
  shareViaEmail() {
    const subject = 'Join me on NexaHealth';
    const body = `Hi there,\n\nI thought you might be interested in NexaHealth - a platform that helps verify medications and track health records.\n\nUse my referral link to sign up: ${this.referralLink}\n\nBest regards,`;
    const url = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    window.location.href = url;
  }
  
  showSuccessMessage() {
    // Add confetti effect
    if (typeof confetti === 'function') {
      confetti({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.6 }
      });
    }
    
    // Update the referral section
    const referralSection = document.querySelector('.dashboard-card.bg-gradient-to-r');
    if (referralSection) {
      referralSection.innerHTML = `
        <div class="p-6 text-center">
          <div class="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-green-100 mb-4">
            <i class="fas fa-trophy text-green-600 text-2xl"></i>
          </div>
          <h3 class="text-lg font-bold text-white mb-2">Congratulations!</h3>
          <p class="text-white opacity-90 mb-4">You've unlocked early access to our AI Health Companion.</p>
          <button class="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-indigo-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-white">
            <i class="fas fa-rocket mr-2"></i> Try It Now
          </button>
        </div>
      `;
    }
  }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  new ReferralSystem();
});