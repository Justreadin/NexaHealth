import os
import uuid
from datetime import datetime, timedelta
from typing import Optional, Union
import firebase_admin
from firebase_admin import auth, exceptions as firebase_exceptions
from jose import JWTError, jwt
from passlib.context import CryptContext
from fastapi import HTTPException, status, Depends, Request
from fastapi.security import OAuth2PasswordBearer, HTTPBearer, HTTPAuthorizationCredentials
from dotenv import load_dotenv
from app.models.auth_model import TokenData, UserInDB
from app.core.db import db, users_collection
import logging


logger = logging.getLogger(__name__)
load_dotenv()


# Password context configuration
pwd_context = CryptContext(
    schemes=["bcrypt"],
    deprecated="auto",
    bcrypt__rounds=12,
)

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="auth/login")

# JWT Configuration
SECRET_KEY = os.getenv("JWT_SECRET_KEY")
if not SECRET_KEY:
    raise ValueError("JWT_SECRET_KEY environment variable not set")

# Ensure secret key is in bytes format
try:
    SECRET_KEY = SECRET_KEY.encode('utf-8')
except AttributeError:
    pass  # Already in bytes format

ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 10080
REFRESH_TOKEN_EXPIRE_DAYS = 7

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="auth/login")
security_scheme = HTTPBearer()

def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password: str) -> str:
    return pwd_context.hash(password)

def create_access_token(user_data: dict) -> dict:
    """Centralized token creation function used by both login and refresh"""
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    refresh_token_expires = timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)
    
    token_payload = {
        "sub": user_data["email"],
        "user_id": user_data["id"],
        "email": user_data["email"],
        "first_name": user_data.get("first_name", ""),
        "last_name": user_data.get("last_name", ""),
        "role": user_data.get("role", "user"),
        "iss": os.getenv("JWT_ISSUER", "nexa-health"),
        "aud": os.getenv("JWT_AUDIENCE", "nexa-health-app"),
        "iat": datetime.utcnow(),
        "jti": str(uuid.uuid4()),
        "auth_time": int(datetime.utcnow().timestamp())
    }

    access_token = jwt.encode({
        **token_payload,
        "exp": datetime.utcnow() + access_token_expires,
        "token_type": "access",
        "scope": "read write"
    }, SECRET_KEY, algorithm=ALGORITHM)

    refresh_token = jwt.encode({
        **token_payload,
        "exp": datetime.utcnow() + refresh_token_expires,
        "token_type": "refresh",
        "scope": "refresh"
    }, SECRET_KEY, algorithm=ALGORITHM)

    # Ensure tokens are strings
    if isinstance(access_token, bytes):
        access_token = access_token.decode('utf-8')
    if isinstance(refresh_token, bytes):
        refresh_token = refresh_token.decode('utf-8')

    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "token_type": "bearer",
        "expires_in": int(access_token_expires.total_seconds())
    }

async def verify_token(token: str) -> dict:
    """Verify JWT token with comprehensive validation"""
    try:
        # First check token format
        if not token or len(token.split('.')) != 3:            
            raise JWTError("Invalid token format") 

        # Then decode and verify
        payload = jwt.decode(
            token,
            SECRET_KEY,
            algorithms=[ALGORITHM],
            audience=os.getenv("JWT_AUDIENCE", "nexa-health-app"),
            issuer=os.getenv("JWT_ISSUER", "nexa-health")
        )

        # Validate required claims
        required_claims = {
            "sub", "user_id", "exp", "iat", 
            "iss", "aud", "token_type"
        }
        if not all(claim in payload for claim in required_claims):
            raise jwt.MissingRequiredClaimError("Missing required claims")

        if payload["token_type"] not in ["access", "refresh"]:
            raise JWTError("Invalid token format")

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
    
