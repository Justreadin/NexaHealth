# app/routers/pharmacy_auth.py
from fastapi import APIRouter, HTTPException, status, Depends, BackgroundTasks
from pydantic import BaseModel, EmailStr
from typing import Optional
from app.dependencies.pharmacy_service import pharmacy_service
from app.services.pharmacy_email_service import pharmacy_email_service
from app.core.auth import create_access_token, get_current_active_user, verify_refresh_token
from app.core.db import set_user_role, users_collection, get_user_role
import traceback

router = APIRouter(prefix="/auth", tags=["Pharmacy Authentication"])

# Schemas
class PharmacyRegister(BaseModel):
    pharmacy_name: str
    email: EmailStr
    phone_number: str
    password: str

class PharmacyLogin(BaseModel):
    email: EmailStr
    password: str

class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str
    expires_in: int
    pharmacy_id: str
    pharmacy_name: str

class PharmacyProfileResponse(BaseModel):
    id: str
    pharmacy_name: str
    email: str
    phone_number: str
    status: str
    badges: list
    profile_completeness: int
    avg_rating: Optional[float]
    total_verifications: int

@router.post("/register", status_code=status.HTTP_201_CREATED)
async def register_pharmacy(
        background_tasks: BackgroundTasks,
        payload: PharmacyRegister
    ):
    """Register a new pharmacy with email confirmation"""
    try:
        pharmacy_data = {
            "pharmacy_name": payload.pharmacy_name,
            "email": payload.email,
            "phone_number": payload.phone_number,
            "password": payload.password
        }

        result = await pharmacy_service.register_pharmacy(pharmacy_data)

        # Ensure roles array contains 'pharmacy'
        set_user_role(result["id"], "pharmacy")

        # Ensure default status
        users_collection.document(result["id"]).set({"status": "pending"}, merge=True)

        background_tasks.add_task(
            pharmacy_email_service.send_pharmacy_confirmation_email,
            result["id"],
            payload.email,
            payload.pharmacy_name
        )

        return {"message": "Pharmacy registered successfully. Please check email for verification.", "data": result}
    except HTTPException:
        raise
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Registration failed")

@router.post("/login", operation_id="pharmacy_login", response_model=TokenResponse)
async def login_pharmacy(payload: PharmacyLogin):
    """Login pharmacy and return tokens"""
    try:
        pharmacy_data = await pharmacy_service.authenticate_pharmacy(payload.email, payload.password)

        tokens = create_access_token(pharmacy_data)

        return TokenResponse(
            **tokens,
            pharmacy_id=pharmacy_data.get("id", ""),
            pharmacy_name=pharmacy_data.get("pharmacy_name", pharmacy_data.get("pharmacy_name", ""))
        )
    except HTTPException:
        raise
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Login failed: {str(e)}")

from app.core.db import users_collection

@router.get("/me", operation_id="pharmacy_profile", response_model=PharmacyProfileResponse)
async def get_current_pharmacy_profile(
    pharmacy = Depends(get_current_active_user)
):
    """Get current pharmacy profile"""
    try:
        # Fetch full profile from Firestore using the pharmacy's ID
        doc = users_collection.document(pharmacy.id).get()
        data = doc.to_dict() if doc.exists else {}

        return PharmacyProfileResponse(
            id=pharmacy.id,
            pharmacy_name=data.get("pharmacy_name", ""),
            email=pharmacy.email,
            phone_number=data.get("phone_number", ""),
            status=data.get("status", "pending"),
            badges=data.get("badges", []),
            profile_completeness=data.get("profile_completeness", 0),
            avg_rating=data.get("avg_rating"),
            total_verifications=data.get("total_verifications", 0)
        )

    except Exception as e:
        print("ERROR IN /pharmacy/auth/me:", e)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to fetch pharmacy profile"
        )


@router.post("/refresh")
async def refresh_tokens(refresh_token: str):
    """Refresh access token using a valid refresh token"""
    try:
        token_payload = await verify_refresh_token(refresh_token)

        new_access_payload = {
            "id": token_payload.get("user_id"),
            "email": token_payload.get("email"),
            "roles": token_payload.get("roles", ["user"]),
            "first_name": token_payload.get("first_name", ""),
            "last_name": token_payload.get("last_name", "")
        }

        new_tokens = create_access_token(new_access_payload)
        return {
            "access_token": new_tokens["access_token"],
            "refresh_token": refresh_token,
            "token_type": "bearer",
            "expires_in": new_tokens["expires_in"]
        }
    except HTTPException:
        raise
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=f"Token refresh failed: {str(e)}")

@router.post("/logout")
async def logout_pharmacy():
    """Logout pharmacy (client-side token removal)"""
    return {"message": "Logged out successfully"}