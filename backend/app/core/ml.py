import pandas as pd
import spacy
import re
import json
import os
from typing import Dict, List, Optional, Any, Tuple, Set, DefaultDict
from difflib import get_close_matches
from functools import lru_cache
from negspacy.negation import Negex
from transformers import pipeline
from pathlib import Path
from collections import defaultdict
from rapidfuzz import fuzz, process

# Initialize NLP models
nlp = spacy.load("en_core_web_sm")
nlp.add_pipe("negex")  # Add negation detection

# Lazy-loaded zero-shot model
_zero_shot_model: Optional[Any] = None


# --- Data Loading with Caching ---
@lru_cache(maxsize=1)
def load_risk_data() -> Dict[str, Dict[str, Any]]:
    BASE_DIR = Path(__file__).parent.parent
    risk_df = pd.read_csv(BASE_DIR / "data" / "keyword_risk_map.csv")
    risk_df["symptom_keyword"] = risk_df["symptom_keyword"].str.lower().str.strip()

    # Merge with MeSH terms
    mesh_df = pd.read_csv(BASE_DIR / "data" / "MeSH.csv")
    mesh_terms = mesh_df['standard_term'].unique()

    # Ensure all MeSH terms are in risk_map
    for term in mesh_terms:
        if term not in risk_df['symptom_keyword'].values:
            risk_df = pd.concat([risk_df, pd.DataFrame([{
                'symptom_keyword': term,
                'risk_weight': 30,  # Default weight
                'common_drugs': ''
            }])], ignore_index=True)

    risk_df['common_drugs'] = risk_df['common_drugs'].apply(
        lambda x: [drug.strip() for drug in x.split(",")] if pd.notna(x) and isinstance(x, str) else []
    )

    return {
        row["symptom_keyword"]: {
            "risk_weight": row["risk_weight"],
            "common_drugs": row["common_drugs"]
        }
        for _, row in risk_df.iterrows()
    }


@lru_cache(maxsize=1)
def load_verified_drugs() -> List[Dict[str, Any]]:
    BASE_DIR = Path(__file__).parent.parent
    with open(BASE_DIR / "data" / "verified_drugs.json", "r", encoding="utf-8") as f:
        return json.load(f)


risk_map = load_risk_data()
verified_drugs = load_verified_drugs()


# --- Cached NLP Functions ---
@lru_cache(maxsize=1000)
def get_doc(text: str) -> Any:
    return nlp(text.lower())


@lru_cache(maxsize=1)
def load_mesh_synonyms() -> Dict[str, List[str]]:
    BASE_DIR = Path(__file__).parent.parent
    try:
        df = pd.read_csv(BASE_DIR / "data" / "MeSH.csv")
        synonym_map = defaultdict(list)
        for _, row in df.iterrows():
            # Handle NaN/float values safely
            if pd.isna(row['local_synonyms']):
                continue
            synonyms = [s.strip() for s in str(row['local_synonyms']).split(",")]
            synonym_map[row['standard_term']].extend(synonyms)
        return dict(synonym_map)
    except FileNotFoundError:
        return {}


@lru_cache(maxsize=1)
def load_reverse_synonyms() -> Dict[str, str]:
    mesh = load_mesh_synonyms()
    reverse_map = {}
    for term, synonyms in mesh.items():
        for syn in synonyms:
            if syn:  # Only add non-empty strings
                reverse_map[syn] = term
    return reverse_map


@lru_cache(maxsize=1000)
def preprocess_nigerian_english(text: str) -> str:
    """Convert common Nigerian English phrases to standard medical terms"""
    replacements = {
        "dey pain me": "pain",
        "wahala": "problem",
        "belle": "stomach",
        "catarrh": "cough",
        "running stomach": "diarrhea"
    }
    text = text.lower()
    for local, standard in replacements.items():
        text = text.replace(local, standard)
    return text


@lru_cache(maxsize=1000)
def extract_context(text: str) -> Dict[str, Optional[str]]:
    """Extract duration and severity with caching"""
    doc = get_doc(text)
    context = {"duration": None, "severity": None}

    # Duration detection
    for token in doc:
        if token.text in ["for", "since"] and token.i + 2 < len(doc):
            phrase = f"{token.text} {doc[token.i + 1].text} {doc[token.i + 2].text}"
            if any(unit in phrase for unit in ["day", "week", "month", "year"]):
                context["duration"] = phrase

    # Severity detection
    severity_terms = ["severe", "acute", "chronic", "intense", "mild", "moderate"]
    for term in severity_terms:
        if term in text.lower():
            context["severity"] = term
            break

    return context


