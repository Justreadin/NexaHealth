import re
import logging
import unicodedata
from typing import Dict, List, Optional, Tuple, Set, Any
from rapidfuzz import fuzz, process
from functools import lru_cache
import jellyfish
from collections import defaultdict
import heapq

import firebase_admin
from firebase_admin import credentials, firestore

# Initialize Firestore (once globally)
cred = credentials.Certificate(
    r"C:\Users\USER\PycharmProjects\NexaHealth_Live\backend\app\core\firebase_key.json"
)
firebase_admin.initialize_app(cred)
fs_db = firestore.client()
 
logger = logging.getLogger(__name__)


class DrugVerificationEngine:
    def __init__(self, drug_db: List[Dict]):
        # Initialize DB and indexes
        self.drug_db = drug_db
        self.indexes = self._build_indexes()

        # Scoring configuration
        self.SCORES = {
            "exact_match": 100,
            "high_confidence": 90,
            "medium_confidence": 75,
            "low_confidence": 50,
            "min_score": 30,
            
            # Field weights
            "nafdac_weight": 0.40,
            "manufacturer_weight": 0.25,
            "product_name_weight": 0.20,
            "generic_name_weight": 0.10,
            "dosage_form_weight": 0.05,
            
            # Bonuses and penalties
            "complete_match_bonus": 15,
            "conflict_penalty": 25,
            "partial_match_bonus": 5
        }

        # Common corporate suffixes for manufacturer matching
        self.CORP_SUFFIXES = [
            r"\bltd\b", r"\blimited\b", r"\bplc\b", r"\binc\b", r"\bincorporated\b",
            r"\bco\b", r"\bcompany\b", r"\bcorp\b", r"\bcorporation\b", r"\bllc\b",
            r"\bllp\b", r"\bpartners\b", r"\bgroup\b", r"\bholdings\b",
            r"\bsa\b", r"\bag\b", r"\bgmbh\b", r"\bsp\.?z\.?o\.?o\.?\b",
            r"\bindustries\b", r"\bpharma\b", r"\bpharmaceuticals\b", r"\bpharmacies\b",
            r"\bhealthcare\b", r"\bbiotech\b", r"\bbiotechnology\b", r"\bmedicines\b",
            r"\blaboratories\b", r"\blabs\b", r"\bresearch\b", r"\btherapeutics\b",
            r"\bsciences\b", r"\bformulations\b",
            r"\bnigeria\b", r"\bnig\.?\b", r"\bng\b"
        ]

        # Common drug name variations
        self.DRUG_VARIANTS = {
            "paracetamol": ["panadol", "acetaminophen", "tylenol"],
            "metronidazole": ["flagyl", "metrogel"],
            "amoxicillin": ["amoxil", "amoxycillin"],
            "ibuprofen": ["brufen", "advil"],
            "diclofenac": ["voltaren", "cataflam"],
            "omeprazole": ["prilosec", "losec"],
        }

    @lru_cache(maxsize=1024)
    def _cached_find_candidates(self, product_name: str, manufacturer: str, nafdac: str):
        inputs = {
            "product_name": product_name,
            "manufacturer": manufacturer,
            "nafdac": nafdac
        }
        return self._find_candidates(inputs)

    @lru_cache(maxsize=1024)
    def _get_drug_by_id(self, drug_id: int) -> Optional[Dict]:
        """Fetch full drug record by ID with caching"""
        return self.indexes["by_id"].get(drug_id)

    def find_candidates_local(self, product_name: str = "", manufacturer: str = "", nafdac: str = "") -> Set[int]:
        """
        Optional local candidate search using built indexes.
        This is safe to cache and avoids repeated Firestore queries.
        """
        candidate_ids = set()
        
        # NAFDAC exact match
        if nafdac:
            norm_nafdac = self._normalize_nafdac(nafdac)
            if norm_nafdac in self.indexes["by_nafdac"]:
                candidate_ids.add(self.indexes["by_nafdac"][norm_nafdac])

        # Product name
        if product_name:
            norm_name = self._normalize_text(product_name)
            candidate_ids.update(self.indexes["by_product_name"].get(norm_name, []))

        # Manufacturer
        if manufacturer:
            norm_manu = self._normalize_manufacturer(manufacturer)
            candidate_ids.update(self.indexes["by_manufacturer"].get(norm_manu, []))

        # Fallback: all drugs if nothing matches
        if not candidate_ids:
            candidate_ids.update(self.indexes["by_id"].keys())

        return candidate_ids

    def _build_indexes(self) -> Dict[str, Any]:
        """Build comprehensive search indexes"""
        indexes = {
            "by_id": {},
            "by_nafdac": {},
            "by_product_name": defaultdict(list),
            "by_generic_name": defaultdict(list),
            "by_manufacturer": defaultdict(list),
            "by_dosage_form": defaultdict(list),
            "search_texts": []
        }
        
        for drug in self.drug_db:
            try:
                drug_id = drug.get("nexahealth_id")
                if not drug_id:
                    continue
                    
                indexes["by_id"][drug_id] = drug
                
                # Index by NAFDAC
                nafdac = (drug.get("identifiers") or {}).get("nafdac_reg_no")
                if nafdac:
                    normalized_nafdac = self._normalize_nafdac(nafdac)
                    indexes["by_nafdac"][normalized_nafdac] = drug_id
                
                # Index by product name
                product_name = drug.get("product_name")
                if product_name:
                    normalized = self._normalize_text(product_name)
                    indexes["by_product_name"][normalized].append(drug_id)
                
                # Index by generic name
                generic_name = drug.get("generic_name")
                if generic_name:
                    normalized = self._normalize_text(generic_name)
                    indexes["by_generic_name"][normalized].append(drug_id)
                
                # Index by manufacturer
                manufacturer = (drug.get("manufacturer") or {}).get("name")
                if manufacturer:
                    normalized = self._normalize_manufacturer(manufacturer)
                    indexes["by_manufacturer"][normalized].append(drug_id)
                
                # Index by dosage form
                dosage_form = drug.get("dosage_form")
                if dosage_form:
                    normalized = self._normalize_text(dosage_form)
                    indexes["by_dosage_form"][normalized].append(drug_id)
                
                # Create searchable text
                search_text = " ".join(filter(None, [
                    self._normalize_text(product_name),
                    self._normalize_text(generic_name),
                    self._normalize_manufacturer(manufacturer),
                    self._normalize_text(dosage_form),
                    self._normalize_nafdac(nafdac)
                ]))
                indexes["search_texts"].append((search_text, drug_id))
                
            except Exception as e:
                logger.warning(f"Error indexing drug: {e}")
                continue
                
        return indexes

    def _normalize_text(self, text: Optional[str]) -> str:
        """Normalize text for comparison"""
        if not text:
            return ""
            
        # Convert to lowercase and remove accents
        text = unicodedata.normalize('NFKD', text.lower())
        text = ''.join([c for c in text if not unicodedata.combining(c)])
        
        # Remove special characters and extra spaces
        text = re.sub(r'[^\w\s]', ' ', text)
        text = re.sub(r'\s+', ' ', text).strip()
        
        return text

    def _normalize_manufacturer(self, manufacturer: Optional[str]) -> str:
        """Normalize manufacturer name by removing corporate suffixes"""
        if not manufacturer:
            return ""
            
        normalized = self._normalize_text(manufacturer)
        
        # Remove common corporate suffixes
        for suffix in self.CORP_SUFFIXES:
            normalized = re.sub(suffix, '', normalized)
        
        # Remove extra spaces and return
        return re.sub(r'\s+', ' ', normalized).strip()

    def _normalize_nafdac(self, nafdac: Optional[str]) -> str:
        """Normalize NAFDAC number"""
        if not nafdac:
            return ""
            
        # Remove spaces and convert to uppercase
        normalized = re.sub(r'[^\w]', '', nafdac.upper())
        
        # Format as XX-XXXX if possible
        if len(normalized) == 6 and normalized[:2].isdigit() and normalized[2:].isdigit():
            return f"{normalized[:2]}-{normalized[2:]}"
            
        return normalized

    def _score_nafdac_match(self, input_nafdac: str, db_nafdac: str) -> Tuple[int, str]:
        """Score NAFDAC number match"""
        norm_input = self._normalize_nafdac(input_nafdac)
        norm_db = self._normalize_nafdac(db_nafdac)
        
        if norm_input == norm_db:
            return 100, "exact_match"
            
        # Match without dashes
        input_no_dash = norm_input.replace("-", "")
        db_no_dash = norm_db.replace("-", "")
        
        if input_no_dash == db_no_dash:
            return 95, "format_normalized"
            
        # Partial matches
        if input_no_dash.startswith(db_no_dash[:4]) or db_no_dash.startswith(input_no_dash[:4]):
            return 80, "partial_match"
            
        # Basic similarity
        similarity = fuzz.ratio(input_no_dash, db_no_dash)
        if similarity > 70:
            return similarity, "fuzzy_match"
            
        return 0, "no_match"

    def _score_name_match(self, input_name: str, db_name: str, is_generic: bool = False) -> Tuple[int, str]:
        """Score product or generic name match"""
        if not input_name or not db_name:
            return 0, "no_match"
            
        # Exact match
        norm_input = self._normalize_text(input_name)
        norm_db = self._normalize_text(db_name)
        
        if norm_input == norm_db:
            return 100, "exact_match"
            
        # Check for common variants
        if is_generic:
            for base, variants in self.DRUG_VARIANTS.items():
                if norm_input == self._normalize_text(base) and norm_db in [self._normalize_text(v) for v in variants]:
                    return 90, "common_variant"
                if norm_db == self._normalize_text(base) and norm_input in [self._normalize_text(v) for v in variants]:
                    return 90, "common_variant"
        
        # Token set ratio (order independent)
        token_score = fuzz.token_set_ratio(input_name, db_name)
        
        # Partial ratio (substring match)
        partial_score = fuzz.partial_ratio(input_name, db_name)
        
        # Use the best score
        best_score = max(token_score, partial_score)
        
        if best_score >= 90:
            return best_score, "high_similarity"
        elif best_score >= 75:
            return best_score, "medium_similarity"
        elif best_score >= 50:
            return best_score, "low_similarity"
        else:
            return 0, "no_match"

    def _score_manufacturer_match(self, input_manu: str, db_manu: str) -> Tuple[int, str]:
        """Score manufacturer match"""
        norm_input = self._normalize_manufacturer(input_manu)
        norm_db = self._normalize_manufacturer(db_manu)
        
        if norm_input == norm_db:
            return 100, "exact_match"
            
        # Check if one contains the other
        if norm_input in norm_db or norm_db in norm_input:
            return 90, "contains_match"
            
        # Use multiple similarity measures
        token_score = fuzz.token_set_ratio(norm_input, norm_db)
        partial_score = fuzz.partial_ratio(norm_input, norm_db)
        best_score = max(token_score, partial_score)
        
        if best_score >= 80:
            return best_score, "high_similarity"
        elif best_score >= 60:
            return best_score, "medium_similarity"
        else:
            return 0, "no_match"

    def verify_drug(self, request: Dict) -> Dict:
        """Main verification method"""
        # Normalize inputs
        inputs = {
            "product_name": self._normalize_text(request.get("product_name")),
            "generic_name": self._normalize_text(request.get("generic_name")),
            "nafdac": request.get("nafdac_reg_no"),
            "manufacturer": self._normalize_manufacturer(request.get("manufacturer")),
            "dosage_form": self._normalize_text(request.get("dosage_form")),
            "strength": self._normalize_text(request.get("strength"))
        }
        
        # Find candidate drugs
        candidate_ids = self._find_candidates(inputs)
        
        # Score each candidate
        scored_results = []
        for drug_id in candidate_ids:
            drug = self.indexes["by_id"].get(drug_id)
            if not drug:
                continue
                
            score, details, warnings = self._score_drug(drug, inputs)
            if score >= self.SCORES["min_score"]:
                scored_results.append((score, drug, details, warnings))
        
        # Sort by score (descending)
        scored_results.sort(key=lambda x: x[0], reverse=True)
        
        # Determine verification status
        if not scored_results:
            return self._create_no_match_response(inputs)
            
        best_score, best_drug, best_details, best_warnings = scored_results[0]
        status, message = self._determine_status(inputs, best_score, best_drug, best_warnings)
        
        # Build response
        return self._build_response(
            status=status,
            message=message,
            best_drug=best_drug,
            best_score=best_score,
            best_details=best_details,
            all_results=scored_results,
            inputs=inputs
        )

    def _find_candidates(self, inputs: Dict) -> Set[int]:
        """
        Find potential candidate drugs based on inputs using:
        1. Local in-memory indexes first
        2. Firestore as fallback if nothing is found locally
        """
        candidate_ids = set()

        # --- 1. Search local indexes ---
        candidate_ids.update(self.find_candidates_local(
            product_name=inputs.get("product_name", ""),
            manufacturer=inputs.get("manufacturer", ""),
            nafdac=inputs.get("nafdac", "")
        ))

        # --- 2. Fallback to Firestore if no candidates found locally ---
        if not candidate_ids:
            drugs_ref = fs_db.collection("drugs")

            # Priority 1: NAFDAC exact match
            if inputs["nafdac"]:
                norm_nafdac = self._normalize_nafdac(inputs["nafdac"])
                docs = drugs_ref.where("identifiers.nafdac_reg_no", "==", norm_nafdac).stream()
                for doc in docs:
                    drug = doc.to_dict()
                    if drug.get("nexahealth_id"):
                        candidate_ids.add(drug["nexahealth_id"])

            # Priority 2: Manufacturer match (Firestore can't do fuzzy search)
            if inputs["manufacturer"]:
                norm_manu = self._normalize_manufacturer(inputs["manufacturer"])
                docs = drugs_ref.stream()
                for doc in docs:
                    drug = doc.to_dict()
                    manu_name = (drug.get("manufacturer") or {}).get("name", "")
                    if norm_manu in self._normalize_manufacturer(manu_name):
                        if drug.get("nexahealth_id"):
                            candidate_ids.add(drug["nexahealth_id"])

            # Fallback: fetch all if still empty
            if not candidate_ids:
                docs = drugs_ref.stream()
                for doc in docs:
                    drug = doc.to_dict()
                    if drug.get("nexahealth_id"):
                        candidate_ids.add(drug["nexahealth_id"])

        return candidate_ids


    def _score_drug(self, drug: Dict, inputs: Dict) -> Tuple[float, List[Dict], List[str]]:
        """Score a drug against input criteria"""
        total_score = 0.0
        details = []
        warnings = []
        
        # Score each field
        field_scores = {}
        
        # NAFDAC scoring
        if inputs["nafdac"]:
            db_nafdac = (drug.get("identifiers") or {}).get("nafdac_reg_no")
            if db_nafdac:
                score, reason = self._score_nafdac_match(inputs["nafdac"], db_nafdac)
                weighted_score = score * self.SCORES["nafdac_weight"]
                total_score += weighted_score
                field_scores["nafdac"] = score
                details.append({
                    "field": "nafdac_reg_no",
                    "score": score,
                    "reason": reason,
                    "input": inputs["nafdac"],
                    "matched": db_nafdac
                })
        
        # Manufacturer scoring
        if inputs["manufacturer"]:
            db_manu = (drug.get("manufacturer") or {}).get("name")
            if db_manu:
                score, reason = self._score_manufacturer_match(inputs["manufacturer"], db_manu)
                weighted_score = score * self.SCORES["manufacturer_weight"]
                total_score += weighted_score
                field_scores["manufacturer"] = score
                details.append({
                    "field": "manufacturer",
                    "score": score,
                    "reason": reason,
                    "input": inputs["manufacturer"],
                    "matched": db_manu
                })
        
        # Product name scoring
        if inputs["product_name"]:
            db_product = drug.get("product_name")
            if db_product:
                score, reason = self._score_name_match(inputs["product_name"], db_product)
                weighted_score = score * self.SCORES["product_name_weight"]
                total_score += weighted_score
                field_scores["product_name"] = score
                details.append({
                    "field": "product_name",
                    "score": score,
                    "reason": reason,
                    "input": inputs["product_name"],
                    "matched": db_product
                })
        
        # Generic name scoring
        if inputs["generic_name"]:
            db_generic = drug.get("generic_name")
            if db_generic:
                score, reason = self._score_name_match(inputs["generic_name"], db_generic, is_generic=True)
                weighted_score = score * self.SCORES["generic_name_weight"]
                total_score += weighted_score
                field_scores["generic_name"] = score
                details.append({
                    "field": "generic_name",
                    "score": score,
                    "reason": reason,
                    "input": inputs["generic_name"],
                    "matched": db_generic
                })
        
        # Check for conflicts
        self._check_conflicts(inputs, drug, field_scores, warnings)
        
        # Apply bonuses for complete matches
        provided_fields = [f for f in inputs if inputs[f]]
        matched_fields = [f for f in field_scores if field_scores[f] >= 70]
        
        if len(matched_fields) == len(provided_fields):
            total_score += self.SCORES["complete_match_bonus"]
        
        return total_score, details, warnings

    def _check_conflicts(self, inputs: Dict, drug: Dict, field_scores: Dict, warnings: List[str]):
        """Check for conflicts between matched fields"""
        # Check if manufacturer conflicts with high-scoring name matches
        if (field_scores.get("manufacturer", 0) < 60 and 
            (field_scores.get("product_name", 0) >= 80 or field_scores.get("generic_name", 0) >= 80)):
            warnings.append("manufacturer_conflict")
        
        # Check if NAFDAC conflicts with other high matches
        if (field_scores.get("nafdac", 0) < 70 and 
            (field_scores.get("manufacturer", 0) >= 80 or 
             field_scores.get("product_name", 0) >= 80)):
            warnings.append("nafdac_conflict")

    def _determine_status(self, inputs: Dict, best_score: float, best_drug: Dict, warnings: List[str]) -> Tuple[str, str]:
        """Determine verification status based on score and warnings"""
        provided_fields = [f for f in inputs if inputs[f]]
        
        if best_score >= 95 and not warnings:
            return "verified", "✅ Exact match found"
        elif best_score >= 85:
            if "nafdac" in provided_fields and any("conflict" in w for w in warnings):
                return "requires_confirmation", "⚠️ High similarity with minor conflicts - please confirm"
            return "high_similarity", "✅ High similarity match"
        elif best_score >= 70:
            return "partial_match", "⚠️ Partial match - review details"
        elif best_score >= 50:
            return "low_confidence", "⚠️ Low confidence match"
        else:
            return "unknown", "❌ No reliable match found"

    def _create_no_match_response(self, inputs: Dict) -> Dict:
        """Create response when no matches are found"""
        # Try to find similar products for suggestions
        suggestions = []
        search_terms = " ".join(filter(None, inputs.values()))
        
        for search_text, drug_id in self.indexes["search_texts"]:
            similarity = fuzz.partial_ratio(search_terms, search_text)
            if similarity > 40:  # Lower threshold for suggestions
                drug = self.indexes["by_id"][drug_id]
                suggestions.append({
                    "product_name": drug.get("product_name"),
                    "generic_name": drug.get("generic_name"),
                    "manufacturer": (drug.get("manufacturer") or {}).get("name"),
                    "similarity": similarity
                })
        
        suggestions.sort(key=lambda x: x["similarity"], reverse=True)
        
        return {
            "status": "unknown",
            "message": "No direct match found",
            "match_score": 0,
            "confidence": "low",
            "suggestions": suggestions[:5]
        }

    def _build_response(self, status: str, message: str, best_drug: Dict, 
                       best_score: float, best_details: List[Dict], 
                       all_results: List, inputs: Dict) -> Dict:
        """Build the final response object"""
        # Convert details to proper format
        match_details = []
        for detail in best_details:
            confidence = "high" if detail["score"] >= 80 else "medium" if detail["score"] >= 60 else "low"
            match_details.append({
                "field": detail["field"],
                "matched_value": detail.get("matched"),
                "input_value": detail.get("input"),
                "score": detail["score"],
                "confidence": confidence,
                "algorithm": detail["reason"]
            })
        
        # Get possible matches (excluding the best match)
        possible_matches = []
        for score, drug, _, _ in all_results[1:6]:  # Next 5 best matches
            possible_matches.append({
                "product_name": drug.get("product_name"),
                "generic_name": drug.get("generic_name"),
                "manufacturer": (drug.get("manufacturer") or {}).get("name"),
                "nafdac_reg_no": (drug.get("identifiers") or {}).get("nafdac_reg_no"),
                "match_score": int(score)
            })
        
        # Determine if confirmation or NAFDAC is needed
        requires_confirmation = (
            status == "requires_confirmation" or
            (best_score >= 85 and "nafdac" not in inputs and inputs.get("product_name"))
        )
        
        requires_nafdac = (
            best_score < 85 and 
            "nafdac" not in inputs and
            (inputs.get("product_name") or inputs.get("generic_name"))
        )
        
        return {
            "status": status,
            "message": message,
            "product_name": best_drug.get("product_name"),
            "generic_name": best_drug.get("generic_name"),
            "dosage_form": best_drug.get("dosage_form"),
            "strength": best_drug.get("strength"),
            "nafdac_reg_no": (best_drug.get("identifiers") or {}).get("nafdac_reg_no"),
            "manufacturer": (best_drug.get("manufacturer") or {}).get("name"),
            "match_score": int(best_score),
            "confidence": "high" if best_score >= 85 else "medium" if best_score >= 70 else "low",
            "pil_id": best_drug.get("nexahealth_id"),
            "last_verified": best_drug.get("approval", {}).get("approval_date"),
            "match_details": match_details,
            "possible_matches": possible_matches,
            "requires_confirmation": requires_confirmation,
            "requires_nafdac": requires_nafdac,
            "verification_notes": self._generate_notes(inputs, best_drug, best_score)
        }

    def _generate_notes(self, inputs: Dict, best_drug: Dict, score: float) -> List[str]:
        """Generate helpful verification notes"""
        notes = []
        
        if score >= 90:
            notes.append("This appears to be a high-confidence match")
        
        if inputs.get("nafdac"):
            notes.append("NAFDAC verification provides highest confidence")
        
        if not inputs.get("nafdac") and score < 85:
            notes.append("Adding NAFDAC number would improve verification confidence")
        
        return notes