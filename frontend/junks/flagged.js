document.addEventListener('DOMContentLoaded', function() {
    // Mobile Menu Toggle
    const hamburger = document.getElementById('hamburger');
    const mobileMenu = document.getElementById('mobile-menu');

    if (hamburger && mobileMenu) {
        hamburger.addEventListener('click', () => {
            hamburger.classList.toggle('hamburger-active');
            mobileMenu.classList.toggle('hidden');
        });

        // Close mobile menu when clicking a link
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

    // Initialize Main Map (Flagged Pharmacies)
    let mainMap = null;
    let pharmacyIcon = null;

    function initializeMainMap() {
        if (!mainMap) {
            mainMap = L.map('pharmacy-map', {
                preferCanvas: true,
                fadeAnimation: false,
                zoomControl: false
            }).setView([9.0820, 8.6753], 6); // Center on Nigeria

            L.control.zoom({
                position: 'topright'
            }).addTo(mainMap);

            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
                maxZoom: 19,
                reuseTiles: true,
                updateWhenIdle: true
            }).addTo(mainMap);

            // Add a scale control
            L.control.scale().addTo(mainMap);

            pharmacyIcon = L.icon({
                iconUrl: 'https://cdn0.iconfinder.com/data/icons/small-n-flat/24/678111-map-marker-512.png',
                iconSize: [32, 32],
                iconAnchor: [16, 32],
                popupAnchor: [0, -32]
            });
        }
        return mainMap;
    }

    // Current page and search state
    let currentPage = 1;
    let currentSearchParams = {};
    let currentView = 'flagged'; // 'flagged' or 'all'

    // Nearby Pharmacies Functionality
    const getLocationBtn = document.getElementById('get-location-btn');
    const locationPermission = document.getElementById('location-permission');
    const locationError = document.getElementById('location-error');
    const loadingSpinner = document.getElementById('loading-spinner');
    const nearbyResults = document.getElementById('nearby-results');
    const mapContainer = document.getElementById('map-container');
    const nearbyMapElement = document.getElementById('nearby-map');
    const showMapBtn = document.getElementById('show-map-btn');

    let nearbyMap = null;
    let userLocation = null;
    let nearbyPlaces = [];

    if (getLocationBtn) {
        getLocationBtn.addEventListener('click', getNearbyPharmacies);
    }

    if (showMapBtn) {
        showMapBtn.addEventListener('click', toggleMap);
    }

    // Tab switching functionality
    document.getElementById('flagged-tab')?.addEventListener('click', () => {
        currentView = 'flagged';
        document.getElementById('flagged-tab').classList.add('text-primary', 'border-primary');
        document.getElementById('flagged-tab').classList.remove('text-gray-500');
        document.getElementById('all-reports-tab').classList.add('text-gray-500');
        document.getElementById('all-reports-tab').classList.remove('text-primary', 'border-primary');
        fetchFlaggedPharmacies(1);
    });

    document.getElementById('all-reports-tab')?.addEventListener('click', () => {
        currentView = 'all';
        document.getElementById('all-reports-tab').classList.add('text-primary', 'border-primary');
        document.getElementById('all-reports-tab').classList.remove('text-gray-500');
        document.getElementById('flagged-tab').classList.add('text-gray-500');
        document.getElementById('flagged-tab').classList.remove('text-primary', 'border-primary');
        fetchFlaggedPharmacies(1);
    });

    // Image viewer modal
    function showImageModal(imageUrl) {
        const modal = document.createElement('div');
        modal.className = 'fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4';
        modal.innerHTML = `
            <div class="relative max-w-4xl w-full">
                <button class="absolute -top-12 right-0 text-white text-3xl hover:text-gray-300">&times;</button>
                <img src="${imageUrl}" alt="Report evidence" class="max-h-screen w-full object-contain">
            </div>
        `;
        document.body.appendChild(modal);

        modal.querySelector('button').addEventListener('click', () => {
            modal.remove();
        });
    }

    // Main function to fetch and display data
    function fetchFlaggedPharmacies(page = 1) {
        currentPage = page;
        const pharmacyResults = document.getElementById('pharmacy-results');
        if (!pharmacyResults) return;

        // Get search parameters from form
        currentSearchParams = {
            pharmacy: document.getElementById('pharmacy-search').value,
            state: document.getElementById('state-filter').value,
            lga: document.getElementById('lga-filter').value,
            drug: document.getElementById('drug-filter').value,
            sort_by: document.getElementById('sort-by').value,
            sort_order: document.getElementById('sort-order').value,
            limit: document.getElementById('per-page').value || '10' // Default to 10 if not set
        };

        // Show loading state
        pharmacyResults.innerHTML = `
            <div class="col-span-full animate-pulse">
                <div class="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
                <div class="h-4 bg-gray-200 rounded w-1/2"></div>
            </div>
        `;

        // Build query parameters
        const params = new URLSearchParams();
        if (currentSearchParams.pharmacy) params.append('pharmacy', currentSearchParams.pharmacy);
        if (currentSearchParams.state) params.append('state', currentSearchParams.state);
        if (currentSearchParams.lga) params.append('lga', currentSearchParams.lga);
        if (currentSearchParams.drug) params.append('drug', currentSearchParams.drug);
        params.append('sort_by', currentSearchParams.sort_by);
        params.append('sort_order', currentSearchParams.sort_order);
        params.append('page', currentPage);
        params.append('limit', currentSearchParams.limit);

        // Fetch data from API with search parameters
        fetch(`https://lyre-4m8l.onrender.com/get-flagged?${params.toString()}`)
            .then(response => {
                if (!response.ok) {
                    throw new Error('Network response was not ok');
                }
                return response.json();
            })
            .then(data => {
                // Update the results with real data
                pharmacyResults.innerHTML = '';

                if (currentView === 'flagged') {
                    // Initialize map only when needed and only once
                    if (!mainMap) {
                        initializeMainMap();
                    }

                    // Clear existing markers from map more efficiently
                    if (mainMap && mainMap.eachLayer) {
                        mainMap.eachLayer(layer => {
                            if (layer instanceof L.Marker) {
                                mainMap.removeLayer(layer);
                            }
                        });
                    }

                    // Flagged pharmacies view - horizontal cards
                    if (data.flagged_pharmacies && data.flagged_pharmacies.length > 0) {
                        // Create a marker cluster group for better performance
                        const markerClusterGroup = L.markerClusterGroup({
                            spiderfyOnMaxZoom: true,
                            showCoverageOnHover: false,
                            zoomToBoundsOnClick: true,
                            chunkedLoading: true,
                            chunkInterval: 100
                        });

                        data.flagged_pharmacies.forEach(pharmacy => {
                            let drugsList = '';
                            if (pharmacy.drugs && pharmacy.drugs.length > 0) {
                                pharmacy.drugs.forEach(drug => {
                                    drugsList += `<span class="inline-block bg-red-100 text-red-800 text-xs px-2 py-1 rounded-full mr-1 mb-1">${drug}</span>`;
                                });
                            }

                            const card = document.createElement('div');
                            card.className = 'bg-white rounded-xl shadow-md overflow-hidden border border-gray-100 hover:shadow-lg transition-all';
                            card.innerHTML = `
                                <div class="p-6">
                                    <div class="flex justify-between items-start">
                                        <h3 class="text-lg font-bold">${pharmacy.pharmacy}</h3>
                                        <span class="px-2 py-1 rounded-full bg-red-100 text-red-800 font-medium text-sm">${pharmacy.report_count} reports</span>
                                    </div>
                                    <div class="mt-2">
                                        <p class="text-gray-600 text-sm">
                                            <i class="fas fa-map-marker-alt text-gray-500 mr-1"></i>
                                            ${pharmacy.street_address || 'Address not available'}, ${pharmacy.lga || 'N/A'}, ${pharmacy.state || 'N/A'}
                                        </p>
                                    </div>
                                    <div class="mt-3">
                                        <p class="text-sm font-medium">Flagged Drugs:</p>
                                        <div class="flex flex-wrap mt-1">${drugsList || 'No drugs listed'}</div>
                                    </div>
                                    <div class="mt-4 pt-4 border-t border-gray-100">
                                        <button class="w-full text-sm bg-primary text-white px-4 py-2 rounded-lg hover:bg-secondary transition view-pharmacy-details" data-pharmacy="${encodeURIComponent(pharmacy.pharmacy)}">
                                            View Details
                                        </button>
                                    </div>
                                </div>
                            `;
                            pharmacyResults.appendChild(card);

                            // Add markers to the cluster group if coordinates exist
                            if (pharmacy.lat && pharmacy.lng) {
                                const marker = L.marker([pharmacy.lat, pharmacy.lng], {icon: pharmacyIcon});

                                let drugsList = '';
                                if (pharmacy.drugs && pharmacy.drugs.length > 0) {
                                    pharmacy.drugs.forEach(drug => {
                                        drugsList += `<span class="badge bg-red-100 text-red-800">${drug}</span>`;
                                    });
                                }

                                marker.bindPopup(`
                                    <h3>${pharmacy.pharmacy}</h3>
                                    <p><strong>Location:</strong> ${pharmacy.street_address || 'N/A'}, ${pharmacy.lga || 'N/A'}, ${pharmacy.state || 'N/A'}</p>
                                    <p><strong>Reports:</strong> ${pharmacy.report_count}</p>
                                    <div class="mt-2">
                                        <p class="font-medium">Flagged Drugs:</p>
                                        <div class="mt-1">${drugsList || 'None'}</div>
                                    </div>
                                    <div class="mt-3 text-center">
                                        <button class="text-sm bg-primary text-white px-3 py-1 rounded hover:bg-secondary transition view-pharmacy-details" data-pharmacy="${encodeURIComponent(pharmacy.pharmacy)}">
                                            View Details
                                        </button>
                                    </div>
                                `);

                                markerClusterGroup.addLayer(marker);
                            }
                        });

                        // Add the cluster group to the map
                        if (mainMap) {
                            mainMap.addLayer(markerClusterGroup);

                            // Fit bounds to show all markers if we have any
                            if (data.flagged_pharmacies.some(p => p.lat && p.lng)) {
                                const markerBounds = markerClusterGroup.getBounds();
                                if (markerBounds.isValid()) {
                                    mainMap.fitBounds(markerBounds, {padding: [50, 50]});
                                }
                            }
                        }
                    } else {
                        pharmacyResults.innerHTML = `
                            <div class="col-span-full text-center py-12 text-gray-500">
                                No flagged pharmacies found matching your search criteria
                            </div>
                        `;
                    }
                } else {
                    // All reports view - horizontal cards
                    if (data.all_reports && data.all_reports.length > 0) {
                        data.all_reports.forEach(report => {
                            const card = document.createElement('div');
                            card.className = 'bg-white rounded-xl shadow-md overflow-hidden border border-gray-100 hover:shadow-lg transition-all';
                            card.innerHTML = `
                                <div class="p-6">
                                    <div class="flex justify-between items-start">
                                        <h3 class="text-lg font-bold">${report.pharmacy_name || 'N/A'}</h3>
                                        <span class="text-xs text-gray-500">${new Date(report.timestamp).toLocaleDateString()}</span>
                                    </div>
                                    <div class="mt-2">
                                        <p class="font-medium">${report.drug_name || 'N/A'}</p>
                                        ${report.nafdac_reg_no ? `<p class="text-xs text-gray-500">NAFDAC: ${report.nafdac_reg_no}</p>` : ''}
                                    </div>
                                    <div class="mt-2">
                                        <p class="text-sm text-gray-600">
                                            <i class="fas fa-map-marker-alt text-gray-500 mr-1"></i>
                                            ${report.street_address || 'Address not available'}, ${report.lga || 'N/A'}, ${report.state || 'N/A'}
                                        </p>
                                    </div>
                                    <div class="mt-3">
                                        <p class="text-sm text-gray-700 truncate">${report.description || 'No description'}</p>
                                    </div>
                                    <div class="mt-4 pt-4 border-t border-gray-100 flex justify-between items-center">
                                        ${report.image_url ? `
                                            <button class="text-sm text-primary hover:text-secondary font-medium view-report-image" data-url="${report.image_url}">
                                                View Image
                                            </button>
                                        ` : '<span class="text-sm text-gray-500">No image</span>'}
                                        <span class="text-xs text-gray-500">${new Date(report.timestamp).toLocaleTimeString()}</span>
                                    </div>
                                </div>
                            `;
                            pharmacyResults.appendChild(card);

                            // Add event listeners for image viewing
                            card.querySelector('.view-report-image')?.addEventListener('click', function() {
                                const imageUrl = this.getAttribute('data-url');
                                showImageModal(imageUrl);
                            });
                        });
                    } else {
                        pharmacyResults.innerHTML = `
                            <div class="col-span-full text-center py-12 text-gray-500">
                                No reports found matching your search criteria
                            </div>
                        `;
                    }
                }

                // Update summary stats and show count of results
                if (data.summary) {
                    document.getElementById('total-pharmacies').textContent = data.summary.total_flagged_pharmacies || '0';
                    document.getElementById('total-reports').textContent = data.summary.total_reports || '0';

                    if (data.summary.top_drugs && data.summary.top_drugs.length > 0) {
                        document.getElementById('top-drug').textContent = data.summary.top_drugs[0].drug_name || 'None';
                    }

                    // Update pagination info
                    const totalFiltered = currentView === 'flagged' ? (data.total_filtered || 0) : (data.all_reports?.length || 0);
                    const limit = parseInt(currentSearchParams.limit) || 10;
                    const start = (currentPage - 1) * limit + 1;
                    const end = Math.min(start + limit - 1, totalFiltered);

                    document.getElementById('pagination-info').innerHTML = `
                        Showing <span class="font-medium">${start}</span> to <span class="font-medium">${end}</span> of <span class="font-medium">${totalFiltered}</span> results
                    `;

                    // Update pagination buttons
                    updatePaginationButtons(totalFiltered, currentPage, limit);
                }
            })
            .catch(error => {
                console.error('Error fetching data:', error);
                pharmacyResults.innerHTML = `
                    <div class="col-span-full text-center py-12 text-red-500">
                        Error loading data. Please try again later.
                    </div>
                `;
            });
    }

    function updatePaginationButtons(totalItems, currentPage, itemsPerPage) {
        const totalPages = Math.ceil(totalItems / itemsPerPage);
        const pageNumbers = document.getElementById('page-numbers');
        const prevPage = document.getElementById('prev-page');
        const nextPage = document.getElementById('prev-page-mobile');
        const nextPageMobile = document.getElementById('next-page-mobile');
        const prevPageMobile = document.getElementById('prev-page');

        // Clear existing page numbers
        pageNumbers.innerHTML = '';

        // Disable/enable previous buttons
        if (currentPage <= 1) {
            prevPage?.classList.add('opacity-50', 'cursor-not-allowed');
            prevPageMobile?.classList.add('opacity-50', 'cursor-not-allowed');
            if (prevPage) prevPage.disabled = true;
            if (prevPageMobile) prevPageMobile.disabled = true;
        } else {
            prevPage?.classList.remove('opacity-50', 'cursor-not-allowed');
            prevPageMobile?.classList.remove('opacity-50', 'cursor-not-allowed');
            if (prevPage) prevPage.disabled = false;
            if (prevPageMobile) prevPageMobile.disabled = false;
        }

        // Disable/enable next buttons
        if (currentPage >= totalPages) {
            nextPage?.classList.add('opacity-50', 'cursor-not-allowed');
            nextPageMobile?.classList.add('opacity-50', 'cursor-not-allowed');
            if (nextPage) nextPage.disabled = true;
            if (nextPageMobile) nextPageMobile.disabled = true;
        } else {
            nextPage?.classList.remove('opacity-50', 'cursor-not-allowed');
            nextPageMobile?.classList.remove('opacity-50', 'cursor-not-allowed');
            if (nextPage) nextPage.disabled = false;
            if (nextPageMobile) nextPageMobile.disabled = false;
        }

        // Show page numbers (up to 5 pages around current page)
        const maxVisiblePages = 5;
        let startPage = Math.max(1, currentPage - Math.floor(maxVisiblePages / 2));
        let endPage = Math.min(totalPages, startPage + maxVisiblePages - 1);

        if (endPage - startPage + 1 < maxVisiblePages) {
            startPage = Math.max(1, endPage - maxVisiblePages + 1);
        }

        for (let i = startPage; i <= endPage; i++) {
            const pageButton = document.createElement('button');
            pageButton.className = `relative inline-flex items-center px-4 py-2 border text-sm font-medium ${
                i === currentPage 
                    ? 'bg-primary border-primary text-white' 
                    : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
            }`;
            pageButton.textContent = i;
            pageButton.addEventListener('click', () => fetchFlaggedPharmacies(i));
            pageNumbers.appendChild(pageButton);
        }
    }

    function fetchPharmacyDetails(pharmacyName) {
        // Fetch detailed reports for a specific pharmacy
        fetch(`https://lyre-4m8l.onrender.com/get-flagged/${encodeURIComponent(pharmacyName)}/reports`)
            .then(response => {
                if (!response.ok) {
                    throw new Error('Network response was not ok');
                }
                return response.json();
            })
            .then(data => {
                // Here you would show the detailed reports in a modal or new page
                console.log('Pharmacy details:', data);
                alert(`Showing ${data.report_count} reports for ${pharmacyName}`);
                // In a real app, you would display this data properly
            })
            .catch(error => {
                console.error('Error fetching pharmacy details:', error);
                alert(`Error loading details for ${pharmacyName}`);
            });
    }

    function getNearbyPharmacies() {
        // Reset UI
        locationPermission.classList.add('hidden');
        locationError.classList.add('hidden');
        loadingSpinner.classList.remove('hidden');
        nearbyResults.innerHTML = '';

        // Show progress indicator on mobile
        if (/Mobi|Android/i.test(navigator.userAgent)) {
            document.getElementById('loading-progress')?.classList.remove('hidden');
        }

        // Check if geolocation is supported
        if (!navigator.geolocation) {
            showError('Geolocation not supported', 'Your browser does not support geolocation. Please try a different browser.');
            loadingSpinner.classList.add('hidden');
            document.getElementById('loading-progress')?.classList.add('hidden');
            return;
        }

        // First try with high accuracy
        tryHighAccuracyLocation();

        function tryHighAccuracyLocation() {
            const geolocationOptions = {
                enableHighAccuracy: true,
                timeout: 20000, // Increased from 10s to 20s
                maximumAge: 30000 // Cache position for 30 seconds
            };

            navigator.geolocation.getCurrentPosition(
                position => {
                    userLocation = {
                        lat: position.coords.latitude,
                        lng: position.coords.longitude
                    };
                    fetchNearbyPlaces(userLocation.lat, userLocation.lng);
                },
                error => {
                    if (error.code === error.TIMEOUT) {
                        // Fallback to lower accuracy
                        navigator.geolocation.getCurrentPosition(
                            position => {
                                userLocation = {
                                    lat: position.coords.latitude,
                                    lng: position.coords.longitude
                                };
                                fetchNearbyPlaces(userLocation.lat, userLocation.lng);
                            },
                            finalError,
                            { enableHighAccuracy: false, timeout: 10000 }
                        );
                    } else {
                        handleError(error);
                    }
                },
                geolocationOptions
            );
        }

        function handleError(error) {
            loadingSpinner.classList.add('hidden');
            document.getElementById('loading-progress')?.classList.add('hidden');
            switch(error.code) {
                case error.PERMISSION_DENIED:
                    locationPermission.classList.remove('hidden');
                    break;
                case error.POSITION_UNAVAILABLE:
                    showError('Location unavailable', 'Please check your location settings and try again.');
                    break;
                case error.TIMEOUT:
                    // Add retry button when timeout occurs
                    showError('Location timeout',
                        `<p>Getting your location is taking longer than expected.</p>
                         <button id="retry-location" class="mt-3 bg-primary text-white px-4 py-2 rounded-lg">
                             Try Again
                         </button>`);
                    document.getElementById('retry-location').addEventListener('click', getNearbyPharmacies);
                    break;
                default:
                    showError('Location error', 'We couldn\'t determine your location. Please try again.');
            }
        }

        function finalError(error) {
            loadingSpinner.classList.add('hidden');
            document.getElementById('loading-progress')?.classList.add('hidden');
            showError('Location Error', 'We couldn\'t get your location. Please ensure location services are enabled and try again.');
        }
    }

    function fetchNearbyPlaces(lat, lng) {
        // Show loading state
        loadingSpinner.classList.remove('hidden');

        // Add timeout to fetch request
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000); // 15s timeout

        fetch(`https://lyre-4m8l.onrender.com/get-nearby?lat=${lat}&lng=${lng}`, {
            signal: controller.signal
        })
        .then(response => {
            clearTimeout(timeoutId);
            if (!response.ok) throw new Error('Network response was not ok');
            return response.json();
        })
        .then(data => {
            // Cache the results
            localStorage.setItem(`nearby-${lat}-${lng}`, JSON.stringify({
                data: data,
                timestamp: Date.now()
            }));

            nearbyPlaces = data;
            displayNearbyPlaces(data);
        })
        .catch(error => {
            clearTimeout(timeoutId);
            console.error('Error:', error);

            // Try to load from cache if available
            const cached = localStorage.getItem(`nearby-${lat}-${lng}`);
            if (cached) {
                const parsed = JSON.parse(cached);
                // Only use cache if less than 1 hour old
                if (Date.now() - parsed.timestamp < 3600000) {
                    nearbyPlaces = parsed.data;
                    displayNearbyPlaces(parsed.data);
                    showError('Network issue', 'Showing cached results. Data might not be current.');
                    return;
                }
            }

            showError('Network error', 'Failed to fetch nearby places. Please check your connection and try again.');
        })
        .finally(() => {
            loadingSpinner.classList.add('hidden');
            document.getElementById('loading-progress')?.classList.add('hidden');
        });
    }

    function displayNearbyPlaces(places) {
        loadingSpinner.classList.add('hidden');
        document.getElementById('loading-progress')?.classList.add('hidden');

        if (!places || places.length === 0) {
            nearbyResults.innerHTML = `
                <div class="col-span-3 text-center py-12 text-gray-500">
                    <i class="fas fa-exclamation-circle text-4xl mb-4"></i>
                    <p>No nearby pharmacies or hospitals found. Try increasing the search radius.</p>
                </div>
            `;
            return;
        }

        nearbyResults.innerHTML = '';

        // Show initial 3 results immediately
        const initialPlaces = places.slice(0, 3);
        renderPlaceCards(initialPlaces);

        // Then load the rest with a slight delay
        if (places.length > 3) {
            setTimeout(() => {
                const remainingPlaces = places.slice(3);
                renderPlaceCards(remainingPlaces);
            }, 300);
        }

        // Show the map button if we have results
        showMapBtn.classList.remove('hidden');
    }

    function renderPlaceCards(places) {
        places.forEach(place => {
            const card = document.createElement('div');
            card.className = 'bg-white rounded-xl shadow-md overflow-hidden border border-gray-100 hover:shadow-lg transition-all';

            const badgeColor = place.type === 'Pharmacy' ? 'bg-blue-100 text-blue-800' : 'bg-green-100 text-green-800';

            let contactInfo = '';
            if (place.phone) {
                contactInfo += `
                    <div class="flex items-center mt-2">
                        <i class="fas fa-phone-alt text-gray-500 mr-2"></i>
                        <a href="tel:${place.phone}" class="text-primary hover:underline">${place.phone}</a>
                    </div>
                `;
            }

            if (place.website) {
                contactInfo += `
                    <div class="flex items-center mt-2">
                        <i class="fas fa-globe text-gray-500 mr-2"></i>
                        <a href="${place.website}" target="_blank" class="text-primary hover:underline">Website</a>
                    </div>
                `;
            }

            let hoursInfo = '';
            if (place.opening_hours) {
                hoursInfo = `
                    <div class="mt-3 pt-3 border-t border-gray-100">
                        <div class="flex items-center">
                            <i class="fas fa-clock text-gray-500 mr-2"></i>
                            <span class="text-sm font-medium">Opening Hours:</span>
                        </div>
                        <p class="text-sm text-gray-600 mt-1">${place.opening_hours}</p>
                    </div>
                `;
            }

            card.innerHTML = `
                <div class="p-6">
                    <div class="flex justify-between items-start">
                        <h3 class="text-xl font-bold">${place.name}</h3>
                        <span class="text-xs px-2 py-1 rounded-full ${badgeColor}">${place.type}</span>
                    </div>
                    
                    <div class="mt-4">
                        <div class="flex items-start">
                            <i class="fas fa-map-marker-alt text-gray-500 mt-1 mr-2"></i>
                            <p class="text-gray-600">${place.address || 'Address not available'}</p>
                        </div>
                        
                        ${place.distance_meters ? `
                        <div class="flex items-center mt-2">
                            <i class="fas fa-walking text-gray-500 mr-2"></i>
                            <p class="text-sm text-gray-600">${Math.round(place.distance_meters)} meters away</p>
                        </div>
                        ` : ''}
                        
                        ${contactInfo}
                        ${hoursInfo}
                    </div>
                    
                    <div class="mt-4 pt-4 border-t border-gray-100">
                        <button class="text-sm bg-primary text-white px-4 py-2 rounded-lg hover:bg-secondary transition w-full view-on-map" data-lat="${place.location.lat}" data-lng="${place.location.lng}">
                            <i class="fas fa-map-marker-alt mr-2"></i> View on Map
                        </button>
                    </div>
                </div>
            `;

            nearbyResults.appendChild(card);
        });

        // Add click handlers for "View on Map" buttons
        document.querySelectorAll('.view-on-map').forEach(button => {
            button.addEventListener('click', function() {
                const lat = parseFloat(this.getAttribute('data-lat'));
                const lng = parseFloat(this.getAttribute('data-lng'));

                if (!mapContainer.classList.contains('hidden')) {
                    if (nearbyMap) {
                        nearbyMap.setView([lat, lng], 16);
                    }
                } else {
                    toggleMap();
                    setTimeout(() => {
                        if (nearbyMap) {
                            nearbyMap.setView([lat, lng], 16);
                        }
                    }, 300);
                }
            });
        });
    }

    function toggleMap() {
        if (mapContainer.classList.contains('hidden')) {
            // Initialize the map if not already done
            if (!nearbyMap) {
                initializeNearbyMap();
            }
            showMapBtn.innerHTML = '<i class="fas fa-map mr-2"></i> Hide Map';
            mapContainer.classList.remove('hidden');
        } else {
            showMapBtn.innerHTML = '<i class="fas fa-map mr-2"></i> Show on Map';
            mapContainer.classList.add('hidden');
        }
    }

    function initializeNearbyMap() {
        if (!userLocation || !nearbyPlaces || nearbyPlaces.length === 0) return;

        // Detect mobile devices
        const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

        nearbyMap = L.map('nearby-map', {
            preferCanvas: true,
            fadeAnimation: false,
            zoomControl: false,
            zoomSnap: isMobile ? 0.5 : 0.1,
            wheelPxPerZoomLevel: isMobile ? 120 : 60,
            touchZoom: isMobile ? 'center' : true
        }).setView([userLocation.lat, userLocation.lng], isMobile ? 13 : 14);

        L.control.zoom({
            position: 'topright'
        }).addTo(nearbyMap);

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
            maxZoom: 19,
            reuseTiles: true,
            updateWhenIdle: true,
            detectRetina: isMobile
        }).addTo(nearbyMap);

        // Add user location marker with a blue circle around it
        const userMarker = L.marker([userLocation.lat, userLocation.lng], {
            icon: L.icon({
                iconUrl: 'https://cdn0.iconfinder.com/data/icons/small-n-flat/24/678111-map-marker-512.png',
                iconSize: [32, 32],
                iconAnchor: [16, 32],
                popupAnchor: [0, -32]
            })
        }).addTo(nearbyMap)
          .bindPopup('Your Location')
          .openPopup();

        // Add a circle around user location to show accuracy
        L.circle([userLocation.lat, userLocation.lng], {
            color: '#3b82f6',
            fillColor: '#3b82f6',
            fillOpacity: 0.2,
            radius: 500 // 500 meter radius
        }).addTo(nearbyMap);

        // Create a marker cluster group for better performance
        const nearbyMarkerCluster = L.markerClusterGroup({
            spiderfyOnMaxZoom: true,
            showCoverageOnHover: false,
            zoomToBoundsOnClick: true,
            chunkedLoading: true,
            chunkInterval: 100
        });

        // Add nearby places markers to the cluster group
        nearbyPlaces.forEach(place => {
            const placeIcon = L.icon({
                iconUrl: place.type === 'Pharmacy' ?
                    'https://cdn-icons-png.flaticon.com/512/484/484613.png' :
                    'https://cdn-icons-png.flaticon.com/512/684/684908.png',
                iconSize: [32, 32],
                iconAnchor: [16, 32],
                popupAnchor: [0, -32]
            });

            const marker = L.marker([place.location.lat, place.location.lng], {
                icon: placeIcon
            }).bindPopup(`
                <h3 class="font-bold">${place.name}</h3>
                <p class="text-sm">${place.address || 'Address not available'}</p>
                ${place.distance_meters ? `<p class="text-sm"><i class="fas fa-walking mr-1"></i> ${Math.round(place.distance_meters)} meters away</p>` : ''}
                ${place.phone ? `<p class="text-sm mt-1"><i class="fas fa-phone-alt mr-1"></i> ${place.phone}</p>` : ''}
                ${place.website ? `<p class="text-sm mt-1"><i class="fas fa-globe mr-1"></i> <a href="${place.website}" target="_blank" class="text-primary">Website</a></p>` : ''}
            `);

            // Add a line from user location to this place
            const line = L.polyline(
                [
                    [userLocation.lat, userLocation.lng],
                    [place.location.lat, place.location.lng]
                ],
                {
                    color: '#3b82f6',
                    weight: 1,
                    opacity: 0.5,
                    dashArray: '5, 5'
                }
            ).addTo(nearbyMap);

            nearbyMarkerCluster.addLayer(marker);
        });

        nearbyMap.addLayer(nearbyMarkerCluster);

        // Fit bounds to show all markers and user location
        const bounds = nearbyMarkerCluster.getBounds();
        if (bounds.isValid()) {
            bounds.extend([userLocation.lat, userLocation.lng]);
            nearbyMap.fitBounds(bounds, { padding: [50, 50] });
        }
    }

    function showError(title, message) {
        document.getElementById('error-title').textContent = title;
        document.getElementById('error-message').innerHTML = message;
        locationError.classList.remove('hidden');
    }

    // Add search button event listener
    const searchButton = document.getElementById('search-button');
    if (searchButton) {
        searchButton.addEventListener('click', () => fetchFlaggedPharmacies(1));
    }

    // Add event listeners for pagination buttons
    document.getElementById('prev-page')?.addEventListener('click', () => {
        if (currentPage > 1) fetchFlaggedPharmacies(currentPage - 1);
    });
    document.getElementById('next-page')?.addEventListener('click', () => {
        fetchFlaggedPharmacies(currentPage + 1);
    });
    document.getElementById('prev-page-mobile')?.addEventListener('click', () => {
        if (currentPage > 1) fetchFlaggedPharmacies(currentPage - 1);
    });
    document.getElementById('next-page-mobile')?.addEventListener('click', () => {
        fetchFlaggedPharmacies(currentPage + 1);
    });

    // Also add event listeners for form inputs to trigger search on change
    document.getElementById('sort-by')?.addEventListener('change', () => fetchFlaggedPharmacies(1));
    document.getElementById('sort-order')?.addEventListener('change', () => fetchFlaggedPharmacies(1));
    document.getElementById('per-page')?.addEventListener('change', () => fetchFlaggedPharmacies(1));

    // Add event listener for pharmacy details buttons
    document.addEventListener('click', function(e) {
        if (e.target.classList.contains('view-pharmacy-details')) {
            const pharmacyName = decodeURIComponent(e.target.getAttribute('data-pharmacy'));
            fetchPharmacyDetails(pharmacyName);
        }
    });

    // Initial load
    fetchFlaggedPharmacies(1);
});