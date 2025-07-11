// Mobile Menu Toggle
const hamburger = document.getElementById('hamburger');
const mobileMenu = document.getElementById('mobile-menu');

// Form elements
const reportForm = document.getElementById('reportForm');
const streetAddressInput = document.getElementById('street-address');
const stateSelect = document.getElementById('state');
const lgaInput = document.getElementById('lga');
const submitButton = document.getElementById('submit-button');
const buttonText = document.getElementById('button-text');
const buttonSpinner = document.getElementById('button-spinner');
const successModal = document.getElementById('success-modal');
const modalClose = document.getElementById('modal-close');
const locationPin = document.querySelector('.location-pin');
const flaggedContainer = document.querySelector('.flagged-container');

// Create hidden fields for coordinates if they don't exist
if (reportForm && !document.getElementById('latitude')) {
    const latInput = document.createElement('input');
    latInput.type = 'hidden';
    latInput.id = 'latitude';
    latInput.name = 'latitude';
    reportForm.appendChild(latInput);

    const lngInput = document.createElement('input');
    lngInput.type = 'hidden';
    lngInput.id = 'longitude';
    lngInput.name = 'longitude';
    reportForm.appendChild(lngInput);
}

// Mobile menu functionality
if (hamburger && mobileMenu) {
    hamburger.addEventListener('click', () => {
        hamburger.classList.toggle('hamburger-active');
        mobileMenu.classList.toggle('hidden');
    });

    document.querySelectorAll('#mobile-menu a').forEach(link => {
        link.addEventListener('click', () => {
            hamburger.classList.remove('hamburger-active');
            mobileMenu.classList.add('hidden');
        });
    });
}

// Smooth scrolling for anchor links
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function(e) {
        e.preventDefault();

        const targetId = this.getAttribute('href');
        if (targetId === '#') return;

        const targetElement = document.querySelector(targetId);
        if (targetElement) {
            window.scrollTo({
                top: targetElement.offsetTop - 80,
                behavior: 'smooth'
            });
        }
    });
});

// Initialize Dropzone for image upload if element exists
if (document.getElementById('image-upload')) {
    Dropzone.autoDiscover = false;
    const myDropzone = new Dropzone("#image-upload", {
        url: "/fake-url",
        paramName: "image",
        maxFiles: 1,
        maxFilesize: 5,
        acceptedFiles: "image/*",
        addRemoveLinks: true,
        autoProcessQueue: false,
        dictDefaultMessage: "",
        dictFileTooBig: "File is too big ({{filesize}}MB). Max filesize: {{maxFilesize}}MB.",
        dictInvalidFileType: "Invalid file type. Only images are allowed.",
        dictRemoveFile: "Remove",
        init: function() {
            this.on("addedfile", function(file) {
                if (this.files.length > 1) {
                    this.removeFile(this.files[0]);
                }
            });

            this.on("removedfile", function() {
                if (document.getElementById('image-data')) {
                    document.getElementById('image-data').value = "";
                }
            });
        }
    });
}

// Enhanced Location Functionality for Nigeria
let isGeolocating = false;
let geolocationWatchId = null;
let map = null;
let marker = null;
const geocodeCache = new Map();

// Initialize the map
function initMap() {
    if (!flaggedContainer) return;

    try {
        if (typeof L === 'undefined') {
            throw new Error('Leaflet library not loaded');
        }

        if (!map) {
            map = L.map(flaggedContainer, {
                center: [7.2556, 5.1933], // Default center near Akure
                zoom: 14,
                zoomControl: false,
                preferCanvas: true
            });

            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            }).addTo(map);

            L.control.zoom({
                position: 'topright'
            }).addTo(map);

            L.control.scale().addTo(map);
        }
    } catch (error) {
        console.error('Map initialization error:', error);
        showPinFeedback('#ef4444', 'Map functionality not available');
        return null;
    }

    return map;
}

