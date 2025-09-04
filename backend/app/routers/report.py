from fastapi import APIRouter, UploadFile, File, Form, HTTPException, Request, Depends
from typing import Optional, Literal
from datetime import datetime
import os
import uuid
from fastapi.security import OAuth2PasswordBearer
from app.core.db import reports_collection
from app.models.report_model import PQCModel, AEModel, ReportResponse, Severity
from app.utils.alerts import create_alert_for_ae
from google.cloud.firestore_v1.base_query import FieldFilter
from app.models.auth_model import UserInDB
from app.core.auth import get_current_active_user
from app.routers.count import increment_stat_counter

router = APIRouter(prefix="/reports", tags=["Drug Safety Reports"])

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")

async def save_uploaded_file(file: UploadFile, drug_name: str, upload_dir: str) -> str:
    # Create upload directory if it doesn't exist
    os.makedirs(upload_dir, exist_ok=True)
    
    # Generate unique filename
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    unique_id = uuid.uuid4().hex[:6]
    safe_drug_name = "".join(c if c.isalnum() else "_" for c in drug_name)
    file_ext = os.path.splitext(file.filename)[1]
    filename = f"{safe_drug_name}_{timestamp}_{unique_id}{file_ext}"
    
    # Save file
    file_path = os.path.join(upload_dir, filename)
    with open(file_path, "wb") as buffer:
        content = await file.read()
        buffer.write(content)
    
    # Return relative path
    return f"/{upload_dir}/{filename}"

@router.post("/submit-pqc", response_model=ReportResponse)
async def submit_pqc_report(
    drug_name: str = Form(...),
    nafdac_reg_no: Optional[str] = Form(None),
    manufacturer: Optional[str] = Form(None),
    pharmacy_name: str = Form(...),
    issue_type: str = Form(...),
    description: str = Form(...),
    state: str = Form(...),
    lga: str = Form(...),
    street_address: Optional[str] = Form(None),
    is_anonymous: bool = Form(False),
    image: Optional[UploadFile] = File(None),
    request: Request = None,
    current_user: UserInDB = Depends(get_current_active_user)
):
    try:
        # Ensure drug_name is not empty
        if not drug_name or drug_name.strip() == "":
            raise HTTPException(status_code=400, detail="Drug name is required")

        report_data = PQCModel(
            drug_name=drug_name,
            nafdac_reg_no=nafdac_reg_no,
            manufacturer=manufacturer,
            pharmacy_name=pharmacy_name,
            issue_type=issue_type,
            description=description,
            state=state,
            lga=lga,
            street_address=street_address,
            is_anonymous=is_anonymous,
            user_id=current_user.id if not is_anonymous else None
        ).dict()

        if image:
            safe_drug_name = drug_name.strip() if drug_name else "unknown"
            report_data["image_url"] = await save_uploaded_file(image, safe_drug_name, "uploads/pqc")

        report_data.update({
            "timestamp": datetime.utcnow(),
            "status": "new",
            "report_type": "product_quality_complaint",
            "investigation_notes": None
        })

        doc_ref = reports_collection.document()
        doc_ref.set(report_data)

        await increment_stat_counter("reports")

        return ReportResponse(
            message="PQC report submitted successfully",
            report_id=doc_ref.id,
            status="success"
        )

    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
    
@router.post("/submit-ae", response_model=ReportResponse)
async def submit_ae_report(
    drug_name: str = Form(...),
    nafdac_reg_no: Optional[str] = Form(None),
    manufacturer: Optional[str] = Form(None),
    pharmacy_name: str = Form(...),
    reaction_description: str = Form(...),
    severity: Severity = Form(...),
    onset_datetime: str = Form(...),
    symptoms: str = Form(...),
    state: str = Form(...),
    lga: str = Form(...),
    street_address: Optional[str] = Form(None),
    medical_history: Optional[str] = Form(None),
    is_anonymous: bool = Form(False),
    image: Optional[UploadFile] = File(None),
    request: Request = None,
    current_user: UserInDB = Depends(get_current_active_user)
):
    try:
        symptom_list = [s.strip() for s in symptoms.split(",") if s.strip()]

        report_data = AEModel(
            drug_name=drug_name,
            nafdac_reg_no=nafdac_reg_no,
            manufacturer=manufacturer,
            pharmacy_name=pharmacy_name,
            reaction_description=reaction_description,
            severity=severity,
            onset_datetime=datetime.fromisoformat(onset_datetime),
            symptoms=symptom_list,
            state=state,
            lga=lga,
            street_address=street_address,
            medical_history=medical_history,
            is_anonymous=is_anonymous,
            user_id=current_user.id if not is_anonymous else None
        ).dict()

        if image:
            safe_drug_name = drug_name.strip() if drug_name else "unknown"
            report_data["image_url"] = await save_uploaded_file(image, safe_drug_name, "uploads/ae")

        report_data.update({
            "timestamp": datetime.utcnow(),
            "status": "new",
            "report_type": "adverse_event",
            "follow_up_required": severity in [Severity.SEVERE, Severity.LIFE_THREATENING]
        })

        doc_ref = reports_collection.document()
        doc_ref.set(report_data)

        if report_data["follow_up_required"]:
            await create_alert_for_ae(report_data)

        await increment_stat_counter("reports")

        return ReportResponse(
            message="AE report submitted successfully",
            report_id=doc_ref.id,
            status="success"
        )

    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

# --- Admin Review Endpoints ---
"""
@router.get("/all", summary="Admin: View all reports")
async def get_all_reports(
    current_user: UserInDB = Depends(get_current_admin_user) # type: ignore
):
    return [doc.to_dict() | {"id": doc.id} for doc in reports_collection.order_by("timestamp", direction="DESCENDING").limit(200).stream()]

@router.patch("/review/{report_id}", summary="Admin: Mark report reviewed")
async def review_report(
    report_id: str, 
    notes: Optional[str] = Form(None), 
    status: Literal["in_progress", "resolved"] = Form("in_progress"),
    current_user: UserInDB = Depends(get_current_admin_user) # type: ignore
):
    try:
        report_ref = reports_collection.document(report_id)
        report_ref.update({
            "status": status,
            "investigation_notes": notes or "",
            "reviewed_at": datetime.utcnow(),
            "reviewed_by": current_user.id
        })
        return {"message": f"Report {report_id} updated successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# --- Dashboard Analytics ---

@router.get("/analytics/admin", summary="Admin Dashboard Analytics")
async def admin_dashboard_stats(
    current_user: UserInDB = Depends(get_current_admin_user) # type: ignore
):
    all_docs = reports_collection.stream()
    total = 0
    ae = pqc = resolved = 0
    for doc in all_docs:
        total += 1
        d = doc.to_dict()
        if d.get("report_type") == "adverse_event":
            ae += 1
        elif d.get("report_type") == "product_quality_complaint":
            pqc += 1
        if d.get("status") == "resolved":
            resolved += 1

    return {
        "total_reports": total,
        "adverse_events": ae,
        "product_quality_complaints": pqc,
        "resolved_reports": resolved
    }

@router.get("/analytics/pharmacy/{pharmacy_name}", summary="SaaS Dashboard: Reports by Pharmacy")
async def pharmacy_dashboard(
    pharmacy_name: str,
    current_user: UserInDB = Depends(get_current_active_user)
):
    query = reports_collection.where(filter=FieldFilter("pharmacy_name", "==", pharmacy_name.lower()))
    docs = query.stream()
    return [doc.to_dict() | {"id": doc.id} for doc in docs]
    """