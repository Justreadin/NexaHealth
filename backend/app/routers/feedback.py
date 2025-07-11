from fastapi import APIRouter, Request, HTTPException, Depends, Security
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from ..models.feedback_model import FeedbackCreate, Feedback
from ..core.db import db
from datetime import datetime
import uuid
from typing import Optional

router = APIRouter()
security = HTTPBearer()


async def get_current_user(credentials: HTTPAuthorizationCredentials = Security(security)):
    # This is a placeholder - implement your actual admin verification logic
    # For example, verify Firebase ID token or check custom claims
    token = credentials.credentials
    # Add your token verification logic here
    # Return user info if valid, raise HTTPException if not
    return {"uid": "admin_user_id", "is_admin": True}  # Simplified for example


@router.post("/feedback", response_model=Feedback)
async def submit_feedback(
        feedback: FeedbackCreate,
        request: Request
):
    try:
        # Get client information
        user_agent = request.headers.get("user-agent")
        ip_address = request.client.host if request.client else None
        page_url = request.headers.get("referer", "unknown")

        # Create feedback document
        feedback_id = str(uuid.uuid4())
        feedback_data = {
            "id": feedback_id,
            **feedback.dict(),
            "created_at": datetime.utcnow(),
            "user_agent": user_agent,
            "ip_address": ip_address,
            "page_url": page_url
        }

        # Save to Firestore
        doc_ref = db.collection("feedbacks").document(feedback_id)
        doc_ref.set(feedback_data)

        return feedback_data

    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error submitting feedback: {str(e)}"
        )


@router.get("/feedbacks")
async def get_feedbacks(
        user: dict = Depends(get_current_user)
):
    if not user.get("is_admin"):
        raise HTTPException(
            status_code=403,
            detail="Only admins can access this endpoint"
        )

    try:
        feedbacks = []
        docs = db.collection("feedbacks").order_by("created_at", direction="DESCENDING").stream()
        for doc in docs:
            feedbacks.append(doc.to_dict())
        return feedbacks
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error retrieving feedbacks: {str(e)}"
        )