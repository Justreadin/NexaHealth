// main.js - Core Application Functionality

// ======================
// Authentication Module
// ======================
const Auth = {
  checkAuthStatus() {
    try {
      const token = localStorage.getItem('nexahealth_access_token') || 
                   sessionStorage.getItem('nexahealth_access_token');
      
      if (!token) return false;

      // Basic token validation
      const tokenParts = token.split('.');
      if (tokenParts.length !== 3) {
        this.clearAuthToken();
        return false;
      }

      try {
        const payload = JSON.parse(atob(tokenParts[1]));
        if (payload.exp && Date.now() >= payload.exp * 1000) {
          this.clearAuthToken();
          return false;
        }
        return true;
      } catch (e) {
        console.error('Token parse error:', e);
        return false;
      }
    } catch (error) {
      console.error('Auth check error:', error);
      return false;
    }
  },

  storeAuthToken(token, remember) {
    // Clear guest session cookie when storing new auth token
    document.cookie = "guest_session_id=; Path=/; Expires=Thu, 01 Jan 1970 00:00:01 GMT;";
    
    if (remember) {
      localStorage.setItem('nexahealth_access_token', token);
    } else {
      sessionStorage.setItem('nexahealth_access_token', token);
    }
  },

  clearAuthToken() {
    localStorage.removeItem('nexahealth_access_token');
    sessionStorage.removeItem('nexahealth_access_token');
    // Clear guest session cookie when logging out
    document.cookie = "guest_session_id=; Path=/; Expires=Thu, 01 Jan 1970 00:00:01 GMT;";
  },

  updateNavigation(isLoggedIn) {
    // Update desktop dropdown
    const authDropdown = document.querySelector('.auth-dropdown');
    if (authDropdown) {
      authDropdown.innerHTML = this.getDropdownHTML(isLoggedIn);
    }

    // Update mobile auth section
    const mobileAuthSection = document.querySelector('#mobile-menu .mobile-auth-section');
    if (mobileAuthSection) {
      mobileAuthSection.innerHTML = this.getMobileAuthHTML(isLoggedIn);
    }
  },

  getDropdownHTML(isLoggedIn) {
    return isLoggedIn ? `
      <div x-data="{ open: false }" class="relative">
        <button @click="open = !open" class="flex items-center space-x-1 focus:outline-none">
          <div class="avatar">
            <i class="fas fa-user"></i>
          </div>
          <i class="fas fa-chevron-down text-xs text-gray-500 chevron" :class="{ 'chevron-open': open }"></i>
        </button>
        <div x-show="open" @click.away="open = false" class="dropdown-menu">
          <a href="/profile" class="dropdown-item">
            <i class="fas fa-user-circle mr-2"></i> Profile
          </a>
          <a href="/history" class="dropdown-item">
            <i class="fas fa-history mr-2"></i> History
          </a>
          <a href="/settings" class="dropdown-item">
            <i class="fas fa-cog mr-2"></i> Settings
          </a>
          <div class="divider"></div>
          <button onclick="App.showLogoutConfirmation()" class="dropdown-item w-full text-left">
            <i class="fas fa-sign-out-alt mr-2"></i> Log Out
          </button>
        </div>
      </div>
    ` : `
      <div x-data="{ open: false }" class="relative">
        <button @click="open = !open" class="flex items-center space-x-1 focus:outline-none">
          <div class="avatar">
            <i class="fas fa-user"></i>
          </div>
          <i class="fas fa-chevron-down text-xs text-gray-500 chevron" :class="{ 'chevron-open': open }"></i>
        </button>
        <div x-show="open" @click.away="open = false" class="dropdown-menu">
          <a href="login.html" class="dropdown-item">
            <i class="fas fa-sign-in-alt mr-2"></i> Log In
          </a>
          <a href="signup.html" class="dropdown-item">
            <i class="fas fa-user-plus mr-2"></i> Sign Up
          </a>
          <div class="divider"></div>
          <a href="#" class="dropdown-item">
            <i class="fas fa-question-circle mr-2"></i> Help Center
          </a>
        </div>
      </div>
    `;
  },

  getMobileAuthHTML(isLoggedIn) {
    return isLoggedIn ? `
      <div class="pt-2 space-y-3">
        <a href="/profile" class="block text-center border border-primary text-primary hover:bg-blue-50 px-6 py-2 rounded-full font-medium transition-all">
          Profile
        </a>
        <button onclick="App.showLogoutConfirmation()" class="w-full text-center bg-gradient-to-r from-red-500 to-red-600 text-white px-6 py-2 rounded-full font-medium transition-all hover:shadow-lg logout-btn">
          Log Out
        </button>
      </div>
    ` : `
      <div class="pt-2 space-y-3">
        <a href="login.html" class="block text-center border border-primary text-primary hover:bg-blue-50 px-6 py-2 rounded-full font-medium transition-all">
          Log In
        </a>
        <a href="signup.html" class="block text-center bg-gradient-to-r from-primary to-secondary text-white px-6 py-2 rounded-full font-medium transition-all hover:shadow-lg">
          Sign Up
        </a>
      </div>
    `;
  },

  async logout() {
    try {
      // Show loading state
      const buttons = document.querySelectorAll('[onclick*="logout"]');
      buttons.forEach(btn => {
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i> Logging out...';
      });

      // Call backend logout endpoint
      const response = await fetch('http://127.0.0.1:800/auth/logout', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Authorization': `Bearer ${this.getAccessToken()}`,
          'Accept': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error('Logout failed');
      }

      // Clear frontend auth state
      this.clearAuthToken();
      
      // Create guest session
      await GuestSession.convertToGuest();
      
      // Redirect to home page
      window.location.href = '/index.html?logout=success';
      
    } catch (error) {
      console.error('Logout error:', error);
      
      // Show error to user
      const alert = document.createElement('div');
      alert.className = 'fixed bottom-4 right-4 bg-red-500 text-white px-4 py-2 rounded-lg shadow-lg';
      alert.textContent = 'Logout failed. Please try again.';
      document.body.appendChild(alert);
      setTimeout(() => alert.remove(), 3000);
      
      // Reset buttons
      const buttons = document.querySelectorAll('[onclick*="logout"]');
      buttons.forEach(btn => {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-sign-out-alt mr-2"></i> Log Out';
      });
    }
  },

  getAccessToken() {
    return localStorage.getItem('nexahealth_access_token') || 
           sessionStorage.getItem('nexahealth_access_token');
  }
};

