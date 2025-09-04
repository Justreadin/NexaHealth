// API Configuration
const API_BASE_URL = 'http://localhost:8000';
const FACILITIES_ENDPOINT = '/api/nearby-facilities';
const LOCATIONIQ_KEY = 'pk.0d0978a4a75d4fed37361dc10c75fc32'; // Your LocationIQ key
const LOCATIONIQ_URL = 'https://us1.locationiq.com/v1/reverse';

// Default coordinates for Nigeria (center point)
const DEFAULT_LAT = 9.0820;
const DEFAULT_LNG = 8.6753;

// DOM Elements
const searchInput = document.getElementById('search-input');
const filterToggle = document.getElementById('filter-toggle');
const filterPanel = document.getElementById('filter-panel');
const locationBtn = document.getElementById('location-btn');
const facilityMap = document.getElementById('facility-map');
const facilityList = document.getElementById('facility-list');
const gridView = document.getElementById('grid-view');
const listView = document.getElementById('list-view');
const listViewBtn = document.getElementById('list-view-btn');
const gridViewBtn = document.getElementById('grid-view-btn');
const loadingState = document.getElementById('loading-state');
const emptyState = document.getElementById('empty-state');
const facilityModal = document.getElementById('facility-modal');
const closeModal = document.getElementById('close-modal');
const locationPermissionModal = document.getElementById('location-permission-modal');
const allowLocationBtn = document.getElementById('allow-location');
const denyLocationBtn = document.getElementById('deny-location');
const applyFiltersBtn = document.getElementById('apply-filters');
const resetFiltersBtn = document.getElementById('reset-filters');
const distanceFilter = document.getElementById('distance-filter');
const getDirectionsBtn = document.getElementById('get-directions');
const callNowBtn = document.getElementById('call-now');
const locationDetails = document.getElementById('location-details');

// Map Variables
let map;
let userLocationMarker;
let facilitiesLayerGroup;
let userLocation = null;
let currentFacilities = [];
let watchId = null;

// Initialize the application
document.addEventListener('DOMContentLoaded', function() {
    initMap();
    setupEventListeners();
    checkGeolocationSupport();
});

function checkGeolocationSupport() {
    if (!navigator.geolocation) {
        showErrorToast("Geolocation is not supported by your browser");
        fetchFacilities(DEFAULT_LAT, DEFAULT_LNG);
    }
}

function setupEventListeners() {
    filterToggle.addEventListener('click', toggleFilterPanel);
    listViewBtn.addEventListener('click', showListView);
    gridViewBtn.addEventListener('click', showGridView);
    closeModal.addEventListener('click', () => facilityModal.classList.add('hidden'));
    locationBtn.addEventListener('click', requestLocation);
    allowLocationBtn.addEventListener('click', requestLocationAccess);
    denyLocationBtn.addEventListener('click', () => locationPermissionModal.classList.add('hidden'));
    applyFiltersBtn.addEventListener('click', applyFilters);
    resetFiltersBtn.addEventListener('click', resetFilters);
    getDirectionsBtn.addEventListener('click', getDirections);
    callNowBtn.addEventListener('click', callNow);
    searchInput.addEventListener('input', debounce(searchFacilities, 500));
    
    // Global click handler for view-details buttons
    document.addEventListener('click', function(e) {
        if (e.target.classList.contains('view-details')) {
            const facilityId = e.target.dataset.id;
            showFacilityDetails(facilityId);
        }
    });
    
    // Network status monitoring
    window.addEventListener('online', handleOnlineStatus);
    window.addEventListener('offline', handleOfflineStatus);
}

function initMap() {
    map = L.map('facility-map').setView([DEFAULT_LAT, DEFAULT_LNG], 6);
    
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19
    }).addTo(map);
    
    facilitiesLayerGroup = L.layerGroup().addTo(map);
}

