from pydantic import BaseModel, EmailStr, Field, validator
from typing import Optional
import re
from datetime import datetime
from firebase_admin import firestore


class UserBase(BaseModel):
    email: EmailStr
    first_name: str = Field(..., min_length=1, max_length=50)
    last_name: str = Field(..., min_length=1, max_length=50)


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
    id: str
    hashed_password: str
    disabled: bool = False
    email_verified: bool = False
    created_at: str
    last_login: Optional[str] = None

    @validator('created_at', 'last_login', pre=True)
    def convert_timestamp(cls, v):
        if v is None:
            return None
        if isinstance(v, str):
            return v
        # Handle Firestore timestamp
        if isinstance(v, datetime):
            return v.isoformat()
        if hasattr(v, 'isoformat'):  # For Firestore's DatetimeWithNanoseconds
            return v.isoformat()
        return str(v)


class UserPublic(UserBase):
    id: str
    email_verified: bool
    created_at: str

    @validator('created_at', pre=True)
    def convert_timestamp_public(cls, v):
        if v is None:
            return None
        if isinstance(v, str):
            return v
        # Handle Firestore timestamp
        if isinstance(v, datetime):
            return v.isoformat()
        if hasattr(v, 'isoformat'):
            return v.isoformat()
        return str(v)


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