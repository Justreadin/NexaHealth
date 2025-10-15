from typing import Optional, List, Dict, Literal, Union, Tuple
from pydantic import BaseModel, Field, validator
from datetime import datetime
from enum import Enum
import re

class VerificationStatus(str, Enum):
    VERIFIED = "verified"
    FLAGGED = "flagged"
    UNKNOWN = "unknown"
    PARTIAL_MATCH = "partial_match"
    CONFLICT = "conflict"
    HIGH_SIMILARITY = "high_similarity"
    LOW_CONFIDENCE = "low_confidence"
    REQUIRES_CONFIRMATION = "requires_confirmation"

class MatchConfidence(str, Enum):
    EXACT = "exact"
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"

class DrugMatchDetail(BaseModel):
    field: str
    matched_value: Optional[str] = None
    input_value: Optional[str] = None
    score: int = Field(..., ge=0, le=100)
    confidence: MatchConfidence
    algorithm: str
    explanation: Optional[str] = None

    @validator("score", pre=True)
    def cast_score(cls, v):
        if isinstance(v, float):
            return round(v)
        return v

class DrugVerificationRequest(BaseModel):
    product_name: Optional[str] = Field(None, description="Brand or product name")
    generic_name: Optional[str] = Field(None, description="Generic drug name")
    nafdac_reg_no: Optional[str] = Field(None, description="NAFDAC registration number")
    manufacturer: Optional[str] = Field(None, description="Manufacturer name")
    dosage_form: Optional[str] = Field(None, description="Tablet, syrup, capsule, etc.")
    strength: Optional[str] = Field(None, description="Dosage strength")

class DrugVerificationResponse(BaseModel):
    status: VerificationStatus
    message: str
    product_name: Optional[str] = None
    generic_name: Optional[str] = None
    dosage_form: Optional[str] = None
    strength: Optional[str] = None
    nafdac_reg_no: Optional[str] = None
    manufacturer: Optional[str] = None
    match_score: int = Field(..., ge=0, le=100)
    confidence: MatchConfidence
    pil_id: Optional[int] = None
    last_verified: Optional[datetime] = None
    match_details: List[DrugMatchDetail] = []
    possible_matches: List[Dict] = []
    requires_confirmation: bool = False
    requires_nafdac: bool = False
    verification_notes: List[str] = []
    
    class Config:
        use_enum_values = True
        json_encoders = {
            datetime: lambda v: v.isoformat() if v else None
        }
        schema_extra = {
            "example": {
                "status": "verified",
                "message": "Drug verified successfully",
                "confidence": "high",
                "product_name": "Paracetamol Tablets",
                "match_score": 95,
                "requires_confirmation": False,
                "requires_nafdac": False
            }
        }

    def dict(self, **kwargs):
        data = super().dict(**kwargs)
        if "status" in data and isinstance(data["status"], VerificationStatus):
            data["status"] = data["status"].name  # Converts Enum to UPPERCASE string
        return data


class SimpleDrugVerificationRequest(BaseModel):
    product_name: Optional[str] = None
    nafdac_reg_no: Optional[str] = None
