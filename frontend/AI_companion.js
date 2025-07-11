const BASE_URL = 'https://lyre-4m8l.onrender.com';

// Generate a unique user ID
function generateUserId() {
    return 'user_' + Math.random().toString(36).substr(2, 9);
}

// Get or create user ID
function getUserId() {
    let userId = localStorage.getItem('nexaHealthUserId');
    if (!userId) {
        userId = generateUserId();
        localStorage.setItem('nexaHealthUserId', userId);
    }
    return userId;
}

// Format AI responses
function formatChatResponse(response) {
    // Convert markdown to HTML
    let html = response
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') // Bold
        .replace(/\n\n/g, '</p><p>')                       // Paragraphs
        .replace(/\n/g, '<br>')                            // Line breaks

    // Add proper HTML structure
    return `
        <div class="ai-response">
            <div class="response-header">${html.split('<br>')[0]}</div>
            <div class="response-content">
                ${html.substring(html.indexOf('<br>') + 4)}
            </div>
        </div>
    `;
}

// Mobile Menu Toggle
const hamburger = document.getElementById('hamburger');
const mobileMenu = document.getElementById('mobile-menu');

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

// Language Modal
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

// History Modal
const historyModal = document.getElementById('history-modal');
const historyBtn = document.getElementById('history-btn');
const closeHistoryModal = document.getElementById('close-history-modal');

historyBtn.addEventListener('click', async () => {
    try {
        const userId = getUserId();
        const response = await fetch(`${BASE_URL}/ai-companion/history?user_id=${userId}`);
        const data = await response.json();

        const historyContainer = historyModal.querySelector('.flex-grow');
        historyContainer.innerHTML = '';

        if (data.history && data.history.length > 0) {
            data.history.forEach(item => {
                const historyItem = document.createElement('div');
                historyItem.className = 'history-item p-3 mb-2 rounded-lg cursor-pointer border border-gray-200 hover:bg-gray-50';
                historyItem.innerHTML = `
                    <div class="flex justify-between items-center">
                        <div>
                            <p class="font-medium">${item.question.substring(0, 30)}${item.question.length > 30 ? '...' : ''}</p>
                            <p class="text-sm text-gray-500">${item.language.toUpperCase()} • ${new Date().toLocaleDateString()}</p>
                        </div>
                        <i class="fas fa-chevron-right text-gray-400"></i>
                    </div>
                `;
                historyItem.addEventListener('click', () => {
                    loadHistoryItem(item);
                    historyModal.classList.add('hidden');
                });
                historyContainer.appendChild(historyItem);
            });
        } else {
            historyContainer.innerHTML = '<p class="text-gray-500 text-center py-4">No chat history found</p>';
        }

        historyModal.classList.remove('hidden');
    } catch (error) {
        console.error('Error fetching history:', error);
        alert('Failed to load chat history');
    }
});

closeHistoryModal.addEventListener('click', () => {
    historyModal.classList.add('hidden');
});

function loadHistoryItem(item) {
    chatMessages.innerHTML = '';

    const userMessageDiv = document.createElement('div');
    userMessageDiv.className = 'user-message flex justify-end max-w-[90%] md:max-w-[80%] lg:max-w-[70%] ml-auto';
    userMessageDiv.innerHTML = `
        <div class="user-bubble px-4 py-3 animate__animated animate__fadeIn">
            <p>${item.question}</p>
            <div class="mt-1 text-right">
                <span class="language-badge bg-blue-100 text-blue-800 text-xs px-2 py-0.5 rounded-full">${item.language}</span>
            </div>
        </div>
    `;
    chatMessages.appendChild(userMessageDiv);

    const aiMessageDiv = document.createElement('div');
    aiMessageDiv.className = 'ai-message flex max-w-[90%] md:max-w-[80%] lg:max-w-[70%]';
    aiMessageDiv.innerHTML = `
        <div class="flex-shrink-0 mr-3">
            <div class="w-8 h-8 rounded-full bg-primary flex items-center justify-center">
                <i class="fas fa-robot text-white text-sm"></i>
            </div>
        </div>
        <div class="ai-bubble px-4 py-3 animate__animated animate__fadeIn">
            ${formatChatResponse(item.answer)}
            <div class="mt-2 flex flex-wrap gap-2">
                <span class="language-badge bg-green-100 text-green-800 text-xs px-2 py-1 rounded-full">${item.language}</span>
            </div>
        </div>
    `;
    chatMessages.appendChild(aiMessageDiv);
}

// Clear Chat
const clearChatBtn = document.getElementById('clear-chat');
const clearAllHistoryBtn = document.getElementById('clear-all-history');
const chatMessages = document.getElementById('chat-messages');

