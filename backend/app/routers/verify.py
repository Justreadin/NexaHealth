# app/routers/verify.py
from fastapi import APIRouter, HTTPException, Depends
from typing import Dict
from app.models.verify_model import DrugVerificationRequest, DrugVerificationResponse
from app.models.auth_model import UserInDB
from app.core.auth import get_current_active_user
from app.routers.count import increment_stat_counter
import logging
import json
import hashlib
from functools import lru_cache

# Firestore
import firebase_admin
from firebase_admin import credentials, firestore

router = APIRouter(
    prefix="/api/verify",
    tags=["Drug Verification"],
    responses={404: {"description": "Not found"}}
)

logger = logging.getLogger(__name__)

# 🔑 Initialize Firestore
cred = credentials.Certificate(
    r"C:\Users\USER\PycharmProjects\NexaHealth_Live\backend\app\core\firebase_key.json"
)
firebase_admin.initialize_app(cred)
db = firestore.client()

def make_cache_key(request_dict: Dict) -> str:
    """Create a consistent hash key for LRU cache."""
    request_str = json.dumps(request_dict, sort_keys=True)
    return hashlib.sha256(request_str.encode("utf-8")).hexdigest()

# 🔎 Firestore lookup function
def lookup_drug_in_firestore(request_dict: Dict) -> Dict:
    """Query Firestore for a matching drug."""
    name = request_dict.get("name", "").strip()
    ingredient = request_dict.get("ingredient", "").strip()

    query = db.collection("drugs")

    # Prefer drug name search if available
    if name:
        query = query.where("name", "==", name)
    elif ingredient:
        query = query.where("ingredient", "==", ingredient)
    else:
        raise HTTPException(status_code=400, detail="Drug name or ingredient required.")

    docs = list(query.stream())

    if not docs:
        raise HTTPException(status_code=404, detail="Drug not found.")

    return docs[0].to_dict()  # return first match

# LRU cache for repeated lookups
@lru_cache(maxsize=10000)
def cached_verify_drug(request_hash: str, request_dict: Dict) -> Dict:
    return lookup_drug_in_firestore(request_dict)

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

    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Verification error")
        raise HTTPException(
            status_code=500,
            detail=f"Drug verification failed: {str(e)}"
        )
