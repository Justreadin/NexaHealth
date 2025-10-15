# app/schemas/pharmacy_profile.py
from pydantic import BaseModel, EmailStr
from typing import Optional, List, Dict
from datetime import datetime

class PharmacyProfileBase(BaseModel):
    pharmacy_name: Optional[str] = None
    email: EmailStr
    phone_number: Optional[str] = None   
    address: Optional[str] = None
    about_pharmacy: Optional[str] = None
    license_number: Optional[str] = None
    established_year: Optional[int] = None
    opening_hours: Optional[str] = None

class PharmacyProfileCreate(PharmacyProfileBase):
    pass

class PharmacyProfileUpdate(BaseModel):
    pharmacy_name: Optional[str] = None
    phone_number: Optional[str] = None
    email: Optional[str] = None
    address: Optional[str] = None
    about_pharmacy: Optional[str] = None
    license_number: Optional[str] = None
    established_year: Optional[int] = None
    opening_hours: Optional[str] = None

class PharmacyProfileResponse(PharmacyProfileBase):
    id: str
    status: Optional[str] = "pending"
    badges: Optional[List[str]] = "Partner Pharmacy"
    profile_completeness: int
    avg_rating: Optional[float] = None
    total_verifications: int = 0
    total_reports: int = 0
    is_published: bool = False
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True

class ProfileCompletenessResponse(BaseModel):
    completeness_percentage: int
    completed_fields: List[str]
    missing_fields: List[str]
    next_steps: List[str]