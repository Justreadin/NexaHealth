# app/routers/pharmacy_report.py
from fastapi import APIRouter, UploadFile, File, Form, HTTPException, Depends, BackgroundTasks
from typing import Optional, List
from datetime import datetime
import os
import uuid
from app.models.pharmacy_report_model import (
    PharmacyReportCreate, 
    PharmacyReportResponse, 
    PharmacyReportDB,
    PharmacyReportType,
    LocationType
)
from app.models.auth_model import UserInDB
from app.core.auth import get_current_active_user
from app.core.db import db, get_user_role
from app.routers.count import get_user_stat_count
import logging

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/pharmacy/reports", tags=["Pharmacy Reports"])

# Collection for pharmacy reports
pharmacy_reports_collection = db.collection("pharmacy_reports")

async def save_pharmacy_report_images(files: List[UploadFile], drug_name: str, report_id: str) -> List[str]:
    saved_paths = []
    # Create folder for this drug
    safe_drug_name = "".join(c for c in drug_name if c.isalnum() or c in (' ', '-', '_')).rstrip()
    upload_dir = os.path.join("uploads/pharmacy_reports", safe_drug_name)
    os.makedirs(upload_dir, exist_ok=True)

    for file in files:
        if file and file.filename:
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            unique_id = uuid.uuid4().hex[:6]
            file_ext = os.path.splitext(file.filename)[1]
            filename = f"{report_id}_{timestamp}_{unique_id}{file_ext}"
            file_path = os.path.join(upload_dir, filename)
            with open(file_path, "wb") as buffer:
                content = await file.read()
                buffer.write(content)
            saved_paths.append(f"/{upload_dir}/{filename}")

    return saved_paths

@router.post("/submit", response_model=PharmacyReportResponse)
async def submit_pharmacy_report(
    background_tasks: BackgroundTasks,
    # Report Details
    issue_type: PharmacyReportType = Form(...),
    description: str = Form(...),
    
    # Drug Information
    drug_name: str = Form(...),
    batch_number: Optional[str] = Form(None),
    expiry_date: Optional[str] = Form(None),
    nafdac_reg_no: Optional[str] = Form(None),
    manufacturer: Optional[str] = Form(None),
    
    # Location & Source
    location_type: LocationType = Form(...),
    pharmacy_name: Optional[str] = Form(None),
    pharmacy_address: Optional[str] = Form(None),
    
    # Submission Options
    is_anonymous: bool = Form(False),
    
    # Files
    images: List[UploadFile] = File([]),
    
    # Authentication
    current_user: UserInDB = Depends(get_current_active_user)
):
    try:
        # Check if user has pharmacy role
        user_role = get_user_role(current_user.id)
        if user_role != "pharmacy":
            raise HTTPException(
                status_code=403, 
                detail="Only pharmacies can submit pharmacy reports"
            )

        # Validate required fields based on location type
        if location_type == LocationType.OTHER_PHARMACY and not pharmacy_name:
            raise HTTPException(
                status_code=400, 
                detail="Pharmacy name is required when reporting about another pharmacy"
            )

        # Create report data
        report_data = PharmacyReportCreate(
            issue_type=issue_type,
            description=description,
            drug_name=drug_name,
            batch_number=batch_number,
            expiry_date=expiry_date,
            nafdac_reg_no=nafdac_reg_no,
            manufacturer=manufacturer,
            location_type=location_type,
            pharmacy_name=pharmacy_name,
            pharmacy_address=pharmacy_address,
            is_anonymous=is_anonymous,
            reporter_type="pharmacy"
        ).dict()

        # Create document reference
        doc_ref = pharmacy_reports_collection.document()
        report_id = doc_ref.id

        # Add system fields
        report_data.update({
            "id": report_id,
            "timestamp": datetime.utcnow(),
            "status": "new",
            "pharmacy_id": current_user.id if not is_anonymous else None,
            "reporter_email": current_user.email if not is_anonymous else None,
            "images": []
        })

        # Handle image uploads
        if images and any(img.filename for img in images):
            try:
                image_paths = await save_pharmacy_report_images(images, drug_name, report_id)
                report_data["images"] = image_paths
            except Exception as e:
                logger.error(f"Failed to save images for report {report_id}: {str(e)}")


        # Save to Firestore
        doc_ref.set(report_data)

        # Increment user-specific report stats (only if not anonymous)
        if not is_anonymous:
            get_user_stat_count("pharmacy_reports", current_user.id)

        # Log the report submission
        logger.info(f"Pharmacy report submitted: {report_id} by {current_user.email}")

        return PharmacyReportResponse(
            message="Pharmacy report submitted successfully",
            report_id=report_id,
            status="success"
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error submitting pharmacy report: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to submit report: {str(e)}"
        )

@router.get("/my-reports")
async def get_my_pharmacy_reports(
    current_user: UserInDB = Depends(get_current_active_user)
):
    """Get reports submitted by the current pharmacy"""
    try:
        # Check if user has pharmacy role
        user_role = get_user_role(current_user.id)
        if user_role != "pharmacy":
            raise HTTPException(
                status_code=403, 
                detail="Only pharmacies can access pharmacy reports"
            )

        # Query reports by pharmacy_id (non-anonymous reports)
        query = pharmacy_reports_collection.where("pharmacy_id", "==", current_user.id)
        docs = query.order_by("timestamp", direction=firestore.Query.DESCENDING).stream()
        
        reports = []
        for doc in docs:
            report_data = doc.to_dict()
            reports.append(PharmacyReportDB(**report_data))
        
        return {
            "total": len(reports),
            "reports": reports
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching pharmacy reports: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail="Failed to fetch reports"
        )

@router.get("/stats")
async def get_pharmacy_report_stats(
    current_user: UserInDB = Depends(get_current_active_user)
):
    """Get statistics for the current pharmacy's reports"""
    try:
        user_role = get_user_role(current_user.id)
        if user_role != "pharmacy":
            raise HTTPException(
                status_code=403, 
                detail="Only pharmacies can access pharmacy report stats"
            )

        # Query reports by pharmacy_id
        query = pharmacy_reports_collection.where("pharmacy_id", "==", current_user.id)
        docs = query.stream()
        
        stats = {
            "total": 0,
            "new": 0,
            "under_review": 0,
            "resolved": 0,
            "by_issue_type": {}
        }
        
        for doc in docs:
            report_data = doc.to_dict()
            stats["total"] += 1
            status = report_data.get("status", "new")
            issue_type = report_data.get("issue_type", "other")
            
            # Count by status
            if status in stats:
                stats[status] += 1
            
            # Count by issue type
            if issue_type not in stats["by_issue_type"]:
                stats["by_issue_type"][issue_type] = 0
            stats["by_issue_type"][issue_type] += 1
        
        return stats

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching pharmacy report stats: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail="Failed to fetch report statistics"
        )