// ======================
// Navigation Module
// ======================
const Navigation = {
  initMobileMenu() {
    const hamburger = document.getElementById('hamburger');
    const mobileMenu = document.getElementById('mobile-menu');

    if (hamburger && mobileMenu) {
      // Clone to remove existing event listeners
      const newHamburger = hamburger.cloneNode(true);
      hamburger.parentNode.replaceChild(newHamburger, hamburger);

      newHamburger.addEventListener('click', () => {
        newHamburger.classList.toggle('hamburger-active');
        mobileMenu.classList.toggle('hidden');
      });

      // Close mobile menu when clicking a link
      document.querySelectorAll('#mobile-menu a').forEach(link => {
        link.addEventListener('click', () => {
          newHamburger.classList.remove('hamburger-active');
          mobileMenu.classList.add('hidden');
        });
      });
    }
  },

  setupSmoothScrolling() {
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
  }
};

// ======================
// Guest Session Module
// ======================
const GuestSession = {
  sessionId: null,
  usageCount: 0,

  async initialize() {
    // First try to get from cookie
    this.sessionId = this.getCookie('guest_session_id');
    
    // If no session ID, create new one
    if (!this.sessionId) {
      await this.createNewSession();
    } else {
      // Validate existing session
      await this.validateSession();
    }
  },

  async validateSession() {
    try {
      const response = await fetch('http://127.0.0.1:800/guest/session', {
        method: 'GET',
        credentials: 'include',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'X-Guest-Session': this.sessionId
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        this.sessionId = data.id;
        this.usageCount = data.usage_count || 0;
        return true;
      }
      
      // If validation failed, clear the invalid session
      this.clearSession();
      return false;
    } catch (error) {
      console.error('Session validation error:', error);
      this.clearSession();
      return false;
    }
  },

  async createNewSession() {
    try {
      const response = await fetch('http://127.0.0.1:800/guest/session', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        this.sessionId = data.id;
        this.usageCount = 0;
        this.setCookie('guest_session_id', this.sessionId, 7);
        return true;
      }
      return false;
    } catch (error) {
      console.error('Failed to create session:', error);
      return false;
    }
  },

  async convertToGuest() {
    try {
      // Clear any existing guest session
      this.clearSession();
      
      // Create new guest session
      await this.createNewSession();
      
      // Update UI to reflect guest mode
      this.updateGuestUI();
      
      return true;
    } catch (error) {
      console.error('Failed to convert to guest:', error);
      return false;
    }
  },

  async ensureValidSession() {
    if (!this.sessionId) {
      await this.createNewSession();
    }
    return this.sessionId;
  },

  clearSession() {
    this.sessionId = null;
    this.usageCount = 0;
    this.deleteCookie('guest_session_id');
  },

  // Cookie helpers with explicit domain
  setCookie(name, value, days) {
    const date = new Date();
    date.setTime(date.getTime() + (days * 24 * 60 * 60 * 1000));
    document.cookie = `${name}=${value}; expires=${date.toUTCString()}; path=/; domain=127.0.0.1; SameSite=Lax`;
  },

  getCookie(name) {
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) return parts.pop().split(';').shift();
  },

  deleteCookie(name) {
    document.cookie = `${name}=; Path=/; Expires=Thu, 01 Jan 1970 00:00:01 GMT; domain=127.0.0.1;`;
  },

  updateGuestUI() {
    const guestElements = document.querySelectorAll('[data-guest]');
    const userElements = document.querySelectorAll('[data-user]');
    
    const isGuest = this.isGuest();
    
    guestElements.forEach(el => {
      el.style.display = isGuest ? 'block' : 'none';
    });
    
    userElements.forEach(el => {
      el.style.display = isGuest ? 'none' : 'block';
    });
  },

  isGuest() {
    return !!this.sessionId && !Auth.checkAuthStatus();
  },

  checkGuestLimit() {
    if (this.isGuest() && this.usageCount >= 5) {
      this.showGuestLimitModal();
      return true;
    }
    return false;
  },

  showGuestLimitModal() {
    const modal = document.getElementById('guest-limit-modal');
    if (modal) {
      modal.classList.remove('hidden');
      
      modal.querySelector('#signup-btn').addEventListener('click', () => {
        window.location.href = 'signup.html?from=guest';
      });
      
      modal.querySelector('#login-btn').addEventListener('click', () => {
        window.location.href = 'login.html?from=guest';
      });
    }
  }
};

