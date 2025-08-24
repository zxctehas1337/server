// For now, export as CommonJS module
// TODO: Convert to TypeScript definitions

module.exports = {
  // User type structure
  UserType: {
    id: 'number',
    username: 'string',
    password_hash: 'string',
    created_at: 'string'
  },
  
  // Message type structure  
  MessageType: {
    id: 'number',
    user_id: 'number',
    content: 'string',
    timestamp: 'string'
  },
  
  // Socket event types
  SocketEvents: {
    SET_USERNAME: 'set_username',
    USERNAME_SET: 'username_set',
    SEND_MESSAGE: 'send_message', 
    NEW_MESSAGE: 'new_message',
    USER_JOINED: 'user_joined',
    USER_LEFT: 'user_left',
    ERROR: 'error'
  }
};
