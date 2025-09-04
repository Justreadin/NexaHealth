from pydantic import BaseModel, EmailStr, Field, validator
from typing import Optional
import re
from datetime import datetime
from firebase_admin import firestore
import uuid


class UserBase(BaseModel):
    email: str
    first_name: str = ""
    last_name: str = ""
    email_verified: bool = False


class UserCreate(UserBase):
    password: str = Field(..., min_length=8)

    @validator('password')
    def validate_password(cls, v):
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters long")
        if not re.search(r"[A-Z]", v):
            raise ValueError("Password must contain at least one uppercase letter")
        if not re.search(r"[a-z]", v):
            raise ValueError("Password must contain at least one lowercase letter")
        if not re.search(r"\d", v):
            raise ValueError("Password must contain at least one digit")
        if not re.search(r"[!@#$%^&*(),.?\":{}|<>]", v):
            raise ValueError("Password must contain at least one special character")
        return v

class UserInDB(UserBase):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))  # Default UUID if missing
    hashed_password: str = ""
    disabled: bool = False
    email_verified: bool = False
    created_at: Optional[str] = None
    last_login: Optional[str] = None
    role: str = "user"
    
    @validator('created_at', 'last_login', pre=True)
    def convert_timestamp(cls, v):
        if v is None:
            return None
        if isinstance(v, str):
            return v
        # Handle Firestore timestamp
        if hasattr(v, 'isoformat'):
            return v.isoformat()
        return str(v)
    
class UserPublic(UserBase):
    id: str
    created_at: Optional[datetime] = None
    last_login: Optional[datetime] = None

    class Config:
        json_encoders = {
            datetime: lambda v: v.isoformat() if v else None
        }
        
class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


class TokenData(BaseModel):
    email: Optional[str] = None


class GoogleToken(BaseModel):
    token: str


class PasswordResetRequest(BaseModel):
    email: EmailStr


class PasswordReset(BaseModel):
    token: str
    new_password: str

class RefreshTokenRequest(BaseModel):
    refresh_token: str