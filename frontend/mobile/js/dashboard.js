document.addEventListener('DOMContentLoaded', async () => {
    try {
        let retries = 20;

        // Helper to wait for window.App.Auth to be ready
        const waitForAuth = async () => {
            while (!window.App?.Auth && retries > 0) {
                await new Promise(res => setTimeout(res, 100));
                retries--;
            }

            if (!window.App?.Auth) {
                console.error("Auth still not initialized after waiting.");
                window.location.href = 'login.html';
                return false;
            }

            console.log("Auth initialized successfully.");
            return true;
        };

        // Start waiting for Auth or listen for custom event
        const authReady = await waitForAuth();

        if (!authReady) return; // Exit if Auth never initialized

        // Also listen for the event just in case
        document.addEventListener('AuthReady', () => {
            console.log("AuthReady event received.");
        });

        // Fallback timeout just in case
        setTimeout(() => {
            if (!window.App?.Auth) {
                console.error("Auth still not initialized after fallback timeout.");
                window.location.href = 'login.html';
            }
        }, 3000);

        // ✅ Auth is ready here — now run dashboard logic

        // Load user data
        const loadUserData = async () => {
            try {
                const response = await fetch(`${window.App.Auth.API_BASE_URL}/auth/me`, {
                    headers: {
                        'Authorization': `Bearer ${window.App.Auth.getAccessToken()}`,
                        'Content-Type': 'application/json'
                    }
                });

                if (response.status === 401) {
                    try {
                        await window.App.Auth.refreshToken();
                        return await loadUserData(); // Retry
                    } catch (refreshError) {
                        throw new Error('Session expired');
                    }
                }

                if (!response.ok) {
                    throw new Error('Failed to load user data');
                }

                const userData = await response.json();
                document.querySelector('h1.text-2xl').textContent = `Welcome, ${userData.first_name || 'User'}`;
            } catch (error) {
                console.error('User data error:', error);
                throw error;
            }
        };

        // Load dashboard stats
        const loadDashboardStats = async () => {
            try {
                const response = await fetch('https://lyre-4m8l.onrender.com/dashboard/stats', {
                    headers: {
                        'Authorization': `Bearer ${window.App.Auth.getAccessToken()}`
                    }
                });

                if (!response.ok) throw new Error('Failed to load stats');

                const stats = await response.json();
                document.querySelector('.verified-stats .text-lg').textContent = stats.verified_drugs;
                document.querySelector('.reported-stats .text-lg').textContent = stats.reported_issues;
                document.querySelector('.health-stats .text-lg').textContent = stats.health_checks;
                document.querySelector('.facilities-stats .text-lg').textContent = stats.saved_facilities;
            } catch (error) {
                console.error('Error loading stats:', error);
            }
        };

        // Load recent activity
        const loadRecentActivity = async () => {
            console.log("🔥 loadRecentActivity(): Starting");
            console.log("Access Token:", window.App.Auth.getAccessToken());

            try {
                const response = await fetch('https://lyre-4m8l.onrender.com/dashboard/activity', {
                    headers: {
                        'Authorization': `Bearer ${window.App.Auth.getAccessToken()}`
                    }
                });

                if (!response.ok) throw new Error('Failed to load activity');

                const activities = await response.json();
                const activityContainer = document.querySelector('.activity-container');

                activityContainer.innerHTML = ''; // Clear existing content

                activities.forEach(activity => {
                    const activityItem = document.createElement('div');
                    activityItem.className = 'p-4 hover:bg-gray-50 transition-colors';
                    activityItem.innerHTML = `
                        <div class="flex items-start">
                            <div class="flex-shrink-0 bg-${activity.color}-50 p-3 rounded-lg text-${activity.color}-600 mr-3">
                                <i class="fas fa-${activity.icon}"></i>
                            </div>
                            <div class="flex-1 min-w-0">
                                <div class="flex items-center justify-between">
                                    <p class="text-sm font-medium text-gray-900 truncate">${activity.title}</p>
                                    <p class="text-xs text-gray-500 whitespace-nowrap ml-2">${new Date(activity.timestamp).toLocaleString()}</p>
                                </div>
                                <p class="text-sm text-gray-600 mt-1">${activity.description}</p>
                                <div class="mt-2 flex items-center">
                                    <span class="activity-badge bg-${activity.color}-500"></span>
                                    <span class="text-xs font-medium text-${activity.color}-800">${activity.status.replace('_', ' ')}</span>
                                </div>
                            </div>
                        </div>
                    `;
                    activityContainer.appendChild(activityItem);
                });
            } catch (error) {
                console.error('Error loading activity:', error);
            }
        };

        // Load all dashboard data
        Promise.all([
            loadUserData().catch(e => {
                showAlert('Failed to load user data', 'error');
                throw e;
            }),
            loadDashboardStats().catch(e => console.error('Stats load failed:', e)),
            loadRecentActivity().catch(e => console.error('Activity load failed:', e)),
            // Load referral script
            new Promise((resolve) => {
                const script = document.createElement('script');
                script.src = 'js/referral.js';
                script.onload = resolve;
                document.body.appendChild(script);
            })
        ]);

    } catch (error) {
        console.error('Dashboard error:', error);
        if (
            error.message === 'Session expired' ||
            error.message === 'Failed to load user data'
        ) {
            showAlert('Your session has expired or could not be verified. Please log in again.', 'error');
            window.location.href = 'login.html';
        }
    }
});

// 🔒 Global error handling for any uncaught errors/rejections
window.onerror = function (message, source, lineno, colno, error) {
    console.error("Global error caught:", message, source, lineno, colno, error);
    window.location.href = 'login.html';
};

window.onunhandledrejection = function (event) {
    console.error("Unhandled promise rejection:", event.reason);
    window.location.href = 'login.html';
};
