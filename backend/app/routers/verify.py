# app/routers/verify.py
from fastapi import APIRouter, HTTPException, Depends
from typing import Optional, List, Dict
import json
from pathlib import Path
from app.models.verify_model import DrugVerificationRequest, DrugVerificationResponse
from app.models.auth_model import UserInDB
from app.core.auth import get_current_active_user
from app.core.verify_engine import DrugVerificationEngine
from app.routers.count import increment_stat_counter
import logging

router = APIRouter(
    prefix="/api/verify",
    tags=["Drug Verification"],
    responses={404: {"description": "Not found"}}
)

logger = logging.getLogger(__name__)

DRUG_DB_FILE = Path(__file__).parent.parent / "data" / "unified_drugs_with_pils_v3.json"

# Initialize verification_engine as None
verification_engine = None

def get_verification_engine():
    global verification_engine
    if verification_engine is None:
        logger.info("Loading drug database...")
        with open(DRUG_DB_FILE, encoding="utf-8") as f:
            drug_db = json.load(f)
        verification_engine = DrugVerificationEngine(drug_db)
    return verification_engine

@router.post("/drug", response_model=DrugVerificationResponse)
async def verify_drug(
    request: DrugVerificationRequest,
    current_user: UserInDB = Depends(get_current_active_user)
):
    try:
        logger.info(f"Drug verification request by user: {current_user.email}")
        request_dict = request.dict()

        engine = get_verification_engine()
        result = engine.verify_drug(request_dict)
        await increment_stat_counter("verifications")
        
        return DrugVerificationResponse(**result)
        
    except Exception as e:
        logger.exception("Verification error")
        raise HTTPException(status_code=500, detail=f"Drug verification failed: {str(e)}")
