from pydantic import BaseModel, Field, validator
from typing import Optional, List, Literal
from datetime import datetime
from enum import Enum


class ReportType(str, Enum):
    PQC = "product_quality_complaint"
    AE = "adverse_event"


class Severity(str, Enum):
    MILD = "mild"
    MODERATE = "moderate"
    SEVERE = "severe"
    LIFE_THREATENING = "life_threatening"


class BaseReport(BaseModel):
    drug_name: str = Field(..., min_length=2, max_length=100)
    nafdac_reg_no: Optional[str] = Field(None, min_length=6, max_length=20)
    batch_number: Optional[str] = Field(None, min_length=3, max_length=20)
    pharmacy_name: str = Field(..., min_length=2, max_length=100)
    state: str = Field(..., min_length=2, max_length=50)
    lga: str = Field(..., min_length=2, max_length=50)
    street_address: Optional[str] = Field(None, max_length=200)
    is_anonymous: bool = Field(default=False)
    user_id: Optional[str] = Field(None)


class PQCModel(BaseReport):
    report_type: Literal[ReportType.PQC] = ReportType.PQC
    issue_type: str = Field(..., description="e.g., fake, expired, tampered, packaging")
    description: str = Field(..., min_length=10, max_length=1000)


class AEModel(BaseReport):
    report_type: Literal[ReportType.AE] = ReportType.AE
    reaction_description: str = Field(..., min_length=10, max_length=1000)
    severity: Severity
    onset_datetime: datetime
    symptoms: Optional[List[str]] = Field(default_factory=list)
    medical_history: Optional[str] = Field(None, max_length=500)

    @validator('severity', pre=True)
    def normalize_severity(cls, value):
        if isinstance(value, str):
            value = value.lower()
            if value in ['mild', 'moderate', 'severe', 'life_threatening']:
                return value
        return value
    
    @validator('symptoms', pre=True)
    def parse_symptoms(cls, value):
        if value is None:
            return []
        if isinstance(value, str):
            return [s.strip() for s in value.split(',') if s.strip()]
        return value
    
    @validator('onset_datetime', pre=True)
    def parse_onset_datetime(cls, value):
        if isinstance(value, str):
            try:
                return datetime.fromisoformat(value.replace('Z', '+00:00'))
            except (ValueError, TypeError):
                raise ValueError("Invalid datetime format. Use ISO format (YYYY-MM-DDTHH:MM:SSZ)")
        return value


class ReportResponse(BaseModel):
    message: str
    report_id: str
    status: Literal["success", "error"]


class ReportRequest(BaseModel):
    drug_name: str
    nafdac_reg_no: Optional[str] = None
    pharmacy_name: str
    description: str
    state: str
    lga: str
    street_address: Optional[str] = None   # Added street_address

class ReportResponse(BaseModel):
    message: str
    status: str

class ReportDBModel(BaseModel):
    drug_name: str
    nafdac_reg_no: Optional[str]
    pharmacy_name: str
    description: str
    state: str
    lga: str
    street_address: Optional[str] = None   # Added street_address
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    image_url: Optional[str] = None
