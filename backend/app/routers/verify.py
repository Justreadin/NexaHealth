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
    "name_only_max_score": 40,
    "nafdac_only_max_score": 70,
    
    # Field-specific base scores
    "nafdac_exact": 100,
    "nafdac_partial": 70,
    "manufacturer_exact": 90,
    "manufacturer_similar": 70,
    "name_exact": 90,
    "name_similar": 70,
    
    # Deduction penalties (changed from negative to positive for addition)
    "manufacturer_mismatch_deduction": 20,  # 20 points deducted
    "name_mismatch_deduction": 15,          # 15 points deducted
    "nafdac_mismatch_deduction": 30,        # 30 points deducted
    
    # Bonus for complete matches
    "complete_match_bonus": 10
}

WEIGHTS = {
    "product_name": 0.20,
    "generic_name": 0.15,
    "manufacturer": 0.35,  # Increased priority
    "nafdac": 0.45,       # Most powerful matching
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
# --- Enhanced matching functions ---
def score_manufacturer_match(input_manu: str, db_manu: str) -> Tuple[int, str]:
    """Manufacturer matching with detailed scoring"""
    if not input_manu or not db_manu: return (0, "no match")
    
    norm_input = normalize_compact(input_manu)
    norm_db = normalize_compact(db_manu)
    
    if norm_input == norm_db: 
        return (SCORES["manufacturer_exact"], "exact match")
    if norm_input in norm_db or norm_db in norm_input: 
        return (SCORES["manufacturer_similar"], "contains match")
    
    similarity = best_similarity(input_manu, db_manu)
    if similarity >= 80:
        return (SCORES["manufacturer_similar"], f"similar ({similarity}%)")
    
    return (0, "no match")

def score_nafdac_match(input_nafdac: str, db_nafdac: str) -> Tuple[int, str]:
    """NAFDAC matching with priority scoring"""
    if not input_nafdac or not db_nafdac: return (0, "no match")
    
    norm_input = normalize_nafdac(input_nafdac)
    norm_db = normalize_nafdac(db_nafdac)
    
    # Exact match (highest priority)
    if norm_input == norm_db:
        return (SCORES["nafdac_exact"], "exact match")
    
    # Match without dashes
    input_no_dash = norm_input.replace("-", "")
    db_no_dash = norm_db.replace("-", "")
    if input_no_dash == db_no_dash:
        return (SCORES["nafdac_partial"], "format-normalized match")
    
    # Partial matches only if significant portion matches
    if len(input_no_dash) >= 4 and len(db_no_dash) >= 4:
        # Check if first 4 digits match
        if input_no_dash[:4] == db_no_dash[:4]:
            return (SCORES["nafdac_partial"], "partial prefix match")
    
    # Very low score for any other similarity
    similarity = best_similarity(input_nafdac, db_nafdac)
    if similarity > 60:
        return (similarity // 2, "fuzzy match")
    
    return (0, "no match")

def score_product_name_match(input_name: str, db_name: str) -> Tuple[int, str]:
    """Product name matching with detailed scoring"""
    if not input_name or not db_name: return (0, "no match")
    
    input_norm = normalize_text_ultra(input_name)
    db_name_norm = normalize_text_ultra(db_name)
    
    if input_norm == db_name_norm: 
        return (SCORES["name_exact"], "exact match")
    
    similarity = best_similarity(input_name, db_name)
    if similarity >= 80:
        return (SCORES["name_similar"], f"similar ({similarity}%)")
    
    return (0, "no match")

# --- Scoring routine ---
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
    field_scores = {}  # Track individual field scores for adaptive logic

    # Check if this is a name-only search (no manufacturer or NAFDAC)
    name_only = (inputs.get("product_name") or inputs.get("generic_name")) and \
               not inputs.get("manufacturer") and not inputs.get("nafdac")

    # INDEPENDENT FIELD MATCHING WITH PROPORTIONAL DEDUCTIONS
    # Each field is scored independently, with deductions proportional to mismatch severity
    
    # Manufacturer scoring
    manufacturer_score = 0
    if inputs.get("manufacturer"):
        manufacturer_score, manufacturer_reason = score_manufacturer_match(inputs["manufacturer"], manu_db)
        field_scores["manufacturer"] = manufacturer_score
        
        # Calculate weighted score with proportional adjustment
        base_weight = field_weights["manufacturer"]
        proportional_score = manufacturer_score / 100.0  # Convert to 0-1 scale
        
        weighted = manufacturer_score * base_weight * proportional_score
        total_score += weighted
        
        details.append(DrugMatchDetail(
            field="manufacturer",
            matched_value=(drug.get("manufacturer") or {}).get("name"),
            input_value=inputs.get("raw_manufacturer") or "",
            score=int(round(weighted)),
            algorithm=f"manufacturer_match({manufacturer_score})"
        ))
        
        if manufacturer_score >= 80:
            matched_fields.append("manufacturer")
        elif manufacturer_score > 0:
            warnings.append(f"manufacturer partial match ({manufacturer_score}%)")
        else:
            warnings.append("manufacturer mismatch")

    # NAFDAC scoring (most powerful)
    nafdac_score = 0
    if inputs.get("nafdac"):
        nafdac_score, nafdac_reason = score_nafdac_match(inputs["nafdac"], nafdac_db)
        field_scores["nafdac"] = nafdac_score
        
        if nafdac_score > 0:
            base_weight = field_weights["nafdac"]
            proportional_score = nafdac_score / 100.0
            
            weighted = nafdac_score * base_weight * proportional_score
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
            elif nafdac_score > 0:
                warnings.append(f"NAFDAC partial match ({nafdac_score}%)")
            else:
                warnings.append("NAFDAC number mismatch")
        else:
            warnings.append("NAFDAC number not found")

    # Product name scoring
    product_name_score = 0
    if inputs.get("product_name"):
        product_name_score, product_reason = score_product_name_match(inputs["product_name"], product_db)
        field_scores["product_name"] = product_name_score
        
        # For name-only searches, cap the product name score
        if name_only:
            input_norm = normalize_text_ultra(inputs["product_name"])
            db_name_norm = normalize_text_ultra(drug.get("product_name", ""))
            if input_norm == db_name_norm:
                product_name_score = 100  # Exact match gets full score
            else:
                product_name_score = min(product_name_score, SCORES["name_only_max_score"])
        
        base_weight = field_weights["product_name"]
        proportional_score = product_name_score / 100.0
        
        weighted = product_name_score * base_weight * proportional_score
        total_score += weighted
        
        details.append(DrugMatchDetail(
            field="product_name",
            matched_value=drug.get("product_name"),
            input_value=inputs.get("raw_product_name") or "",
            score=int(round(weighted)),
            algorithm=f"product_name_match({product_name_score})"
        ))
        
        if product_name_score >= 80:
            matched_fields.append("product_name")
        elif product_name_score > 0:
            warnings.append(f"product name partial match ({product_name_score}%)")
        else:
            warnings.append("product name mismatch")

    # Generic name scoring
    generic_name_score = 0
    if inputs.get("generic_name"):
        generic_name_score = best_similarity(inputs["generic_name"], generic_db)
        field_scores["generic_name"] = generic_name_score
        
        # For name-only searches, cap the generic name score
        if name_only:
            input_norm = normalize_text_ultra(inputs["generic_name"])
            db_generic_norm = normalize_text_ultra(drug.get("generic_name", ""))
            if input_norm == db_generic_norm:
                generic_name_score = 100  # Exact match gets full score
            else:
                generic_name_score = min(generic_name_score, SCORES["name_only_max_score"])
        
        base_weight = field_weights["generic_name"]
        proportional_score = generic_name_score / 100.0
        
        weighted = generic_name_score * base_weight * proportional_score
        total_score += weighted
        
        details.append(DrugMatchDetail(
            field="generic_name",
            matched_value=drug.get("generic_name"),
            input_value=inputs.get("raw_generic_name") or "",
            score=int(round(weighted)),
            algorithm=f"generic_best({generic_name_score})"
        ))
        
        if generic_name_score >= 80:
            matched_fields.append("generic_name")
        elif generic_name_score > 0:
            warnings.append(f"generic name partial match ({generic_name_score}%)")

    # Dosage form scoring
    dosage_score = 0
    if inputs.get("dosage_form"):
        dosage_score = best_similarity(inputs["dosage_form"], dosage_db)
        field_scores["dosage_form"] = dosage_score
        
        if dosage_score > 60:
            base_weight = field_weights["dosage_form"]
            proportional_score = dosage_score / 100.0
            
            weighted = dosage_score * base_weight * proportional_score
            total_score += weighted
            
            details.append(DrugMatchDetail(
                field="dosage_form",
                matched_value=drug.get("dosage_form"),
                input_value=inputs.get("raw_dosage_form") or "",
                score=int(round(weighted)),
                algorithm=f"dosage_best({dosage_score})"
            ))
            
            if dosage_score >= 80:
                matched_fields.append("dosage_form")
            elif dosage_score > 0:
                warnings.append(f"dosage form partial match ({dosage_score}%)")

    # ADAPTIVE SCORING: Adjust based on field confidence levels
    # Calculate confidence multiplier based on field scores
    confidence_multiplier = 1.0
    provided_count = sum(1 for field in field_weights if inputs.get(field))
    
    if provided_count > 0:
        avg_field_score = sum(field_scores.get(field, 0) for field in field_weights if inputs.get(field)) / provided_count
        # Higher average field score = higher confidence multiplier
        confidence_multiplier = avg_field_score / 100.0
    
    total_score *= confidence_multiplier

    # Apply bonus if all provided fields match well
    provided_fields = [f for f in inputs if inputs.get(f) and f in field_weights]
    if len(matched_fields) == len(provided_fields):
        total_score += SCORES["complete_match_bonus"]

    # Scale to 0..100
    max_possible = sum(w for f, w in field_weights.items() if inputs.get(f))
    score_scaled = (total_score / max_possible) * 100 if max_possible > 0 else total_score
    score_scaled = max(0.0, min(100.0, score_scaled))
    
    # Final adjustments based on search type
    if name_only:
        input_product_norm = normalize_text_ultra(inputs.get("product_name", ""))
        input_generic_norm = normalize_text_ultra(inputs.get("generic_name", ""))
        db_product_norm = normalize_text_ultra(drug.get("product_name", ""))
        db_generic_norm = normalize_text_ultra(drug.get("generic_name", ""))
        
        is_exact_match = (
            (input_product_norm and input_product_norm == db_product_norm) or
            (input_generic_norm and input_generic_norm == db_generic_norm)
        )
        
        if not is_exact_match:
            score_scaled = min(score_scaled, SCORES["name_only_max_score"])
    
    # Cap for NAFDAC-only searches
    nafdac_only = inputs.get("nafdac") and not (inputs.get("product_name") or inputs.get("generic_name") or inputs.get("manufacturer"))
    if nafdac_only:
        norm_input_nafdac = normalize_nafdac(inputs["nafdac"])
        norm_db_nafdac = normalize_nafdac((drug.get("identifiers") or {}).get("nafdac_reg_no", ""))
        
        if norm_input_nafdac != norm_db_nafdac:
            score_scaled = min(score_scaled, SCORES["nafdac_only_max_score"])
    
    # Cap for searches without NAFDAC
    no_nafdac = not inputs.get("nafdac") and (inputs.get("product_name") or inputs.get("generic_name") or inputs.get("manufacturer"))
    if no_nafdac:
        score_scaled = min(score_scaled, SCORES["nafdac_only_max_score"])
    
    return score_scaled, details, warnings

def determine_verification_status(inputs: Dict, best_score: float, best_drug: Dict, warnings: List[str], results: List) -> Dict:
    """Enhanced adaptive verification status determination"""
    provided_fields = [f for f in inputs if inputs.get(f) and f not in ["raw_*"]]
    
    # Check search types
    name_only = (inputs.get("product_name") or inputs.get("generic_name")) and \
            not inputs.get("manufacturer") and not inputs.get("nafdac")
    
    nafdac_only = inputs.get("nafdac") and not (inputs.get("product_name") or inputs.get("generic_name") or inputs.get("manufacturer"))
    
    no_nafdac = not inputs.get("nafdac") and (inputs.get("product_name") or inputs.get("generic_name") or inputs.get("manufacturer"))

    # Check for multiple similar results (indicating potential ambiguity)
    multiple_similar = len(results) > 1 and results[0][0] - results[1][0] < 20  # Close scores

    # Handle name-only searches
    if name_only:
        input_product_norm = normalize_text_ultra(inputs.get("product_name", ""))
        input_generic_norm = normalize_text_ultra(inputs.get("generic_name", ""))
        db_product_norm = normalize_text_ultra(best_drug.get("product_name", ""))
        db_generic_norm = normalize_text_ultra(best_drug.get("generic_name", ""))
        
        is_exact_match = (
            (input_product_norm and input_product_norm == db_product_norm) or
            (input_generic_norm and input_generic_norm == db_generic_norm)
        )
        
        if is_exact_match:
            if multiple_similar:
                return {
                    "status": VerificationStatus.HIGH_SIMILARITY,
                    "message": "✅ Exact name match found, but multiple similar products exist",
                    "confidence": "high",
                    "requires_confirmation": True
                }
            return {
                "status": VerificationStatus.VERIFIED,
                "message": "✅ Exact name match found",
                "confidence": "high"
            }
        elif best_score >= SCORES["name_only_max_score"]:
            return {
                "status": VerificationStatus.HIGH_SIMILARITY,
                "message": "ℹ️ Similar products found - verify manufacturer and NAFDAC",
                "confidence": "medium"
            }
        else:
            return {
                "status": VerificationStatus.LOW_CONFIDENCE,
                "message": "⚠️ Low confidence match - review carefully",
                "confidence": "low"
            }

    # Handle NAFDAC-only searches
    if nafdac_only:
        if best_score >= 95:
            return {
                "status": VerificationStatus.VERIFIED,
                "message": "✅ Verified via NAFDAC number",
                "confidence": "high"
            }
        elif best_score >= 70:
            return {
                "status": VerificationStatus.PARTIAL_MATCH,
                "message": "⚠️ Partial NAFDAC match - please verify details",
                "confidence": "medium",
                "requires_confirmation": True
            }
        else:
            return {
                "status": VerificationStatus.LOW_CONFIDENCE,
                "message": "❌ No close NAFDAC match found",
                "confidence": "low"
            }
        
    # Handle searches without NAFDAC
    if no_nafdac:
        if best_score >= SCORES["high_confidence"]:
            return {
                "status": VerificationStatus.HIGH_SIMILARITY,
                "message": "⚠️ High similarity match found. For complete verification, please provide the NAFDAC number.",
                "confidence": "medium",
                "requires_nafdac": True
            }
        elif best_score >= SCORES["medium_confidence"]:
            return {
                "status": VerificationStatus.PARTIAL_MATCH,
                "message": "⚠️ Partial match found. For higher confidence verification, please provide the NAFDAC number.",
                "confidence": "medium",
                "requires_nafdac": True
            }
        else:
            return {
                "status": VerificationStatus.LOW_CONFIDENCE,
                "message": "⚠️ Low confidence match. Please provide the NAFDAC number for complete verification.",
                "confidence": "low",
                "requires_nafdac": True
            }

    # ADAPTIVE LOGIC FOR MIXED FIELD SCENARIOS
    # Analyze warnings to determine the nature of mismatches
    has_nafdac_warning = any("NAFDAC" in warning for warning in warnings)
    has_manufacturer_warning = any("manufacturer" in warning for warning in warnings)
    has_name_warning = any("product name" in warning or "generic name" in warning for warning in warnings)
    
    # NAFDAC has highest priority - if it matches well, trust it
    if inputs.get("nafdac") and not has_nafdac_warning:
        if has_manufacturer_warning and has_name_warning:
            return {
                "status": VerificationStatus.VERIFIED,
                "message": "✅ Verified via NAFDAC number (other details differ)",
                "confidence": "high",
                "requires_confirmation": True
            }
        elif has_manufacturer_warning:
            return {
                "status": VerificationStatus.VERIFIED,
                "message": "✅ Verified via NAFDAC number (manufacturer differs)",
                "confidence": "high",
                "requires_confirmation": True
            }
        elif has_name_warning:
            return {
                "status": VerificationStatus.VERIFIED,
                "message": "✅ Verified via NAFDAC number (name differs)",
                "confidence": "high",
                "requires_confirmation": True
            }
        else:
            return {
                "status": VerificationStatus.VERIFIED,
                "message": "✅ Verified via all details",
                "confidence": "high"
            }
    
    # Manufacturer has second priority
    if inputs.get("manufacturer") and not has_manufacturer_warning:
        if has_nafdac_warning:
            return {
                "status": VerificationStatus.PARTIAL_MATCH,
                "message": "⚠️ Manufacturer matches but NAFDAC differs",
                "confidence": "medium"
            }
        elif has_name_warning:
            return {
                "status": VerificationStatus.PARTIAL_MATCH,
                "message": "⚠️ Manufacturer matches but name differs",
                "confidence": "medium"
            }
        else:
            return {
                "status": VerificationStatus.VERIFIED,
                "message": "✅ Verified via manufacturer and other details",
                "confidence": "high"
            }

    # Default scoring based on overall confidence
    if best_score >= SCORES["high_confidence"]:
        if multiple_similar:
            return {
                "status": VerificationStatus.HIGH_SIMILARITY,
                "message": "⚠️ High confidence match, but multiple similar products found",
                "confidence": "high",
                "requires_confirmation": True
            }
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
    
    # Check if only name fields are provided (no manufacturer or NAFDAC)
    name_only = (inputs.get("product_name") or inputs.get("generic_name")) and \
               not inputs.get("manufacturer") and not inputs.get("nafdac")
    
    # Case: Only product/generic name provided (no manufacturer/NAFDAC)
    if name_only:
        # Filter for exact matches first
        exact_matches = [r for r in results if r[0] >= 95]
        
        if exact_matches:
            return {
                "verification_type": "exact_name_match",
                "message": f"Found {len(exact_matches)} exact name matches",
                "results": exact_matches
            }
        else:
            # For generic names, show all products with that generic name
            if inputs.get("generic_name"):
                generic_norm = normalize_text_ultra(inputs["generic_name"])
                generic_matches = []
                for score, drug, warnings, details in results:
                    drug_generic_norm = normalize_text_ultra(drug.get("generic_name", ""))
                    if drug_generic_norm == generic_norm:
                        generic_matches.append((score, drug, warnings, details))
                
                if generic_matches:
                    return {
                        "verification_type": "generic_name_products",
                        "message": f"Found {len(generic_matches)} products with this generic name",
                        "results": generic_matches
                    }
            
            # Otherwise show similar products
            return {
                "verification_type": "similar_products",
                "message": f"Found {len(results)} similar products",
                "results": results[:15]  # Show more similar products
            }
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
        "results": results[:15]  # Show top 5 matches
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

        # Check if this is a name-only search
        name_only = (request.product_name or request.generic_name) and \
                   not request.manufacturer and not request.nafdac_reg_no
        
        # For name-only searches, we need to find ALL similar products, not just the best match
        if name_only and (request.product_name or request.generic_name):
            # Use broader search to find all products with similar names
            if request.product_name:
                prod_key = inputs["product_name"]
                # Find exact matches first
                if prod_key in idx["product_map"]:
                    candidate_ids.update(idx["product_map"][prod_key])
                
                # Find products where the input is contained in the product name
                for k in idx["product_map"].keys():
                    if prod_key in k or k in prod_key:
                        candidate_ids.update(idx["product_map"][k])
            
            if request.generic_name:
                gen_key = inputs["generic_name"]
                # Find exact matches in generic names
                if gen_key in idx["generic_map"]:
                    candidate_ids.update(idx["generic_map"][gen_key])
                
                # Find products where the input is contained in the generic name
                for k in idx["generic_map"].keys():
                    if gen_key in k or k in gen_key:
                        candidate_ids.update(idx["generic_map"][k])
        else:
            # ... rest of your existing candidate collection logic for non-name-only searches ...
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
        # In the verify_drug endpoint, update the verification status call:
        verification = determine_verification_status(inputs, best_score, best_drug, best_warnings, results)
        
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