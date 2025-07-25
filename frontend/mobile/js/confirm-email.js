// Configuration
const API_BASE_URL = 'https://lyre-4m8l.onrender.com';
const RESEND_DELAY = 30000; // 30 seconds delay between resend attempts
const TOAST_DURATION = 5000; // 5 seconds for toast messages
const MAX_RESEND_ATTEMPTS = 5; // Maximum number of resend attempts

// DOM Elements
const confirmationForm = document.getElementById('confirmationForm');
const resendCodeBtn = document.getElementById('resendCode');
const codeInputs = document.querySelectorAll('.code-input');
const hiddenCodeInput = document.getElementById('confirmationCode');
const userEmailInput = document.getElementById('userEmail');
const countdownElement = document.getElementById('countdown');
const countdownSeconds = document.getElementById('countdownSeconds');

// State
let resendTimer = null;
let lastResendAttempt = parseInt(localStorage.getItem('lastResendAttempt')) || 0;
let resendAttempts = parseInt(localStorage.getItem('resendAttempts')) || 0;
let isSubmitting = false;

// Initialize the application
document.addEventListener('DOMContentLoaded', () => {
    // Extract email and code from URL parameters
    const urlParams = new URLSearchParams(window.location.search);
    const email = urlParams.get('email');
    const code = urlParams.get('code');

    // Set email in hidden field if available
    if (email) {
        userEmailInput.value = email;
    }

    // If code is in URL, auto-fill the confirmation code
    if (code && code.length === 6) {
        code.split('').forEach((char, i) => {
            if (codeInputs[i]) {
                codeInputs[i].value = char;
                codeInputs[i].classList.add('filled');
            }
        });
        updateHiddenCode();
    }

    // Check resend button availability
    checkResendAvailability();
    
    // Initialize code input behavior
    initCodeInputs();
    
    // Check if we have a pending confirmation
    checkPendingConfirmation();
});

// Initialize code input behavior
function initCodeInputs() {
    codeInputs.forEach((input, index) => {
        // Handle input
        input.addEventListener('input', (e) => {
            if (e.target.value.length === 1) {
                e.target.classList.add('filled');
                if (index < codeInputs.length - 1) {
                    codeInputs[index + 1].focus();
                }
                updateHiddenCode();
            } else if (e.target.value.length === 0) {
                e.target.classList.remove('filled');
            }
        });
        
        // Handle backspace
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Backspace' && e.target.value === '' && index > 0) {
                codeInputs[index - 1].focus();
            }
        });

        // Handle paste
        input.addEventListener('paste', (e) => {
            e.preventDefault();
            const paste = e.clipboardData.getData('text');
            if (/^\d{6}$/.test(paste)) {
                paste.split('').forEach((char, i) => {
                    if (codeInputs[i]) {
                        codeInputs[i].value = char;
                        codeInputs[i].classList.add('filled');
                    }
                });
                updateHiddenCode();
                codeInputs[5].focus();
            }
        });

        // Prevent non-numeric input
        input.addEventListener('keypress', (e) => {
            if (e.key.length === 1 && !/\d/.test(e.key)) {
                e.preventDefault();
                showToast('Only numbers are allowed', 'error');
            }
        });
    });
}

// Update hidden input with full code
function updateHiddenCode() {
    hiddenCodeInput.value = Array.from(codeInputs)
        .map(input => input.value)
        .join('');
}

// Update the form submission handler
confirmationForm.addEventListener('submit', async function(e) {
    e.preventDefault();

    if (isSubmitting) return;
    isSubmitting = true;

    const code = hiddenCodeInput.value;
    const email = userEmailInput.value.trim();

    if (!validateForm(code, email)) {
        isSubmitting = false;
        return;
    }

    try {
        // Show loading state
        const submitBtn = confirmationForm.querySelector('button[type="submit"]');
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i> Verifying...';

        // Send confirmation request
        const response = await fetch(`${API_BASE_URL}/auth/confirm-email`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Requested-With': 'XMLHttpRequest'
            },
            body: JSON.stringify({
                email: email,
                code: code
            }),
            credentials: 'include'
        });

        const data = await response.json();

        if (!response.ok) {
            // Handle specific error cases
            if (response.status === 409) {
                showToast('This email is already registered. Redirecting to login...', 'error');
                setTimeout(() => {
                    window.location.href = 'login.html?email=' + encodeURIComponent(email);
                }, 3000);
                return;
            } else if (response.status === 400) {
                showToast(data.detail || 'Invalid verification code', 'error');
                // Highlight incorrect code
                codeInputs.forEach(input => {
                    input.classList.add('border-red-500');
                    setTimeout(() => input.classList.remove('border-red-500'), 2000);
                });
                return;
            } else if (response.status === 503) {
                showToast('Service temporarily unavailable. Please try again shortly.', 'error');
                return;
            }
            throw new Error(data.detail || 'Email verification failed');
        }

        // Success - show message and redirect
        showToast('Email verified successfully! Redirecting...', 'success');
        
        // Clear local storage items
        localStorage.removeItem('lastResendAttempt');
        localStorage.removeItem('resendAttempts');
        
        // Clear guest session if exists
        document.cookie = 'guest_session_id=; Max-Age=0; path=/; domain=' + window.location.hostname;
        
        // Redirect to dashboard or home page
        setTimeout(() => {
            window.location.href = 'login.html?new_user=true&token=' + encodeURIComponent(data.access_token);
        }, 2000);

    } catch (error) {
        console.error('Confirmation error:', error);
        
        let errorMessage = 'An error occurred during verification';
        if (error.message.includes('Failed to fetch')) {
            errorMessage = 'Network error. Please check your connection.';
        }
        
        showToast(errorMessage, 'error');
        
    } finally {
        isSubmitting = false;
        // Reset button state
        const submitBtn = confirmationForm.querySelector('button[type="submit"]');
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Verify Email';
        }
    }
});
// Resend code handler
resendCodeBtn.addEventListener('click', async function() {
    const email = userEmailInput.value.trim();
    const now = Date.now();

    // Check if maximum attempts reached
    if (resendAttempts >= MAX_RESEND_ATTEMPTS) {
        showToast('Maximum resend attempts reached. Please try again later.', 'error');
        return;
    }

    // Check if enough time has passed since last resend
    if (now - lastResendAttempt < RESEND_DELAY) {
        const secondsLeft = Math.ceil((RESEND_DELAY - (now - lastResendAttempt)) / 1000);
        showToast(`Please wait ${secondsLeft} seconds before requesting a new code`, 'error');
        return;
    }

    if (!email) {
        showToast('Email address is required', 'error');
        return;
    }

    try {
        // Show loading state
        resendCodeBtn.disabled = true;
        resendCodeBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i> Sending...';

        // Send resend request
        const response = await fetch(`${API_BASE_URL}/auth/resend-confirmation`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ email }),
            credentials: 'include'
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.detail || 'Failed to resend verification code');
        }

        // Update resend tracking
        resendAttempts++;
        lastResendAttempt = now;
        localStorage.setItem('lastResendAttempt', lastResendAttempt);
        localStorage.setItem('resendAttempts', resendAttempts);
        
        startResendCountdown();
        showToast('New verification code sent to your email', 'success');

        // Clear existing inputs
        codeInputs.forEach(input => {
            input.value = '';
            input.classList.remove('filled');
        });
        updateHiddenCode();
        codeInputs[0].focus();

    } catch (error) {
        showToast(error.message, 'error');
    } finally {
        resendCodeBtn.disabled = false;
        resendCodeBtn.textContent = 'Resend code';
    }
});

