# diagnosis_model.py
from pydantic import BaseModel
from typing import List

class SymptomInput(BaseModel):
    symptoms: str

class SuggestedDrug(BaseModel):
    name: str
    dosage_form: str
    use_case: str

class DiagnosisResponse(BaseModel):
    match_symptoms: List[str]
    diagnosis_type: str  # e.g. "risk", "infection", "mental health"
    result: str          # e.g. "High Risk"
    score: int
    matched_keywords: List[str]
    suggested_drugs: List[SuggestedDrug]
