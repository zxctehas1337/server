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

// Invitation modal elements
const invitationModal = document.getElementById('invitationModal');
const invitationAvatar = document.getElementById('invitationAvatar');
const invitationTitle = document.getElementById('invitationTitle');
const invitationMessage = document.getElementById('invitationMessage');
const acceptInvitationBtn = document.getElementById('acceptInvitationBtn');
const declineInvitationBtn = document.getElementById('declineInvitationBtn');
const invitationNotification = document.getElementById('invitationNotification');
const invitationNotificationAvatar = document.getElementById('invitationNotificationAvatar');
const invitationNotificationTitle = document.getElementById('invitationNotificationTitle');
const invitationNotificationMessage = document.getElementById('invitationNotificationMessage');

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
  
  console.log('Starting private chat with:', user.username, 'chatId:', chatId);
  
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
    console.log('Created new chat item for', user.username);
  }
  
  // Switch to this chat
  switchChat({
    id: chatId,
    name: user.username,
    type: 'private',
    userId: user.id
  });
  
  showStatus(`Started private chat with ${user.username}`, 'success');
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
  
  // Update suggested users in new chat modal if it's open
  if (newChatModal && newChatModal.classList.contains('show')) {
    updateSuggestedUsers();
  }
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

// New chat modal elements
const newChatModal = document.getElementById('newChatModal');
const newChatUsername = document.getElementById('newChatUsername');
const newChatCloseBtn = document.getElementById('newChatCloseBtn');
const newChatCancelBtn = document.getElementById('newChatCancelBtn');
const newChatStartBtn = document.getElementById('newChatStartBtn');
const suggestedUsers = document.getElementById('suggestedUsers');

// New chat modal functions
function showNewChatModal() {
  // Update suggested users list
  updateSuggestedUsers();
  
  // Clear and focus input
  newChatUsername.value = '';
  newChatModal.classList.add('show');
  document.body.style.overflow = 'hidden';
  
  // Focus input after modal is shown
  setTimeout(() => {
    newChatUsername.focus();
  }, 100);
}

function hideNewChatModal() {
  newChatModal.classList.remove('show');
  document.body.style.overflow = '';
  newChatUsername.value = '';
}

function updateSuggestedUsers() {
  suggestedUsers.innerHTML = '';
  
  const otherUsers = Array.from(onlineUsers.values()).filter(user => 
    user.id !== currentUser?.id
  );
  
  if (otherUsers.length === 0) {
    suggestedUsers.innerHTML = '<p class="no-users">No other users online</p>';
    return;
  }
  
  otherUsers.forEach(user => {
    const userItem = document.createElement('div');
    userItem.className = 'suggested-user';
    userItem.innerHTML = `
      <div class="user-avatar">${getAvatarInitials(user.username)}</div>
      <span class="user-name">${escapeHtml(user.username)}</span>
    `;
    
    userItem.addEventListener('click', () => {
      hideNewChatModal();
      startPrivateChat(user);
    });
    
    suggestedUsers.appendChild(userItem);
  });
}

function startNewChatFromModal() {
  const username = newChatUsername.value.trim();
  
  if (!username) {
    showStatus('Please enter a username', 'error');
    newChatUsername.focus();
    return;
  }
  
  const user = Array.from(onlineUsers.values()).find(u => 
    u.username.toLowerCase() === username.toLowerCase()
  );
  
  if (user) {
    hideNewChatModal();
    startPrivateChat(user);
  } else {
    showStatus('User not found or not online', 'error');
    newChatUsername.focus();
  }
}

// New chat button handler
newChatBtn.addEventListener('click', showNewChatModal);

// New chat modal event listeners
newChatCloseBtn.addEventListener('click', hideNewChatModal);
newChatCancelBtn.addEventListener('click', hideNewChatModal);
newChatStartBtn.addEventListener('click', startNewChatFromModal);

// Handle Enter key in username input
newChatUsername.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    startNewChatFromModal();
  }
});