async function fetchFacilities(lat, lng) {
    try {
        showLoadingState();
        
        const response = await fetchWithTimeout(
            `${API_BASE_URL}${FACILITIES_ENDPOINT}?` + new URLSearchParams({
                lat: lat,
                lng: lng,
                radius: (distanceFilter.value || 10) * 1000,
                facility_types: getSelectedFacilityTypes(),
                statuses: getSelectedStatuses()
            }),
            { timeout: 15000 } // Increased timeout for Nigerian conditions
        );
        
        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            throw new Error(error.detail || 'Failed to fetch facilities');
        }
        
        const facilities = await response.json();
        currentFacilities = facilities;
        renderFacilities(facilities);
        updateLocationDetails(lat, lng);
        
    } catch (error) {
        console.error('Error:', error);
        showErrorState(error.message);
        loadCachedFacilities(lat, lng);
    } finally {
        hideLoadingState();
    }
}

function fetchWithTimeout(resource, options = {}) {
    const { timeout = 15000 } = options;
    
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);
    
    return fetch(resource, {
        ...options,
        signal: controller.signal  
    }).then(response => {
        clearTimeout(id);
        return response;
    }).catch(error => {
        clearTimeout(id);
        throw error;
    });
}

function getSelectedFacilityTypes() {
    return Array.from(document.querySelectorAll('input[name="facility-type"]:checked'))
        .map(el => el.value)
        .join(',');
}

function getSelectedStatuses() {
    return Array.from(document.querySelectorAll('input[name="facility-status"]:checked'))
        .map(el => el.value)
        .join(',');
}

async function updateLocationDetails(lat, lng) {
    try {
        // Use LocationIQ for accurate Nigerian addresses
        let address = await getNigerianAddress(lat, lng);
        
        if (address) {
            // Format for Nigerian context
            const parts = [];
            if (address.street) parts.push(address.street);
            if (address.lga) parts.push(address.lga);
            if (address.state) parts.push(address.state);
            
            const formattedAddress = parts.join(', ') || address.formatted || 'Location in Nigeria';
            
            locationDetails.textContent = `Location: ${formattedAddress}`;
            locationDetails.style.display = 'block';
            
            if (userLocation) {
                userLocation.address = formattedAddress;
            }
        }
    } catch (error) {
        console.error('Error getting address:', error);
    }
}

