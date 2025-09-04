from enum import Enum
from fastapi import APIRouter, Query, HTTPException
from typing import List, Optional
from pydantic import BaseModel, field_validator, validator
import requests
from geopy.distance import geodesic
import logging
from cachetools import TTLCache
import time
from datetime import datetime
from math import radians, sin, cos, sqrt, atan2
import os

router = APIRouter(prefix="/api", tags=["Nearby Facilities"])

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Cache configuration
location_cache = TTLCache(maxsize=1000, ttl=3600)
facility_cache = TTLCache(maxsize=1000, ttl=1800)

# API Endpoints
OVERPASS_URL = "https://overpass-api.de/api/interpreter"
NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
LOCATIONIQ_URL = "https://us1.locationiq.com/v1/reverse.php"

# Nigeria bounding coordinates
NIGERIA_BOUNDS = {
    "min_lat": 4.0,
    "max_lat": 14.0,
    "min_lng": 2.0,
    "max_lng": 15.0
}

class FacilityType(str, Enum):
    PHARMACY = "pharmacy"
    CLINIC = "clinic"
    LAB = "lab"
    HOSPITAL = "hospital"
    MATERNITY = "maternity"
    PRIMARY_HEALTH = "primary_health"

class FacilityStatus(str, Enum):
    VERIFIED = "verified"
    FLAGGED = "flagged"
    UNDER_REVIEW = "under_review"

class Location(BaseModel):
    lat: float
    lng: float
    accuracy: Optional[float] = None
    address: Optional[str] = None
    street: Optional[str] = None
    building: Optional[str] = None
    state: Optional[str] = None
    lga: Optional[str] = None  # Local Government Area

    @field_validator('lat')
    @classmethod
    def validate_lat(cls, v):
        if not (-90 <= v <= 90):
            raise ValueError("Latitude must be between -90 and 90")
        return v

    @field_validator('lng')
    @classmethod
    def validate_lng(cls, v):
        if not (-180 <= v <= 180):
            raise ValueError("Longitude must be between -180 and 180")
        return v

class NearbyFacility(BaseModel):
    id: str
    name: str
    type: FacilityType
    status: FacilityStatus
    address: str
    phone: Optional[str] = None
    website: Optional[str] = None
    services: List[str] = []
    hours: Optional[dict] = None
    location: Location
    distance: str
    rating: Optional[float] = None
    reviews: Optional[int] = None
    last_verified: str
    emergency: Optional[bool] = False

def is_in_nigeria(lat: float, lng: float) -> bool:
    """Check if coordinates are within Nigeria's bounds"""
    return (NIGERIA_BOUNDS["min_lat"] <= lat <= NIGERIA_BOUNDS["max_lat"] and
            NIGERIA_BOUNDS["min_lng"] <= lng <= NIGERIA_BOUNDS["max_lng"])

def get_precise_address(lat: float, lng: float) -> dict:
    """Get address with Nigerian-specific formatting"""
    cache_key = f"{lat:.6f},{lng:.6f}"
    if cache_key in location_cache:
        return location_cache[cache_key]
    
    try:
        # Try LocationIQ first
        locationiq_key = os.getenv("LOCATIONIQ_KEY")
        if locationiq_key:
            response = requests.get(
                LOCATIONIQ_URL,
                params={
                    'key': locationiq_key,
                    'lat': lat,
                    'lon': lng,
                    'format': 'json',
                    'zoom': 18,
                    'addressdetails': 1
                },
                timeout=5
            )
            response.raise_for_status()
            data = response.json()
            
            if data.get('address'):
                address = format_nigerian_address(data['address'])
                address['formatted'] = data.get('display_name', address.get('formatted'))
                location_cache[cache_key] = address
                return address
    except Exception as e:
        logger.warning(f"LocationIQ failed: {str(e)}")

    # Fall back to Nominatim
    try:
        response = requests.get(
            NOMINATIM_URL,
            params={
                'format': 'json',
                'lat': lat,
                'lon': lng,
                'zoom': 18,
                'addressdetails': 1
            },
            timeout=5
        )
        response.raise_for_status()
        data = response.json()
        
        if isinstance(data, list) and len(data) > 0:
            address = format_nigerian_address(data[0].get('address', {}))
            address['formatted'] = data[0].get('display_name', address.get('formatted'))
            location_cache[cache_key] = address
            return address
    except Exception as e:
        logger.error(f"Reverse geocoding failed: {str(e)}")
    
    return {
        'formatted': None,
        'street': None,
        'building': None,
        'neighborhood': None,
        'city': None,
        'state': None,
        'lga': None,
        'country': 'Nigeria'
    }

