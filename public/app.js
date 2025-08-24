// Socket.IO client connection with Firefox compatibility options
const socket = io({
  // Force WebSocket transport for consistency across browsers
  transports: ['websocket', 'polling'],
  // Increase timeout for Firefox
  timeout: 20000,
  // Enable debugging
  debug: true,
  // Ensure proper reconnection
  reconnection: true,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
  maxReconnectionAttempts: 3,
  // Force JSON protocol
  forceJSONP: false
});

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
const themeToggle = document.getElementById('themeToggle');
const onlineUsersList = document.getElementById('onlineUsersList');
const currentChatName = document.getElementById('currentChatName');
const currentChatStatus = document.getElementById('currentChatStatus');
const newChatBtn = document.getElementById('newChatBtn');
const chatList = document.querySelector('.chat-list');

// Application state
let currentUser = null;
let isConnected = false;
let currentRoom = { id: 1, name: 'General Chat', type: 'general' };
let onlineUsers = new Map();
let theme = localStorage.getItem('theme') || 'light';

// Initialize theme
document.documentElement.setAttribute('data-theme', theme);
updateThemeIcon();

// Avatar generation functions
function generateAvatar(username) {
  // Use DiceBear API for consistent avatars
  const style = 'avataaars';
  const seed = username.toLowerCase();
  return `https://api.dicebear.com/7.x/${style}/svg?seed=${encodeURIComponent(seed)}&backgroundColor=6366f1&size=40`;
}

function getAvatarInitials(username) {
  return username.charAt(0).toUpperCase();
}

function createAvatarElement(username, size = 40) {
  const avatar = document.createElement('div');
  avatar.className = 'user-avatar';
  avatar.style.width = `${size}px`;
  avatar.style.height = `${size}px`;
  
  // Try to load image avatar, fallback to initials
  const img = document.createElement('img');
  img.src = generateAvatar(username);
  img.style.width = '100%';
  img.style.height = '100%';
  img.style.borderRadius = 'inherit';
  
  img.onerror = () => {
    avatar.innerHTML = getAvatarInitials(username);
    avatar.style.background = 'var(--bg-accent)';
    avatar.style.color = 'white';
    avatar.style.display = 'flex';
    avatar.style.alignItems = 'center';
    avatar.style.justifyContent = 'center';
    avatar.style.fontWeight = '600';
    avatar.style.fontSize = `${size * 0.4}px`;
  };
  
  img.onload = () => {
    avatar.innerHTML = '';
    avatar.appendChild(img);
  };
  
  return avatar;
}

// Theme management
function toggleTheme() {
  theme = theme === 'light' ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('theme', theme);
  updateThemeIcon();
}

function updateThemeIcon() {
  const themeIcon = document.querySelector('.theme-icon');
  if (themeIcon) {
    themeIcon.textContent = theme === 'light' ? '🌙' : '☀️';
  }
}

// Reset functions
function resetToLogin() {
  console.log('Resetting to login state');
  
  // Clear user state
  currentUser = null;
  isConnected = false;
  onlineUsers.clear();
  
  // Reset UI
  loginContainer.style.display = 'flex';
  chatContainer.style.display = 'none';
  
  // Clear forms and messages
  usernameInput.value = '';
  passwordInput.value = '';
  messageInput.value = '';
  messagesDiv.innerHTML = '';
  onlineUsersList.innerHTML = '';
  
  // Reset button states
  const submitButton = loginForm.querySelector('button');
  const sendButton = messageForm.querySelector('.send-btn');
  if (submitButton) {
    submitButton.disabled = false;
    submitButton.textContent = 'Join Chat';
  }
  if (sendButton) {
    sendButton.disabled = false;
  }
  
  // Focus username input
  usernameInput.focus();
  
  showStatus('Connection lost. Please login again.', 'error');
}

// Utility Functions
function showStatus(message, type = 'info') {
  statusMessageDiv.textContent = message;
  statusMessageDiv.className = `status-message show ${type}`;
  
  setTimeout(() => {
    statusMessageDiv.classList.remove('show');
  }, 4000);
}

