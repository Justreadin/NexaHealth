# app/routers/pharmacy_dashboard.py
from fastapi import APIRouter, HTTPException, status, Depends
from pydantic import BaseModel
from typing import Optional, Dict, Any, List
from app.core.db import users_collection, reports_collection, get_server_timestamp
from app.core.auth import get_current_active_user
from datetime import datetime, timedelta
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/dashboard", tags=["Pharmacy Dashboard"])

# Schemas
class DashboardMetricsResponse(BaseModel):
    pharmacy_id: str
    pharmacy_name: str
    metrics: Dict[str, Any]
    badges: List[Dict[str, Any]]
    profile_completeness: int
    status: str
    account_type: str

class BadgeProgressResponse(BaseModel):
    current_badge: Dict[str, Any]
    next_badge: Dict[str, Any]
    progress_percentage: int
    progress_text: str

class RecentActivityResponse(BaseModel):
    activities: List[Dict[str, Any]]
    total_count: int

# Helper functions
def calculate_profile_completeness(pharmacy_data: Dict[str, Any]) -> int:
    """Calculate profile completeness percentage"""
    fields = [
        "pharmacy_name", "email", "phone_number", "address",
        "cac_number", "licence_url", "operating_hours", "website_url",
        "description"
    ]
    
    completed = 0
    for field in fields:
        if pharmacy_data.get(field):
            completed += 1

    return min(100, int((completed / len(fields)) * 100))

def get_badge_progress(pharmacy_data: Dict[str, Any]) -> BadgeProgressResponse:
    """Calculate badge progress and next level"""
    current_badges = pharmacy_data.get("badges", [])
    total_verifications = pharmacy_data.get("total_verifications", 0)
    avg_rating = pharmacy_data.get("avg_rating", 0)
    
    # Determine current badge
    current_badge = {"name": "Unverified", "icon": "fa-user", "level": 1}
    
    if any(b.get("badge_type") == "Verified" for b in current_badges):
        current_badge = {"name": "Verified Partner", "icon": "fa-shield-alt", "level": 2}
    
    if any(b.get("badge_type") == "Trusted" for b in current_badges):
        current_badge = {"name": "Trusted Partner", "icon": "fa-star", "level": 3}
    
    if any(b.get("badge_type") == "Elite" for b in current_badges):
        current_badge = {"name": "Elite Provider", "icon": "fa-crown", "level": 4}
    
    # Determine next badge and progress
    next_badge = {"name": "Verified Partner", "icon": "fa-shield-alt", "requirements": "Complete verification process"}
    progress_percentage = 0
    progress_text = "Complete registration"
    
    if current_badge["level"] == 1:  # Starter -> Verified
        next_badge = {"name": "Partner", "icon": "fa-shield-alt", "requirements": "Complete verification process"}
        progress_percentage = 25 if pharmacy_data.get("status") == "pending" else 75
        progress_text = "Complete verification" if pharmacy_data.get("status") == "pending" else "Awaiting approval"
    
    elif current_badge["level"] == 2:  # Verified -> Trusted
        next_badge = {"name": "Verified", "icon": "fa-star", "requirements": "50+ verifications & 4.5+ rating"}
        verifications_needed = max(0, 50 - total_verifications)
        rating_needed = max(0, 4.5 - avg_rating) if avg_rating < 4.5 else 0
        
        if verifications_needed > 0:
            progress_percentage = int((total_verifications / 50) * 100)
            progress_text = f"{verifications_needed} more verifications needed"
        elif rating_needed > 0:
            progress_percentage = 80
            progress_text = f"Maintain {4.5}+ rating"
        else:
            progress_percentage = 95
            progress_text = "Eligible for Trusted badge"
    
    elif current_badge["level"] == 3:  # Trusted -> Elite
        next_badge = {"name": "Trusted Partner", "icon": "fa-crown", "requirements": "200+ verifications & 4.8+ rating"}
        verifications_needed = max(0, 200 - total_verifications)
        progress_percentage = int((total_verifications / 200) * 100)
        progress_text = f"{verifications_needed} more verifications needed"
    
    else:  # Elite (max level)
        next_badge = {"name": "Elite", "icon": "fa-trophy", "requirements": "Top performer"}
        progress_percentage = 100
        progress_text = "Maximum level achieved"
    
    return BadgeProgressResponse(
        current_badge=current_badge,
        next_badge=next_badge,
        progress_percentage=min(100, progress_percentage),
        progress_text=progress_text
    )

