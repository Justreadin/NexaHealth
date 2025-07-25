# app/dependencies/auth.py
from fastapi import Depends, Request, HTTPException
from typing import Optional, Tuple, Union
from app.models.guest_model import GuestSession
from app.models.auth_model import UserPublic
from app.core.auth import get_current_user, oauth2_scheme
from app.core.guest import guest_sessions
from uuid import UUID
from datetime import datetime

async def get_auth_state(
    request: Request, 
    token: str = Depends(oauth2_scheme)
) -> Tuple[Optional[UserPublic], Optional[GuestSession]]:
    """Returns (user, guest_session) - one will be None"""
    # First check for authenticated user from middleware
    user = getattr(request.state, 'user', None)
    
    # If no user from middleware, try to get via token
    if not user and token:
        try:
            user = await get_current_user(token)
        except HTTPException:
            pass
    
    # Check for guest session if no authenticated user
    guest_session = None
    if not user:
        guest_id = request.cookies.get("guest_session_id") or request.headers.get("x-guest-session")
        if guest_id:
            try:
                guest_session = guest_sessions.get(UUID(guest_id))
            except ValueError:
                pass
    
    return user, guest_session

def guest_or_auth(max_uses: int = 5, feature_name: Optional[str] = None):
    """Flexible auth/guest dependency with usage limits"""
    async def dependency(auth_state: Tuple = Depends(get_auth_state)) -> Tuple[bool, Union[UserPublic, GuestSession]]:
        user, guest = auth_state
        
        if user:
            return True, user  # authenticated

        if guest:
            # Global usage limit
            if guest.request_count >= max_uses:
                raise HTTPException(
                    status_code=403,
                    detail="Guest usage limit reached. Please sign up."
                )
            
            # Feature-specific limit
            if feature_name:
                feature_uses = guest.feature_usage.get(feature_name, 0)
                if feature_uses >= max_uses:
                    raise HTTPException(
                        status_code=403,
                        detail=f"Guest limit reached for {feature_name}"
                    )
                guest.feature_usage[feature_name] = feature_uses + 1
            
            # Update global count
            guest.request_count += 1
            guest.last_activity = datetime.utcnow()

            return False, guest  # guest session

        raise HTTPException(
            status_code=403,
            detail="Please sign in or start a guest session"
        )
    return dependency