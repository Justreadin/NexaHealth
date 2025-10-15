# app/routers/pharmacy_profile.py
from fastapi import APIRouter, HTTPException, status, Depends, BackgroundTasks
from typing import Optional
import logging

from app.models.saas_profile import (
    PharmacyProfileResponse,
    PharmacyProfileUpdate,
    ProfileCompletenessResponse
)
from app.dependencies.pharmacy_profile import pharmacy_profile_service
from app.core.auth import get_current_active_user
from app.core.db import get_user_role

router = APIRouter(prefix="/profile", tags=["Pharmacy Profile"])
logger = logging.getLogger(__name__)

@router.get("/", response_model=PharmacyProfileResponse, operation_id="get_pharmacy_profile")
async def get_pharmacy_profile(
    current_user: dict = Depends(get_current_active_user)
):
    """Get current pharmacy profile"""
    try:
        user_role = get_user_role(current_user.id)
        if user_role != "pharmacy":
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied. Pharmacy role required.")

        profile = await pharmacy_profile_service.get_pharmacy_profile(current_user.id)
        return profile
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Error in get_pharmacy_profile")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to fetch pharmacy profile")

@router.put("/", response_model=PharmacyProfileResponse, operation_id="update_pharmacy_profile")
async def update_pharmacy_profile(
    update_data: PharmacyProfileUpdate,
    current_user: dict = Depends(get_current_active_user)
):
    """Update pharmacy profile"""
    try:
        user_id = current_user.id
        user_role = get_user_role(user_id)

        logger.warning(f"AUTH-DEBUG → user_id={user_id}, user_role={user_role}, full_user={current_user}")

        if user_role != "pharmacy":
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied. Pharmacy role required.")

        if "email" in update_data:
            update_data.pop("email")

        update_dict = update_data.model_dump(exclude_unset=True)
        profile = await pharmacy_profile_service.update_pharmacy_profile(current_user.id, update_dict)
        return profile
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Error in update_pharmacy_profile")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to update pharmacy profile")

@router.post("/publish", response_model=PharmacyProfileResponse, operation_id="publish_pharmacy_profile")
async def publish_pharmacy_profile(
    current_user: dict = Depends(get_current_active_user)
):
    """Publish pharmacy profile to make it publicly visible"""
    try:
        user_role = get_user_role(current_user.id)
        if user_role != "pharmacy":
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied. Pharmacy role required.")

        profile = await pharmacy_profile_service.publish_pharmacy_profile(current_user.id)
        return profile
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Error in publish_pharmacy_profile")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to publish pharmacy profile")

@router.post("/unpublish", response_model=PharmacyProfileResponse, operation_id="unpublish_pharmacy_profile")
async def unpublish_pharmacy_profile(
    current_user: dict = Depends(get_current_active_user)
):
    """Unpublish pharmacy profile"""
    try:
        user_role = get_user_role(current_user.id)
        if user_role != "pharmacy":
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied. Pharmacy role required.")

        profile = await pharmacy_profile_service.unpublish_pharmacy_profile(current_user.id)
        return profile
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Error in unpublish_pharmacy_profile")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to unpublish pharmacy profile")

@router.get("/completeness", response_model=ProfileCompletenessResponse, operation_id="get_profile_completeness")
async def get_profile_completeness(
    current_user: dict = Depends(get_current_active_user)
):
    """Get detailed profile completeness analysis"""
    try:
        user_role = get_user_role(current_user.id)
        if user_role != "pharmacy":
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied. Pharmacy role required.")

        completeness = await pharmacy_profile_service.get_profile_completeness(current_user.id)
        return completeness
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Error in get_profile_completeness")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to get profile completeness")


@router.get("/{pharmacy_id}", response_model=PharmacyProfileResponse, operation_id="get_pharmacy_profile_by_id")
async def get_pharmacy_profile_by_id(
    pharmacy_id: str,
    current_user: dict = Depends(get_current_active_user)
):
    """Get pharmacy profile by ID (for public access)"""
    try:
        profile = await pharmacy_profile_service.get_pharmacy_profile(pharmacy_id)

        user_role = get_user_role(current_user.id)
        is_owner = current_user.id == pharmacy_id
        is_admin = user_role == "admin"
        is_published = profile.get("is_published", False)

        if not (is_owner or is_admin or is_published):
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Pharmacy profile not found")

        return profile
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Error in get_pharmacy_profile_by_id")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to fetch pharmacy profile")