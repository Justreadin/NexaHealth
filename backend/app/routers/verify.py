# app/routers/verify.py
from fastapi import APIRouter, HTTPException, Depends
from typing import Dict
from app.models.verify_model import DrugVerificationRequest, DrugVerificationResponse
from app.models.auth_model import UserInDB
from app.core.auth import get_current_active_user
from app.routers.count import increment_user_stat
from app.core.db import db
from app.core.verify_engine import DrugVerificationEngine
import logging

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/verify", tags=["Drug Verification"])

# Lazy-initialized engine
engine: DrugVerificationEngine = None

async def get_engine() -> DrugVerificationEngine:
    """
    Lazy-load the DrugVerificationEngine to avoid long startup times
    and Firestore timeouts for large datasets.
    """
    global engine
    if engine is None:
        logger.info("Initializing DrugVerificationEngine with Firestore drugs (lazy load)...")
        drugs = []
        batch_size = 1000  # smaller batches for large collections
        last_doc = None

        while True:
            query = db.collection("drugs").order_by("nexahealth_id").limit(batch_size)
            if last_doc:
                query = query.start_after(last_doc)
            docs = list(query.stream())

            if not docs:
                break

            for doc in docs:
                drugs.append(doc.to_dict())

            last_doc = docs[-1]

            # Avoid memory overload if dataset is huge
            if len(drugs) >= 10000:  # configurable max
                logger.warning("Loaded 10k drugs, stopping batch load to prevent memory issues")
                break

        engine = DrugVerificationEngine(drug_db=drugs)
        logger.info(f"Loaded {len(drugs)} drugs into engine.")
    return engine

@router.post("/drug", response_model=DrugVerificationResponse)
async def verify_drug(
    request: DrugVerificationRequest,
    current_user: UserInDB = Depends(get_current_active_user)
):
    try:
        logger.info(f"Drug verification request by user: {current_user.email}")
        request_dict = request.dict()

        # Lazy-load engine
        engine_instance = await get_engine()

        # Run verification
        result = engine_instance.verify_drug(request_dict)

        try:
            increment_user_stat(current_user.id, "verifications")
        except Exception:
            logger.exception("Failed to increment verification stat")

        return result

    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Verification error")
        raise HTTPException(
            status_code=500,
            detail=f"Drug verification failed: {str(e)}"
        )
