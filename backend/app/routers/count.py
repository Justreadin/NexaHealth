from fastapi import APIRouter, Depends
from fastapi.security import OAuth2PasswordBearer
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
        
        # Update total count
        stats_collection.document(stat_name).update({
            "count": firestore.Increment(increment),
            "last_updated": datetime.utcnow()
        })
        
        # Update daily count
        daily_doc_ref = stats_collection.document(f"{stat_name}_{today}")
        if not daily_doc_ref.get().exists:
            daily_doc_ref.set({
                "count": increment,
                "date": today.isoformat()
            })
        else:
            daily_doc_ref.update({
                "count": firestore.Increment(increment),
                "last_updated": datetime.utcnow()
            })
            
    except Exception as e:
        logger.error(f"Failed to increment {stat_name} counter: {str(e)}")

@router.get("/verification-count")
async def get_verification_count(
    current_user: UserInDB = Depends(get_current_active_user),
    period: Optional[str] = None
):
    """Get verification statistics with optional time period filter"""
    try:
        stats = {
            "total": 0,
            "today": 0,
            "period": period
        }
        
        # Get total count
        total_doc = stats_collection.document("verifications").get()
        if total_doc.exists:
            stats["total"] = total_doc.to_dict().get("count", 0)
        
        # Get today's count
        today = datetime.utcnow().date()
        today_doc = stats_collection.document(f"verifications_{today}").get()
        if today_doc.exists:
            stats["today"] = today_doc.to_dict().get("count", 0)
        
        # Handle period filter if provided
        if period:
            start_date = calculate_period_start(period)
            if start_date:
                # Create document references for __name__ filters
                start_doc = stats_collection.document(f"verifications_{start_date}")
                end_doc = stats_collection.document(f"verifications_{today}")

                query = (
                    stats_collection
                    .where(filter=("date", ">=", start_date.isoformat()))
                    .where(filter=("date", "<=", today.isoformat()))
                    .where(filter=("__name__", ">=", start_doc))
                    .where(filter=("__name__", "<=", end_doc))
                )

                
                period_count = 0
                for doc in query.stream():
                    period_count += doc.to_dict().get("count", 0)
                
                stats["period_count"] = period_count
        
        return stats
        
    except Exception as e:
        logger.error(f"Failed to get verification stats: {str(e)}")
        return {
            "total": 0,
            "today": 0,
            "error": "Failed to fetch statistics"
        }

@router.get("/report-count")
async def get_report_count(
    current_user: UserInDB = Depends(get_current_active_user),
    period: Optional[str] = None
):
    """Get report statistics with optional time period filter"""
    try:
        stats = {
            "total": 0,
            "today": 0,
            "period": period
        }
        
        # Get total count
        total_doc = stats_collection.document("reports").get()
        if total_doc.exists:
            stats["total"] = total_doc.to_dict().get("count", 0)
        
        # Get today's count
        today = datetime.utcnow().date()
        today_doc = stats_collection.document(f"reports_{today}").get()
        if today_doc.exists:
            stats["today"] = today_doc.to_dict().get("count", 0)
        
        # Handle period filter if provided
        if period:
            start_date = calculate_period_start(period)
            if start_date:
                start_doc = stats_collection.document(f"reports_{start_date}")
                end_doc = stats_collection.document(f"reports_{today}")

                query = (
                    stats_collection
                    .where(filter=("date", ">=", start_date.isoformat()))
                    .where(filter=("date", "<=", today.isoformat()))
                    .where(filter=("__name__", ">=", start_doc))
                    .where(filter=("__name__", "<=", end_doc))
                )

                
                period_count = 0
                for doc in query.stream():
                    period_count += doc.to_dict().get("count", 0)
                
                stats["period_count"] = period_count
        
        return stats
        
    except Exception as e:
        logger.error(f"Failed to get report stats: {str(e)}")
        return {
            "total": 0,
            "today": 0,
            "error": "Failed to fetch statistics"
        }

def calculate_period_start(period: str) -> Optional[datetime.date]:
    """Calculate start date based on period string"""
    today = datetime.utcnow().date()
    
    if period == "week":
        return today - timedelta(days=7)
    elif period == "month":
        return today - timedelta(days=30)
    elif period == "year":
        return today - timedelta(days=365)
    elif period == "all":
        return None  # Special case handled by the caller
    else:
        return None