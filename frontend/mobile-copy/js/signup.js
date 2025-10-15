// signup.js - Comprehensive Signup Functionality

// Configuration
const API_BASE_URL = 'https://lyre-4m8l.onrender.com';
const REDIRECT_KEY = 'nexahealth_redirect_url';

// DOM Elements
const signupForm = document.getElementById('signupForm');
const googleSignupBtn = document.getElementById('googleSignup');
const passwordToggles = document.querySelectorAll('.password-toggle');
const submitBtn = signupForm?.querySelector('button[type="submit"]');

// Initialize the application
document.addEventListener('DOMContentLoaded', () => {
    // Check for verification success
    const verified = new URLSearchParams(window.location.search).get('verified');
    if (verified === 'true') {
        showAlert('Email successfully verified! You can now log in.', 'success');
        // Clean URL
        window.history.replaceState({}, document.title, window.location.pathname);
    }

    // Initialize guest session if needed
    initializeGuestSession();
});

// Password toggle functionality
passwordToggles.forEach(toggle => {
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

// Form submission handler
signupForm?.addEventListener('submit', async function(e) {
    e.preventDefault();

    // Get form values
    const firstName = document.getElementById('firstName').value.trim();
    const lastName = document.getElementById('lastName').value.trim();
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;
    const confirmPassword = document.getElementById('confirmPassword').value;
    const termsChecked = document.getElementById('terms').checked;

    // Validation
    if (!validateSignupForm(firstName, lastName, email, password, confirmPassword, termsChecked)) {
        return;
    }

    // Create user object
    const userData = {
        first_name: firstName,
        last_name: lastName,
        email: email,
        password: password
    };

    try {
        // Show loading state
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i> Creating account...';

        // Get guest session ID if exists
        const guestSessionId = getCookie('guest_session_id');

        // Send signup request
        const response = await fetch(`${API_BASE_URL}/auth/signup`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(userData),
            credentials: 'include' // For cookies
        });

        const data = await response.json();

        if (!response.ok) {
            // Handle Firebase errors specifically
            if (data.detail && data.detail.includes('Firebase error')) {
                const errorMsg = data.detail.replace('Firebase error: ', '');
                throw new Error(`Authentication error: ${errorMsg}`);
            }
            throw new Error(data.detail || 'Failed to create account');
        }

                // Check if confirmation already sent or newly created
        const confirmationUrl = data.confirmation_url || `confirm-email.html?email=${encodeURIComponent(email)}`;
        if (data.pending) {
            showAlert('You already requested a confirmation email. Redirecting...', 'info');
        } else {
            showAlert('Confirmation email sent! Redirecting...', 'success');
        }
        setTimeout(() => {
            window.location.href = confirmationUrl;
        }, 1500);


    } catch (error) {
        console.error('Signup error:', error);
        showAlert(error.message || 'Signup failed. Please try again.', 'error');
        
        // Reset button state
        submitBtn.disabled = false;
        submitBtn.innerHTML = 'Create Account';
    }
});

// Google Signup Handler
googleSignupBtn?.addEventListener('click', async function() {
    try {
        // In a real implementation, you would use Firebase Auth or Google OAuth
        // This is a simplified version for demonstration
        
        // Show loading state
        googleSignupBtn.disabled = true;
        googleSignupBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i> Continuing with Google...';

        // Simulate Google token retrieval (in real app, use Google Auth API)
        const googleToken = 'simulated_google_token'; // Replace with actual token
        
        // Send token to backend
        const response = await fetch(`${API_BASE_URL}/auth/google-login`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ token: googleToken }),
            credentials: 'include'
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.detail || 'Google signup failed');
        }

        // Store token
        storeAuthToken(data.access_token, true);

        // Show success message
        showAlert('Google signup successful! Redirecting...', 'success');

        // Redirect
        setTimeout(() => {
            redirectAfterSignup();
        }, 1500);

    } catch (error) {
        console.error('Google signup error:', error);
        showAlert(error.message || 'Google signup failed. Please try again.', 'error');
        
        // Reset button state
        googleSignupBtn.disabled = false;
        googleSignupBtn.innerHTML = '<img src="https://upload.wikimedia.org/wikipedia/commons/5/53/Google_%22G%22_Logo.svg" alt="Google logo" class="w-5 h-5"><span>Continue with Google</span>';
    }
});

