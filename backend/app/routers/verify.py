from fastapi import APIRouter, HTTPException, Depends
from typing import Optional, List, Dict, Tuple
import json
from pathlib import Path
from datetime import datetime
from fastapi.security import OAuth2PasswordBearer
from app.models.verify_model import (
    DrugVerificationRequest, 
    DrugVerificationResponse,
    VerificationStatus,
    DrugMatchDetail
)
from app.models.auth_model import UserInDB
from app.core.auth import get_current_active_user
from rapidfuzz import fuzz, process
import logging
import re
from collections import defaultdict
import string
from functools import lru_cache
from app.routers.count import increment_stat_counter

router = APIRouter(
    prefix="/api/verify",
    tags=["Drug Verification"],
    responses={404: {"description": "Not found"}}
)

logger = logging.getLogger(__name__)

# OAuth2 scheme for token authentication
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")

# Load drug database
DRUG_DB_FILE = Path(__file__).parent.parent / "data" / "unified_drugs_with_pils_v3.json"

with open(DRUG_DB_FILE, encoding="utf-8") as f:
    drug_db = json.load(f)

# Enhanced common name mappings with Nigerian-specific variations
COMMON_NAME_MAPPINGS = {
    # Panadol variations
    "panadol": ["panadol extra", "panadol tablet", "panadol suspension", "panadol caplet"],
    "paracetamol": ["paracetamol tablet", "paracetamol suspension", "paracetamol caplet"],
    # Common Nigerian drug names
    "flagyl": ["metronidazole"],
    "amoxil": ["amoxicillin"],
    "coartem": ["artemether/lumefantrine"],
    "vitamin c": ["ascorbic acid"],
    "blood tonic": ["haematinic"],
    # Manufacturer-specific names
    "emzor paracetamol": ["paracetamol", "emzolyn"],
    "juhel paracetamol": ["paracetamol", "juvital"]
}

# Nigerian manufacturer variations
MANUFACTURER_VARIANTS = {
    "emzor": ["emzor pharmaceutical", "emzor pharma"],
    "fidson": ["fidson healthcare", "fidson pharm"],
    "may & baker": ["may and baker", "m&b"],
    "swiss pharma": ["swiss pharmaceutical"]
}

# Preprocess and index the drug database
@lru_cache(maxsize=1)
def get_indexed_drugs():
    """Create optimized indexes for faster searching"""
    indexed = {
        "name_index": defaultdict(list),
        "reg_index": {},
        "manufacturer_index": defaultdict(list),
        "generic_index": defaultdict(list)
    }
    
    for drug in drug_db:
        # Index by name parts
        name = drug.get("product_name", "").lower()
        for part in name.split():
            indexed["name_index"][part].append(drug)
        
        # Index by registration number
        if reg_no := drug.get("identifiers", {}).get("nafdac_reg_no", "").lower():
            indexed["reg_index"][reg_no] = drug
        
        # Index by manufacturer
        if manu := drug.get("manufacturer", {}).get("name", "").lower():
            indexed["manufacturer_index"][manu].append(drug)
        
        # Index by generic name parts
        if generic := drug.get("generic_name", "").lower():
            for part in generic.split():
                indexed["generic_index"][part].append(drug)
    
    return indexed

def normalize_text(text: str) -> str:
    """Normalize text for matching"""
    if not text:
        return ""
    
    # Remove punctuation and special characters
    text = re.sub(f"[{string.punctuation}]", "", text.lower())
    
    # Common Nigerian drug name normalizations
    replacements = {
        "tab": "tablet",
        "cap": "capsule",
        "susp": "suspension",
        "inj": "injection",
        "supp": "suppository",
        "pcm": "paracetamol"
    }
    
    for short, long in replacements.items():
        text = re.sub(rf"\b{short}\b", long, text)
    
    return text.strip()

def expand_common_names(input_name: str) -> List[str]:
    """Expand common drug names to their possible variants"""
    input_normalized = normalize_text(input_name)
    variants = [input_normalized]
    
    # Check if input contains any common name
    for common_name, mappings in COMMON_NAME_MAPPINGS.items():
        if common_name in input_normalized:
            variants.extend(normalize_text(m) for m in mappings)
    
    # Also include generic versions (e.g., "panadol" -> "paracetamol")
    if "panadol" in input_normalized:
        variants.append("paracetamol")
    
    return list(set(variants))  # Remove duplicates

