from fastapi import APIRouter
from app.models.verify_model import DrugVerificationRequest, DrugVerificationResponse
import json
from pathlib import Path

router = APIRouter()

DATA_FILE = Path(__file__).parent.parent / "data" / "verified_drugs.json"

with open(DATA_FILE, "r") as f:
    drug_db = json.load(f)


@router.post("/verify-drug", response_model=DrugVerificationResponse)
def verify_drug(request: DrugVerificationRequest):
    name = request.product_name.strip().lower() if request.product_name else None
    reg_no = request.nafdac_reg_no.strip().lower() if request.nafdac_reg_no else None

    # Case 1: Full match (name + reg_no)
    if name and reg_no:
        for drug in drug_db:
            if (drug["product_name"].lower() == name and
                drug["nafdac_reg_no"].lower() == reg_no):
                return handle_match(drug, request)

    # Case 2: Only name matches
    if name:
        for drug in drug_db:
            if drug["product_name"].lower() == name:
                return DrugVerificationResponse(
                    status="partial_match",
                    message="Product name matches a NAFDAC-verified drug, but the registration number does not. Please check again.",
                    product_name=drug.get("product_name"),
                    dosage_form=drug.get("dosage_form"),
                    strengths=drug.get("strengths"),
                    ingredients=drug.get("ingredients"),
                    nafdac_reg_no=drug.get("nafdac_reg_no"),
                    match_score=70  # partial confidence
                )

    # Case 3: Only reg no matches
    if reg_no:
        for drug in drug_db:
            if drug["nafdac_reg_no"].lower() == reg_no:
                return DrugVerificationResponse(
                    status="conflict_warning",
                    message="NAFDAC registration number is valid, but the product name does not match the official record. This could indicate a counterfeit product.",
                    product_name=drug.get("product_name"),
                    dosage_form=drug.get("dosage_form"),
                    strengths=drug.get("strengths"),
                    ingredients=drug.get("ingredients"),
                    nafdac_reg_no=drug.get("nafdac_reg_no"),
                    match_score=50  # suspicious/conflict
                )

    # Case 4: No match
    return DrugVerificationResponse(
        status="unknown",
        message="Drug not found in NAFDAC records with the given information."
    )


def handle_match(drug: dict, request: DrugVerificationRequest) -> DrugVerificationResponse:
    status = drug.get("status", "unknown")
    score = 100

    # Penalize if product name mismatch (should be rare here since full match)
    if request.product_name and request.product_name.strip().lower() != drug["product_name"].strip().lower():
        score -= 20

    # Penalize more if NAFDAC reg no mismatch
    if request.nafdac_reg_no and request.nafdac_reg_no.strip().lower() != drug["nafdac_reg_no"].strip().lower():
        score -= 40

    # Compose message based on score and status
    if status == "verified":
        if score >= 90:
            message = f"{drug['product_name']} is NAFDAC verified and matches confidently."
        elif score >= 70:
            message = f"{drug['product_name']} is verified, but some details may not match fully. Caution advised."
        elif score >= 50:
            message = f"{drug['product_name']} is verified, but with multiple mismatches. Higher risk of misrepresentation."
        else:
            message = f"{drug['product_name']} is verified, but data provided appears suspicious. High risk."
    elif status == "flagged":
        message = f"Warning: {drug['product_name']} has been flagged by multiple reports."
    else:
        message = f"{drug['product_name']} is not verified by NAFDAC."

    return DrugVerificationResponse(
        status=status,
        message=message,
        product_name=drug.get("product_name"),
        dosage_form=drug.get("dosage_form"),
        strengths=drug.get("strengths"),
        ingredients=drug.get("ingredients"),
        nafdac_reg_no=drug.get("nafdac_reg_no"),
        match_score=score
    )
