# app/routers/dashboard.py
from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import HTTPBearer
from pydantic import BaseModel
from datetime import datetime
from typing import Optional, List
from app.core.db import db, users_collection, reports_collection
from app.core.auth import get_current_active_user
from app.models.auth_model import UserInDB
from firebase_admin import firestore
import logging

router = APIRouter()
security = HTTPBearer()
logger = logging.getLogger(__name__)

class UserProfile(BaseModel):
    id: str
    username: str
    email: str
    full_name: Optional[str] = None
    created_at: datetime
    last_login: Optional[datetime] = None
    role: Optional[str] = "user"

class DashboardStats(BaseModel):
    verified_drugs: int
    reported_issues: int
    health_checks: int
    saved_facilities: int

class ActivityItem(BaseModel):
    type: str
    title: str
    description: str
    status: str
    timestamp: str
    icon: str
    color: str

@router.get("/dashboard/user", response_model=UserProfile)
async def get_user_profile(current_user: UserInDB = Depends(get_current_active_user)):
    """Get authenticated user's profile data"""
    try:
        # Get user document from Firestore
        user_doc = users_collection.document(current_user.id).get()
        
        if not user_doc.exists:
            raise HTTPException(
                status_code=404,
                detail="User profile not found"
            )
            
        user_data = user_doc.to_dict()
        
        # Format the response
        return UserProfile(
            id=current_user.id,
            username=user_data.get("first_name", "User"),
            email=current_user.email,
            full_name=f"{user_data.get('first_name', '')} {user_data.get('last_name', '')}".strip(),
            created_at=user_data.get("created_at"),
            last_login=user_data.get("last_login"),
            role=user_data.get("role", "user")
        )
        
    except Exception as e:
        logger.error(f"Error fetching user profile: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail="Error fetching user profile"
        )

@router.get("/dashboard/stats", response_model=DashboardStats)
async def get_dashboard_stats(current_user: UserInDB = Depends(get_current_active_user)):
    """Get dashboard statistics for the authenticated user"""
    try:
        # Get actual counts from Firestore
        verified_drugs = len([doc for doc in 
            reports_collection.where("user_id", "==", current_user.id)
                            .where(filter=("status", "==", "verified")).stream()])

        
        reported_issues = len([doc for doc in 
            reports_collection.where("user_id", "==", current_user.id)
                            .where(filter=("status", "==", "reported")).stream()])

        
        # These would be replaced with actual health check queries
        health_checks = len([doc for doc in 
                           users_collection.document(current_user.id)
                           .collection("health_checks").stream()])
        
        saved_facilities = len([doc for doc in 
                              users_collection.document(current_user.id)
                              .collection("saved_facilities").stream()])
        
        return DashboardStats(
            verified_drugs=verified_drugs,
            reported_issues=reported_issues,
            health_checks=health_checks,
            saved_facilities=saved_facilities
        )
        
    except Exception as e:
        logger.error(f"Error fetching dashboard stats: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail="Error fetching dashboard statistics"
        )

@router.get("/dashboard/activity", response_model=List[ActivityItem])
async def get_recent_activity(current_user: UserInDB = Depends(get_current_active_user)):
    """Get recent user activity"""
    try:
        # Get activity from Firestore
        activity_docs = users_collection.document(current_user.id)\
                        .collection("activities")\
                        .order_by("timestamp", direction=firestore.Query.DESCENDING)\
                        .limit(5)\
                        .stream()
        
        activities = []
        for doc in activity_docs:
            activity_data = doc.to_dict()
            activities.append(ActivityItem(
                type=activity_data.get("type", "activity"),
                title=activity_data.get("title", "Activity"),
                description=activity_data.get("description", ""),
                status=activity_data.get("status", "completed"),
                timestamp=activity_data.get("timestamp").isoformat(),
                icon=activity_data.get("icon", "circle"),
                color=activity_data.get("color", "blue")
            ))
            
        # If no activities found, return some defaults
        if not activities:
            activities.append(ActivityItem(
                type="welcome",
                title="Welcome to NexaHealth",
                description="You've successfully logged in to your dashboard",
                status="completed",
                timestamp=datetime.utcnow().isoformat(),
                icon="check-circle",
                color="green"
            ))
            
        return activities
        
    except Exception as e:
        logger.error(f"Error fetching recent activity: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail="Error fetching recent activity"
        )