# app/routers/verify.py
from fastapi import APIRouter, HTTPException, Depends
from typing import Optional, List, Dict, Tuple, Any, Union
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
from functools import lru_cache
import unicodedata
import heapq
import threading
import time
from app.routers.count import increment_stat_counter
from typing import Literal

router = APIRouter(
    prefix="/api/verify",
    tags=["Drug Verification"],
    responses={404: {"description": "Not found"}}
)

logger = logging.getLogger(__name__)

# OAuth2 scheme for token authentication
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")

# Load drug database (one-time)
DRUG_DB_FILE = Path(__file__).parent.parent / "data" / "unified_drugs_with_pils_v3.json"
with open(DRUG_DB_FILE, encoding="utf-8") as f:
    drug_db = json.load(f)

SCORES = {
    "exact_match": 100,
    "high_confidence": 90,
    "medium_confidence": 70,
    "low_confidence": 50,
    "min_return_score": 40,
    "nafdac_exact_bonus": 30,
    "full_match_bonus": 20,
    "manufacturer_mismatch_penalty": -40,
    "name_mismatch_penalty": -30,
    "nafdac_mismatch_penalty": -80,
    "nafdac_partial_match": 60
}

WEIGHTS = {
    "product_name": 0.35,
    "generic_name": 0.25,
    "manufacturer": 0.50,  # Increased priority
    "nafdac": 0.60,       # Most powerful matching
    "dosage_form": 0.10,
}

CORP_SUFFIXES = [
    r"\bltd\b", r"\blimited\b", r"\bplc\b", r"\binc\b", r"\bincorporated\b",
    r"\bco\b", r"\bcompany\b", r"\bcorp\b", r"\bcorporation\b", r"\bllc\b",
    r"\bllp\b", r"\bpartners\b", r"\bgroup\b", r"\bholdings\b",
    r"\bsa\b", r"\bag\b", r"\bgmbh\b", r"\bsp\.?z\.?o\.?o\.?\b",
    r"\bindustries\b", r"\bpharma\b", r"\bpharmaceuticals\b", r"\bpharmacies\b",
    r"\bhealthcare\b", r"\bbiotech\b", r"\bbiotechnology\b", r"\bmedicines\b",
    r"\blaboratories\b", r"\blabs\b", r"\bresearch\b", r"\btherapeutics\b",
    r"\bsciences\b", r"\bformulations\b",
    r"\bltd\.?\b", r"\binc\.?\b", r"\bco\.?\b", r"\bplc\.?\b",
    r"\bpty ltd\b", r"\bpvt ltd\b", r"\bprivate limited\b", r"\bprivate ltd\b"
]

COMMON_NAME_MAPPINGS = {
    "paracetamol": ["panadol", "acetaminophen", "tylenol", "panadol extra"],
    "metronidazole": ["flagyl", "metrogel", "metro", "metrogyl"],
    "amoxicillin": ["amoxil", "amoxycillin", "moxatag", "amox"],
    "ibuprofen": ["brufen", "advil", "nurofen", "motrin"],
    "diclofenac": ["voltaren", "cataflam", "dicloflex", "diclomol"],
    "omeprazole": ["prilosec", "losec", "omez", "omep"],
    "simvastatin": ["zocor", "simva", "simvacor", "simvor"],
    "atenolol": ["tenormin", "aten", "ateno", "atenol"],
    "ciprofloxacin": ["cipro", "ciproxin", "cifran", "ciflox"],
    "amoxicillin/clavulanate": ["augmentin", "amoclan", "clavamox", "moxiclav"]
}

# --- Phonetic matching ---
try:
    from metaphone import doublemetaphone
    def dm_codes(s: str) -> Tuple[str, str]:
        return doublemetaphone(s or "")
except ImportError:
    def dm_codes(s: str) -> Tuple[str, str]:
        if not s: return ("", "")
        s2 = re.sub(r'[^a-z0-9]', '', s.lower())
        return (s2[:6], s2[::-1][:6])

# --- Normalization functions ---
def normalize_text_ultra(text: Optional[str]) -> str:
    if not text: return ""
    s = unicodedata.normalize("NFD", text)
    s = "".join(ch for ch in s if unicodedata.category(ch) != "Mn")
    s = s.lower().strip()
    s = re.sub(r"[^\w\s]", " ", s)
    for suf in CORP_SUFFIXES:
        s = re.sub(suf, " ", s)
    s = re.sub(r"\s+", " ", s).strip()
    return s

