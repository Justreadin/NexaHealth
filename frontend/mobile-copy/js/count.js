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

  async updateDashboardStats(period = "day") {
    this.setLoadingState(true);

  const [verifications, reports] = await Promise.all([
    this.fetchStats("verification-count", `?period=${period}`),
    this.fetchStats("report-count", `?period=${period}`)
  ]);

  this.updateCard(".verified-stats", verifications, period);
  this.updateCard(".reported-stats", reports, period);

  this.setLoadingState(false);
}

  async fetchStats(endpoint, params = '') {
    try {
      const response = await fetch(`https://lyre-4m8l.onrender.com/api/stats/${endpoint}${params}`, {
        headers: {
          'Authorization': `Bearer ${window.App.Auth.getAccessToken()}`
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error(`Error fetching ${endpoint}:`, error);
      return { total: 0, today: 0, error: error.message };
    }
  }


  updateCard(selector, data, period) {
    const card = document.querySelector(selector);
    if (!card) return;

    const countElement = card.querySelector('.text-lg');
    const secondaryElement = card.querySelector('.text-sm');

    const formatNumber = (num) => {
      if (num >= 1_000_000) return (num / 1_000_000).toFixed(1) + "M";
      if (num >= 1_000) return (num / 1_000).toFixed(1) + "K";
      return num.toLocaleString();
    };

    const formatPeriodLabel = (p) => {
      switch (p) {
        case "day": return "Today";
        case "week": return "This Week";
        case "month": return "This Month";
        case "year": return "This Year";
        case "all": return "All Time";
        default: return "Period";
      }
    };

    // Main total
    if (countElement) {
      this.animateCount(countElement, data.total || 0, formatNumber);
    }

    // Secondary count
    if (secondaryElement) {
      let desc;
      if (period === "day") {
        desc = `${formatNumber(data.today || 0)} Today`;
      } else if (period === "all") {
        desc = `Total ${formatNumber(data.total || 0)}`;
      } else {
        desc = `${formatNumber(data.period_count || 0)} ${formatPeriodLabel(period)}`;
      }
      secondaryElement.textContent = desc;
      secondaryElement.classList.add("text-gray-600", "truncate");
    }

    // Animate card pulse
    this.animateCard(card);

    // Error state
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

  animateCount(element, newValue, formatter) {
    const duration = 800;
    const start = parseInt(element.textContent.replace(/[^0-9]/g, "")) || 0;
    const end = newValue;
    const startTime = performance.now();

    const step = (now) => {
      const progress = Math.min((now - startTime) / duration, 1);
      const current = Math.floor(start + (end - start) * progress);
      element.textContent = formatter(current);
      if (progress < 1) {
        requestAnimationFrame(step);
      }
    };

    requestAnimationFrame(step);
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
    console.error(message);
    // Toastify or another notification system can be plugged here
  }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  new DashboardStats();
});
