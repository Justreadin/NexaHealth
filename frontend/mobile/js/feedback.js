// API Configuration
const API_BASE_URL = 'https://lyre-4m8l.onrender.com';
const FEEDBACK_ENDPOINT = '/feedback';

// DOM Elements
const feedbackForm = document.getElementById('feedback-form');
const thankYouModal = document.getElementById('thank-you-modal');
const closeThankYou = document.getElementById('close-thank-you');
const previewContainer = document.getElementById('preview-container');
const previewImage = document.getElementById('preview-image');
const removeImage = document.getElementById('remove-image');
const screenshotUpload = document.getElementById('screenshot-upload');

// Initialize the application
document.addEventListener('DOMContentLoaded', function() {
    setupEventListeners();
});

function setupEventListeners() {
    // Form submission
    feedbackForm.addEventListener('submit', handleSubmitFeedback);
    
    // Thank you modal close
    closeThankYou.addEventListener('click', () => {
        thankYouModal.classList.add('hidden');
        window.location.href = 'dashboard.html';
    });
    
    // Image upload handling
    screenshotUpload.addEventListener('change', handleImageUpload);
    removeImage.addEventListener('click', removeUploadedImage);
}

async function handleSubmitFeedback(e) {
    e.preventDefault();
    
    const formData = new FormData();
    const feedbackType = document.querySelector('input[name="feedback_type"]:checked').value;
    const feedbackMessage = document.getElementById('feedback-message').value;
    const contactEmail = document.getElementById('contact-email').value;
    const screenshotFile = screenshotUpload.files[0];
    
    // Basic validation
    if (!feedbackMessage) {
        showErrorToast('Please enter your feedback message');
        return;
    }
    
    // Prepare form data
    formData.append('feedback_type', feedbackType);
    formData.append('message', feedbackMessage);
    if (contactEmail) formData.append('contact_email', contactEmail);
    if (screenshotFile) formData.append('screenshot', screenshotFile);
    
    try {
        // Show loading state
        const submitButton = feedbackForm.querySelector('button[type="submit"]');
        submitButton.disabled = true;
        submitButton.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i> Submitting...';
        
        // Submit feedback
        const response = await fetch(`${API_BASE_URL}${FEEDBACK_ENDPOINT}`, {
            method: 'POST',
            body: formData
        });
        
        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            throw new Error(error.detail || 'Failed to submit feedback');
        }
        
        // Show success message
        thankYouModal.classList.remove('hidden');
        feedbackForm.reset();
        removeUploadedImage();
        
    } catch (error) {
        console.error('Error submitting feedback:', error);
        showErrorToast(error.message || 'Failed to submit feedback. Please try again.');
    } finally {
        // Reset submit button
        const submitButton = feedbackForm.querySelector('button[type="submit"]');
        submitButton.disabled = false;
        submitButton.innerHTML = '<i class="fas fa-paper-plane mr-2"></i> Submit Feedback';
    }
}

function handleImageUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    
    // Validate file type and size
    const validTypes = ['image/jpeg', 'image/png', 'image/gif'];
    const maxSize = 5 * 1024 * 1024; // 5MB
    
    if (!validTypes.includes(file.type)) {
        showErrorToast('Please upload a valid image (JPEG, PNG, GIF)');
        return;
    }
    
    if (file.size > maxSize) {
        showErrorToast('Image size must be less than 5MB');
        return;
    }
    
    // Create preview
    const reader = new FileReader();
    reader.onload = function(event) {
        previewImage.src = event.target.result;
        previewContainer.classList.remove('hidden');
    };
    reader.readAsDataURL(file);
}

function removeUploadedImage() {
    screenshotUpload.value = '';
    previewContainer.classList.add('hidden');
    previewImage.src = '';
}

function showErrorToast(message) {
    const toast = document.createElement('div');
    toast.className = 'fixed bottom-4 left-1/2 transform -translate-x-1/2 bg-red-600 text-white px-4 py-2 rounded-lg shadow-lg flex items-center';
    toast.innerHTML = `<i class="fas fa-exclamation-circle mr-2"></i> ${message}`;
    document.body.appendChild(toast);
    
    setTimeout(() => {
        toast.classList.add('opacity-0', 'transition-opacity', 'duration-300');
        setTimeout(() => toast.remove(), 300);
    }, 5000);
}

// Add animation to feedback type options on page load
document.querySelectorAll('.feedback-type-option').forEach((option, index) => {
    option.style.animationDelay = `${index * 0.1}s`;
});