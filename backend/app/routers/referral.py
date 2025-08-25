from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import OAuth2PasswordBearer
from app.models.auth_model import UserInDB
from app.core.auth import get_current_active_user
from app.core.db import db, users_collection
from datetime import datetime
import random, string, traceback

# Firestore helpers for atomic updates
from google.cloud import firestore
from google.cloud.firestore_v1 import ArrayUnion, Increment

router = APIRouter(
    prefix="/referrals",
    tags=["Referrals"],
    responses={404: {"description": "Not found"}}
)

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")

REFERRAL_GOAL = 3
APP_ORIGIN = "https://www.nexahealth.life"   # change to your frontend origin in prod

def generate_referral_code(length=6):
    return ''.join(random.choices(string.ascii_uppercase + string.digits, k=length))

def get_or_create_user_doc(user_id: str) -> dict:
    """Fetch user doc; create minimal skeleton if not exists."""
    ref = users_collection.document(user_id)
    snap = ref.get()
    if not snap.exists:
        # Create with sane defaults
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

    # Generate (simple uniqueness loop)
    while True:
        code = generate_referral_code()
        # check if any user has this code
        q = users_collection.where("referral_code", "==", code).limit(1).stream()
        if not any(q):
            break
    users_collection.document(user_id).set(
        {"referral_code": code, "updated_at": firestore.SERVER_TIMESTAMP},
        merge=True
    )
    return code

@router.get("/")
async def get_referral_info(current_user: UserInDB = Depends(get_current_active_user)):
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
async def get_leaderboard():
    try:
        users = (
            users_collection
            .order_by("referral_count", direction=firestore.Query.DESCENDING)
            .limit(10)
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
    current_user: UserInDB = Depends(get_current_active_user)
):
    """
    Apply a referral code for the *current user* (the joiner).
    - No self-referral
    - No double-claim (only first time)
    - Atomically increments referrer's count & logs referral
    """
    try:
        joiner_id = current_user.id

        # Find referrer by code
        ref_q = users_collection.where("referral_code", "==", code).limit(1).stream()
        referrer_doc = next(ref_q, None)
        if not referrer_doc:
            raise HTTPException(status_code=404, detail="Referral code not found")

        referrer_id = referrer_doc.id
        if referrer_id == joiner_id:
            raise HTTPException(status_code=400, detail="You cannot use your own referral code")

        # Ensure joiner and referrer docs exist
        joiner = get_or_create_user_doc(joiner_id)
        referrer = referrer_doc.to_dict() or {}

        # Prevent double-claim: if referrer already has this joiner logged, bail
        existing_referrals = set(referrer.get("referrals", []))
        if joiner_id in existing_referrals:
            return {"applied": False, "message": "Referral already applied"}

        # Atomic update on referrer
        users_collection.document(referrer_id).update({
            "referrals": ArrayUnion([joiner_id]),
            "referral_count": Increment(1),
            "updated_at": firestore.SERVER_TIMESTAMP
        })

        # (Optional) reward the joiner too, e.g., first-time badge
        users_collection.document(joiner_id).set({
            "claimed_referral": True,
            "updated_at": firestore.SERVER_TIMESTAMP
        }, merge=True)

        return {"applied": True, "message": "Referral applied"}
    except HTTPException:
        raise
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))
