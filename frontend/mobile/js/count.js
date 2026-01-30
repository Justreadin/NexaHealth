/**
 * Dashboard Statistics Controller
 * Handles fetching and displaying verification, report, nearby, and referred pharmacies counts
 */
class DashboardStats {
  constructor() {
    this.refreshInterval = 300000; // 5 minutes
    this.userLocation = { lat: null, lng: null };
    this.init();
  }

  // ✅ Helper: Get token from sessionStorage or localStorage
  getAuthToken() {
    return (
      sessionStorage.getItem('nexahealth_access_token') ||
      localStorage.getItem('nexahealth_access_token')
    );
  }

  async init() {
    await this.getUserLocation();
    this.setupEventListeners();
    await this.updateDashboardStats();
    this.setupAutoRefresh();
  }

  async getUserLocation() {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          this.userLocation.lat = position.coords.latitude;
          this.userLocation.lng = position.coords.longitude;
        },
        (error) => {
          console.warn("Geolocation error:", error.message);
          this.userLocation.lat = 6.5244; // Lagos (fallback)
          this.userLocation.lng = 3.3792;
        }
      );
    } else {
      this.userLocation.lat = 6.5244;
      this.userLocation.lng = 3.3792;
    }
  }

  setupEventListeners() {
    const refreshBtn = document.getElementById('refresh-stats');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', async () => {
        await this.handleRefreshClick(refreshBtn);
      });
    }

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
      btn.classList.toggle('active', btn.dataset.period === activePeriod);
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

    const [verifications, reports, referred, nearby] = await Promise.all([
      this.fetchStats("verification-count", `?period=${period}`),
      this.fetchStats("report-count", `?period=${period}`),
      this.fetchStats("referred-pharmacies-count", `?period=${period}`),
      this.fetchNearbyPharmacies()
    ]);

    this.updateCard(".verified-stats", verifications, period);
    this.updateCard(".reported-stats", reports, period);
    this.updateCard(".referred-stats", referred, period);
    this.updateCard(".nearby-stats", nearby, "all");

    this.setLoadingState(false);
  }

  // ✅ Updated to use either storage
  async fetchStats(endpoint, params = '') {
    try {
      const token = this.getAuthToken();
      const response = await fetch(
        `https://nexahealth-backend-production.up.railway.app/api/stats/${endpoint}${params}`,
        {
          headers: { Authorization: `Bearer ${token}` }
        }
      );
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      return await response.json();
    } catch (error) {
      console.error(`Error fetching ${endpoint}:`, error);
      return { total: 0, today: 0, period_count: 0, error: error.message };
    }
  }

  // ✅ Updated to use either storage
  async fetchNearbyPharmacies() {
    if (!this.userLocation.lat || !this.userLocation.lng) {
      return { total: 0, pharmacies: [] };
    }
    try {
      const token = this.getAuthToken();
      const response = await fetch(
        `https://nexahealth-backend-production.up.railway.app/api/stats/nearby-pharmacies?lat=${this.userLocation.lat}&lng=${this.userLocation.lng}&radius_km=5`,
        {
          headers: { Authorization: `Bearer ${token}` }
        }
      );
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const data = await response.json();
      return { total: data.total || 0, today: data.total || 0 };
    } catch (error) {
      console.error("Error fetching nearby pharmacies:", error);
      return { total: 0, today: 0, error: error.message };
    }
  }

  updateCard(selector, data, period) {
    const card = document.querySelector(selector);
    if (!card) return;

    const countElement = card.querySelector('.stat-count');  
    const secondaryElement = card.querySelector('.stat-label');

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

    if (countElement) {
      this.animateCount(countElement, data.total || 0, formatNumber);
    }

    if (secondaryElement) {
      let desc =
        period === "day"
          ? `${formatNumber(data.today || 0)} Today`
          : period === "all"
          ? `${formatNumber(data.total || 0)} Total` // ✅ fixed
          : `${formatNumber(data.period_count || 0)} ${formatPeriodLabel(period)}`;

      secondaryElement.textContent = desc;
      secondaryElement.classList.add("text-gray-600", "truncate");
    }

    this.animateCard(card);
    card.classList.toggle('error-state', !!data.error);
  }


  animateCard(card) {
    card.classList.add('animate-pulse');
    setTimeout(() => card.classList.remove('animate-pulse'), 500);
  }

  animateCount(element, newValue, formatter) {
    const duration = 800;
    const start = parseInt(element.textContent.replace(/[^0-9]/g, "")) || 0;
    const startTime = performance.now();

    const step = (now) => {
      const progress = Math.min((now - startTime) / duration, 1);
      element.textContent = formatter(
        Math.floor(start + (newValue - start) * progress)
      );
      if (progress < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  setLoadingState(isLoading) {
    document.querySelectorAll('.dashboard-card').forEach((card) => {
      card.classList.toggle('loading', isLoading);
    });
  }

  showErrorNotification(message) {
    console.error(message);
  }
}

document.addEventListener('DOMContentLoaded', () => new DashboardStats());
