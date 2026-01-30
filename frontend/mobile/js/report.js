// List of Nigerian states
const nigerianStates = [
    "Abia", "Adamawa", "Akwa Ibom", "Anambra", "Bauchi", "Bayelsa", 
    "Benue", "Borno", "Cross River", "Delta", "Ebonyi", "Edo", 
    "Ekiti", "Enugu", "FCT", "Gombe", "Imo", "Jigawa", 
    "Kaduna", "Kano", "Katsina", "Kebbi", "Kogi", "Kwara", 
    "Lagos", "Nasarawa", "Niger", "Ogun", "Ondo", "Osun", 
    "Oyo", "Plateau", "Rivers", "Sokoto", "Taraba", "Yobe", 
    "Zamfara"
];

// Load drug data from localStorage when page loads
document.addEventListener('DOMContentLoaded', function() {
    // Populate state dropdowns
    populateStateDropdowns();
    
    // First check for localStorage data
    const drugData = loadDrugDataFromStorage();
    if (drugData && drugData.drugName) {
        populateForms(drugData);
        document.getElementById('scanned-drug-info').classList.remove('hidden');
    }
    
    // Then check URL parameters (for backward compatibility)
    const urlParams = new URLSearchParams(window.location.search);
    const scannedDrug = urlParams.get('scanned_drug');
    
    if (scannedDrug && !drugData) {
        try {
            const drugData = JSON.parse(decodeURIComponent(scannedDrug));
            if (drugData.drugName) {
                populateForms(drugData);
                document.getElementById('scanned-drug-info').classList.remove('hidden');
            }
        } catch (e) {
            console.error('Error parsing scanned drug data:', e);
        }
    }
    
    // Tab switching
    document.getElementById('pqc-tab').addEventListener('click', function() {
        this.classList.add('active');
        document.getElementById('ae-tab').classList.remove('active');
        document.getElementById('pqc-form').classList.remove('hidden');
        document.getElementById('ae-form').classList.add('hidden');
    });
    
    document.getElementById('ae-tab').addEventListener('click', function() {
        this.classList.add('active');
        document.getElementById('pqc-tab').classList.remove('active');
        document.getElementById('ae-form').classList.remove('hidden');
        document.getElementById('pqc-form').classList.add('hidden');
    });
    
    // Image upload handling
    setupImageUpload('pqc-images', 'pqc-image-preview', 'pqc-upload-container');
    setupImageUpload('ae-images', 'ae-image-preview', 'ae-upload-container');
    
    // Location detection buttons
    setupLocationDetection('pqc-location-btn', 'pqc-state', 'pqc-lga');
    setupLocationDetection('ae-location-btn', 'ae-state', 'ae-lga');
    setupAddressDetection('pqc-address-btn', 'pqc-street-address');
    
    // Form submission
    document.getElementById('pqc-form').addEventListener('submit', function(e) {
        e.preventDefault();
        submitReport('pqc');
    });
    
    document.getElementById('ae-form').addEventListener('submit', function(e) {
        e.preventDefault();
        submitReport('ae');
    });
    
    // Modal close
    document.getElementById('modal-close').addEventListener('click', function() {
        document.getElementById('success-modal').classList.add('hidden');
        window.location.href = 'dashboard.html';
    });
    
    // Change drug button
    document.getElementById('change-drug').addEventListener('click', function() {
        document.getElementById('scanned-drug-info').classList.add('hidden');
        clearDrugFields();
    });
});

function populateStateDropdowns() {
    const stateSelects = document.querySelectorAll('select[id$="-state"]');
    stateSelects.forEach(select => {
        // Clear existing options except the first one
        while (select.options.length > 1) {
            select.remove(1);
        }
        
        // Add Nigerian states
        nigerianStates.forEach(state => {
            const option = document.createElement('option');
            option.value = state;
            option.textContent = state;
            select.appendChild(option);
        });
    });
}

function loadDrugDataFromStorage() {
    const drugDataString = localStorage.getItem('reportDrugData');
    if (drugDataString) {
        try {
            const drugData = JSON.parse(drugDataString);
            return drugData;
        } catch (e) {
            console.error('Error parsing drug data:', e);
            return null;
        }
    }
    return null;
}

function populateForms(drugData) {
    // Populate PQC form
    document.getElementById('pqc-drug-name').value = drugData.drugName || '';
    document.getElementById('pqc-nafdac-no').value = drugData.nafdacNumber || '';
    document.getElementById('pqc-manufacturer').value = drugData.manufacturer || '';
    
    // Populate AE form
    document.getElementById('ae-drug-name').value = drugData.drugName || '';
    document.getElementById('ae-nafdac-no').value = drugData.nafdacNumber || '';
    document.getElementById('ae-manufacturer').value = drugData.manufacturer || '';
    
    // Update scanned drug info display
    document.getElementById('scanned-drug-name').textContent = drugData.drugName || 'Unknown Drug';
    document.getElementById('scanned-drug-manufacturer').textContent = drugData.manufacturer || 'Manufacturer not specified';
    document.getElementById('scanned-drug-nafdac').textContent = drugData.nafdacNumber ? `NAFDAC: ${drugData.nafdacNumber}` : '';
}

