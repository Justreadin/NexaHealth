// Mobile Menu Toggle
const hamburger = document.getElementById('hamburger');
const mobileMenu = document.getElementById('mobile-menu');

hamburger.addEventListener('click', () => {
    hamburger.classList.toggle('hamburger-active');
    mobileMenu.classList.toggle('hidden');
});

// Close mobile menu when clicking a link
document.querySelectorAll('#mobile-menu a').forEach(link => {
    link.addEventListener('click', () => {
        hamburger.classList.remove('hamburger-active');
        mobileMenu.classList.add('hidden');
    });
});

// Smooth scrolling for anchor links
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function(e) {
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

// Symptom form submission
const symptomForm = document.getElementById('symptomForm');
const resultsSection = document.getElementById('results-section');
const analyzeButton = document.getElementById('analyze-button');
const buttonText = document.getElementById('button-text');
const buttonSpinner = document.getElementById('button-spinner');

symptomForm.addEventListener('submit', async function(e) {
    e.preventDefault();

    const symptoms = document.getElementById('symptoms').value.trim();

    if (!symptoms) {
        alert('Please describe your symptoms');
        return;
    }

    // Show loading state
    buttonText.textContent = "Analyzing...";
    buttonSpinner.classList.remove('hidden');
    analyzeButton.disabled = true;

    try {
        // Call the backend API
        const response = await fetch('https://lyre-4m8l.onrender.com/predict-risk', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                symptoms: symptoms
            })
        });

        if (!response.ok) {
            throw new Error(`API request failed with status ${response.status}`);
        }

        const data = await response.json();

        // Display results
        displayResults(data);

        // Show results section
        resultsSection.classList.remove('hidden');

        // Scroll to results
        setTimeout(() => {
            resultsSection.scrollIntoView({
                behavior: 'smooth',
                block: 'start'
            });
        }, 300);

    } catch (error) {
        console.error("Error:", error);
        alert("An error occurred. Please try again.");

        // For demo purposes, fall back to simulated response if API fails
        const simulatedResponse = simulateApiResponse(symptoms);
        displayResults(simulatedResponse);
        resultsSection.classList.remove('hidden');
    } finally {
        // Reset button state
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

        // Scroll to form
        document.getElementById('checker-section').scrollIntoView({
            behavior: 'smooth'
        });
    });
});

// Function to display results
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

    // Display risk assessment
    document.getElementById('risk-level').textContent = data.risk;
    document.getElementById('risk-score').textContent = `Score: ${data.risk_score}/100`;

    // Set risk badge color based on level
    const riskBadge = document.getElementById('risk-badge');
    riskBadge.className = `w-16 h-16 rounded-full flex items-center justify-center text-white text-2xl font-bold risk-badge bg-${data.risk.toLowerCase()}Risk`;

    // Set pulse ring color
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

    // Display suggested drugs
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
                <a href="verify.html" class="text-sm bg-primary hover:bg-secondary text-white px-4 py-2 rounded-lg transition-all">
                    Verify Drug <i class="fas fa-arrow-right ml-1"></i>
                </a>
            </div>
        `;
        drugsContainer.appendChild(drugCard);
    });
}

// Fallback function to simulate API response if needed
function simulateApiResponse(symptoms) {
    const lowerSymptoms = symptoms.toLowerCase();
    let risk = "Low";
    let riskScore = 10;
    let keywords = [];
    let drugs = [];

    // Detect keywords and adjust response accordingly
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

    // If no specific keywords matched
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