// Close modal when clicking outside
newChatModal.addEventListener('click', (e) => {
  if (e.target === newChatModal) {
    hideNewChatModal();
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
function toggleMobileSidebar() {
  const sidebar = document.querySelector('.sidebar');
  const mobileOverlay = document.getElementById('mobileOverlay');
  
  sidebar.classList.toggle('open');
  mobileOverlay.classList.toggle('active');
  
  // Prevent body scroll when sidebar is open
  document.body.style.overflow = sidebar.classList.contains('open') ? 'hidden' : '';
}

function closeMobileSidebar() {
  const sidebar = document.querySelector('.sidebar');
  const mobileOverlay = document.getElementById('mobileOverlay');
  
  sidebar.classList.remove('open');
  mobileOverlay.classList.remove('active');
  document.body.style.overflow = '';
}

// Mobile navigation button handler
const mobileNavBtn = document.getElementById('mobileNavBtn');
if (mobileNavBtn) {
  mobileNavBtn.addEventListener('click', toggleMobileSidebar);
}

// Mobile overlay click handler
const mobileOverlay = document.getElementById('mobileOverlay');
if (mobileOverlay) {
  mobileOverlay.addEventListener('click', closeMobileSidebar);
}

// Close sidebar when switching chats on mobile
const originalSwitchChat = switchChat;
switchChat = function(room) {
  originalSwitchChat.call(this, room);
  
  // Close mobile sidebar after switching chat
  if (window.innerWidth <= 768) {
    closeMobileSidebar();
  }
};

// Handle escape key to close mobile sidebar
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    // Priority: first close new chat modal, then invitation modal, then close mobile sidebar
    if (newChatModal && newChatModal.classList.contains('show')) {
      hideNewChatModal();
    } else if (currentInvite) {
      hideInvitationModal();
    } else {
      closeMobileSidebar();
    }
  }
});

// Handle window resize for mobile responsiveness
const originalResizeHandler = window.onresize;
window.addEventListener('resize', () => {
  if (originalResizeHandler) originalResizeHandler();
  
  // Close sidebar if window is resized to desktop size
  if (window.innerWidth > 768) {
    closeMobileSidebar();
  }
  
  if (currentUser) {
    scrollToBottom();
  }
});

// ===== INVITATION MODAL FUNCTIONALITY =====

// State for managing invitations
let pendingInvitations = new Map();
let currentInvite = null;
let notificationTimer = null;

// UI Helper Functions for Invitation Modal
function showInvitationModal(invite) {
  if (!invite) return;
  
  currentInvite = invite;
  
  // Fill modal content
  invitationAvatar.textContent = getAvatarInitials(invite.fromUser.username);
  invitationTitle.textContent = 'Приглашение в приватный чат';
  invitationMessage.textContent = invite.message || `${invite.fromUser.username} хочет начать приватный чат с вами.`;
  
  // Show modal
  invitationModal.classList.add('show');
  
  // Add blur background effect
  document.body.style.overflow = 'hidden';
  
  // Hide notification toast if it's showing
  hideInvitationNotification();
}

function hideInvitationModal() {
  invitationModal.classList.remove('show');
  document.body.style.overflow = '';
  currentInvite = null;
}

function showInvitationNotification(invite) {
  if (!invite) return;
  
  // Clear any existing notification timer
  if (notificationTimer) {
    clearTimeout(notificationTimer);
  }
  
  // Fill notification content
  invitationNotificationAvatar.textContent = getAvatarInitials(invite.fromUser.username);
  invitationNotificationTitle.textContent = 'Новое приглашение';
  invitationNotificationMessage.textContent = `${invite.fromUser.username} приглашает в приватный чат`;
  
  // Show notification
  invitationNotification.classList.add('show');
  invitationNotification.classList.add('invitation-pulse');
  
  // Auto-hide after 6 seconds
  notificationTimer = setTimeout(() => {
    hideInvitationNotification();
  }, 6000);
  
  // Add click handler to open full modal
  const clickHandler = () => {
    hideInvitationNotification();
    showInvitationModal(invite);
    invitationNotification.removeEventListener('click', clickHandler);
  };
  
  invitationNotification.addEventListener('click', clickHandler);
}

function hideInvitationNotification() {
  invitationNotification.classList.remove('show');
  invitationNotification.classList.remove('invitation-pulse');
  
  if (notificationTimer) {
    clearTimeout(notificationTimer);
    notificationTimer = null;
  }
}

