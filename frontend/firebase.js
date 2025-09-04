// frontend/firebase.js

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-app.js";
import { 
  getAnalytics, 
  logEvent,
  setUserProperties,
  setUserId
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-analytics.js";
 
const firebaseConfig = {
    apiKey: "AIzaSyDz4vI2Vfm6oYDsU0-UL0G-GO-emT8y0QM",
    authDomain: "nexa-health.firebaseapp.com",
    projectId: "nexa-health",
    storageBucket: "nexa-health.firebasestorage.app",
    messagingSenderId: "616215979591",
    appId: "1:616215979591:web:6bcf62880219a2e9a83362",
    measurementId: "G-34ST9GPLFL"
  };
// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);

// Track a page view
export function trackPage(pageName) {
  logEvent(analytics, "page_view", { 
    page_title: pageName,
    page_location: window.location.href
  });
}

// Track custom events
export function trackEvent(name, params = {}) {
  logEvent(analytics, name, params);
}

// Track form submissions
export function trackFormSubmission(formName, formData = {}) {
  logEvent(analytics, "form_submit", {
    form_name: formName,
    ...formData
  });
}

// Track verification events
export function trackVerification(action, status, details = {}) {
  logEvent(analytics, "drug_verification", {
    action: action,
    status: status,
    ...details
  });
}

// Track button clicks
export function trackButtonClick(buttonName, location) {
  logEvent(analytics, "button_click", {
    button_name: buttonName,
    button_location: location,
    
  });
}

// Track user engagement
export function trackEngagement(timeEngaged, engagementType) {
  logEvent(analytics, "user_engagement", {
    engagement_time_msec: timeEngaged,
    engagement_type: engagementType
  });
}
// Set user properties (if you have user authentication)
export function setUserAnalyticsProperties(properties) {
  setUserProperties(analytics, properties);
}
// Set user ID (if you have user authentication)
export function setUserID(userId) {
  setUserId(analytics, userId);
}