async function getNigerianAddress(lat, lng) {
    try {
        // Use LocationIQ for better Nigerian address accuracy
        const response = await fetchWithTimeout(
            `${LOCATIONIQ_URL}?key=${LOCATIONIQ_KEY}&lat=${lat}&lon=${lng}&format=json&zoom=18&addressdetails=1`,
            { timeout: 5000 }
        );
        
        if (response.ok) {
            const data = await response.json();
            return formatNigerianAddress(data);
        }
        
        // Fallback to Nominatim if LocationIQ fails
        const nominatimResponse = await fetchWithTimeout(
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18`,
            { timeout: 5000 }
        );
        
        if (nominatimResponse.ok) {
            const data = await nominatimResponse.json();
            return formatNigerianAddress(data);
        }
        
        return null;
    } catch (error) {
        console.error('Error in getNigerianAddress:', error);
        return null;
    }
}

function formatNigerianAddress(data) {
    const address = data.address || {};
    
    // Nigerian-specific address formatting
    const parts = [];
    if (address.road) parts.push(address.road);
    if (address.neighbourhood) parts.push(address.neighbourhood);
    if (address.suburb) parts.push(address.suburb);
    if (address.city || address.town || address.village) {
        parts.push(address.city || address.town || address.village);
    }
    if (address.state) parts.push(address.state);
    
    return {
        formatted: parts.join(', ') || data.display_name || 'Location in Nigeria',
        street: address.road,
        lga: address.county || address.suburb, // Local Government Area
        state: address.state,
        country: address.country || 'Nigeria'
    };
}

function renderFacilities(facilities) {
    loadingState.classList.add('hidden');
    
    if (facilities.length === 0) {
        emptyState.classList.remove('hidden');
        return;
    } else {
        emptyState.classList.add('hidden');
    }
    
    // Clear existing facilities
    facilitiesLayerGroup.clearLayers();
    gridView.innerHTML = '';
    listView.innerHTML = '';
    
    // Cache facilities
    cacheFacilities(facilities);
    
    // Add new facilities
    facilities.forEach(facility => {
        addFacilityToMap(facility);
        addFacilityToCardView(facility);
    });
    
    // Fit bounds to show all facilities
    if (facilities.length > 0) {
        const bounds = facilitiesLayerGroup.getBounds();
        if (bounds.isValid()) {
            map.fitBounds(bounds, { padding: [50, 50] });
        }
    }
    
    // Default to grid view
    showGridView();
}

function addFacilityToMap(facility) {
    const icon = L.divIcon({
        className: 'facility-marker',
        html: `
            <div class="marker-container ${facility.type.toLowerCase()}">
                <i class="fas ${getFacilityIcon(facility.type)}"></i>
                <span class="accuracy">${facility.distance}</span>
            </div>
        `,
        iconSize: [32, 32],
        iconAnchor: [16, 32],
        popupAnchor: [0, -32]
    });
    
    const marker = L.marker(
        [facility.location.lat, facility.location.lng],
        { icon }
    ).addTo(facilitiesLayerGroup);
    
    marker.bindPopup(createFacilityPopup(facility));
}

function getFacilityIcon(type) {
    switch(type.toLowerCase()) {
        case 'pharmacy': return 'fa-pills';
        case 'clinic': return 'fa-clinic-medical';
        case 'hospital': return 'fa-hospital';
        case 'maternity': return 'fa-baby';
        case 'primary_health': return 'fa-house-medical';
        default: return 'fa-flask';
    }
}

function createFacilityPopup(facility) {
    return `
        <div class="facility-popup">
            <h3>${facility.name}</h3>
            <div class="facility-type">${formatFacilityType(facility.type)}</div>
            <div class="facility-meta">
                <div class="facility-status">${getStatusBadge(facility.status)}</div>
                <div class="facility-distance">
                    <i class="fas fa-walking"></i> ${facility.distance} away
                </div>
            </div>
            <div class="facility-address">
                <i class="fas fa-map-marker-alt"></i> ${facility.address || 'Address not available'}
            </div>
            <button class="btn btn-primary view-details" data-id="${facility.id}">
                View Details
            </button>
        </div>
    `;
}

function formatFacilityType(type) {
    const typeMap = {
        'pharmacy': 'Pharmacy',
        'clinic': 'Clinic',
        'hospital': 'Hospital',
        'maternity': 'Maternity Center',
        'primary_health': 'Primary Health Center'
    };
    return typeMap[type.toLowerCase()] || type;
}

function addFacilityToCardView(facility) {
    const card = document.createElement('div');
    card.className = `facility-card ${facility.type.toLowerCase()}`;
    card.innerHTML = `
        <div class="card-header">
            <div class="facility-icon">
                <i class="fas ${getFacilityIcon(facility.type)}"></i>
            </div>
            <div class="facility-info">
                <h3>${facility.name}</h3>
                <div class="facility-type">${formatFacilityType(facility.type)}</div>
            </div>
        </div>
        <div class="card-body">
            <div class="facility-status">${getStatusBadge(facility.status)}</div>
            <div class="facility-address">
                <i class="fas fa-map-marker-alt"></i> 
                ${facility.address ? facility.address.split(',')[0] : 'Address not available'}
            </div>
            <div class="facility-distance">
                <i class="fas fa-walking"></i> ${facility.distance} away
            </div>
        </div>
        <div class="card-footer">
            <button class="btn btn-secondary view-details" data-id="${facility.id}">
                View Details
            </button>
        </div>
    `;
    
    gridView.appendChild(card);
}

function showFacilityDetails(facilityId) {
    const facility = currentFacilities.find(f => f.id === facilityId);
    if (!facility) return;
    
    document.getElementById('facility-name').textContent = facility.name;
    document.getElementById('facility-type').textContent = formatFacilityType(facility.type);
    document.getElementById('facility-address').textContent = facility.address || 'Address not available';
    document.getElementById('facility-phone').textContent = facility.phone || 'Not available';
    document.getElementById('facility-phone').href = facility.phone ? `tel:${facility.phone}` : '#';
    document.getElementById('facility-email').textContent = facility.email || 'Not available';
    document.getElementById('facility-email').href = facility.email ? `mailto:${facility.email}` : '#';
    document.getElementById('facility-website').textContent = facility.website ? facility.website.replace(/^https?:\/\//, '') : 'Not available';
    document.getElementById('facility-website').href = facility.website || '#';
    
    // Format distance with estimated walking time for Nigerian context
    const distanceKm = parseFloat(facility.distance.split(' ')[0]);
    const walkingTime = Math.round(distanceKm * 15); // 15 minutes per km estimate
    document.getElementById('facility-distance').textContent = `${facility.distance} (~${walkingTime} min walk)`;
    
    document.getElementById('facility-verified').textContent = facility.last_verified || 'Not specified';
    
    // Update status badge
    const statusBadge = document.getElementById('facility-status');
    statusBadge.className = `${facility.status === 'verified' ? 'verified-badge' : 'flagged-badge'} 
                             text-white text-xs px-2 py-1 rounded-full flex items-center`;
    document.getElementById('status-text').textContent = facility.status === 'verified' ? 'Verified' : 'Flagged';
    
    // Update services
    const servicesContainer = document.getElementById('facility-services');
    servicesContainer.innerHTML = '';
    if (facility.services && facility.services.length > 0) {
        facility.services.forEach(service => {
            const span = document.createElement('span');
            span.className = 'bg-green-100 text-green-800 text-xs px-2 py-1 rounded-full';
            span.textContent = service;
            servicesContainer.appendChild(span);
        });
    } else {
        servicesContainer.textContent = 'No services listed';
    }
    
    // Update hours
    const hoursContainer = document.getElementById('facility-hours');
    hoursContainer.innerHTML = '';
    if (facility.hours && facility.hours.raw) {
        const div = document.createElement('div');
        div.className = 'text-sm';
        div.textContent = facility.hours.raw;
        hoursContainer.appendChild(div);
    } else {
        hoursContainer.textContent = 'Opening hours not available';
    }
    
    // Update icon based on facility type
    const iconContainer = document.getElementById('facility-icon');
    iconContainer.className = `w-16 h-16 rounded-full flex items-center justify-center text-2xl ${getFacilityColorClass(facility.type)}`;
    const icon = document.createElement('i');
    icon.className = `fas ${getFacilityIcon(facility.type)}`;
    iconContainer.innerHTML = '';
    iconContainer.appendChild(icon);
    
    // Update action buttons
    getDirectionsBtn.dataset.lat = facility.location.lat;
    getDirectionsBtn.dataset.lng = facility.location.lng;
    callNowBtn.dataset.phone = facility.phone || '';
    
    facilityModal.classList.remove('hidden');
}

function getFacilityColorClass(type) {
    switch(type.toLowerCase()) {
        case 'pharmacy': return 'bg-blue-100 text-blue-600';
        case 'clinic': return 'bg-purple-100 text-purple-600';
        case 'hospital': return 'bg-pink-100 text-pink-600';
        case 'maternity': return 'bg-rose-100 text-rose-600';
        case 'primary_health': return 'bg-teal-100 text-teal-600';
        default: return 'bg-blue-100 text-blue-600';
    }
}

function applyFilters() {
    if (userLocation) {
        fetchFacilities(userLocation.lat, userLocation.lng);
    } else {
        fetchFacilities(DEFAULT_LAT, DEFAULT_LNG);
    }
    filterPanel.classList.add('hidden');
}

function resetFilters() {
    document.querySelectorAll('input[name="facility-type"]').forEach(el => {
        if (['pharmacy', 'clinic', 'hospital'].includes(el.value)) {
            el.checked = true;
        } else {
            el.checked = false;
        }
    });
    document.querySelectorAll('input[name="facility-status"]').forEach(el => {
        el.checked = el.value === 'verified';
    });
    distanceFilter.value = '10';
}

function getDirections() {
    const lat = this.dataset.lat;
    const lng = this.dataset.lng;
    
    if (!lat || !lng) {
        showErrorToast('Location data not available for this facility');
        return;
    }
    
    // Use Google Maps for directions
    let url = `https://www.google.com/maps?q=${lat},${lng}`;
    
    if (userLocation) {
        url = `https://www.google.com/maps/dir/?api=1&origin=${userLocation.lat},${userLocation.lng}&destination=${lat},${lng}&travelmode=walking`;
    }
    
    window.open(url, '_blank');
}

function callNow() {
    const phone = this.dataset.phone;
    
    if (phone) {
        window.location.href = `tel:${phone}`;
    } else {
        showErrorToast('Phone number not available for this facility');
    }
}

function toggleFilterPanel() {
    filterPanel.classList.toggle('hidden');
    filterToggle.classList.toggle('bg-blue-50');
    filterToggle.classList.toggle('border-blue-200');
}

function showListView() {
    listView.classList.remove('hidden');
    gridView.classList.add('hidden');
    listViewBtn.classList.add('text-primary');
    gridViewBtn.classList.remove('text-primary');
}

function showGridView() {
    gridView.classList.remove('hidden');
    listView.classList.add('hidden');
    gridViewBtn.classList.add('text-primary');
    listViewBtn.classList.remove('text-primary');
}

function requestLocation() {
    locationPermissionModal.classList.remove('hidden');
}

function requestLocationAccess() {
    locationPermissionModal.classList.add('hidden');
    
    if (!navigator.geolocation) {
        showErrorToast("Geolocation not supported");
        return;
    }

    // First try high accuracy
    navigator.geolocation.getCurrentPosition(
        position => handleLocationSuccess(position, true),
        error => {
            // Fallback to lower accuracy if high accuracy fails
            navigator.geolocation.getCurrentPosition(
                position => handleLocationSuccess(position, false),
                handleLocationError,
                {
                    enableHighAccuracy: false,
                    timeout: 10000,
                    maximumAge: 0
                }
            );
        },
        {
            enableHighAccuracy: true,
            timeout: 15000,
            maximumAge: 0
        }
    );

    // Set up watcher for continuous updates
    watchId = navigator.geolocation.watchPosition(
        position => handleLocationSuccess(position, true),
        handleLocationError,
        {
            enableHighAccuracy: true,
            maximumAge: 0,
            timeout: 30000
        }
    );
}

function handleLocationSuccess(position, highAccuracy) {
    const { latitude: lat, longitude: lng, accuracy } = position.coords;
    
    // Only update if accuracy is acceptable (more lenient for Nigeria)
    const minAccuracy = highAccuracy ? 150 : 500; // meters
    if (accuracy > minAccuracy) {
        showErrorToast(`Location accuracy low (${Math.round(accuracy)}m). Trying to improve...`);
        return;
    }
    
    userLocation = { lat, lng, accuracy };
    updateUserMarker(lat, lng, accuracy);
    fetchFacilities(lat, lng);
}

function updateUserMarker(lat, lng, accuracy) {
    if (userLocationMarker) {
        userLocationMarker.setLatLng([lat, lng]);
    } else {
        userLocationMarker = L.marker([lat, lng], {
            icon: L.divIcon({
                className: 'user-location-marker',
                html: `<div class="w-6 h-6 rounded-full bg-primary border-2 border-white shadow-lg"></div>`,
                iconSize: [24, 24],
                iconAnchor: [12, 12]
            }),
            zIndexOffset: 1000
        }).addTo(map);
    }
    
    userLocationMarker
        .bindPopup(`Your location (Accuracy: ${Math.round(accuracy)}m)`)
        .openPopup();
    
    // Adjust zoom based on accuracy
    const zoomLevel = accuracy < 50 ? 16 : 
                     accuracy < 100 ? 15 :
                     accuracy < 300 ? 14 : 13;
    map.setView([lat, lng], zoomLevel);
}

function handleLocationError(error) {
    console.error('Error getting location:', error);
    let message = 'Could not get your location.';
    
    switch(error.code) {
        case error.PERMISSION_DENIED:
            message = 'Location permission denied. Please enable location services in your browser settings.';
            break;
        case error.POSITION_UNAVAILABLE:
            message = 'Location information is unavailable.';
            break;
        case error.TIMEOUT:
            message = 'The request to get your location timed out.';
            break;
    }
    
    showErrorToast(message);
    fetchFacilities(DEFAULT_LAT, DEFAULT_LNG);
}

function searchFacilities() {
    const query = searchInput.value.trim().toLowerCase();
    if (!query) {
        renderFacilities(currentFacilities);
        return;
    }
    
    const filtered = currentFacilities.filter(facility => 
        facility.name.toLowerCase().includes(query) ||
        (facility.address && facility.address.toLowerCase().includes(query)) ||
        facility.type.toLowerCase().includes(query)
    );
    
    renderFacilities(filtered);
}

function debounce(func, wait) {
    let timeout;
    return function(...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), wait);
    };
}

