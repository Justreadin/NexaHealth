// js/saas-dashboard.js
(() => {
  const API_BASE = 'https://nexahealth-backend-production.up.railway.app';
  const PHARMACY_PREFIX = '/pharmacy';
  const STATS_PREFIX = '/api/stats';
  const TIMEOUT = 12000;

  // Token keys used in your app (try pharmacy-specific first, fallback to common)
  const TOKEN_KEYS = [
    'nexahealth_pharmacy_token',
    'access_token'
  ];

  function getAuthToken() {
    for (const k of TOKEN_KEYS) {
      const v = sessionStorage.getItem(k) || localStorage.getItem(k);
      if (v) return v;
    }
    return null;
  }

  function timeoutFetch(url, options = {}, ms = TIMEOUT) {
    const controller = new AbortController();
    const tid = setTimeout(() => controller.abort(), ms);
    const opts = { ...options, signal: controller.signal };
    return fetch(url, opts)
      .finally(() => clearTimeout(tid));
  }

  // Map a "badge id/name" to a friendly display. Extend as needed.
  function badgeDisplayInfo(badgeName) {
    const name = (badgeName || '').toString().toLowerCase();
    if (name.includes('partner')) {
      return { title: 'Partner', icon: 'fa-handshake', colorClass: 'gradient-bg' };
    }
    if (name.includes('trusted')) {
      return { title: 'Trusted', icon: 'fa-shield-alt', colorClass: 'gradient-bg' };
    }
    if (name.includes('starter') || name.includes('new')) {
      return { title: 'Starter', icon: 'fa-star', colorClass: 'bg-gray-200' };
    }
    // default
    return { title: badgeName || 'Partner', icon: 'fa-star', colorClass: 'gradient-bg' };
  }

  // ------- DOM helpers -------
  const $ = (sel) => document.querySelector(sel);
  const setText = (sel, txt) => {
    const el = $(sel);
    if (el) el.textContent = txt;
  };
  const setHTML = (sel, html) => {
    const el = $(sel);
    if (el) el.innerHTML = html;
  };
  const setProgressBar = (selector, pct) => {
    const el = $(selector);
    if (!el) return;
    el.style.width = `${Math.max(0, Math.min(100, pct))}%`;
  };

  // ------- populate pharmacy profile -------
  async function loadPharmacyProfile() {
    const token = getAuthToken();
    if (!token) {
      console.warn('No auth token found for dashboard.');
      setText('#welcome-message', 'Welcome');
      setText('#account-status', 'Not signed in');
      return;
    }

    try {
      const resp = await timeoutFetch(`${API_BASE}${PHARMACY_PREFIX}/auth/me`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/json'
        },
        credentials: 'include'
      }, TIMEOUT);

      if (!resp.ok) {
        console.warn('Failed to fetch pharmacy profile', resp.status);
        // show fallback messages
        setText('#welcome-message', 'Welcome');
        setText('#account-status', 'Unavailable');
        return;
      }

      const data = await resp.json();

      // Data fields come from PharmacyProfileResponse
      const pharmacyName = data.pharmacy_name || data.pharmacyName || data.email || 'Pharmacy';
      const status = (data.status || 'pending').toLowerCase();
      const badges = Array.isArray(data.badges) ? data.badges : [];
      const profileCompleteness = Number(data.profile_completeness || 0);
      const avgRating = data.avg_rating ?? null;
      const totalVerifications = data.total_verifications ?? 0;

      // Welcome + status
      setText('#welcome-message', `Welcome, ${pharmacyName}`);
      setText('#account-status', (status || 'pending').toUpperCase());

      // summary card counts
      setText('#verifications-count', totalVerifications.toString());
      setText('#reports-count', '—'); // left as placeholder unless API provides
      setText('#pharmacy-status', (status.charAt(0).toUpperCase() + status.slice(1)));

      // Badge display (use first badge or default to Partner)
      const badgeName = badges.length ? badges[0] : 'Partner';
      const info = badgeDisplayInfo(badgeName);
      const badgeIconEl = $('#current-badge-icon');
      if (badgeIconEl) {
        badgeIconEl.innerHTML = `<i class="fas ${info.icon} text-white text-xl"></i>`;
        badgeIconEl.className = `w-16 h-16 rounded-full flex items-center justify-center mr-4 ${info.colorClass}`;
      }
      setText('#current-badge-name', info.title);

      // Next badge & progress
      // We'll assume next badge is the same + 25% steps as a placeholder.
      const nextBadge = 'Partner+';
      setText('#next-badge-name', nextBadge);
      setProgressBar('#badge-progress-bar', profileCompleteness);
      setText('#badge-progress-text', `${profileCompleteness}%`);

      // Profile completeness ring and text
      const ringText = $('#profile-progress-text');
      if (ringText) ringText.textContent = `${profileCompleteness}%`;
      setText('#profile-completeness-text', `Profile completeness: ${profileCompleteness}%`);

      // Account plan info (placeholder)
      setText('#account-plan-info', `Account status: ${status.charAt(0).toUpperCase() + status.slice(1)} — Badge: ${info.title}`);

            // ------- ALSO UPDATE PREVIEW CARD -------
      setText('#preview-pharmacy-name', pharmacyName);

      // Status badge
      const statusBadge = $('#preview-status-badge');
      if (statusBadge) {
        statusBadge.textContent = status.charAt(0).toUpperCase() + status.slice(1);
        statusBadge.className = `inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${
          status === 'approved'
            ? 'bg-green-100 text-green-700'
            : status === 'rejected'
            ? 'bg-red-100 text-red-700'
            : 'bg-yellow-100 text-yellow-700'
        }`;
      }

      // Location (fallback if missing)
      setText('#preview-location', data.address || 'No address provided');

      // Phone
      setText('#preview-phone', data.phone_number || data.phone || 'No phone');

      // License
      setText('#preview-license', data.license_number || data.license || 'No license uploaded');

      // Joined date
      setText('#preview-joined', data.created_at ? new Date(data.created_at).toDateString() : 'Joined Recently');


    } catch (err) {
      console.error('Error loading pharmacy profile:', err);
      setText('#welcome-message', 'Welcome');
      setText('#account-status', 'Error');
    }

  }

  // ------- stats endpoints -------
  async function fetchStat(endpoint, params = '') {
    const token = getAuthToken();
    if (!token) return { total: 0, today: 0, period_count: 0 };
    try {
      const resp = await timeoutFetch(`${API_BASE}${STATS_PREFIX}/${endpoint}${params}`, {
        headers: { 'Authorization': `Bearer ${token}` },
        credentials: 'include'
      }, TIMEOUT);
      if (!resp.ok) {
        console.warn(`Stat ${endpoint} returned ${resp.status}`);
        return { total: 0, today: 0, period_count: 0 };
      }
      return await resp.json();
    } catch (err) {
      console.warn('fetchStat error', endpoint, err);
      return { total: 0, today: 0, period_count: 0 };
    }
  }

  async function loadStats() {
    // Verification and reports and referred pharmacies (day)
    const [verifications, reports, referred] = await Promise.all([
      fetchStat('verification-count', '?period=day'),
      fetchStat('report-count', '?period=day'),
      fetchStat('referred-pharmacies-count', '?period=day')
    ]);

    // Update cards if present. Use safe selectors.
    // Verified drugs card -> #verifications-count already set by profile loader if available, but update from stats too:
    if (verifications && typeof verifications.total !== 'undefined') {
      setText('#verifications-count', String(verifications.total || 0));
      // small secondary text (today)
      const el = $('#verifications-count')?.parentElement?.querySelector('.text-xs.opacity-80');
      if (el) el.textContent = 'Verifications';
      // If you had a "today" display element, you could set it too
    }

    if (reports && typeof reports.total !== 'undefined') {
      setText('#reports-count', String(reports.total || 0));
    }

    if (referred && typeof referred.total !== 'undefined') {
      // We'll place this into the "Pharmacies Referred" card's count if present
      const referredCard = document.querySelector('.referred-stats');
      if (referredCard) {
        const countEl = referredCard.querySelector('.stat-count') || referredCard.querySelector('.font-bold');
        if (countEl) countEl.textContent = String(referred.total || 0);
        const labelEl = referredCard.querySelector('.stat-label') || referredCard.querySelector('.truncate');
        if (labelEl) labelEl.textContent = `${referred.today || 0} Today`;
      }
    }

    // Nearby pharmacies count: call nearby endpoint if location is available
    try {
      // get geolocation
      const pos = await new Promise((resolve) => {
        if (!navigator.geolocation) return resolve(null);
        navigator.geolocation.getCurrentPosition((p) => resolve(p), () => resolve(null), {timeout:5000});
      });

      if (pos) {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        const token = getAuthToken();
        if (token) {
          const resp = await timeoutFetch(`${API_BASE}${STATS_PREFIX}/nearby-pharmacies?lat=${lat}&lng=${lng}&radius_km=5`, {
            headers: { 'Authorization': `Bearer ${token}` },
            credentials: 'include'
          }, TIMEOUT);
          if (resp.ok) {
            const data = await resp.json();
            const nearbyCard = document.querySelector('.nearby-stats');
            if (nearbyCard) {
              const countEl = nearbyCard.querySelector('.stat-count') || nearbyCard.querySelector('.font-bold');
              if (countEl) countEl.textContent = String(data.total || 0);
              const labelEl = nearbyCard.querySelector('.stat-label') || nearbyCard.querySelector('.truncate');
              if (labelEl) labelEl.textContent = `Total ${data.total || 0}`;
            }
          }
        }
      }
    } catch (err) {
      console.warn('Nearby fetch failed', err);
    }
  }

  // ------- initialization -------
  document.addEventListener('DOMContentLoaded', async () => {
    try {
      // show skeleton / loading
      setText('#welcome-message', 'Loading...');
      setText('#account-status', 'Loading...');
      setText('#verifications-count', '-');
      setText('#reports-count', '-');
      setText('#pharmacy-status', '-');
      setText('#current-badge-name', '-');
      setText('#next-badge-name', '-');
      setText('#badge-progress-text', '-');

      // load profile and stats (parallel where safe)
      await Promise.all([loadPharmacyProfile(), loadStats()]);
    } catch (err) {
      console.error('Dashboard init failed', err);
    }
  });
  

  // expose for debug
  window._NexaDashboard = {
    loadPharmacyProfile,
    loadStats,
    getAuthToken
  };

})();
