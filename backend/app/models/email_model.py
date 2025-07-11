from pydantic import BaseModel, EmailStr, Field
from typing import Annotated

class EmailConfirmation(BaseModel):
    email: EmailStr
    code: Annotated[str, Field(min_length=6, max_length=6, pattern=r"^\d+$")]

class ResendConfirmationRequest(BaseModel):
    email: EmailStr