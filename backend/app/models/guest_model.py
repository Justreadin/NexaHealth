from pydantic import BaseModel, Field, HttpUrl, validator
from datetime import datetime, timedelta
from typing import Optional, Dict, Any, List
from uuid import UUID, uuid4
import secrets
import re

class GuestSession(BaseModel):
    # Core Identification
    id: UUID = Field(default_factory=uuid4, description="Unique session identifier")
    created_at: datetime = Field(default_factory=datetime.utcnow, description="Session creation timestamp")
    expires_at: datetime = Field(
        default_factory=lambda: datetime.utcnow() + timedelta(days=7),
        description="Automatic expiration after 7 days"
    )
    
    last_used_at: datetime = Field(
        default_factory=datetime.utcnow,
        description="Timestamp of the last time the session was used"
     )

    # Usage Tracking
    request_count: int = Field(default=0, ge=0, description="Total API requests made")
    feature_usage: Dict[str, int] = Field(
        default_factory=lambda: {'risk_assessment': 0},
        description="Track usage per feature with default risk assessment tracking"
    )
    
    # Security Context
    ip_hash: str = Field(
        ...,
        min_length=64,
        max_length=64,
        description="SHA-256 hash of IP + User-Agent for abuse prevention"
    )
    user_agent: str = Field(
        ...,
        max_length=512,
        description="Client's user agent string"
    )
    
    # Security Token
    csrf_token: str = Field(
        default_factory=lambda: secrets.token_urlsafe(32),
        description="Anti-CSRF token for form submissions"
    )
    

    # Data Storage
    temp_data: Dict[str, Any] = Field(
        default_factory=dict,
        description="Ephemeral storage for guest session data"
    )
    
    # Optional Metadata
    device_id: Optional[str] = Field(
        None,
        min_length=32,
        max_length=256,
        description="Client-generated persistent device identifier"
    )
    referrer: Optional[HttpUrl] = None
    screen_resolution: Optional[str] = None
    accepted_features: Optional[List[str]] = Field(
        None,
        description="List of features the guest has consented to use"
    )
    
    @validator('ip_hash')
    def validate_ip_hash(cls, v):
        if not re.match(r'^[a-f0-9]{64}$', v):
            raise ValueError('Invalid IP hash format')
        return v
    
    @validator('feature_usage')
    def validate_feature_usage(cls, v):
        if any(count < 0 for count in v.values()):
            raise ValueError('Feature usage counts cannot be negative')
        return v
    
    class Config:
        json_encoders = {
            datetime: lambda dt: dt.isoformat(),
            UUID: lambda uid: str(uid)
        }
        json_schema_extra = {
            "example": {
                "id": "123e4567-e89b-12d3-a456-426614174000",
                "created_at": "2023-01-01T00:00:00Z",
                "expires_at": "2023-01-08T00:00:00Z",
                "request_count": 0,
                "feature_usage": {"risk_assessment": 0},
                "ip_hash": "a1b2c3...",
                "user_agent": "Mozilla/5.0...",
                "csrf_token": "abc123...",
                "temp_data": {}
            }
        }