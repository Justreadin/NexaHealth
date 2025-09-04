from fastapi import APIRouter, Request, HTTPException, Depends, Security, UploadFile, File, Form
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from datetime import datetime
import uuid
from typing import Optional, List
import os
from pathlib import Path
from ..core.db import db
from pydantic import BaseModel, Field
from enum import Enum

router = APIRouter()
security = HTTPBearer()

# Constants
MAX_FILE_SIZE = 5 * 1024 * 1024  # 5MB
ALLOWED_FILE_TYPES = ["image/jpeg", "image/png", "image/gif"]
UPLOAD_FOLDER = "uploads/feedback_screenshots"
BASE_URL = "http://localhost:8000"  # Change this to your actual domain in production

# Ensure upload directory exists
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

# Models
class FeedbackType(str, Enum):
    suggestion = "suggestion"
    bug = "bug"
    compliment = "compliment"
    question = "question"

class FeedbackBase(BaseModel):
    feedback_type: FeedbackType
    message: str = Field(..., min_length=10, max_length=2000)
    contact_email: Optional[str] = Field(
        None,
        pattern=r"^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+$"
    )
    screenshot_url: Optional[str] = None
    
class FeedbackCreate(FeedbackBase):
    pass

class Feedback(FeedbackBase):
    id: str
    created_at: datetime
    user_agent: Optional[str]
    ip_address: Optional[str]
    page_url: Optional[str]

# Helper Functions
async def save_uploaded_file(file: UploadFile) -> str:
    """Save uploaded file to local storage and return its URL"""
    try:
        # Generate unique filename
        file_ext = Path(file.filename).suffix.lower()
        unique_filename = f"{uuid.uuid4()}{file_ext}"
        file_path = os.path.join(UPLOAD_FOLDER, unique_filename)
        
        # Save file
        with open(file_path, "wb") as buffer:
            buffer.write(await file.read())
        
        # Return accessible URL
        return f"{BASE_URL}/{UPLOAD_FOLDER}/{unique_filename}"
    
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to save file: {str(e)}"
        )

async def validate_file(file: UploadFile):
    """Validate the uploaded file"""
    if file.content_type not in ALLOWED_FILE_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"File type not allowed. Allowed types: {', '.join(ALLOWED_FILE_TYPES)}"
        )
    
    # Get file size by reading the file
    file.file.seek(0, 2)  # Seek to end
    file_size = file.file.tell()
    file.file.seek(0)  # Reset pointer
    
    if file_size > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=400,
            detail=f"File too large. Max size: {MAX_FILE_SIZE//(1024*1024)}MB"
        )

# Authentication (placeholder - implement your actual auth)
async def get_current_user(credentials: HTTPAuthorizationCredentials = Security(security)):
    token = credentials.credentials
    # Implement your actual token verification logic here
    return {"uid": "admin_user_id", "is_admin": True}

# Routes
@router.post("/feedback", response_model=Feedback)
async def submit_feedback(
    request: Request,
    feedback_type: FeedbackType = Form(...),
    message: str = Form(..., min_length=10, max_length=2000),
    contact_email: Optional[str] = Form(None),
    screenshot: Optional[UploadFile] = File(None)
):
    try:
        # Validate and process screenshot if provided
        screenshot_url = None
        if screenshot:
            await validate_file(screenshot)
            screenshot_url = await save_uploaded_file(screenshot)

        # Get client information
        user_agent = request.headers.get("user-agent")
        ip_address = request.client.host if request.client else None
        page_url = request.headers.get("referer", "unknown")

        # Create feedback document
        feedback_id = str(uuid.uuid4())
        feedback_data = {
            "id": feedback_id,
            "feedback_type": feedback_type,
            "message": message,
            "contact_email": contact_email,
            "screenshot_url": screenshot_url,
            "created_at": datetime.utcnow(),
            "user_agent": user_agent,
            "ip_address": ip_address,
            "page_url": page_url
        }

        # Save to Firestore
        doc_ref = db.collection("feedbacks").document(feedback_id)
        doc_ref.set(feedback_data)

        return feedback_data

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error submitting feedback: {str(e)}"
        )

@router.get("/feedbacks", response_model=List[Feedback])
async def get_feedbacks(
    limit: Optional[int] = 100,
    feedback_type: Optional[FeedbackType] = None,
    user: dict = Depends(get_current_user)
):
    if not user.get("is_admin"):
        raise HTTPException(
            status_code=403,
            detail="Only admins can access this endpoint"
        )

    try:
        feedbacks = []
        query = db.collection("feedbacks").order_by("created_at", direction="DESCENDING").limit(limit)
        
        if feedback_type:
            query = query.where("feedback_type", "==", feedback_type.value)
        
        docs = query.stream()
        
        for doc in docs:
            feedbacks.append(doc.to_dict())
        
        return feedbacks
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error retrieving feedbacks: {str(e)}"
        )