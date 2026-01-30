// saas-profile.js - Pharmacy Profile Management
class PharmacyProfileService {
    constructor() {
        this.API_BASE_URL = 'https://nexahealth-backend-production.up.railway.app/pharmacy';
        this.PROFILE_DATA_KEY = 'nexahealth_pharmacy_profile';
        this.hasUnsavedChanges = false;
        this.saveTimeout = null;
        this.isEditMode = false;
        
        // Editable elements mapping
        this.editableElements = [
            'pharmacyName', 'establishedYear', 'phoneNumber', 
            'address', 'aboutPharmacy', 'licenseNumber', 'openingHours'
        ];
        
        // Field mapping for backend
        this.fieldMapping = {
            'pharmacyName': 'pharmacy_name',
            'establishedYear': 'established_year', 
            'phoneNumber': 'phone_number',
            'emailAddress': 'email',
            'address': 'address',
            'aboutPharmacy': 'about_pharmacy',
            'licenseNumber': 'license_number',
            'openingHours': 'opening_hours'
        };
    }

    // Initialize profile service
    init() {
        this._checkAuthentication();
        this._setupEventListeners();
        this._setupUIInteractions();
        this.loadProfileData();
        
        console.log('Pharmacy Profile Service initialized');
    }

    // Check authentication
    _checkAuthentication() {
        const token = localStorage.getItem('nexahealth_pharmacy_token') 
           || sessionStorage.getItem('nexahealth_pharmacy_token');
        if (!token) {
            this.showAlert('Please log in to access your profile', 'error');
            setTimeout(() => {
                window.location.href = 'saas-entry.html';
            }, 2000);
            return false;
        }
        return true;
    }

    // Setup event listeners
    _setupEventListeners() {
        // Edit Profile Button
        const editProfileBtn = document.getElementById('editProfileBtn');
        if (editProfileBtn) {
            editProfileBtn.addEventListener('click', () => this.toggleEditMode());
        }

        // Publish Profile Button
        const publishProfileBtn = document.getElementById('publishProfileBtn');
        if (publishProfileBtn) {
            publishProfileBtn.addEventListener('click', () => this.publishProfile());
        }

        // Change Logo Button
        const changeLogoBtn = document.getElementById('changeLogoBtn');
        if (changeLogoBtn) {
            changeLogoBtn.addEventListener('click', () => this.handleLogoChange());
        }

        // Complete Profile Button
        const completeProfileBtn = document.querySelector('.gradient-hover.py-2');
        if (completeProfileBtn) {
            completeProfileBtn.addEventListener('click', () => this.enableEditMode());
        }

        // Input event listeners for auto-save
        this.editableElements.forEach(id => {
            const element = document.getElementById(id);
            if (element) {
                element.addEventListener('input', () => this.handleInputChange());
            }
        });

        // Pharmacy name change for initials
        const pharmacyNameInput = document.getElementById('pharmacyName');
        if (pharmacyNameInput) {
            pharmacyNameInput.addEventListener('input', () => this.updatePharmacyInitials());
        }
    }

    // Setup UI interactions
    _setupUIInteractions() {
        // Activity stat hover effects
        document.querySelectorAll('.activity-stat').forEach(stat => {
            stat.addEventListener('mouseenter', () => {
                stat.style.transform = 'translateY(-4px)';
            });
            
            stat.addEventListener('mouseleave', () => {
                stat.style.transform = 'translateY(0)';
            });
        });

        // Info item click effects
        document.querySelectorAll('.info-item').forEach(item => {
            item.addEventListener('click', () => {
                item.style.backgroundColor = 'rgba(30, 64, 175, 0.1)';
                setTimeout(() => {
                    item.style.backgroundColor = '';
                }, 300);
            });
        });
    }

    // Toggle edit mode
    toggleEditMode() {
        this.isEditMode = !this.isEditMode;
        
        // Toggle edit mode for all fields
        this.editableElements.forEach(id => {
            const element = document.getElementById(id);
            if (element) {
                element.readOnly = !this.isEditMode;
                if (this.isEditMode) {
                    element.classList.add('editable-field');
                } else {
                    element.classList.remove('editable-field');
                }
            }
        });
        
        // Update button text and style
        const editProfileBtn = document.getElementById('editProfileBtn');
        if (editProfileBtn) {
            if (this.isEditMode) {
                editProfileBtn.innerHTML = '<i class="fas fa-save mr-2"></i> Save Changes';
                editProfileBtn.classList.remove('gradient-border', 'text-primary-blue');
                editProfileBtn.classList.add('bg-green-600', 'text-white');
            } else {
                editProfileBtn.innerHTML = '<i class="fas fa-edit mr-2"></i> Edit Profile';
                editProfileBtn.classList.add('gradient-border', 'text-primary-blue');
                editProfileBtn.classList.remove('bg-green-600', 'text-white');
                
                // Save changes when exiting edit mode
                this.saveChangesToBackend();
            }
        }
    }