// Update location with precise Nigerian address information
async function updateLocation(lat, lng, address = '') {
    if (!map) initMap();

    map.setView([lat, lng], 16);

    if (marker) {
        map.removeLayer(marker);
    }

    marker = L.marker([lat, lng], {
        icon: L.icon({
            iconUrl: 'https://cdn0.iconfinder.com/data/icons/small-n-flat/24/678111-map-marker-512.png',
            iconSize: [32, 32],
            iconAnchor: [16, 32],
            popupAnchor: [0, -32]
        }),
        draggable: true
    }).addTo(map);

    marker.on('dragend', function(e) {
        const newPos = marker.getLatLng();
        document.getElementById('latitude').value = newPos.lat;
        document.getElementById('longitude').value = newPos.lng;
        updateLocationInfo(newPos.lat, newPos.lng, 'Custom location set');
    });

    if (document.getElementById('latitude') && document.getElementById('longitude')) {
        document.getElementById('latitude').value = lat;
        document.getElementById('longitude').value = lng;
    }

    if (address && streetAddressInput) {
        streetAddressInput.value = address;
    }

    updateLocationInfo(lat, lng, address);
}

function updateLocationInfo(lat, lng, address = '') {
    if (flaggedContainer) {
        const infoDiv = flaggedContainer.querySelector('.absolute');
        if (infoDiv) {
            infoDiv.innerHTML = `
                <div class="bg-white p-3 rounded-lg shadow-md">
                    <p class="text-sm font-medium text-gray-700">${address || `Location pinned at:`}</p>
                    ${!address ? `<p class="text-xs font-mono mt-1">Lat: ${lat.toFixed(6)}, Lng: ${lng.toFixed(6)}</p>` : ''}
                    <button id="retry-location" class="mt-2 text-xs bg-primary text-white px-2 py-1 rounded hover:bg-secondary transition">
                        <i class="fas fa-sync-alt mr-1"></i> Relocate
                    </button>
                </div>
            `;

            document.getElementById('retry-location')?.addEventListener('click', getPreciseLocation);
        }
    }
}

// Improved geolocation for Nigeria with better accuracy
async function getPreciseLocation() {
    if (isGeolocating) return;
    isGeolocating = true;

    if (!navigator.geolocation) {
        showPinFeedback('#ef4444', 'Geolocation not supported');
        isGeolocating = false;
        return;
    }

    showPinFeedback('#3b82f6', 'Locating...');

    try {
        const position = await new Promise((resolve, reject) => {
            const options = {
                enableHighAccuracy: true,
                timeout: 15000,
                maximumAge: 0
            };

            if (geolocationWatchId !== null) {
                navigator.geolocation.clearWatch(geolocationWatchId);
            }

            navigator.geolocation.getCurrentPosition(
                pos => {
                    if (geolocationWatchId !== null) {
                        navigator.geolocation.clearWatch(geolocationWatchId);
                        geolocationWatchId = null;
                    }
                    resolve(pos);
                },
                err => {
                    if (geolocationWatchId !== null) {
                        navigator.geolocation.clearWatch(geolocationWatchId);
                        geolocationWatchId = null;
                    }
                    reject(err);
                },
                options
            );

            geolocationWatchId = navigator.geolocation.watchPosition(
                pos => {
                    if (geolocationWatchId !== null) {
                        navigator.geolocation.clearWatch(geolocationWatchId);
                        geolocationWatchId = null;
                    }
                    resolve(pos);
                },
                err => {
                    if (geolocationWatchId !== null) {
                        navigator.geolocation.clearWatch(geolocationWatchId);
                        geolocationWatchId = null;
                    }
                    reject(err);
                },
                options
            );
        });

        await handleNigeriaGeolocationSuccess(position);
    } catch (error) {
        console.error('Geolocation error:', error);
        showPinFeedback('#ef4444', 'Could not get precise location');
    } finally {
        isGeolocating = false;
    }
}

