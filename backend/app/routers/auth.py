from fastapi import APIRouter, Depends, HTTPException, status, Request, Cookie
from fastapi.security import OAuth2PasswordRequestForm
from datetime import timedelta, datetime
from uuid import UUID
from typing import Dict, Optional
import firebase_admin
from firebase_admin import auth
from firebase_admin.exceptions import FirebaseError
import logging
import random
import string
from passlib.context import CryptContext
from app.models.auth_model import (
    UserCreate, UserPublic, Token, GoogleToken,
    PasswordResetRequest, PasswordReset, UserInDB
)
from app.models.email_model import (
    ResendConfirmationRequest, EmailConfirmation
)
from app.core.auth import (
    get_password_hash, create_access_token,
    get_current_user, get_current_active_user,
    verify_google_token, ACCESS_TOKEN_EXPIRE_MINUTES
)
from app.core.guest import migrate_guest_data
from app.dependencies.auth import get_auth_state
from app.services.email_service import email_service
from app.core.db import db, get_server_timestamp, users_collection
from dotenv import load_dotenv
import os

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)
load_dotenv()

router = APIRouter(
    prefix="/auth",
    tags=["authentication"],
    responses={404: {"description": "Not found"}},
)

# Initialize password context
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

pending_confirmations: Dict[str, dict] = {}

def generate_confirmation_code(length=6):
    """Generate a numeric confirmation code"""
    return ''.join(random.choices(string.digits, k=length))

