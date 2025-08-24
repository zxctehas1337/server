// Socket.IO client connection
const socket = io();

// DOM Elements
const loginContainer = document.getElementById('loginContainer');
const chatContainer = document.getElementById('chatContainer');
const loginForm = document.getElementById('loginForm');
const messageForm = document.getElementById('messageForm');
const usernameInput = document.getElementById('username');
const passwordInput = document.getElementById('password');
const messageInput = document.getElementById('messageInput');
const messagesDiv = document.getElementById('messages');
const userInfoDiv = document.getElementById('userInfo');
const statusMessageDiv = document.getElementById('statusMessage');

// Application state
let currentUser = null;
let isConnected = false;

// Utility Functions
function showStatus(message, type = 'info') {
    statusMessageDiv.textContent = message;
    statusMessageDiv.className = `status-message show ${type}`;
    
    setTimeout(() => {
        statusMessageDiv.classList.remove('show');
    }, 3000);
}

function formatTime(timestamp) {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function scrollToBottom() {
    const container = document.getElementById('messagesContainer');
    container.scrollTop = container.scrollHeight;
}

function addMessage(messageData, isOwn = false, isSystem = false) {
    const messageDiv = document.createElement('div');
    
    if (isSystem) {
        messageDiv.className = 'system-message';
        messageDiv.textContent = messageData.message;
    } else {
        messageDiv.className = `message ${isOwn ? 'own' : 'other'}`;
        
        messageDiv.innerHTML = `
            <div class="message-header">${escapeHtml(messageData.username)}</div>
            <div class="message-content">${escapeHtml(messageData.content)}</div>
            <div class="message-time">${formatTime(messageData.timestamp)}</div>
        `;
    }
    
    messagesDiv.appendChild(messageDiv);
    scrollToBottom();
}

// Socket Event Handlers
socket.on('connect', () => {
    console.log('Connected to server');
    isConnected = true;
});

socket.on('disconnect', () => {
    console.log('Disconnected from server');
    isConnected = false;
    showStatus('Disconnected from server', 'error');
});

socket.on('username_set', (data) => {
    if (data.success) {
        currentUser = data.user;
        loginContainer.style.display = 'none';
        chatContainer.style.display = 'flex';
        userInfoDiv.textContent = `Logged in as: ${currentUser.username}`;
        showStatus(`Welcome, ${currentUser.username}!`, 'success');
        messageInput.focus();
    } else {
        showStatus(data.error || 'Failed to set username', 'error');
    }
});

socket.on('new_message', (messageData) => {
    const isOwnMessage = currentUser && messageData.userId === currentUser.id;
    addMessage(messageData, isOwnMessage);
});

socket.on('user_joined', (data) => {
    if (currentUser && data.username !== currentUser.username) {
        addMessage(data, false, true);
        showStatus(`${data.username} joined the chat`, 'info');
    }
});

socket.on('user_left', (data) => {
    if (currentUser && data.username !== currentUser.username) {
        addMessage(data, false, true);
        showStatus(`${data.username} left the chat`, 'info');
    }
});

socket.on('error', (data) => {
    showStatus(data.message || 'An error occurred', 'error');
});

// Form Event Handlers
loginForm.addEventListener('submit', (e) => {
    e.preventDefault();
    
    const username = usernameInput.value.trim();
    const password = passwordInput.value.trim();
    
    if (!username || !password) {
        showStatus('Please enter both username and password', 'error');
        return;
    }
    
    if (username.length < 3) {
        showStatus('Username must be at least 3 characters', 'error');
        return;
    }
    
    if (password.length < 4) {
        showStatus('Password must be at least 4 characters', 'error');
        return;
    }
    
    // Disable form while processing
    const submitButton = loginForm.querySelector('button');
    const originalText = submitButton.textContent;
    submitButton.textContent = 'Joining...';
    submitButton.disabled = true;
    
    socket.emit('set_username', { username, password });
    
    // Re-enable form after timeout in case of no response
    setTimeout(() => {
        submitButton.textContent = originalText;
        submitButton.disabled = false;
    }, 5000);
});

messageForm.addEventListener('submit', (e) => {
    e.preventDefault();
    
    const content = messageInput.value.trim();
    
    if (!content) {
        showStatus('Message cannot be empty', 'error');
        return;
    }
    
    if (!currentUser) {
        showStatus('Please set a username first', 'error');
        return;
    }
    
    if (!isConnected) {
        showStatus('Not connected to server', 'error');
        return;
    }
    
    // Disable send button while processing
    const sendButton = messageForm.querySelector('button');
    const originalText = sendButton.textContent;
    sendButton.textContent = 'Sending...';
    sendButton.disabled = true;
    
    socket.emit('send_message', { content });
    
    // Clear input and re-enable button
    messageInput.value = '';
    setTimeout(() => {
        sendButton.textContent = originalText;
        sendButton.disabled = false;
        messageInput.focus();
    }, 500);
});

// Keyboard shortcuts
messageInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        messageForm.dispatchEvent(new Event('submit'));
    }
});

// Auto-focus on username input when page loads
document.addEventListener('DOMContentLoaded', () => {
    usernameInput.focus();
});

// Handle connection errors
socket.on('connect_error', (error) => {
    console.error('Connection error:', error);
    showStatus('Failed to connect to server', 'error');
});

// Handle reconnection
socket.on('reconnect', (attemptNumber) => {
    console.log('Reconnected to server');
    showStatus('Reconnected to server', 'success');
    isConnected = true;
});

socket.on('reconnecting', (attemptNumber) => {
    showStatus(`Reconnecting... (attempt ${attemptNumber})`, 'info');
});

socket.on('reconnect_failed', () => {
    showStatus('Failed to reconnect to server', 'error');
});

// Handle page visibility change
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && currentUser) {
        scrollToBottom();
    }
});

// Handle window resize
window.addEventListener('resize', () => {
    if (currentUser) {
        scrollToBottom();
    }
});
