# app/routers/count.py
from fastapi import APIRouter, Depends, Query
from app.models.auth_model import UserInDB
from app.core.auth import get_current_active_user
from app.core.db import stats_collection, firestore
from datetime import datetime, date
from typing import Optional, Dict
import logging

router = APIRouter(prefix="/api/stats", tags=["Statistics"])
logger = logging.getLogger(__name__)

def _today_str() -> str:
    return datetime.utcnow().date().isoformat()

def get_user_stat_count(user_id: str, stat_name: str, period: Optional[str] = "day") -> Dict:
    """
    Return dictionary: { total: int, today: int, period_count: int }
    """
    try:
        if not user_id:
            return {"total": 0, "today": 0, "period_count": 0}

        total_key = f"{stat_name}_{user_id}"
        today_key = f"{stat_name}_{user_id}_{_today_str()}"

        total_doc = stats_collection.document(total_key).get()
        today_doc = stats_collection.document(today_key).get()

        total = total_doc.to_dict().get("count", 0) if total_doc.exists else 0
        today = today_doc.to_dict().get("count", 0) if today_doc.exists else 0

        # period_count - simple fallback same as today for 'day'
        period_count = today
        return {"total": total, "today": today, "period_count": period_count}
    except Exception as e:
        logger.exception("get_user_stat_count error")
        return {"total": 0, "today": 0, "period_count": 0, "error": str(e)}

def increment_user_stat(user_id: Optional[str], stat_name: str) -> None:
    """
    Increment stat counters for the given user:
      - total doc key: <stat>_<user_id>
      - daily doc key: <stat>_<user_id>_YYYY-MM-DD
    This function is resilient: if user_id is None (e.g., anonymous), it silently returns.
    """
    try:
        if not user_id:
            # don't record stats for anonymous actions
            return

        total_key = f"{stat_name}_{user_id}"
        today_key = f"{stat_name}_{user_id}_{_today_str()}"

        # Simple non-atomic increment: read -> increment -> write.
        # If you want atomic increments, replace with firestore.FieldValue.increment
        # (example commented below).
        #
        # Example atomic (if available):
        # stats_collection.document(total_key).update({ "count": firestore.Increment(1) })
        # stats_collection.document(today_key).update({ "count": firestore.Increment(1) })
        #
        # But we use read/write for compatibility.

        # Total
        total_doc_ref = stats_collection.document(total_key)
        total_doc = total_doc_ref.get()
        if total_doc.exists:
            current = total_doc.to_dict().get("count", 0)
            total_doc_ref.set({"count": current + 1}, merge=True)
        else:
            total_doc_ref.set({"count": 1})

        # Today
        today_doc_ref = stats_collection.document(today_key)
        today_doc = today_doc_ref.get()
        if today_doc.exists:
            current = today_doc.to_dict().get("count", 0)
            today_doc_ref.set({"count": current + 1}, merge=True)
        else:
            today_doc_ref.set({"count": 1})

    except Exception as e:
        logger.exception(f"Failed to increment stat {stat_name} for user {user_id}: {str(e)}")

# --- Routes (read-only endpoints) ---
def calculate_period_start(period: str):
    # For now keep minimal; the endpoints that call get_user_stat_count only use day today.
    from datetime import timedelta
    today = datetime.utcnow().date()
    if period == "day":
        return today
    elif period == "week":
        return today - timedelta(days=7)
    elif period == "month":
        return today - timedelta(days=30)
    elif period == "year":
        return today - timedelta(days=365)
    return None

@router.get("/verification-count")
async def get_verification_count(current_user: UserInDB = Depends(get_current_active_user), period: Optional[str] = Query("day")):
    try:
        return get_user_stat_count(current_user.id, "verifications", period)
    except Exception as e:
        logger.exception("verification-count error")
        return {"total": 0, "today": 0, "error": str(e)}

@router.get("/report-count")
async def get_report_count(current_user: UserInDB = Depends(get_current_active_user), period: Optional[str] = Query("day")):
    try:
        return get_user_stat_count(current_user.id, "reports", period)
    except Exception as e:
        logger.exception("report-count error")
        return {"total": 0, "today": 0, "error": str(e)}

@router.get("/referred-pharmacies-count")
async def get_referred_pharmacies_count(current_user: UserInDB = Depends(get_current_active_user), period: Optional[str] = Query("day")):
    try:
        return get_user_stat_count(current_user.id, "referred_pharmacies", period)
    except Exception as e:
        logger.exception("referred-pharmacies-count error")
        return {"total": 0, "today": 0, "error": str(e)}
