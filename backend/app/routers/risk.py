from app.models.guest_model import GuestSession
from fastapi import APIRouter, Depends, HTTPException, status, Request, Cookie, Response, Header
from app.core.symptom_matcher import diagnose
from app.models.risk_model import SymptomInput, SuggestedDrug, RiskPredictionResponse
from app.dependencies.auth import guest_or_auth
from functools import lru_cache
import json
from pathlib import Path
from datetime import datetime
from uuid import UUID
from typing import Optional
from app.core.guest import (
    load_guest_session,
    increment_guest_usage,
    MAX_GUEST_TRIALS
)
from fastapi.responses import JSONResponse

router = APIRouter()

@lru_cache(maxsize=1)
def load_verified_drugs():
    drugs_file = Path(__file__).parent.parent.parent / "app" / "data" / "verified_drugs.json"
    with open(drugs_file, "r") as f:
        return json.load(f)

def get_suggested_drugs(result, verified_drugs):
    suggested_drugs = []
    processed_drugs = set()
    for symptom in result["matched_symptoms"]:
        for drug_name in symptom["common_drugs"]:
            clean_name = drug_name.strip()
            if not clean_name or len(clean_name) <= 1 or clean_name.lower() in processed_drugs:
                continue
            processed_drugs.add(clean_name.lower())
            match = next(
                (d for d in verified_drugs if d["product_name"].lower() == clean_name.lower()),
                None
            )
            suggested_drugs.append(
                SuggestedDrug(
                    name=match["product_name"] if match else clean_name,
                    dosage_form=match.get("dosage_form", "N/A") if match else "N/A",
                    use_case=f"Treats {symptom['matched_symptom']}" if match else f"May help with {symptom['matched_symptom']}"
                )
            )
    return suggested_drugs

@router.post("/predict-risk", response_model=RiskPredictionResponse)
async def predict_risk(
    request: SymptomInput,
    auth_state: tuple = Depends(guest_or_auth(max_uses=5, feature_name="risk_assessment")),
    guest_session_id: Optional[UUID] = Cookie(None, alias="guest_session_id"),
    x_guest_session: Optional[str] = Header(None),
    request_client: Request = None,
    response: Response = None
):
    try:
        current_session_id = guest_session_id or (UUID(x_guest_session)) if x_guest_session else None
    except ValueError as e:
        print(f"Invalid session ID format: {e}")
        response.status_code = status.HTTP_401_UNAUTHORIZED
        return {"detail": "Invalid session format"}

    print(f"Received predict-risk request with session: {current_session_id}")
    
    is_authenticated, identity = auth_state

    if is_authenticated:
        response.delete_cookie("guest_session_id")
        verified_drugs = load_verified_drugs()
        result = diagnose([request.symptoms])

        return RiskPredictionResponse(
            risk=result["risk_level"],
            risk_score=result["highest_risk_score"],
            matched_keywords=[s["matched_symptom"] for s in result["matched_symptoms"]],
            suggested_drugs=get_suggested_drugs(result, verified_drugs)
        )

    guest_session: GuestSession = identity
    current_session_id = guest_session.id

    try:
        increment_guest_usage(current_session_id)
        updated_session = load_guest_session(current_session_id)
    except Exception as e:
        print(f"Failed to increment guest usage: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error updating usage count"
        )

    try:
        verified_drugs = load_verified_drugs()
        result = diagnose([request.symptoms])
        suggested_drugs = get_suggested_drugs(result, verified_drugs)
    except Exception as e:
        print(f"Error processing symptoms: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error analyzing symptoms"
        )

    remaining_trials = MAX_GUEST_TRIALS - updated_session.request_count
    return RiskPredictionResponse(
        risk=result["risk_level"],
        risk_score=result["highest_risk_score"],
        matched_keywords=[s["matched_symptom"] for s in result["matched_symptoms"]],
        suggested_drugs=suggested_drugs,
        meta={
            "guest_session": True,
            "remaining_trials": remaining_trials,
            "max_trials": MAX_GUEST_TRIALS,
            "upgrade_message": (
                f"{remaining_trials} free checks remaining"
                if remaining_trials > 0
                else "Sign up to continue using symptom checker"
            )
        }
    )