def normalize_nafdac(nafdac: str) -> str:
    """Normalize NAFDAC number by removing spaces but preserving dashes and format"""
    if not nafdac: return ""
    # Remove spaces but keep dashes and alphanumeric
    normalized = re.sub(r"[^\w\-]", "", nafdac.upper())
    # Ensure consistent format: XX-XXXX
    if re.match(r"^\d{2}\-?\d{4}$", normalized):
        if "-" not in normalized:
            normalized = f"{normalized[:2]}-{normalized[2:]}"
    return normalized

def normalize_compact(text: Optional[str]) -> str:
    return re.sub(r"[^\w]", "", normalize_text_ultra(text))

# --- Similarity functions ---
def best_similarity(a: str, b: str) -> int:
    if not a or not b: return 0
    return int(max(
        fuzz.token_set_ratio(a, b),
        fuzz.partial_ratio(a, b),
        fuzz.WRatio(a, b),
        fuzz.ratio(a, b)
    ))

# --- Index builder ---
@lru_cache(maxsize=1)
def build_indexes() -> Dict[str, Any]:
    logger.info("Building search indexes (cached)")
    id_map = {}
    product_map = defaultdict(list)
    generic_map = defaultdict(list)
    manu_map = defaultdict(list)
    nafdac_map = {}
    search_text_map = {}
    all_search_texts = []
    manu_report_counts = defaultdict(int)

    for drug in drug_db:
        try:
            nid = drug.get("nexahealth_id")
            id_map[nid] = drug

            product = drug.get("product_name", "")
            generic = drug.get("generic_name", "")
            manu = (drug.get("manufacturer") or {}).get("name", "")
            nafdac = (drug.get("identifiers") or {}).get("nafdac_reg_no", "")
            
            product_norm = normalize_text_ultra(product)
            generic_norm = normalize_text_ultra(generic)
            manu_norm = normalize_text_ultra(manu)
            nafdac_norm = normalize_nafdac(nafdac)

            if product_norm: product_map[product_norm].append(nid)
            if generic_norm: generic_map[generic_norm].append(nid)
            if manu_norm: 
                manu_map[manu_norm].append(nid)
                # Track reports per manufacturer
                manu_report_counts[manu_norm] += drug.get("report_stats", {}).get("total_reports", 0)
            if nafdac_norm: nafdac_map[nafdac_norm] = drug

            combined = " ".join(filter(None, [
                product_norm, generic_norm, manu_norm,
                normalize_text_ultra(drug.get("dosage_form", "")),
                normalize_text_ultra(drug.get("strength", "")),
                nafdac_norm
            ]))
            if combined:
                search_text_map[combined] = nid
                all_search_texts.append(combined)
        except Exception as e:
            logger.warning(f"Indexing skip: {e}")

    return {
        "id_map": id_map,
        "product_map": product_map,
        "generic_map": generic_map,
        "manu_map": manu_map,
        "nafdac_map": nafdac_map,
        "search_text_map": search_text_map,
        "all_search_texts": all_search_texts,
        "manu_report_counts": manu_report_counts
    }

# --- Enhanced matching functions ---
def score_manufacturer_match(input_manu: str, db_manu: str) -> int:
    """Enhanced manufacturer matching with priority"""
    if not input_manu or not db_manu: return 0
        
    norm_input = normalize_compact(input_manu)
    norm_db = normalize_compact(db_manu)
    
    if norm_input == norm_db: return 100
    if norm_input in norm_db or norm_db in norm_input: return 95
        
    in_dm1, in_dm2 = dm_codes(input_manu)
    db_dm1, db_dm2 = dm_codes(db_manu)
    if (in_dm1 and db_dm1 and 
        (in_dm1 == db_dm1 or in_dm1 == db_dm2 or in_dm2 == db_dm1)):
        return 90
        
    return best_similarity(input_manu, db_manu)

