from fastapi import APIRouter, Depends, HTTPException
from app.models.chat_model import ChatRequest, ChatResponse, HistoryResponse
from app.core.openrouter_ai import get_ai_response
from app.dependencies.auth import guest_or_auth

router = APIRouter()

# Store chat histories separately for users and guests
user_chat_histories = {}
guest_chat_histories = {}

@router.post("/ai-companion/chat", response_model=ChatResponse)
async def chat_with_ai(
    payload: ChatRequest,
    auth_state: tuple = Depends(guest_or_auth(max_uses=5, feature_name="ai_chat"))
):
    user, guest = auth_state
    user_id = user.id if user else f"guest_{guest.id}"
    
    try:
        history = (user_chat_histories if user else guest_chat_histories).get(user_id, [])
        ai_reply = get_ai_response(payload.message, history=history)
        
        # Store in appropriate history
        history_store = user_chat_histories if user else guest_chat_histories
        history_store.setdefault(user_id, []).extend([
            {"role": "user", "content": payload.message},
            {"role": "assistant", "content": ai_reply}
        ])

        return {"response": ai_reply}

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/ai-companion/history", response_model=HistoryResponse)
async def get_chat_history(
    auth_state: tuple = Depends(guest_or_auth())
):
    user, guest = auth_state
    user_id = user.id if user else f"guest_{guest.id}"
    history = (user_chat_histories if user else guest_chat_histories).get(user_id, [])
    return {"history": history}

@router.delete("/ai-companion/history", status_code=204)
async def clear_chat_history(
    auth_state: tuple = Depends(guest_or_auth())
):
    user, guest = auth_state
    user_id = user.id if user else f"guest_{guest.id}"
    if user:
        user_chat_histories.pop(user_id, None)
    else:
        guest_chat_histories.pop(user_id, None)
    return