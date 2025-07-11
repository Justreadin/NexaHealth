from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime

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
