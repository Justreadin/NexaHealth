document.addEventListener('DOMContentLoaded', function() {
    const feedbackButton = document.getElementById('feedback-button');
    const feedbackModal = document.getElementById('feedback-modal');
    const closeFeedback = document.getElementById('close-feedback');
    const submitFeedback = document.getElementById('submit-feedback');
    const feedbackSuccess = document.getElementById('feedback-success');
    const ratingStars = document.querySelectorAll('.rating-star');
    const feedbackTypes = document.querySelectorAll('.feedback-type');
    const languageSelect = document.querySelector('select');

    let selectedRating = 0;
    let selectedType = '';

    // Toggle feedback modal
    feedbackButton.addEventListener('click', function() {
        feedbackModal.classList.remove('hidden');
        feedbackModal.querySelector('.animate__fadeInUp').classList.add('animate__fadeInUp');
    });

    closeFeedback.addEventListener('click', function() {
        feedbackModal.classList.add('hidden');
    });

    // Rating stars
    ratingStars.forEach(star => {
        star.addEventListener('click', function() {
            const rating = parseInt(this.getAttribute('data-rating'));
            selectedRating = rating;

            // Update stars display
            ratingStars.forEach((s, index) => {
                if (index < rating) {
                    s.innerHTML = '<i class="fas fa-star text-yellow-400 text-xl"></i>';
                    s.classList.add('bg-yellow-50');
                    s.classList.remove('bg-gray-100');
                } else {
                    s.innerHTML = '<i class="far fa-star text-gray-400 text-xl"></i>';
                    s.classList.add('bg-gray-100');
                    s.classList.remove('bg-yellow-50');
                }
            });
        });
    });

    // Feedback types
    feedbackTypes.forEach(type => {
        type.addEventListener('click', function() {
            feedbackTypes.forEach(t => t.classList.remove('bg-blue-50', 'bg-green-50', 'bg-purple-50', 'bg-red-50', 'border-primary'));
            this.classList.add(this.classList.contains('hover:bg-blue-50') ? 'bg-blue-50' :
                            this.classList.contains('hover:bg-green-50') ? 'bg-green-50' :
                            this.classList.contains('hover:bg-purple-50') ? 'bg-purple-50' : 'bg-red-50');
            this.classList.add('border-primary');
            selectedType = this.getAttribute('data-type');
        });
    });

    // Submit feedback
    submitFeedback.addEventListener('click', async function() {
        const message = document.getElementById('feedback-message').value;
        const language = languageSelect.value;

        if (selectedRating === 0 || selectedType === '') {
            alert('Please select a rating and feedback type');
            return;
        }

        try {
            const response = await fetch('https://lyre-4m8l.onrender.com/feedback', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    rating: selectedRating,
                    feedback_type: selectedType,
                    message: message,
                    language: language,
                    page_url: window.location.href
                })
            });

            if (!response.ok) {
                throw new Error('Failed to submit feedback');
            }

            // Show success message
            feedbackModal.classList.add('hidden');
            feedbackSuccess.classList.remove('hidden');
            feedbackSuccess.querySelector('.animate__fadeInUp').classList.add('animate__fadeInUp');

            // Hide after 3 seconds
            setTimeout(() => {
                feedbackSuccess.classList.add('hidden');
            }, 3000);

            // Reset form
            resetFeedbackForm();

        } catch (error) {
            console.error('Error submitting feedback:', error);
            alert('Failed to submit feedback. Please try again.');
        }
    });

    document.getElementById('close-feedback').addEventListener('click', function() {
        document.getElementById('feedback-modal').classList.add('hidden');
    });

    document.getElementById('close-success').addEventListener('click', function() {
        document.getElementById('feedback-success').classList.add('hidden');
    });


    document.getElementById('close-feedback').addEventListener('click', function() {
        document.getElementById('feedback-modal').classList.add('hidden');
    });

    document.getElementById('close-success').addEventListener('click', function() {
        document.getElementById('feedback-success').classList.add('hidden');
    });

    function resetFeedbackForm() {
        selectedRating = 0;
        selectedType = '';
        document.getElementById('feedback-message').value = '';
        languageSelect.value = 'English';
        ratingStars.forEach(star => {
            star.innerHTML = '<i class="far fa-star text-gray-400 text-xl"></i>';
            star.classList.add('bg-gray-100');
            star.classList.remove('bg-yellow-50');
        });
        feedbackTypes.forEach(type => {
            type.classList.remove('bg-blue-50', 'bg-green-50', 'bg-purple-50', 'bg-red-50', 'border-primary');
        });
    }
function showFeedbackTooltip() {
        // Remove any existing tooltip first
        const existingTooltip = document.querySelector('.feedback-tooltip');
        if (existingTooltip) existingTooltip.remove();

        const tooltip = document.createElement('div');
        tooltip.className = 'feedback-tooltip absolute -top-12 left-1/2 transform -translate-x-1/2 px-3 py-2 bg-white text-gray-800 text-sm rounded-lg shadow-lg whitespace-nowrap z-50';
        tooltip.innerHTML = `
            <div class="absolute -bottom-1 left-1/2 transform -translate-x-1/2 w-3 h-3 bg-white rotate-45"></div>
            <span class="relative z-10">Your feedback helps us improve!</span>
        `;
        
        // Position relative on feedback button
        feedbackButton.classList.add('relative');
        
        // Append tooltip
        feedbackButton.appendChild(tooltip);
        
        // Add animation class after a small delay
        setTimeout(() => {
            tooltip.classList.add('animate-feedback-tooltip');
        }, 10);
        
        // Remove after 5 seconds
        setTimeout(() => {
            tooltip.classList.add('opacity-0', 'transition-opacity', 'duration-300');
            setTimeout(() => tooltip.remove(), 300);
        }, 5000);
    }

    // Show tooltip periodically
    function initTooltipInterval() {
        // Show first tooltip after 10 seconds
        setTimeout(() => {
            if (!localStorage.getItem('feedbackShown')) {
                showFeedbackTooltip();
                localStorage.setItem('feedbackShown', 'true');
                setTimeout(() => localStorage.removeItem('feedbackShown'), 300000); // 5 minutes
            }
        }, 10000);

        // Then every 3 minutes
        setInterval(() => {
            if (!localStorage.getItem('feedbackShown')) {
                showFeedbackTooltip();
                localStorage.setItem('feedbackShown', 'true');
                setTimeout(() => localStorage.removeItem('feedbackShown'), 300000); // 5 minutes
            }
        }, 180000);
    }

    // Initialize the tooltip system
    initTooltipInterval();

    // Feedback button hover effect
    feedbackButton.addEventListener('mouseenter', function() {
        this.classList.remove('animate-pulse-slow');
        this.classList.add('animate-heartbeat');
    });

    feedbackButton.addEventListener('mouseleave', function() {
        this.classList.remove('animate-heartbeat');
        this.classList.add('animate-pulse-slow');
    });
});