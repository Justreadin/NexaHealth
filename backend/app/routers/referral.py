from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.security import OAuth2PasswordBearer
from app.models.auth_model import UserInDB
from app.core.auth import get_current_active_user, get_current_active_user_optional
from app.core.db import users_collection
from datetime import datetime
import random, string, traceback

# Firestore helpers
from google.cloud import firestore
from google.cloud.firestore_v1 import ArrayUnion, Increment

router = APIRouter(
    prefix="/referrals",
    tags=["Referrals"],
    responses={404: {"description": "Not found"}}
)

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")

# CONFIG
REFERRAL_GOAL = 3
APP_ORIGIN = "https://www.nexahealth.life"   # change to frontend domain in prod


# -----------------------
# Helpers
# -----------------------
def generate_referral_code(length=6) -> str:
    return ''.join(random.choices(string.ascii_uppercase + string.digits, k=length))


def get_or_create_user_doc(user_id: str) -> dict:
    """Fetch user doc; create minimal skeleton if not exists."""
    ref = users_collection.document(user_id)
    snap = ref.get()
    if not snap.exists:
        data = {
            "username": f"user_{user_id[:6]}",
            "referral_code": generate_referral_code(),
            "referrals": [],
            "referral_count": 0,
            "badges": [],
            "level": 1,
            "created_at": firestore.SERVER_TIMESTAMP,
            "updated_at": firestore.SERVER_TIMESTAMP,
        }
        ref.set(data, merge=True)
        return ref.get().to_dict()
    return snap.to_dict() or {}


def ensure_referral_code(user_id: str, user_data: dict) -> str:
    """Make sure the user has a referral code; create+save if missing."""
    code = user_data.get("referral_code")
    if code:
        return code

    # Generate unique referral code
    while True:
        code = generate_referral_code()
        q = users_collection.where("referral_code", "==", code).limit(1).stream()
        if not any(q):
            break

    users_collection.document(user_id).set(
        {"referral_code": code, "updated_at": firestore.SERVER_TIMESTAMP},
        merge=True
    )
    return code


# -----------------------
# Routes
# -----------------------

@router.get("/")
async def get_referral_info(current_user: UserInDB = Depends(get_current_active_user)):
    """Get logged-in user's referral info"""
    try:
        user_id = current_user.id
        user_data = get_or_create_user_doc(user_id)
        referral_code = ensure_referral_code(user_id, user_data)
        referral_count = int(user_data.get("referral_count", 0))
        badges = user_data.get("badges", [])
        level = int(user_data.get("level", 1))

        return {
            "referralCode": referral_code,
            "referralLink": f"{APP_ORIGIN}/?ref={referral_code}",
            "referralCount": referral_count,
            "referralGoal": REFERRAL_GOAL,
            "reachedGoal": referral_count >= REFERRAL_GOAL,
            "badges": badges,
            "level": level,
        }
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/leaderboard")
async def get_leaderboard(limit: int = 10):
    """Get top users ranked by referrals"""
    try:
        users = (
            users_collection
            .order_by("referral_count", direction=firestore.Query.DESCENDING)
            .limit(limit)
            .stream()
        )
        leaderboard = []
        for u in users:
            d = u.to_dict() or {}
            leaderboard.append({
                "username": d.get("username", "Anonymous"),
                "count": int(d.get("referral_count", 0))
            })
        return leaderboard
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/use/{code}")
async def use_referral_code(
    code: str,
    request: Request,
    current_user: UserInDB = Depends(get_current_active_user_optional)
):
    """Apply referral code when visited (supports logged-in OR anonymous)."""
    try:
        # Get referrer
        referral_docs = users_collection.where("referral_code", "==", code).limit(1).stream()
        referrer = next(referral_docs, None)
        if not referrer:
            raise HTTPException(status_code=404, detail="Referral code not found")

        referrer_id = referrer.id

        # Determine joiner (logged-in user or anonymous visitor)
        joiner_id = current_user.id if current_user else f"anon_{request.client.host}_{random.randint(1000,9999)}"

        # Prevent self-referrals
        if joiner_id == referrer_id:
            raise HTTPException(status_code=400, detail="You cannot refer yourself")

        # Prevent duplicate use
        referrer_data = referrer.to_dict()
        if joiner_id in referrer_data.get("referrals", []):
            raise HTTPException(status_code=400, detail="Referral already used")

        # Atomic Firestore update
        users_collection.document(referrer_id).update({
            "referrals": ArrayUnion([joiner_id]),
            "referral_count": Increment(1),
            "updated_at": firestore.SERVER_TIMESTAMP
        })

        return {"message": "Referral applied successfully", "referrer_id": referrer_id}

    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))