async def get_current_user(
    request: Request,
    credentials: HTTPAuthorizationCredentials = Depends(security_scheme)
) -> UserInDB:
    """Get current user from JWT token in Authorization header or cookies."""
    token = None

    # 1️⃣ Try Authorization header first
    if credentials and credentials.scheme.lower() == "bearer":
        token = credentials.credentials

    # 2️⃣ Fallback: Try cookie named 'access_token'
    if not token:
        token = request.cookies.get("access_token")

    # 3️⃣ No token found at all
    if not token:
        logger.warning("No access token provided in header or cookie")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated"
        )

    try:

        payload = await verify_token(token)
        user_id = payload.get("user_id")
        if not user_id:
            raise HTTPException(status_code=401, detail="Invalid token payload")

        # Fetch user from Firestore
        user_doc = users_collection.document(user_id).get()
        if not user_doc.exists:
            logger.warning(f"User ID {user_id} not found in Firestore")
            raise HTTPException(status_code=401, detail="Invalid authentication credentials")

        return UserInDB(**user_doc.to_dict())

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"User retrieval failed: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials"
        )


async def get_current_active_user(current_user: UserInDB = Depends(get_current_user)):
    """Get the current active user"""
    if current_user.disabled:
        raise HTTPException(status_code=400, detail="Inactive user")
    return current_user

async def get_user_by_email(email: str) -> Optional[UserInDB]:
    """Get user by email from Firebase Auth and Firestore"""
    try:
        # Get user from Firebase Auth
        user = auth.get_user_by_email(email)
        
        # Get additional user data from Firestore using centralized db instance
        user_ref = db.collection("users").document(user.uid)
        user_doc = user_ref.get()

        if not user_doc.exists:
            logger.warning(f"No Firestore document found for user: {email}")
            return None

        user_data = user_doc.to_dict()
        
        # Convert Firestore timestamps to strings if needed
        def convert_timestamp(timestamp):
            if hasattr(timestamp, 'isoformat'):
                return timestamp.isoformat()
            return str(timestamp) if timestamp else None

        return UserInDB(
            id=user.uid,
            email=user.email,
            first_name=user_data.get("first_name", ""),
            last_name=user_data.get("last_name", ""),
            hashed_password=user_data.get("hashed_password", ""),
            disabled=user_data.get("disabled", False),
            email_verified=user_data.get("email_verified", user.email_verified),
            created_at=convert_timestamp(user_data.get("created_at")),
            last_login=convert_timestamp(user_data.get("last_login"))
        )

    except auth.UserNotFoundError:
        logger.warning(f"User not found in Firebase Auth: {email}")
        return None
    except Exception as e:
        logger.error(f"Error fetching user {email}: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error fetching user: {str(e)}"
        )

async def authenticate_user(email: str, password: str):
    """Authenticate a user with email and password"""
    user = await get_user_by_email(email)
    if not user:
        logger.warning(f"Authentication failed - user not found: {email}")
        return None
        
    if not user.hashed_password:
        logger.warning(f"Authentication failed - no password set (OAuth user?): {email}")
        return None
        
    if not verify_password(password, user.hashed_password):
        logger.warning(f"Authentication failed - invalid password for: {email}")
        return None
        
    logger.info(f"User authenticated successfully: {email}")
    return user

async def verify_google_token(token: str):
    """Verify a Google authentication token"""
    try:
        decoded_token = auth.verify_id_token(token)
        return decoded_token
    except ValueError as e:
        logger.error(f"Invalid Google token: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid Google authentication token"
        )
    except Exception as e:
        logger.error(f"Google token verification error: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error verifying Google token"
        )


async def get_current_active_user_optional(
    request: Request,
    credentials: HTTPAuthorizationCredentials = Depends(security_scheme)
) -> Optional[UserInDB]:
    """
    Variant of get_current_active_user that returns None if no token is provided,
    instead of raising an authentication error.
    Useful for endpoints where anonymous users should be allowed (e.g. referral links).
    """
    token = None

    # Try header
    if credentials and credentials.scheme.lower() == "bearer":
        token = credentials.credentials

    # Try cookie
    if not token:
        token = request.cookies.get("access_token")

    # No token found → anonymous
    if not token:
        return None

    try:
        current_user = await get_current_user(request, credentials)
        if current_user.disabled:
            return None
        return current_user
    except Exception:
        return None