clearChatBtn.addEventListener('click', () => {
    if (confirm('Are you sure you want to clear this chat?')) {
        const welcomeMessage = chatMessages.children[0];
        chatMessages.innerHTML = '';
        chatMessages.appendChild(welcomeMessage);
    }
});

clearAllHistoryBtn.addEventListener('click', async () => {
    if (confirm('Are you sure you want to clear ALL chat history? This cannot be undone.')) {
        try {
            const userId = getUserId();
            await fetch(`${BASE_URL}/ai-companion/history?user_id=${userId}`, {
                method: 'DELETE'
            });
            historyModal.classList.add('hidden');
            alert('All chat history cleared');
        } catch (error) {
            console.error('Error clearing history:', error);
            alert('Failed to clear chat history');
        }
    }
});

// Chat functionality
const chatInput = document.getElementById('chat-input');
const sendBtn = document.getElementById('send-btn');
const quickReplies = document.querySelectorAll('.quick-reply');
const typingIndicator = document.getElementById('typing-indicator');

async function sendMessage() {
    const message = chatInput.value.trim();
    if (message === '') return;

    const userId = getUserId();
    const language = currentLanguage;

    // Add user message to chat
    const userMessageDiv = document.createElement('div');
    userMessageDiv.className = 'user-message flex justify-end max-w-[90%] md:max-w-[80%] lg:max-w-[70%] ml-auto';
    userMessageDiv.innerHTML = `
        <div class="user-bubble px-4 py-3 animate__animated animate__fadeIn">
            <p>${message}</p>
            <div class="mt-1 text-right">
                <span class="language-badge bg-blue-100 text-blue-800 text-xs px-2 py-0.5 rounded-full">${language}</span>
            </div>
        </div>
    `;
    chatMessages.appendChild(userMessageDiv);

    // Clear input
    chatInput.value = '';

    // Show typing indicator
    const typingClone = typingIndicator.cloneNode(true);
    typingClone.id = '';
    typingClone.classList.remove('hidden');
    chatMessages.appendChild(typingClone);

    // Scroll to bottom
    chatMessages.scrollTop = chatMessages.scrollHeight;

    try {
        // Send message to backend
        const response = await fetch(`${BASE_URL}/ai-companion/chat`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                user_id: userId,
                message: message,
                language: language
            })
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();

        // Remove typing indicator
        chatMessages.removeChild(typingClone);

        // Format the AI response
        const formattedResponse = formatChatResponse(data.response);

        // Add AI response
        const aiMessageDiv = document.createElement('div');
        aiMessageDiv.className = 'ai-message flex max-w-[90%] md:max-w-[80%] lg:max-w-[70%]';
        aiMessageDiv.innerHTML = `
            <div class="flex-shrink-0 mr-3">
                <div class="w-8 h-8 rounded-full bg-primary flex items-center justify-center">
                    <i class="fas fa-robot text-white text-sm"></i>
                </div>
            </div>
            <div class="ai-bubble px-4 py-3 animate__animated animate__fadeIn">
                ${formattedResponse}
                <div class="mt-2 flex flex-wrap gap-2">
                    <span class="language-badge bg-green-100 text-green-800 text-xs px-2 py-1 rounded-full">${language}</span>
                </div>
            </div>
        `;
        chatMessages.appendChild(aiMessageDiv);
        
        // Scroll to bottom
        chatMessages.scrollTop = chatMessages.scrollHeight;
    } catch (error) {
        console.error('Error sending message:', error);
        // Remove typing indicator
        chatMessages.removeChild(typingClone);
        
        // Show error message
        const errorMessageDiv = document.createElement('div');
        errorMessageDiv.className = 'ai-message flex max-w-[90%] md:max-w-[80%] lg:max-w-[70%]';
        errorMessageDiv.innerHTML = `
            <div class="flex-shrink-0 mr-3">
                <div class="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center">
                    <i class="fas fa-exclamation-triangle text-red-500 text-sm"></i>
                </div>
            </div>
            <div class="ai-bubble px-4 py-3 animate__animated animate__fadeIn">
                <p class="text-gray-800">Sorry, I'm having trouble connecting to the server. Please try again later.</p>
            </div>
        `;
        chatMessages.appendChild(errorMessageDiv);
    }
}

// Send message on button click
sendBtn.addEventListener('click', sendMessage);

// Send message on Enter key
chatInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        sendMessage();
    }
});

// Quick reply buttons
quickReplies.forEach(button => {
    button.addEventListener('click', () => {
        chatInput.value = button.textContent.trim();
        sendMessage();
    });
});

// Auto-scroll to bottom of chat
chatMessages.scrollTop = chatMessages.scrollHeight;