// report.js - Report Page Specific JavaScript

class ReportHandler {
  constructor() {
    this.auth = window.App.Auth;
    this.guestSession = window.App.GuestSession;
    this.map = null;
    this.marker = null;
    this.geocodeCache = new Map();
    this.isGeolocating = false;
    this.geolocationWatchId = null;
  }

  // Initialize report page
  init() {
    // Check if we're on the report page
    if (!document.getElementById('reportForm')) return;

    // Initialize form elements
    this.initForm();
    this.initMap();
    this.initDropzone();
    this.initLocationHandlers();
    this.populateFormFromUrl();
  }

    populateFormFromUrl() {
    const urlParams = new URLSearchParams(window.location.search);
    const drugName = urlParams.get('drug');
    const nafdacNumber = urlParams.get('nafdac');

    if (drugName && document.getElementById('drug-name')) {
      document.getElementById('drug-name').value = drugName;
    }

    if (nafdacNumber && document.getElementById('nafdac-number')) {
      document.getElementById('nafdac-number').value = nafdacNumber;
    }
  }


  // Initialize form elements and handlers
  initForm() {
    this.reportForm = document.getElementById('reportForm');
    this.streetAddressInput = document.getElementById('street-address');
    this.stateSelect = document.getElementById('state');
    this.lgaInput = document.getElementById('lga');
    this.submitButton = document.getElementById('submit-button');
    this.buttonText = document.getElementById('button-text');
    this.buttonSpinner = document.getElementById('button-spinner');
    this.successModal = document.getElementById('success-modal');
    this.modalClose = document.getElementById('modal-close');
    this.locationPin = document.querySelector('.location-pin');
    this.flaggedContainer = document.querySelector('.flagged-container');

    // Create hidden fields for coordinates if they don't exist
    if (this.reportForm && !document.getElementById('latitude')) {
      const latInput = document.createElement('input');
      latInput.type = 'hidden';
      latInput.id = 'latitude';
      latInput.name = 'latitude';
      this.reportForm.appendChild(latInput);

      const lngInput = document.createElement('input');
      lngInput.type = 'hidden';
      lngInput.id = 'longitude';
      lngInput.name = 'longitude';
      this.reportForm.appendChild(lngInput);
    }

    // State-LGA relationship for Nigeria
    if (this.stateSelect) {
      this.stateSelect.addEventListener('change', () => {
        if (this.lgaInput) {
          if (this.stateSelect.value === "Lagos") {
            this.lgaInput.placeholder = "e.g. Ikeja, Surulere, Lagos Island";
          } else if (this.stateSelect.value === "Ondo") {
            this.lgaInput.placeholder = "e.g. Akure South, Akure North";
          } else if (this.stateSelect.value === "Federal Capital Territory") {
            this.lgaInput.placeholder = "e.g. Municipal, Bwari, Gwagwalada";
          } else {
            this.lgaInput.placeholder = "e.g. Enter your LGA";
          }
        }
      });
    }

    // Form submission handler
    if (this.reportForm) {
      this.reportForm.addEventListener('submit', (e) => this.handleFormSubmit(e));
    }

    // Close modal handler
    if (this.modalClose && this.successModal) {
      this.modalClose.addEventListener('click', () => {
        this.successModal.classList.add('hidden');
      });
    }
  }

  // Initialize map functionality
  initMap() {
    if (!this.flaggedContainer) return;

    try {
      if (typeof L === 'undefined') {
        throw new Error('Leaflet library not loaded');
      }

      this.map = L.map(this.flaggedContainer, {
        center: [7.2556, 5.1933], // Default center near Akure
        zoom: 14,
        zoomControl: false,
        preferCanvas: true
      });

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
      }).addTo(this.map);

      L.control.zoom({
        position: 'topright'
      }).addTo(this.map);

      L.control.scale().addTo(this.map);

