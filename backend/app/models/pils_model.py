from pydantic import BaseModel, Field, validator
from typing import List, Optional, Dict, Union
from datetime import datetime
from enum import Enum

class Manufacturer(BaseModel):
    name: Optional[str] = None
    country: Optional[str] = None
    total_products: Optional[int] = None
    total_ingredients: Optional[int] = None

class Approval(BaseModel):
    approval_date: Optional[str] = None
    expiry_date: Optional[str] = None
    status: Optional[str] = None

class Verification(BaseModel):
    status: Optional[str] = None

class SMPC(BaseModel):
    url: Optional[str] = None
    path: Optional[str] = None

class TherapeuticUse(BaseModel):
    description: Optional[str] = ""
    indications: Optional[List[str]] = []

class Administration(BaseModel):
    method: Optional[str] = ""
    dosage: Optional[str] = ""
    precautions: Optional[List[str]] = []

class SideEffects(BaseModel):
    very_common: Optional[List[str]] = Field(default_factory=list, alias="very common")
    common: Optional[List[str]] = Field(default_factory=list)
    uncommon: Optional[List[str]] = Field(default_factory=list)
    rare: Optional[List[str]] = Field(default_factory=list)
    very_rare: Optional[List[str]] = Field(default_factory=list, alias="very rare")
    unknown: Optional[List[str]] = Field(default_factory=list)

    class Config:
        allow_population_by_field_name = True

class PILDocument(BaseModel):
    url: Optional[str] = None
    therapeutic_use: Optional[TherapeuticUse] = Field(default_factory=TherapeuticUse)
    contraindications: Optional[str] = ""
    administration: Optional[Administration] = Field(default_factory=Administration)
    side_effects: Optional[SideEffects] = Field(default_factory=SideEffects)
    interactions: Optional[List[str]] = Field(default_factory=list)
    storage: Optional[List[str]] = Field(default_factory=list)
    manufacturer_info: Optional[str] = None

    @validator('storage', pre=True)
    def ensure_storage_is_list(cls, v):
        if isinstance(v, str):
            return [v]
        if v is None:
            return []
        return v

class Documents(BaseModel):
    smpc: Optional[SMPC] = Field(default_factory=SMPC)
    pil: Optional[PILDocument] = Field(default_factory=PILDocument)

class Identifiers(BaseModel):
    nafdac_reg_no: Optional[str] = None
    product_id: Optional[int] = None

class DrugCategory(str, Enum):
    OTC = "Over-the-counter (OTC)"
    POM = "Prescription-only Medicine (POM)"
    HERBAL = "Herbal Medicine"
    SUPPLEMENT = "Supplement"
    VACCINE = "Vaccine"
    OTHER = "Other"

class PILBase(BaseModel):
    nexahealth_id: int
    unified_id: str
    product_name: str
    generic_name: str
    dosage_form: str
    strength: str
    description: Optional[str] = ""
    composition: Optional[str] = ""
    pack_size: Optional[str] = ""
    atc_code: Optional[str] = ""
    category: Optional[DrugCategory] = None
    identifiers: Optional[Identifiers] = Field(default_factory=Identifiers)
    manufacturer: Optional[Manufacturer] = Field(default_factory=Manufacturer)
    approval: Optional[Approval] = Field(default_factory=Approval)
    verification: Optional[Verification] = Field(default_factory=Verification)
    documents: Optional[Documents] = Field(default_factory=Documents)
    featured: Optional[bool] = False
    tags: Optional[List[str]] = Field(default_factory=list)
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    @validator('tags', pre=True)
    def ensure_tags_is_list(cls, v):
        if v is None:
            return []
        return v

class PILInDB(PILBase):
    id: str

    def __hash__(self):
        return hash(self.id)

class UserInteractionBase(BaseModel):
    user_id: str
    pil_id: str
    saved: bool = False
    last_viewed: Optional[datetime] = None
    view_count: int = 0

class UserInteractionInDB(UserInteractionBase):
    id: str
    created_at: datetime = Field(default_factory=datetime.now)
    updated_at: datetime = Field(default_factory=datetime.now)