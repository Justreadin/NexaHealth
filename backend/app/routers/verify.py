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

# --- Configurable thresholds & starting weights (tunable) ---
SCORES = {
    "high_confidence": 85,
    "medium_confidence": 70,
    "low_confidence": 60,
    "min_return_score": 55
}

WEIGHTS = {
    # defaults; tuning script can change these at runtime if you want
    "product_name": 0.40,
    "generic_name": 0.40,
    "manufacturer": 0.15,
    # nafdac handled specially (high precision)
    "nafdac_additive": 0.30
}

CORP_SUFFIXES = [
    # General corporate suffixes (various global)
    r"\bltd\b", r"\blimited\b", r"\bplc\b", r"\binc\b", r"\bincorporated\b",
    r"\bco\b", r"\bcompany\b", r"\bcorp\b", r"\bcorporation\b", r"\bllc\b",
    r"\bllp\b", r"\bpartners\b", r"\bgroup\b", r"\bholdings\b",
    r"\bsa\b", r"\bag\b", r"\bgmbh\b", r"\bsp\.?z\.?o\.?o\.?\b",  # common european suffixes

    # Pharma and healthcare-specific suffixes and terms
    r"\bindustries\b", r"\bpharma\b", r"\bpharmaceuticals\b", r"\bpharmacies\b",
    r"\bhealthcare\b", r"\bbiotech\b", r"\bbiotechnology\b", r"\bmedicines\b",
    r"\blaboratories\b", r"\blabs\b", r"\bresearch\b", r"\btherapeutics\b",
    r"\bsciences\b", r"\bformulations\b",

    # Common abbreviations and variants with punctuation
    r"\bltd\.?\b", r"\binc\.?\b", r"\bco\.?\b", r"\bplc\.?\b",

    # Regional or local variants
    r"\bpty ltd\b", r"\bpvt ltd\b", r"\bprivate limited\b", r"\bprivate ltd\b"
]

COMMON_NAME_MAPPINGS = {
    "paracetamol": [
        "panadol", "acetaminophen", "tylenol", "panadol extra", "panadol tablet", "calpol"
    ],
    "metronidazole": [
        "flagyl", "metrogel", "metro", "metrogyl", "metronidazole tablet"
    ],
    "amoxicillin": [
        "amoxil", "amoxycillin", "moxatag", "amox", "amoxicillin trihydrate"
    ],
    "artemether lumefantrine": [
        "coartem", "artemether/lumefantrine", "ralem", "artemether lumefantrine tablet"
    ],
    "ciprofloxacin": [
        "cipro", "ciproxin", "ciprofloxacin hydrochloride", "ciproxin xl"
    ],
    "ibuprofen": [
        "advil", "motrin", "nurofen", "brufen", "ibuprofen tablet"
    ],
    "azithromycin": [
        "azitromycin", "zithromax", "azitro", "azithromycin tablet"
    ],
    "omeprazole": [
        "prilosec", "omeprazole magnesium", "omeprazole delayed-release"
    ],
    "salbutamol": [
        "ventolin", "albuterol", "salbutamol inhaler", "ventolin inhaler"
    ],
    "diclofenac": [
        "voltaren", "diclofenac sodium", "diclofenac gel", "voltaren emulgel"
    ],
    "hydrocortisone": [
        "cortizone", "hydrocortisone cream", "hydrocortisone acetate"
    ],
    "diphenhydramine": [
        "benadryl", "diphenhydramine hydrochloride", "diphenhydramine tablet"
    ],
    "atorvastatin": [
        "lipitor", "atorvastatin calcium"
    ],
    "simvastatin": [
        "zocor", "simvastatin tablet"
    ],
    "levothyroxine": [
        "synthroid", "euthyrox", "levothyroxine sodium"
    ],
    "metformin": [
        "glucophage", "metformin hydrochloride"
    ],
    "insulin glargine": [
        "lantus", "toujeo", "basaglar"
    ],
    # Add common misspellings, regional brand names, or formulations:
    "paracetamol-codeine": [
        "panadeine", "co-codamol", "paracetamol with codeine"
    ],
    "amoxicillin clavulanate": [
        "augmentin", "co-amoxiclav", "amoxycillin clavulanate"
    ],
    "prednisone": [
        "deltasone", "prednisolone", "prednisone acetate"
    ],
    "fluconazole": [
        "flucox", "diflucan", "fluconazole tablet"
    ],
}