def get_recent_activity(pharmacy_id: str, limit: int = 5) -> List[Dict[str, Any]]:
    """Get recent activity for pharmacy"""
    try:
        # Get recent reports created by pharmacy
        reports_query = reports_collection.where("reported_by", "==", pharmacy_id)\
                                         .order_by("created_at", direction=firestore.Query.DESCENDING)\
                                         .limit(limit)\
                                         .stream()
        
        activities = []
        for doc in reports_query:
            report_data = doc.to_dict()
            activities.append({
                "type": "report",
                "title": f"Report submitted: {report_data.get('drug_name', 'Unknown drug')}",
                "description": report_data.get('description', ''),
                "timestamp": report_data.get('created_at'),
                "status": report_data.get('status', 'pending')
            })
        
        # If no reports, return placeholder activities
        if not activities:
            activities = [{
                "type": "info",
                "title": "Welcome to NexaHealth!",
                "description": "Get started by verifying your first drug",
                "timestamp": get_server_timestamp(),
                "status": "completed"
            }]
        
        return activities
        
    except Exception as e:
        logger.error(f"Error fetching recent activity: {str(e)}")
        return []

# Routes
@router.get("/metrics", response_model=DashboardMetricsResponse)
async def get_dashboard_metrics(
    pharmacy: dict = Depends(get_current_active_user)
):
    """Get comprehensive dashboard metrics for pharmacy"""
    try:
        pharmacy_id = pharmacy["id"]
        
        # Calculate metrics
        total_verifications = pharmacy.get("total_verifications", 0)
        verified_drugs = len(pharmacy.get("verified_drugs", []))
        
        # Count reports (both created by pharmacy and against pharmacy)
        my_reports_count = len(pharmacy.get("reports", []))
        reports_against_count = len(pharmacy.get("reports_against", []))
        
        # Calculate profile completeness
        profile_completeness = calculate_profile_completeness(pharmacy)
        
        # Get badge progress
        badge_progress = get_badge_progress(pharmacy)
        
        # Determine account type
        account_type = "Founding Partner Free Plan"
        if pharmacy.get("premium_features"):
            account_type = "Professional Plan"
        
        metrics = {
            "total_verifications": total_verifications,
            "verified_drugs": verified_drugs,
            "my_reports": my_reports_count,
            "reports_against": reports_against_count,
            "average_rating": pharmacy.get("avg_rating"),
            "response_rate": pharmacy.get("response_rate", 0),
            "trust_score": pharmacy.get("trust_score", 0)
        }
        
        return DashboardMetricsResponse(
            pharmacy_id=pharmacy_id,
            pharmacy_name=pharmacy.get("pharmacy_name", "Pharmacy"),
            metrics=metrics,
            badges=[get_badge_progress(pharmacy).current_badge],
            profile_completeness=profile_completeness,
            status=pharmacy.get("status", "pending"),
            account_type=account_type
        )
        
    except Exception as e:
        logger.error(f"Error fetching dashboard metrics: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to fetch dashboard metrics"
        )

@router.get("/badge-progress", response_model=BadgeProgressResponse)
async def get_badge_progress_endpoint(
    pharmacy: dict = Depends(get_current_active_user)
):
    """Get current badge and progress towards next level"""
    try:
        return get_badge_progress(pharmacy)
        
    except Exception as e:
        logger.error(f"Error fetching badge progress: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to fetch badge progress"
        )

@router.get("/recent-activity", response_model=RecentActivityResponse)
async def get_recent_activity_endpoint(
    pharmacy: dict = Depends(get_current_active_user),
    limit: int = 5
):
    """Get recent activity for pharmacy"""
    try:
        pharmacy_id = pharmacy["id"]
        activities = get_recent_activity(pharmacy_id, limit)
        
        return RecentActivityResponse(
            activities=activities,
            total_count=len(activities)
        )
        
    except Exception as e:
        logger.error(f"Error fetching recent activity: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to fetch recent activity"
        )

@router.get("/welcome")
async def get_welcome_message(
    pharmacy: dict = Depends(get_current_active_user)
):
    """Get personalized welcome message"""
    try:
        pharmacy_name = pharmacy.get("pharmacy_name", "Pharmacy")
        status = pharmacy.get("status", "pending")
        
        if status == "pending":
            message = f"Welcome, {pharmacy_name}! Your account is under review."
        elif status == "verified":
            message = f"Welcome back, {pharmacy_name}!"
        else:
            message = f"Welcome, {pharmacy_name}!"
        
        return {
            "welcome_message": message,
            "pharmacy_name": pharmacy_name,
            "status": status
        }
        
    except Exception as e:
        logger.error(f"Error generating welcome message: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to generate welcome message"
        )

@router.get("/quick-stats")
async def get_quick_stats(
    pharmacy: dict = Depends(get_current_active_user)
):
    """Get quick stats for dashboard summary card"""
    try:
        total_verifications = pharmacy.get("total_verifications", 0)
        my_reports = len(pharmacy.get("reports", []))
        status = pharmacy.get("status", "pending").title()
        
        # Determine account status badge
        if pharmacy.get("status") == "verified":
            account_status = "Verified"
        elif pharmacy.get("status") == "pending":
            account_status = "Pending"
        else:
            account_status = "Partner"
        
        return {
            "verifications_count": total_verifications,
            "reports_count": my_reports,
            "pharmacy_status": status,
            "account_status": account_status
        }
        
    except Exception as e:
        logger.error(f"Error fetching quick stats: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to fetch quick stats"
        )