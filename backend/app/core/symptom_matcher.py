import pandas as pd
from rapidfuzz import fuzz, process
from pathlib import Path
import spacy
from negspacy.negation import Negex
from transformers import pipeline
import re
from functools import lru_cache
from .ml import load_reverse_synonyms, load_mesh_synonyms
from typing import List, Dict, Optional, Any, Tuple, Set, DefaultDict
from collections import defaultdict

# Initialize NLP pipeline with negation detection
nlp = spacy.load("en_core_web_sm")
nlp.add_pipe("negex")

# Lazy-loaded zero-shot model
_zero_shot_model: Optional[Any] = None


# --- Cached Data Loading ---
@lru_cache(maxsize=1)
def load_symptom_data() -> Tuple[pd.DataFrame, List[str]]:
    DATA_PATH = Path(__file__).parent.parent / "data" / "keyword_risk_map.csv"
    df = pd.read_csv(DATA_PATH)

    # Properly parse the common_drugs column
    df['common_drugs'] = df['common_drugs'].apply(
        lambda x: [drug.strip() for drug in x.split(",")] if pd.notna(x) and isinstance(x, str) else []
    )

    return df, df['symptom_keyword'].tolist()


df_symptoms, symptom_list = load_symptom_data()


# --- Cached NLP Processing ---
@lru_cache(maxsize=1000)
def get_doc(text: str) -> Any:
    return nlp(text.lower())


@lru_cache(maxsize=1000)
def extract_duration(text: str) -> Optional[str]:
    doc = get_doc(text)
    for token in doc:
        if token.text in ["for", "since", "over"] and token.i + 2 < len(doc):
            phrase = f"{token.text} {doc[token.i + 1].text} {doc[token.i + 2].text}"
            if any(unit in phrase for unit in ["day", "week", "month", "year"]):
                return phrase
    return None


@lru_cache(maxsize=1000)
def detect_severity(text: str) -> Optional[str]:
    doc = get_doc(text)
    severity_terms = ["severe", "acute", "chronic", "intense", "mild", "moderate"]
    for term in severity_terms:
        if term in text.lower():
            for token in doc:
                if token.text == term and token.head.text in symptom_list:
                    return term
    return None


def get_symptom_data(symptom: str, user_input: str) -> Optional[Dict[str, Any]]:
    try:
        # Convert to lowercase to ensure case-insensitive matching
        symptom_lower = symptom.lower()
        matches = df_symptoms[df_symptoms['symptom_keyword'].str.lower() == symptom_lower]

        if len(matches) == 0:
            print(f"Warning: No matching symptom found for: {symptom}")  # Debug print
            return None

        row = matches.iloc[0]
        return {
            **row.to_dict(),
            "duration": extract_duration(user_input),
            "severity": detect_severity(user_input)
        }
    except Exception as e:
        print(f"Error getting symptom data for {symptom}: {str(e)}")  # Debug print
        return None


@lru_cache(maxsize=1000)
def match_symptom(user_input: str, threshold: int = 50) -> Optional[Dict[str, Any]]:
    try:
        doc = get_doc(user_input)
        if any(e._.negex for e in doc.ents):
            return None

        input_lower = user_input.lower()
        reverse_synonyms = load_reverse_synonyms()

        # 1. Check direct matches and synonyms first
        for term in symptom_list:
            if term.lower() in input_lower:
                result = get_symptom_data(term, user_input)
                if result:  # Only return if valid data was found
                    return result

        # Check reverse synonym mapping
        for syn, term in reverse_synonyms.items():
            if syn.lower() in input_lower:
                result = get_symptom_data(term, user_input)
                if result:
                    return result

        # 2. Try fuzzy matching
        def scorer(s1: str, s2: str, **kwargs: Any) -> float:
            return fuzz.token_set_ratio(s1, s2, **kwargs)

        match = process.extractOne(
            user_input,
            symptom_list,
            scorer=scorer,
            score_cutoff=float(threshold)
        )

        if match and match[1] >= threshold:
            result = get_symptom_data(match[0], user_input)
        if result:
            return result

        return None
    except Exception as e:
        print(f"Error matching symptom: {str(e)}")  # Debug print
        return None

# --- Diagnosis Function ---
def diagnose(symptoms: List[str]) -> Dict[str, Any]:
    matched: List[Dict[str, Any]] = []
    max_risk = 0
    negated: List[str] = []

    for symptom in symptoms:
        res = match_symptom(symptom)
        if not res:
            continue

        doc = get_doc(symptom)
        if any(e._.negex for e in doc.ents):
            negated.append(symptom)
            continue

        risk = int(res['risk_weight'])
        duration = res.get("duration", "")
        severity = res.get("severity", "")

        if duration and ("week" in duration or "month" in duration):
            risk *= 1.5
        if severity in ["severe", "acute"]:
            risk *= 1.8
        risk = min(risk, 100)

        clean_drugs: List[str] = [d.strip() for d in res['common_drugs']] if res['common_drugs'] and isinstance(
            res['common_drugs'], list) else []
        clean_drugs = [d for d in clean_drugs if len(d) > 1]

        matched.append({
            "input": symptom,
            "matched_symptom": res['symptom_keyword'],
            "risk_weight": risk,
            "common_drugs": clean_drugs,
            "duration": duration,
            "severity": severity
        })
        max_risk = max(max_risk, risk)

    risk_level = "High" if max_risk >= 80 else "Moderate" if max_risk >= 50 else "Low"

    return {
        "highest_risk_score": max_risk,
        "risk_level": risk_level,
        "recommendation": (
            "Seek emergency care." if risk_level == "High"
            else "See a doctor within 24 hours." if risk_level == "Moderate"
            else "Monitor symptoms."
        ),
        "matched_symptoms": matched,
        "negated_symptoms": negated
    }