def format_nigerian_address(address: dict) -> dict:
    """Format address specifically for Nigerian locations"""
    state = address.get('state') or address.get('county') or ''
    lga = address.get('county') or address.get('suburb') or ''
    
    parts = []
    if address.get('house_number') and address.get('road'):
        parts.append(f"{address['house_number']} {address['road']}")
    elif address.get('road'):
        parts.append(address['road'])
    
    if lga:
        parts.append(lga)
    if state:
        parts.append(state)
    
    return {
        'formatted': ", ".join(parts) if parts else None,
        'street': address.get('road'),
        'building': address.get('house_number'),
        'neighborhood': address.get('neighbourhood') or address.get('suburb'),
        'city': address.get('city') or address.get('town') or address.get('village'),
        'state': state,
        'lga': lga,
        'country': address.get('country', 'Nigeria')
    }

@router.get("/nearby-facilities", response_model=List[NearbyFacility])
async def get_nearby_facilities(
    lat: float = Query(..., description="Latitude", example=6.5244),
    lng: float = Query(..., description="Longitude", example=3.3792),
    radius: int = Query(5000, description="Radius in meters (100-20000)", ge=100, le=20000),
    facility_types: str = Query("pharmacy,clinic,hospital", description="Comma-separated facility types"),
    statuses: str = Query("verified", description="Comma-separated statuses"),
    max_results: int = Query(20, description="Max results (1-50)", ge=1, le=50)
):
    """
    Find health facilities in Nigeria near the given location.
    
    Returns a list of nearby health facilities including pharmacies, clinics, and hospitals
    with their contact information and distance from the provided location.
    """
    try:
        # Validate coordinates are within Nigeria
        if not is_in_nigeria(lat, lng):
            raise HTTPException(
                status_code=400,
                detail="Coordinates must be within Nigeria"
            )
        
        # Parse comma-separated strings to lists
        try:
            facility_types_list = [FacilityType(ft.strip()) for ft in facility_types.split(",")]
            statuses_list = [FacilityStatus(s.strip()) for s in statuses.split(",")]
        except ValueError as e:
            raise HTTPException(status_code=422, detail=f"Invalid parameter: {str(e)}")
        
        cache_key = f"{lat:.6f},{lng:.6f},{radius},{facility_types},{statuses}"
        if cache_key in facility_cache:
            return facility_cache[cache_key]
        
        facilities = []
        amenity_mapping = {
            FacilityType.PHARMACY: "pharmacy",
            FacilityType.CLINIC: "clinic",
            FacilityType.LAB: "laboratory",
            FacilityType.HOSPITAL: "hospital",
            FacilityType.MATERNITY: "clinic",
            FacilityType.PRIMARY_HEALTH: "doctors"
        }
        
        for facility_type in facility_types_list:
            try:
                data = query_overpass(lat, lng, radius, amenity_mapping[facility_type])
                for element in data.get('elements', []):
                    facility = process_osm_element(element, lat, lng, facility_type)
                    if facility and facility.status in statuses_list:
                        facilities.append(facility)
                        if len(facilities) >= max_results:
                            break
            except Exception as e:
                logger.error(f"Error processing {facility_type}: {str(e)}")
                continue
        
        # Sort by distance and cache results
        facilities.sort(key=lambda x: float(x.distance.split()[0]))
        facility_cache[cache_key] = facilities[:max_results]
        
        return facility_cache[cache_key]
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching facilities: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to fetch facilities")

def query_overpass(lat: float, lng: float, radius: int, amenity: str):
    """Query Overpass API with retry logic"""
    query = f"""
    [out:json][timeout:45];
    (
      node["amenity"="{amenity}"](around:{radius},{lat},{lng});
      way["amenity"="{amenity}"](around:{radius},{lat},{lng});
      relation["amenity"="{amenity}"](around:{radius},{lat},{lng});
    );
    out center tags;
    """
    
    for attempt in range(3):
        try:
            response = requests.post(
                OVERPASS_URL,
                data={'data': query},
                timeout=30,
                headers={'User-Agent': 'NexaHealth/1.0'}
            )
            response.raise_for_status()
            return response.json()
        except requests.exceptions.Timeout:
            if attempt == 2:
                raise HTTPException(
                    status_code=504,
                    detail="Map data server timeout. Please try again later."
                )
            time.sleep((attempt + 1) * 3)
        except Exception as e:
            if attempt == 2:
                raise HTTPException(
                    status_code=502,
                    detail="Failed to fetch map data"
                )
            time.sleep((attempt + 1) * 2)