// Helper Functions
function validateForm(code, email) {
    if (!code || code.length !== 6) {
        showToast('Please enter the complete 6-digit code', 'error');
        return false;
    }
    if (!email) {
        showToast('Email address is required', 'error');
        return false;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        showToast('Invalid email format', 'error');
        return false;
    }
    return true;
}

function startResendCountdown() {
    clearInterval(resendTimer);
    let secondsLeft = Math.ceil(RESEND_DELAY / 1000);
    
    // Show countdown
    countdownElement.classList.remove('hidden');
    countdownSeconds.textContent = secondsLeft;
    
    resendTimer = setInterval(() => {
        secondsLeft--;
        countdownSeconds.textContent = secondsLeft;
        
        if (secondsLeft <= 0) {
            clearInterval(resendTimer);
            countdownElement.classList.add('hidden');
            resendCodeBtn.disabled = false;
        }
    }, 1000);
}

function checkResendAvailability() {
    const now = Date.now();
    if (now - lastResendAttempt < RESEND_DELAY) {
        const secondsLeft = Math.ceil((RESEND_DELAY - (now - lastResendAttempt)) / 1000);
        countdownSeconds.textContent = secondsLeft;
        countdownElement.classList.remove('hidden');
        startResendCountdown();
    }
}

async function checkPendingConfirmation() {
    const email = userEmailInput.value.trim();
    if (!email) return;

    try {
        const response = await fetch(`${API_BASE_URL}/auth/check-confirmation?email=${encodeURIComponent(email)}`);
        
        if (!response.ok) {
            throw new Error('Failed to check confirmation status');
        }
        
        const data = await response.json();

        if (!data.exists) {
            showToast('No pending confirmation found. Please sign up again.', 'error');
            setTimeout(() => {
                window.location.href = 'signup.html';
            }, 3000);
        } else {
            // Update UI with expiration info if needed
            if (data.expires_at) {
                const expiresAt = new Date(data.expires_at);
                const timeLeft = expiresAt - new Date();
                if (timeLeft > 0) {
                    console.log(`Confirmation expires in ${Math.ceil(timeLeft / (1000 * 60))} minutes`);
                }
            }
        }
    } catch (error) {
        console.error('Confirmation check failed:', error);
        showToast('Unable to verify confirmation status', 'error');
    }
}

function showToast(message, type) {
    // Remove existing toasts
    const existingToasts = document.querySelectorAll('.custom-toast');
    existingToasts.forEach(toast => toast.remove());

    // Create toast element
    const toast = document.createElement('div');
    toast.className = `custom-toast fixed top-4 right-4 px-6 py-4 rounded-lg shadow-lg text-white ${
        type === 'error' ? 'bg-red-500' : 'bg-green-500'
    } animate-fade-in`;
    toast.innerHTML = `
        <div class="flex items-center">
            <i class="fas ${type === 'error' ? 'fa-exclamation-circle' : 'fa-check-circle'} mr-2"></i>
            <span>${message}</span>
        </div>
    `;
    
    // Add to DOM
    document.body.appendChild(toast);
    
    // Auto-remove after duration
    setTimeout(() => {
        toast.classList.add('animate-fade-out');
        setTimeout(() => toast.remove(), 300);
    }, TOAST_DURATION);
}

// Clean up on page unload
window.addEventListener('beforeunload', () => {
    clearInterval(resendTimer);
});

// Handle browser back/forward navigation
window.addEventListener('pageshow', (event) => {
    if (event.persisted) {
        // Page was restored from bfcache, reset any necessary state
        checkResendAvailability();
    }
});