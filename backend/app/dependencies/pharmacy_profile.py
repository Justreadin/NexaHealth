# app/services/pharmacy_profile_service.py
from typing import Dict, List, Optional
from fastapi import HTTPException, status
from app.core.db import users_collection, get_server_timestamp
import logging

logger = logging.getLogger(__name__)

class PharmacyProfileService:
    def __init__(self):
        self.required_fields = [
            "pharmacy_name", "email", "phone_number", "address",
            "about_pharmacy", "license_number", "established_year", "opening_hours"
        ]

    async def get_pharmacy_profile(self, pharmacy_id: str) -> Dict:
        try:
            doc = users_collection.document(pharmacy_id).get()
            if not doc.exists:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Pharmacy profile not found")

            profile_data = doc.to_dict() or {}
            profile_data["id"] = doc.id

            completeness = self._calculate_profile_completeness(profile_data)
            profile_data["profile_completeness"] = completeness["percentage"]

            return profile_data
        except HTTPException:
            raise
        except Exception as e:
            logger.exception("Error getting pharmacy profile")
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to fetch pharmacy profile")

    async def update_pharmacy_profile(self, pharmacy_id: str, update_data: Dict) -> Dict:
        try:
            doc = users_collection.document(pharmacy_id).get()
            if not doc.exists:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Pharmacy profile not found")

            update_data["updated_at"] = get_server_timestamp()
            users_collection.document(pharmacy_id).set(update_data, merge=True)

            updated_doc = users_collection.document(pharmacy_id).get()
            profile_data = updated_doc.to_dict() or {}
            profile_data["id"] = pharmacy_id

            completeness = self._calculate_profile_completeness(profile_data)
            profile_data["profile_completeness"] = completeness["percentage"]

            users_collection.document(pharmacy_id).set({"profile_completeness": completeness["percentage"]}, merge=True)

            logger.info(f"Pharmacy profile updated for: {pharmacy_id}")
            return profile_data
        except HTTPException:
            raise
        except Exception as e:
            logger.exception("Error updating pharmacy profile")
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to update pharmacy profile")

    async def publish_pharmacy_profile(self, pharmacy_id: str) -> Dict:
        try:
            doc_ref = users_collection.document(pharmacy_id)
            doc = doc_ref.get()
            if not doc.exists:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Pharmacy profile not found")

            profile_data = doc.to_dict() or {}

            # 1. Check if admin has verified the pharmacy
            if not profile_data.get("is_verified", False):
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Cannot publish profile until verified by admin"
                )

            # 2. Check profile completeness
            completeness = self._calculate_profile_completeness(profile_data)
            if completeness["percentage"] < 70:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Profile must be at least 70% complete to publish"
                )

            # 3. Publish profile
            update_data = {
                "is_published": True,
                "published_at": get_server_timestamp(),
                "updated_at": get_server_timestamp()
            }
            doc_ref.set(update_data, merge=True)

            updated_doc = doc_ref.get()
            profile_data = updated_doc.to_dict() or {}
            profile_data["id"] = pharmacy_id

            logger.info(f"Pharmacy profile published for: {pharmacy_id}")
            return profile_data

        except HTTPException:
            raise
        except Exception as e:
            logger.exception("Error publishing pharmacy profile")
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to publish pharmacy profile")

    async def unpublish_pharmacy_profile(self, pharmacy_id: str) -> Dict:
        try:
            update_data = {"is_published": False, "updated_at": get_server_timestamp()}
            users_collection.document(pharmacy_id).set(update_data, merge=True)

            doc = users_collection.document(pharmacy_id).get()
            profile_data = doc.to_dict() or {}
            profile_data["id"] = pharmacy_id

            logger.info(f"Pharmacy profile unpublished for: {pharmacy_id}")
            return profile_data
        except Exception as e:
            logger.exception("Error unpublishing pharmacy profile")
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to unpublish pharmacy profile")

    def _calculate_profile_completeness(self, profile_data: Dict) -> Dict:
        completed_fields = []
        missing_fields = []

        for field in self.required_fields:
            if profile_data.get(field) and str(profile_data[field]).strip():
                completed_fields.append(field)
            else:
                missing_fields.append(field)

        percentage = int((len(completed_fields) / len(self.required_fields)) * 100) if self.required_fields else 100

        next_steps = []
        if "license_number" in missing_fields:
            next_steps.append("Add your license number for verification")
        if "address" in missing_fields:
            next_steps.append("Add your pharmacy address")
        if "opening_hours" in missing_fields:
            next_steps.append("Set your business hours")
        if "about_pharmacy" in missing_fields:
            next_steps.append("Describe your pharmacy services")

        return {"percentage": percentage, "completed_fields": completed_fields, "missing_fields": missing_fields, "next_steps": next_steps}

    async def get_profile_completeness(self, pharmacy_id: str) -> Dict:
        try:
            doc = users_collection.document(pharmacy_id).get()
            if not doc.exists:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Pharmacy profile not found")

            profile_data = doc.to_dict() or {}
            return self._calculate_profile_completeness(profile_data)
        except HTTPException:
            raise
        except Exception as e:
            logger.exception("Error calculating profile completeness")
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to calculate profile completeness")

    async def get_profile_completeness(self, pharmacy_id: str) -> Dict:
        """Get detailed profile completeness analysis"""
        try:
            doc = users_collection.document(pharmacy_id).get()
            if not doc.exists:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Pharmacy profile not found"
                )
            
            profile_data = doc.to_dict()
            return self._calculate_profile_completeness(profile_data)
            
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Error calculating profile completeness: {str(e)}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to calculate profile completeness"
            )

# Initialize service instance
pharmacy_profile_service = PharmacyProfileService()