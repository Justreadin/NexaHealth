// tracker.js
import {
  trackPage,
  trackEvent,
  trackButtonClick,
  trackFormSubmission,
  trackVerification
} from "./firebase.js";

// ------------------ GLOBAL TRACKER ------------------

// Get page name from <body data-page="index"> etc.
const pageName = document.body.dataset.page || window.location.pathname.replace("/", "") || "unknown";

// Track page load
trackPage(pageName);

// ---- Universal tracking across all pages ----

// Track clicks on any button
document.querySelectorAll("button, .btn").forEach(button => {
  button.addEventListener("click", () => {
    trackButtonClick("button_click", {
      button_text: button.innerText || button.value || "unnamed",
      page_name: pageName
    });
  });
});

// Track form submissions
document.querySelectorAll("form").forEach(form => {
  form.addEventListener("submit", (e) => {
    trackFormSubmission(form.id || "unnamed_form", {
      page_name: pageName,
      input_count: form.querySelectorAll("input, textarea, select").length
    });
  });
});

// Track all navigation link clicks
document.querySelectorAll("a").forEach(link => {
  link.addEventListener("click", () => {
    trackEvent("link_click", {
      link_text: link.innerText || "unnamed_link",
      link_destination: link.href,
      page_name: pageName
    });
  });
});

// Track scroll depth
const milestones = [10, 25, 50, 75, 90];
const firedMilestones = new Set();
window.addEventListener("scroll", () => {
  const scrollTop = window.scrollY;
  const docHeight = document.documentElement.scrollHeight - window.innerHeight;
  const percent = Math.round((scrollTop / docHeight) * 100);

  milestones.forEach(m => {
    if (percent >= m && !firedMilestones.has(m)) {
      firedMilestones.add(m);
      trackEvent("scroll_depth", { depth: `${m}%`, page_name: pageName });
    }
  });
});

// Track time on page
const startTime = Date.now();
window.addEventListener("beforeunload", () => {
  const duration = Date.now() - startTime;
  trackEvent("time_on_page", {
    page_name: pageName,
    time_spent_seconds: Math.round(duration / 1000)
  });
});

// Track broken images
document.querySelectorAll("img").forEach(img => {
  img.addEventListener("error", () => {
    trackEvent("image_load_error", {
      image_src: img.src,
      page_name: pageName
    });
  });
});

// ---- Page-specific extras ----
if (pageName === "verify") {
  const verifyForm = document.querySelector("#verify-form");
  if (verifyForm) {
    verifyForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const inputVal = document.querySelector("#drug-code")?.value || "empty";
      trackVerification(inputVal, "verify-page");
    });
  }
}

console.log(`📊 Tracker initialized for page: ${pageName}`);