def score_nafdac_match(input_nafdac: str, db_nafdac: str) -> Tuple[int, str]:
    """Enhanced NAFDAC matching with proper formatting"""
    if not input_nafdac or not db_nafdac: return (0, "no match")
    
    norm_input = normalize_nafdac(input_nafdac)
    norm_db = normalize_nafdac(db_nafdac)
    
    # Exact match (highest priority)
    if norm_input == norm_db:
        return (100, "exact match")
    
    # Match without dashes
    input_no_dash = norm_input.replace("-", "")
    db_no_dash = norm_db.replace("-", "")
    if input_no_dash == db_no_dash:
        return (95, "format-normalized match")
    
    # Partial matches only if significant portion matches
    if len(input_no_dash) >= 4 and len(db_no_dash) >= 4:
        # Check if first 4 digits match
        if input_no_dash[:4] == db_no_dash[:4]:
            return (70, "partial prefix match")
    
    # Very low score for any other similarity
    similarity = best_similarity(input_nafdac, db_nafdac)
    if similarity > 60:
        return (50, "fuzzy match")
    
    return (0, "no match")

def score_product_name_match(input_name: str, db_name: str, db_generic: str) -> int:
    """Enhanced product name matching"""
    if not input_name: return 0
    
    input_norm = normalize_text_ultra(input_name)
    db_name_norm = normalize_text_ultra(db_name or "")
    db_generic_norm = normalize_text_ultra(db_generic or "")
    
    if input_norm == db_name_norm: return 100
    if input_norm == db_generic_norm: return 95
        
    for generic, names in COMMON_NAME_MAPPINGS.items():
        if input_name.lower() in [n.lower() for n in names] and db_generic_norm == normalize_text_ultra(generic):
            return 95
            
    return max(
        fuzz.token_sort_ratio(input_name, db_name),
        fuzz.token_set_ratio(input_name, db_name),
        fuzz.partial_ratio(input_name, db_name),
        fuzz.QRatio(input_name, db_name)
    )

# --- Scoring routine ---
def score_drug_against_input(drug: Dict, inputs: Dict[str, Optional[str]]) -> Tuple[float, List[DrugMatchDetail], List[str]]:
    product_db = normalize_text_ultra(drug.get("product_name", "") or "")
    generic_db = normalize_text_ultra(drug.get("generic_name", "") or "")
    manu_db = normalize_text_ultra((drug.get("manufacturer") or {}).get("name", "") or "")
    nafdac_db = (drug.get("identifiers") or {}).get("nafdac_reg_no", "") or ""
    dosage_db = normalize_text_ultra(drug.get("dosage_form", "") or "")

    total_score = 0.0
    details: List[DrugMatchDetail] = []
    matched_fields = []
    field_weights = WEIGHTS.copy()
    warnings = []

    # Manufacturer scoring (highest priority after NAFDAC)
    if inputs.get("manufacturer"):
        s = score_manufacturer_match(inputs["manufacturer"], manu_db)
        weighted = s * field_weights["manufacturer"]
        total_score += weighted
        details.append(DrugMatchDetail(
            field="manufacturer",
            matched_value=(drug.get("manufacturer") or {}).get("name"),
            input_value=inputs.get("raw_manufacturer") or "",
            score=int(round(weighted)),
            algorithm=f"enhanced_manufacturer({s})"
        ))
        if s >= 80:
            matched_fields.append("manufacturer")
        else:
            warnings.append("manufacturer mismatch")
            total_score += SCORES["manufacturer_mismatch_penalty"]

    # NAFDAC scoring (most powerful)
    if inputs.get("nafdac"):
        nafdac_score, nafdac_reason = score_nafdac_match(inputs["nafdac"], nafdac_db)
        if nafdac_score > 0:
            weighted = nafdac_score * field_weights["nafdac"]
            total_score += weighted
            details.append(DrugMatchDetail(
                field="nafdac_reg_no",
                matched_value=(drug.get("identifiers") or {}).get("nafdac_reg_no"),
                input_value=inputs.get("raw_nafdac") or "",
                score=int(round(weighted)),
                algorithm=nafdac_reason
            ))
            if nafdac_score >= 80:
                matched_fields.append("nafdac_reg_no")
            else:
                warnings.append("NAFDAC number mismatch")
                total_score += SCORES["nafdac_mismatch_penalty"]
        else:
            warnings.append("NAFDAC number not found")
            total_score += SCORES["nafdac_mismatch_penalty"]

    # Product name scoring
    if inputs.get("product_name"):
        s = score_product_name_match(inputs["product_name"], product_db, generic_db)
        weighted = s * field_weights["product_name"]
        total_score += weighted
        details.append(DrugMatchDetail(
            field="product_name",
            matched_value=drug.get("product_name"),
            input_value=inputs.get("raw_product_name") or "",
            score=int(round(weighted)),
            algorithm=f"enhanced_name_match({s})"
        ))
        if s >= 80:
            matched_fields.append("product_name")
        else:
            warnings.append("product name mismatch")
            total_score += SCORES["name_mismatch_penalty"]

    # Generic name scoring
    if inputs.get("generic_name"):
        s = best_similarity(inputs["generic_name"], generic_db)
        weighted = s * field_weights["generic_name"]
        total_score += weighted
        details.append(DrugMatchDetail(
            field="generic_name",
            matched_value=drug.get("generic_name"),
            input_value=inputs.get("raw_generic_name") or "",
            score=int(round(weighted)),
            algorithm=f"generic_best({s})"
        ))
        if s >= 80:
            matched_fields.append("generic_name")

    # Dosage form scoring
    if inputs.get("dosage_form"):
        s = best_similarity(inputs["dosage_form"], dosage_db)
        if s > 60:
            weighted = s * field_weights["dosage_form"]
            total_score += weighted
            details.append(DrugMatchDetail(
                field="dosage_form",
                matched_value=drug.get("dosage_form"),
                input_value=inputs.get("raw_dosage_form") or "",
                score=int(round(weighted)),
                algorithm=f"dosage_best({s})"
            ))
            if s >= 80:
                matched_fields.append("dosage_form")

    # Apply bonus if all provided fields match
    provided_fields = [f for f in inputs if inputs.get(f) and f in field_weights]
    if len(matched_fields) == len(provided_fields):
        total_score += SCORES["full_match_bonus"]

    # Scale to 0..100
    max_possible = sum(w for f, w in field_weights.items() if inputs.get(f))
    score_scaled = (total_score / max_possible) * 100 if max_possible > 0 else total_score
    score_scaled = max(0.0, min(100.0, score_scaled))
    
    return score_scaled, details, warnings

