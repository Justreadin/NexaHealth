# app/routers/verify.py
from fastapi import APIRouter, HTTPException, Depends
from typing import Dict
from pathlib import Path
from app.models.verify_model import DrugVerificationRequest, DrugVerificationResponse
from app.models.auth_model import UserInDB
from app.core.auth import get_current_active_user
from app.core.verify_engine import DrugVerificationEngine
from app.routers.count import increment_stat_counter
import logging
from functools import lru_cache
import ijson

router = APIRouter(
    prefix="/api/verify",
    tags=["Drug Verification"],
    responses={404: {"description": "Not found"}}
)

logger = logging.getLogger(__name__)
DRUG_DB_FILE = Path(__file__).parent.parent / "data" / "unified_drugs_with_pils_v3.json"

# Global engine
verification_engine = None

def stream_drugs(file_path: Path):
    """Stream drugs one by one from JSON using ijson."""
    with open(file_path, 'r', encoding='utf-8') as f:
        for drug in ijson.items(f, 'item'):
            yield drug

def get_verification_engine():
    """Initialize or return the existing engine (lazy load)."""
    global verification_engine
    if verification_engine is None:
        logger.info("Loading drug database (streaming)...")
        drug_iter = stream_drugs(DRUG_DB_FILE)
        verification_engine = DrugVerificationEngine(drug_iter)
        logger.info("DrugVerificationEngine initialized.")
    return verification_engine

# LRU cache for repeated lookups by request dict
@lru_cache(maxsize=10000)
def cached_verify_drug(request_key: str) -> Dict:
    """Cache results for repeated queries."""
    engine = get_verification_engine()
    # Use eval safely because we control the input (string from str(dict))
    return engine.verify_drug(eval(request_key))

@router.post("/drug", response_model=DrugVerificationResponse)
async def verify_drug(
    request: DrugVerificationRequest,
    current_user: UserInDB = Depends(get_current_active_user)
):
    try:
        logger.info(f"Drug verification request by user: {current_user.email}")
        request_dict = request.dict()

        # Convert dict to string for caching
        request_key = str(request_dict)
        result = cached_verify_drug(request_key)

        await increment_stat_counter("verifications")
        return DrugVerificationResponse(**result)
        
    except Exception as e:
        logger.exception("Verification error")
        raise HTTPException(status_code=500, detail=f"Drug verification failed: {str(e)}")
