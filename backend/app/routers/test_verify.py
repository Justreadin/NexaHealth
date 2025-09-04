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
    DrugMatchDetail,
    SimpleDrugVerificationRequest
)
from rapidfuzz import fuzz, process
import logging
import re
from collections import defaultdict
import string
from functools import lru_cache

router = APIRouter(
    prefix="/api/test_verify",
    tags=["Drug Verification"],
    responses={404: {"description": "Not found"}}
)

logger = logging.getLogger(__name__)

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
        raw_reg = drug.get("identifiers", {}).get("nafdac_reg_no", "").lower()
        clean_reg = re.sub(r"[-/ ]", "", raw_reg)
        if clean_reg:
            indexed["reg_index"][clean_reg] = drug

        if reg_no := drug.get("identifiers", {}).get("nafdac_reg_no", "").lower():
            reg_key = re.sub(r"[-/ ]", "", reg_no)
            indexed["reg_index"][reg_key] = drug
        
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

@router.post("/drug", response_model=DrugVerificationResponse)
async def verify_drug(request: SimpleDrugVerificationRequest):
    try:
        logger.info("Drug verification request by user")

        if not request.product_name and not request.nafdac_reg_no:
            raise HTTPException(
                status_code=400,
                detail="At least one of product name or NAFDAC number must be provided"
            )

        input_name = normalize_text(request.product_name) if request.product_name else ""
        input_reg = normalize_text(request.nafdac_reg_no) if request.nafdac_reg_no else ""

        indexes = get_indexed_drugs()

        # ✅ Handle NAFDAC-only lookup directly
        if input_reg and not input_name:
            normalized_reg = re.sub(r"[-/ ]", "", input_reg.lower())
            drug = indexes["reg_index"].get(normalized_reg)
            if drug:
                return DrugVerificationResponse(
                    status=VerificationStatus(drug.get("verification", {}).get("status", "unknown")),
                    product_name=drug.get("product_name"),
                    dosage_form=drug.get("dosage_form"),
                    strength=drug.get("strength"),
                    nafdac_reg_no=drug.get("identifiers", {}).get("nafdac_reg_no"),
                    manufacturer=drug.get("manufacturer", {}).get("name"),
                    match_score=100,
                    pil_id=drug.get("nexahealth_id"),
                    match_details=[
                        DrugMatchDetail(
                            field="nafdac_reg_no",
                            matched_value=drug.get("identifiers", {}).get("nafdac_reg_no"),
                            input_value=request.nafdac_reg_no,
                            score=100,
                            algorithm="exact NAFDAC match"
                        )
                    ],
                    matched_fields=["NAFDAC Number"],
                    confidence="high",
                    message="✅ Verified via exact NAFDAC number match, please verify details"
                )

       
        potential_matches = []
        seen_ids = set()

        # 🟢 1. NAFDAC match (exact)
        if input_reg:
            normalized_reg = re.sub(r"[-/ ]", "", input_reg.lower())
            if exact_reg_match := indexes["reg_index"].get(normalized_reg):
                potential_matches.append(exact_reg_match)
                seen_ids.add(exact_reg_match["nexahealth_id"])

        # 🟢 2. Product name matches (name index + generic index)
        if input_name:
            for part in input_name.split():
                for drug in indexes["name_index"].get(part, []):
                    if drug["nexahealth_id"] not in seen_ids:
                        potential_matches.append(drug)
                        seen_ids.add(drug["nexahealth_id"])
            if " " in input_name:
                for part in input_name.split():
                    for drug in indexes["generic_index"].get(part, []):
                        if drug["nexahealth_id"] not in seen_ids:
                            potential_matches.append(drug)
                            seen_ids.add(drug["nexahealth_id"])

        # 🟡 3. Partial NAFDAC match (if exact wasn't found above)
        if input_reg and not exact_reg_match:
            for reg_no, drug in indexes["reg_index"].items():
                if (input_reg in reg_no or reg_no in input_reg) and drug["nexahealth_id"] not in seen_ids:
                    potential_matches.append(drug)
                    seen_ids.add(drug["nexahealth_id"])

        # 🔴 4. Fallback: use entire DB only if still empty
        if not potential_matches:
            potential_matches = drug_db


        if not potential_matches:
            potential_matches = drug_db

        best_match = None
        highest_score = 0
        match_details = []
        scored_matches = []
        matched_field_labels = set()

        for drug in potential_matches:
            current_score = 0
            details = []
            fields_used = set()

            db_name = normalize_text(drug.get("product_name", ""))
            db_reg = normalize_text(drug.get("identifiers", {}).get("nafdac_reg_no", ""))
            db_manu = normalize_text(drug.get("manufacturer", {}).get("name", ""))
            db_form = normalize_text(drug.get("dosage_form", ""))
            nexahealth_id = drug.get("nexahealth_id")

            if input_name:
                name_variants = expand_common_names(input_name)

                if any(variant == db_name for variant in name_variants):
                    current_score += 50
                    fields_used.add("product_name")
                    matched_field_labels.add("Product Name")
                    details.append(DrugMatchDetail(
                        field="product_name",
                        matched_value=drug.get("product_name"),
                        input_value=request.product_name,
                        score=100,
                        algorithm="exact match with common name variant"
                    ))
                else:
                    best_variant_score = max(
                        fuzz.token_set_ratio(variant, db_name) for variant in name_variants
                    )

                    if best_variant_score > 85:
                        current_score += best_variant_score * 0.4
                        fields_used.add("product_name")
                        matched_field_labels.add("Product Name")
                        details.append(DrugMatchDetail(
                            field="product_name",
                            matched_value=drug.get("product_name"),
                            input_value=request.product_name,
                            score=round(best_variant_score * 0.4),
                            algorithm="fuzzy token match"
                        ))
                    elif best_variant_score > 70:
                        current_score += best_variant_score * 0.3
                        fields_used.add("product_name")
                        matched_field_labels.add("Product Name")
                        details.append(DrugMatchDetail(
                            field="product_name",
                            matched_value=drug.get("product_name"),
                            input_value=request.product_name,
                            score=round(best_variant_score * 0.3),
                            algorithm="partial fuzzy match"
                        ))

            if input_reg:
                reg_score, reg_reason = match_nafdac_number(input_reg, db_reg)
                if reg_score > 0:
                    current_score += reg_score * 0.3
                    fields_used.add("nafdac_reg_no")
                    matched_field_labels.add("NAFDAC Number")
                    details.append(DrugMatchDetail(
                        field="nafdac_reg_no",
                        matched_value=drug.get("identifiers", {}).get("nafdac_reg_no"),
                        input_value=request.nafdac_reg_no or "",
                        score=round(reg_score * 0.3),
                        algorithm=reg_reason
                    ))

            scored_matches.append({
                "drug": drug,
                "score": current_score,
                "details": details,
                "fields_used": fields_used
            })

            if current_score > highest_score:
                best_match = drug
                highest_score = current_score
                match_details = details

        verification_status = best_match.get("verification", {}).get("status", "unknown") if best_match else "unknown"

        if not best_match or highest_score < 50:
            if input_name:
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

        response_data = {
            "status": VerificationStatus(verification_status),
            "product_name": best_match.get("product_name"),
            "dosage_form": best_match.get("dosage_form"),
            "strength": best_match.get("strength"),
            "nafdac_reg_no": best_match.get("identifiers", {}).get("nafdac_reg_no"),
            "manufacturer": best_match.get("manufacturer", {}).get("name"),
            "match_score": round(min(100, highest_score)),
            "pil_id": best_match.get("nexahealth_id"),
            "match_details": match_details,
            "matched_fields": sorted(matched_field_labels) if matched_field_labels else None,
            "confidence": "high" if highest_score >= 80 else "medium"
        }

        if highest_score >= 90:
            response_data["message"] = (
                "✅ Verified medication (exact match)"
                if verification_status == "verified" else
                "⚠️ Verified but flagged - check details"
            )
        elif highest_score >= 70:
            response_data["message"] = "⚠️ Good match - please verify details"
        else:
            response_data["message"] = "⚠️ Partial match - review carefully"

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

        return DrugVerificationResponse(**response_data)

    except Exception as e:
        logger.error(f"Verification error: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail="Drug verification failed")