# --- Phonetic matching: Double Metaphone (optional) ---
try:
    from metaphone import doublemetaphone
    def dm_codes(s: str) -> Tuple[str, str]:
        return doublemetaphone(s or "")
    logger.info("Double Metaphone available (metaphone.doublemetaphone)")
except Exception:
    # fallback simple phonetic: keep first consonant cluster + vowels removed (very rough)
    def dm_codes(s: str) -> Tuple[str, str]:
        if not s:
            return ("", "")
        s2 = re.sub(r'[^a-z0-9]', '', s.lower())
        # fallback produce a pair with truncated / reversed to mimic two codes
        return (s2[:6], s2[::-1][:6])
    logger.warning("metaphone.doublemetaphone not available - using fallback phonetic")

# --- Helpers: normalization & similarity ---
def normalize_text_ultra(text: Optional[str]) -> str:
    if not text:
        return ""
    s = unicodedata.normalize("NFD", text)
    s = "".join(ch for ch in s if unicodedata.category(ch) != "Mn")
    s = s.lower().strip()
    s = re.sub(r"[^\w\s]", " ", s)
    for suf in CORP_SUFFIXES:
        s = re.sub(suf, " ", s)
    s = re.sub(r"\s+", " ", s).strip()
    return s

def normalize_compact(text: Optional[str]) -> str:
    return re.sub(r"[^\w]", "", normalize_text_ultra(text))

def best_similarity(a: str, b: str) -> int:
    if not a or not b:
        return 0
    try:
        # take max of heuristic scorers
        return int(max(
            fuzz.token_set_ratio(a, b),
            fuzz.partial_ratio(a, b),
            fuzz.WRatio(a, b)
        ))
    except Exception:
        try:
            return int(fuzz.ratio(a, b))
        except Exception:
            return 0

# --- Index builder (cached) ---
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

            product = drug.get("product_name", "") or ""
            generic = drug.get("generic_name", "") or ""
            manu = (drug.get("manufacturer") or {}).get("name", "") or ""
            nafdac = (drug.get("identifiers") or {}).get("nafdac_reg_no", "") or ""
            dosage = drug.get("dosage_form", "") or ""
            strength = drug.get("strength", "") or ""

            product_norm = normalize_text_ultra(product)
            generic_norm = normalize_text_ultra(generic)
            manu_norm = normalize_text_ultra(manu)
            nafdac_compact = normalize_compact(nafdac)

            if product_norm:
                product_map[product_norm].append(nid)
            if generic_norm:
                generic_map[generic_norm].append(nid)
            if manu_norm:
                manu_map[manu_norm].append(nid)
            if nafdac_compact:
                nafdac_map[nafdac_compact] = drug

            combined = " ".join(filter(None, [
                product_norm,
                generic_norm,
                manu_norm,
                normalize_text_ultra(dosage),
                normalize_text_ultra(strength),
                nafdac_compact
            ])).strip()
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

# --- Alias map (populated in background) ---
ALIAS_MAP: Dict[str, List[str]] = {}
PRECOMPUTED_CACHE: Dict[str, List[Dict[str, Any]]] = {}  # query -> top candidate list

def build_alias_map_from_db() -> Dict[str, List[str]]:
    logger.info("Building ALIAS_MAP from DB")
    idx = build_indexes()
    alias_map = defaultdict(set)
    for nid, drug in idx["id_map"].items():
        product_norm = normalize_text_ultra(drug.get("product_name", "") or "")
        generic_norm = normalize_text_ultra(drug.get("generic_name", "") or "")
        if product_norm and generic_norm:
            alias_map[product_norm].add(generic_norm)
            alias_map[generic_norm].add(product_norm)
        # consider composition tokens as aliases
        comp = normalize_text_ultra(drug.get("composition") or "")
        if comp:
            # add each token
            for token in comp.split():
                alias_map[token].add(product_norm)
                alias_map[token].add(generic_norm)
    # include COMMON_NAME_MAPPINGS
    for k, vals in COMMON_NAME_MAPPINGS.items():
        k_norm = normalize_text_ultra(k)
        for v in vals:
            alias_map[k_norm].add(normalize_text_ultra(v))
            alias_map[normalize_text_ultra(v)].add(k_norm)
    # convert to lists
    return {k: list(v) for k, v in alias_map.items()}

