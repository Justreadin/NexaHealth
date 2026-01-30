document.addEventListener('DOMContentLoaded', async () => {
    const container = document.querySelector('.nearby-pharmacies-container');
    const manualInput = document.getElementById('manual-location-input');
    const toggleBtn = document.getElementById('toggle-pharmacies');

    let allPharmacies = [];
    let isShowingAll = false;

    function createPremiumPharmacyCard(pharmacy) {
        const distanceText = typeof pharmacy.distance_km === 'number'
            ? `${pharmacy.distance_km.toFixed(1)} km away`
            : '';

        return `
        <div class="premium-card p-5 rounded-xl hover:shadow-xl transition-all duration-300 transform hover:-translate-y-1 cursor-pointer border border-gray-100">
            <div class="flex items-start justify-between mb-3">
                <div class="flex items-center space-x-3">
                    <div class="w-12 h-12 bg-gradient-to-r from-primary to-secondary rounded-xl flex items-center justify-center">
                        <i class="fas fa-clinic-medical text-white text-base"></i>
                    </div>
                    <div class="flex-1 min-w-0">
                        <h3 class="font-bold text-gray-900 text-base truncate">${pharmacy.name || 'Unverified Pharmacy'}</h3>
                        <div class="flex items-center space-x-2 mt-1">
                            <span class="inline-flex items-center px-2 py-1 bg-amber-100 text-amber-800 rounded-full text-xs font-semibold">
                                <i class="fas fa-clock mr-1 text-xs"></i>
                                ${pharmacy.opening_hours || 'Hours unknown'}
                            </span>
                        </div>
                    </div>
                </div>
            </div>

            <div class="mb-4">
                <span class="inline-flex items-center px-3 py-1 bg-blue-50 text-blue-700 rounded-full text-xs font-semibold border border-blue-200">
                    <i class="fas fa-shield-alt mr-1.5 text-xs"></i>
                    Unverified — No public trust score
                </span>
            </div>

            <div class="flex items-center text-gray-600 mb-4">
                <i class="fas fa-map-marker-alt text-primary mr-2 text-sm"></i>
                <span class="text-sm flex-1 truncate">${pharmacy.address || 'Address not available'}</span>
                <span class="text-xs font-semibold text-primary bg-blue-50 px-2 py-1 rounded-full ml-2">${distanceText}</span>
            </div>

            <button class="invite-btn w-full py-3 bg-gradient-to-r from-primary to-secondary text-white rounded-xl font-semibold hover:shadow-lg transition-all duration-200 transform hover:scale-105 text-sm flex items-center justify-center space-x-2">
                <i class="fas fa-user-plus text-sm"></i>
                <span>Invite to NexaHealth</span>
            </button>
        </div>`;
    }

    function renderPharmacies(showAll = false) {
        container.innerHTML = '';

        if (!allPharmacies.length) {
            container.innerHTML = `
                <div class="col-span-full text-center py-8">
                    <div class="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                        <i class="fas fa-map-marker-alt text-gray-400 text-xl"></i>
                    </div>
                    <h3 class="text-lg font-semibold text-gray-700 mb-2">No pharmacies found nearby</h3>
                    <p class="text-gray-500 text-sm mb-4">Try expanding your search radius or check back later.</p>
                    <button onclick="showManualInput()" class="px-6 py-2 bg-gradient-to-r from-primary to-secondary text-white rounded-lg font-semibold hover:shadow-lg transition-all">
                        Search Different Location
                    </button>
                </div>`;
            return;
        }

        const toDisplay = showAll ? allPharmacies : allPharmacies.slice(0, 2);

        toDisplay.forEach(pharmacy => {
            const cardWrapper = document.createElement('div');
            cardWrapper.innerHTML = createPremiumPharmacyCard(pharmacy);

            cardWrapper.querySelector('.invite-btn').addEventListener('click', () => {
                const shareLink = pharmacy.invite_link ||
                    `${window.location.origin}/invite-pharmacy?id=${pharmacy.id}`;
                const message = `Consumers are searching for you — claim your NexaHealth profile! ${shareLink}`;

                const modal = document.getElementById("invite-modal");
                const inviteTextEl = document.getElementById("invite-text");

                inviteTextEl.textContent = message;
                modal.classList.remove("hidden");
                modal.classList.add("flex");
            });


            container.appendChild(cardWrapper);
        });
    }

    function getStoredAccessToken() {
        return localStorage.getItem('nexahealth_access_token') ||
               sessionStorage.getItem('nexahealth_access_token');
    }

    async function fetchPharmacies(lat, lng, radius_km = 10) {
        const token = getStoredAccessToken();
        if (!token) {
            alert('You must be logged in to view nearby pharmacies.');
            return [];
        }

        try {
            const res = await fetch(
                `https://nexahealth-backend-production.up.railway.app/api/pharmacies/nearby?lat=${lat}&lng=${lng}&radius_km=${radius_km}`,
                { headers: { 'Authorization': `Bearer ${token}` } }
            );
            const data = await res.json();
            return Array.isArray(data) ? data : [];
        } catch (err) {
            console.error('Error fetching pharmacies:', err);
            return [];
        }
    }

    function askForLocation() {
        navigator.geolocation.getCurrentPosition(async (pos) => {
            const { latitude, longitude } = pos.coords;
            allPharmacies = await fetchPharmacies(latitude, longitude, 10);
            renderPharmacies();
        }, () => {
            showManualInput();
        });
    }

    function showManualInput() {
        manualInput.classList.remove('hidden');
        container.innerHTML = `
            <div class="col-span-full text-center py-8">
                <div class="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-4">
                    <i class="fas fa-search-location text-primary text-xl"></i>
                </div>
                <h3 class="text-lg font-semibold text-gray-700 mb-2">Enter your location</h3>
                <p class="text-gray-500 text-sm">Get precise pharmacy results for your area</p>
            </div>
        `;
    }

    document.getElementById('submit-address')?.addEventListener('click', async () => {
        const address = document.getElementById('user-address').value.trim();
        if (!address) return alert('Please enter your address');

        try {
            const token = getStoredAccessToken();
            const res = await fetch(
                `https://nexahealth-backend-production.up.railway.app/api/geocode?address=${encodeURIComponent(address)}`,
                { headers: { 'Authorization': `Bearer ${token}` } }
            );
            const data = await res.json();

            if (data.lat && data.lng) {
                allPharmacies = await fetchPharmacies(data.lat, data.lng, 10);
                renderPharmacies();
            } else {
                alert('Unable to find location. Try a different address.');
            }
        } catch (err) {
            console.error(err);
            alert('Error fetching location. Try again.');
        }
    });

    toggleBtn.addEventListener('click', (e) => {
        e.preventDefault();
        isShowingAll = !isShowingAll;
        renderPharmacies(isShowingAll);

        toggleBtn.querySelector('span').textContent = isShowingAll ? 'Show less' : 'View all';
        toggleBtn.querySelector('i').classList.toggle('rotate-180');
    });


    // Close modal
    document.getElementById("close-invite-modal")?.addEventListener("click", () => {
        const modal = document.getElementById("invite-modal");
        modal.classList.add("hidden");
        modal.classList.remove("flex");
    });

    // Copy message
    document.getElementById("copy-invite")?.addEventListener("click", () => {
        const text = document.getElementById("invite-text").textContent;
        navigator.clipboard.writeText(text).then(() => {
            alert("Invite message copied!");
        });
    });

    if (navigator.geolocation) {
        askForLocation();
    } else {
        showManualInput();
    }
});
