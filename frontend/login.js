// AuthService.js - Production Grade Implementation
class AuthService {
  constructor() {
    this.API_BASE_URL = 'http://127.0.0.1:800'; // Fixed port number (was missing a 0)
    this.TOKEN_KEY = 'nexahealth_access_token';
    this.REFRESH_TOKEN_KEY = 'nexahealth_refresh_token';
    this.REDIRECT_KEY = 'nexahealth_redirect_url';
    this.TOKEN_REFRESH_INTERVAL = 14 * 60 * 1000; // 14 minutes (less than typical 15min expiry)
    this.refreshTimer = null;
  }

  // Initialize auth service
  init() {
    this._setupInterceptors();
    this._startTokenRefreshTimer();
    this._checkExistingSession();
    this._setupPasswordToggle();
    this._setupLoginForm();
    this._setupGoogleLogin();
  }

  // Check for existing valid session
  async _checkExistingSession() {
    const token = this.getAccessToken();
    if (token) {
      try {
        const isValid = await this.checkTokenValidity();
        if (!isValid) {
          this.clearAuth();
          showAlert('Your session has expired. Please log in again.', 'error');
        }
      } catch (error) {
        console.error('Session validation failed:', error);
        this.clearAuth();
      }
    }
  }

  // Store authentication tokens
  storeAuth({ access_token, refresh_token, remember }) {
    if (remember) {
      localStorage.setItem(this.TOKEN_KEY, access_token);
      localStorage.setItem(this.REFRESH_TOKEN_KEY, refresh_token);
    } else {
      sessionStorage.setItem(this.TOKEN_KEY, access_token);
      sessionStorage.setItem(this.REFRESH_TOKEN_KEY, refresh_token);
    }
    this._startTokenRefreshTimer();
  }

  // Get current access token
  getAccessToken() {
    return localStorage.getItem(this.TOKEN_KEY) || 
           sessionStorage.getItem(this.TOKEN_KEY);
  }

  // Get current refresh token
  getRefreshToken() {
    return localStorage.getItem(this.REFRESH_TOKEN_KEY) || 
           sessionStorage.getItem(this.REFRESH_TOKEN_KEY);
  }

  // Check if user is authenticated
  isAuthenticated() {
    return !!this.getAccessToken();
  }

  // Validate token with backend
  async checkTokenValidity() {
    const token = this.getAccessToken();
    if (!token) return false;

    try {
      const response = await fetch(`${this.API_BASE_URL}/auth/me`, {
        headers: this._getAuthHeaders()
      });

      if (!response.ok) {
        throw new Error('Token validation failed');
      }

      return true;
    } catch (error) {
      console.error('Token validation error:', error);
      throw error;
    }
  }

