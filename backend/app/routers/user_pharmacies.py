# app/routes/consumer_pharmacies.py
from datetime import datetime
from fastapi import APIRouter, HTTPException, Query, Depends
from app.core.db import db
from app.models.feedback_model import PharmacyFeedbackCreate
from app.core.auth import get_current_active_user

router = APIRouter(prefix="/consumer/pharmacies", tags=["Consumer Pharmacies"])

@router.get("/")
async def list_published_pharmacies(
    name: str = Query(None, description="Search by pharmacy name"),
    location: str = Query(None, description="Search by city/state/address"),
    badge: str = Query(None, description="Search by badge type"),
    is_open: str = Query(None, description="Filter by status 'open' or 'closed'")
):
    try:
        pharmacies_ref = db.collection("users").where("is_published", "==", True)
        docs = pharmacies_ref.stream()

        pharmacies = []
        for doc in docs:
            data = doc.to_dict()
            created_at = data.get("created_at")
            status_open = data.get("is_open", False)

            # Apply filters
            if name and name.lower() not in (data.get("business_name") or data.get("pharmacy_name") or "").lower():
                continue
            if location and location.lower() not in (data.get("address") or data.get("city") or data.get("state") or "").lower():
                continue
            if badge and badge.lower() != (data.get("badge") or data.get("verification_status") or "").lower():
                continue
            if is_open:
                if is_open.lower() == "open" and not status_open:
                    continue
                if is_open.lower() == "closed" and status_open:
                    continue

            pharmacies.append({
                "pharmacy_id": doc.id,
                "name": data.get("business_name") or data.get("pharmacy_name"),
                "pcn_license": data.get("pcn_license"),
                "joined_month_year": created_at.strftime("%b %Y") if created_at else None,
                "location": data.get("address") or data.get("city") or data.get("state"),
                "current_badge": data.get("badge") or data.get("verification_status") or "Partner",
                "email": data.get("email"),
                "phone_number": data.get("phone_number"),
                "is_open": status_open
            })

        return {"pharmacies": pharmacies}

    except Exception as e:
        print("Error fetching pharmacies:", e)
        raise HTTPException(status_code=500, detail="Error fetching pharmacies")


@router.post("/feedback/pharmacy")
async def submit_feedback(
    data: PharmacyFeedbackCreate,
    user: dict = Depends(get_current_active_user)
):
    # ✅ Look up the pharmacy via email
    query = db.collection("pharmacies").where("email", "==", data.pharmacy_email).get()

    if not query:
        raise HTTPException(status_code=404, detail="Pharmacy not found")

    pharmacy_doc = query[0]
    pharmacy_id = pharmacy_doc.id  # Firestore internal ID

    feedback_data = {
        "user_email": user["email"],
        "rating": data.rating,
        "review": data.review,
        "timestamp": datetime.utcnow(),
    }

    db.collection("pharmacies") \
      .document(pharmacy_id) \
      .collection("feedback") \
      .add(feedback_data)

    return {"message": "Feedback submitted successfully"}