def determine_verification_status(inputs: Dict, best_score: float, best_drug: Dict, warnings: List[str]) -> Dict:
    """Enhanced verification status determination with 7 scenarios"""
    provided_fields = [f for f in inputs if inputs.get(f) and f not in ["raw_*"]]
    
    # In determine_verification_status function:
    if provided_fields == ["nafdac"]:
        if best_score >= 95:  # Only exact or format-normalized matches
            return {
                "status": VerificationStatus.VERIFIED,
                "message": "✅ Verified via NAFDAC number",
                "confidence": "high"
            }
        elif best_score >= 70:  # Partial matches
            return {
                "status": VerificationStatus.PARTIAL_MATCH,
                "message": "⚠️ Partial NAFDAC match - verify other details",
                "confidence": "medium"
            }
        else:
            return {
                "status": VerificationStatus.LOW_CONFIDENCE,
                "message": "❌ No close NAFDAC match found",
                "confidence": "low"
            }
    
    # Scenario 2: Only product name provided
    elif provided_fields == ["product_name"]:
        if best_score >= SCORES["high_confidence"]:
            return {
                "status": VerificationStatus.HIGH_SIMILARITY,
                "message": f"⚠️ Multiple products match this name - verify manufacturer and NAFDAC",
                "confidence": "high"
            }
        return {
            "status": VerificationStatus.PARTIAL_MATCH,
            "message": "⚠️ Only product name provided - verify manufacturer and NAFDAC",
            "confidence": "low"
        }
    
    # Scenario 3: Only manufacturer provided
    elif provided_fields == ["manufacturer"]:
        return {
            "status": VerificationStatus.PARTIAL_MATCH,
            "message": "⚠️ Only manufacturer provided - many drugs match this manufacturer",
            "confidence": "low"
        }
    
    # Scenario 4: NAFDAC + product name
    elif set(provided_fields) == {"nafdac", "product_name"}:
        if "NAFDAC number mismatch" in warnings:
            return {
                "status": VerificationStatus.CONFLICT,
                "message": "❌ NAFDAC number doesn't match product name",
                "confidence": "low"
            }
        if best_score >= SCORES["high_confidence"]:
            return {
                "status": VerificationStatus.VERIFIED,
                "message": "✅ Verified via NAFDAC and product name",
                "confidence": "high"
            }
        return {
            "status": VerificationStatus.PARTIAL_MATCH,
            "message": "⚠️ Partial match between NAFDAC and product name",
            "confidence": "medium"
        }
    
    # Scenario 5: NAFDAC + manufacturer
    elif set(provided_fields) == {"nafdac", "manufacturer"}:
        if "NAFDAC number mismatch" in warnings:
            return {
                "status": VerificationStatus.CONFLICT,
                "message": "❌ NAFDAC number doesn't match manufacturer",
                "confidence": "low"
            }
        if best_score >= SCORES["high_confidence"]:
            return {
                "status": VerificationStatus.VERIFIED,
                "message": "✅ Verified via NAFDAC and manufacturer",
                "confidence": "high"
            }
        return {
            "status": VerificationStatus.PARTIAL_MATCH,
            "message": "⚠️ Partial match between NAFDAC and manufacturer",
            "confidence": "medium"
        }
    
    # Scenario 6: Product name + manufacturer
    elif set(provided_fields) == {"product_name", "manufacturer"}:
        if "manufacturer mismatch" in warnings:
            return {
                "status": VerificationStatus.CONFLICT,
                "message": "❌ Manufacturer doesn't match product name",
                "confidence": "low"
            }
        if best_score >= SCORES["high_confidence"]:
            return {
                "status": VerificationStatus.VERIFIED,
                "message": "✅ Verified via product name and manufacturer",
                "confidence": "high"
            }
        return {
            "status": VerificationStatus.PARTIAL_MATCH,
            "message": "⚠️ Partial match between product name and manufacturer",
            "confidence": "medium"
        }
    
    # Scenario 7: All three fields provided
    elif set(provided_fields) == {"product_name", "manufacturer", "nafdac"}:
        if "NAFDAC number mismatch" in warnings:
            return {
                "status": VerificationStatus.CONFLICT,
                "message": "❌ NAFDAC number doesn't match product details",
                "confidence": "low"
            }
        if "manufacturer mismatch" in warnings:
            return {
                "status": VerificationStatus.CONFLICT,
                "message": "❌ Manufacturer doesn't match product details",
                "confidence": "low"
            }
        if best_score >= SCORES["high_confidence"]:
            return {
                "status": VerificationStatus.VERIFIED,
                "message": "✅ Verified via all details",
                "confidence": "high"
            }
        return {
            "status": VerificationStatus.PARTIAL_MATCH,
            "message": "⚠️ Partial match - some details don't match",
            "confidence": "medium"
        }
    
    # Default case
    if best_score >= SCORES["high_confidence"]:
        return {
            "status": VerificationStatus.VERIFIED,
            "message": "✅ High confidence match",
            "confidence": "high"
        }
    elif best_score >= SCORES["medium_confidence"]:
        return {
            "status": VerificationStatus.PARTIAL_MATCH,
            "message": "⚠️ Medium confidence match - verify details",
            "confidence": "medium"
        }
    else:
        return {
            "status": VerificationStatus.LOW_CONFIDENCE,
            "message": "⚠️ Low confidence match - review carefully",
            "confidence": "low"
        }

def format_verification_result(inputs: Dict, results: List, idx: Dict) -> Dict:
    """Format the verification result based on input completeness"""
    provided_fields = [f for f in inputs if inputs.get(f) and f not in ["raw_*"]]
    
    # Case 1: Only NAFDAC provided
    if provided_fields == ["nafdac"]:
        return {
            "verification_type": "nafdac_only",
            "message": "Verification based solely on NAFDAC number",
            "results": results[:1]  # Only show exact match
        }
    
    # Case 2: Only product name provided
    elif provided_fields == ["product_name"]:
        exact_matches = [r for r in results if r[0] == SCORES["exact_match"]]
        if exact_matches:
            return {
                "verification_type": "exact_name_match",
                "message": f"Found {len(exact_matches)} exact name matches",
                "results": exact_matches
            }
        else:
            return {
                "verification_type": "similar_products",
                "message": f"Found {len(results)} similar products",
                "results": results[:10]  # Show top 10 similar
            }
    
    # Case 3: Only manufacturer provided
    elif provided_fields == ["manufacturer"]:
        manu_norm = normalize_text_ultra(inputs["manufacturer"])
        report_count = idx["manu_report_counts"].get(manu_norm, 0)
        return {
            "verification_type": "manufacturer_products",
            "message": f"Showing products from this manufacturer (reported {report_count} times)",
            "results": results[:20],  # Show more since manufacturer may have many products
            "manufacturer_reported": report_count > 0,
            "report_count": report_count
        }
    
    # Default case: Multiple fields provided
    return {
        "verification_type": "comprehensive_verification",
        "message": "Comprehensive verification result",
        "results": results[:5]  # Show top 5 matches
    }

# --- Verification endpoint ---
@router.post("/drug", response_model=DrugVerificationResponse)
async def verify_drug(
    request: DrugVerificationRequest,
    current_user: UserInDB = Depends(get_current_active_user)
):
    try:
        logger.info(f"Drug verification request by user: {current_user.email}")

        # Normalize inputs
        inputs = {
            "product_name": normalize_text_ultra(request.product_name or ""),
            "raw_product_name": request.product_name or "",
            "generic_name": normalize_text_ultra(request.generic_name or ""),
            "raw_generic_name": request.generic_name or "",
            "manufacturer": normalize_text_ultra(request.manufacturer or ""),
            "raw_manufacturer": request.manufacturer or "",
            "nafdac": request.nafdac_reg_no or "",
            "raw_nafdac": request.nafdac_reg_no or "",
            "dosage_form": normalize_text_ultra(request.dosage_form or ""),
            "raw_dosage_form": request.dosage_form or ""
        }

        # Validate at least one field is provided
        if not any(inputs.values()):
            raise HTTPException(status_code=400, detail="At least one search field must be provided")

        idx = build_indexes()
        candidate_ids = set()
        best_details = [] 
        best_matched = []

        # 1. Priority: NAFDAC exact or very close match if provided
        if inputs["nafdac"]:
            norm_nafdac = normalize_nafdac(inputs["nafdac"])
            input_no_dash = norm_nafdac.replace("-", "")
            
            # Exact match
            if norm_nafdac in idx["nafdac_map"]:
                candidate_ids.add(idx["nafdac_map"][norm_nafdac].get("nexahealth_id"))
            
            # Match without dashes
            for db_nafdac, drug in idx["nafdac_map"].items():
                db_no_dash = db_nafdac.replace("-", "")
                if input_no_dash == db_no_dash:
                    candidate_ids.add(drug.get("nexahealth_id"))
            
            # Only allow very close partial matches (first 4 digits)
            if len(input_no_dash) >= 4:
                for db_nafdac, drug in idx["nafdac_map"].items():
                    db_no_dash = db_nafdac.replace("-", "")
                    if len(db_no_dash) >= 4 and input_no_dash[:4] == db_no_dash[:4]:
                        candidate_ids.add(drug.get("nexahealth_id"))

        # 2. Manufacturer search if provided
        if inputs["manufacturer"]:
            manu_key = inputs["manufacturer"]
            for k in idx["manu_map"].keys():
                if manu_key == k or manu_key in k or k in manu_key:
                    candidate_ids.update(idx["manu_map"][k])

        # 3. Product/generic name search if provided
        if inputs["product_name"]:
            prod_key = inputs["product_name"]
            for k in idx["product_map"].keys():
                if prod_key == k or prod_key in k or k in prod_key:
                    candidate_ids.update(idx["product_map"][k])

        if inputs["generic_name"]:
            gen_key = inputs["generic_name"]
            for k in idx["generic_map"].keys():
                if gen_key == k or gen_key in k or k in gen_key:
                    candidate_ids.update(idx["generic_map"][k])

        # Fallback to fuzzy search if no candidates
        if not candidate_ids:
            combined_query = " ".join(filter(None, [
                inputs["product_name"],
                inputs["generic_name"],
                inputs["manufacturer"],
                inputs["nafdac"]
            ]))
            raw_matches = process.extract(
                combined_query,
                idx["all_search_texts"],
                scorer=fuzz.token_set_ratio,
                limit=200
            )
            for match_text, _, _ in raw_matches:
                nid = idx["search_text_map"].get(match_text)
                if nid: candidate_ids.add(nid)

        # Score all candidates
        scored_heap = []
        for nid in candidate_ids:
            drug = idx["id_map"].get(nid)
            if not drug: continue
            
            score, details, warnings = score_drug_against_input(drug, inputs)
            
            if score >= SCORES["min_return_score"]:
                heapq.heappush(scored_heap, (-score, nid, warnings, details))

        # Process results with enhanced formatting
        if not scored_heap:
            return await handle_no_matches(request, drug_db)

        results = []
        while scored_heap and len(results) < 10:
            neg_score, nid, warnings, details = heapq.heappop(scored_heap)
            drug = idx["id_map"].get(nid)
            if drug:
                score = abs(neg_score)
                results.append((score, drug, warnings, details))
        
        # Determine verification status
        best_score, best_drug, best_warnings, best_details = results[0]
        verification = determine_verification_status(inputs, best_score, best_drug, best_warnings)
        
        # Format response based on input type
        formatted_result = format_verification_result(inputs, results, idx)
        
        # Get manufacturer report count
        manu_norm = normalize_text_ultra((best_drug.get("manufacturer") or {}).get("name", ""))
        manu_report_count = idx["manu_report_counts"].get(manu_norm, 0)
        
        # Build final response
        response_data = {
            **verification,
            **formatted_result,
            "product_name": best_drug.get("product_name"),
            "generic_name": best_drug.get("generic_name"),
            "dosage_form": best_drug.get("dosage_form"),
            "strength": best_drug.get("strength"),
            "nafdac_reg_no": (best_drug.get("identifiers") or {}).get("nafdac_reg_no"),
            "manufacturer": (best_drug.get("manufacturer") or {}).get("name"),
            "match_score": int(round(best_score)),
            "pil_id": best_drug.get("nexahealth_id"),
            "last_verified": best_drug.get("approval", {}).get("approval_date"),
            "report_count": best_drug.get("report_stats", {}).get("total_reports", 0),
            "manufacturer_reported": manu_report_count > 0,
            "manufacturer_report_count": manu_report_count,
            "match_details": best_details,
            "confidence": verification["confidence"],
            "possible_matches": [
                {
                    "product_name": drug.get("product_name"),
                    "generic_name": drug.get("generic_name"),
                    "dosage_form": drug.get("dosage_form"),
                    "nafdac_reg_no": (drug.get("identifiers") or {}).get("nafdac_reg_no"),
                    "manufacturer": (drug.get("manufacturer") or {}).get("name"),
                    "match_score": int(round(score)),
                    "pil_id": drug.get("nexahealth_id"),
                    "report_count": drug.get("report_stats", {}).get("total_reports", 0)
                }
                for score, drug, _, _ in results[1:10]
            ]
        }

        await increment_stat_counter("verifications")
        return DrugVerificationResponse(**response_data)

    except Exception as e:
        logger.exception("Verification error")
        raise HTTPException(status_code=500, detail="Drug verification failed")

async def handle_no_matches(request, drug_db):
    # Try to find similar products
    all_names = [d.get("product_name") or "" for d in drug_db if d]
    matches = process.extract(
        request.product_name or request.generic_name or request.manufacturer or "",
        all_names,
        scorer=fuzz.token_set_ratio,
        limit=10
    )
    
    suggested_drugs = []
    for name, score, _ in matches:
        drug = next((d for d in drug_db if d and d.get("product_name") == name), None)
        if drug:
            suggested_drugs.append({
                "product_name": drug.get("product_name"),
                "generic_name": drug.get("generic_name"),
                "dosage_form": drug.get("dosage_form"),
                "nafdac_reg_no": (drug.get("identifiers") or {}).get("nafdac_reg_no"),
                "manufacturer": (drug.get("manufacturer") or {}).get("name"),
                "match_score": score,
                "pil_id": drug.get("nexahealth_id"),
                "report_count": drug.get("report_stats", {}).get("total_reports", 0)
            })

    await increment_stat_counter("verifications")
    if suggested_drugs:
        return DrugVerificationResponse(
            status=VerificationStatus.HIGH_SIMILARITY,
            message="No direct match found. Here are possible options:",
            match_score=0,
            possible_matches=suggested_drugs,
            confidence="medium"
        )
    
    return DrugVerificationResponse(
        status=VerificationStatus.UNKNOWN,
        message="No matching drug found in database.",
        match_score=0,
        confidence="low"
    )