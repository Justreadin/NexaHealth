/**
 * Dashboard Statistics Controller
 * Handles fetching and displaying verification and report counts
 */

class DashboardStats {
  constructor() {
    this.refreshInterval = 300000; // 5 minutes
    this.init();
  }

  async init() {
    this.setupEventListeners();
    await this.updateDashboardStats();
    this.setupAutoRefresh();
  }

  setupEventListeners() {
    // Refresh button
    const refreshBtn = document.getElementById('refresh-stats');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', async () => {
        await this.handleRefreshClick(refreshBtn);
      });
    }

    // Period filter buttons
    document.querySelectorAll('[data-period]').forEach(btn => {
      btn.addEventListener('click', () => {
        const period = btn.dataset.period;
        this.updateDashboardStats(period);
        this.setActivePeriodButton(period);
      });
    });
  }

  setActivePeriodButton(activePeriod) {
    document.querySelectorAll('[data-period]').forEach(btn => {
      if (btn.dataset.period === activePeriod) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });
  }

  async handleRefreshClick(button) {
    button.disabled = true;
    button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Refreshing...';
    try {
      await this.updateDashboardStats();
    } catch (error) {
      console.error('Refresh failed:', error);
      this.showErrorNotification('Failed to refresh data');
    } finally {
      button.innerHTML = '<i class="fas fa-sync-alt"></i> Refresh';
      button.disabled = false;
    }
  }

  setupAutoRefresh() {
    setInterval(async () => {
      await this.updateDashboardStats();
    }, this.refreshInterval);
  }

  async updateDashboardStats(period = null) {
    try {
      // Show loading states
      this.setLoadingState(true);

      // Build query params if period is specified
      const params = period ? `?period=${period}` : '';

      // Fetch data in parallel
      const [verificationData, reportData] = await Promise.all([
        this.fetchStats('verification-count', params),
        this.fetchStats('report-count', params)
      ]);

      // Update cards
      this.updateCard('.verified-stats', verificationData);
      this.updateCard('.reported-stats', reportData);

    } catch (error) {
      console.error('Failed to fetch dashboard stats:', error);
      this.showErrorNotification('Failed to update dashboard statistics');
    } finally {
      this.setLoadingState(false);
    }
  }

async fetchStats(endpoint, params = '') {
    try {
        const response = await window.authFetch( // <-- call the global version
            `https://lyre-4m8l.onrender.com/api/stats/${endpoint}${params}`,
            {
                headers: {
                    'Content-Type': 'application/json'
                }
            }
        );

        if (response.status === 401) {
            console.warn(`Token expired while fetching ${endpoint}, trying refresh...`);
            try {
                await window.App.Auth.refreshToken();
                return this.fetchStats(endpoint, params); // retry after refresh
            } catch (refreshError) {
                console.error('Refresh token failed:', refreshError);
                window.location.href = 'login.html';
                return { total: 0, today: 0, error: 'Unauthorized' };
            }
        }

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        return await response.json();
    } catch (error) {
        console.error(`Error fetching ${endpoint}:`, error);
        return { total: 0, today: 0, error: error.message };
    }
}

  updateCard(selector, data) {
    const card = document.querySelector(selector);
    if (!card) return;

    // Update main count
    const countElement = card.querySelector('.text-lg');
    if (countElement) {
      countElement.textContent = data.total.toLocaleString();
    }

    // Update secondary count if available
    const secondaryElement = card.querySelector('.text-sm');
    if (secondaryElement) {
      if (data.period_count !== undefined) {
        secondaryElement.textContent = `${data.period_count.toLocaleString()} this ${data.period}`;
      } else {
        secondaryElement.textContent = `${data.today.toLocaleString()} today`;
      }
    }

    // Add animation
    this.animateCard(card);

    // Update card status based on data
    if (data.error) {
      card.classList.add('error-state');
    } else {
      card.classList.remove('error-state');
    }
  }

  animateCard(card) {
    card.classList.add('animate-pulse');
    setTimeout(() => {
      card.classList.remove('animate-pulse');
    }, 500);
  }

  setLoadingState(isLoading) {
    document.querySelectorAll('.dashboard-card').forEach(card => {
      if (isLoading) {
        card.classList.add('loading');
      } else {
        card.classList.remove('loading');
      }
    });
  }

  showErrorNotification(message) {
    // Implement your notification system here
    console.error(message);
    // Example using Toastify:
    // Toastify({
    //   text: message,
    //   duration: 3000,
    //   gravity: "top",
    //   position: "right",
    //   backgroundColor: "linear-gradient(to right, #ff5f6d, #ffc371)",
    // }).showToast();
  }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  new DashboardStats();
});