from pydantic import BaseModel
from typing import List, Optional

class SuggestedDrug(BaseModel):
    name: str
    dosage_form: str
    use_case: str

class SymptomInput(BaseModel):
    symptoms: str

class RiskPredictionResponse(BaseModel):
    matched_keywords: Optional[List[str]] = []
    risk: str
    risk_score: int
    suggested_drugs: List[SuggestedDrug]



