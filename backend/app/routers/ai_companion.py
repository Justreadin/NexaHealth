from fastapi import APIRouter, HTTPException, Query
from app.models.chat_model import ChatRequest, ChatResponse, HistoryResponse
from app.core.openrouter_ai import get_ai_response

router = APIRouter()
chat_histories = {}


@router.post("/ai-companion/chat", response_model=ChatResponse)
async def chat_with_ai(payload: ChatRequest):
    try:
        # Get formatted response with proper structure
        ai_reply = get_ai_response(
            payload.message,
            history=chat_histories.get(payload.user_id, []) if hasattr(payload, 'user_id') else None
        )

        # Store in history if user_id provided
        if hasattr(payload, 'user_id'):
            chat_histories.setdefault(payload.user_id, []).extend([
                {"role": "user", "content": payload.message},
                {"role": "assistant", "content": ai_reply}
            ])

        return {"response": ai_reply}

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/ai-companion/history", response_model=HistoryResponse)
async def get_chat_history(user_id: str = Query(..., description="User ID to fetch history for")):
    history = chat_histories.get(user_id, [])
    return {"history": history}


@router.delete("/ai-companion/history", status_code=204)
async def clear_chat_history(user_id: str = Query(..., description="User ID to clear history for")):
    chat_histories.pop(user_id, None)
    return