function formatTime(timestamp) {
  const date = new Date(timestamp);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatDate(timestamp) {
  const date = new Date(timestamp);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  
  if (date.toDateString() === today.toDateString()) {
    return 'Today';
  } else if (date.toDateString() === yesterday.toDateString()) {
    return 'Yesterday';
  } else {
    return date.toLocaleDateString();
  }
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
    messageDiv.innerHTML = `
      <div class="system-content">${escapeHtml(messageData.message)}</div>
      <div class="system-time">${formatTime(messageData.timestamp || new Date())}</div>
    `;
  } else {
    messageDiv.className = `message ${isOwn ? 'own' : 'other'}`;
    
    const avatar = createAvatarElement(messageData.username, 32);
    
    messageDiv.innerHTML = `
      <div class="message-avatar">${!isOwn ? avatar.outerHTML : ''}</div>
      <div class="message-body">
        <div class="message-header">
          <span class="message-author">${escapeHtml(messageData.username)}</span>
          <span class="message-time">${formatTime(messageData.timestamp)}</span>
        </div>
        <div class="message-content">${escapeHtml(messageData.content)}</div>
      </div>
    `;
  }
  
  messagesDiv.appendChild(messageDiv);
  scrollToBottom();
}

function updateOnlineUsers(users) {
  onlineUsers.clear();
  onlineUsersList.innerHTML = '';
  
  users.forEach(user => {
    onlineUsers.set(user.id, user);
    
    const userItem = document.createElement('div');
    userItem.className = 'user-item';
    userItem.innerHTML = `
      <div class="user-avatar">${getAvatarInitials(user.username)}</div>
      <span class="user-name">${escapeHtml(user.username)}</span>
      <div class="user-status"></div>
    `;
    
    // Add click handler for private chat
    if (user.id !== currentUser?.id) {
      userItem.style.cursor = 'pointer';
      userItem.addEventListener('click', () => startPrivateChat(user));
    }
    
    onlineUsersList.appendChild(userItem);
  });
}

function startPrivateChat(user) {
  // Create or switch to private chat
  const chatId = `private_${Math.min(currentUser.id, user.id)}_${Math.max(currentUser.id, user.id)}`;
  
  // Check if chat already exists
  let existingChat = document.querySelector(`[data-room-id="${chatId}"]`);
  
  if (!existingChat) {
    // Create new private chat item
    const chatItem = document.createElement('div');
    chatItem.className = 'chat-item';
    chatItem.setAttribute('data-room-id', chatId);
    chatItem.setAttribute('data-room-type', 'private');
    
    chatItem.innerHTML = `
      <div class="chat-avatar">
        <div class="avatar-placeholder">${getAvatarInitials(user.username)}</div>
      </div>
      <div class="chat-info">
        <div class="chat-name">${escapeHtml(user.username)}</div>
        <div class="chat-last-message">Start a conversation...</div>
      </div>
      <div class="chat-meta">
        <div class="unread-count" style="display: none;">0</div>
      </div>
    `;
    
    chatItem.addEventListener('click', () => switchChat({
      id: chatId,
      name: user.username,
      type: 'private',
      userId: user.id
    }));
    
    chatList.appendChild(chatItem);
  }
  
  // Switch to this chat
  switchChat({
    id: chatId,
    name: user.username,
    type: 'private',
    userId: user.id
  });
}

function switchChat(room) {
  // Update active chat
  document.querySelectorAll('.chat-item').forEach(item => {
    item.classList.remove('active');
  });
  
  const chatItem = document.querySelector(`[data-room-id="${room.id}"]`);
  if (chatItem) {
    chatItem.classList.add('active');
  }
  
  // Update current room
  currentRoom = room;
  currentChatName.textContent = room.name;
  currentChatStatus.textContent = room.type === 'private' ? 'Private conversation' : 'Public room';
  
  // Clear messages (in a real app, you'd load the chat history)
  messagesDiv.innerHTML = '';
  
  // Request chat history from server
  socket.emit('join_room', { roomId: room.id, roomType: room.type });
  
  showStatus(`Switched to ${room.name}`, 'info');
}

// Socket Event Handlers
socket.on('connect', () => {
  console.log('Connected to server');
  isConnected = true;
});

socket.on('disconnect', (reason) => {
  console.log('Disconnected from server. Reason:', reason);
  isConnected = false;
  
  // Check if this is an unexpected disconnect (not user-initiated)
  if (reason === 'io server disconnect' || reason === 'transport close') {
    showStatus('Connection lost. Reconnecting...', 'error');
    
    // If user is logged in, show them they've been disconnected
    if (currentUser) {
      // Reset UI to login state after a delay to allow for reconnection
      setTimeout(() => {
        if (!socket.connected) {
          console.log('Firefox disconnect detected, resetting to login');
          resetToLogin();
        }
      }, 3000);
    }
  } else {
    showStatus('Disconnected from server', 'error');
  }
});

