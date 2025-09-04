import json
from pathlib import Path
from typing import Dict, List, Optional
from app.models.pils_model import PILInDB
import logging

logger = logging.getLogger(__name__)

class PILDataLoader:
    def __init__(self, json_path: str):
        self.json_path = Path(json_path)
        self._data = None
    
    def load_data(self) -> List[Dict]:
        """Load and parse the JSON data"""
        try:
            with open(self.json_path, 'r', encoding='utf-8') as f:
                self._data = json.load(f)
            logger.info(f"Loaded {len(self._data)} PIL records")
            return self._data
        except Exception as e:
            logger.error(f"Error loading PIL data: {str(e)}")
            raise

    def get_all_pils(self) -> List[PILInDB]:
        """Convert all JSON data to PILInDB objects"""
        if not self._data:
            self.load_data()
        
        pils = []
        for item in self._data:
            try:
                # Transform the data to match our model
                pil = self._transform_to_pil_model(item)
                if pil:
                    pils.append(pil)
            except Exception as e:
                logger.warning(f"Skipping invalid PIL data: {str(e)}")
                continue
        return pils

    def _transform_to_pil_model(self, item: Dict) -> Optional[PILInDB]:
        """Transform raw JSON item to PILInDB model"""
        try:
            # Handle documents structure
            documents = item.get('documents', {})
            pil_doc = documents.get('pil', {})
            
            # Handle side effects structure
            side_effects = pil_doc.get('side_effects', {})
            if isinstance(side_effects, dict):
                # Convert snake_case to camelCase for Pydantic aliases
                if 'very common' in side_effects:
                    side_effects['very_common'] = side_effects.pop('very common')
                if 'very rare' in side_effects:
                    side_effects['very_rare'] = side_effects.pop('very rare')
            
            # Handle storage field
            storage = pil_doc.get('storage')
            if storage and isinstance(storage, str):
                pil_doc['storage'] = [storage]
            
            # Create the PIL object
            pil_data = {
                'id': str(item.get('nexahealth_id')),
                'nexahealth_id': item.get('nexahealth_id'),
                'unified_id': item.get('unified_id', ''),
                'product_name': item.get('product_name', ''),
                'generic_name': item.get('generic_name', ''),
                'dosage_form': item.get('dosage_form', ''),
                'strength': item.get('strength', ''),
                'description': item.get('description', ''),
                'composition': item.get('composition', ''),
                'pack_size': item.get('pack_size', ''),
                'atc_code': item.get('atc_code', ''),
                'category': item.get('category', ''),
                'identifiers': item.get('identifiers', {}),
                'manufacturer': item.get('manufacturer', {}),
                'approval': item.get('approval', {}),
                'verification': item.get('verification', {}),
                'documents': {
                    'smpc': documents.get('smpc', {}),
                    'pil': {
                        **pil_doc,
                        'side_effects': side_effects
                    }
                },
                'tags': self._extract_tags(item),
                'featured': False
            }
            
            return PILInDB(**pil_data)
        except Exception as e:
            logger.warning(f"Error transforming PIL data: {str(e)}")
            return None

    def _extract_tags(self, item: Dict) -> List[str]:
        """Extract tags from drug data"""
        tags = []
        category = item.get('category', '').lower()
        if category:
            tags.append(category)
        
        dosage_form = item.get('dosage_form', '').lower()
        if dosage_form:
            tags.append(dosage_form)
        
        # Add more tag extraction logic as needed
        return tags

# Initialize with your JSON path
pil_loader = PILDataLoader("app/data/unified_drugs_with_pils_v3.json")