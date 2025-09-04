from fastapi import APIRouter, Request, Response, Header, Cookie, HTTPException
from datetime import datetime, timedelta
from uuid import UUID, uuid4
from typing import Optional
from app.models.guest_model import GuestSession
from app.core.guest import (
    initialize_guest_session,
    load_guest_session,
    create_ip_hash,
    delete_guest_session
)

router = APIRouter(
    prefix="/guest",
    tags=["guest_sessions"],
    responses={404: {"description": "Not found"}},
)

@router.post("/session", response_model=GuestSession)
async def create_guest_session(
    request: Request,
    response: Response,
    user_agent: Optional[str] = Header(None),
    device_id: Optional[str] = Header(None)
):
    # Check if client already has a valid session
    existing_session_id = request.cookies.get("guest_session_id")
    if existing_session_id:
        try:
            existing = load_guest_session(UUID(existing_session_id))
            if existing and datetime.utcnow() < existing.expires_at:
                return existing
        except Exception:
            pass

    # Create new session
    ip_hash = create_ip_hash(request.client.host or "", user_agent or "")
    session_id = uuid4()

    session = initialize_guest_session(
        session_id=session_id,
        ip_address=request.client.host or "",
        user_agent=user_agent or "unknown"
    )
    session.device_id = device_id
    session.last_used_at = datetime.utcnow()

    response.set_cookie(
        key="guest_session_id",
        value=str(session.id),
        httponly=True,
        secure=True,
        samesite="lax",
        max_age=int(timedelta(days=7).total_seconds())
    )
    return session

@router.get("/session", response_model=GuestSession)
async def get_guest_session(
    guest_session_id: Optional[UUID] = Cookie(None)
):
    if not guest_session_id:
        raise HTTPException(status_code=404, detail="Session not found")

    session = load_guest_session(guest_session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    if datetime.utcnow() > session.expires_at:
        delete_guest_session(guest_session_id)
        raise HTTPException(status_code=410, detail="Session expired")

    session.last_used_at = datetime.utcnow()
    return session

@router.delete("/session")
async def end_guest_session(
    response: Response,
    guest_session_id: Optional[UUID] = Cookie(None)
):
    if guest_session_id:
        delete_guest_session(guest_session_id)

    response.delete_cookie("guest_session_id")
    return {"message": "Session ended"}