socket.on('username_set', (data) => {
  if (data.success) {
    currentUser = data.user;
    currentUser.avatar_url = data.user.avatar_url || generateAvatar(data.user.username);
    
    loginContainer.style.display = 'none';
    chatContainer.style.display = 'flex';
    
    // Update user info with avatar
    const avatar = createAvatarElement(currentUser.username, 24);
    userInfoDiv.innerHTML = `
      ${avatar.outerHTML}
      <span>Logged in as: ${currentUser.username}</span>
    `;
    
    showStatus(`Welcome, ${currentUser.username}!`, 'success');
    messageInput.focus();
    
    // Join default room
    socket.emit('join_room', { roomId: 1, roomType: 'general' });
  } else {
    showStatus(data.error || 'Failed to set username', 'error');
  }
});

socket.on('new_message', (messageData) => {
  const isOwnMessage = currentUser && messageData.userId === currentUser.id;
  addMessage(messageData, isOwnMessage);
  
  // Update last message in chat list
  const chatItem = document.querySelector(`[data-room-id="${messageData.roomId || 1}"]`);
  if (chatItem) {
    const lastMessageEl = chatItem.querySelector('.chat-last-message');
    if (lastMessageEl) {
      lastMessageEl.textContent = messageData.content.length > 30 
        ? messageData.content.substring(0, 30) + '...' 
        : messageData.content;
    }
  }
});

socket.on('user_joined', (data) => {
  if (currentUser && data.username !== currentUser.username) {
    addMessage({
      message: data.message,
      timestamp: new Date()
    }, false, true);
    showStatus(`${data.username} joined the chat`, 'info');
  }
});

socket.on('user_left', (data) => {
  if (currentUser && data.username !== currentUser.username) {
    addMessage({
      message: data.message,
      timestamp: new Date()
    }, false, true);
    showStatus(`${data.username} left the chat`, 'info');
  }
});

socket.on('online_users', (users) => {
  updateOnlineUsers(users);
});

socket.on('room_joined', (data) => {
  if (data.success) {
    // Load room history
    if (data.messages && data.messages.length > 0) {
      messagesDiv.innerHTML = '';
      data.messages.forEach(msg => {
        const isOwnMessage = currentUser && msg.user_id === currentUser.id;
        addMessage({
          username: msg.username,
          content: msg.content,
          timestamp: msg.timestamp,
          userId: msg.user_id
        }, isOwnMessage);
      });
    }
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
  
  // Re-enable form after timeout
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
  
  // Debug logging for Firefox
  console.log('Sending message:', {
    content,
    roomId: currentRoom.id,
    roomType: currentRoom.type,
    browser: navigator.userAgent.includes('Firefox') ? 'Firefox' : 'Other',
    socketConnected: socket.connected,
    currentUser: currentUser?.username
  });
  
  // Disable send button while processing
  const sendButton = messageForm.querySelector('.send-btn');
  sendButton.disabled = true;
  
  // Store original values in case we need to restore them
  const originalValue = messageInput.value;
  
  try {
    socket.emit('send_message', { 
      content, 
      roomId: currentRoom.id,
      roomType: currentRoom.type
    });
    
    // Clear input only after successful emit
    messageInput.value = '';
    
  } catch (error) {
    console.error('Error sending message:', error);
    showStatus('Failed to send message', 'error');
    // Restore original value on error
    messageInput.value = originalValue;
  }
  
  // Re-enable button after delay
  setTimeout(() => {
    sendButton.disabled = false;
    messageInput.focus();
  }, 500);
});

// Theme toggle event handler
themeToggle.addEventListener('click', toggleTheme);

// New chat button handler
newChatBtn.addEventListener('click', () => {
  // For now, just show a simple prompt
  const username = prompt('Enter username to start a private chat:');
  if (username && username.trim()) {
    const user = Array.from(onlineUsers.values()).find(u => 
      u.username.toLowerCase() === username.trim().toLowerCase()
    );
    if (user) {
      startPrivateChat(user);
    } else {
      showStatus('User not found or not online', 'error');
    }
  }
});

// General chat click handler
document.querySelector('.chat-item').addEventListener('click', () => {
  switchChat({ id: 1, name: 'General Chat', type: 'general' });
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

// Mobile sidebar toggle (for responsive design)
function toggleSidebar() {
  const sidebar = document.querySelector('.sidebar');
  sidebar.classList.toggle('open');
}

// Add mobile menu button (will be added via CSS media queries)
if (window.innerWidth <= 768) {
  const mobileMenuBtn = document.createElement('button');
  mobileMenuBtn.className = 'mobile-menu-btn';
  mobileMenuBtn.innerHTML = '☰';
  mobileMenuBtn.addEventListener('click', toggleSidebar);
  document.querySelector('.header-left').appendChild(mobileMenuBtn);
}
