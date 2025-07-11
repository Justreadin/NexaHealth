from typing import Optional,Literal ,List
from pydantic import BaseModel

class DrugVerificationRequest(BaseModel):
    product_name: str | None = None
    nafdac_reg_no: str | None = None

class DrugVerificationResponse(BaseModel):
    status: Literal["verified", "flagged", "unknown", "partial_match"]
    message: str
    product_name: Optional[str] = None
    dosage_form: Optional[str] = None
    strengths: Optional[List[str]] = None
    ingredients: Optional[List[str]] = None
    nafdac_reg_no: Optional[str] = None
    match_score: Optional[int] = None  # out of 100