@lru_cache(maxsize=1000)
def extract_keywords(user_input: str) -> List[str]:
    user_input = preprocess_nigerian_english(user_input)
    doc = get_doc(user_input)
    matched: Set[str] = set()
    reverse_synonyms = load_reverse_synonyms()
    input_lower = user_input.lower()
    mesh_synonyms = load_mesh_synonyms()

    # 1. First check for complete phrase matches from MeSH
    for term, synonyms in mesh_synonyms.items():
        # Check if any complete synonym phrase exists in input
        for syn in synonyms:
            if ' ' in syn and syn in input_lower:  # Only multi-word phrases
                matched.add(term)
                break  # No need to check other synonyms for this term

    # 2. Check standard terms and single-word synonyms
    for term, synonyms in mesh_synonyms.items():
        if term in input_lower and term not in matched:
            matched.add(term)

        for syn in synonyms:
            if syn in input_lower and ' ' not in syn:  # Single word synonyms
                matched.add(term)

    # 3. Check noun chunks against reverse synonyms
    for chunk in doc.noun_chunks:
        chunk_text = chunk.text.lower()
        if chunk_text in reverse_synonyms:
            matched.add(reverse_synonyms[chunk_text])
        elif chunk_text in risk_map:
            matched.add(chunk_text)

    # 4. Fuzzy matching fallback with adjusted scoring
    if not matched:
        # First try fuzzy matching with complete input
        def phrase_scorer(s1: str, s2: str, **kwargs: Any) -> float:
            return fuzz.token_set_ratio(s1, s2, **kwargs)

        # Check against all MeSH terms and synonyms
        all_phrases = []
        for term, synonyms in mesh_synonyms.items():
            all_phrases.append(term)
            all_phrases.extend(synonyms)

        phrase_matches = process.extract(
            user_input,
            all_phrases,
            scorer=phrase_scorer,
            score_cutoff=70.0  # Higher threshold for phrases
        )

        for match, score, _ in phrase_matches:
            if score >= 70:
                # Find which standard term this synonym belongs to
                for term, synonyms in mesh_synonyms.items():
                    if match == term or match in synonyms:
                        matched.add(term)
                        break

        # If still no matches, try individual tokens
        if not matched:
            def word_scorer(s1: str, s2: str, **kwargs: Any) -> float:
                return fuzz.token_set_ratio(s1, s2, **kwargs)

            for token in doc:
                if token.is_alpha and not token.is_stop:
                    token_text = token.text.lower()
                    results = process.extract(
                        token_text,
                        list(risk_map.keys()),
                        scorer=word_scorer,
                        score_cutoff=50.0
                    )
                    for match, score, _ in results:
                        if score >= 50:
                            matched.add(match)

    return list(matched)


def calculate_risk(user_input: str) -> Dict[str, Any]:
    """Enhanced risk calculation with all features"""
    keywords = extract_keywords(user_input)
    context = extract_context(user_input)

    # Negation handling
    doc = get_doc(user_input)
    negated = [e.text for e in doc.ents if e._.negex]
    valid_keywords = [k for k in keywords if not any(n in k for n in negated)]

    # Zero-shot fallback if no matches
    if not valid_keywords and len(user_input.split()) > 2:
        global _zero_shot_model
        if _zero_shot_model is None:
            _zero_shot_model = pipeline(
                "zero-shot-classification",
                model="distilbert-base-uncased"
            )
        result = _zero_shot_model(user_input, list(risk_map.keys())[:50])
        if result['scores'][0] > 0.7:
            valid_keywords.append(result['labels'][0])

    # Calculate risk scores
    max_risk = 0
    suggested_drugs: Set[str] = set()

    for keyword in valid_keywords:
        if keyword not in risk_map:
            continue

        weight = int(risk_map[keyword]["risk_weight"])

        # Apply context multipliers
        if context["duration"] and ("week" in context["duration"] or "month" in context["duration"]):
            weight = int(weight * 1.5)
        if context["severity"] in ["severe", "acute"]:
            weight = int(weight * 1.8)

        weight = min(weight, 100)
        max_risk = max(max_risk, weight)
        suggested_drugs.update(risk_map[keyword].get("common_drugs", []))

    # Prepare output
    risk_level = "High" if max_risk >= 80 else "Moderate" if max_risk >= 50 else "Low"

    return {
        "risk_score": max_risk,
        "risk_level": risk_level,
        "matched_keywords": valid_keywords,
        "negated_symptoms": negated,
        "suggested_drugs": [
            {
                "name": drug["product_name"],
                "dosage_form": drug.get("dosage_form", "N/A"),
                "use_case": f"Treats {keyword}"
            }
            for drug in verified_drugs
            if drug["product_name"] in suggested_drugs
        ]
    }