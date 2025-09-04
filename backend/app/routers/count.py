# app/routers/count.py (or wherever your stats router lives)
from fastapi import APIRouter, Depends
from app.models.auth_model import UserInDB
from app.core.auth import get_current_active_user
from app.core.db import stats_collection, firestore, get_server_timestamp
from datetime import datetime, timedelta
from typing import Optional
import logging

router = APIRouter(
    prefix="/api/stats",
    tags=["Statistics"],
    responses={404: {"description": "Not found"}}
)

logger = logging.getLogger(__name__)


async def increment_stat_counter(stat_name: str, increment: int = 1) -> None:
    """Helper function to increment a stat counter"""
    try:
        today = datetime.utcnow().date()

        # Update total document (e.g. "verifications" or "reports")
        stats_collection.document(stat_name).update({
            "count": firestore.Increment(increment),
            "last_updated": datetime.utcnow()
        })

        # Update daily document (e.g. "verifications_2025-08-25")
        daily_doc_id = f"{stat_name}_{today.isoformat()}"
        daily_doc_ref = stats_collection.document(daily_doc_id)
        if not daily_doc_ref.get().exists:
            daily_doc_ref.set({
                "count": increment,
                "date": today.isoformat(),
                "created_at": firestore.SERVER_TIMESTAMP,
                "last_updated": firestore.SERVER_TIMESTAMP
            }, merge=True)
        else:
            daily_doc_ref.update({
                "count": firestore.Increment(increment),
                "last_updated": datetime.utcnow()
            })

    except Exception as e:
        logger.exception(f"Failed to increment {stat_name} counter: {str(e)}")


def calculate_period_start(period: str) -> Optional[datetime.date]:
    """Calculate start date based on period string"""
    today = datetime.utcnow().date()
    if not period:
        return None
    period = period.lower()
    if period == "day":
        return today
    if period == "week":
        return today - timedelta(days=7)
    if period == "month":
        return today - timedelta(days=30)
    if period == "year":
        return today - timedelta(days=365)
    if period == "all":
        return None
    return None


@router.get("/verification-count")
async def get_verification_count(
    current_user: UserInDB = Depends(get_current_active_user),
    period: Optional[str] = None
):
    """
    Get verification statistics with optional time period filter.
    - period == 'day' (default): returns today's and total counts
    - period in (week|month|year): returns aggregated period_count (sum of daily docs)
    - period == 'all': returns total only (period_count omitted)
    """
    try:
        stats = {"total": 0, "today": 0, "period": period}

        # Total count (aggregate)
        total_doc = stats_collection.document("verifications").get()
        if total_doc.exists:
            stats["total"] = int(total_doc.to_dict().get("count", 0))

        # Today's count doc
        today = datetime.utcnow().date()
        today_doc = stats_collection.document(f"verifications_{today.isoformat()}").get()
        if today_doc.exists:
            stats["today"] = int(today_doc.to_dict().get("count", 0))

        # If user requested a multi-day period (week/month/year), sum daily docs
        if period and period.lower() != "day" and period.lower() != "all":
            start_date = calculate_period_start(period)
            if start_date:
                # Query daily docs that have 'date' between start_date and today
                start_iso = start_date.isoformat()
                end_iso = today.isoformat()

                # Correct usage: .where(field, op, value)
                query = stats_collection.where("date", ">=", start_iso).where("date", "<=", end_iso)

                period_count = 0
                for doc in query.stream():
                    try:
                        period_count += int(doc.to_dict().get("count", 0))
                    except Exception:
                        # If a doc is not a daily doc, ignore
                        continue

                stats["period_count"] = period_count

        # If period == 'all', we'll rely on 'total' only (frontend can display that)
        return stats

    except Exception as e:
        logger.exception(f"Failed to get verification stats: {str(e)}")
        return {"total": 0, "today": 0, "error": "Failed to fetch statistics"}


@router.get("/report-count")
async def get_report_count(
    current_user: UserInDB = Depends(get_current_active_user),
    period: Optional[str] = None
):
    """
    Get report statistics with optional time period filter.
    Same semantics as verification-count.
    """
    try:
        stats = {"total": 0, "today": 0, "period": period}

        total_doc = stats_collection.document("reports").get()
        if total_doc.exists:
            stats["total"] = int(total_doc.to_dict().get("count", 0))

        today = datetime.utcnow().date()
        today_doc = stats_collection.document(f"reports_{today.isoformat()}").get()
        if today_doc.exists:
            stats["today"] = int(today_doc.to_dict().get("count", 0))

        if period and period.lower() != "day" and period.lower() != "all":
            start_date = calculate_period_start(period)
            if start_date:
                start_iso = start_date.isoformat()
                end_iso = today.isoformat()

                query = stats_collection.where("date", ">=", start_iso).where("date", "<=", end_iso)

                period_count = 0
                for doc in query.stream():
                    try:
                        period_count += int(doc.to_dict().get("count", 0))
                    except Exception:
                        continue

                stats["period_count"] = period_count

        return stats

    except Exception as e:
        logger.exception(f"Failed to get report stats: {str(e)}")
        return {"total": 0, "today": 0, "error": "Failed to fetch statistics"}