function getStatusBadge(status, textSize = 'text-xs') {
    let badgeClass, badgeIcon, badgeText;
    
    switch(status) {
        case 'verified':
            badgeClass = 'verified-badge';
            badgeIcon = 'fa-check-circle';
            badgeText = 'Verified';
            break;
        case 'flagged':
            badgeClass = 'flagged-badge';
            badgeIcon = 'fa-exclamation-triangle';
            badgeText = 'Flagged';
            break;
        default:
            badgeClass = 'review-badge';
            badgeIcon = 'fa-clock';
            badgeText = 'Under Review';
    }
    
    return `
        <span class="${badgeClass} text-white ${textSize} px-2 py-1 rounded-full flex items-center">
            <i class="fas ${badgeIcon} mr-1"></i>
            ${badgeText}
        </span>
    `;
}

function cacheFacilities(facilities) {
    if ('caches' in window) {
        caches.open('facilities-cache').then(cache => {
            const url = `${API_BASE_URL}${FACILITIES_ENDPOINT}`;
            const response = new Response(JSON.stringify(facilities), {
                headers: { 'Content-Type': 'application/json' }
            });
            cache.put(url, response);
        });
    }
}

function loadCachedFacilities(lat, lng) {
    if ('caches' in window) {
        caches.match(`${API_BASE_URL}${FACILITIES_ENDPOINT}`).then(response => {
            if (response) {
                response.json().then(facilities => {
                    currentFacilities = facilities;
                    renderFacilities(facilities);
                    showInfoToast("Showing cached facilities. May not be current.");
                });
            }
        });
    }
}

function showLoadingState() {
    loadingState.classList.remove('hidden');
    emptyState.classList.add('hidden');
}

function hideLoadingState() {
    loadingState.classList.add('hidden');
}

function showErrorState(message) {
    emptyState.classList.remove('hidden');
    showErrorToast(message);
}

function showErrorToast(message) {
    showToast(message, 'error');
}

function showInfoToast(message) {
    showToast(message, 'info');
}

function showSuccessToast(message) {
    showToast(message, 'success');
}

function showToast(message, type) {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);
    
    setTimeout(() => {
        toast.classList.add('fade-out');
        setTimeout(() => toast.remove(), 300);
    }, 5000);
}

function handleOnlineStatus() {
    showSuccessToast("You are back online");
    if (userLocation) {
        fetchFacilities(userLocation.lat, userLocation.lng);
    } else {
        fetchFacilities(DEFAULT_LAT, DEFAULT_LNG);
    }
}

function handleOfflineStatus() {
    showErrorToast("You are offline. Some features may not work.");
}