  // Refresh access token
  async refreshToken() {
    const refreshToken = this.getRefreshToken();
    if (!refreshToken) {
      throw new Error('No refresh token available');
    }

    try {
      const response = await fetch(`${this.API_BASE_URL}/auth/refresh`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({
          refresh_token: refreshToken
        }),
        credentials: 'include'
      });

      if (!response.ok) {
        throw new Error('Token refresh failed');
      }

      const data = await response.json();
      this.storeAuth({
        access_token: data.access_token,
        refresh_token: data.refresh_token,
        remember: !!localStorage.getItem(this.TOKEN_KEY)
      });

      return data.access_token;
    } catch (error) {
      console.error('Token refresh error:', error);
      this.clearAuth();
      throw error;
    }
  }

  // Clear all auth data
  clearAuth() {
    localStorage.removeItem(this.TOKEN_KEY);
    localStorage.removeItem(this.REFRESH_TOKEN_KEY);
    sessionStorage.removeItem(this.TOKEN_KEY);
    sessionStorage.removeItem(this.REFRESH_TOKEN_KEY);
    this._stopTokenRefreshTimer();
  }

  // Get auth headers for API requests
  _getAuthHeaders() {
    return {
      'Authorization': `Bearer ${this.getAccessToken()}`,
      'Accept': 'application/json'
    };
  }

  // Setup request interceptors
  _setupInterceptors() {
    const originalFetch = window.fetch;
    
    window.fetch = async (url, options = {}) => {
      // Add auth header to API requests
      if (url.startsWith(this.API_BASE_URL)) {
        options.headers = options.headers || {};
        
        if (this.isAuthenticated() && !options.headers['Authorization']) {
          options.headers['Authorization'] = `Bearer ${this.getAccessToken()}`;
        }
      }

      let response = await originalFetch(url, options);
      
      // Handle 401 unauthorized responses
      if (response.status === 401 && this.isAuthenticated()) {
        try {
          const newToken = await this.refreshToken();
          if (options.headers) {
            options.headers['Authorization'] = `Bearer ${newToken}`;
          }
          response = await originalFetch(url, options);
        } catch (refreshError) {
          this.clearAuth();
          window.location.href = '/login.html';
          throw refreshError;
        }
      }

      return response;
    };
  }

  // Start token refresh timer
  _startTokenRefreshTimer() {
    this._stopTokenRefreshTimer();
    
    if (this.isAuthenticated()) {
      this.refreshTimer = setInterval(async () => {
        try {
          await this.refreshToken();
          console.log('Token refreshed successfully in background');
        } catch (error) {
          console.error('Background token refresh failed:', error);
          this._stopTokenRefreshTimer();
        }
      }, this.TOKEN_REFRESH_INTERVAL);
    }
  }

  // Stop token refresh timer
  _stopTokenRefreshTimer() {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }
  }

  // Store redirect URL
  storeRedirectUrl() {
    if (!window.location.pathname.includes('login.html')) {
      localStorage.setItem(this.REDIRECT_KEY, window.location.href);
    }
  }

  // Handle post-login redirect
  redirectAfterLogin() {
    const redirectUrl = sessionStorage.getItem(this.REDIRECT_KEY) || 
                       localStorage.getItem(this.REDIRECT_KEY) || 
                       'index.html';
    
    sessionStorage.removeItem(this.REDIRECT_KEY);
    localStorage.removeItem(this.REDIRECT_KEY);
    
    window.location.href = redirectUrl;
  }

  // Setup password toggle functionality
  _setupPasswordToggle() {
    document.querySelectorAll('.password-toggle').forEach(toggle => {
      toggle.addEventListener('click', function() {
        const input = this.parentElement.querySelector('input');
        const icon = this.querySelector('i');

        if (input.type === 'password') {
          input.type = 'text';
          icon.classList.replace('fa-eye', 'fa-eye-slash');
        } else {
          input.type = 'password';
          icon.classList.replace('fa-eye-slash', 'fa-eye');
        }
      });
    });
  }

  // Setup login form submission
  _setupLoginForm() {
    const loginForm = document.getElementById('loginForm');
    if (!loginForm) return;

    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      const email = document.getElementById('loginEmail').value.trim();
      const password = document.getElementById('loginPassword').value;
      const rememberMe = document.getElementById('rememberMe').checked;
      const submitBtn = loginForm.querySelector('button[type="submit"]');

      if (!email || !password) {
        showAlert('Please fill in all fields', 'error');
        return;
      }

      try {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i> Logging in...';

        const response = await fetch(`${this.API_BASE_URL}/auth/login`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Accept': 'application/json',
          },
          body: new URLSearchParams({
            username: email,
            password: password,
            grant_type: 'password'
          }),
          credentials: 'include'
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.detail || 'Login failed');
        }

        const data = await response.json();
        this.storeAuth({
          access_token: data.access_token,
          refresh_token: data.refresh_token,
          remember: rememberMe
        });

        showAlert('Login successful! Redirecting...', 'success');
        setTimeout(() => this.redirectAfterLogin(), 1500);

      } catch (error) {
        console.error('Login error:', error);
        showAlert(error.message || 'Login failed. Please try again.', 'error');
        submitBtn.disabled = false;
        submitBtn.innerHTML = 'Log In';
      }
    });
  }

  // Setup Google login
  _setupGoogleLogin() {
    const googleLoginBtn = document.getElementById('googleLogin');
    if (!googleLoginBtn) return;

    googleLoginBtn.addEventListener('click', async () => {
      try {
        googleLoginBtn.disabled = true;
        googleLoginBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i> Continuing with Google...';

        // In a real implementation, use Firebase Auth or Google OAuth
        // This is a placeholder for the actual implementation
        const googleToken = await this._getGoogleToken();
        
        const response = await fetch(`${this.API_BASE_URL}/auth/google-login`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ token: googleToken }),
          credentials: 'include'
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.detail || 'Google login failed');
        }

        this.storeAuth({
          access_token: data.access_token,
          refresh_token: data.refresh_token,
          remember: true
        });

        showAlert('Google login successful! Redirecting...', 'success');
        setTimeout(() => this.redirectAfterLogin(), 1500);

      } catch (error) {
        console.error('Google login error:', error);
        showAlert(error.message || 'Google login failed. Please try again.', 'error');
        googleLoginBtn.disabled = false;
        googleLoginBtn.innerHTML = '<img src="https://upload.wikimedia.org/wikipedia/commons/5/53/Google_%22G%22_Logo.svg" alt="Google logo" class="w-5 h-5"><span>Continue with Google</span>';
      }
    });
  }

  // Placeholder for Google Auth implementation
  async _getGoogleToken() {
    // In a real app, implement Google Auth flow here
    return 'simulated_google_token';
  }
}

// Initialize auth service
window.App = window.App || {};
window.App.Auth = new AuthService();
window.App.Auth.init();

// Helper function to show alerts
function showAlert(message, type = 'info') {
  const alert = document.createElement('div');
  alert.className = `fixed top-4 right-4 px-6 py-4 rounded-lg shadow-lg text-white ${
    type === 'error' ? 'bg-red-500' : 
    type === 'success' ? 'bg-green-500' : 'bg-blue-500'
  } z-50 animate-fade-in`;
  
  alert.innerHTML = `
    <div class="flex items-center">
      <i class="fas ${
        type === 'error' ? 'fa-exclamation-circle' : 
        type === 'success' ? 'fa-check-circle' : 'fa-info-circle'
      } mr-2"></i>
      <span>${message}</span>
    </div>
  `;

  document.body.appendChild(alert);
  setTimeout(() => alert.remove(), 5000);
}

// Check for verification success on page load
document.addEventListener('DOMContentLoaded', () => {
  const verified = new URLSearchParams(window.location.search).get('verified');
  if (verified === 'true') {
    showAlert('Email successfully verified! You can now log in.', 'success');
    window.history.replaceState({}, document.title, window.location.pathname);
  }
});