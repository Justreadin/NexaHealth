# app/models/pharmacy_report_model.py
from pydantic import BaseModel, Field, validator
from typing import Optional, List, Literal
from datetime import datetime
from enum import Enum

class PharmacyReportType(str, Enum):
    FAKE = "fake"
    SUBSTANDARD = "substandard"
    ADR = "adr"
    COUNTERFEIT = "counterfeit"
    EXPIRED = "expired"
    PACKAGING = "packaging"
    OTHER = "other"

class LocationType(str, Enum):
    OWN_PHARMACY = "own_pharmacy"
    OTHER_PHARMACY = "other_pharmacy"
    ONLINE_STORE = "online_store"
    STREET_VENDOR = "street_vendor"
    HOSPITAL = "hospital"
    OTHER = "other"

class PharmacyReportBase(BaseModel):
    issue_type: PharmacyReportType
    description: str = Field(..., min_length=10, max_length=2000)
    
    # Drug Information
    drug_name: str = Field(..., min_length=2, max_length=100)
    batch_number: Optional[str] = Field(None, min_length=3, max_length=20)
    expiry_date: Optional[str] = Field(None)
    nafdac_reg_no: Optional[str] = Field(None, min_length=6, max_length=20)
    manufacturer: Optional[str] = Field(None, min_length=2, max_length=100)
    
    # Location & Source
    location_type: LocationType
    pharmacy_name: Optional[str] = Field(None, min_length=2, max_length=100)
    pharmacy_address: Optional[str] = Field(None, max_length=200)
    
    # Submission Options
    is_anonymous: bool = Field(default=False)
    reporter_type: Literal["pharmacy"] = "pharmacy"

    @validator("batch_number", "nafdac_reg_no", "manufacturer", "pharmacy_name", pre=True)
    def empty_str_to_none(cls, v):
        if v == "":
            return None
        return v

class PharmacyReportCreate(PharmacyReportBase):
    pass

class PharmacyReportResponse(BaseModel):
    message: str
    report_id: str
    status: Literal["success", "error"]

class PharmacyReportDB(PharmacyReportBase):
    id: str
    pharmacy_id: Optional[str] = None  # Only if not anonymous
    timestamp: datetime
    status: Literal["new", "under_review", "resolved"] = "new"
    images: List[str] = Field(default_factory=list)
    
    class Config:
        use_enum_values = True
        json_encoders = {
            datetime: lambda v: v.isoformat() if v else None
        }