    // Enable edit mode (for Complete Profile button)
    enableEditMode() {
        if (!this.isEditMode) {
            this.toggleEditMode();
        }
    }

    // Handle input changes for auto-save
    handleInputChange() {
        this.hasUnsavedChanges = true;
        clearTimeout(this.saveTimeout);
        this.saveTimeout = setTimeout(() => {
            if (this.hasUnsavedChanges && !this.isEditMode) {
                this.saveChangesToBackend();
            }
        }, 2000);
        
        this.updateProfileCompleteness();
    }

    // Update pharmacy initials
    updatePharmacyInitials() {
        const name = document.getElementById('pharmacyName')?.value.trim();
        const initials = name ? name.split(' ').map(word => word.charAt(0)).join('').toUpperCase() : 'PH';
        const initialsElement = document.getElementById('pharmacyInitials');
        if (initialsElement) {
            initialsElement.textContent = initials.substring(0, 2) || 'PH';
        }
    }

    // Save changes to backend
    async saveChangesToBackend() {
        if (!this.hasUnsavedChanges) return;
        
        try {
            const profileData = this.collectProfileData();
            const response = await this.makeAuthenticatedRequest('/profile/', {
                method: 'PUT',
                body: JSON.stringify(profileData)
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const result = await response.json();
            
            // Show save indicator
            this.showSaveIndicator();
            
            this.hasUnsavedChanges = false;
            console.log('Profile saved to backend:', result);
            
            // Update completeness from backend response
            this.updateProfileCompletenessFromBackend(result.profile_completeness);
            
        } catch (error) {
            console.error('Error saving profile:', error);
            this.showAlert('Error saving profile. Please try again.', 'error');
        }
    }

    // Collect profile data from form
    collectProfileData() {
        const data = {};

        this.editableElements.forEach(frontendField => {
            const backendField = this.fieldMapping[frontendField];
            const element = document.getElementById(frontendField);

            if (element && backendField) {
                let value = element.value.trim();

                // Skip empty fields entirely → avoid 422
                if (!value) return;

                // Handle date correctly
                if (backendField === 'established_year') {
                    const parsedDate = new Date(value);
                    if (!isNaN(parsedDate.getTime())) {
                        data[backendField] = parsedDate.getFullYear();  // ✅ FIXED
                    }
                    return;
                }

                // Regular fields
                data[backendField] = value;
}

        });

        console.log("FINAL PAYLOAD SENT:", data);
        return data;
    }


    // Publish profile
    async publishProfile() {
        if (!confirm('Are you sure you want to publish your profile? This will make it visible to the public.')) {
            return;
        }

        try {
            const response = await this.makeAuthenticatedRequest('/profile/publish', {
                method: 'POST'
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.detail || 'Publishing failed');
            }

            const result = await response.json();
            this.showAlert('Profile published successfully!', 'success');
            console.log('Profile published:', result);
            
            // Update UI to reflect published status
            this.updatePublishButton(true);
            
        } catch (error) {
            console.error('Error publishing profile:', error);
            this.showAlert(`Error publishing profile: ${error.message}`, 'error');
        }
    }

    // Unpublish profile
    async unpublishProfile() {
        try {
            const response = await this.makeAuthenticatedRequest('/profile/unpublish', {
                method: 'POST'
            });

            if (response.ok) {
                this.showAlert('Profile unpublished successfully!', 'success');
                this.updatePublishButton(false);
            }
        } catch (error) {
            console.error('Error unpublishing profile:', error);
            this.showAlert('Error unpublishing profile', 'error');
        }
    }

    // Load profile data
    async loadProfileData() {
        try {
            const response = await this.makeAuthenticatedRequest('/profile/');
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const profileData = await response.json();
            this.populateFormFields(profileData);
            this.updateUIFromProfileData(profileData);
            
        } catch (error) {
            console.error('Error loading profile from backend:', error);
            this.loadFromLocalStorage();
        }
    }

    // Populate form fields with profile data
    populateFormFields(profileData) {
        // Map backend fields to frontend elements
        Object.keys(this.fieldMapping).forEach(frontendField => {
            const backendField = this.fieldMapping[frontendField];
            const element = document.getElementById(frontendField);
            
            if (element && profileData[backendField] !== undefined) {
                element.value = profileData[backendField] || '';
            }
        });
    }

    // Update UI from profile data
    updateUIFromProfileData(profileData) {
        // Update pharmacy initials
        const name = profileData.pharmacy_name || 'Your Pharmacy Name';
        const initials = name.split(' ').map(word => word.charAt(0)).join('').toUpperCase();
        const initialsElement = document.getElementById('pharmacyInitials');
        if (initialsElement) {
            initialsElement.textContent = initials.substring(0, 2) || 'PH';
        }
        
        // Update verification status
        this.updateVerificationStatus(profileData.status);
        
        // Update profile completeness
        this.updateProfileCompletenessFromBackend(profileData.profile_completeness);
        
        // Update activity stats
        this.updateActivityStats(profileData);
        
        // Update published status
        this.updatePublishButton(profileData.is_published);

        // Update "Partner since" field
        const establishedInput = document.getElementById('establishedYear');
        if (establishedInput && profileData.created_at) {
            const createdDate = new Date(profileData.created_at);
            const options = { month: 'short', year: 'numeric' };
            establishedInput.value = createdDate.toLocaleDateString(undefined, options);
        }

    }

    // Update verification status
    updateVerificationStatus(status) {
        const statusElement = document.querySelector('.font-medium.text-yellow-700');
        const badgeElement = document.querySelector('.status-pending');
        
        if (status === 'verified' && statusElement && badgeElement) {
            statusElement.textContent = 'Verified';
            statusElement.className = 'font-medium text-green-700';
            badgeElement.innerHTML = '<i class="fas fa-check mr-1"></i> Verified';
            badgeElement.className = 'px-3 py-1 rounded-full text-xs font-semibold bg-green-500 text-white';
            
            // Update last verified date
            const lastVerifiedElement = document.querySelector('.flex.items-center.justify-between.p-4.bg-blue-50.rounded-xl:last-child .font-medium');
            if (lastVerifiedElement) {
                lastVerifiedElement.textContent = new Date().toLocaleDateString();
            }
        }
    }

    // Update profile completeness from backend
    updateProfileCompletenessFromBackend(completenessPercentage) {
        const progressBar = document.querySelector('.gradient-bg.h-2');
        const percentageText = document.querySelector('.text-gray-600:first-child');
        const statusText = document.querySelector('.text-primary-blue.font-medium');
        
        if (progressBar) {
            progressBar.style.width = `${completenessPercentage}%`;
        }
        if (percentageText) {
            percentageText.textContent = `${completenessPercentage}% Complete`;
        }
        if (statusText) {
            // Update status text based on percentage
            if (completenessPercentage === 0) {
                statusText.textContent = 'Begin';
            } else if (completenessPercentage < 50) {
                statusText.textContent = 'In Progress';
            } else if (completenessPercentage < 100) {
                statusText.textContent = 'Good';
            } else {
                statusText.textContent = 'Complete';
            }
        }
        
        this.updateFieldCompletionStatus();
    }

    // Update profile completeness (frontend calculation)
    updateProfileCompleteness() {
        let completedFields = 0;
        
        this.editableElements.forEach(id => {
            const element = document.getElementById(id);
            if (element && element.value.trim() !== '') {
                completedFields++;
            }
        });
        
        const completenessPercentage = Math.round((completedFields / this.editableElements.length) * 100);
        
        // Update progress bar
        const progressBar = document.querySelector('.gradient-bg.h-2');
        if (progressBar) {
            progressBar.style.width = `${completenessPercentage}%`;
        }
        
        // Update percentage text
        const percentageText = document.querySelector('.text-gray-600:first-child');
        if (percentageText) {
            percentageText.textContent = `${completenessPercentage}% Complete`;
        }
        
        // Update status text
        const statusText = document.querySelector('.text-primary-blue.font-medium');
        if (statusText) {
            if (completenessPercentage === 0) {
                statusText.textContent = 'Begin';
            } else if (completenessPercentage < 50) {
                statusText.textContent = 'In Progress';
            } else if (completenessPercentage < 100) {
                statusText.textContent = 'Good';
            } else {
                statusText.textContent = 'Complete';
            }
        }
        
        this.updateFieldCompletionStatus();
    }

    // Update individual field completion status
    updateFieldCompletionStatus() {
        const completionItems = document.querySelectorAll('.space-y-2 .flex.items-center');
        completionItems.forEach((item, index) => {
            if (index < this.editableElements.length) {
                const fieldId = this.editableElements[index];
                const element = document.getElementById(fieldId);
                const icon = item.querySelector('i');
                const status = item.querySelector('.text-green-500, .text-red-500');
                
                if (element && element.value.trim() !== '') {
                    if (icon) icon.className = 'fas fa-check text-green-500 mr-2';
                    if (status) {
                        status.textContent = 'Complete';
                        status.className = 'text-green-500';
                    }
                } else {
                    if (icon) icon.className = 'fas fa-times text-red-500 mr-2';
                    if (status) {
                        status.textContent = 'Incomplete';
                        status.className = 'text-red-500';
                    }
                }
            }
        });
    }

    // Update activity stats
    updateActivityStats(profileData) {
        const totalVerifications = profileData.total_verifications || 0;
        const totalReports = profileData.total_reports || 0;
        
        const verificationElement = document.querySelector('.activity-stat:first-child .text-2xl');
        const reportsElement = document.querySelector('.activity-stat:last-child .text-2xl');
        
        if (verificationElement) verificationElement.textContent = totalVerifications;
        if (reportsElement) reportsElement.textContent = totalReports;
    }

    // Update publish button state
    updatePublishButton(isPublished) {
        const publishBtn = document.getElementById('publishProfileBtn');
        if (!publishBtn) return;
        
        if (isPublished) {
            publishBtn.innerHTML = '<i class="fas fa-check mr-2"></i> Published';
            publishBtn.classList.remove('bg-green-600', 'hover:bg-green-700');
            publishBtn.classList.add('bg-blue-600', 'hover:bg-blue-700');
            
            // Change click handler to unpublish
            publishBtn.onclick = () => this.unpublishProfile();
        } else {
            publishBtn.innerHTML = '<i class="fas fa-globe mr-2"></i> Publish Profile';
            publishBtn.classList.remove('bg-blue-600', 'hover:bg-blue-700');
            publishBtn.classList.add('bg-green-600', 'hover:bg-green-700');
            
            // Change click handler to publish
            publishBtn.onclick = () => this.publishProfile();
        }
    }

    // Handle logo change
    handleLogoChange() {
        // This would typically open a file picker and upload the logo
        this.showAlert('Logo upload functionality would be implemented here', 'info');
    }

    // Load from localStorage fallback
    loadFromLocalStorage() {
        const savedData = localStorage.getItem(this.PROFILE_DATA_KEY);
        if (savedData) {
            const profileData = JSON.parse(savedData);
            this.populateFormFields(profileData);
            this.updateProfileCompleteness();
        }
    }

    // Save to localStorage
    saveToLocalStorage() {
        const profileData = this.collectProfileData();
        localStorage.setItem(this.PROFILE_DATA_KEY, JSON.stringify(profileData));
    }

    // Show save indicator
    showSaveIndicator() {
        const saveIndicator = document.getElementById('saveIndicator');
        if (saveIndicator) {
            saveIndicator.classList.add('show');
            setTimeout(() => {
                saveIndicator.classList.remove('show');
            }, 3000);
        }
    }

    // Make authenticated request
    async makeAuthenticatedRequest(endpoint, options = {}) {
        // Use the global auth service if available
        if (window.makeAuthenticatedRequest) {
            return await window.makeAuthenticatedRequest(endpoint, options);
        }
        
        // Fallback implementation
        const token = localStorage.getItem('nexahealth_pharmacy_token');
        if (!token) {
            throw new Error('No authentication token available');
        }

        const url = `${this.API_BASE_URL}${endpoint}`;
        const defaultOptions = {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            }
        };

        const mergedOptions = { ...defaultOptions, ...options };
        
        return await fetch(url, mergedOptions);
    }

    // Show alert messages (compatible with auth service)
    showAlert(message, type = 'info') {
        // Use global auth service alert if available
        if (window.PharmacyAuth && window.PharmacyAuth.showAlert) {
            window.PharmacyAuth.showAlert(message, type);
            return;
        }

        // Fallback alert implementation
        const alert = document.createElement('div');
        alert.className = `fixed top-4 right-4 px-6 py-4 rounded-lg shadow-lg text-white z-50 ${
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
                <button class="ml-4 text-white hover:text-white/80" onclick="this.parentElement.parentElement.remove()">
                    <i class="fas fa-times"></i>
                </button>
            </div>
        `;

        document.body.appendChild(alert);
        setTimeout(() => alert.remove(), 5000);
    }

    // Get profile completeness details
    async getProfileCompletenessDetails() {
        try {
            const response = await this.makeAuthenticatedRequest('/profile/completeness');
            if (response.ok) {
                return await response.json();
            }
        } catch (error) {
            console.error('Error getting completeness details:', error);
        }
        return null;
    }
}

// Initialize the profile service when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    // Create global profile service instance
    window.PharmacyProfile = new PharmacyProfileService();
    window.PharmacyProfile.init();

    console.log('Pharmacy Profile management initialized');
});

// Global utility functions
window.refreshProfileData = async () => {
    if (window.PharmacyProfile) {
        await window.PharmacyProfile.loadProfileData();
    }
};

window.toggleProfileEdit = () => {
    if (window.PharmacyProfile) {
        window.PharmacyProfile.toggleEditMode();
    }
};