import json
import os

# Basic ingredient-to-use-case mapping (extendable)
INGREDIENT_USE_CASES = {
    "Artemether": "Antimalarial treatment",
    "Lumefantrine": "Antimalarial treatment",
    "Metformin Hydrochloride": "Manages type 2 diabetes",
    "Tramadol Hydrochloride": "Moderate to severe pain relief",
    "Carvedilol": "Heart failure and high blood pressure",
    "Telmisartan": "High blood pressure, heart health",
    "Hydrochlorothiazide": "Diuretic for blood pressure and fluid retention",
    "Levofloxacin": "Broad-spectrum antibiotic for infections",
    "Spironolactone": "Potassium-sparing diuretic, used in hypertension and heart failure",
    "Paracetamol": "Fever and pain relief",
    "Ibuprofen": "Pain relief, inflammation, fever",
    "Amoxicillin": "Antibiotic for respiratory and bacterial infections",
    "Ciprofloxacin": "Urinary tract and bacterial infections",
    "Loperamide": "Anti-diarrheal",
    "Omeprazole": "Acid reflux and ulcers",
    "Losartan": "High blood pressure, kidney protection",
    "Prednisolone": "Inflammation, allergies, immune disorders",
    "Azithromycin": "Respiratory and bacterial infections",
    "Doxycycline": "Malaria prevention and bacterial infections",
    "Chlorpheniramine": "Allergy relief",
    "Cetirizine": "Antihistamine for allergies"
}

# Load NAFDAC drug database
with open(os.path.join("app", "data", "verified_drugs.json")) as f:
    DRUGS = json.load(f)

def suggest_drugs(text: str):
    text = text.lower()
    suggestions = []

    for drug in DRUGS:
        use_cases = []
        for ingredient in drug.get("ingredients", []):
            for key in INGREDIENT_USE_CASES:
                if key.lower() in ingredient.lower():
                    use_cases.append(INGREDIENT_USE_CASES[key])

        if any(symptom in " ".join(use_cases).lower() for symptom in text.split()):
            suggestions.append({
                "name": drug["product_name"],
                "dosage_form": drug["dosage_form"],
                "use_case": ", ".join(set(use_cases)) or "General use"
            })

    return suggestions[:3]  # Return top 3
