from fastapi import APIRouter, HTTPException, Query, Depends
from typing import Optional, List, Dict
from fastapi.security import OAuth2PasswordBearer
from app.models.pils_model import PILInDB, UserInteractionBase, UserInteractionInDB
from app.core.pils_manager import pil_manager
from app.models.pils_model import DrugCategory
from app.models.auth_model import UserInDB
from app.core.auth import get_current_active_user
from datetime import datetime
import logging

router = APIRouter(
    prefix="/api/test_pil",
    tags=["Product Information Leaflets"],
    responses={404: {"description": "Not found"}}
)

logger = logging.getLogger(__name__)

# Public endpoints - no authentication required
@router.get("/", response_model=Dict)
async def search_pils(
    search: Optional[str] = Query(None, min_length=2, 
                                description="Search term for drug name, generic name or description"),
    category: Optional[DrugCategory] = Query(None, 
                                           description="Filter by drug category"),
    manufacturer: Optional[str] = Query(None, 
                                      description="Filter by manufacturer"),
    dosage_form: Optional[str] = Query(None,
                                     description="Filter by dosage form"),
    limit: int = Query(10, ge=1, le=100, 
                      description="Maximum number of results")
):
    """
    Search drug leaflets with fuzzy matching.
    Returns:
    {
        "results": List[PILInDB],
        "suggestions": List[str] (optional spelling suggestions)
    }
    """
    try:
        search_result = pil_manager.search_pils(
            search=search,
            category=category.value if category else None,
            manufacturer=manufacturer,
            dosage_form=dosage_form,
            limit=limit
        )
        
        response = {"results": search_result["results"]}
        if search_result["suggestions"]:
            response["suggestions"] = search_result["suggestions"]
            logger.info(f"Suggestions for '{search}': {search_result['suggestions']}")
        
        return response
    except Exception as e:
        logger.error(f"Search error: {str(e)}")
        raise HTTPException(status_code=500, detail="Error searching drug leaflets")

@router.get("/featured", response_model=List[PILInDB])
async def get_featured_pils(
    limit: int = Query(5, ge=1, le=10, description="Number of featured leaflets")
):
    try:
        return pil_manager.get_featured_pils(limit=limit)
    except Exception as e:
        logger.error(f"Featured error: {str(e)}")
        raise HTTPException(status_code=500, detail="Error getting featured leaflets")

@router.get("/{pil_id}", response_model=PILInDB)
async def get_pil_details(pil_id: str):
    try:
        pil = pil_manager.get_pil(pil_id)
        if not pil:
            raise HTTPException(status_code=404, detail="Drug leaflet not found")
        return pil
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"PIL details error: {str(e)}")
        raise HTTPException(status_code=500, detail="Error getting leaflet details")
