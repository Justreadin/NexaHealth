# app/services/pharmacy_service.py
import logging
from datetime import datetime
from typing import Optional, Dict, Any
from fastapi import HTTPException, status
from app.core.db import users_collection, stats_collection, get_server_timestamp
from app.core.auth import get_password_hash, verify_password

logger = logging.getLogger(__name__)

class PharmacyService:
    @staticmethod
    async def register_pharmacy(pharmacy_data: Dict[str, Any]) -> Dict[str, Any]:
        """Register a new pharmacy"""
        try:
            # Check if email already exists
            query = users_collection.where("email", "==", pharmacy_data["email"]).limit(1).get()
            if query:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Email already registered"
                )

            # Check if phone number already exists
            phone_query = users_collection.where("phone_number", "==", pharmacy_data["phone_number"]).limit(1).get()
            if phone_query:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Phone number already registered"
                )

            # Create pharmacy document
            doc_ref = users_collection.document()
            now = get_server_timestamp()
            
            # Hash password
            hashed_password = get_password_hash(pharmacy_data["password"])
            
            pharmacy_doc = {
                "pharmacy_name": pharmacy_data["pharmacy_name"],
                "email": pharmacy_data["email"],
                "phone_number": pharmacy_data["phone_number"],
                "hashed_password": hashed_password,
                "status": "pending",
                "role": "pharmacy",
                "badges": [{"badge_type": "Partner", "assigned_at": now}],
                "verified_drugs": [],
                "reports": [],
                "reports_against": [],
                "avg_rating": None,
                "total_verifications": 0,
                "total_reports": 0,
                "profile_completeness": 25,  # Basic info filled
                "created_at": now,
                "updated_at": now,
                "last_login": None
            }

            doc_ref.set(pharmacy_doc)

            # Update stats
            stats_doc = stats_collection.document("pharmacies")
            stats_data = stats_doc.get().to_dict() or {"count": 0}
            stats_doc.set({
                "count": stats_data.get("count", 0) + 1,
                "updated_at": now
            }, merge=True)

            return {
                "id": doc_ref.id,
                "pharmacy_name": pharmacy_data["pharmacy_name"],
                "email": pharmacy_data["email"],
                "phone_number": pharmacy_data["phone_number"],
                "status": "pending",
                "badges": ["Partner"]
            }

        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Pharmacy registration error: {str(e)}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to register pharmacy"
            )

    @staticmethod
    async def authenticate_pharmacy(email: str, password: str) -> Dict[str, Any]:
        """Authenticate pharmacy login with support for multi-role accounts"""
        try:
            query = users_collection.where("email", "==", email).stream()
            docs = list(query)
            if not docs:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Account not found"
                )

            doc = docs[0]
            user_data = doc.to_dict()

            # ✅ Safely load roles
            roles = user_data.get("roles") or []
            if not roles and user_data.get("role"):
                roles = [user_data["role"]]

            # ✅ If pharmacy role missing, add it
            if "pharmacy" not in roles:
                roles.append("pharmacy")
                users_collection.document(doc.id).update({"roles": roles})
                user_data["roles"] = roles  # refresh local data

            # ✅ Confirm hashed password exists
            hashed_pw = user_data.get("hashed_password")
            if not hashed_pw:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Password not set for this account"
                )

            # ✅ Check password
            if not verify_password(password, hashed_pw):
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Invalid credentials"
                )

            # ✅ Allow login if pending, only block rejected
            status = user_data.get("status", "pending")
            if status == "rejected":
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Pharmacy account rejected"
                )

            # ✅ Update last login
            users_collection.document(doc.id).update({
                "last_login": get_server_timestamp()
            })

            # ✅ Clean response
            response_data = {
                key: value for key, value in user_data.items()
                if key not in ["hashed_password"]
            }
            response_data["id"] = doc.id
            response_data["roles"] = roles

            return response_data

        except HTTPException:
            raise
        except Exception as e:
            import traceback
            print("\n🔥 AUTH ERROR TRACEBACK 🔥")
            traceback.print_exc()

            raise HTTPException(
                status_code=500,
                detail=str(e)
            )

    @staticmethod
    async def get_pharmacy_profile(pharmacy_id: str) -> Dict[str, Any]:
        """Get pharmacy profile by ID"""
        try:
            doc = users_collection.document(pharmacy_id).get()
            if not doc.exists:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Pharmacy not found"
                )

            pharmacy_data = doc.to_dict()
            if pharmacy_data.get("role") != "pharmacy":
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Pharmacy not found"
                )

            # Remove sensitive data
            pharmacy_data.pop("hashed_password", None)
            pharmacy_data["id"] = doc.id

            return pharmacy_data

        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Get pharmacy profile error: {str(e)}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to fetch pharmacy profile"
            )

    @staticmethod
    async def update_pharmacy_profile(pharmacy_id: str, updates: Dict[str, Any]) -> Dict[str, Any]:
        """Update pharmacy profile"""
        try:
            doc_ref = users_collection.document(pharmacy_id)
            doc = doc_ref.get()
            
            if not doc.exists:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Pharmacy not found"
                )

            pharmacy_data = doc.to_dict()
            if pharmacy_data.get("role") != "pharmacy":
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Pharmacy not found"
                )

            # Calculate profile completeness
            if updates:
                completeness = PharmacyService._calculate_profile_completeness(
                    {**pharmacy_data, **updates}
                )
                updates["profile_completeness"] = completeness

            updates["updated_at"] = get_server_timestamp()
            doc_ref.update(updates)

            return {
                "message": "Profile updated successfully",
                "pharmacy_id": pharmacy_id,
                "updates": updates
            }

        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Update pharmacy profile error: {str(e)}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to update pharmacy profile"
            )

    @staticmethod
    def _calculate_profile_completeness(pharmacy_data: Dict[str, Any]) -> int:
        """Calculate profile completeness percentage"""
        fields = [
            "pharmacy_name", "email", "phone_number", "address",
            "cac_number", "licence_url", "operating_hours", "website_url"
        ]
        
        completed = 0
        for field in fields:
            if pharmacy_data.get(field):
                completed += 1

        return min(100, int((completed / len(fields)) * 100))

    @staticmethod
    async def get_pharmacy_metrics(pharmacy_id: str) -> Dict[str, Any]:
        """Get pharmacy dashboard metrics"""
        try:
            doc = users_collection.document(pharmacy_id).get()
            if not doc.exists:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Pharmacy not found"
                )

            pharmacy_data = doc.to_dict()
            if pharmacy_data.get("role") != "pharmacy":
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Pharmacy not found"
                )

            metrics = {
                "verified_drugs": len(pharmacy_data.get("verified_drugs", [])),
                "total_verifications": pharmacy_data.get("total_verifications", 0),
                "active_reports": len(pharmacy_data.get("reports", [])),
                "reports_against": len(pharmacy_data.get("reports_against", [])),
                "average_rating": pharmacy_data.get("avg_rating", None),
                "profile_completeness": pharmacy_data.get("profile_completeness", 0),
                "badges_count": len(pharmacy_data.get("badges", []))
            }

            return {
                "pharmacy_id": pharmacy_id,
                "metrics": metrics
            }

        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Get pharmacy metrics error: {str(e)}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to fetch pharmacy metrics"
            )


pharmacy_service = PharmacyService()