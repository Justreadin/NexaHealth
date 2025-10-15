from fastapi import APIRouter, HTTPException, status, Depends
from pydantic import BaseModel, EmailStr
from typing import Optional, List
from app.core.db import users_collection, stats_collection, get_server_timestamp, set_user_role, get_user_profile

router = APIRouter()

# -----------------------------
# Schemas
# -----------------------------
class PharmacyProfileUpdate(BaseModel):
    address: Optional[str] = None
    cac_number: Optional[str] = None
    licence_url: Optional[str] = None
    operating_hours: Optional[str] = None
    phone_number: Optional[str] = None
    website_url: Optional[str] = None

class PharmacyStatusUpdate(BaseModel):
    status: str  # pending / verified / rejected

# -----------------------------
# Routes
# -----------------------------

from datetime import datetime

# 2. Get Pharmacy Profile
@router.get("/profile/{pharmacy_id}")
def get_profile(pharmacy_id: str):
    doc = users_collection.document(pharmacy_id).get()
    if not doc.exists:
        raise HTTPException(status_code=404, detail="Pharmacy not found")
    return doc.to_dict()

# 3. Update Pharmacy Profile
@router.patch("/profile/{pharmacy_id}")
def update_profile(pharmacy_id: str, payload: PharmacyProfileUpdate):
    doc_ref = users_collection.document(pharmacy_id)
    doc = doc_ref.get()
    if not doc.exists:
        raise HTTPException(status_code=404, detail="Pharmacy not found")

    updates = payload.dict(exclude_unset=True)
    if updates:
        updates["updated_at"] = get_server_timestamp()
        doc_ref.update(updates)
    
    return {"message": "Profile updated successfully", "pharmacy_id": pharmacy_id, "updates": updates}

@router.patch("/{pharmacy_id}/status")
def update_status(pharmacy_id: str, payload: PharmacyStatusUpdate):
    doc_ref = users_collection.document(pharmacy_id)
    doc = doc_ref.get()
    if not doc.exists:
        raise HTTPException(status_code=404, detail="Pharmacy not found")
    
    doc_ref.update({
        "status": payload.status,
        "updated_at": get_server_timestamp()
    })

    # Assign Verified badge if approved
    if payload.status == "verified":
        current_badges = doc.to_dict().get("badges", [])
        if not any(b["badge_type"] == "Verified" for b in current_badges):
            current_badges.append({"badge_type": "Verified", "assigned_at": get_server_timestamp()})
            doc_ref.update({"badges": current_badges})

    return {"message": f"Pharmacy status updated to {payload.status}", "pharmacy_id": pharmacy_id}

# 5. Get Pharmacy Badges
@router.get("/{pharmacy_id}/badges")
def get_badges(pharmacy_id: str):
    doc = users_collection.document(pharmacy_id).get()
    if not doc.exists:
        raise HTTPException(status_code=404, detail="Pharmacy not found")
    
    badges = doc.to_dict().get("badges", [])
    return {"pharmacy_id": pharmacy_id, "badges": badges}

# 6. Get Dashboard Metrics
@router.get("/{pharmacy_id}/metrics")
def get_metrics(pharmacy_id: str):
    doc = users_collection.document(pharmacy_id).get()
    if not doc.exists:
        raise HTTPException(status_code=404, detail="Pharmacy not found")
    
    data = doc.to_dict()
    metrics = {
        "verified_drugs": len(data.get("verified_drugs", [])),
        "active_reports": len(data.get("reports", [])),
        "average_rating": data.get("avg_rating", None)
    }
    return {"pharmacy_id": pharmacy_id, "metrics": metrics}


def assign_trusted_badge(pharmacy_id: str):
    doc_ref = users_collection.document(pharmacy_id)
    doc = doc_ref.get()
    if not doc.exists:
        return

    data = doc.to_dict()
    rating = data.get("avg_rating")
    badges = data.get("badges", [])

    if rating and rating >= 4.5 and not any(b["badge_type"] == "Trusted" for b in badges):
        badges.append({"badge_type": "Trusted", "assigned_at": get_server_timestamp()})
        doc_ref.update({"badges": badges})


@router.post("/pharmacy/invite")
async def invite_pharmacy(pharmacy_name: str, current_user: UserInDB = Depends(get_current_active_user)):
    """
    Store invitation intent or trigger WhatsApp/email in future.
    """
    try:
        # Example: Save to Firestore "pending_invites"
        invite_ref = db.collection("pending_invites").document()
        invite_ref.set({
            "pharmacy_name": pharmacy_name,
            "invited_by": current_user.id,
            "timestamp": datetime.utcnow(),
            "status": "pending"
        })
        return {"message": "Pharmacy invite recorded"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
