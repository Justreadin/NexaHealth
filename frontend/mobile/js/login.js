class AuthService {
  constructor() {
    this.API_BASE_URL = 'https://lyre-4m8l.onrender.com';
    this.TOKEN_KEY = 'nexahealth_access_token';
    this.REFRESH_TOKEN_KEY = 'nexahealth_refresh_token';
    this.REDIRECT_KEY = 'nexahealth_redirect_url';
    this.TOKEN_REFRESH_INTERVAL = 14 * 60 * 1000; // 14 minutes
    this.refreshTimer = null;
    this.LOGIN_TIMEOUT = 20000; // 10 seconds timeout for login attempts
  }

  // Initialize auth service
  init() {
    this._setupInterceptors();
    this._startTokenRefreshTimer();
    this._setupPasswordToggle();
    this._setupLoginForm();
    this._setupGoogleLogin();
    
    // Check session on init if needed
    if (this.isAuthenticated()) {
      this.checkSession().catch(console.error);
    }
  }

  // Check existing session validity
  async _checkExistingSession() {
    if (this.isAuthenticated()) {
      try {
        const isValid = await this.checkTokenValidity();
        if (!isValid) {
          this.clearAuth();
        }
      } catch (error) {
        console.error('Session check error:', error);
        this._logErrorToUser('Session validation failed', error);
        this.clearAuth();
      }
    }
  }

  // Enhanced session check with timeout
  async checkSession() {
    const token = this.getAccessToken();
    if (!token) {
      this.clearAuth();
      return false;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.LOGIN_TIMEOUT);

    try {
      const response = await fetch(`${this.API_BASE_URL}/auth/me`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Cache-Control': 'no-cache'
        },
        credentials: 'include',
        mode: 'cors',
        cache: 'no-store',
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        if (response.status === 401) {
          try {
            await this.refreshToken();
            return true;
          } catch (refreshError) {
            this._logErrorToUser('Session expired. Please login again.', refreshError);
            this.clearAuth();
            return false;
          }
        }
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return true;
    } catch (error) {
      clearTimeout(timeoutId);
      if (error.name === 'AbortError') {
        this._logErrorToUser('Connection timeout. Please check your network.', error);
      } else {
        this._logErrorToUser('Session check failed', error);
      }
      this.clearAuth();
      return false;
    }
  }

  storeAuth({ access_token, remember }) {
    if (remember) {
      localStorage.setItem(this.TOKEN_KEY, access_token);
    } else {
      sessionStorage.setItem(this.TOKEN_KEY, access_token);
    }
    this._startTokenRefreshTimer();
  }

  getAccessToken() {
    return localStorage.getItem(this.TOKEN_KEY) || 
           sessionStorage.getItem(this.TOKEN_KEY);
  }

  isAuthenticated() {
    return !!this.getAccessToken();
  }

  async checkTokenValidity() {
    const token = this.getAccessToken();
    if (!token) return false;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.LOGIN_TIMEOUT);

    try {
      const response = await fetch(`${this.API_BASE_URL}/auth/me`, {
        headers: {
          ...this._getAuthHeaders(),
          'Cache-Control': 'no-cache'
        },
        credentials: 'include',
        cache: 'no-store',
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error('Token validation failed');
      }

      return true;
    } catch (error) {
      clearTimeout(timeoutId);
      this._logErrorToUser('Token validation error', error);
      throw error;
    }
  }

  async refreshToken() {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.LOGIN_TIMEOUT);

    try {
      const response = await fetch(`${this.API_BASE_URL}/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error('Token refresh failed');
      }

      const data = await response.json();
      this.storeAuth({
        access_token: data.access_token,
        remember: !!localStorage.getItem(this.TOKEN_KEY)
      });

      return data.access_token;
    } catch (error) {
      clearTimeout(timeoutId);
      this._logErrorToUser('Session refresh failed', error);
      this.clearAuth();
      throw error;
    }
  }

  clearAuth() {
    localStorage.removeItem(this.TOKEN_KEY);
    sessionStorage.removeItem(this.TOKEN_KEY);
    this._stopTokenRefreshTimer();
    
    fetch(`${this.API_BASE_URL}/auth/logout`, {
      method: 'POST',
      credentials: 'include'
    }).catch(e => console.error('Logout error:', e));
  }

  _getAuthHeaders() {
    return {
      'Authorization': `Bearer ${this.getAccessToken()}`,
      'Accept': 'application/json'
    };
  }

  _setupInterceptors() {
    const originalFetch = window.fetch;

    window.fetch = async (input, init = {}) => {
      let url, options;

      if (input instanceof Request) {
        url = input.url;
        options = {
          method: input.method,
          headers: new Headers(input.headers),
          body: input.body,
          mode: input.mode,
          credentials: input.credentials,
          cache: input.cache,
          redirect: input.redirect,
          referrer: input.referrer,
          integrity: input.integrity,
          ...init
        };
      } else {
        url = input;
        options = init;
      }

      if (typeof url === 'string' && url.startsWith(this.API_BASE_URL)) {
        options.headers = options.headers || {};

        if (this.isAuthenticated() && !options.headers['Authorization']) {
          options.headers['Authorization'] = `Bearer ${this.getAccessToken()}`;
        }

        options.credentials = 'include';
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.LOGIN_TIMEOUT);
      options.signal = controller.signal;

      try {
        let response = await originalFetch(url, options);
        clearTimeout(timeoutId);

        if (response.status === 401 && this.isAuthenticated()) {
          try {
            const newToken = await this.refreshToken();
            if (options.headers) {
              options.headers['Authorization'] = `Bearer ${newToken}`;
            }
            response = await originalFetch(url, options);
          } catch (refreshError) {
            this.clearAuth();
            window.location.href = 'login.html';
            throw refreshError;
          }
        }

        return response;
      } catch (error) {
        clearTimeout(timeoutId);
        if (error.name === 'AbortError') {
          this._logErrorToUser('Request timeout. Please check your connection.', error);
        } else {
          this._logErrorToUser('API request failed', error);
        }
        throw error;
      }
    };
  }

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

  _stopTokenRefreshTimer() {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }
  }

  storeRedirectUrl() {
    if (!window.location.pathname.includes('login.html')) {
      localStorage.setItem(this.REDIRECT_KEY, window.location.href);
    }
  }

  redirectAfterLogin() {
    const redirectUrl = sessionStorage.getItem(this.REDIRECT_KEY) || 
                       localStorage.getItem(this.REDIRECT_KEY) || 
                       'dashboard.html';
    
    sessionStorage.removeItem(this.REDIRECT_KEY);
    localStorage.removeItem(this.REDIRECT_KEY);
    
    window.location.href = redirectUrl;
  }

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

  // Enhanced login form with timeout and better error handling
  async _setupLoginForm() {
    const loginForm = document.getElementById('loginForm');
    if (!loginForm) return;

    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      const email = document.getElementById('loginEmail').value.trim();
      const password = document.getElementById('loginPassword').value;
      const rememberMe = document.getElementById('rememberMe').checked;
      const submitBtn = loginForm.querySelector('button[type="submit"]');
      const loader = loginForm.querySelector('.loader');

      if (!email || !password) {
        showAlert('Please fill in all fields', 'error');
        return;
      }

      try {
        submitBtn.disabled = true;
        if (loader) loader.style.display = 'inline-block';
        submitBtn.innerHTML = '<span>Logging in...</span>';

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.LOGIN_TIMEOUT);

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
          credentials: 'include',
          signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.detail || `Login failed with status ${response.status}`);
        }

        const data = await response.json();
        this.storeAuth({
          access_token: data.access_token,
          remember: rememberMe
        });

        const sessionOk = await this.checkSession();
        if (!sessionOk) {
          throw new Error('Session validation failed after login');
        }

        showAlert('Login successful! Redirecting...', 'success');
        setTimeout(() => this.redirectAfterLogin(), 1500);

      } catch (error) {
        if (error.name === 'AbortError') {
          this._logErrorToUser('Login timeout. Please check your connection.', error);
        } else {
          this._logErrorToUser(error.message || 'Login failed. Please try again.', error);
        }
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.innerHTML = 'Log In';
        }
        if (loader) loader.style.display = 'none';
      }
    });
  }

  _setupGoogleLogin() {
    const googleLoginBtn = document.getElementById('googleLogin');
    if (!googleLoginBtn) return;

    googleLoginBtn.addEventListener('click', async () => {
      const loader = googleLoginBtn.querySelector('.loader');
      
      try {
        googleLoginBtn.disabled = true;
        if (loader) loader.style.display = 'inline-block';
        googleLoginBtn.innerHTML = '<span>Logging in...</span>';

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.LOGIN_TIMEOUT);

        const provider = new firebase.auth.GoogleAuthProvider();
        const result = await firebase.auth().signInWithPopup(provider);

        const firebaseUser = result.user;
        const idToken = await firebaseUser.getIdToken();

        const response = await fetch(`${this.API_BASE_URL}/auth/firebase-login`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'include',
          body: JSON.stringify({ token: idToken }),
          signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.detail || 'Google login failed');
        }

        const data = await response.json();
        this.storeAuth({
          access_token: data.access_token,
          remember: true
        });

        showAlert('Login successful! Redirecting...', 'success');
        setTimeout(() => this.redirectAfterLogin(), 1500);

      } catch (error) {
        if (error.name === 'AbortError') {
          this._logErrorToUser('Google login timeout. Please check your connection.', error);
        } else {
          this._logErrorToUser(error.message || 'Google login failed', error);
        }
      } finally {
        if (googleLoginBtn) {
          googleLoginBtn.disabled = false;
          googleLoginBtn.innerHTML = `
            <img src="https://upload.wikimedia.org/wikipedia/commons/5/53/Google_%22G%22_Logo.svg" alt="Google logo" class="w-5 h-5">
            <span>Continue with Google</span>`;
        }
        if (loader) loader.style.display = 'none';
      }
    });
  }

  // Enhanced error logging that shows errors to users
  _logErrorToUser(userMessage, error) {
    console.error(`${userMessage}:`, error);
    
    // Show detailed error in development, generic in production
    const errorDetail = window.location.hostname === 'localhost' || 
                        window.location.hostname === '127.0.0.1'
                      ? `\n\nTechnical details: ${error.message}`
                      : '';
    
    showAlert(`${userMessage}${errorDetail}`, 'error');
  }
}

window.App = window.App || {};
window.App.Auth = new AuthService();
document.addEventListener('DOMContentLoaded', () => {
  window.App.Auth.init();
});

// Enhanced alert function with error details toggle
function showAlert(message, type = 'info') {
  // Clear any existing alerts first
  document.querySelectorAll('.custom-alert').forEach(el => el.remove());

  const alert = document.createElement('div');
  alert.className = `custom-alert fixed top-4 right-4 px-6 py-4 rounded-lg shadow-lg text-white ${
    type === 'error' ? 'bg-red-500' : 
    type === 'success' ? 'bg-green-500' : 'bg-blue-500'
  } z-50 animate-fade-in max-w-md`;
  
  // For errors, add a "Details" button if there are technical details
  const hasDetails = message.includes('Technical details:');
  let alertContent = message;
  
  if (hasDetails) {
    const [userMessage, technicalDetails] = message.split('\n\nTechnical details:');
    alertContent = `
      <div>${userMessage}</div>
      <details class="mt-2 text-sm">
        <summary class="cursor-pointer font-semibold">Details</summary>
        <div class="mt-1 bg-black bg-opacity-20 p-2 rounded">${technicalDetails}</div>
      </details>
    `;
  }

  alert.innerHTML = `
    <div class="flex items-start">
      <i class="fas ${
        type === 'error' ? 'fa-exclamation-circle' : 
        type === 'success' ? 'fa-check-circle' : 'fa-info-circle'
      } mr-2 mt-0.5 flex-shrink-0"></i>
      <div class="flex-1">${alertContent}</div>
      <button class="ml-2 text-white hover:text-white/80 focus:outline-none" onclick="this.parentElement.parentElement.remove()">
        <i class="fas fa-times"></i>
      </button>
    </div>
  `;

  document.body.appendChild(alert);
  setTimeout(() => alert.remove(), type === 'error' ? 10000 : 5000);
}

// Check for verification success on page load
document.addEventListener('DOMContentLoaded', () => {
  const verified = new URLSearchParams(window.location.search).get('verified');
  if (verified === 'true') {
    showAlert('Email successfully verified! You can now log in.', 'success');
    window.history.replaceState({}, document.title, window.location.pathname);
  }
});

// Notify others that Auth is ready
document.dispatchEvent(new Event('AuthReady'));