def match_manufacturer(input_manu: str, db_manu: str) -> Tuple[int, str]:
    """Advanced manufacturer matching with Nigerian variants"""
    if not input_manu or not db_manu:
        return 0, ""
    
    input_norm = normalize_text(input_manu)
    db_norm = normalize_text(db_manu)
    
    # Check for direct match
    if input_norm == db_norm:
        return 100, "exact manufacturer match"
    
    # Check manufacturer variants
    for canonical, variants in MANUFACTURER_VARIANTS.items():
        if (canonical in input_norm and db_norm in variants) or (canonical in db_norm and input_norm in variants):
            return 90, f"manufacturer variant match ({canonical})"
    
    # Fuzzy match as fallback
    score = fuzz.token_set_ratio(input_norm, db_norm)
    if score > 70:
        return round(score), f"manufacturer fuzzy match ({score}%)"  # Round to integer
    
    return 0, ""

def match_nafdac_number(input_reg: str, db_reg: str) -> Tuple[int, str]:
    """Flexible NAFDAC number matching"""
    if not input_reg or not db_reg:
        return 0, ""
    
    # Remove common separators
    input_clean = re.sub(r"[-/ ]", "", input_reg.lower())
    db_clean = re.sub(r"[-/ ]", "", db_reg.lower())
    
    if input_clean == db_clean:
        return 100, "exact NAFDAC match"
    
    # Partial matches (first 5 characters)
    if len(input_clean) >= 5 and len(db_clean) >= 5:
        if input_clean[:5] == db_clean[:5]:
            return 80, "partial NAFDAC match (first 5 chars)"
    
    # Contains match
    if input_clean in db_clean or db_clean in input_clean:
        return 60, "partial NAFDAC match (contains)"
    
    return 0, ""

def match_dosage_form(input_form: str, db_form: str) -> Tuple[int, str]:
    """Match dosage forms with common variations"""
    if not input_form or not db_form:
        return 0, ""
    
    forms_map = {
        "tab": "tablet",
        "caps": "capsule",
        "syr": "syrup",
        "susp": "suspension",
        "inj": "injection",
        "cream": "topical cream"
    }
    
    input_norm = forms_map.get(input_form.lower(), input_form.lower())
    db_norm = forms_map.get(db_form.lower(), db_form.lower())
    
    if input_norm == db_norm:
        return 30, "exact dosage form match"
    
    # Handle plural forms
    if input_norm.rstrip('s') == db_norm.rstrip('s'):
        return 25, "similar dosage form"
    
    return 0, ""

# Update the verify_drug function in verify.py

