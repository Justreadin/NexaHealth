import pandas as pd
import os
import re
import json
from difflib import get_close_matches
from pathlib import Path

import nltk
from nltk.stem import PorterStemmer

#nltk.download('punkt')  # Only once, to ensure word tokenization works
stemmer = PorterStemmer()


BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RISK_DATA_PATH = os.path.join(BASE_DIR, "data", "keyword_risk_map.csv")
VERIFIED_DRUGS_PATH = os.path.join(BASE_DIR, "data", "verified_drugs.json")

# === Load and Normalize Risk Data ===
risk_df = pd.read_csv(RISK_DATA_PATH)
risk_df["symptom_keyword"] = risk_df["symptom_keyword"].str.lower().str.strip()

risk_map = {
    row["symptom_keyword"]: {
        "risk_weight": row["risk_weight"],
        "common_drugs": [drug.strip() for drug in row["common_drugs"].split(",")] if pd.notna(row["common_drugs"]) else []
    }
    for _, row in risk_df.iterrows()
}

# === Load Verified Drugs Data ===
with open(VERIFIED_DRUGS_PATH, "r", encoding="utf-8") as file:
    verified_drugs = json.load(file)

# Flatten a set of all verified ingredient names (normalized for comparison)
verified_ingredients = set()
for drug in verified_drugs:
    ingredients = drug.get("ingredients") or drug.get("i ngredients")  # fallback for typo
    if ingredients:
        verified_ingredients.update(ing.strip().lower() for ing in ingredients)

# === Core Functions ===

def extract_keywords(user_input: str, cutoff=0.7):
    """Extract symptom keywords using exact, fuzzy, and stemmed matches."""
    user_input_lower = user_input.lower()
    matched = set()

    # Stemmed keyword map for better matching
    stemmed_risk_map = {stemmer.stem(k): k for k in risk_map.keys()}

    # Step 1: Exact substring match
    for symptom in risk_map.keys():
        if symptom in user_input_lower:
            matched.add(symptom)

    # Step 2: Fuzzy match full input
    if not matched:
        close_matches = get_close_matches(user_input_lower, risk_map.keys(), n=3, cutoff=0.6)
        matched.update(close_matches)

    # Step 3: Word-by-word fuzzy + stem match
    if not matched:
        words = re.findall(r'\b\w+\b', user_input_lower)
        for word in words:
            stemmed_word = stemmer.stem(word)

            # Fuzzy match against original keywords
            close = get_close_matches(word, risk_map.keys(), n=1, cutoff=cutoff)
            if close:
                matched.add(close[0])
                continue

            # Match against stemmed keys
            if stemmed_word in stemmed_risk_map:
                matched.add(stemmed_risk_map[stemmed_word])

    return list(matched)



def verify_drug_suggestions(drug_names):
    """Cross-reference recommended drugs with verified product names or ingredients."""
    verified_suggestions = []
    product_names = {drug["product_name"].lower(): drug for drug in verified_drugs}

    for drug_name in drug_names:
        normalized = drug_name.lower().strip()

        # Check if drug_name matches a product name exactly
        if normalized in product_names:
            verified_suggestions.append(product_names[normalized]["product_name"])
            continue

        # Else check if it matches any ingredient substring
        if any(normalized in ing for ing in verified_ingredients):
            verified_suggestions.append(drug_name)

    return verified_suggestions


def calculate_risk(user_input: str):
    """Compute hybrid risk score (out of 100) and suggest drugs based on matched symptoms."""
    matched_keywords = extract_keywords(user_input)

    if not matched_keywords:
        return {
            "risk_score": 0,
            "risk_level": "Low",
            "matched_keywords": [],
            "recommended_drugs": [],
            "verified_recommendations": []
        }

    # Get risk weights for matched keywords
    weights = [risk_map[key].get("risk_weight", 0) for key in matched_keywords if key in risk_map]

    if not weights:
        return {
            "risk_score": 0,
            "risk_level": "Low",
            "matched_keywords": matched_keywords,
            "recommended_drugs": [],
            "verified_recommendations": []
        }

    # === Hybrid Risk Calculation ===
    max_weight = max(weights)
    avg_weight = sum(weights) / len(weights)
    hybrid_score = round((0.7 * max_weight) + (0.3 * avg_weight))
    capped_risk = min(hybrid_score, 100)

    # Determine risk level
    if capped_risk >= 75:
        risk_level = "High"
    elif capped_risk >= 40:
        risk_level = "Moderate"
    else:
        risk_level = "Low"

    # === Suggest Drugs ===
    suggested_drugs = set()

    # Add common drugs from matched keywords
    for key in matched_keywords:
        if key in risk_map:
            suggested_drugs.update(risk_map[key].get("common_drugs", []))

    # Match ingredients from verified drugs
    for drug in verified_drugs:
        ingredients = drug.get("ingredients", [])
        for ing in ingredients:
            if any(word in ing.lower() for word in matched_keywords):
                suggested_drugs.add(drug["product_name"])

    # Final verification of drug suggestions
    verified_recommendations = verify_drug_suggestions(suggested_drugs)

    return {
        "risk_score": capped_risk,
        "risk_level": risk_level,
        "matched_keywords": matched_keywords,
        "recommended_drugs": sorted(suggested_drugs),
        "verified_recommendations": sorted(verified_recommendations)
    }
