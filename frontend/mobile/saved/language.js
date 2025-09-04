const languageModal = document.getElementById('language-modal');
const languageToggle = document.getElementById('language-toggle');
const closeLanguageModal = document.getElementById('close-language-modal');
const confirmLanguage = document.getElementById('confirm-language');
const languageOptions = document.querySelectorAll('input[name="language"]');

// Set default language
let currentLanguage = 'english';

languageToggle.addEventListener('click', () => {
    // Set the current language as checked when opening modal
    document.querySelector(`input[name="language"][value="${currentLanguage}"]`).checked = true;
    languageModal.classList.remove('hidden');
    languageModal.classList.add('animate__fadeIn');
});

closeLanguageModal.addEventListener('click', () => {
    languageModal.classList.add('hidden');
});

confirmLanguage.addEventListener('click', () => {
    const selectedLanguage = document.querySelector('input[name="language"]:checked').value;
    currentLanguage = selectedLanguage;

    // Update UI to show selected language
    const languageBadge = document.getElementById('current-language-badge');
    if (languageBadge) {
        languageBadge.textContent = selectedLanguage.charAt(0).toUpperCase() + selectedLanguage.slice(1);
    }

    languageModal.classList.add('hidden');

    // Optional: Show confirmation
    const languageToast = document.createElement('div');
    languageToast.className = 'fixed bottom-4 left-1/2 transform -translate-x-1/2 bg-green-500 text-white px-4 py-2 rounded-lg shadow-lg animate__animated animate__fadeInUp';
    languageToast.innerHTML = `Language set to ${selectedLanguage}`;
    document.body.appendChild(languageToast);

    setTimeout(() => {
        languageToast.classList.add('animate__fadeOutDown');
        setTimeout(() => {
            document.body.removeChild(languageToast);
        }, 500);
    }, 2000);
});