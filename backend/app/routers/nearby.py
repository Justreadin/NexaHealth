from fastapi import APIRouter, Depends, Query
from typing import List, Optional
from pydantic import BaseModel
from geopy.distance import geodesic
import httpx

from app.models.auth_model import UserInDB
from app.core.auth import get_current_active_user

router = APIRouter(
    prefix="/api/pharmacies",
    tags=["Nearby Pharmacies"]
)

class PharmacyOut(BaseModel):
    id: str
    name: str
    address: str
    lat: float
    lng: float
    distance_km: float
    status: str = "Unverified Pharmacy — No public trust score"
    invite_link: str

OVERPASS_URL = "https://overpass-api.de/api/interpreter"
# Fallback servers in case the main one is slow/down
OVERPASS_ALTERNATIVES = [
    "https://overpass.kumi.systems/api/interpreter",
    "https://overpass.nchc.org.tw/api/interpreter"
]


@router.get("/nearby", response_model=List[PharmacyOut])
async def get_nearby_pharmacies(
    current_user: UserInDB = Depends(get_current_active_user),
    lat: float = Query(..., description="User latitude"),
    lng: float = Query(..., description="User longitude"),
    radius_km: float = Query(5, description="Search radius in kilometers")
):
    """
    Fetch nearby pharmacies/clinics/hospitals using OpenStreetMap.
    Fast, with timeout and fallback servers.
    """
    radius_m = radius_km * 1000
    user_loc = (lat, lng)

    query = f"""
    [out:json][timeout:25];
    (
      node["amenity"="pharmacy"](around:{radius_m},{lat},{lng});
      node["amenity"="clinic"](around:{radius_m},{lat},{lng});
    );
    out center;
    """

    urls = [OVERPASS_URL] + OVERPASS_ALTERNATIVES
    data = None

    for url in urls:
        try:
            async with httpx.AsyncClient(timeout=30) as client:
                response = await client.post(url, data=query)
                response.raise_for_status()
                data = response.json()
                break  # ✅ stop once you get a result

        except Exception as e:
            continue  # try the next mirror

    if not data:
        raise HTTPException(status_code=503, detail="OSM API unavailable. Try again later.")

    elements = data.get("elements", [])
    results = []

    for element in elements:
        ph_lat = element.get("lat")
        ph_lng = element.get("lon")
        if ph_lat is None or ph_lng is None:
            continue

        distance = geodesic(user_loc, (ph_lat, ph_lng)).km
        osm_id = str(element.get("id"))

        name = element.get("tags", {}).get("name", "Unverified Pharmacy")
        address_parts = [
            element.get("tags", {}).get("addr:street", ""),
            element.get("tags", {}).get("addr:city", ""),
            element.get("tags", {}).get("addr:state", ""),
            element.get("tags", {}).get("addr:postcode", "")
        ]
        address = ", ".join([x for x in address_parts if x]).strip() or "Address not available"

        results.append(PharmacyOut(
            id=osm_id,
            name=name,
            address=address,
            lat=ph_lat,
            lng=ph_lng,
            distance_km=round(distance, 2),
            invite_link=f"https://nexahealth.life/pharmacy/{osm_id}?ref=invite"
        ))

    results.sort(key=lambda x: x.distance_km)
    return results
