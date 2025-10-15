# app/core/pharmacy_auth.py
import os
import uuid
from datetime import datetime, timedelta
from typing import Optional, Dict, Any
from jose import JWTError, jwt
from passlib.context import CryptContext
from fastapi import HTTPException, status, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from app.core.db import users_collection
import logging

logger = logging.getLogger(__name__)

# Password context
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# JWT Configuration
SECRET_KEY = os.getenv("JWT_SECRET_KEY")
if not SECRET_KEY:
    raise ValueError("JWT_SECRET_KEY environment variable not set")

ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 10080  # 7 days
REFRESH_TOKEN_EXPIRE_DAYS = 30

security_scheme = HTTPBearer()

def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password: str) -> str:
    return pwd_context.hash(password)

def create_pharmacy_tokens(pharmacy_data: Dict[str, Any]) -> Dict[str, Any]:
    """Create JWT tokens for pharmacy"""
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    refresh_token_expires = timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)
    
    token_payload = {
        "sub": pharmacy_data["email"],
        "user_id": pharmacy_data["id"],
        "email": pharmacy_data["email"],
        "pharmacy_name": pharmacy_data.get("pharmacy_name", ""),
        "role": "pharmacy",
        "status": pharmacy_data.get("status", "pending"),
        "iss": "nexa-health-pharmacy",
        "aud": "nexa-health-pharmacy-app",
        "iat": datetime.utcnow(),
        "jti": str(uuid.uuid4()),
    }

    access_token = jwt.encode({
        **token_payload,
        "exp": datetime.utcnow() + access_token_expires,
        "token_type": "access",
        "scope": "pharmacy"
    }, SECRET_KEY, algorithm=ALGORITHM)

    refresh_token = jwt.encode({
        **token_payload,
        "exp": datetime.utcnow() + refresh_token_expires,
        "token_type": "refresh",
        "scope": "pharmacy_refresh"
    }, SECRET_KEY, algorithm=ALGORITHM)

    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "token_type": "bearer",
        "expires_in": int(access_token_expires.total_seconds()),
        "pharmacy_id": pharmacy_data["id"]
    }

async def verify_pharmacy_token(token: str) -> Dict[str, Any]:
    """Verify pharmacy JWT token"""
    try:
        payload = jwt.decode(
            token,
            SECRET_KEY,
            algorithms=[ALGORITHM],
            audience="nexa-health-pharmacy-app",
            issuer="nexa-health-pharmacy"
        )

        # Validate required claims
        required_claims = {"sub", "user_id", "role", "exp", "iat"}
        if not all(claim in payload for claim in required_claims):
            raise JWTError("Missing required claims")

        if payload.get("role") != "pharmacy":
            raise JWTError("Invalid role")

        if payload.get("token_type") not in ["access", "refresh"]:
            raise JWTError("Invalid token type")

        return payload

    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token expired"
        )
    except JWTError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid token: {str(e)}"
        )
    except Exception as e:
        logger.error(f"Token verification error: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials"
        )

async def get_current_pharmacy(credentials: HTTPAuthorizationCredentials = Depends(security_scheme)) -> Dict[str, Any]:
    """Get current pharmacy from JWT token"""
    try:
        token = credentials.credentials
        payload = await verify_pharmacy_token(token)
        
        pharmacy_id = payload.get("user_id")
        if not pharmacy_id:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token payload"
            )

        # Verify pharmacy exists and is active
        doc = users_collection.document(pharmacy_id).get()
        if not doc.exists:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Pharmacy not found"
            )

        pharmacy_data = doc.to_dict()
        if pharmacy_data.get("role") != "pharmacy":
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid pharmacy account"
            )

        if pharmacy_data.get("status") != "verified":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Pharmacy account pending verification"
            )

        return {**pharmacy_data, "id": doc.id}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Get current pharmacy error: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate pharmacy credentials"
        )

async def get_current_active_pharmacy(
    pharmacy: Dict[str, Any] = Depends(get_current_pharmacy)
) -> Dict[str, Any]:
    """Get current active pharmacy"""
    return pharmacy