// saas-entry.js - Pharmacy SaaS Application Entry Point
class PharmacyAuthService {
    constructor() {
        this.API_BASE_URL = 'https://lyre-4m8l.onrender.com/pharmacy';
        this.TOKEN_KEY = 'nexahealth_pharmacy_token';
        this.REFRESH_TOKEN_KEY = 'nexahealth_pharmacy_refresh_token';
        this.PHARMACY_DATA_KEY = 'nexahealth_pharmacy_data';
        this.TOKEN_REFRESH_INTERVAL = 14 * 60 * 1000; // 14 minutes
        this.refreshTimer = null;
        this.REQUEST_TIMEOUT = 15000; // 15 seconds timeout for API requests
    }

    // Initialize auth service
    init() {
        this._setupInterceptors();
        this._startTokenRefreshTimer();
        this._setupAuthForms();
        this._setupRippleEffects();
        this._checkExistingSession();
        
        console.log('Pharmacy Auth Service initialized');
    }

    // Setup authentication forms
    _setupAuthForms() {
        this._setupLoginForm();
        this._setupRegistrationForm();
    }

    // Setup login form functionality
    _setupLoginForm() {
        const loginBtn = document.getElementById('login-btn');
        if (!loginBtn) return;

        loginBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            await this.handleLogin();
        });

        // Enter key support for login form
        const loginForm = document.getElementById('login-form');
        if (loginForm) {
            loginForm.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    this.handleLogin();
                }
            });
        }
    }

    // Setup registration form functionality
    _setupRegistrationForm() {
        const registerBtn = document.getElementById('register-btn');
        if (!registerBtn) return;

        registerBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            await this.handleRegistration();
        });

        // Enter key support for registration form
        const registerForm = document.getElementById('register-form');
        if (registerForm) {
            registerForm.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    this.handleRegistration();
                }
            });
        }
    }

    // Handle pharmacy login
    async handleLogin() {
        const email = document.getElementById('login-email')?.value.trim();
        const password = document.getElementById('login-password')?.value;
        const loginBtn = document.getElementById('login-btn');

        if (!email || !password) {
            this.showAlert('Please fill in all required fields', 'error');
            return;
        }

        try {
            this.setButtonLoading(loginBtn, true, 'Logging in...');

            const response = await this.makeRequest('/auth/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    email: email,
                    password: password
                })
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.detail || `Login failed with status ${response.status}`);
            }

            // Store authentication data
            this.storeAuthData(data);

            this.showAlert('Login successful! Redirecting to dashboard...', 'success');
            
            // Redirect to pharmacy dashboard
            setTimeout(() => {
                window.location.href = 'saas-dashboard.html';
            }, 1500);

        } catch (error) {
            console.error('Login error:', error);
            this.showAlert(error.message || 'Login failed. Please check your credentials and try again.', 'error');
        } finally {
            this.setButtonLoading(loginBtn, false, '<i class="fas fa-lock mr-2"></i>Login to Dashboard');
        }
    }

    // Handle pharmacy registration
    async handleRegistration() {
        const name = document.getElementById('register-name')?.value.trim();
        const email = document.getElementById('register-email')?.value.trim();
        const phone = document.getElementById('register-phone')?.value.trim();
        const password = document.getElementById('register-password')?.value;
        const terms = document.getElementById('terms')?.checked;
        const registerBtn = document.getElementById('register-btn');

        // Validation
        if (!name || !email || !phone || !password) {
            this.showAlert('Please fill in all required fields', 'error');
            return;
        }

        if (!terms) {
            this.showAlert('Please agree to the Terms of Service and Privacy Policy', 'error');
            return;
        }

        if (password.length < 8) {
            this.showAlert('Password must be at least 8 characters long', 'error');
            return;
        }

        try {
            this.setButtonLoading(registerBtn, true, 'Registering...');

            const response = await this.makeRequest('/auth/register', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    pharmacy_name: name,
                    email: email,
                    phone_number: phone,
                    password: password
                })
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.detail || `Registration failed with status ${response.status}`);
            }

            this.showAlert('Registration successful! Please check your email for verification instructions.', 'success');
            
            // Optional: Auto-login after registration
            // setTimeout(() => {
            //     this.handleLogin(); // You might want to auto-login or redirect to login page
            // }, 2000);

        } catch (error) {
            console.error('Registration error:', error);
            this.showAlert(error.message || 'Registration failed. Please try again.', 'error');
        } finally {
            this.setButtonLoading(registerBtn, false, '<i class="fas fa-user-plus mr-2"></i>Register My Pharmacy');
        }
    }

    // Store authentication data
    storeAuthData(authData) {
        if (authData.access_token) {
            localStorage.setItem(this.TOKEN_KEY, authData.access_token);
            sessionStorage.setItem(this.TOKEN_KEY, authData.access_token);
        }
        if (authData.refresh_token) {
            localStorage.setItem(this.REFRESH_TOKEN_KEY, authData.refresh_token);
            sessionStorage.setItem(this.REFRESH_TOKEN_KEY, authData.refresh_token);
        }
        if (authData.pharmacy_id) {
            localStorage.setItem('pharmacy_id', authData.pharmacy_id);
            sessionStorage.setItem('pharmacy_id', authData.pharmacy_id);
        }

        this._startTokenRefreshTimer();
    }


    getAccessToken() {
            return sessionStorage.getItem(this.TOKEN_KEY) || localStorage.getItem(this.TOKEN_KEY);
        }


    // Check if user is authenticated
    isAuthenticated() {
        return !!this.getAccessToken();
    }

    // Make API request with error handling
    async makeRequest(endpoint, options = {}) {
        const url = `${this.API_BASE_URL}${endpoint}`;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.REQUEST_TIMEOUT);

        try {
            // Add authentication header if token exists
            const token = this.getAccessToken();
            if (token && !options.headers?.['Authorization']) {
                options.headers = {
                    ...options.headers,
                    'Authorization': `Bearer ${token}`
                };
            }

            // Ensure Content-Type is set for non-GET requests
            if (options.body && !options.headers?.['Content-Type']) {
                options.headers = {
                    ...options.headers,
                    'Content-Type': 'application/json'
                };
            }

            const response = await fetch(url, {
                ...options,
                signal: controller.signal,
                credentials: 'include'
            });

            clearTimeout(timeoutId);

            // Handle token expiration
            if (response.status === 401 && this.isAuthenticated()) {
                try {
                    await this.refreshToken();
                    // Retry request with new token
                    const newToken = this.getAccessToken();
                    if (newToken && options.headers) {
                        options.headers['Authorization'] = `Bearer ${newToken}`;
                    }
                    return await fetch(url, {
                        ...options,
                        signal: controller.signal
                    });
                } catch (refreshError) {
                    this.clearAuth();
                    throw new Error('Session expired. Please login again.');
                }
            }

            return response;

        } catch (error) {
            clearTimeout(timeoutId);
            if (error.name === 'AbortError') {
                throw new Error('Request timeout. Please check your connection.');
            }
            throw error;
        }
    }

    // Refresh token
    async refreshToken() {
        const refreshToken =
            sessionStorage.getItem(this.REFRESH_TOKEN_KEY) ||
            localStorage.getItem(this.REFRESH_TOKEN_KEY);

        if (!refreshToken) {
            throw new Error('No refresh token available');
        }

        try {
            const response = await this.makeRequest('/auth/refresh', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                'Authorization': `Bearer ${refreshToken}`
                }
            });

            if (!response.ok) {
                throw new Error('Token refresh failed');
            }

            const data = await response.json();
            this.storeAuthData(data);

            return data.access_token;
        } catch (error) {
            this.clearAuth();
            throw error;
        }
    }

    // Clear authentication data
    clearAuth() {
        localStorage.removeItem(this.TOKEN_KEY);
        localStorage.removeItem(this.REFRESH_TOKEN_KEY);
        localStorage.removeItem(this.PHARMACY_DATA_KEY);
        localStorage.removeItem('pharmacy_id');
        this._stopTokenRefreshTimer();
    }

    // Check existing session
    async _checkExistingSession() {
        if (this.isAuthenticated()) {
            try {
                // Verify token is still valid by making a simple API call
                const response = await this.makeRequest('/auth/me');
                if (!response.ok) {
                    this.clearAuth();
                }
            } catch (error) {
                console.error('Session check failed:', error);
                this.clearAuth();
            }
        }
    }

    // Setup fetch interceptors
    _setupInterceptors() {
        const originalFetch = window.fetch;
        
        window.fetch = async (input, init = {}) => {
            let url = typeof input === 'string' ? input : input.url;
            
            // Only intercept requests to our API
            if (url?.startsWith(this.API_BASE_URL)) {
                const token = this.getAccessToken();
                if (token) {
                    init.headers = {
                        ...init.headers,
                        'Authorization': `Bearer ${token}`
                    };
                }
                
                init.credentials = 'include';
            }
            
            return originalFetch(input, init);
        };
    }

    // Token refresh timer management
    _startTokenRefreshTimer() {
        this._stopTokenRefreshTimer();
        
        if (this.isAuthenticated()) {
            this.refreshTimer = setInterval(async () => {
                try {
                    await this.refreshToken();
                    console.log('Token refreshed successfully');
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


    // Ripple effect for buttons
    _setupRippleEffects() {
        function createRipple(event) {
            const button = event.currentTarget;
            const circle = document.createElement('span');
            const diameter = Math.max(button.clientWidth, button.clientHeight);
            const radius = diameter / 2;

            circle.style.width = circle.style.height = `${diameter}px`;
            circle.style.left = `${event.clientX - button.getBoundingClientRect().left - radius}px`;
            circle.style.top = `${event.clientY - button.getBoundingClientRect().top - radius}px`;
            circle.classList.add('ripple');

            const ripple = button.getElementsByClassName('ripple')[0];
            if (ripple) {
                ripple.remove();
            }

            button.appendChild(circle);
        }

        const buttons = document.querySelectorAll('button');
        buttons.forEach(button => {
            button.addEventListener('click', createRipple);
        });
    }

    // Utility function to set button loading state
    setButtonLoading(button, isLoading, text) {
        if (!button) return;
        
        button.disabled = isLoading;
        if (isLoading) {
            button.innerHTML = `<i class="fas fa-spinner fa-spin mr-2"></i>${text}`;
        } else {
            button.innerHTML = text;
        }
    }

    // Show alert messages
    showAlert(message, type = 'info') {
        // Remove any existing alerts
        const existingAlerts = document.querySelectorAll('.custom-alert');
        existingAlerts.forEach(alert => alert.remove());

        // Create alert element
        const alert = document.createElement('div');
        alert.className = `custom-alert fixed top-4 right-4 px-6 py-4 rounded-lg shadow-lg text-white z-50 transform transition-all duration-300 ${
            type === 'error' ? 'bg-red-500' : 
            type === 'success' ? 'bg-green-500' : 'bg-blue-500'
        }`;
        
        alert.innerHTML = `
            <div class="flex items-center justify-between">
                <div class="flex items-center">
                    <i class="fas ${
                        type === 'error' ? 'fa-exclamation-circle' : 
                        type === 'success' ? 'fa-check-circle' : 'fa-info-circle'
                    } mr-2"></i>
                    <span>${message}</span>
                </div>
                <button class="ml-4 text-white hover:text-white/80 focus:outline-none" onclick="this.parentElement.parentElement.remove()">
                    <i class="fas fa-times"></i>
                </button>
            </div>
        `;

        // Add to DOM
        document.body.appendChild(alert);

        // Auto-remove after delay
        setTimeout(() => {
            if (alert.parentElement) {
                alert.remove();
            }
        }, type === 'error' ? 8000 : 5000);
    }

    // Get pharmacy profile data
    async getPharmacyProfile() {
        try {
            const response = await this.makeRequest('/auth/me');
            if (!response.ok) {
                throw new Error('Failed to fetch pharmacy profile');
            }
            return await response.json();
        } catch (error) {
            console.error('Get pharmacy profile error:', error);
            throw error;
        }
    }

    // Logout functionality
    async logout() {
        try {
            await this.makeRequest('/auth/logout', {
                method: 'POST'
            });
        } catch (error) {
            console.error('Logout error:', error);
        } finally {
            this.clearAuth();
            window.location.href = 'index.html';
        }
    }
}

// Initialize the application
document.addEventListener('DOMContentLoaded', () => {
    // Create global auth service instance
    window.PharmacyAuth = new PharmacyAuthService();
    window.PharmacyAuth.init();

    // Check for any URL parameters (like verification success)
    const urlParams = new URLSearchParams(window.location.search);
    const verified = urlParams.get('verified');
    const registered = urlParams.get('registered');

    if (verified === 'true') {
        window.PharmacyAuth.showAlert('Email successfully verified! You can now log in.', 'success');
        // Clean URL
        window.history.replaceState({}, document.title, window.location.pathname);
    }

    if (registered === 'true') {
        window.PharmacyAuth.showAlert('Registration completed successfully!', 'success');
        window.history.replaceState({}, document.title, window.location.pathname);
    }

    console.log('Pharmacy SaaS application initialized');
});

// Global utility function for making authenticated requests
window.makeAuthenticatedRequest = async (endpoint, options = {}) => {
    if (!window.PharmacyAuth) {
        throw new Error('Auth service not initialized');
    }
    return await window.PharmacyAuth.makeRequest(endpoint, options);
};

// Global logout function
window.handleLogout = async () => {
    if (window.PharmacyAuth) {
        await window.PharmacyAuth.logout();
    }
};