# --- Scoring routine (single drug vs inputs) ---
def score_drug_against_input(drug: Dict, inputs: Dict[str, Optional[str]]) -> Tuple[float, List[DrugMatchDetail]]:
    product_db = normalize_text_ultra(drug.get("product_name", "") or "")
    generic_db = normalize_text_ultra(drug.get("generic_name", "") or "")
    manu_db = normalize_text_ultra((drug.get("manufacturer") or {}).get("name", "") or "")
    nafdac_db = normalize_compact((drug.get("identifiers") or {}).get("nafdac_reg_no", "") or "")
    dosage_db = normalize_text_ultra(drug.get("dosage_form", "") or "")

    total_score = 0.0
    details: List[DrugMatchDetail] = []

    # product
    if inputs.get("product_name"):
        s = best_similarity(inputs["product_name"], product_db)
        # alias bonus if input maps to alias that equals generic_db
        alias_bonus = 0
        for a in ALIAS_MAP.get(inputs["product_name"], []):
            if a == generic_db:
                alias_bonus = 95
                break
        name_score = max(s, alias_bonus)
        weighted = name_score * WEIGHTS["product_name"]
        total_score += weighted
        details.append(DrugMatchDetail(
            field="product_name",
            matched_value=drug.get("product_name"),
            input_value=inputs.get("raw_product_name") or "",
            score=int(round(weighted)),
            algorithm=f"name_best({s})"
        ))

    # generic
    if inputs.get("generic_name"):
        s = best_similarity(inputs["generic_name"], generic_db)
        weighted = s * WEIGHTS["generic_name"]
        total_score += weighted
        details.append(DrugMatchDetail(
            field="generic_name",
            matched_value=drug.get("generic_name"),
            input_value=inputs.get("raw_generic_name") or "",
            score=int(round(weighted)),
            algorithm=f"generic_best({s})"
        ))

    # manufacturer
    if inputs.get("manufacturer"):
        s = best_similarity(inputs["manufacturer"], manu_db)
        compact_in = normalize_compact(inputs.get("manufacturer"))
        compact_db = normalize_compact(manu_db)
        if compact_in and compact_db and (compact_in == compact_db or compact_in in compact_db or compact_db in compact_in):
            s = max(s, 95)
        # phonetic check (double metaphone)
        try:
            in_dm1, in_dm2 = dm_codes(inputs.get("manufacturer") or "")
            db_dm1, db_dm2 = dm_codes(manu_db)
            if in_dm1 and db_dm1 and (in_dm1 == db_dm1 or in_dm1 == db_dm2 or in_dm2 == db_dm1):
                s = max(s, 95)
        except Exception:
            pass
        weighted = s * WEIGHTS["manufacturer"]
        total_score += weighted
        details.append(DrugMatchDetail(
            field="manufacturer",
            matched_value=(drug.get("manufacturer") or {}).get("name"),
            input_value=inputs.get("raw_manufacturer") or "",
            score=int(round(weighted)),
            algorithm=f"manufacturer_best({s})"
        ))

    # nafdac additive
    if inputs.get("nafdac"):
        in_reg = normalize_compact(inputs.get("nafdac"))
        db_reg = nafdac_db
        nafdac_score = 0
        nafdac_reason = ""
        if in_reg and db_reg:
            if in_reg == db_reg:
                nafdac_score = 100
                nafdac_reason = "exact nafdac"
            elif in_reg in db_reg or db_reg in in_reg:
                nafdac_score = 80
                nafdac_reason = "partial nafdac"
            elif len(in_reg) >= 5 and len(db_reg) >= 5 and in_reg[:5] == db_reg[:5]:
                nafdac_score = 70
                nafdac_reason = "prefix nafdac"
            else:
                nafdac_score = best_similarity(in_reg, db_reg)
                nafdac_reason = "fuzzy nafdac"
            nafdac_contribution = nafdac_score * WEIGHTS["nafdac_additive"]
            total_score += nafdac_contribution
            details.append(DrugMatchDetail(
                field="nafdac_reg_no",
                matched_value=(drug.get("identifiers") or {}).get("nafdac_reg_no"),
                input_value=inputs.get("raw_nafdac") or "",
                score=int(round(nafdac_contribution)),
                algorithm=nafdac_reason
            ))

    # dosage small boost
    if inputs.get("dosage_form"):
        s = best_similarity(inputs["dosage_form"], dosage_db)
        if s > 60:
            total_score += s * 0.05
            details.append(DrugMatchDetail(
                field="dosage_form",
                matched_value=drug.get("dosage_form"),
                input_value=inputs.get("raw_dosage_form") or "",
                score=int(round(s * 0.05)),
                algorithm=f"dosage_best({s})"
            ))

    # scale to 0..100 (theoretical max can exceed 100 because of additive nafdac)
    max_possible = WEIGHTS["product_name"] * 100 + WEIGHTS["generic_name"] * 100 + WEIGHTS["manufacturer"] * 100 + (WEIGHTS["nafdac_additive"] * 100)
    score_scaled = (total_score / max_possible) * 100 if max_possible > 0 else total_score
    score_scaled = max(0.0, min(100.0, score_scaled))
    return score_scaled, details