@router.post("/drug", response_model=DrugVerificationResponse)
async def verify_drug(
    request: DrugVerificationRequest,
    current_user: UserInDB = Depends(get_current_active_user)
):
    """
    Ultra-powerful drug verification system for Nigerian market with:
    - Advanced fuzzy matching
    - Common name handling
    - Manufacturer variants
    - NAFDAC number flexibility
    - Detailed match reporting
    """
    try:
        logger.info(f"Drug verification request by user: {current_user.email}")
        if not request.product_name or len(request.product_name.strip()) < 3:
            raise HTTPException(
                status_code=400,
                detail="Product name must be at least 3 characters"
            )
        
        input_name = normalize_text(request.product_name)
        input_reg = normalize_text(request.nafdac_reg_no) if request.nafdac_reg_no else None
        input_manu = normalize_text(request.manufacturer) if request.manufacturer else None
        input_form = normalize_text(request.dosage_form) if request.dosage_form else None
        
        # Get indexed data
        indexes = get_indexed_drugs()
        
        # Stage 1: Broad matching using indexes
        potential_matches = []
        seen_ids = set()  # Track seen nexahealth_ids to avoid duplicates
        
        # Match by name parts
        for part in input_name.split():
            for drug in indexes["name_index"].get(part, []):
                if drug["nexahealth_id"] not in seen_ids:
                    potential_matches.append(drug)
                    seen_ids.add(drug["nexahealth_id"])
        
        # Match by generic name parts
        if " " in input_name:  # Likely contains generic name
            for part in input_name.split():
                for drug in indexes["generic_index"].get(part, []):
                    if drug["nexahealth_id"] not in seen_ids:
                        potential_matches.append(drug)
                        seen_ids.add(drug["nexahealth_id"])
        
        # If NAFDAC number provided, prioritize those matches
        if input_reg:
            # Check for exact match first
            if exact_reg_match := indexes["reg_index"].get(input_reg):
                if exact_reg_match["nexahealth_id"] not in seen_ids:
                    potential_matches.insert(0, exact_reg_match)  # Insert at beginning for priority
                    seen_ids.add(exact_reg_match["nexahealth_id"])
            else:
                # Check for partial matches in registration numbers
                for reg_no, drug in indexes["reg_index"].items():
                    if (input_reg in reg_no or reg_no in input_reg) and drug["nexahealth_id"] not in seen_ids:
                        potential_matches.append(drug)
                        seen_ids.add(drug["nexahealth_id"])
        
        # If no potential matches found, try fuzzy name search on entire database
        if not potential_matches:
            potential_matches = drug_db
        
        # Rest of the function remains the same...
        # Stage 2: Detailed scoring of potential matches
        best_match = None
        highest_score = 0
        match_details = []
        scored_matches = []
        
        for drug in potential_matches:
            current_score = 0
            details = []
            
            # Get drug data
            db_name = normalize_text(drug.get("product_name", ""))
            db_reg = normalize_text(drug.get("identifiers", {}).get("nafdac_reg_no", ""))
            db_manu = normalize_text(drug.get("manufacturer", {}).get("name", ""))
            db_form = normalize_text(drug.get("dosage_form", ""))
            nexahealth_id = drug.get("nexahealth_id")
            
            # Name matching (multiple strategies)
            name_variants = expand_common_names(input_name)
            
            # Strategy 1: Exact match with any variant
            if any(variant == db_name for variant in name_variants):
                current_score += 50
                details.append(DrugMatchDetail(
                    field="product_name",
                    matched_value=drug.get("product_name"),
                    input_value=request.product_name,
                    score=100,
                    algorithm="exact match with common name variant"
                ))
            
            # Strategy 2: Fuzzy token match with expanded names
            else:
                best_variant_score = max(
                    fuzz.token_set_ratio(variant, db_name) 
                    for variant in name_variants
                )
                
                if best_variant_score > 85:
                    current_score += best_variant_score * 0.4
                    details.append(DrugMatchDetail(
                        field="product_name",
                        matched_value=drug.get("product_name"),
                        input_value=request.product_name,
                        score=round(best_variant_score * 0.4),  # Round to integer
                        algorithm="fuzzy token match"
                    ))
                elif best_variant_score > 70:
                    current_score += best_variant_score * 0.3
                    details.append(DrugMatchDetail(
                        field="product_name",
                        matched_value=drug.get("product_name"),
                        input_value=request.product_name,
                        score=round(best_variant_score * 0.3),  # Round to integer
                        algorithm="partial fuzzy match"
                    ))
            
            # NAFDAC number matching
            reg_score, reg_reason = match_nafdac_number(input_reg, db_reg)
            if reg_score > 0:
                current_score += reg_score * 0.3
                details.append(DrugMatchDetail(
                    field="nafdac_reg_no",
                    matched_value=drug.get("identifiers", {}).get("nafdac_reg_no"),
                    input_value=request.nafdac_reg_no or "",
                    score=round(reg_score * 0.3),  # Round to integer
                    algorithm=reg_reason
                ))
            
            # Manufacturer matching
            manu_score, manu_reason = match_manufacturer(input_manu, db_manu)
            if manu_score > 0:
                current_score += manu_score * 0.2
                details.append(DrugMatchDetail(
                    field="manufacturer",
                    matched_value=drug.get("manufacturer", {}).get("name"),
                    input_value=request.manufacturer or "",
                    score=round(manu_score * 0.2),  # Round to integer
                    algorithm=manu_reason
                ))
            
            # Dosage form matching
            form_score, form_reason = match_dosage_form(input_form, db_form)
            if form_score > 0:
                current_score += form_score
                details.append(DrugMatchDetail(
                    field="dosage_form",
                    matched_value=drug.get("dosage_form"),
                    input_value=request.dosage_form or "",
                    score=round(form_score),  # Round to integer
                    algorithm=form_reason
                ))
            # Track this match
            scored_matches.append({
                "drug": drug,
                "score": current_score,
                "details": details
            })
            
            # Update best match
            if current_score > highest_score:
                highest_score = current_score
                best_match = drug
                match_details = details
        
        # Stage 3: Determine response
        verification_status = best_match.get("verification", {}).get("status", "unknown") if best_match else "unknown"
        
        # No good match found
        if not best_match or highest_score < 50:
            # Try to suggest possible matches from the entire database
            all_names = [d["product_name"] for d in drug_db]
            matches = process.extract(
                request.product_name, 
                all_names, 
                scorer=fuzz.token_set_ratio,
                limit=5
            )
            
            if matches and matches[0][1] > 60:
                suggested_drugs = []
                for name, score, _ in matches:
                    drug = next(d for d in drug_db if d["product_name"] == name)
                    suggested_drugs.append({
                        "product_name": drug["product_name"],
                        "dosage_form": drug["dosage_form"],
                        "nafdac_reg_no": drug.get("identifiers", {}).get("nafdac_reg_no"),
                        "manufacturer": drug.get("manufacturer", {}).get("name"),
                        "match_score": score,
                        "pil_id": drug.get("nexahealth_id")
                    })
                
                return DrugVerificationResponse(
                    status=VerificationStatus.HIGH_SIMILARITY,
                    message="No exact match found. Here are possible options:",
                    match_score=0,
                    possible_matches=suggested_drugs,
                    confidence="medium"
                )
            
            return DrugVerificationResponse(
                status=VerificationStatus.UNKNOWN,
                message="No matching drug found in NAFDAC records.",
                match_score=0,
                confidence="low"
            )
        
        # Prepare successful response
        response_data = {
            "status": VerificationStatus(verification_status),
            "product_name": best_match.get("product_name"),
            "dosage_form": best_match.get("dosage_form"),
            "strength": best_match.get("strength"),
            "nafdac_reg_no": best_match.get("identifiers", {}).get("nafdac_reg_no"),
            "manufacturer": best_match.get("manufacturer", {}).get("name"),
            "match_score": round(min(100, highest_score)),  # Ensure integer
            "pil_id": best_match.get("nexahealth_id"),
            "last_verified": best_match.get("approval", {}).get("approval_date"),
            "report_count": best_match.get("report_stats", {}).get("total_reports", 0),
            "match_details": match_details,
            "confidence": "high" if highest_score >= 80 else "medium"
        }
        
        # Set appropriate message
        if highest_score >= 90:
            if verification_status == "verified":
                response_data["message"] = "✅ Verified medication (exact match)"
            else:
                response_data["message"] = "⚠️ Verified but flagged - check details"
        elif highest_score >= 70:
            response_data["message"] = "⚠️ Good match - please verify details"
        else:
            response_data["message"] = "⚠️ Partial match - review carefully"
        
        # Check for conflicts
        conflicts = []
        if input_name and best_match.get("product_name"):
            input_norm = normalize_text(input_name)
            db_norm = normalize_text(best_match["product_name"])
            if input_norm != db_norm and fuzz.token_set_ratio(input_norm, db_norm) < 85:
                conflicts.append("name mismatch")
        
        if input_reg and best_match.get("identifiers", {}).get("nafdac_reg_no"):
            input_reg_clean = re.sub(r"[-/ ]", "", input_reg.lower())
            db_reg_clean = re.sub(r"[-/ ]", "", best_match["identifiers"]["nafdac_reg_no"].lower())
            if input_reg_clean != db_reg_clean:
                conflicts.append("NAFDAC number mismatch")
        
        if conflicts:
            response_data["status"] = VerificationStatus.CONFLICT_WARNING
            response_data["message"] = f"⚠️ Possible issues: {', '.join(conflicts)}"
            response_data["confidence"] = "medium"

        await increment_stat_counter("verifications")
        return DrugVerificationResponse(**response_data)
    
    except Exception as e:
        logger.error(f"Verification error: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail="Drug verification failed")


