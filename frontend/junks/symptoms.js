class SymptomChecker {
  constructor() {
    this.MAX_RETRIES = 2;
    this.retryCount = 0;
    this.API_BASE_URL = 'http://127.0.0.1:800';
  }

  async submitSymptoms(symptoms) {
    const isLoggedIn = window.App.Auth.isAuthenticated();
    
    try {
      // Only handle guest session if not logged in
      if (!isLoggedIn && window.App.GuestSession) {
        try {
          await window.App.GuestSession.ensureValidSession();
          if (window.App.GuestSession.checkGuestLimit()) {
            showAlert('Guest limit reached. Please sign up for full access.', 'warning');
            return null;
          }
        } catch (error) {
          console.error('Guest session error:', error);
          return this.simulateApiResponse(symptoms);
        }
      }

      const response = await this._makeRequest(symptoms, isLoggedIn);
      
      // Handle specific error cases
      if (response.status === 422) {
        const errorData = await response.json();
        throw new Error(`Validation failed: ${errorData.detail || 'Invalid input'}`);
      }

      // Handle expired tokens for authenticated users
      if (response.status === 401 && isLoggedIn && this.retryCount < this.MAX_RETRIES) {
        this.retryCount++;
        try {
          await window.App.Auth.refreshToken();
          return await this.submitSymptoms(symptoms);
        } catch (refreshError) {
          console.error('Token refresh failed:', refreshError);
          throw new Error('Session expired. Please log in again.');
        }
      }

      // Handle expired guest sessions
      if (response.status === 401 && !isLoggedIn && this.retryCount < this.MAX_RETRIES) {
        this.retryCount++;
        try {
          await window.App.GuestSession.createNewSession();
          return await this.submitSymptoms(symptoms);
        } catch (sessionError) {
          console.error('Session renewal failed:', sessionError);
          throw new Error('Session expired. Please try again.');
        }
      }

      if (!response.ok) {
        throw new Error(`Request failed with status ${response.status}`);
      }
      
      return await response.json();
    } catch (error) {
      console.error("Symptom check error:", error);
      showAlert(error.message || 'Failed to analyze symptoms. Using fallback data.', 'error');
      return this.simulateApiResponse(symptoms);
    }
  }

  async _makeRequest(symptoms, isLoggedIn) {
    const headers = {
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    };

    // Handle authenticated requests
    if (isLoggedIn) {
      const token = window.App.Auth.getAccessToken();
      if (!token) {
        throw new Error('Authentication token missing');
      }
      headers['Authorization'] = `Bearer ${token}`;
    } 
    // Handle guest requests
    else if (window.App.GuestSession) {
      try {
        const session = await window.App.GuestSession.getCurrentSession();
        if (session?.id) {
          headers['X-Guest-Session'] = session.id;
        }
      } catch (e) {
        console.error("Failed to get guest session:", e);
      }
    }

    try {
      const response = await fetch(`${this.API_BASE_URL}/predict-risk`, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify({ symptoms }),
        credentials: 'include'
      });
      
      return response;
    } catch (error) {
      console.error("Network error:", error);
      throw error;
    }
  }

  simulateApiResponse(symptoms) {
    const lowerSymptoms = symptoms.toLowerCase();
    let risk = "Low";
    let riskScore = 10;
    let keywords = [];
    let drugs = [];

    // Headache detection
    if (lowerSymptoms.includes('headache') || lowerSymptoms.includes('head pain')) {
      keywords.push('headache');
      drugs.push({
        name: "Paracetamol",
        dosage_form: "Tablet",
        use_case: "For relief of mild to moderate pain including headaches"
      });
      drugs.push({
        name: "Ibuprofen",
        dosage_form: "Tablet",
        use_case: "For relief of pain and inflammation including headaches"
      });
    }

    // Fever detection
    if (lowerSymptoms.includes('fever') || lowerSymptoms.includes('high temperature')) {
      keywords.push('fever');
      if (!drugs.some(d => d.name === "Paracetamol")) {
        drugs.push({
          name: "Paracetamol",
          dosage_form: "Tablet/Syrup",
          use_case: "For reducing fever and relieving mild pain"
        });
      }
      risk = "Medium";
      riskScore = 45;
    }

    // Respiratory symptoms
    if (lowerSymptoms.includes('cough') || lowerSymptoms.includes('cold')) {
      keywords.push('cough');
      drugs.push({
        name: "Dextromethorphan",
        dosage_form: "Syrup",
        use_case: "For relief of dry cough"
      });
      if (lowerSymptoms.includes('chest') || lowerSymptoms.includes('breath')) {
        risk = "High";
        riskScore = 75;
        keywords.push('chest pain', 'breathing difficulty');
      }
    }

    // Gastrointestinal symptoms
    if (lowerSymptoms.includes('stomach') || lowerSymptoms.includes('abdominal')) {
      keywords.push('stomach pain');
      drugs.push({
        name: "Antacid",
        dosage_form: "Tablet/Suspension",
        use_case: "For relief of heartburn and indigestion"
      });
    }

    if (lowerSymptoms.includes('diarrhea') || lowerSymptoms.includes('loose stool')) {
      keywords.push('diarrhea');
      drugs.push({
        name: "Oral Rehydration Salts",
        dosage_form: "Powder",
        use_case: "For prevention and treatment of dehydration from diarrhea"
      });
      risk = "Medium";
      riskScore = 60;
    }

    // Default response if no matches
    if (keywords.length === 0) {
      keywords = ['general discomfort'];
      drugs = [{
        name: "Paracetamol",
        dosage_form: "Tablet",
        use_case: "For general pain relief and fever reduction"
      }];
    }

    return {
      matched_keywords: keywords,
      risk: risk,
      risk_score: riskScore,
      suggested_drugs: drugs
    };
  }
}

