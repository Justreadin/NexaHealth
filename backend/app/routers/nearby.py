# app/routers/nearby.py

from fastapi import APIRouter, Query, HTTPException
from typing import List, Optional
from pydantic import BaseModel
import requests

router = APIRouter()

OVERPASS_URL = "http://overpass-api.de/api/interpreter"

class Location(BaseModel):
    lat: float
    lng: float

class NearbyPlace(BaseModel):
    name: str
    type: str
    location: Location
    address: Optional[str] = None
    phone: Optional[str] = None
    website: Optional[str] = None
    opening_hours: Optional[str] = None
    distance_meters: Optional[int] = None  # If you calculate distance later

def query_overpass(lat: float, lng: float, radius: int = 3000, amenity_type: str = "pharmacy"):
    """
    Query the Overpass API for amenities of the given type around the lat/lng within the radius (meters).
    """
    query = f"""
    [out:json][timeout:25];
    (
      node["amenity"="{amenity_type}"](around:{radius},{lat},{lng});
      way["amenity"="{amenity_type}"](around:{radius},{lat},{lng});
      relation["amenity"="{amenity_type}"](around:{radius},{lat},{lng});
    );
    out center tags;
    """
    response = requests.post(OVERPASS_URL, data={"data": query})
    if response.status_code != 200:
        raise HTTPException(status_code=500, detail="Failed to fetch data from Overpass API")
    return response.json()

def extract_address(tags: dict) -> str:
    """
    Compose a human-readable address string from OSM tags, if available.
    """
    parts = []
    if "addr:housenumber" in tags:
        parts.append(tags["addr:housenumber"])
    if "addr:street" in tags:
        parts.append(tags["addr:street"])
    if "addr:suburb" in tags:
        parts.append(tags["addr:suburb"])
    if "addr:city" in tags:
        parts.append(tags["addr:city"])
    if "addr:state" in tags:
        parts.append(tags["addr:state"])
    if "addr:postcode" in tags:
        parts.append(tags["addr:postcode"])
    return ", ".join(parts) if parts else "Address not available"

@router.get("/get-nearby", response_model=List[NearbyPlace])
def get_nearby(
    lat: float = Query(..., description="Latitude of the user's location"),
    lng: float = Query(..., description="Longitude of the user's location"),
    radius: int = Query(3000, description="Search radius in meters"),
):
    """
    Get nearby pharmacies and hospitals around the specified coordinates within the radius.
    Uses OpenStreetMap Overpass API.
    """
    nearby_places = []
    for amenity in ["pharmacy", "hospital"]:
        data = query_overpass(lat, lng, radius=radius, amenity_type=amenity)
        for element in data.get("elements", []):
            tags = element.get("tags", {})
            # For ways and relations, location is in 'center'
            if element.get("type") in ("way", "relation"):
                loc = element.get("center", {})
            else:
                loc = {"lat": element.get("lat"), "lon": element.get("lon")}

            if not loc.get("lat") or not loc.get("lon"):
                # Skip elements without location data
                continue

            place = NearbyPlace(
                name=tags.get("name", "Unknown"),
                type=amenity.capitalize(),
                location=Location(lat=loc["lat"], lng=loc["lon"]),
                address=extract_address(tags),
                phone=tags.get("phone") or tags.get("contact:phone"),
                website=tags.get("website") or tags.get("contact:website"),
                opening_hours=tags.get("opening_hours"),
            )
            nearby_places.append(place)

    # Optional: You could sort by proximity if you want here

    return nearby_places
