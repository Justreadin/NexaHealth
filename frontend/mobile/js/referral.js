document.addEventListener('DOMContentLoaded', () => {
  if (window.ReferralSystem) return; // prevent multiple instances

  class ReferralSystem {
    constructor() {
      this.referralLink = '';
      this.points = 0;
      this.referralGoal = 50;
      this.reachedGoal = false;

      this.initElements();
      this.persistReferralCode();
      this.initEventListeners();

      this.loadReferralData(); 
      this.waitForLoginAndApplyReferral(); // apply referral when token is available
    }

    // ---------- INIT ELEMENTS ----------
    initElements() {
      this.elements = {
        modal: document.getElementById('referral-modal'),
        referralLinkInput: document.getElementById('referral-link'),
        copyBtn: document.getElementById('copy-referral-link'),
        whatsappBtn: document.getElementById('share-whatsapp'),
        emailBtn: document.getElementById('share-email'),
        twitterBtn: document.getElementById('share-twitter'),
        telegramBtn: document.getElementById('share-telegram'),
        pointsDisplay: document.querySelector('.points'),
        progressText: document.querySelector('.bg-white.bg-opacity-20 .font-semibold')
      };

      this.inviteUserBtn = document.querySelector('.invite-users');
      this.invitePharmacyBtn = document.querySelector('.invite-pharmacies');
    }

    // ---------- EVENT LISTENERS ----------
    initEventListeners() {
      if (this.inviteUserBtn) this.inviteUserBtn.addEventListener('click', e => {
        e.preventDefault();
        this.openSharePopup('user');
      });

      if (this.invitePharmacyBtn) this.invitePharmacyBtn.addEventListener('click', e => {
        e.preventDefault();
        this.openSharePopup('pharmacy');
      });

      if (this.elements.copyBtn) this.elements.copyBtn.addEventListener('click', () => this.copyReferralLink());
      if (this.elements.whatsappBtn) this.elements.whatsappBtn.addEventListener('click', () => this.shareViaWhatsApp());
      if (this.elements.emailBtn) this.elements.emailBtn.addEventListener('click', () => this.shareViaEmail());
      if (this.elements.twitterBtn) this.elements.twitterBtn.addEventListener('click', () => this.shareViaTwitter());
      if (this.elements.telegramBtn) this.elements.telegramBtn.addEventListener('click', () => this.shareViaTelegram());

      if (this.elements.modal) {
        this.elements.modal.addEventListener('click', e => {
          if (e.target === this.elements.modal) this.closeModal();
        });
      }
    }

    // ---------- REFERRAL CODE HANDLING ----------
    persistReferralCode() {
      const params = new URLSearchParams(window.location.search);
      const code = params.get('ref');
      if (code) localStorage.setItem('referral_code', code);

      if (!localStorage.getItem('referral_type')) {
        localStorage.setItem('referral_type', 'user');
      }
    }

    getReferralCode() {
      return localStorage.getItem('referral_code');
    }

    getReferralType() {
      return localStorage.getItem('referral_type') || 'user';
    }

    // ---------- LOAD DATA FROM BACKEND ----------
    async loadReferralData() {
      const token = localStorage.getItem('nexahealth_access_token') 
           || sessionStorage.getItem('nexahealth_access_token');

      if (!token) return;

      try {
        const res = await fetch('https://nexahealth-backend-production.up.railway.app/referrals/', {
          headers: { Authorization: `Bearer ${token}` }
        });

        if (!res.ok) return;

        const data = await res.json();
        this.referralLink = data.referralLink || `${window.location.origin}?ref=${data.referralCode}`;
        this.points = Number(data.points || 0);
        this.reachedGoal = this.points >= this.referralGoal;

        this.updateUI();
      } catch (err) {
        console.error('Referral load failed:', err);
      }
    }

    // ---------- APPLY REFERRAL ----------
    async applyPendingReferral() {
      const token = localStorage.getItem('nexahealth_access_token') 
           || sessionStorage.getItem('nexahealth_access_token');
      const code = this.getReferralCode();
      if (!token || !code) return;

      try {
        const type = this.getReferralType();
        const res = await fetch(`https://nexahealth-backend-production.up.railway.app/referrals/use/${encodeURIComponent(code)}`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ type })
        });

        if (res.ok) {
          localStorage.removeItem('referral_code');
          localStorage.removeItem('referral_type');
          this.showToast('🔥 Referral applied successfully!');
          this.playSound('success.mp3');
          this.showConfetti();
          await this.loadReferralData();
        }
      } catch (err) {
        console.error('Failed to apply referral', err);
      }
    }

    // ---------- POLLING FOR LOGIN ----------
    waitForLoginAndApplyReferral() {
      const interval = setInterval(async () => {
        const token = localStorage.getItem('nexahealth_access_token') 
           || sessionStorage.getItem('nexahealth_access_token');
        const code = this.getReferralCode();
        if (token && code) {
          clearInterval(interval);
          await this.applyPendingReferral();
        }
      }, 1000);
    }

    // ---------- SHARE MODAL ----------
    openSharePopup(type) {
      if (!this.elements.modal) this.createShareModal();
      localStorage.setItem('referral_type', type);

      if (this.elements.referralLinkInput) {
        this.elements.referralLinkInput.value = this.referralLink || 'Loading...';
      }

      this.elements.modal.classList.remove('hidden');
      this.showToast(type === 'pharmacy' ? 'Invite your favorite pharmacies!' : 'Invite friends to join!');
    }

    createShareModal() {
      const modalHTML = `
        <div id="referral-modal" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 hidden">
          <div class="bg-white rounded-xl p-6 max-w-md w-full mx-4">
            <div class="flex justify-between items-center mb-4">
              <h3 class="text-lg font-bold text-gray-900">Share Referral Link</h3>
              <button onclick="window.ReferralSystem.closeModal()" class="text-gray-500 hover:text-gray-700">
                <i class="fas fa-times"></i>
              </button>
            </div>
            <div class="mb-4">
              <label class="block text-sm font-medium text-gray-700 mb-2">Your Referral Link</label>
              <div class="flex">
                <input id="referral-link" type="text" readonly class="flex-1 border border-gray-300 rounded-l-lg px-3 py-2 text-sm">
                <button id="copy-referral-link" class="bg-blue-600 text-white px-4 py-2 rounded-r-lg hover:bg-blue-700 transition-colors">Copy</button>
              </div>
            </div>
            <div class="grid grid-cols-2 gap-2">
              <button id="share-whatsapp" class="flex items-center justify-center gap-2 bg-green-500 text-white p-3 rounded-lg hover:bg-green-600 transition-colors"><i class="fab fa-whatsapp"></i> WhatsApp</button>
              <button id="share-email" class="flex items-center justify-center gap-2 bg-blue-500 text-white p-3 rounded-lg hover:bg-blue-600 transition-colors"><i class="fas fa-envelope"></i> Email</button>
              <button id="share-twitter" class="flex items-center justify-center gap-2 bg-blue-400 text-white p-3 rounded-lg hover:bg-blue-500 transition-colors"><i class="fab fa-twitter"></i> Twitter</button>
              <button id="share-telegram" class="flex items-center justify-center gap-2 bg-blue-600 text-white p-3 rounded-lg hover:bg-blue-700 transition-colors"><i class="fab fa-telegram"></i> Telegram</button>
            </div>
          </div>
        </div>
      `;
      document.body.insertAdjacentHTML('beforeend', modalHTML);
      this.initElements();
      this.initEventListeners();
    }

    closeModal() { this.elements.modal?.classList.add('hidden'); }

    // ---------- UI ----------
    updateUI() {
      if (this.elements.pointsDisplay) this.elements.pointsDisplay.textContent = `${this.points} pts`;
      if (this.elements.progressText) this.elements.progressText.textContent = `Super Access at ${this.referralGoal} pts`;
      if (this.reachedGoal) this.unlockReward();
    }

    unlockReward() {
      this.showConfetti();
      this.playSound('success.mp3');
      this.showToast("🎉 Super Access Unlocked! Be first to try new features.");
    }

    // ---------- SHARE ----------
    async copyReferralLink() {
      try { await navigator.clipboard.writeText(this.referralLink); this.showToast('📋 Referral link copied!'); }
      catch { this.showToast('Could not copy. Long-press to copy.'); }
    }
    shareViaWhatsApp() { window.open(`https://wa.me/?text=${encodeURIComponent('🔥 Join me on NexaHealth! ' + this.referralLink)}`, '_blank'); }
    shareViaEmail() { window.location.href = `mailto:?subject=${encodeURIComponent('Join NexaHealth!')}&body=${encodeURIComponent('Check out NexaHealth! ' + this.referralLink)}`; }
    shareViaTwitter() { window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent("🚀 Join NexaHealth via: " + this.referralLink)}`, '_blank'); }
    shareViaTelegram() { window.open(`https://t.me/share/url?url=${encodeURIComponent(this.referralLink)}&text=${encodeURIComponent('🔥 Join NexaHealth!')}`, '_blank'); }

    // ---------- UTIL ----------
    showToast(msg) {
      const toast = document.createElement('div');
      toast.className = 'fixed bottom-5 right-5 bg-black text-white px-4 py-2 rounded-lg shadow-lg z-50';
      toast.textContent = msg;
      document.body.appendChild(toast);
      setTimeout(() => toast.remove(), 2600);
    }
    showConfetti() { if (typeof confetti === 'function') confetti({ particleCount: 150, spread: 80, origin: { y: 0.6 } }); }
    playSound(file) { console.log('Playing sound:', file); }
  }

  window.ReferralSystem = new ReferralSystem();
});