def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a plain password against a hashed password"""
    return pwd_context.verify(plain_password, hashed_password)

@router.post("/signup", response_model=dict)
async def signup(
    user: UserCreate,
    request: Request,
    guest_session_id: UUID = Cookie(None)
):
    try:
        # Check if user exists
        try:
            existing_user = auth.get_user_by_email(user.email)
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Email already registered"
            )
        except auth.UserNotFoundError:
            pass  # Expected for new users
        except FirebaseError as firebase_err:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Authentication service unavailable"
            )

        # Check for pending confirmations
        if user.email in pending_confirmations:
            existing = pending_confirmations[user.email]
            if datetime.now() < existing["expires_at"]:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Confirmation already sent"
                )
            else:
                del pending_confirmations[user.email]

        # Generate 6-digit confirmation code
        confirmation_code = generate_confirmation_code()
        expires_at = datetime.now() + timedelta(hours=24)
        
        # Store both plain password (for Firebase Auth) and hashed password (for our system)
        pending_confirmations[user.email] = {
            "user_data": {
                "email": user.email,
                "first_name": user.first_name,
                "last_name": user.last_name,
                "password": user.password,  # Plain password for Firebase Auth
                "hashed_password": get_password_hash(user.password)  # Hashed password for our system
            },
            "confirmation_code": confirmation_code,
            "expires_at": expires_at,
            "guest_session_id": str(guest_session_id) if guest_session_id else None,
            "ip_address": request.client.host
        }

        try:
            email_sent = await email_service.send_confirmation_email(
                email=user.email,
                name=f"{user.first_name} {user.last_name}",
                code=confirmation_code
            )
            
            if not email_sent:
                del pending_confirmations[user.email]
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail="Failed to send confirmation email"
                )
                
            return {
                "message": "Confirmation email sent",
                "email": user.email,
                "expires_at": expires_at.isoformat()
            }
            
        except Exception as email_err:
            del pending_confirmations[user.email]
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Email service error: {str(email_err)}"
            )

    except HTTPException:
        raise
    except Exception as e:
        if user.email in pending_confirmations:
            del pending_confirmations[user.email]
        logger.error(f"Signup error: {type(e).__name__}: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error during signup process: {type(e).__name__}"
        )

@router.post("/confirm-email", response_model=dict)
async def confirm_email(confirmation: EmailConfirmation):
    try:
        # Validate email exists in pending confirmations FIRST
        if confirmation.email not in pending_confirmations:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid or expired confirmation request"
            )

        pending_data = pending_confirmations[confirmation.email]

        # Validate code (remove any spaces user might have entered)
        user_code = confirmation.code.replace(" ", "")
        stored_code = pending_data["confirmation_code"]
        
        if user_code != stored_code:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid verification code"
            )

        # Check expiration
        if datetime.now() > pending_data["expires_at"]:
            del pending_confirmations[confirmation.email]
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Confirmation code has expired"
            )

        user_data = pending_data["user_data"]
        
        # Remove from pending BEFORE creating user to prevent race conditions
        del pending_confirmations[confirmation.email]
        
        try:
            # Check if user exists in Firebase first
            try:
                existing_user = auth.get_user_by_email(user_data["email"])
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="Email already registered"
                )
            except auth.UserNotFoundError:
                pass  # Expected path
            
            # Create Firebase user
            firebase_user = auth.create_user(
                email=user_data["email"],
                email_verified=True,
                password=user_data["password"],
                display_name=f"{user_data['first_name']} {user_data['last_name']}"
            )

            # Store user in  using the centralized db instance
            user_ref = users_collection.document(firebase_user.uid)
            user_ref.set({
                "first_name": user_data["first_name"],
                "last_name": user_data["last_name"],
                "email": user_data["email"],
                "hashed_password": user_data["hashed_password"],
                "email_verified": True,
                "disabled": False,
                "created_at":  get_server_timestamp(),
                "last_login": None,
                "ip_address": pending_data.get("ip_address", ""),
                "firebase_uid": firebase_user.uid
            })

            # Migrate guest data if exists
            if guest_session_id := pending_data.get("guest_session_id"):
                await migrate_guest_data(firebase_user.uid, UUID(guest_session_id))

            # Create access token
            access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
            access_token = create_access_token(
                data={"sub": user_data["email"], "user_id": firebase_user.uid},
                expires_delta=access_token_expires
            )
            
            return {
                "message": "Account successfully created",
                "user_id": firebase_user.uid,
                "email": user_data["email"],
                "access_token": access_token,
                "token_type": "bearer"
            }

        except auth.EmailAlreadyExistsError:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Email already registered during processing"
            )
        except FirebaseError as firebase_error:
            logger.error(f"Firebase error: {str(firebase_error)}")
            # Attempt to clean up if user was partially created
            try:
                auth.delete_user(firebase_user.uid)
            except:
                pass
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Authentication service temporarily unavailable"
            )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Unexpected error in confirm_email: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal server error"
        )
    
@router.get("/check-confirmation")
async def check_confirmation(email: str):
    """Check if a confirmation exists for this email"""
    try:
        from urllib.parse import unquote
        email = unquote(email)
        
        if email not in pending_confirmations:
            return {"exists": False}
            
        pending_data = pending_confirmations[email]
        return {
            "exists": True,
            "expires_at": pending_data["expires_at"].isoformat(),
            "first_name": pending_data["user_data"]["first_name"]
        }
    except Exception as e:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid request: {str(e)}"
        )

@router.post("/resend-confirmation", response_model=dict)
async def resend_confirmation(request_data: ResendConfirmationRequest):
    try:
        email = request_data.email
        
        if email not in pending_confirmations:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="No pending confirmation for this email"
            )
        
        pending_data = pending_confirmations[email]
        
        # Regenerate code if expired
        if datetime.now() > pending_data["expires_at"]:
            pending_data["confirmation_code"] = generate_confirmation_code()
            pending_data["expires_at"] = datetime.now() + timedelta(hours=24)
        
        # Resend email
        email_sent = await email_service.send_confirmation_email(
            email=email,
            name=f"{pending_data['user_data']['first_name']} {pending_data['user_data']['last_name']}",
            code=pending_data["confirmation_code"]
        )

        if not email_sent:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to resend confirmation email"
            )
        
        return {
            "message": "Confirmation email resent",
            "expires_at": pending_data["expires_at"].isoformat()
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error resending confirmation: {str(e)}"
        )
    
@router.post("/login", response_model=Token)
async def login(
    form_data: OAuth2PasswordRequestForm = Depends(),
    guest_session_id: UUID = Cookie(None)
):
    try:
        logger.info(f"Login attempt for email: {form_data.username}")
        user = await authenticate_user(form_data.username, form_data.password)
        
        if not user:
            logger.warning("Login failed: Invalid credentials")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Incorrect credentials",
                headers={"WWW-Authenticate": "Bearer"},
            )

        logger.info(f"User authenticated: {user.email}")
        
        # Update last login time
        update_time =  get_server_timestamp()
        db.collection("users").document(user.id).update({
            "last_login": update_time
        })
        logger.info("Last login time updated")

        # Migrate guest data if exists
        if guest_session_id:
            logger.info(f"Migrating guest data for session: {guest_session_id}")
            await migrate_guest_data(user.id, guest_session_id)

        # Create access token
        access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
        access_token = create_access_token(
            data={"sub": user.email, "user_id": user.id},
            expires_delta=access_token_expires
        )
        
        logger.info("Login successful, returning token")
        return {"access_token": access_token, "token_type": "bearer"}

    except Exception as e:
        logger.error(f"Login error: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal server error during login"
        )

@router.post("/google-login", response_model=Token)
async def google_login(google_token: GoogleToken):
    try:
        decoded_token = await verify_google_token(google_token.token)
        email = decoded_token.get("email")

        # Check if user exists
        try:
            user = auth.get_user_by_email(email)
            # Update last login time
            db.collection("users").document(user.uid).update({
                "last_login":  get_server_timestamp()
            })
        except auth.UserNotFoundError:
            # Create new user from Google auth
            user = auth.create_user(
                email=email,
                email_verified=True,
                display_name=decoded_token.get("name", ""),
            )

            # Split name into first and last
            name_parts = decoded_token.get("name", "").split(" ")
            first_name = name_parts[0] if len(name_parts) > 0 else ""
            last_name = " ".join(name_parts[1:]) if len(name_parts) > 1 else ""

            # Store user data in 
            db.collection("users").document(user.uid).set({
                "first_name": first_name,
                "last_name": last_name,
                "hashed_password": "",  # No password for Google auth
                "disabled": False,
                "created_at":  get_server_timestamp(),
                "last_login":  get_server_timestamp(),
                "email_verified": True
            })

        # Generate JWT token
        access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
        access_token = create_access_token(
            data={"sub": email, "user_id": user.uid},
            expires_delta=access_token_expires
        )
        return {"access_token": access_token, "token_type": "bearer"}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Google login error: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error during Google login: {str(e)}"
        )


@router.post("/request-password-reset")
async def request_password_reset(reset_request: PasswordResetRequest):
    try:
        # Generate password reset link
        reset_link = auth.generate_password_reset_link(reset_request.email)
        
        # Send email with reset link (in production)
        email_sent = await email_service.send_password_reset_email(
            email=reset_request.email,
            reset_link=reset_link
        )
        
        if not email_sent:
            logger.error(f"Failed to send password reset email to {reset_request.email}")
            
        return {"message": "Password reset link generated", "reset_link": reset_link}
    except auth.UserNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    except Exception as e:
        logger.error(f"Password reset error: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error generating reset link: {str(e)}"
        )


@router.post("/reset-password")
async def reset_password(reset_data: PasswordReset):
    try:
        # Verify the reset token
        email = auth.verify_password_reset_token(reset_data.token)

        # Get the user
        user = auth.get_user_by_email(email)

        # Update password in Firebase Auth
        auth.update_user(
            user.uid,
            password=reset_data.new_password
        )

        # Update hashed password in 
        hashed_password = get_password_hash(reset_data.new_password)
        db.collection("users").document(user.uid).update({
            "hashed_password": hashed_password
        })

        return {"message": "Password updated successfully"}
    except auth.InvalidIdTokenError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired reset token"
        )
    except Exception as e:
        logger.error(f"Password reset error: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error resetting password: {str(e)}"
        )


@router.get("/me", response_model=UserPublic)
async def read_users_me(current_user: UserInDB = Depends(get_current_active_user)):
    return UserPublic(
        id=current_user.id,
        email=current_user.email,
        first_name=current_user.first_name,
        last_name=current_user.last_name,
        email_verified=current_user.email_verified,
        created_at=current_user.created_at
    )


async def authenticate_user(email: str, password: str) -> Optional[UserInDB]:
    try:
        logger.debug(f"Authenticating user: {email}")
        user = await get_user_by_email(email)
        
        if not user:
            logger.warning(f"No user found with email: {email}")
            return None
            
        # Skip password check for OAuth users (empty hashed_password)
        if not user.hashed_password:
            logger.warning(f"OAuth user attempted password login: {email}")
            return None
            
        # Verify password against the stored hash
        if not pwd_context.verify(password, user.hashed_password):
            logger.warning(f"Password verification failed for user: {email}")
            return None
            
        logger.debug(f"User authenticated successfully: {email}")
        return user
        
    except Exception as e:
        logger.error(f"Authentication error for {email}: {str(e)}", exc_info=True)
        return None

async def get_user_by_email(email: str) -> Optional[UserInDB]:
    """
    Retrieve user by email with enhanced error handling and retry logic.
    Handles Firebase token expiration and connection issues.
    """
    max_retries = 2
    retry_count = 0
    
    while retry_count <= max_retries:
        try:
            # Get user from Firebase Auth
            try:
                fb_user = auth.get_user_by_email(email)
            except auth.UserNotFoundError:
                logger.info(f"User not found in Firebase Auth: {email}")
                return None
            except ValueError as e:
                if "invalid_grant" in str(e) and retry_count < max_retries:
                    logger.warning(f"Firebase token issue detected, attempting refresh (attempt {retry_count + 1})")
                    from core.db import firebase_manager
                    firebase_manager.refresh_firebase_token()
                    retry_count += 1
                    continue
                logger.error(f"Firebase authentication error for {email}: {str(e)}")
                raise HTTPException(
                    status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                    detail="Authentication service temporarily unavailable"
                )
            except Exception as auth_error:
                logger.error(f"Unexpected Firebase Auth error for {email}: {str(auth_error)}")
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail="Error accessing authentication service"
                )

            # Get additional user data from Firestore
            try:
                user_ref = db.collection("users").document(fb_user.uid)
                user_doc = user_ref.get()

                if not user_doc.exists:
                    logger.warning(f"Firestore document missing for user: {email}")
                    return None

                user_data = user_doc.to_dict()
                
                # Convert timestamp to ISO string if needed
                def convert_timestamp(timestamp):
                    if hasattr(timestamp, 'isoformat'):
                        return timestamp.isoformat()
                    return str(timestamp) if timestamp else None

                return UserInDB(
                    id=fb_user.uid,
                    email=fb_user.email,
                    first_name=user_data.get("first_name", ""),
                    last_name=user_data.get("last_name", ""),
                    hashed_password=user_data.get("hashed_password", ""),
                    disabled=user_data.get("disabled", False),
                    email_verified=user_data.get("email_verified", fb_user.email_verified),
                    created_at=convert_timestamp(user_data.get("created_at")),
                    last_login=convert_timestamp(user_data.get("last_login"))
                )

            except Exception as firestore_error:
                logger.error(f"Firestore error for user {email}: {str(firestore_error)}")
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail="Error accessing user database"
                )

        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Unexpected error fetching user {email}: {str(e)}")
            if retry_count < max_retries:
                retry_count += 1
                logger.info(f"Retrying user fetch for {email} (attempt {retry_count})")
                continue
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Internal server error while fetching user"
            )

    # If we exhaust all retries
    raise HTTPException(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        detail="Authentication service unavailable after multiple attempts"
    )

@router.post("/logout")
async def logout(
    request: Request,
    response: Response,
    token: str = Depends(OAuth2PasswordBearer(tokenUrl="auth/login"))
):
    try:
        # Invalidate token (add to blacklist if using one)
        # In a production environment, you would:
        # 1. Add token to a blacklist (Redis recommended)
        # 2. Set token expiry to now
        # 3. Clear any session data
        
        # Clear the auth cookie
        response.delete_cookie("access_token")
        
        # Create a new guest session
        guest_session_id = str(uuid.uuid4())
        response.set_cookie(
            key="guest_session_id",
            value=guest_session_id,
            httponly=True,
            secure=True,
            samesite="lax",
            max_age=60 * 60 * 24 * 7  # 7 days
        )
        
        # Return success response
        return {
            "message": "Logout successful",
            "guest_session_created": True,
            "guest_session_id": guest_session_id
        }
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )
