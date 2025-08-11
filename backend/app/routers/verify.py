# app/routers/verify.py
from fastapi import APIRouter, HTTPException, Depends
from typing import Optional, List, Dict, Tuple, Any
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
    "full_match_bonus": 20
}

WEIGHTS = {
    "product_name": 0.35,
    "generic_name": 0.25,
    "manufacturer": 0.30,  # Highest priority
    "nafdac_additive": 0.60,  # Most powerful matching
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
    # ... (keep your existing common name mappings)
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
    """Normalize NAFDAC number by removing all non-alphanumeric chars and spaces"""
    if not nafdac: return ""
    return re.sub(r"[^a-zA-Z0-9]", "", nafdac).upper()

def normalize_compact(text: Optional[str]) -> str:
    return re.sub(r"[^\w]", "", normalize_text_ultra(text))

# --- Similarity functions ---
def best_similarity(a: str, b: str) -> int:
    if not a or not b: return 0
    return int(max(
        fuzz.token_set_ratio(a, b),
        fuzz.partial_ratio(a, b),
        fuzz.WRatio(a, b)
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
            if manu_norm: manu_map[manu_norm].append(nid)
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
        "all_search_texts": all_search_texts
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
    """Enhanced NAFDAC matching with flexible formatting"""
    if not input_nafdac or not db_nafdac: return (0, "no match")
    
    norm_input = normalize_nafdac(input_nafdac)
    norm_db = normalize_nafdac(db_nafdac)
    
    if norm_input == norm_db: return (100, "exact match")
    if len(norm_input) >= 5 and len(norm_db) >= 5 and norm_input[:5] == norm_db[:5]:
        return (95, "prefix match")
    if norm_input in norm_db or norm_db in norm_input: return (90, "partial match")
    
    # Try matching with common variations (B4-1234 vs B41234)
    input_clean = re.sub(r'[^A-Z0-9]', '', input_nafdac.upper())
    db_clean = re.sub(r'[^A-Z0-9]', '', db_nafdac.upper())
    if input_clean == db_clean: return (95, "format-normalized match")
    
    # Try phonetic matching for letter prefixes
    if len(input_clean) >= 2 and len(db_clean) >= 2:
        input_prefix = input_clean[:2]
        db_prefix = db_clean[:2]
        if input_prefix == db_prefix:
            num_sim = best_similarity(input_clean[2:], db_clean[2:])
            if num_sim > 80:
                return (85, "prefix + numeric match")
    
    return (best_similarity(input_nafdac, db_nafdac), "fuzzy match")

def score_product_name_match(input_name: str, db_name: str, db_generic: str) -> int:
    """Enhanced product name matching"""
    if input_name == db_name: return 100
    if input_name == db_generic: return 95
        
    for generic, names in COMMON_NAME_MAPPINGS.items():
        if input_name in names and db_generic == generic:
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

    # Manufacturer scoring (highest priority)
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

    # NAFDAC scoring (most powerful)
    if inputs.get("nafdac"):
        nafdac_score, nafdac_reason = score_nafdac_match(inputs["nafdac"], nafdac_db)
        if nafdac_score > 0:
            weighted = nafdac_score * field_weights["nafdac_additive"]
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

    # Scale to 0..100
    max_possible = sum(w for f, w in field_weights.items() if inputs.get(f))
    score_scaled = (total_score / max_possible) * 100 if max_possible > 0 else total_score
    score_scaled = max(0.0, min(100.0, score_scaled))
    
    return score_scaled, details, matched_fields


def determine_verification_status(inputs: Dict, best_score: float, best_drug: Dict, conflicts: List[str]) -> Dict:
    """Enhanced verification status determination"""
    # Exact NAFDAC match supersedes everything
    if inputs.get("nafdac") and best_drug.get("identifiers", {}).get("nafdac_reg_no"):
        norm_input = normalize_nafdac(inputs["nafdac"])
        norm_db = normalize_nafdac(best_drug.get("identifiers", {}).get("nafdac_reg_no", ""))
        if norm_input == norm_db:
            return {
                "status": VerificationStatus.VERIFIED,
                "message": "✅ Verified via NAFDAC number",
                "confidence": "exact"
            }
    
    # Handle single-field cases
    provided_fields = [f for f in inputs if inputs[f]]
    if len(provided_fields) == 1:
        field = provided_fields[0]
        if field == "nafdac":
            return {
                "status": VerificationStatus.PARTIAL_MATCH,
                "message": "⚠️ Only NAFDAC number provided - verify other details",
                "confidence": "medium"
            }
        elif field == "product_name":
            if best_score >= SCORES["high_confidence"]:
                return {
                    "status": VerificationStatus.HIGH_SIMILARITY,
                    "message": f"⚠️ Multiple products match this name - verify manufacturer and NAFDAC",
                    "confidence": "high"
                }
        elif field == "manufacturer":
            return {
                "status": VerificationStatus.PARTIAL_MATCH,
                "message": "⚠️ Only manufacturer provided - many drugs match this manufacturer",
                "confidence": "low"
            }
    
    # Handle conflicts
    if conflicts:
        if "NAFDAC number mismatch" in conflicts:
            return {
                "status": VerificationStatus.CONFLICT,
                "message": "❌ NAFDAC number doesn't match product details",
                "confidence": "low"
            }
        return {
            "status": VerificationStatus.CONFLICT_WARNING,
            "message": f"⚠️ Partial match with conflicts: {', '.join(conflicts)}",
            "confidence": "medium"
        }
    
    # Standard confidence levels
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
    
def format_verification_result(inputs: Dict, results: List) -> Dict:
    """Format the verification result based on input completeness"""
    provided_fields = [f for f in inputs if inputs[f] and f not in ["raw_*"]]
    
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
        return {
            "verification_type": "manufacturer_products",
            "message": f"Showing products from this manufacturer",
            "results": results[:20]  # Show more since manufacturer may have many products
        }
    
    # Default case: Multiple fields provided
    return {
        "verification_type": "comprehensive_verification",
        "message": "Comprehensive verification result",
        "results": results[:5]  # Show top 5 matches
    }
def handle_nafdac_discrepancies(inputs: Dict, drug: Dict) -> Tuple[int, List[str]]:
    """Check for NAFDAC-related issues and adjust score accordingly"""
    penalty = 0
    warnings = []
    
    try:
        # Early return if missing data
        if not inputs.get("nafdac") or not drug.get("identifiers", {}).get("nafdac_reg_no"):
            return penalty, warnings
            
        norm_input = normalize_nafdac(inputs["nafdac"])
        norm_db = normalize_nafdac(drug["identifiers"]["nafdac_reg_no"])
        
        # Exact match gives bonus
        if norm_input == norm_db:
            penalty += SCORES["nafdac_exact_bonus"]
        # Mismatch applies heavy penalty
        elif norm_input != norm_db:
            penalty -= 50
            warnings.append("NAFDAC number mismatch")
            
    except Exception as e:
        logger.warning(f"NAFDAC discrepancy check failed: {str(e)}")
    
    return penalty, warnings

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

        # 1. Priority: Manufacturer search if provided
        if inputs["manufacturer"]:
            manu_key = inputs["manufacturer"]
            for k in idx["manu_map"].keys():
                if manu_key == k or manu_key in k or k in manu_key:
                    candidate_ids.update(idx["manu_map"][k])

        # 2. NAFDAC exact or partial match if provided
        nafdac_matches = []
        if inputs["nafdac"]:
            norm_nafdac = normalize_nafdac(inputs["nafdac"])
            # Exact match
            if norm_nafdac in idx["nafdac_map"]:
                candidate_ids.add(idx["nafdac_map"][norm_nafdac].get("nexahealth_id"))
            # Partial matches (first 5 chars)
            if len(norm_nafdac) >= 5:
                for db_nafdac, drug in idx["nafdac_map"].items():
                    if db_nafdac.startswith(norm_nafdac[:5]):
                        candidate_ids.add(drug.get("nexahealth_id"))

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
            
            score, details, matched_fields = score_drug_against_input(drug, inputs)
            
            # Apply NAFDAC discrepancy checks
            nafdac_penalty, nafdac_warnings = handle_nafdac_discrepancies(inputs, drug)
            score += nafdac_penalty
            
            # Apply bonus if all provided fields match
            if len(matched_fields) == len([f for f in inputs if inputs[f]]):
                score += SCORES["full_match_bonus"]
            
            if score >= SCORES["min_return_score"]:
                heapq.heappush(scored_heap, (-score, nid, nafdac_warnings))

        # Process results with enhanced formatting
        if not scored_heap:
            return await handle_no_matches(request, drug_db)

        results = []
        while scored_heap and len(results) < 10:
            neg_score, nid, warnings = heapq.heappop(scored_heap)
            drug = idx["id_map"].get(nid)
            if drug:
                # Recalculate to ensure consistency
                score = abs(neg_score)
                results.append((score, drug, warnings))
        
        # Determine verification status
        best_score, best_drug, best_warnings = results[0]
        verification = determine_verification_status(inputs, best_score, best_drug, best_warnings)
        
        # Format response based on input type
        formatted_result = format_verification_result(inputs, results)
        
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
            "match_details": best_details,
            "matched_fields": best_matched,
            "confidence": (
                "high" if best_score >= SCORES["high_confidence"] else
                "medium" if best_score >= SCORES["medium_confidence"] else
                "low"
            ),
            "possible_matches": [
                {
                    "product_name": drug.get("product_name"),
                    "generic_name": drug.get("generic_name"),
                    "dosage_form": drug.get("dosage_form"),
                    "nafdac_reg_no": (drug.get("identifiers") or {}).get("nafdac_reg_no"),
                    "manufacturer": (drug.get("manufacturer") or {}).get("name"),
                    "match_score": int(round(score)),
                    "pil_id": drug.get("nexahealth_id")
                }
                for score, drug, _ in results[1:10]
            ]
        }

        # Determine message based on match quality and conflicts
        conflicts = []
        if inputs["product_name"] and best_drug.get("product_name"):
            if fuzz.token_set_ratio(inputs["product_name"], 
                                  normalize_text_ultra(best_drug.get("product_name") or "")) < 75:
                conflicts.append("product name mismatch")
        
        if inputs["nafdac"] and best_drug.get("identifiers", {}).get("nafdac_reg_no"):
            norm_input = normalize_nafdac(inputs["nafdac"])
            norm_db = normalize_nafdac(best_drug.get("identifiers", {}).get("nafdac_reg_no") or "")
            if norm_input != norm_db:
                conflicts.append("NAFDAC number mismatch")
        
        if conflicts:
            response_data["status"] = VerificationStatus.CONFLICT_WARNING
            response_data["message"] = f"⚠️ Partial match with conflicts: {', '.join(conflicts)}"
        elif best_score >= SCORES["high_confidence"]:
            response_data["message"] = "✅ High confidence match"
        elif best_score >= SCORES["medium_confidence"]:
            response_data["message"] = "⚠️ Medium confidence match - verify details"
        else:
            response_data["message"] = "⚠️ Low confidence match - review carefully"

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
                "pil_id": drug.get("nexahealth_id")
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