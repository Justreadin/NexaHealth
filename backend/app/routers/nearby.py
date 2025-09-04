# app/routers/nearby.py

from fastapi import APIRouter, Query, HTTPException, Depends
from typing import List, Optional
from app.dependencies.auth import guest_or_auth
from pydantic import BaseModel
import requests
from enum import Enum
from datetime import datetime, timedelta
import random

router = APIRouter()

OVERPASS_URL = "http://overpass-api.de/api/interpreter"

class FacilityStatus(str, Enum):
    VERIFIED = "verified"
    FLAGGED = "flagged"
    UNDER_REVIEW = "under_review"

class FacilityType(str, Enum):
    PHARMACY = "Pharmacy"
    CLINIC = "Clinic"
    LAB = "Lab"

class Location(BaseModel):
    lat: float
    lng: float

class NearbyFacility(BaseModel):
    id: int
    name: str
    type: FacilityType
    status: FacilityStatus
    address: str
    phone: Optional[str] = None
    email: Optional[str] = None
    website: Optional[str] = None
    services: List[str] = []
    hours: dict
    location: Location
    distance: str
    rating: Optional[float] = None
    reviews: Optional[int] = None
    last_verified: str

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

def generate_fake_services(facility_type: FacilityType) -> List[str]:
    """Generate realistic services based on facility type"""
    if facility_type == FacilityType.PHARMACY:
        return ["Prescription", "Vaccination", "Health Check", "Home Delivery"]
    elif facility_type == FacilityType.CLINIC:
        return ["General Practice", "Pediatrics", "Dermatology", "Dental"]
    else:  # Lab
        return ["Blood Tests", "Imaging", "COVID Testing", "Urinalysis"]

def generate_opening_hours(facility_type: FacilityType) -> dict:
    """Generate realistic opening hours"""
    base_hours = {
        "weekdays": "8:00 AM - 9:00 PM",
        "saturday": "9:00 AM - 8:00 PM",
        "sunday": "10:00 AM - 6:00 PM"
    }
    
    if facility_type == FacilityType.CLINIC:
        base_hours = {
            "weekdays": "7:30 AM - 8:00 PM",
            "saturday": "8:00 AM - 6:00 PM",
            "sunday": "Closed"
        }
    elif facility_type == FacilityType.LAB:
        base_hours = {
            "weekdays": "7:00 AM - 7:00 PM",
            "saturday": "8:00 AM - 4:00 PM",
            "sunday": "Closed"
        }
    
    return base_hours

def generate_last_verified() -> str:
    """Generate a realistic last verified date"""
    days_ago = random.randint(1, 180)  # 1-180 days ago
    return f"{days_ago} days ago"

def calculate_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculate distance between two coordinates in km"""
    # Haversine formula implementation
    R = 6371  # Earth radius in km
    dLat = (lat2 - lat1) * (3.141592653589793 / 180)
    dLon = (lon2 - lon1) * (3.141592653589793 / 180)
    a = (
        (dLat/2).sin() * (dLat/2).sin() +
        (lat1 * 3.141592653589793 / 180).cos() * (lat2 * 3.141592653589793 / 180).cos() * 
        (dLon/2).sin() * (dLon/2).sin()
    )
    c = 2 * (a.sqrt()).atan2((1-a).sqrt())
    return R * c

@router.get("/nearby-facilities", response_model=List[NearbyFacility])
def get_nearby_facilities(
    lat: float = Query(...),
    lng: float = Query(...),
    radius: int = Query(5000, description="Search radius in meters"),
    facility_types: List[FacilityType] = Query([FacilityType.PHARMACY, FacilityType.CLINIC, FacilityType.LAB]),
    statuses: List[FacilityStatus] = Query([FacilityStatus.VERIFIED, FacilityStatus.FLAGGED, FacilityStatus.UNDER_REVIEW]),
    max_results: int = Query(20, ge=1, le=50),
    auth_state: tuple = Depends(guest_or_auth(max_uses=15, feature_name="nearby_search"))
):
    """
    Get nearby health facilities with enriched data matching the frontend requirements.
    """
    # Map our FacilityType to OSM amenity types
    amenity_mapping = {
        FacilityType.PHARMACY: "pharmacy",
        FacilityType.CLINIC: "clinic",
        FacilityType.LAB: "laboratory"
    }
    
    nearby_facilities = []
    id_counter = 1
    
    for facility_type in facility_types:
        amenity_type = amenity_mapping.get(facility_type, "pharmacy")
        data = query_overpass(lat, lng, radius=radius, amenity_type=amenity_type)
        
        for element in data.get("elements", []):
            tags = element.get("tags", {})
            
            # For ways and relations, location is in 'center'
            if element.get("type") in ("way", "relation"):
                loc = element.get("center", {})
            else:
                loc = {"lat": element.get("lat"), "lon": element.get("lon")}

            if not loc.get("lat") or not loc.get("lon"):
                continue  # Skip elements without location data
                
            # Calculate distance
            distance_km = calculate_distance(lat, lng, loc["lat"], loc["lon"])
            
            # Generate status (random for demo, in production this would come from your verification system)
            status = random.choice(list(FacilityStatus))
            if status not in statuses:
                continue
                
            # Generate rating and reviews if not provided
            rating = float(tags.get("rating", round(random.uniform(3.0, 5.0), 1)))
            reviews = int(tags.get("reviews", random.randint(5, 250)))
            
            facility = NearbyFacility(
                id=id_counter,
                name=tags.get("name", f"Unnamed {facility_type.value}"),
                type=facility_type,
                status=status,
                address=extract_address(tags),
                phone=tags.get("phone") or tags.get("contact:phone"),
                email=tags.get("contact:email"),
                website=tags.get("website") or tags.get("contact:website"),
                services=generate_fake_services(facility_type),
                hours=generate_opening_hours(facility_type),
                location=Location(lat=loc["lat"], lng=loc["lon"]),
                distance=f"{distance_km:.1f} km",
                rating=rating,
                reviews=reviews,
                last_verified=generate_last_verified()
            )
            
            nearby_facilities.append(facility)
            id_counter += 1
            
            if len(nearby_facilities) >= max_results:
                break
    
    # Sort by distance
    nearby_facilities.sort(key=lambda x: float(x.distance.split()[0]))
    
    return nearby_facilities