// Handle invitation response
function respondToInvite(accepted) {
  if (!currentInvite) return;
  
  const invite = currentInvite;
  
  // Disable buttons to prevent double-click
  acceptInvitationBtn.disabled = true;
  declineInvitationBtn.disabled = true;
  
  // Send response to server
  socket.emit('invitation_response', {
    inviteId: invite.inviteId,
    accepted: accepted
  });
  
  // Remove from pending invitations
  pendingInvitations.delete(invite.inviteId);
  
  // Hide modal
  hideInvitationModal();
  
  // Show appropriate status message
  if (accepted) {
    showStatus(`Принято приглашение от ${invite.fromUser.username}`, 'success');
    
    // Switch to the private chat room
    switchChat({
      id: invite.roomId,
      name: invite.fromUser.username,
      type: 'private',
      userId: invite.fromUser.id
    });
  } else {
    showStatus(`Отклонено приглашение от ${invite.fromUser.username}`, 'info');
  }
  
  // Re-enable buttons after delay
  setTimeout(() => {
    acceptInvitationBtn.disabled = false;
    declineInvitationBtn.disabled = false;
  }, 1000);
}

// Event Listeners for invitation buttons
acceptInvitationBtn.addEventListener('click', () => respondToInvite(true));
declineInvitationBtn.addEventListener('click', () => respondToInvite(false));

// Close modal when clicking outside of it
invitationModal.addEventListener('click', (e) => {
  if (e.target === invitationModal) {
    hideInvitationModal();
  }
});

// Note: Escape key handling is done in the main Escape handler above

// Socket event handler for incoming invitations
socket.on('private_invitation', (invite) => {
  console.log('Received private chat invitation:', invite);
  
  if (!invite || !invite.inviteId || !invite.fromUser) {
    console.error('Invalid invitation data:', invite);
    return;
  }
  
  // Store invitation
  pendingInvitations.set(invite.inviteId, invite);
  
  // Show notification toast
  showInvitationNotification(invite);
  
  // Play a subtle notification sound (if browser supports it)
  try {
    const audio = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+Dtyl4gBDWIzfPbfTEGHHnJ8OGVRAoRVK3n77BdGAg+ltryxnkpBSl+zPLaizsIGGS57+OZVA0NTaXh8bllHgg2jdXzzn0vBSF6yu/ejj0JE1Ko4/C2ZRwHN5DY88p9LgUme8rx3Y4+CRNSqOPwtmUcBzdOfz8B');
    audio.volume = 0.1;
    audio.play().catch(() => {});
  } catch (e) {
    // Ignore audio errors
  }
});

// Socket event handler for invitation response acknowledgment
socket.on('invitation_response_ack', (data) => {
  console.log('Invitation response acknowledged:', data);
  
  if (data.success) {
    if (data.accepted) {
      // Invitation was accepted, room should be joined
      showStatus('Подключение к приватному чату...', 'success');
    }
  } else {
    showStatus(data.error || 'Ошибка при обработке приглашения', 'error');
  }
});

// ===== TESTING FUNCTIONS (for demonstration) =====

// Test function to simulate invitation (for testing purposes)
function testInvitation() {
  const mockInvitation = {
    inviteId: 'test-invite-' + Date.now(),
    roomId: 'private_1_2',
    fromUser: {
      id: 2,
      username: 'TestUser'
    },
    message: 'Хочу обсудить с вами важный вопрос в приватном чате.'
  };
  
  console.log('Testing invitation modal with mock data:', mockInvitation);
  showInvitationNotification(mockInvitation);
}

// Make test function globally available for console testing
window.testInvitation = testInvitation;

// Console helper message
console.log('🔧 Invitation modal is ready! You can test it by calling testInvitation() in the console.');
console.log('📋 Available test functions:', {
  testInvitation: 'Shows a mock invitation notification',
  showInvitationModal: 'Directly shows the modal with mock data',
  hideInvitationModal: 'Hides the modal',
  showInvitationNotification: 'Shows notification toast',
  hideInvitationNotification: 'Hides notification toast'
});