// Helper Functions

function validateSignupForm(firstName, lastName, email, password, confirmPassword, termsChecked) {
    if (!firstName || !lastName) {
        showAlert('Please enter your first and last name', 'error');
        return false;
    }

    if (!email) {
        showAlert('Please enter your email address', 'error');
        return false;
    }

    if (!password || !confirmPassword) {
        showAlert('Please enter and confirm your password', 'error');
        return false;
    }

    if (password !== confirmPassword) {
        showAlert('Passwords do not match!', 'error');
        return false;
    }

    if (password.length < 8) {
        showAlert('Password must be at least 8 characters long!', 'error');
        return false;
    }

    if (!/[A-Z]/.test(password)) {
        showAlert('Password must contain at least one uppercase letter', 'error');
        return false;
    }

    if (!/[a-z]/.test(password)) {
        showAlert('Password must contain at least one lowercase letter', 'error');
        return false;
    }

    if (!/[0-9]/.test(password)) {
        showAlert('Password must contain at least one number', 'error');
        return false;
    }

    if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
        showAlert('Password must contain at least one special character', 'error');
        return false;
    }

    if (!termsChecked) {
        showAlert('You must agree to the terms and conditions!', 'error');
        return false;
    }

    return true;
}

function storeAuthToken(token, remember) {
    if (remember) {
        localStorage.setItem('nexahealth_access_token', token); // Persistent storage
    } else {
        sessionStorage.setItem('nexahealth_access_token', token); // Session-only storage
    }
}

function redirectAfterSignup() {
    // Get redirect URL from sessionStorage (single use) or default to dashboard
    const redirectUrl = sessionStorage.getItem(REDIRECT_KEY) || 'dashboard.html';
    sessionStorage.removeItem(REDIRECT_KEY);
    window.location.href = redirectUrl;
}

function showAlert(message, type = 'info') {
    // Remove any existing alerts
    const existingAlert = document.querySelector('.custom-alert');
    if (existingAlert) {
        existingAlert.remove();
    }

    // Create alert element
    const alert = document.createElement('div');
    alert.className = `custom-alert fixed top-4 right-4 px-6 py-4 rounded-lg shadow-lg text-white ${
        type === 'error' ? 'bg-red-500' : 
        type === 'success' ? 'bg-green-500' : 'bg-blue-500'
    }`;
    alert.innerHTML = `
        <div class="flex items-center">
            <i class="fas ${
                type === 'error' ? 'fa-exclamation-circle' : 
                type === 'success' ? 'fa-check-circle' : 'fa-info-circle'
            } mr-2"></i>
            <span>${message}</span>
        </div>
    `;

    // Add to DOM
    document.body.appendChild(alert);

    // Remove after 5 seconds
    setTimeout(() => {
        alert.remove();
    }, 5000);
}

function getCookie(name) {
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) return parts.pop().split(';').shift();
}

async function initializeGuestSession() {
    // Check if we already have a guest session
    if (!getCookie('guest_session_id')) {
        try {
            // Create new guest session
            const response = await fetch(`${API_BASE_URL}/guest/session`, {
                method: 'POST',
                credentials: 'include'
            });
            
            if (!response.ok) {
                throw new Error('Failed to create guest session');
            }
        } catch (error) {
            console.error('Guest session initialization error:', error);
        }
    }
}

// Utility function to store redirect URL
function storeRedirectUrl() {
    // Only store if we're not already on the signup page
    if (!window.location.pathname.includes('signup.html')) {
        localStorage.setItem(REDIRECT_KEY, window.location.href);
    }
}

// Export for use in other pages (to set redirect URL before signup)
window.authUtils = {
    storeRedirectUrl
};