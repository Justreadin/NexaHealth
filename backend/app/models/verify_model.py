from typing import Optional, List, Dict, Literal, Union
from pydantic import BaseModel
from datetime import datetime
from enum import Enum

class VerificationStatus(str, Enum):
    VERIFIED = "verified"
    FLAGGED = "flagged"
    UNKNOWN = "unknown"
    PARTIAL_MATCH = "partial_match"
    CONFLICT_WARNING = "conflict_warning"
    COMMON_NAME_MATCH = "common_name_match"
    HIGH_SIMILARITY = "high_similarity"

class DrugVerificationRequest(BaseModel):
    product_name: str  # Now mandatory
    nafdac_reg_no: Optional[str] = None
    manufacturer: Optional[str] = None
    batch_number: Optional[str] = None
    dosage_form: Optional[str] = None  # New field for better matching

class DrugMatchDetail(BaseModel):
    field: str
    matched_value: str
    input_value: str
    score: int
    algorithm: str

class DrugVerificationResponse(BaseModel):
    status: VerificationStatus
    message: str
    product_name: Optional[str] = None
    dosage_form: Optional[str] = None
    strength: Optional[str] = None
    nafdac_reg_no: Optional[str] = None
    manufacturer: Optional[str] = None
    match_score: int
    report_count: int = 0
    pil_id: Optional[int] = None
    last_verified: Optional[datetime] = None
    match_details: List[DrugMatchDetail] = []  # Detailed matching info
    possible_matches: Optional[List[Dict]] = None
    confidence: Literal["high", "medium", "low"] = "low"
    matched_fields: Optional[List[str]] = None

class SimpleDrugVerificationRequest(BaseModel):
    product_name: Optional[str] = None
    nafdac_reg_no: Optional[str] = None
