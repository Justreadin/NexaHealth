import pandas as pd
from rapidfuzz import fuzz, process
from pathlib import Path

# Load symptom CSV once on import
DATA_PATH = Path(__file__).parent.parent / "data" / "symptom_data.csv"
df_symptoms = pd.read_csv(DATA_PATH)

symptom_list = df_symptoms['symptom_keyword'].tolist()

def match_symptom(user_input: str, threshold=60):
    """
    Fuzzy match a user symptom input to the known symptoms.
    Returns matched symptom row or None if no good match found.
    """
    match = process.extractOne(user_input, symptom_list, scorer=fuzz.token_sort_ratio)
    if match and match[1] >= threshold:
        matched_symptom = match[0]
        row = df_symptoms[df_symptoms['symptom_keyword'] == matched_symptom].iloc[0]
        return row
    return None

def diagnose(symptoms: list):
    """
    Given a list of symptoms (str), returns matched symptoms, total risk, level, and recommendations.
    """
    matched = []
    total_risk = 0

    for symptom in symptoms:
        res = match_symptom(symptom)
        if res is not None:
            matched.append({
                "input": symptom,
                "matched_symptom": res['symptom_keyword'],
                "risk_weight": int(res['risk_weight']),
                "common_drugs": res['common_drugs']
            })
            total_risk += int(res['risk_weight'])

    risk_level = "Low"
    recommendation = "Take over-the-counter drugs and monitor symptoms."

    if total_risk >= 90:
        risk_level = "High"
        recommendation = "Visit a clinic immediately."
    elif total_risk >= 50:
        risk_level = "Moderate"
        recommendation = "See a doctor soon."

    return {
        "total_risk_score": total_risk,
        "risk_level": risk_level,
        "recommendation": recommendation,
        "matched_symptoms": matched
    }
