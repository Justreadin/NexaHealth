from pydantic import BaseModel
from typing import List

class ChatRequest(BaseModel):
    message: str

class ChatResponse(BaseModel):
    response: str

class HistoryResponse(BaseModel):
    history: List[dict]  # list of {"role": str, "content": str}