function clearDrugFields() {
    // Clear PQC form drug fields
    document.getElementById('pqc-drug-name').value = '';
    document.getElementById('pqc-nafdac-no').value = '';
    document.getElementById('pqc-manufacturer').value = '';
    
    // Clear AE form drug fields
    document.getElementById('ae-drug-name').value = '';
    document.getElementById('ae-nafdac-no').value = '';
    document.getElementById('ae-manufacturer').value = '';
}

function setupImageUpload(inputId, previewId, containerId) {
    const input = document.getElementById(inputId);
    const preview = document.getElementById(previewId);
    const container = document.getElementById(containerId);
    
    if (!input || !preview || !container) return;
    
    // Click on container triggers file input
    container.addEventListener('click', function() {
        input.click();
    });
    
    input.addEventListener('change', function() {
        preview.innerHTML = '';
        preview.classList.add('hidden');
        
        if (this.files && this.files.length > 0) {
            // Limit to 3 files
            if (this.files.length > 3) {
                alert('You can only upload up to 3 images');
                this.value = ''; // Clear the input
                return;
            }
            
            preview.classList.remove('hidden');
            
            for (let i = 0; i < this.files.length; i++) {
                const reader = new FileReader();
                reader.onload = function(e) {
                    const imgContainer = document.createElement('div');
                    imgContainer.className = 'relative w-20 h-20 rounded-lg overflow-hidden';
                    
                    const img = document.createElement('img');
                    img.src = e.target.result;
                    img.className = 'w-full h-full object-cover image-preview';
                    
                    const removeBtn = document.createElement('button');
                    removeBtn.className = 'absolute top-1 right-1 bg-white rounded-full w-5 h-5 flex items-center justify-center text-red-500 shadow-sm';
                    removeBtn.innerHTML = '<i class="fas fa-times text-xs"></i>';
                    removeBtn.addEventListener('click', function(e) {
                        e.stopPropagation();
                        imgContainer.remove();
                        if (preview.children.length === 0) {
                            preview.classList.add('hidden');
                        }
                        // Create new FileList without the removed file
                        const dt = new DataTransfer();
                        for (let j = 0; j < input.files.length; j++) {
                            if (j !== i) {
                                dt.items.add(input.files[j]);
                            }
                        }
                        input.files = dt.files;
                    });
                    
                    imgContainer.appendChild(img);
                    imgContainer.appendChild(removeBtn);
                    preview.appendChild(imgContainer);
                };
                reader.readAsDataURL(this.files[i]);
            }
        }
    });
}

function setupLocationDetection(buttonId, stateFieldId, lgaFieldId) {
    const button = document.getElementById(buttonId);
    const stateField = document.getElementById(stateFieldId);
    const lgaField = document.getElementById(lgaFieldId);
    
    if (!button || !stateField) return;
    
    button.addEventListener('click', function() {
        if (navigator.geolocation) {
            button.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i> Detecting...';
            button.disabled = true;
            
            navigator.geolocation.getCurrentPosition(
                async function(position) {
                    try {
                        // Use OpenStreetMap Nominatim API for reverse geocoding
                        const response = await fetch(
                            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${position.coords.latitude}&lon=${position.coords.longitude}`
                        );
                        
                        if (!response.ok) {
                            throw new Error('Geocoding failed');
                        }
                        
                        const data = await response.json();
                        
                        // Extract state from address
                        const state = data.address.state || data.address.region;
                        if (state) {
                            stateField.value = state;
                            
                            // Try to set LGA if available
                            if (lgaField && data.address.county) {
                                lgaField.value = data.address.county;
                            }
                            
                            button.innerHTML = '<i class="fas fa-location-arrow mr-2"></i> Detect';
                            button.disabled = false;
                        } else {
                            throw new Error('Could not determine state');
                        }
                    } catch (error) {
                        console.error('Geocoding error:', error);
                        button.innerHTML = '<i class="fas fa-location-arrow mr-2"></i> Detect';
                        button.disabled = false;
                        alert('Could not detect your location. Please select manually.');
                    }
                },
                function(error) {
                    console.error('Geolocation error:', error);
                    button.innerHTML = '<i class="fas fa-location-arrow mr-2"></i> Detect';
                    button.disabled = false;
                    alert('Could not detect your location. Please select manually.');
                }
            );
        } else {
            alert('Geolocation is not supported by your browser');
        }
    });
}

function setupAddressDetection(buttonId, addressFieldId) {
    const button = document.getElementById(buttonId);
    const addressField = document.getElementById(addressFieldId);
    
    if (!button || !addressField) return;
    
    button.addEventListener('click', function() {
        if (navigator.geolocation) {
            button.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i> Detecting...';
            button.disabled = true;
            
            navigator.geolocation.getCurrentPosition(
                async function(position) {
                    try {
                        // Use OpenStreetMap Nominatim API for reverse geocoding
                        const response = await fetch(
                            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${position.coords.latitude}&lon=${position.coords.longitude}`
                        );
                        
                        if (!response.ok) {
                            throw new Error('Geocoding failed');
                        }
                        
                        const data = await response.json();
                        
                        // Construct address string
                        let address = '';
                        if (data.address.road) address += data.address.road + ', ';
                        if (data.address.suburb) address += data.address.suburb + ', ';
                        if (data.address.city) address += data.address.city;
                        
                        if (address) {
                            addressField.value = address;
                            button.innerHTML = '<i class="fas fa-location-arrow mr-2"></i> Detect';
                            button.disabled = false;
                        } else {
                            throw new Error('Could not determine address');
                        }
                    } catch (error) {
                        console.error('Geocoding error:', error);
                        button.innerHTML = '<i class="fas fa-location-arrow mr-2"></i> Detect';
                        button.disabled = false;
                        alert('Could not detect your address. Please enter manually.');
                    }
                },
                function(error) {
                    console.error('Geolocation error:', error);
                    button.innerHTML = '<i class="fas fa-location-arrow mr-2"></i> Detect';
                    button.disabled = false;
                    alert('Could not detect your address. Please enter manually.');
                }
            );
        } else {
            alert('Geolocation is not supported by your browser');
        }
    });
}

