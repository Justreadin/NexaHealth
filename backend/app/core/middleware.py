# app/core/middleware.py
import logging
from typing import Optional
from fastapi import Request, HTTPException, status
from fastapi.responses import JSONResponse
from datetime import datetime
import firebase_admin
from firebase_admin import auth, exceptions as firebase_exceptions
from firebase_admin import firestore
from pydantic import ValidationError
from app.core.db import db, users_collection
from app.models.auth_model import UserInDB
from app.core.auth import verify_token

logger = logging.getLogger(__name__)

class AuthMiddleware:
    PUBLIC_PATHS = [
    "/", 
    "/auth",
    "/auth/login", 
    "/auth/signup", 
    "/auth/confirm-email",
    "/auth/google-login", 
    "/auth/request-password-reset",
    "/auth/reset-password", 
    "/auth/check-confirmation",
    "/auth/resend-confirmation", 
    "/guest/",
    "/health",
    "/docs",
    "/openapi.json",
    "/static",
    "/uploads",
    "/api/test_verify/drug",
    "/submit-report",
    "/api/test_pil",  
    ]
    
    @classmethod
    async def authenticate(cls, request: Request, call_next):
        """Main authentication middleware"""
        try:
            if (
                request.method == "OPTIONS"
                or any(request.url.path.startswith(path) for path in cls.PUBLIC_PATHS)
                or any(request.url.path.startswith(path) for path in ["/static", "/uploads"])
            ):
                return await call_next(request)

            # Verify Authorization header
            auth_header = request.headers.get("Authorization")
            if not auth_header or not auth_header.startswith("Bearer "):
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Missing or invalid authorization header",
                    headers={"WWW-Authenticate": "Bearer"},
                )

            # Verify token and get user
            token = auth_header.split(" ")[1]
            user = await cls.verify_and_get_user(token)
            if not user:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Invalid or expired token",
                    headers={"WWW-Authenticate": "Bearer"},
                )

            # Attach user to request state
            request.state.user = user

            # Check admin routes
            if request.url.path.startswith("/admin/") and user.role != "admin":
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Insufficient permissions"
                )

            # Proceed with the request
            response = await call_next(request)

            # Add security headers
            response.headers["X-Content-Type-Options"] = "nosniff"
            response.headers["X-Frame-Options"] = "DENY"
            response.headers["X-XSS-Protection"] = "1; mode=block"

            return response

        except HTTPException as e:
            logger.error(f"Authentication error: {str(e)}")
            return JSONResponse(
                status_code=e.status_code,
                content={"detail": e.detail},
                headers=e.headers
            )
        except Exception as e:
            logger.error(f"Unexpected error: {str(e)}")
            return JSONResponse(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                content={"detail": "Internal server error"}
            )

    @staticmethod
    async def verify_and_get_user(token: str) -> Optional[UserInDB]:
        try:
            payload = await verify_token(token)
            user_id = payload.get("user_id")
            if not user_id:
                return None

            user_doc = db.collection("users").document(user_id).get()
            if not user_doc.exists:
                return None

            user_data = user_doc.to_dict()

            # Ensure all required fields exist
            user_data.setdefault("created_at", None)
            user_data.setdefault("last_login", None)
            user_data.setdefault("role", "user")
            user_data.setdefault("disabled", False)
            user_data.setdefault("email_verified", False)

            # Add the Firestore document ID to the user_data before unpacking
            user_data["id"] = user_id
            user_data["email"] = payload.get("sub")

            return UserInDB(**user_data)


        except Exception as e:
            logger.error(f"User retrieval error: {str(e)}")
            return None