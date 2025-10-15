// saas-report.js - Pharmacy Report Submission with Beautiful Modal
document.addEventListener('DOMContentLoaded', function() {
    if (!document.getElementById('report-form')) {
        return; // Skip initialization if not on report page
    }
    
    // DOM Elements
    const reportForm = document.getElementById('report-form');
    const fileUploadArea = document.getElementById('file-upload-area');
    const fileInput = document.getElementById('file-input');
    const filePreview = document.getElementById('file-preview');
    const locationTypeSelect = document.querySelector('select[name="location_type"]');
    const pharmacyDetails = document.getElementById('pharmacy-details');
    const tabMyReports = document.getElementById('tab-my-reports');
    const tabReportsAgainst = document.getElementById('tab-reports-against');
    const myReportsContent = document.getElementById('content-my-reports');
    const reportsAgainstContent = document.getElementById('content-reports-against');

    // Token configuration
    const TOKEN_KEYS = [
        'nexahealth_pharmacy_token',
        'access_token'
    ];

    // API Configuration
    const API_BASE_URL = 'https://lyre-4m8l.onrender.com/pharmacy';
    const REQUEST_TIMEOUT = 30000; // 30 seconds for file uploads

    // Initialize
    initializeReportSystem();

    function initializeReportSystem() {
        setupEventListeners();
        checkAuthentication();
        loadReportDataFromStorage();
    }

    function setupEventListeners() {
        // Form submission
        reportForm.addEventListener('submit', handleReportSubmit);
        
        // Tab switching
        tabMyReports.addEventListener('click', switchToMyReports);
        tabReportsAgainst.addEventListener('click', switchToReportsAgainst);
        
        // Location type change
        locationTypeSelect.addEventListener('change', handleLocationTypeChange);
        
        // File upload functionality
        setupFileUpload();
    }

    function getAuthToken() {
        for (const k of TOKEN_KEYS) {
            const v = sessionStorage.getItem(k) || localStorage.getItem(k);
            if (v) return v;
        }
        return null;
    }

    function isAuthenticated() {
        return !!getAuthToken();
    }

    function checkAuthentication() {
        if (!isAuthenticated()) {
            showAlert('Please log in to submit reports', 'error');
            setTimeout(() => {
                window.location.href = 'index.html';
            }, 2000);
            return false;
        }
        return true;
    }

    async function makeAuthenticatedRequest(endpoint, options = {}) {
        const url = `${API_BASE_URL}${endpoint}`;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

        try {
            const token = getAuthToken();
            if (!token) {
                throw new Error('No authentication token found');
            }

            const defaultHeaders = {
                'Authorization': `Bearer ${token}`
            };

            // Don't set Content-Type for FormData - let browser set it with boundary
            if (!(options.body instanceof FormData)) {
                defaultHeaders['Content-Type'] = 'application/json';
            }

            const response = await fetch(url, {
                ...options,
                headers: {
                    ...defaultHeaders,
                    ...options.headers
                },
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            // Handle token expiration
            if (response.status === 401) {
                clearAuth();
                throw new Error('Session expired. Please login again.');
            }

            return response;

        } catch (error) {
            clearTimeout(timeoutId);
            if (error.name === 'AbortError') {
                throw new Error('Request timeout. Please check your connection.');
            }
            throw error;
        }
    }

    function clearAuth() {
        TOKEN_KEYS.forEach(key => {
            sessionStorage.removeItem(key);
            localStorage.removeItem(key);
        });
    }

    function loadReportDataFromStorage() {
        const reportData = localStorage.getItem('pharmacyDrugReport');
        if (reportData) {
            try {
                const data = JSON.parse(reportData);
                populateFormFromData(data);
                localStorage.removeItem('pharmacyDrugReport'); // Clear after loading
            } catch (e) {
                console.error('Error loading report data:', e);
            }
        }
    }

    function populateFormFromData(data) {
        if (data.drugName) {
            document.querySelector('input[name="drug_name"]').value = data.drugName;
        }
        if (data.nafdacNumber) {
            document.querySelector('input[name="nafdac_reg_no"]').value = data.nafdacNumber;
        }
        if (data.manufacturer) {
            document.querySelector('input[name="manufacturer"]').value = data.manufacturer;
        }
    }

    function setupFileUpload() {
        // Click to upload
        fileUploadArea.addEventListener('click', () => {
            fileInput.click();
        });

        // Drag and drop
        fileUploadArea.addEventListener('dragover', (e) => {
            e.preventDefault();
            fileUploadArea.classList.add('dragover');
        });

        fileUploadArea.addEventListener('dragleave', () => {
            fileUploadArea.classList.remove('dragover');
        });

        fileUploadArea.addEventListener('drop', (e) => {
            e.preventDefault();
            fileUploadArea.classList.remove('dragover');
            if (e.dataTransfer.files.length) {
                fileInput.files = e.dataTransfer.files;
                handleFiles(e.dataTransfer.files);
            }
        });

        // File input change
        fileInput.addEventListener('change', (e) => {
            handleFiles(e.target.files);
        });
    }

    function handleFiles(files) {
        filePreview.innerHTML = '';
        filePreview.classList.remove('hidden');
        
        // Limit to 3 files
        const validFiles = Array.from(files).slice(0, 3);
        
        for (let i = 0; i < validFiles.length; i++) {
            const file = validFiles[i];
            if (file.type.startsWith('image/')) {
                const reader = new FileReader();
                reader.onload = (e) => {
                    const previewItem = document.createElement('div');
                    previewItem.className = 'relative';
                    previewItem.innerHTML = `
                        <img src="${e.target.result}" class="w-full h-24 object-cover rounded-lg">
                        <button type="button" class="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs">
                            <i class="fas fa-times"></i>
                        </button>
                    `;
                    previewItem.querySelector('button').addEventListener('click', () => {
                        previewItem.remove();
                        updateFileInputAfterRemoval(i);
                        if (filePreview.children.length === 0) {
                            filePreview.classList.add('hidden');
                        }
                    });
                    filePreview.appendChild(previewItem);
                };
                reader.readAsDataURL(file);
            }
        }
        
        // Re-attach files to 'images' key (just to be safe)
        const dt = new DataTransfer();
        Array.from(fileInput.files).forEach(file => dt.items.add(file));
        for (let i = 0; i < dt.files.length; i++) {
            formData.append('images', dt.files[i]);
        }

    }

    function updateFileInputAfterRemoval(index) {
        const dt = new DataTransfer();
        const files = Array.from(fileInput.files);
        files.splice(index, 1);
        files.forEach(file => dt.items.add(file));
        fileInput.files = dt.files;
    }

    function handleLocationTypeChange() {
        if (this.value === 'other_pharmacy') {
            pharmacyDetails.classList.remove('hidden');
        } else {
            pharmacyDetails.classList.add('hidden');
        }
    }

    function switchToMyReports() {
        myReportsContent.classList.remove('hidden');
        reportsAgainstContent.classList.add('hidden');
        tabMyReports.classList.add('text-blue-600', 'border-blue-600', 'border-b-2');
        tabMyReports.classList.remove('text-gray-500');
        tabReportsAgainst.classList.remove('text-blue-600', 'border-blue-600', 'border-b-2');
        tabReportsAgainst.classList.add('text-gray-500');
    }

    function switchToReportsAgainst() {
        myReportsContent.classList.add('hidden');
        reportsAgainstContent.classList.remove('hidden');
        tabReportsAgainst.classList.add('text-blue-600', 'border-blue-600', 'border-b-2');
        tabReportsAgainst.classList.remove('text-gray-500');
        tabMyReports.classList.remove('text-blue-600', 'border-blue-600', 'border-b-2');
        tabMyReports.classList.add('text-gray-500');
    }

    async function handleReportSubmit(e) {
        e.preventDefault();
        
        if (!checkAuthentication()) {
            return;
        }

        // Validate form
        if (!validateForm()) {
            return;
        }

        try {
            showLoadingState();
            
            const formData = new FormData(reportForm);
            
            // Log form data for debugging
            console.log('Submitting pharmacy report with data:', {
                issue_type: formData.get('issue_type'),
                drug_name: formData.get('drug_name'),
                location_type: formData.get('location_type'),
                is_anonymous: formData.get('is_anonymous')
            });

            const response = await makeAuthenticatedRequest('/reports/submit', {
                method: 'POST',
                body: formData
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.detail || `Report submission failed with status ${response.status}`);
            }

            const data = await response.json();
            showSuccessState(data);

        } catch (error) {
            console.error('Report submission error:', error);
            showErrorState('Submission Failed', error.message || 'Unable to submit report. Please try again.');
        }
    }

    function validateForm() {
        const requiredFields = reportForm.querySelectorAll('[required]');
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
            showAlert('Please fill all required fields', 'error');
            return false;
        }

        // Validate location-specific requirements
        const locationType = document.querySelector('select[name="location_type"]').value;
        if (locationType === 'other_pharmacy') {
            const pharmacyName = document.querySelector('input[name="pharmacy_name"]');
            if (!pharmacyName.value.trim()) {
                pharmacyName.classList.add('border-red-500');
                pharmacyName.focus();
                showAlert('Pharmacy name is required when reporting about another pharmacy', 'error');
                return false;
            }
        }

        return true;
    }

    function showLoadingState() {
        const submitButton = reportForm.querySelector('button[type="submit"]');
        submitButton.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i> Submitting Report...';
        submitButton.disabled = true;
    }

    function showSuccessState(data) {
        const submitButton = reportForm.querySelector('button[type="submit"]');
        submitButton.innerHTML = '<i class="fas fa-check mr-2"></i> Report Submitted!';
        submitButton.disabled = true;
        
        // Show the beautiful modal
        showReportSuccessModal();
        
        // Reset form after modal is shown
        setTimeout(() => {
            reportForm.reset();
            filePreview.classList.add('hidden');
            filePreview.innerHTML = '';
            fileInput.files = new DataTransfer().files;
            submitButton.innerHTML = '<i class="fas fa-paper-plane mr-2"></i> Submit Report';
            submitButton.disabled = false;
            pharmacyDetails.classList.add('hidden');
        }, 2000);
    }

    function showErrorState(title, message) {
        const submitButton = reportForm.querySelector('button[type="submit"]');
        submitButton.innerHTML = '<i class="fas fa-paper-plane mr-2"></i> Submit Report';
        submitButton.disabled = false;
        
        showAlert(message, 'error');
    }

    function showAlert(message, type = 'info') {
        // Create alert element
        const alert = document.createElement('div');
        alert.className = `fixed top-4 right-4 px-6 py-4 rounded-lg shadow-lg text-white z-50 transform transition-all duration-300 ${
            type === 'error' ? 'bg-red-500' : 
            type === 'success' ? 'bg-green-500' : 'bg-blue-500'
        }`;
        
        alert.innerHTML = `
            <div class="flex items-center justify-between">
                <div class="flex items-center">
                    <i class="fas ${
                        type === 'error' ? 'fa-exclamation-circle' : 
                        type === 'success' ? 'fa-check-circle' : 'fa-info-circle'
                    } mr-2"></i>
                    <span>${message}</span>
                </div>
                <button class="ml-4 text-white hover:text-white/80 focus:outline-none" onclick="this.parentElement.parentElement.remove()">
                    <i class="fas fa-times"></i>
                </button>
            </div>
        `;

        // Remove any existing alerts
        const existingAlerts = document.querySelectorAll('.fixed.top-4.right-4');
        existingAlerts.forEach(alert => alert.remove());

        // Add to DOM
        document.body.appendChild(alert);

        // Auto-remove after delay
        setTimeout(() => {
            if (alert.parentElement) {
                alert.remove();
            }
        }, type === 'error' ? 8000 : 5000);
    }

    // Global modal functions
    window.showReportSuccessModal = function() {
        const modal = document.getElementById('reportSuccessModal');
        modal.classList.remove('hidden');
        
        // Trigger reflow
        modal.offsetHeight;
        
        // Show modal with animation
        setTimeout(() => {
            modal.classList.add('show');
            
            // Animate checkmark
            setTimeout(() => {
                const checkmark = document.getElementById('successCheckmark');
                if (checkmark) {
                    checkmark.classList.add('scale-100');
                }
            }, 400);
        }, 50);
    };
    
    window.closeReportSuccessModal = function() {
        const modal = document.getElementById('reportSuccessModal');
        modal.classList.remove('show');
        
        setTimeout(() => {
            modal.classList.add('hidden');
        }, 300);
    };
    
    window.submitAnotherReport = function() {
        closeReportSuccessModal();
        // Reset form and focus on first field
        setTimeout(() => {
            const reportForm = document.getElementById('report-form');
            if (reportForm) {
                reportForm.reset();
                const firstInput = reportForm.querySelector('input, select, textarea');
                if (firstInput) {
                    firstInput.focus();
                }
            }
        }, 350);
    };

    // Close modal when clicking outside
    document.getElementById('reportSuccessModal')?.addEventListener('click', function(e) {
        if (e.target === this) {
            closeReportSuccessModal();
        }
    });

    // Close modal with Escape key
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            closeReportSuccessModal();
        }
    });

    // Make functions available globally if needed
    window.PharmacyReport = {
        submitReport: handleReportSubmit,
        clearForm: () => {
            reportForm.reset();
            filePreview.classList.add('hidden');
            filePreview.innerHTML = '';
            fileInput.files = new DataTransfer().files;
            pharmacyDetails.classList.add('hidden');
        }
    };
});