      // Add click handler to container
      this.flaggedContainer.style.cursor = 'pointer';
      this.flaggedContainer.addEventListener('click', () => {
        if (!confirm("Allow NexaHealth to access your precise location to automatically fill the address fields?")) {
          return;
        }
        this.getPreciseLocation();
      });

    } catch (error) {
      console.error('Map initialization error:', error);
      this.showPinFeedback('#ef4444', 'Map functionality not available');
    }
  }

  // Initialize Dropzone for image upload
  initDropzone() {
    if (!document.getElementById('image-upload')) return;

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

  // Initialize location handlers
  initLocationHandlers() {
    if (this.locationPin) {
      this.locationPin.addEventListener('click', () => this.getPreciseLocation());
    }

    if (this.streetAddressInput) {
      let geocodeTimeout;
      this.streetAddressInput.addEventListener('input', () => {
        clearTimeout(geocodeTimeout);
        if (this.streetAddressInput.value.trim().length > 5) {
          geocodeTimeout = setTimeout(() => {
            this.geocodeNigeriaAddress(this.streetAddressInput.value);
          }, 1000);
        }
      });
    }
  }

  // Handle form submission
  async handleFormSubmit(e) {
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
    if (this.buttonText && this.buttonSpinner && this.submitButton) {
      this.buttonText.textContent = "Submitting...";
      this.buttonSpinner.classList.remove('hidden');
      this.submitButton.disabled = true;
    }

    try {
      const formData = new FormData();
      formData.append('drug_name', document.getElementById('drug-name').value.trim());
      formData.append('nafdac_reg_no', document.getElementById('nafdac-number').value.trim());
      formData.append('pharmacy_name', document.getElementById('pharmacy-name').value.trim());
      formData.append('description', document.getElementById('description').value.trim());
      formData.append('state', document.getElementById('state').value);
      formData.append('lga', document.getElementById('lga').value.trim());
      formData.append('street_address', this.streetAddressInput.value.trim());

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

      if (data.status === "success" && this.successModal) {
        this.successModal.classList.remove('hidden');
        this.reportForm.reset();
        if (dropzone) {
          dropzone.removeAllFiles(true);
        }
        if (document.getElementById('latitude') && document.getElementById('longitude')) {
          document.getElementById('latitude').value = '';
          document.getElementById('longitude').value = '';
        }
        // Clear the map
        if (this.map && this.marker) {
          this.map.removeLayer(this.marker);
          this.marker = null;
        }
      } else {
        throw new Error(data.message || 'Error submitting report');
      }
    } catch (error) {
      console.error("Error:", error);
      alert(`Error: ${error.message}`);
    } finally {
      if (this.buttonText && this.buttonSpinner && this.submitButton) {
        this.buttonText.textContent = "Submit Report";
        this.buttonSpinner.classList.add('hidden');
        this.submitButton.disabled = false;
      }
    }
  }

  // Improved geolocation for Nigeria with better accuracy
  async getPreciseLocation() {
    if (this.isGeolocating) return;
    this.isGeolocating = true;

    if (!navigator.geolocation) {
      this.showPinFeedback('#ef4444', 'Geolocation not supported');
      this.isGeolocating = false;
      return;
    }

    this.showPinFeedback('#3b82f6', 'Locating...');

    try {
      const position = await new Promise((resolve, reject) => {
        const options = {
          enableHighAccuracy: true,
          timeout: 15000,
          maximumAge: 0
        };

        if (this.geolocationWatchId !== null) {
          navigator.geolocation.clearWatch(this.geolocationWatchId);
        }

        navigator.geolocation.getCurrentPosition(
          pos => {
            if (this.geolocationWatchId !== null) {
              navigator.geolocation.clearWatch(this.geolocationWatchId);
              this.geolocationWatchId = null;
            }
            resolve(pos);
          },
          err => {
            if (this.geolocationWatchId !== null) {
              navigator.geolocation.clearWatch(this.geolocationWatchId);
              this.geolocationWatchId = null;
            }
            reject(err);
          },
          options
        );

        this.geolocationWatchId = navigator.geolocation.watchPosition(
          pos => {
            if (this.geolocationWatchId !== null) {
              navigator.geolocation.clearWatch(this.geolocationWatchId);
              this.geolocationWatchId = null;
            }
            resolve(pos);
          },
          err => {
            if (this.geolocationWatchId !== null) {
              navigator.geolocation.clearWatch(this.geolocationWatchId);
              this.geolocationWatchId = null;
            }
            reject(err);
          },
          options
        );
      });

      await this.handleNigeriaGeolocationSuccess(position);
    } catch (error) {
      console.error('Geolocation error:', error);
      this.showPinFeedback('#ef4444', 'Could not get precise location');
    } finally {
      this.isGeolocating = false;
    }
  }

  // Nigeria-specific geocoding with improved address parsing
  async handleNigeriaGeolocationSuccess(position) {
    const { latitude, longitude } = position.coords;
    const cacheKey = `${latitude.toFixed(4)},${longitude.toFixed(4)}`;

    if (this.geocodeCache.has(cacheKey)) {
      const cachedData = this.geocodeCache.get(cacheKey);
      this.updateFormWithNigeriaGeocodeData(cachedData, latitude, longitude);
      return;
    }

    try {
      if (!navigator.onLine) {
        this.updateLocation(latitude, longitude, `Near ${latitude.toFixed(4)}, ${longitude.toFixed(4)}`);
        throw new Error('No internet connection for address lookup');
      }

      // Nigeria-specific geocoding with detailed address components
      const response = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${latitude}&lon=${longitude}&zoom=18&addressdetails=1&countrycodes=ng`
      );
      const data = await response.json();

      // Cache the result
      this.geocodeCache.set(cacheKey, data);

      this.updateFormWithNigeriaGeocodeData(data, latitude, longitude);
      this.showPinFeedback('#10b981', 'Precise location found');
    } catch (error) {
      console.error('Geocoding error:', error);
      this.updateLocation(latitude, longitude, `Near ${latitude.toFixed(4)}, ${longitude.toFixed(4)}`);
      this.showPinFeedback('#f59e0b', 'Location found but address lookup failed');
    }
  }

  // Update location with precise Nigerian address information
  updateLocation(lat, lng, address = '') {
    if (!this.map) this.initMap();

    this.map.setView([lat, lng], 16);

    if (this.marker) {
      this.map.removeLayer(this.marker);
    }

    this.marker = L.marker([lat, lng], {
      icon: L.icon({
        iconUrl: 'https://cdn0.iconfinder.com/data/icons/small-n-flat/24/678111-map-marker-512.png',
        iconSize: [32, 32],
        iconAnchor: [16, 32],
        popupAnchor: [0, -32]
      }),
      draggable: true
    }).addTo(this.map);

    this.marker.on('dragend', (e) => {
      const newPos = this.marker.getLatLng();
      document.getElementById('latitude').value = newPos.lat;
      document.getElementById('longitude').value = newPos.lng;
      this.updateLocationInfo(newPos.lat, newPos.lng, 'Custom location set');
    });

    if (document.getElementById('latitude') && document.getElementById('longitude')) {
      document.getElementById('latitude').value = lat;
      document.getElementById('longitude').value = lng;
    }

    if (address && this.streetAddressInput) {
      this.streetAddressInput.value = address;
    }

    this.updateLocationInfo(lat, lng, address);
  }

  // Improved address parsing for Nigerian locations
  updateFormWithNigeriaGeocodeData(data, lat, lng) {
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
    if (state && this.stateSelect) {
      this.stateSelect.value = state;
      this.stateSelect.dispatchEvent(new Event('change'));
    }

    if (lga && this.lgaInput) {
      this.lgaInput.value = lga;
    }

    this.updateLocation(lat, lng, streetAddress || data.display_name);
  }

  // Nigeria-specific address geocoding
  async geocodeNigeriaAddress(address) {
    if (!address || !this.map) return;

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

        this.updateFormWithNigeriaGeocodeData(detailData, result.lat, result.lon);
        this.showPinFeedback('#10b981', 'Location updated from address');
      }
    } catch (error) {
      console.error('Geocoding error:', error);
    }
  }

  // Update location info display
  updateLocationInfo(lat, lng, address = '') {
    if (this.flaggedContainer) {
      const infoDiv = this.flaggedContainer.querySelector('.absolute');
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

        document.getElementById('retry-location')?.addEventListener('click', () => this.getPreciseLocation());
      }
    }
  }

  // Visual feedback for pin state
  showPinFeedback(color, message) {
    if (this.locationPin) {
      this.locationPin.style.backgroundColor = color;
      this.locationPin.style.transform = 'scale(1.2)';
      setTimeout(() => {
        if (this.locationPin) {
          this.locationPin.style.transform = 'scale(1)';
        }
      }, 300);
    }

    if (this.flaggedContainer) {
      const infoDiv = this.flaggedContainer.querySelector('.absolute');
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
}

// Initialize the report page
document.addEventListener('DOMContentLoaded', () => {
  const reportHandler = new ReportHandler();
  reportHandler.init();
});