function displayResults(data) {
  // Display matched keywords
  const keywordsContainer = document.getElementById('matched-keywords');
  keywordsContainer.innerHTML = '';
  data.matched_keywords.forEach(keyword => {
    const chip = document.createElement('div');
    chip.className = 'bg-blue-100 text-blue-800 text-sm font-medium px-3 py-1 rounded-full';
    chip.textContent = keyword;
    keywordsContainer.appendChild(chip);
  });

  // Update risk assessment display
  document.getElementById('risk-level').textContent = data.risk;
  document.getElementById('risk-score').textContent = `Score: ${data.risk_score}/100`;

  // Set risk badge color
  const riskBadge = document.getElementById('risk-badge');
  riskBadge.className = `w-16 h-16 rounded-full flex items-center justify-center text-white text-2xl font-bold risk-badge bg-${data.risk.toLowerCase()}Risk`;

  // Update pulse ring color
  const pulseRing = document.querySelector('.pulse-ring');
  pulseRing.className = 'pulse-ring';
  pulseRing.classList.add(`bg-${data.risk.toLowerCase()}Risk`);

  // Update recommendation message
  const recommendation = document.getElementById('recommendation');
  if (data.risk === "High") {
    recommendation.textContent = "Your symptoms suggest a potentially serious condition. Please consult a healthcare professional immediately.";
  } else if (data.risk === "Medium") {
    recommendation.textContent = "Your symptoms may require medical attention if they persist or worsen. Consider consulting a doctor.";
  } else {
    recommendation.textContent = "Based on your symptoms, you may consider the following medications. If symptoms persist or worsen, consult a healthcare professional.";
  }

  const drugsContainer = document.getElementById('suggested-drugs');
  drugsContainer.innerHTML = '';
  data.suggested_drugs.forEach(drug => {
    const drugCard = document.createElement('div');
    drugCard.className = 'bg-white p-6 rounded-xl border border-gray-200 hover:border-primary transition-all';
    drugCard.innerHTML = `
      <div class="flex items-start mb-4">
        <div class="bg-primary bg-opacity-10 p-3 rounded-full mr-4 flex-shrink-0">
          <i class="fas fa-pills text-primary"></i>
        </div>
        <div>
          <h4 class="font-bold text-lg text-gray-800">${drug.name}</h4>
          <div class="text-sm text-gray-500 mb-2">${drug.dosage_form}</div>
          <p class="text-sm text-gray-700">${drug.use_case}</p>
        </div>
      </div>
      <div class="flex justify-end">
        <a href="verify.html?drug=${encodeURIComponent(drug.name)}" class="text-sm bg-primary hover:bg-secondary text-white px-4 py-2 rounded-lg transition-all">
          Verify Drug <i class="fas fa-arrow-right ml-1"></i>
        </a>
      </div>
    `;
    drugsContainer.appendChild(drugCard);
  });
}

// Initialize Symptom Checker Page
document.addEventListener('DOMContentLoaded', () => {
  // Only initialize if we're on the symptoms page
  if (!document.getElementById('symptomForm')) return;

  const checker = new SymptomChecker();
  const symptomForm = document.getElementById('symptomForm');
  const analyzeButton = document.getElementById('analyze-button');
  const buttonText = document.getElementById('button-text');
  const buttonSpinner = document.getElementById('button-spinner');

  // Symptom form submission
  symptomForm.addEventListener('submit', async function(e) {
    e.preventDefault();
    const symptoms = document.getElementById('symptoms').value.trim();
    if (!symptoms) return;

    // Show loading state
    buttonText.textContent = "Analyzing...";
    buttonSpinner.classList.remove('hidden');
    analyzeButton.disabled = true;

    try {
      const data = await checker.submitSymptoms(symptoms);
      if (!data) return; // Guest limit reached
      
      displayResults(data);
      document.getElementById('results-section').classList.remove('hidden');
      
      setTimeout(() => {
        document.getElementById('results-section').scrollIntoView({ 
          behavior: 'smooth', 
          block: 'start' 
        });
      }, 300);
      
    } finally {
      buttonText.textContent = "Analyze Symptoms";
      buttonSpinner.classList.add('hidden');
      analyzeButton.disabled = false;
    }
  });

  // Common symptom chips
  document.querySelectorAll('.symptom-chip').forEach(chip => {
    chip.addEventListener('click', function() {
      const symptom = this.textContent.trim();
      document.getElementById('symptoms').value = `I have ${symptom.toLowerCase()}`;
      document.getElementById('checker-section').scrollIntoView({
        behavior: 'smooth'
      });
    });
  });
});