// Nigeria-specific geocoding with improved address parsing
async function handleNigeriaGeolocationSuccess(position) {
    const { latitude, longitude } = position.coords;
    const cacheKey = `${latitude.toFixed(4)},${longitude.toFixed(4)}`;

    if (geocodeCache.has(cacheKey)) {
        const cachedData = geocodeCache.get(cacheKey);
        updateFormWithNigeriaGeocodeData(cachedData, latitude, longitude);
        return;
    }

    try {
        if (!navigator.onLine) {
            updateLocation(latitude, longitude, `Near ${latitude.toFixed(4)}, ${longitude.toFixed(4)}`);
            throw new Error('No internet connection for address lookup');
        }

        // Nigeria-specific geocoding with detailed address components
        const response = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${latitude}&lon=${longitude}&zoom=18&addressdetails=1&countrycodes=ng`
        );
        const data = await response.json();

        // Cache the result
        geocodeCache.set(cacheKey, data);

        updateFormWithNigeriaGeocodeData(data, latitude, longitude);
        showPinFeedback('#10b981', 'Precise location found');
    } catch (error) {
        console.error('Geocoding error:', error);
        updateLocation(latitude, longitude, `Near ${latitude.toFixed(4)}, ${longitude.toFixed(4)}`);
        showPinFeedback('#f59e0b', 'Location found but address lookup failed');
    }
}

// Improved address parsing for Nigerian locations
function updateFormWithNigeriaGeocodeData(data, lat, lng) {
    const address = data.address || {};
    let streetAddress = '';
    let state = '';
    let lga = '';

    // Nigerian address hierarchy
    if (address.road) streetAddress += address.road + ', ';
    if (address.neighbourhood) streetAddress += address.neighbourhood + ', ';
    if (address.suburb) streetAddress += address.suburb + ', ';
    if (address.city) streetAddress += address.city;

    // Special handling for Akure and other Nigerian cities
    if (address.city === 'Akure') {
        state = 'Ondo';
        lga = 'Akure South'; // Default LGA for Akure
        if (address.suburb) {
            // Map specific suburbs to LGAs if needed
            if (address.suburb.includes('Alagbaka')) lga = 'Akure South';
            else if (address.suburb.includes('Oba-Ile')) lga = 'Akure North';
        }
    } else {
        state = address.state || '';
        lga = address.county || address.city || '';
    }

    // Update form fields
    if (state && stateSelect) {
        stateSelect.value = state;
        stateSelect.dispatchEvent(new Event('change'));
    }

    if (lga && lgaInput) {
        lgaInput.value = lga;
    }

    updateLocation(lat, lng, streetAddress || data.display_name);
}

// Visual feedback for pin state
function showPinFeedback(color, message) {
    if (locationPin) {
        locationPin.style.backgroundColor = color;
        locationPin.style.transform = 'scale(1.2)';
        setTimeout(() => {
            if (locationPin) {
                locationPin.style.transform = 'scale(1)';
            }
        }, 300);
    }

    if (flaggedContainer) {
        const infoDiv = flaggedContainer.querySelector('.absolute');
        if (infoDiv && message) {
            const feedback = document.createElement('div');
            feedback.className = 'bg-white p-2 rounded shadow-md text-sm text-center';
            feedback.innerHTML = `<p style="color: ${color}">${message}</p>`;
            infoDiv.appendChild(feedback);

            setTimeout(() => {
                if (infoDiv.contains(feedback)) {
                    infoDiv.removeChild(feedback);
                }
            }, 3000);
        }
    }
}

// Location pin click handler
if (locationPin) {
    locationPin.addEventListener('click', async () => {
        if (!map) initMap();

        if (!confirm("Allow NexaHealth to access your precise location to automatically fill the address fields?")) {
            return;
        }

        await getPreciseLocation();
    });
}

// Handle manual address input with geocoding
if (streetAddressInput) {
    let geocodeTimeout;

    streetAddressInput.addEventListener('input', () => {
        clearTimeout(geocodeTimeout);

        if (streetAddressInput.value.trim().length > 5) {
            geocodeTimeout = setTimeout(() => {
                geocodeNigeriaAddress(streetAddressInput.value);
            }, 1000);
        }
    });
}

// Nigeria-specific address geocoding
async function geocodeNigeriaAddress(address) {
    if (!address || !map) return;

    try {
        const response = await fetch(
            `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}&limit=1&countrycodes=ng`
        );
        const data = await response.json();

        if (data && data.length > 0) {
            const result = data[0];
            // Get detailed address information
            const detailResponse = await fetch(
                `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${result.lat}&lon=${result.lon}&zoom=18&addressdetails=1`
            );
            const detailData = await detailResponse.json();

            updateFormWithNigeriaGeocodeData(detailData, result.lat, result.lon);
            showPinFeedback('#10b981', 'Location updated from address');
        }
    } catch (error) {
        console.error('Geocoding error:', error);
    }
}

// State-LGA relationship for Nigeria
if (stateSelect) {
    stateSelect.addEventListener('change', function() {
        if (lgaInput) {
            if (this.value === "Lagos") {
                lgaInput.placeholder = "e.g. Ikeja, Surulere, Lagos Island";
            } else if (this.value === "Ondo") {
                lgaInput.placeholder = "e.g. Akure South, Akure North";
            } else if (this.value === "Federal Capital Territory") {
                lgaInput.placeholder = "e.g. Municipal, Bwari, Gwagwalada";
            } else {
                lgaInput.placeholder = "e.g. Enter your LGA";
            }
        }
    });
}

// Form submission
if (reportForm) {
    reportForm.addEventListener('submit', async function(e) {
        e.preventDefault();

        // Validate required fields
        const requiredFields = ['drug-name', 'pharmacy-name', 'description', 'state', 'lga'];
        let isValid = true;

        requiredFields.forEach(fieldId => {
            const field = document.getElementById(fieldId);
            if (field && !field.value.trim()) {
                field.classList.add('animate__animated', 'animate__shake');
                setTimeout(() => {
                    if (field) {
                        field.classList.remove('animate__animated', 'animate__shake');
                    }
                }, 1000);
                isValid = false;
            }
        });

        if (!isValid) {
            alert('Please fill in all required fields');
            return;
        }

        // Show loading state
        if (buttonText && buttonSpinner && submitButton) {
            buttonText.textContent = "Submitting...";
            buttonSpinner.classList.remove('hidden');
            submitButton.disabled = true;
        }

        try {
            const formData = new FormData();
            formData.append('drug_name', document.getElementById('drug-name').value.trim());
            formData.append('nafdac_reg_no', document.getElementById('nafdac-number').value.trim());
            formData.append('pharmacy_name', document.getElementById('pharmacy-name').value.trim());
            formData.append('description', document.getElementById('description').value.trim());
            formData.append('state', document.getElementById('state').value);
            formData.append('lga', document.getElementById('lga').value.trim());
            formData.append('street_address', streetAddressInput.value.trim());

            // Add coordinates if available
            const lat = document.getElementById('latitude')?.value;
            const lng = document.getElementById('longitude')?.value;
            if (lat && lng) {
                formData.append('latitude', lat);
                formData.append('longitude', lng);
            }

            // Add image if uploaded
            const dropzone = Dropzone.forElement("#image-upload");
            if (dropzone && dropzone.files.length > 0) {
                formData.append('image', dropzone.files[0]);
            }

            const response = await fetch('https://lyre-4m8l.onrender.com/submit-report', {
                method: 'POST',
                body: formData
            });

            const data = await response.json();

            if (data.status === "success" && successModal) {
                successModal.classList.remove('hidden');
                reportForm.reset();
                if (dropzone) {
                    dropzone.removeAllFiles(true);
                }
                if (document.getElementById('latitude') && document.getElementById('longitude')) {
                    document.getElementById('latitude').value = '';
                    document.getElementById('longitude').value = '';
                }
                // Clear the map
                if (map && marker) {
                    map.removeLayer(marker);
                    marker = null;
                }
            } else {
                throw new Error(data.message || 'Error submitting report');
            }
        } catch (error) {
            console.error("Error:", error);
            alert(`Error: ${error.message}`);
        } finally {
            if (buttonText && buttonSpinner && submitButton) {
                buttonText.textContent = "Submit Report";
                buttonSpinner.classList.add('hidden');
                submitButton.disabled = false;
            }
        }
    });
}

// Close modal
if (modalClose && successModal) {
    modalClose.addEventListener('click', () => {
        successModal.classList.add('hidden');
    });
}

// Remove animation classes after animation completes
document.querySelectorAll('input, select, textarea').forEach(element => {
    element.addEventListener('animationend', () => {
        element.classList.remove('animate__animated', 'animate__shake');
    });
});

// Initialize on page load
document.addEventListener('DOMContentLoaded', function() {
    // Check if Leaflet is loaded
    if (typeof L === 'undefined') {
        console.error('Leaflet library not loaded!');
        showPinFeedback('#ef4444', 'Map features disabled - missing library');
        return;
    }

    // Initialize map but keep it hidden until needed
    initMap();

    // Add click handler to container to make it more user-friendly
    if (flaggedContainer) {
        flaggedContainer.style.cursor = 'pointer';
        flaggedContainer.addEventListener('click', function() {
            if (!map) initMap();
            this.querySelector('.location-pin').click();
        });
    }

    // Add animation to location pin
    if (locationPin) {
        locationPin.style.transition = 'all 0.3s ease';
        locationPin.style.animation = 'pulse-slow 2s infinite';
    }
});