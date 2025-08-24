// index.js - Homepage Specific Functionality with Firebase Analytics

import { trackPage, trackEvent, trackButtonClick, trackEngagement } from "./firebase.js";

// Track page load time
let pageLoadTime = Date.now();

document.addEventListener('DOMContentLoaded', () => {
    // Track page view
    trackPage("homepage");
    
    // Track time spent on page
    window.addEventListener('beforeunload', () => {
        const timeSpent = Date.now() - pageLoadTime;
        trackEngagement(timeSpent, 'page_visit');
    });

    // Initialize homepage-specific components
    initHomepageTracking();
    initScrollTracking();
    initFeatureCardTracking();
    initNavigationTracking();
    initCTATracking();
});

function initHomepageTracking() {
    // Track hero section visibility
    const heroSection = document.querySelector('.hero-gradient');
    if (heroSection) {
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    trackEvent('section_view', {
                        section_name: 'hero',
                        section_id: 'hero',
                        visibility: '100%'
                    });
                }
            });
        }, { threshold: 0.5 });
        
        observer.observe(heroSection);
    }
}

function initScrollTracking() {
    let maxScroll = 0;
    const sections = document.querySelectorAll('section');
    const sectionVisibility = {};
    
    sections.forEach(section => {
        sectionVisibility[section.id] = false;
    });
    
    window.addEventListener('scroll', () => {
        const currentScroll = (window.scrollY / (document.documentElement.scrollHeight - window.innerHeight)) * 100;
        
        if (currentScroll > maxScroll) {
            maxScroll = currentScroll;
            
            // Track major scroll milestones
            const milestones = [25, 50, 75, 90];
            milestones.forEach(milestone => {
                if (maxScroll > milestone && maxScroll < milestone + 1) {
                    trackEvent('scroll_depth', { 
                        depth: `${milestone}%`,
                        page_name: 'homepage'
                    });
                }
            });
        }
        
        // Track section visibility
        sections.forEach(section => {
            const rect = section.getBoundingClientRect();
            const isVisible = (rect.top <= window.innerHeight / 2) && (rect.bottom >= window.innerHeight / 2);
            
            if (isVisible && !sectionVisibility[section.id]) {
                sectionVisibility[section.id] = true;
                const sectionName = section.querySelector('h1, h2, h3')?.textContent || section.id;
                trackEvent('section_view', { 
                    section_id: section.id,
                    section_name: sectionName,
                    visibility: '50%'
                });
            }
        });
    });
}

function initFeatureCardTracking() {
    // Track feature card clicks
    const featureCards = document.querySelectorAll('.feature-card');
    featureCards.forEach(card => {
        card.addEventListener('click', (e) => {
            const featureName = card.querySelector('h3')?.textContent || 'unknown_feature';
            trackEvent('feature_click', {
                feature_name: featureName.toLowerCase().replace(/\s+/g, '_'),
                location: 'homepage_features'
            });
        });
    });
    
    // Track feature card hover (engagement)
    featureCards.forEach(card => {
        let hoverStartTime;
        
        card.addEventListener('mouseenter', () => {
            hoverStartTime = Date.now();
        });
        
        card.addEventListener('mouseleave', () => {
            if (hoverStartTime) {
                const hoverTime = Date.now() - hoverStartTime;
                if (hoverTime > 1000) { // Only track if hovered for more than 1 second
                    const featureName = card.querySelector('h3')?.textContent || 'unknown_feature';
                    trackEvent('feature_engagement', {
                        feature_name: featureName.toLowerCase().replace(/\s+/g, '_'),
                        engagement_time: hoverTime
                    });
                }
            }
        });
    });
}

function initNavigationTracking() {
    // Track navigation clicks
    const navLinks = document.querySelectorAll('nav a');
    navLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            const linkText = link.textContent.trim();
            const linkHref = link.getAttribute('href');
            
            trackButtonClick('navigation', {
                link_text: linkText,
                link_destination: linkHref,
                location: 'header_navigation'
            });
        });
    });
    
    // Track mobile menu interactions
    const hamburger = document.getElementById('hamburger');
    if (hamburger) {
        hamburger.addEventListener('click', () => {
            trackEvent('mobile_menu_toggle', {
                action: 'open',
                location: 'header'
            });
        });
    }
    
    const mobileMenuLinks = document.querySelectorAll('#mobile-menu a');
    mobileMenuLinks.forEach(link => {
        link.addEventListener('click', () => {
            const linkText = link.textContent.trim();
            trackButtonClick('mobile_navigation', {
                link_text: linkText,
                location: 'mobile_menu'
            });
        });
    });
}

function initCTATracking() {
    // Track all CTA buttons
    const ctaButtons = document.querySelectorAll('a[href*="verify"], a[href*="login"], a[href*="signup"]');
    ctaButtons.forEach(button => {
        button.addEventListener('click', (e) => {
            const buttonText = button.textContent.trim();
            const buttonHref = button.getAttribute('href');
            const buttonLocation = button.closest('section')?.id || 'unknown_location';
            
            trackButtonClick('cta', {
                button_text: buttonText,
                button_destination: buttonHref,
                button_location: buttonLocation
            });
        });
    });
    
    // Track social media clicks
    const socialLinks = document.querySelectorAll('a[href*="twitter"], a[href*="facebook"], a[href*="instagram"], a[href*="linkedin"]');
    socialLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            const platform = link.getAttribute('href').includes('twitter') ? 'twitter' :
                           link.getAttribute('href').includes('facebook') ? 'facebook' :
                           link.getAttribute('href').includes('instagram') ? 'instagram' :
                           link.getAttribute('href').includes('linkedin') ? 'linkedin' : 'unknown';
            
            trackEvent('social_click', {
                social_platform: platform,
                location: 'footer'
            });
        });
    });
    
    // Track WhatsApp community link
    const whatsappLink = document.querySelector('a[href*="whatsapp"]');
    if (whatsappLink) {
        whatsappLink.addEventListener('click', (e) => {
            trackEvent('community_join_attempt', {
                platform: 'whatsapp',
                location: 'footer'
            });
        });
    }
}

// Track outbound links
document.addEventListener('click', (e) => {
    const link = e.target.closest('a');
    if (link && link.href && link.hostname !== window.location.hostname) {
        e.preventDefault();
        trackEvent('outbound_link_click', {
            link_url: link.href,
            link_text: link.textContent.substring(0, 100),
            link_location: 'homepage'
        });
        
        // Open link after a short delay to ensure tracking is sent
        setTimeout(() => {
            window.open(link.href, '_blank');
        }, 150);
    }
});

// Track images that fail to load
document.addEventListener('error', (e) => {
    if (e.target.tagName === 'IMG') {
        trackEvent('image_load_error', {
            image_src: e.target.src,
            page_location: 'homepage'
        });
    }
}, true);

// Track performance (if supported)
if ('performance' in window) {
    window.addEventListener('load', () => {
        setTimeout(() => {
            const navigationTiming = performance.getEntriesByType('navigation')[0];
            if (navigationTiming) {
                trackEvent('page_performance', {
                    load_time: navigationTiming.loadEventEnd - navigationTiming.navigationStart,
                    dom_content_loaded: navigationTiming.domContentLoadedEventEnd - navigationTiming.navigationStart,
                    page: 'homepage'
                });
            }
        }, 0);
    });
}

// Make tracking functions available globally for onclick attributes
window.trackButtonClick = trackButtonClick;
window.trackEvent = trackEvent;

// Export for potential module usage
export { initHomepageTracking, initScrollTracking, initFeatureCardTracking, initNavigationTracking, initCTATracking };