async function submitReport(type) {
    // Only get the form that's being submitted
    const form = document.getElementById(`${type}-form`);
    if (!form) {
        console.error('Form not found');
        return;
    }

    const formData = new FormData(form);
    const submitBtn = form.querySelector('button[type="submit"]');
    if (!submitBtn) {
        console.error('Submit button not found');
        return;
    }

    const originalText = submitBtn.innerHTML;
    
    try {
        // Show loading state
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i> Submitting...';
        submitBtn.disabled = true;
        
        // Validate only the current form's required fields
        const requiredFields = form.querySelectorAll('[required]');
        let firstInvalidField = null;
        
        requiredFields.forEach(field => {
            if (!field.value.trim()) {
                field.classList.add('border-red-500');
                if (!firstInvalidField) firstInvalidField = field;
            } else {
                field.classList.remove('border-red-500');
            }
        });
        
        if (firstInvalidField) {
            firstInvalidField.focus();
            throw new Error('Please fill all required fields');
        }

        // Prepare request data ONLY for the current form
        const requestData = {
            drug_name: formData.get('drug_name')?.toString().trim() || '',
            pharmacy_name: formData.get('pharmacy_name')?.toString().trim() || '',
            state: formData.get('state')?.toString().trim() || '',
            lga: formData.get('lga')?.toString().trim() || '',
            is_anonymous: formData.get('is_anonymous') === 'on',
            nafdac_reg_no: formData.get('nafdac_reg_no')?.toString().trim() || null,
            manufacturer: formData.get('manufacturer')?.toString().trim() || null,
            street_address: formData.get('street_address')?.toString().trim() || null,
            report_type: type === 'pqc' ? 'product_quality_complaint' : 'adverse_event'
        };

        // Add type-specific fields
        if (type === 'ae') {
            requestData.severity = formData.get('severity')?.toString().trim().toLowerCase() || 'moderate';
            requestData.reaction_description = formData.get('reaction_description')?.toString().trim() || '';
            requestData.symptoms = formData.get('symptoms')?.toString().trim() || '';
            requestData.medical_history = formData.get('medical_history')?.toString().trim() || null;
            
            // Handle datetime
            try {
                const onsetInput = formData.get('onset_datetime');
                if (!onsetInput) throw new Error('Onset datetime is required');
                
                const onsetDate = new Date(onsetInput);
                if (isNaN(onsetDate.getTime())) throw new Error('Invalid date format');
                
                requestData.onset_datetime = onsetDate.toISOString();
            } catch (e) {
                console.error('Datetime error:', e);
                throw new Error('Please enter a valid date and time');
            }
        } else if (type === 'pqc') {
            requestData.issue_type = formData.get('issue_type')?.toString().trim() || '';
            requestData.description = formData.get('description')?.toString().trim() || '';
        }

        // Create FormData
        const requestFormData = new FormData();
        for (const [key, value] of Object.entries(requestData)) {
            if (value !== null && value !== undefined) {
                requestFormData.append(key, value);
            }
        }

        // Debug: Log what's being sent
        console.log('Submitting:', {
            type,
            data: Object.fromEntries(requestFormData.entries())
        });

                // Get access token from AuthService
        const accessToken = window.App?.Auth?.getAccessToken?.();

        if (!accessToken) {
            alert("Your session has expired. Please log in again.");
            window.location.href = 'login.html';
            return;
        }
        const endpoint = `https://nexahealth-backend-production.up.railway.app/reports/submit-${type}`;
        // Send the request with Authorization header
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`
            },
            body: requestFormData
        });


        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.detail || `Server error: ${response.status}`);
        }

        const result = await response.json();
        
        // Show success
        document.getElementById('success-modal').classList.remove('hidden');
        if (result.report_id) {
            localStorage.setItem('lastReportId', result.report_id);
        }

    } catch (error) {
        console.error('Submission error:', error);
        alert(`Submission failed: ${error.message}`);
    } finally {
        submitBtn.innerHTML = originalText;
        submitBtn.disabled = false;
    }
}