// ======================
// Animation Module
// ======================
const Animations = {
  initScrollAnimations() {
    const animateOnScroll = () => {
      const elements = document.querySelectorAll('.animation-fade-in, .animation-slide-up');

      elements.forEach(element => {
        const elementPosition = element.getBoundingClientRect().top;
        const screenPosition = window.innerHeight / 1.2;

        if (elementPosition < screenPosition) {
          element.style.opacity = '1';
          element.style.transform = 'translateY(0)';
        }
      });
    };

    // Set initial state
    document.querySelectorAll('.animation-fade-in').forEach(el => {
      el.style.opacity = '0';
    });

    document.querySelectorAll('.animation-slide-up').forEach(el => {
      el.style.opacity = '0';
      el.style.transform = 'translateY(20px)';
    });

    // Run on load and scroll
    animateOnScroll();
    window.addEventListener('scroll', animateOnScroll);
  }
};

// ======================
// Core Initialization
// ======================
document.addEventListener('DOMContentLoaded', () => {
  // Initialize authentication
  const isLoggedIn = Auth.checkAuthStatus();
  Auth.updateNavigation(isLoggedIn);

  // Initialize navigation
  Navigation.initMobileMenu();
  Navigation.setupSmoothScrolling();

  // Initialize guest session if not logged in
  if (!isLoggedIn) {
    GuestSession.initialize().then(() => {
      console.log('Guest session initialized:', GuestSession.sessionId);
    });
  }

  // Initialize animations
  Animations.initScrollAnimations();
});

// Listen for auth changes across tabs
window.addEventListener('storage', (event) => {
  if (event.key === 'nexahealth_access_token') {
    const isLoggedIn = Auth.checkAuthStatus();
    Auth.updateNavigation(isLoggedIn);
  }
});

// Logout Modal HTML (should be added to your main HTML file)
const logoutModalHTML = `
<div id="logout-modal" class="fixed inset-0 bg-black bg-opacity-50 z-50 hidden items-center justify-center">
  <div class="bg-white rounded-lg p-6 max-w-md w-full mx-4">
    <h3 class="text-lg font-bold mb-4">Confirm Logout</h3>
    <p class="text-gray-600 mb-6">Are you sure you want to log out? You'll be switched to guest mode.</p>
    <div class="flex justify-end space-x-3">
      <button onclick="document.getElementById('logout-modal').classList.add('hidden')" 
              class="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">
        Cancel
      </button>
      <button onclick="App.confirmLogout()" 
              class="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 logout-btn">
        Log Out
      </button>
    </div>
  </div>
</div>
`;

// Add logout modal to body if not already present
if (!document.getElementById('logout-modal')) {
  document.body.insertAdjacentHTML('beforeend', logoutModalHTML);
}

// Expose modules to window for page-specific scripts
window.App = {
  Auth,
  Navigation,
  GuestSession,
  Animations,
  
  showLogoutConfirmation() {
    document.getElementById('logout-modal').classList.remove('hidden');
  },
  
  confirmLogout() {
    document.getElementById('logout-modal').classList.add('hidden');
    Auth.logout();
  }
};