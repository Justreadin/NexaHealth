document.addEventListener('DOMContentLoaded', async () => {
  try {

    const getStoredAccessToken = () => {
      return (
        localStorage.getItem('nexahealth_access_token') ||
        sessionStorage.getItem('nexahealth_access_token')
      );
    };

    // ✅ Wait for Auth OR fallback to stored token
    const waitForAuth = async () => {
      let retries = 20;

      while (!window.App?.Auth && retries > 0) {
        await new Promise(res => setTimeout(res, 100));
        retries--;
      }

      if (!window.App?.Auth) {
        const token = getStoredAccessToken();
        if (token) {
          window.App = window.App || {};
          window.App.Auth = {
            getAccessToken: () => token,
            API_BASE_URL: 'https://lyre-4m8l.onrender.com'
          };
          return true;
        }

        window.location.href = 'login.html';
        return false;
      }

      return true;
    };

    const authReady = await waitForAuth();
    if (!authReady) return;

    // ✅ Load user data
    const loadUserData = async () => {
      try {
        const response = await fetch(`${window.App.Auth.API_BASE_URL}/auth/me`, {
          headers: {
            'Authorization': `Bearer ${window.App.Auth.getAccessToken()}`,
            'Content-Type': 'application/json'
          }
        });

        if (response.status === 401) {
          try {
            await window.App.Auth.refreshToken();
            return await loadUserData();
          } catch (refreshError) {
            throw new Error('Session expired');
          }
        }

        if (!response.ok) {
          throw new Error('Failed to load user data');
        }

        const userData = await response.json();

        // ✅ Safer welcome text update
        const welcomeEl = document.querySelector('h1.text-2xl') 
                          || document.querySelector('.dashboard-welcome');
        if (welcomeEl) {
          welcomeEl.textContent = `Welcome, ${userData.first_name || 'User'}`;
        }

      } catch (error) {
        console.error('User data error:', error);
        throw error;
      }
    };

    // ✅ Load dashboard stats (fixed selectors)
    const loadDashboardStats = async () => {
      try {
        const response = await fetch('https://lyre-4m8l.onrender.com/dashboard/stats', {
          headers: {
            'Authorization': `Bearer ${window.App.Auth.getAccessToken()}`
          }
        });

        if (!response.ok) throw new Error('Failed to load stats');

        const stats = await response.json();

        // ✅ Correctly match your HTML structure
        const verifiedStat = document.querySelector('.verified-stats .stat-count');
        if (verifiedStat) verifiedStat.textContent = stats.verified_drugs || 0;

        const reportedStat = document.querySelector('.reported-stats .stat-count');
        if (reportedStat) reportedStat.textContent = stats.reported_issues || 0;

        const nearbyStat = document.querySelector('.nearby-stats .stat-count');
        if (nearbyStat) nearbyStat.textContent = stats.nearby_total || 0;

        const referredStat = document.querySelector('.referred-stats .stat-count');
        if (referredStat) referredStat.textContent = stats.referred_pharmacies || 0;

        // ✅ If you want to update labels (e.g., "0 Today"):
        const verifiedLabel = document.querySelector('.verified-stats .stat-label');
        if (verifiedLabel) verifiedLabel.textContent = `${stats.verified_today || 0} Today`;

        const reportedLabel = document.querySelector('.reported-stats .stat-label');
        if (reportedLabel) reportedLabel.textContent = `${stats.reported_today || 0} Today`;

        const nearbyLabel = document.querySelector('.nearby-stats .stat-label');
        if (nearbyLabel) nearbyLabel.textContent = `${stats.nearby_total || 0} Total`;

        const referredLabel = document.querySelector('.referred-stats .stat-label');
        if (referredLabel) referredLabel.textContent = `${stats.referred_today || 0} Today`;

      } catch (error) {
        console.error('Error loading stats:', error);
      }
    };

    // ✅ Load recent activity
    const loadRecentActivity = async () => {
      try {
        const response = await fetch('https://lyre-4m8l.onrender.com/dashboard/activity', {
          headers: {
            'Authorization': `Bearer ${window.App.Auth.getAccessToken()}`
          }
        });

        if (!response.ok) throw new Error('Failed to load activity');

        const activities = await response.json();
        const activityContainer = document.querySelector('.activity-container');

        if (!activityContainer) return; // Prevent crash

        activityContainer.innerHTML = ''; // Clear old content

        activities.forEach(activity => {
          const activityItem = document.createElement('div');
          activityItem.className = 'p-4 hover:bg-gray-50 transition-colors';
          activityItem.innerHTML = `
            <div class="flex items-start">
              <div class="flex-shrink-0 bg-${activity.color}-50 p-3 rounded-lg text-${activity.color}-600 mr-3">
                <i class="fas fa-${activity.icon}"></i>
              </div>
              <div class="flex-1 min-w-0">
                <div class="flex items-center justify-between">
                  <p class="text-sm font-medium text-gray-900 truncate">${activity.title}</p>
                  <p class="text-xs text-gray-500 whitespace-nowrap ml-2">
                    ${new Date(activity.timestamp).toLocaleString()}
                  </p>
                </div>
                <p class="text-sm text-gray-600 mt-1">${activity.description}</p>
                <div class="mt-2 flex items-center">
                  <span class="activity-badge bg-${activity.color}-500"></span>
                  <span class="text-xs font-medium text-${activity.color}-800">
                    ${activity.status.replace('_', ' ')}
                  </span>
                </div>
              </div>
            </div>
          `;
          activityContainer.appendChild(activityItem);
        });
      } catch (error) {
        console.error('Error loading activity:', error);
      }
    };

    // ✅ Load everything in parallel
    Promise.all([
      loadUserData().catch(e => {
        console.error('Failed to load user data:', e);
        throw e;
      }),
      loadDashboardStats().catch(e => console.error('Stats load failed:', e)),
      loadRecentActivity().catch(e => console.error('Activity load failed:', e)),
      new Promise((resolve) => {
        const script = document.createElement('script');
        script.src = 'js/referral.js';
        script.onload = resolve;
        document.body.appendChild(script);
      })
    ]);

  } catch (error) {
    console.error('Dashboard error:', error);
    if (
      error.message === 'Session expired' ||
      error.message === 'Failed to load user data'
    ) {
      showAlert('Your session has expired or could not be verified. Please log in again.', 'error');
      window.location.href = 'login.html';
    }
  }
});

// ✅ Prevent global crash redirects
window.onerror = null;
window.onunhandledrejection = null;
