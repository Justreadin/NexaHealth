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
import json
import hashlib

router = APIRouter(
    prefix="/api/verify",
    tags=["Drug Verification"],
    responses={404: {"description": "Not found"}}
)

logger = logging.getLogger(__name__)
DRUG_DB_FILE = Path(__file__).parent.parent / "data" / "unified_drugs_with_pils_v3.json"

# Global engine
verification_engine: DrugVerificationEngine = None

def get_verification_engine() -> DrugVerificationEngine:
    """Initialize or return the existing engine (singleton)."""
    global verification_engine
    if verification_engine is None:
        logger.info("Loading drug database into memory...")
        with open(DRUG_DB_FILE, 'r', encoding='utf-8') as f:
            drug_db = json.load(f)  # Load once at startup
        verification_engine = DrugVerificationEngine(drug_db)
        logger.info("DrugVerificationEngine initialized with all records.")
    return verification_engine

def make_cache_key(request_dict: Dict) -> str:
    """Create a consistent hash key for LRU cache."""
    request_str = json.dumps(request_dict, sort_keys=True)
    return hashlib.sha256(request_str.encode("utf-8")).hexdigest()

# LRU cache for repeated lookups
@lru_cache(maxsize=10000)
def cached_verify_drug(request_hash: str, request_dict: Dict) -> Dict:
    engine = get_verification_engine()
    return engine.verify_drug(request_dict)

@router.post("/drug", response_model=DrugVerificationResponse)
async def verify_drug(
    request: DrugVerificationRequest,
    current_user: UserInDB = Depends(get_current_active_user)
):
    try:
        logger.info(f"Drug verification request by user: {current_user.email}")
        request_dict = request.dict()

        # Generate cache key
        cache_key = make_cache_key(request_dict)
        result = cached_verify_drug(cache_key, request_dict)

        await increment_stat_counter("verifications")
        return DrugVerificationResponse(**result)

    except Exception as e:
        logger.exception("Verification error")
        raise HTTPException(
            status_code=500,
            detail=f"Drug verification failed: {str(e)}"
        )
