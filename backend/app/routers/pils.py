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
    prefix="/api/pils",
    tags=["Product Information Leaflets"],
    responses={404: {"description": "Not found"}}
)

logger = logging.getLogger(__name__)

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")

# Public endpoints - no authentication required
@router.get("/", response_model=Dict)
async def search_pils(
    search: Optional[str] = Query(None, min_length=2, description="Search term for drug name, generic name or description"),
    category: Optional[DrugCategory] = Query(None, description="Filter by drug category"),
    manufacturer: Optional[str] = Query(None, description="Filter by manufacturer"),
    dosage_form: Optional[str] = Query(None, description="Filter by dosage form"),
    nafdac_no: Optional[str] = Query(None, description="Search by NAFDAC registration number"),
    limit: int = Query(10, ge=1, le=100, description="Maximum number of results")
):
    """
    Search drug leaflets by:
    - NAFDAC number (most accurate, unique)
    - or fallback to fuzzy search (names, generic, etc.)
    """
    try:
        search_result = pil_manager.search_pils(
            search=search,
            category=category.value if category else None,
            manufacturer=manufacturer,
            dosage_form=dosage_form,
            nafdac_no=nafdac_no,
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

# Authenticated endpoints - require valid user token
@router.get("/recent", response_model=List[PILInDB])
async def get_recently_viewed(
    limit: int = Query(10, ge=1, le=20),
    current_user: UserInDB = Depends(get_current_active_user)
):
    try:
        interactions = pil_manager.get_user_interactions(
            user_id=current_user.id,
            saved=False,
            limit=limit
        )
        pils = []
        for interaction in interactions:
            pil = pil_manager.get_pil(interaction.pil_id)
            if pil:
                pils.append(pil)
        return pils
    except Exception as e:
        logger.error(f"Recent error: {str(e)}")
        raise HTTPException(status_code=500, detail="Error getting recently viewed")

@router.get("/saved", response_model=List[PILInDB])
async def get_saved_pils(
    limit: int = Query(10, ge=1, le=20),
    current_user: UserInDB = Depends(get_current_active_user)
):
    try:
        interactions = pil_manager.get_user_interactions(
            user_id=current_user.id,
            saved=True,
            limit=limit
        )
        
        pils = []
        for interaction in interactions:
            pil = pil_manager.get_pil(interaction.pil_id)
            if pil:
                pils.append(pil)
                
        # Always return a list, even if empty
        return pils or []  # This ensures empty list is returned instead of raising 500
        
    except Exception as e:
        logger.error(f"Saved error: {str(e)}")
        # Return empty list on error instead of 500
        return []
    
@router.post("/{pil_id}/view", response_model=UserInteractionInDB)
async def record_pil_view(
    pil_id: str,
    current_user: UserInDB = Depends(get_current_active_user)
):
    try:
        # Verify PIL exists
        if not pil_manager.get_pil(pil_id):
            raise HTTPException(status_code=404, detail="Drug leaflet not found")
        
        interaction = UserInteractionBase(
            user_id=current_user.id,
            pil_id=pil_id,
            last_viewed=datetime.now(),
            view_count=1
        )
        return pil_manager.record_interaction(interaction)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"View recording error: {str(e)}")
        raise HTTPException(status_code=500, detail="Error recording view")

@router.post("/{pil_id}/save", response_model=UserInteractionInDB)
async def save_pil(
    pil_id: str,
    current_user: UserInDB = Depends(get_current_active_user)
):
    try:
        # Verify PIL exists
        if not pil_manager.get_pil(pil_id):
            raise HTTPException(status_code=404, detail="Drug leaflet not found")
        
        # First get existing interaction if any
        existing = pil_manager.get_user_interaction(current_user.id, pil_id)
        
        interaction = UserInteractionBase(
            user_id=current_user.id,
            pil_id=pil_id,
            saved=True,
            last_viewed=datetime.now(),
            view_count=existing.view_count + 1 if existing else 1
        )
        return pil_manager.record_interaction(interaction)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Save error: {str(e)}")
        raise HTTPException(status_code=500, detail="Error saving leaflet")

@router.post("/report-missing")
async def report_missing_drug(
    current_user: UserInDB = Depends(get_current_active_user)
):
    # Placeholder for reporting functionality
    return {
        "message": "Missing drug report received",
        "user_id": current_user.id,
        "timestamp": datetime.utcnow().isoformat()
    }