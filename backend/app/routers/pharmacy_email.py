# app/routers/pharmacy_email.py
from fastapi import APIRouter, HTTPException, status, Depends, BackgroundTasks
from pydantic import BaseModel, EmailStr
from typing import Optional
from app.services.pharmacy_email_service import pharmacy_email_service
from app.core.pharmacy_auth import get_current_active_pharmacy
from app.core.db import users_collection, get_server_timestamp
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/email", tags=["Pharmacy Email"])

# Schemas
class SendConfirmationEmail(BaseModel):
    email: EmailStr

class ConfirmEmailRequest(BaseModel):
    token: str

class EmailResponse(BaseModel):
    message: str
    success: bool

# Routes
@router.post("/send-confirmation", response_model=EmailResponse)
async def send_confirmation_email(
    background_tasks: BackgroundTasks,
    pharmacy: dict = Depends(get_current_active_pharmacy)
):
    """Send email confirmation to pharmacy :cite[9]"""
    try:
        pharmacy_id = pharmacy["id"]
        email = pharmacy["email"]
        pharmacy_name = pharmacy["pharmacy_name"]

        # Check if email is already verified
        if pharmacy.get("email_verified"):
            return EmailResponse(
                message="Email is already verified",
                success=True
            )

        # Add email sending to background tasks
        background_tasks.add_task(
            pharmacy_email_service.send_pharmacy_confirmation_email,
            pharmacy_id,
            email,
            pharmacy_name
        )

        return EmailResponse(
            message="Confirmation email sent successfully",
            success=True
        )

    except Exception as e:
        logger.error(f"Send confirmation email error: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to send confirmation email"
        )

@router.post("/confirm", response_model=EmailResponse)
async def confirm_email(
    payload: ConfirmEmailRequest
):
    """Confirm pharmacy email using token :cite[6]:cite[9]"""
    try:
        # Verify the confirmation token
        token_data = pharmacy_email_service.verify_confirmation_token(payload.token)
        if not token_data:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid or expired confirmation token"
            )

        pharmacy_id = token_data["pharmacy_id"]
        email = token_data["email"]

        # Update pharmacy email verification status
        doc_ref = users_collection.document(pharmacy_id)
        doc = doc_ref.get()

        if not doc.exists:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Pharmacy not found"
            )

        pharmacy_data = doc.to_dict()

        # Check if already verified
        if pharmacy_data.get("email_verified"):
            return EmailResponse(
                message="Email already verified",
                success=True
            )

        # Verify email matches
        if pharmacy_data.get("email") != email:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Email mismatch"
            )

        # Update verification status
        updates = {
            "email_verified": True,
            "email_verified_at": get_server_timestamp(),
            "updated_at": get_server_timestamp()
        }

        doc_ref.update(updates)

        # Send welcome email
        await pharmacy_email_service.send_pharmacy_welcome_email(
            email, 
            pharmacy_data.get("pharmacy_name", "Pharmacy")
        )

        return EmailResponse(
            message="Email verified successfully",
            success=True
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Confirm email error: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to verify email"
        )

@router.post("/resend-confirmation", response_model=EmailResponse)
async def resend_confirmation_email(
    background_tasks: BackgroundTasks,
    pharmacy: dict = Depends(get_current_active_pharmacy)
):
    """Resend confirmation email"""
    try:
        if pharmacy.get("email_verified"):
            return EmailResponse(
                message="Email is already verified",
                success=True
            )

        background_tasks.add_task(
            pharmacy_email_service.send_pharmacy_confirmation_email,
            pharmacy["id"],
            pharmacy["email"],
            pharmacy["pharmacy_name"]
        )

        return EmailResponse(
            message="Confirmation email resent successfully",
            success=True
        )

    except Exception as e:
        logger.error(f"Resend confirmation email error: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to resend confirmation email"
        )

@router.get("/verification-status")
async def get_verification_status(
    pharmacy: dict = Depends(get_current_active_pharmacy)
):
    """Get email verification status"""
    return {
        "email_verified": pharmacy.get("email_verified", False),
        "email_verified_at": pharmacy.get("email_verified_at"),
        "email": pharmacy.get("email")
    }