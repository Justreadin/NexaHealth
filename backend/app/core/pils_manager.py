from typing import List, Optional, Dict, Tuple
from datetime import datetime
from collections import defaultdict
import re
import logging
from rapidfuzz import fuzz, process

from app.models.pils_model import PILInDB, UserInteractionBase, UserInteractionInDB
from app.core.pils_loader import pil_loader

logger = logging.getLogger(__name__)

class PILManager:
    def __init__(self):
        self._pils = None
        self._search_index = []
        self._drug_names_index = defaultdict(list)
        self._interactions = {}
        self._common_misspellings = {
            'paracetmol': 'paracetamol',
            'amoxycillin': 'amoxicillin',
            'coartam': 'coartem',
            'vitamen': 'vitamin',
            'panadol': 'paracetamol'
        }
        self._nafdac_index = {}  # fast lookup: nafdac_no → PIL

    
    @property
    def pils(self) -> List[PILInDB]:
        """Lazy load PIL data with thread-safe initialization"""
        if self._pils is None:
            self._pils = pil_loader.get_all_pils()
            if self._pils:  # Only build indexes if we have data
                self._build_search_indexes()
        return self._pils or []

    # pils_manager.py

    def _build_search_indexes(self):
        """Build optimized search indexes for fast lookup"""
        self._search_index = []
        self._drug_names_index = defaultdict(list)
        self._nafdac_index = {}

        for pil in self._pils:
            if not pil or not hasattr(pil, 'identifiers'):
                continue

            nafdac_no = (
                self._normalize_text(pil.identifiers.nafdac_reg_no)
                if pil.identifiers and pil.identifiers.nafdac_reg_no
                else ''
            )
            if nafdac_no:
                self._nafdac_index[nafdac_no] = pil   # 🔑 store for O(1) lookup

            self._search_index.append({
                'pil': pil,
                'product_name': self._normalize_text(pil.product_name),
                'generic_name': self._normalize_text(pil.generic_name),
                'composition': self._normalize_text(pil.composition),
                'description': self._normalize_text(pil.description),
                'strength': self._normalize_text(pil.strength),
                'nafdac_no': nafdac_no,
                'manufacturer': self._normalize_text(pil.manufacturer.name) if pil.manufacturer and pil.manufacturer.name else '',
                'dosage_form': self._normalize_text(pil.dosage_form)
            })

            if pil.product_name:
                self._add_to_suggestion_index(pil.product_name, pil)
            if pil.generic_name:
                self._add_to_suggestion_index(pil.generic_name, pil)


    def _add_to_suggestion_index(self, name: str, pil: PILInDB):
        """Normalize and add names to suggestion index"""
        try:
            normalized = self._normalize_drug_name(name)
            if normalized:
                self._drug_names_index[normalized].append(pil.id)  # Store IDs instead of objects
        except Exception as e:
            logger.warning(f"Error adding to suggestion index: {str(e)}")

    def _normalize_drug_name(self, name: str) -> str:
        """Normalize drug names for better matching"""
        if not name:
            return ''
            
        try:
            name = name.lower()
            # Remove common prefixes/suffixes
            name = re.sub(r'\b(?:tab|tablet|cap|capsule|inj|injection|syr|syrup)\b', '', name)
            # Replace common misspellings
            for wrong, correct in self._common_misspellings.items():
                name = re.sub(rf'\b{wrong}\b', correct, name)
            return name.strip()
        except Exception as e:
            logger.warning(f"Error normalizing drug name: {str(e)}")
            return name.lower() if name else ''


    def _normalize_text(self, text: Optional[str]) -> str:
        """Consistent normalization for all drug data"""
        if not text:
            return ''
        
        try:
            # Remove all special characters and spaces
            text = text.lower().strip()
            text = re.sub(r'[^\w]', '', text)
            
            # Common replacements
            replacements = {
                "tab": "tablet",
                "cap": "capsule",
                "susp": "suspension",
                # Add more as needed
            }
            
            for short, long in replacements.items():
                text = re.sub(rf"\b{short}\b", long, text)
                
            return text
        except Exception as e:
            logger.warning(f"Error normalizing text: {str(e)}")
            return text.lower() if text else ''

    def get_pil(self, pil_id: str) -> Optional[PILInDB]:
        try:
            if not pil_id or not self.pils:
                return None
            return next((pil for pil in self.pils if pil and pil.id == pil_id), None)
        except Exception as e:
            logger.error(f"Error getting PIL {pil_id}: {str(e)}")
            return None

    def search_pils(
        self,
        search: Optional[str] = None,
        category: Optional[str] = None,
        manufacturer: Optional[str] = None,
        dosage_form: Optional[str] = None,
        nafdac_no: Optional[str] = None,
        limit: int = 10
    ) -> Dict[str, List]:
        """
        Powerful search:
        - Direct O(1) lookup by NAFDAC number (highest priority)
        - Otherwise, fuzzy matching on names, generic, description, etc.
        """
        try:
            if not self.pils:  
                return {'results': [], 'suggestions': []}

            # 🔍 1. Direct lookup by NAFDAC number
            if nafdac_no:
                normalized_no = self._normalize_text(nafdac_no)
                pil = self._nafdac_index.get(normalized_no)
                if pil:
                    return {'results': [pil], 'suggestions': []}
                else:
                    return {'results': [], 'suggestions': []}  # no fuzzy here

            # 🔍 2. Apply filters first
            filtered_pils = self._apply_filters(category, manufacturer, dosage_form)

            # 🔍 3. Fuzzy search if search term is provided
            results, suggestions = [], []
            if search:
                search_normalized = self._normalize_drug_name(search)
                results, suggestions = self._fuzzy_search(search_normalized, filtered_pils, min_score=70)
            else:
                results = filtered_pils

            return {
                'results': results[:limit] if results else [],
                'suggestions': suggestions[:3] if suggestions else []
            }
        except Exception as e:
            logger.error(f"Search error: {str(e)}", exc_info=True)
            return {'results': [], 'suggestions': []}


    def _apply_filters(
        self, 
        category: Optional[str], 
        manufacturer: Optional[str],
        dosage_form: Optional[str]
    ) -> List[PILInDB]:
        """Apply filters with null checks"""
        if not self.pils:
            return []

        filtered = [pil for pil in self.pils if pil]  # Remove None values
        
        if category:
            category_lower = category.lower()
            filtered = [pil for pil in filtered 
                       if pil.category and pil.category.lower() == category_lower]
        
        if manufacturer:
            manuf_lower = manufacturer.lower()
            filtered = [pil for pil in filtered 
                       if pil.manufacturer and 
                          pil.manufacturer.name and 
                          manuf_lower in pil.manufacturer.name.lower()]
        
        if dosage_form:
            dosage_lower = dosage_form.lower()
            filtered = [pil for pil in filtered 
                       if pil.dosage_form and 
                          dosage_lower in pil.dosage_form.lower()]
        
        return filtered

    def _fuzzy_search(self, search_term: str, pils: List[PILInDB], min_score: int) -> Tuple[List[PILInDB], List[str]]:
        if not search_term or not self._search_index:
            return [], []

        keywords = self._normalize_text(search_term).split()
        scored_pils = []
        pil_ids = {pil.id for pil in pils if pil}

        for item in self._search_index:
            pil = item.get('pil')
            if not pil or pil.id not in pil_ids:
                continue

            try:
                fields = [
                    item['product_name'],
                    item['generic_name'],
                    item.get('dosage_form', ''),
                    item.get('strength', ''),
                    item.get('description', ''),
                    item.get('composition', ''),
                ]
                full_text = ' '.join(fields)

                if all(kw in full_text for kw in keywords):
                    fuzzy_score = max([
                        fuzz.token_sort_ratio(search_term, item['product_name']),
                        fuzz.token_sort_ratio(search_term, item['generic_name']),
                        fuzz.token_sort_ratio(search_term, item.get('composition', '')),
                    ])
                    if search_term == item['product_name']:
                        fuzzy_score += 10
                    if fuzzy_score >= min_score:
                        scored_pils.append((fuzzy_score, pil))

            except Exception as e:
                logger.warning(f"Error in fuzzy search for '{search_term}': {str(e)}")

        scored_pils.sort(key=lambda x: x[0], reverse=True)
        results = [pil for score, pil in scored_pils]

        suggestions = []
        if not results or (scored_pils and scored_pils[0][0] < 75):
            suggestions = self._get_search_suggestions(search_term)

        return results, suggestions


    def _get_search_suggestions(self, search_term: str) -> List[str]:
        """Generate spelling/correction suggestions using fuzzy matching"""
        if not search_term or not self._drug_names_index:
            return []

        try:
            possible_terms = list(self._drug_names_index.keys())
            raw_suggestions = process.extract(
                search_term,
                possible_terms,
                scorer=fuzz.token_set_ratio,
                limit=5
            )

            seen = set()
            unique_suggestions = []

            for suggestion in raw_suggestions:
                if isinstance(suggestion, tuple) and len(suggestion) >= 2:
                    term, score = suggestion[0], suggestion[1]
                    if score > 70 and term not in seen:
                        seen.add(term)
                        unique_suggestions.append(term)

            return unique_suggestions[:3]
        except Exception as e:
            logger.warning(f"Error getting suggestions: {str(e)}")
            return []


    def get_featured_pils(self, limit: int = 5) -> List[PILInDB]:
        """Get featured PILs with caching"""
        try:
            # In production, this could use a pre-computed featured list
            return sorted(
                [pil for pil in self.pils if pil and pil.featured],
                key=lambda x: x.created_at if x.created_at else datetime.min,
                reverse=True
            )[:limit]
        except Exception as e:
            logger.error(f"Error getting featured PILs: {str(e)}")
            return []

    # In pils_manager.py
    def record_interaction(self, interaction: UserInteractionBase) -> UserInteractionInDB:
        """Record user interaction with a PIL"""
        try:
            key = f"{interaction.user_id}_{interaction.pil_id}"
            
            if key in self._interactions:
                # Update existing
                existing = self._interactions[key]
                existing.view_count += interaction.view_count
                existing.last_viewed = interaction.last_viewed or datetime.now()
                existing.saved = interaction.saved or existing.saved
                existing.updated_at = datetime.now()
                return existing
            else:
                # Create new
                interaction_data = interaction.dict()
                interaction_data['last_viewed'] = interaction_data.get('last_viewed') or datetime.now()
                new_interaction = UserInteractionInDB(
                    id=key,
                    **interaction_data
                )
                self._interactions[key] = new_interaction
                return new_interaction
        except Exception as e:
            logger.error(f"Error recording interaction: {str(e)}")
            raise

    def get_user_interactions(
        self,
        user_id: str,
        saved: Optional[bool] = None,
        limit: int = 10
    ) -> List[UserInteractionInDB]:
        """Get user's interactions with optional saved filter"""
        try:
            interactions = [i for i in self._interactions.values() 
                          if i.user_id == user_id]
            
            if saved is not None:
                interactions = [i for i in interactions if i.saved == saved]
            
            return sorted(
                interactions,
                key=lambda x: x.last_viewed,
                reverse=True
            )[:limit]
        except Exception as e:
            logger.error(f"Error getting user interactions: {str(e)}")
            return []

    def get_user_interaction(self, user_id: str, pil_id: str) -> Optional[UserInteractionInDB]:
        """Get a specific user interaction"""
        key = f"{user_id}_{pil_id}"
        return self._interactions.get(key)

# Initialize the manager
pil_manager = PILManager()