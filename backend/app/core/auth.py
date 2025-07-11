import os
import json
import base64
from datetime import datetime, timedelta
from typing import Optional
import firebase_admin
from firebase_admin import auth
from jose import JWTError, jwt
from passlib.context import CryptContext
from fastapi import HTTPException, status, Depends
from fastapi.security import OAuth2PasswordBearer
from dotenv import load_dotenv
from app.models.auth_model import TokenData, UserInDB
from app.core.db import db  # Import the centralized db instance
import logging

# Initialize logging
logger = logging.getLogger(__name__)
load_dotenv()

# Remove Firebase initialization since it's now in core/db.py
# Just import the initialized db instance from core/db.py

# Password context configuration
pwd_context = CryptContext(
    schemes=["bcrypt"],
    deprecated="auto",
    bcrypt__rounds=12,
    bcrypt__ident="2b"
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
ACCESS_TOKEN_EXPIRE_MINUTES = 30

def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a plain password against the hashed version"""
    try:
        return pwd_context.verify(plain_password, hashed_password)
    except Exception as e:
        logger.error(f"Password verification error: {str(e)}")
        return False

def get_password_hash(password: str) -> str:
    """Generate a password hash"""
    return pwd_context.hash(password)

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    """Create a JWT access token"""
    to_encode = data.copy()
    expire = datetime.utcnow() + (expires_delta or timedelta(minutes=15))
    to_encode.update({"exp": expire})
    
    try:
        encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
        return encoded_jwt
    except Exception as e:
        logger.error(f"Token creation error: {str(e)}")
        raise ValueError(f"Could not create access token: {str(e)}")

async def get_current_user(token: str = Depends(oauth2_scheme)):
    """Get the current user from the JWT token"""
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        email: str = payload.get("sub")
        if not email:
            raise credentials_exception
        token_data = TokenData(email=email)
    except JWTError as e:
        logger.error(f"JWT decode error: {str(e)}")
        raise credentials_exception

    user = await get_user_by_email(token_data.email)
    if not user:
        raise credentials_exception
    return user

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