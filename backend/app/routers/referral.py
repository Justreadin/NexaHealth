# app/routers/referral.py
from fastapi import APIRouter, Depends, HTTPException, Body
from app.models.auth_model import UserInDB
from app.core.auth import get_current_active_user
from app.core.db import users_collection
from google.cloud.firestore_v1 import ArrayUnion, Increment
from google.cloud import firestore
from datetime import datetime
import random, string, traceback

router = APIRouter(prefix="/referrals", tags=["Referrals"])

SUPER_ACCESS_POINTS = 15

APP_ORIGIN = "http://www.nexahealth.life" 

def generate_referral_code(length=6) -> str:
    return ''.join(random.choices(string.ascii_uppercase + string.digits, k=length))

def get_or_create_user_doc(user_id: str) -> dict:
    """Ensure the user document exists with referral fields"""
    ref = users_collection.document(user_id)
    snap = ref.get()
    if not snap.exists:
        data = {
            "username": f"user_{user_id[:6]}",
            "referral_code": generate_referral_code(),
            "users_referred": 0,
            "pharmacies_referred": 0,
            "points": 0,
            "badges": [],
            "super_access_granted": False,
            "claimed_joiners": [],
            "created_at": firestore.SERVER_TIMESTAMP,
            "updated_at": firestore.SERVER_TIMESTAMP,
        }
        ref.set(data, merge=True)
        return ref.get().to_dict()
    return snap.to_dict() or {}

def ensure_referral_code(user_id: str, user_data: dict) -> str:
    """Generate or return existing referral code"""
    code = user_data.get("referral_code")
    if code:
        return code

    while True:
        code = generate_referral_code()
        q = users_collection.where("referral_code", "==", code).limit(1).stream()
        if not any(q):
            break
    users_collection.document(user_id).set({"referral_code": code, "updated_at": firestore.SERVER_TIMESTAMP}, merge=True)
    return code

@router.get("/")
async def get_referral_info(current_user: UserInDB = Depends(get_current_active_user)):
    """Fetch current user's referral info and points"""
    try:
        user_id = current_user.id
        user_data = get_or_create_user_doc(user_id)
        referral_code = ensure_referral_code(user_id, user_data)

        points = user_data.get("points", 0)
        super_access = points >= SUPER_ACCESS_POINTS

        return {
            "referralCode": referral_code,
            "referralLink": f"{APP_ORIGIN}/?ref={referral_code}",
            "usersReferred": user_data.get("users_referred", 0),
            "pharmaciesReferred": user_data.get("pharmacies_referred", 0),
            "points": points,
            "superAccess": super_access,
            "badges": user_data.get("badges", [])
        }
    except Exception:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail="Failed to fetch referral info")


@router.post("/use/{code}")
async def use_referral_code(
    code: str,
    payload: dict = Body(...),  # expects {"type": "user"} or {"type": "pharmacy"}
    current_user: UserInDB = Depends(get_current_active_user)
):
    """
    Apply a referral code for the current user:
    - 1 user referral = 1 point
    - 1 pharmacy referral = 10 points
    - Prevent self-referral & double claim
    """
    try:
        joiner_id = current_user.id
        referral_type = payload.get("type", "user")
        points_to_add = 1 if referral_type == "user" else 10

        # Find referrer by code
        ref_q = users_collection.where("referral_code", "==", code).limit(1).stream()
        referrer_doc = next(ref_q, None)
        if not referrer_doc:
            raise HTTPException(status_code=404, detail="Referral code not found")

        referrer_id = referrer_doc.id
        if referrer_id == joiner_id:
            raise HTTPException(status_code=400, detail="Cannot use your own referral code")

        # Ensure documents exist
        joiner = get_or_create_user_doc(joiner_id)
        referrer = referrer_doc.to_dict() or {}

        # Prevent double claim
        claimed_referrals = set(referrer.get("claimed_joiners", []))
        if joiner_id in claimed_referrals:
            return {"applied": False, "message": "Referral already applied"}

        # Atomic update on referrer
        update_data = {
            "claimed_joiners": ArrayUnion([joiner_id]),
            "points": Increment(points_to_add),
            "updated_at": firestore.SERVER_TIMESTAMP
        }

        if referral_type == "user":
            update_data["users_referred"] = Increment(1)
        else:
            update_data["pharmacies_referred"] = Increment(1)

        users_collection.document(referrer_id).update(update_data)

        # Check for super access
        updated_referrer = users_collection.document(referrer_id).get().to_dict()
        if updated_referrer.get("points", 0) >= SUPER_ACCESS_POINTS and not updated_referrer.get("super_access_granted", False):
            users_collection.document(referrer_id).update({
                "super_access_granted": True,
                "updated_at": firestore.SERVER_TIMESTAMP
            })

        # Track joiner's claimed referral
        users_collection.document(joiner_id).set({
            "claimed_referral": True,
            "updated_at": firestore.SERVER_TIMESTAMP
        }, merge=True)

        return {"applied": True, "message": f"Referral applied, +{points_to_add} pts!"}

    except HTTPException:
        raise
    except Exception:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail="Failed to apply referral code")