def process_osm_element(element: dict, user_lat: float, user_lng: float, facility_type: FacilityType):
    """Convert OSM element to our facility model"""
    tags = element.get('tags', {})
    
    # Get location
    if element.get('type') in ('way', 'relation'):
        loc = element.get('center', {})
    else:
        loc = {'lat': element.get('lat'), 'lon': element.get('lon')}
    
    if not loc.get('lat') or not loc.get('lon'):
        return None
    
    # Get address details
    address = get_precise_address(loc['lat'], loc['lon'])
    
    # Calculate distance in km
    distance_km = geodesic((user_lat, user_lng), (loc['lat'], loc['lon'])).km
    
    # Determine status (in a real app, this would come from your database)
    status = determine_facility_status(tags)
    
    return NearbyFacility(
        id=f"{element['type']}-{element['id']}",
        name=tags.get('name', 'Unnamed Facility'),
        type=facility_type,
        status=status,
        address=address['formatted'] or create_address_from_tags(tags),
        phone=tags.get('phone') or tags.get('contact:phone'),
        website=tags.get('website') or tags.get('contact:website'),
        services=get_services_for_type(facility_type, tags),
        hours=get_opening_hours(tags),
        location=Location(
            lat=loc['lat'],
            lng=loc['lon'],
            address=address['formatted'],
            street=address['street'],
            building=address['building'],
            state=address['state'],
            lga=address['lga']
        ),
        distance=f"{distance_km:.1f} km",
        rating=None,  # Would come from your database
        reviews=None,
        last_verified=datetime.now().strftime("%Y-%m-%d"),
        emergency=tags.get('emergency') == 'yes'
    )

def determine_facility_status(tags: dict) -> FacilityStatus:
    """Determine facility status based on OSM tags"""
    # This is simplified - in a real app you'd check your database
    if tags.get('nexa:verified') == 'yes':
        return FacilityStatus.VERIFIED
    if tags.get('nexa:flagged') == 'yes':
        return FacilityStatus.FLAGGED
    return FacilityStatus.VERIFIED  # Default to verified

def create_address_from_tags(tags: dict) -> str:
    """Create address string from OSM tags with Nigerian format"""
    parts = []
    if tags.get('addr:housenumber') and tags.get('addr:street'):
        parts.append(f"{tags['addr:housenumber']} {tags['addr:street']}")
    elif tags.get('addr:street'):
        parts.append(tags['addr:street'])
    
    if tags.get('addr:city'):
        parts.append(tags['addr:city'])
    elif tags.get('addr:suburb'):
        parts.append(tags['addr:suburb'])
    
    if tags.get('addr:state'):
        parts.append(tags['addr:state'])
    
    return ', '.join(parts) if parts else "Address not available"

def get_services_for_type(facility_type: FacilityType, tags: dict) -> List[str]:
    """Get services for facility type with Nigerian context"""
    base_services = {
        FacilityType.PHARMACY: ["Prescriptions", "Over-the-counter", "Health products"],
        FacilityType.CLINIC: ["General consultation", "First aid", "Basic treatment"],
        FacilityType.LAB: ["Blood tests", "Urinalysis", "Diagnostic services"],
        FacilityType.HOSPITAL: ["Emergency", "Inpatient", "Specialist care"],
        FacilityType.MATERNITY: ["Prenatal care", "Delivery", "Postnatal care"],
        FacilityType.PRIMARY_HEALTH: ["Immunization", "Family planning", "Malaria treatment"]
    }.get(facility_type, [])
    
    # Add services from OSM tags if available
    if tags.get('healthcare:speciality'):
        specialties = tags['healthcare:speciality'].split(';')
        base_services.extend(specialties)
    
    return list(set(base_services))  # Remove duplicates

def get_opening_hours(tags: dict) -> dict:
    """Parse opening hours from OSM tags"""
    if tags.get('opening_hours'):
        try:
            # Simple parsing - in a real app you'd use a proper parser
            return {"raw": tags['opening_hours']}
        except:
            return None
    return None