# --- Background worker: populate ALIAS_MAP and PRECOMPUTED_CACHE ---
def background_initializer():
    global ALIAS_MAP, PRECOMPUTED_CACHE
    try:
        logger.info("Background initializer started: building alias map + precompute cache")
        ALIAS_MAP = build_alias_map_from_db()
        logger.info(f"Alias map built with {len(ALIAS_MAP)} keys")
        # Precompute cache of top candidates for popular keys
        idx = build_indexes()
        # Heuristic: take top N most common normalized product + generic + manu keys
        keys_with_freq = []
        for k, lst in idx["product_map"].items():
            keys_with_freq.append((len(lst), k))
        for k, lst in idx["generic_map"].items():
            keys_with_freq.append((len(lst), k))
        for k, lst in idx["manu_map"].items():
            keys_with_freq.append((len(lst), k))
        keys_with_freq.sort(reverse=True)
        top_keys = [k for _, k in keys_with_freq[:2000]]  # we will generate combined queries then prune to 1000 cache entries

        cache_count = 0
        for key in top_keys:
            if cache_count >= 1000:
                break
            # create a combined query (key may be product, generic, or manu)
            q = key
            combined_query = q
            # generate candidates via process.extract on all_search_texts (fast because it's cached)
            search_space = idx["all_search_texts"]
            raw_matches = process.extract(combined_query, search_space, scorer=fuzz.token_set_ratio, limit=50)
            candidate_list = []
            for match_text, match_score, _ in raw_matches:
                nid = idx["search_text_map"].get(match_text)
                if not nid:
                    continue
                drug = idx["id_map"].get(nid)
                if not drug:
                    continue
                # compute actual score against the query tokens
                inputs = {"product_name": normalize_text_ultra(combined_query), "raw_product_name": combined_query}
                score, details = score_drug_against_input(drug, inputs)
                if score >= SCORES["min_return_score"]:
                    candidate_list.append({
                        "product_name": drug.get("product_name"),
                        "dosage_form": drug.get("dosage_form"),
                        "nafdac_reg_no": (drug.get("identifiers") or {}).get("nafdac_reg_no"),
                        "manufacturer": (drug.get("manufacturer") or {}).get("name"),
                        "match_score": int(round(score)),
                        "pil_id": drug.get("nexahealth_id")
                    })
            if candidate_list:
                # sort descending
                candidate_list.sort(key=lambda x: x["match_score"], reverse=True)
                PRECOMPUTED_CACHE[combined_query] = candidate_list[:10]
                cache_count += 1
        logger.info(f"Precomputed cache built with {len(PRECOMPUTED_CACHE)} entries")
    except Exception as e:
        logger.exception(f"Background initialization failed: {e}")

# start background initializer thread
bg_thread = threading.Thread(target=background_initializer, daemon=True)
bg_thread.start()

