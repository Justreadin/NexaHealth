// referral.js
if (!window.ReferralSystem) {
  class ReferralSystem {
    constructor() {
      this.referralLink = '';
      this.referralCount = 0;
      this.referralGoal = 3;
      this.reachedGoal = false;
      this.badges = []; // optional: compute locally

      this.initElements();
      this.initEventListeners();
      this.loadReferralData();
      this.checkReferralInURL();
    }

    // ---------- CORE ----------
    initElements() {
      const byId = (id) => document.getElementById(id);
      this.elements = {
        modal: byId('referral-modal'),
        openModalBtn: byId('open-referral-modal'),
        closeModalBtn: byId('close-referral-modal'),
        referralLinkInput: byId('referral-link'),
        copyBtn: byId('copy-referral-link'),
        whatsappBtn: byId('share-whatsapp'),
        emailBtn: byId('share-email'),
        twitterBtn: byId('share-twitter'),
        telegramBtn: byId('share-telegram'),
        progressText: byId('referral-progress-text'),
        progressBar: byId('referral-progress-bar'),
        leaderboard: byId('referral-leaderboard'),
        badgeContainer: byId('referral-badges')
      };
    }

    initEventListeners() {
      if (!this.elements.openModalBtn || !this.elements.modal) return;

      this.elements.openModalBtn.addEventListener('click', () => this.openModal());
      this.elements.closeModalBtn?.addEventListener('click', () => this.closeModal());
      this.elements.copyBtn?.addEventListener('click', () => this.copyReferralLink());

      this.elements.whatsappBtn?.addEventListener('click', () => this.shareViaWhatsApp());
      this.elements.emailBtn?.addEventListener('click', () => this.shareViaEmail());
      this.elements.twitterBtn?.addEventListener('click', () => this.shareViaTwitter());
      this.elements.telegramBtn?.addEventListener('click', () => this.shareViaTelegram());

      // Close when clicking backdrop
      this.elements.modal.addEventListener('click', (e) => {
        if (e.target === this.elements.modal) this.closeModal();
      });
    }

    async loadReferralData() {
      try {
        const res = await fetch(`${window.App.Auth.API_BASE_URL}/referrals`, {
          headers: { Authorization: `Bearer ${window.App.Auth.getAccessToken()}` }
        });

        if (res.status === 401) {
          this.showToast('Please log in to get your referral link.');
          return;
        }
        if (!res.ok) throw new Error(`Failed: ${res.status}`);

        const data = await res.json();

        // Map exactly to your backend shape
        this.referralLink = data.referralLink || `${window.location.origin}?ref=${data.referralCode}`;
        this.referralCount = Number(data.referralCount || 0);
        this.referralGoal = Number(data.referralGoal || 3);
        this.reachedGoal = Boolean(data.reachedGoal);

        // Optional local badge logic (can be replaced by API-provided badges later)
        this.badges = this.computeBadges(this.referralCount);

        this.updateUI();
        this.loadLeaderboard();
      } catch (err) {
        console.error('Referral load failed:', err);
        // Hard fallback: still provide a link so user can share
        const fallbackCode = this.generateRandomCode();
        this.referralLink = `${window.location.origin}?ref=${fallbackCode}`;
        this.updateUI();
      }
    }

    // ---------- UI ----------
    updateUI() {
      const percent = this.referralGoal > 0
        ? Math.min((this.referralCount / this.referralGoal) * 100, 100)
        : 0;

      if (this.elements.progressText) {
        this.elements.progressText.textContent = `${this.referralCount}/${this.referralGoal} referrals`;
      }
      if (this.elements.progressBar) {
        this.elements.progressBar.style.width = `${percent}%`;
        this.elements.progressBar.classList.add('transition-all', 'duration-700', 'ease-out');
      }
      if (this.elements.referralLinkInput) {
        this.elements.referralLinkInput.value = this.referralLink;
      }

      if (this.reachedGoal || this.referralCount >= this.referralGoal) {
        this.unlockReward();
      }

      this.renderBadges();
    }

    unlockReward() {
      this.showConfetti();
      this.playSound('success.mp3');
      this.showToast("🔥 Odogwu! You’ve unlocked early access!");

      // Keep your original gradient card colors
      const referralSection = document.querySelector('.dashboard-card.bg-gradient-to-r.from-purple-600.to-indigo-600');
      if (referralSection) {
        referralSection.innerHTML = `
          <div class="p-6 relative">
            <div class="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full translate-x-16 -translate-y-16"></div>
            <div class="absolute bottom-0 left-0 w-40 h-40 bg-white/5 rounded-full -translate-x-20 translate-y-20"></div>
            <div class="relative z-10 text-center text-white">
              <div class="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-green-100 mb-4">
                <i class="fas fa-trophy text-green-600 text-2xl"></i>
              </div>
              <h3 class="text-lg font-bold mb-1">Access Unlocked 🎉</h3>
              <p class="opacity-90">You’re first in line for: AI Health Companion, AI Drug Scanner & more.</p>
            </div>
          </div>
        `;
      }
    }

    renderBadges() {
      const el = this.elements.badgeContainer;
      if (!el) return;
      el.innerHTML = '';
      this.badges.forEach((b) => {
        const div = document.createElement('div');
        div.className = 'inline-flex items-center bg-yellow-200 text-yellow-800 px-3 py-1 rounded-full text-xs font-bold mr-2 mb-2';
        div.innerHTML = `<i class="fas fa-medal mr-1"></i> ${b}`;
        el.appendChild(div);
      });
    }

    computeBadges(count) {
      const badges = [];
      if (count >= 1) badges.push('Plug 🔌');
      if (count >= 2) badges.push('Hype Squad 💫');
      if (count >= 3) badges.push('Odogwu 🏆');
      return badges;
    }

    async loadLeaderboard() {
      if (!this.elements.leaderboard) return;
      try {
        const res = await fetch(`${window.App.Auth.API_BASE_URL}/referrals/leaderboard`, {
          headers: { 'Content-Type': 'application/json' }
        });
        if (!res.ok) return;
        const data = await res.json();
        this.elements.leaderboard.innerHTML = data.map((u, i) => `
          <div class="flex justify-between py-2 border-b border-gray-200">
            <span class="font-medium">${i + 1}. ${this.escape(String(u.username || 'Anonymous'))}</span>
            <span class="text-green-600 font-bold">${Number(u.count || 0)} ⚡</span>
          </div>
        `).join('');
      } catch (e) {
        console.warn('Leaderboard failed', e);
      }
    }

    // ---------- SHARING ----------
    async copyReferralLink() {
      try {
        if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(this.referralLink);
        } else {
          // Fallback for older browsers
          this.elements.referralLinkInput?.select();
          document.execCommand('copy');
        }
        this.showToast('📋 Copied referral link!');
      } catch {
        this.showToast('Could not copy. Long-press to copy.');
      }
    }

    shareViaWhatsApp() {
      const msg = `🔥 Join me on NexaHealth! Verify drugs, manage prescriptions, unlock AI health features. Use my link: ${this.referralLink}`;
      window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank', 'noopener');
    }

    shareViaEmail() {
      const subject = 'Join NexaHealth with me!';
      const body = `Hey! 🚀 Check out NexaHealth. It's 🔥 for managing health. Use my link: ${this.referralLink}`;
      window.location.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    }

    shareViaTwitter() {
      const text = `🚀 I'm using NexaHealth! Verify drugs, track prescriptions & unlock AI health. Join via my link: ${this.referralLink}`;
      window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
    }

    shareViaTelegram() {
      const text = `🔥 NexaHealth is the future of healthcare in Naija! Join now: ${this.referralLink}`;
      window.open(`https://t.me/share/url?url=${encodeURIComponent(this.referralLink)}&text=${encodeURIComponent(text)}`, '_blank', 'noopener');
    }

    // ---------- REFERRAL APPLICATION ----------
    // Backend does NOT expose /referrals/use/{code} in your snippet.
    // Add an endpoint for applying a code, or remove this method.
    async checkReferralInURL() {
      const params = new URLSearchParams(window.location.search);
      const code = params.get('ref');
      if (!code) return;

      try {
        const headers = { "Content-Type": "application/json" };
        const token = window.App.Auth.getAccessToken?.();
        if (token) headers["Authorization"] = `Bearer ${token}`;

        const response = await fetch(
          `${window.App.Auth.API_BASE_URL}/referrals/use/${encodeURIComponent(code)}`,
          { method: 'POST', headers }
        );

        if (response.ok) {
          const data = await response.json();
          this.showToast(`✅ Referral applied! (${data.newCount} total)`);
          this.playSound('referral.mp3');
        } else {
          console.warn("Referral not applied:", await response.text());
        }
      } catch (e) {
        console.error('Referral apply failed', e);
      }
    }


    // ---------- UTILS ----------
    generateRandomCode() {
      return Math.random().toString(36).substring(2, 8).toUpperCase();
    }

    escape(str) {
      const div = document.createElement('div');
      div.innerText = str;
      return div.innerHTML;
    }

    showConfetti() {
      if (typeof confetti === 'function') {
        confetti({ particleCount: 150, spread: 80, origin: { y: 0.6 } });
      }
    }

    playSound(file) {
      const audio = new Audio(`/sounds/${file}`);
      audio.play().catch(() => {});
    }

    showToast(msg) {
      const toast = document.createElement('div');
      toast.className = 'fixed bottom-5 right-5 bg-black text-white px-4 py-2 rounded-lg shadow-lg';
      toast.textContent = msg;
      document.body.appendChild(toast);
      setTimeout(() => toast.remove(), 2600);
    }

    openModal() { this.elements.modal?.classList.remove('hidden'); }
    closeModal() { this.elements.modal?.classList.add('hidden'); }
  }

  window.ReferralSystem = ReferralSystem;
  document.addEventListener('DOMContentLoaded', () => new ReferralSystem());
}
