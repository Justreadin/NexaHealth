from pydantic import BaseModel
from typing import Optional
from datetime import datetime

class FeedbackBase(BaseModel):
    rating: int
    feedback_type: str
    message: Optional[str] = None
    language: str
    page_url: str

class FeedbackCreate(FeedbackBase):
    pass

class Feedback(FeedbackBase):
    id: str
    created_at: datetime
    user_agent: Optional[str] = None
    ip_address: Optional[str] = None

    class Config:
        from_attributes = True