# --- Main verify endpoint (refactor of your previous function) ---
@router.post("/drug", response_model=DrugVerificationResponse)
async def verify_drug(
    request: DrugVerificationRequest,
    current_user: UserInDB = Depends(get_current_active_user)
):
    try:
        logger.info(f"Drug verification request by user: {current_user.email}")
        if not request.product_name or len(request.product_name.strip()) < 2:
            raise HTTPException(status_code=400, detail="Product name must be at least 2 characters")

        raw_product = (request.product_name or "").strip()
        raw_generic = (getattr(request, "generic_name", "") or "").strip()
        raw_manu = (getattr(request, "manufacturer", "") or "").strip()
        raw_nafdac = (getattr(request, "nafdac_reg_no", "") or "").strip()
        raw_dosage = (getattr(request, "dosage_form", "") or "").strip()

        inputs = {
            "product_name": normalize_text_ultra(raw_product),
            "raw_product_name": raw_product,
            "generic_name": normalize_text_ultra(raw_generic),
            "raw_generic_name": raw_generic,
            "manufacturer": normalize_text_ultra(raw_manu),
            "raw_manufacturer": raw_manu,
            "nafdac": normalize_compact(raw_nafdac),
            "raw_nafdac": raw_nafdac,
            "dosage_form": normalize_text_ultra(raw_dosage),
            "raw_dosage_form": raw_dosage
        }

        idx = build_indexes()

        # Fast path: check precomputed cache for exact key
        cache_key_candidates = []
        cache_query_key = inputs["product_name"] or inputs["generic_name"] or inputs["manufacturer"]
        if cache_query_key and cache_query_key in PRECOMPUTED_CACHE:
            cache_key_candidates = PRECOMPUTED_CACHE[cache_query_key]

        # Fast path 2: direct NAFDAC exact match
        if inputs["nafdac"]:
            if inputs["nafdac"] in idx["nafdac_map"]:
                exact_drug = idx["nafdac_map"][inputs["nafdac"]]
                score, details = score_drug_against_input(exact_drug, inputs)
                verification_status = exact_drug.get("verification", {}).get("status", "unknown")
                response_data = {
                    "status": VerificationStatus(verification_status),
                    "product_name": exact_drug.get("product_name"),
                    "dosage_form": exact_drug.get("dosage_form"),
                    "strength": exact_drug.get("strength"),
                    "nafdac_reg_no": exact_drug.get("identifiers", {}).get("nafdac_reg_no"),
                    "manufacturer": (exact_drug.get("manufacturer") or {}).get("name"),
                    "match_score": int(round(min(100, score))),
                    "pil_id": exact_drug.get("nexahealth_id"),
                    "last_verified": exact_drug.get("approval", {}).get("approval_date"),
                    "report_count": exact_drug.get("report_stats", {}).get("total_reports", 0),
                    "match_details": details,
                    "confidence": "high" if score >= SCORES["high_confidence"] else ("medium" if score >= SCORES["medium_confidence"] else "low")
                }
                if score >= SCORES["high_confidence"] and verification_status == "verified":
                    response_data["message"] = "✅ Verified medication (NAFDAC exact match)"
                else:
                    response_data["message"] = "⚠️ Matched by NAFDAC - verify details"
                await increment_stat_counter("verifications")
                return DrugVerificationResponse(**response_data)

        # Build candidate set using index heuristics
        candidate_ids = set()
        if inputs["product_name"]:
            prod_key = inputs["product_name"]
            for k in idx["product_map"].keys():
                if prod_key == k or prod_key in k or k in prod_key:
                    candidate_ids.update(idx["product_map"][k])
            for alias in ALIAS_MAP.get(prod_key, []):
                candidate_ids.update(idx["product_map"].get(alias, []))

        if inputs["generic_name"]:
            gen_key = inputs["generic_name"]
            for k in idx["generic_map"].keys():
                if gen_key == k or gen_key in k or k in gen_key:
                    candidate_ids.update(idx["generic_map"][k])
            for alias in ALIAS_MAP.get(gen_key, []):
                candidate_ids.update(idx["generic_map"].get(alias, []))

        if inputs["manufacturer"]:
            manu_key = inputs["manufacturer"]
            for k in idx["manu_map"].keys():
                if manu_key == k or manu_key in k or k in manu_key:
                    candidate_ids.update(idx["manu_map"][k])

        # if precomputed cache had entries, add their nids (faster path)
        if cache_key_candidates:
            for item in cache_key_candidates:
                if item.get("pil_id"):
                    candidate_ids.add(item["pil_id"])

        # fallback to global fuzzy if no candidate
        if not candidate_ids:
            combined_query = " ".join(filter(None, [inputs["product_name"], inputs["generic_name"], inputs["manufacturer"], inputs["nafdac"]]))
            if not combined_query:
                combined_query = inputs["product_name"] or inputs["generic_name"] or inputs["manufacturer"] or ""
            raw_matches = process.extract(combined_query, idx["all_search_texts"], scorer=fuzz.token_set_ratio, limit=200)
            for match_text, match_score, _ in raw_matches:
                nid = idx["search_text_map"].get(match_text)
                if nid:
                    candidate_ids.add(nid)

        # limit candidates for speed
        MAX_CANDIDATES = 1000
        candidate_ids_list = list(candidate_ids)[:MAX_CANDIDATES] if candidate_ids else []

        # score candidates and keep a heap of top results
        scored_heap = []
        for nid in candidate_ids_list:
            drug = idx["id_map"].get(nid)
            if not drug:
                continue
            try:
                score, details = score_drug_against_input(drug, inputs)
            except Exception as e:
                logger.warning(f"Scoring error for nid {nid}: {e}")
                continue
            if score >= SCORES["min_return_score"]:
                heapq.heappush(scored_heap, (-score, nid, drug, score, details))

        # if none, use suggestion fallback using product names
        if not scored_heap:
            all_names = [d.get("product_name") or "" for d in drug_db]
            matches = process.extract(request.product_name, all_names, scorer=fuzz.token_set_ratio, limit=5)
            suggested_drugs = []
            for name, score_s, _ in matches:
                drug_obj = next((d for d in drug_db if d.get("product_name") == name), None)
                if drug_obj:
                    suggested_drugs.append({
                        "product_name": drug_obj.get("product_name"),
                        "dosage_form": drug_obj.get("dosage_form"),
                        "nafdac_reg_no": (drug_obj.get("identifiers") or {}).get("nafdac_reg_no"),
                        "manufacturer": (drug_obj.get("manufacturer") or {}).get("name"),
                        "match_score": score_s,
                        "pil_id": drug_obj.get("nexahealth_id")
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
                message="No matching drug found in NAFDAC records.",
                match_score=0,
                confidence="low"
            )

        # get top results
        results = []
        while scored_heap and len(results) < 10:
            neg_score, nid, drug, score_val, details = heapq.heappop(scored_heap)
            results.append((score_val, drug, details))

        best_score, best_drug, best_details = results[0]
        verification_status = best_drug.get("verification", {}).get("status", "unknown")

        possible_matches = []
        for score_val, drug_obj, details in results:
            possible_matches.append({
                "product_name": drug_obj.get("product_name"),
                "dosage_form": drug_obj.get("dosage_form"),
                "nafdac_reg_no": (drug_obj.get("identifiers") or {}).get("nafdac_reg_no"),
                "manufacturer": (drug_obj.get("manufacturer") or {}).get("name"),
                "match_score": int(round(score_val)),
                "pil_id": drug_obj.get("nexahealth_id")
            })

        response_data = {
            "status": VerificationStatus(verification_status),
            "product_name": best_drug.get("product_name"),
            "dosage_form": best_drug.get("dosage_form"),
            "strength": best_drug.get("strength"),
            "nafdac_reg_no": (best_drug.get("identifiers") or {}).get("nafdac_reg_no"),
            "manufacturer": (best_drug.get("manufacturer") or {}).get("name"),
            "match_score": int(round(min(100, best_score))),
            "pil_id": best_drug.get("nexahealth_id"),
            "last_verified": best_drug.get("approval", {}).get("approval_date"),
            "report_count": best_drug.get("report_stats", {}).get("total_reports", 0),
            "match_details": best_details,
            "confidence": "high" if best_score >= SCORES["high_confidence"] else ("medium" if best_score >= SCORES["medium_confidence"] else "low"),
            "possible_matches": possible_matches[1:] if len(possible_matches) > 1 else []
        }

        if best_score >= SCORES["high_confidence"]:
            if verification_status == "verified":
                response_data["message"] = "✅ Verified medication (high confidence match)"
            else:
                response_data["message"] = "⚠️ High confidence match (not marked verified)"
        elif best_score >= SCORES["medium_confidence"]:
            response_data["message"] = "⚠️ Likely match - please confirm details"
        else:
            response_data["message"] = "⚠️ Possible match - review carefully"

        # conflict checks
        conflicts = []
        if inputs["product_name"] and best_drug.get("product_name"):
            if fuzz.token_set_ratio(inputs["product_name"], normalize_text_ultra(best_drug.get("product_name") or "")) < 75:
                conflicts.append("name mismatch")
        if inputs["nafdac"] and best_drug.get("identifiers", {}).get("nafdac_reg_no"):
            if inputs["nafdac"] != normalize_compact(best_drug.get("identifiers").get("nafdac_reg_no") or ""):
                conflicts.append("NAFDAC number mismatch")

        if conflicts:
            response_data["status"] = VerificationStatus.CONFLICT_WARNING
            response_data["message"] = f"⚠️ Possible issues: {', '.join(conflicts)}"
            response_data["confidence"] = "medium"

        await increment_stat_counter("verifications")
        return DrugVerificationResponse(**response_data)

    except Exception as e:
        logger.exception("Verification error")
        raise HTTPException(status_code=500, detail="Drug verification failed")
