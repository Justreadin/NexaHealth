// ======================
// Navigation Module
// ======================
const Navigation = {
  initMobileMenu() {
    const hamburger = document.getElementById('hamburger');
    const mobileMenu = document.getElementById('mobile-menu');
    
    if (hamburger && mobileMenu) {
        hamburger.addEventListener('click', function() {
            mobileMenu.classList.toggle('hidden');
            
            // Animate hamburger icon
            const lines = this.querySelectorAll('.hamburger-line');
            if (mobileMenu.classList.contains('hidden')) {
                lines[0].style.transform = '';
                lines[1].style.opacity = '';
                lines[2].style.transform = '';
            } else {
                lines[0].style.transform = 'translateY(8px) rotate(45deg)';
                lines[1].style.opacity = '0';
                lines[2].style.transform = 'translateY(-8px) rotate(-45deg)';
            }
        });
    }
  },

  setupSmoothScrolling() {
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
      anchor.addEventListener('click', function (e) {
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

    document.querySelectorAll('.animation-fade-in').forEach(el => {
      el.style.opacity = '0';
    });

    document.querySelectorAll('.animation-slide-up').forEach(el => {
      el.style.opacity = '0';
      el.style.transform = 'translateY(20px)';
    });

    animateOnScroll();
    window.addEventListener('scroll', animateOnScroll);
  }
};

// ======================
// Core Initialization
// ======================
document.addEventListener('DOMContentLoaded', () => {
  Navigation.initMobileMenu();
  Navigation.setupSmoothScrolling();
  Animations.initScrollAnimations();
});

// Optional: Expose for global access
window.App = {
  Navigation,
  Animations
};
