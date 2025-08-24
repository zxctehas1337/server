const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const app = express();
const server = createServer(app);
const io = new Server(server);

// SQLite database
const db = new sqlite3.Database(':memory:');

// Initialize database
db.serialize(() => {
    // Users table
    db.run(`CREATE TABLE users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        avatar_url TEXT,
        theme_preference TEXT DEFAULT 'light',
        last_seen DATETIME DEFAULT CURRENT_TIMESTAMP,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
    
    // Chat rooms table
    db.run(`CREATE TABLE chat_rooms (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        room_type TEXT DEFAULT 'general',
        created_by INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(created_by) REFERENCES users(id)
    )`);
    
    // Messages table  
    db.run(`CREATE TABLE messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        room_id INTEGER NOT NULL DEFAULT 1,
        content TEXT NOT NULL,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(user_id) REFERENCES users(id),
        FOREIGN KEY(room_id) REFERENCES chat_rooms(id)
    )`);
    
    // Chat room participants
    db.run(`CREATE TABLE chat_room_participants (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        room_id INTEGER NOT NULL,
        user_id INTEGER NOT NULL,
        joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(room_id) REFERENCES chat_rooms(id),
        FOREIGN KEY(user_id) REFERENCES users(id),
        UNIQUE(room_id, user_id)
    )`);
    
    // Insert default general room
    db.run("INSERT INTO chat_rooms (id, name, room_type) VALUES (1, 'General Chat', 'general')");
});

// Middleware
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// Store connected users
const connectedUsers = new Map();
const userRooms = new Map();

// Helper function to broadcast online users
function broadcastOnlineUsers() {
    const onlineUsers = Array.from(connectedUsers.values())
        .filter((user, index, arr) => 
            arr.findIndex(u => u.userId === user.userId) === index
        )
        .map(user => ({
            id: user.userId,
            username: user.username
        }));
    
    io.emit('online_users', onlineUsers);
}

// Serve main page
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Socket.IO connection handling
io.on('connection', (socket) => {
    console.log(`User connected: ${socket.id}`);
    
    // Handle username setting
    socket.on('set_username', (data) => {
        const { username, password } = data;
        
        // Simple user creation/login
        const avatarUrl = `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(username.toLowerCase())}&backgroundColor=6366f1`;
        
        db.run(
            "INSERT OR IGNORE INTO users (username, password_hash, avatar_url) VALUES (?, ?, ?)",
            [username, password, avatarUrl],
            function(err) {
                if (err) {
                    socket.emit('username_set', {
                        success: false,
                        error: 'Error creating user'
                    });
                    return;
                }
                
                // Get user info
                db.get(
                    "SELECT id, username, avatar_url FROM users WHERE username = ?",
                    [username],
                    (err, user) => {
                        if (err || !user) {
                            socket.emit('username_set', {
                                success: false,
                                error: 'User not found'
                            });
                            return;
                        }
                        
                        // Store user info
                        connectedUsers.set(socket.id, {
                            username: user.username,
                            userId: user.id,
                            roomId: 1
                        });
                        
                        // Join general room
                        socket.join('room_1');
                        
                        // Add to room participants
                        db.run(
                            "INSERT OR IGNORE INTO chat_room_participants (room_id, user_id) VALUES (1, ?)",
                            [user.id]
                        );
                        
                        socket.emit('username_set', {
                            success: true,
                            user: {
                                id: user.id,
                                username: user.username,
                                avatar_url: user.avatar_url
                            }
                        });
                        
                        // Update online users
                        broadcastOnlineUsers();
                        
                        // Notify others
                        socket.broadcast.emit('user_joined', {
                            username: user.username,
                            message: `${user.username} joined the chat`
                        });
                    }
                );
            }
        );
    });
    
    // Handle joining room
    socket.on('join_room', (data) => {
        const userInfo = connectedUsers.get(socket.id);
        if (!userInfo) return;
        
        const { roomId } = data;
        
        // Leave current room
        if (userInfo.roomId) {
            socket.leave(`room_${userInfo.roomId}`);
        }
        
        // Join new room
        socket.join(`room_${roomId}`);
        userInfo.roomId = roomId;
        
        // Get recent messages
        db.all(
            `SELECT m.id, m.content, m.timestamp, m.user_id, u.username 
             FROM messages m 
             JOIN users u ON m.user_id = u.id 
             WHERE m.room_id = ? 
             ORDER BY m.timestamp DESC 
             LIMIT 50`,
            [roomId],
            (err, messages) => {
                socket.emit('room_joined', {
                    success: true,
                    roomId: roomId,
                    messages: messages ? messages.reverse() : []
                });
            }
        );
    });
    
    // Handle messages
    socket.on('send_message', (data) => {
        const userInfo = connectedUsers.get(socket.id);
        if (!userInfo) return;
        
        const { content, roomId } = data;
        const targetRoomId = roomId || userInfo.roomId || 1;
        
        if (!content || content.trim().length === 0) return;
        
        // Insert message
        db.run(
            "INSERT INTO messages (user_id, room_id, content) VALUES (?, ?, ?)",
            [userInfo.userId, targetRoomId, content.trim()],
            function(err) {
                if (err) {
                    socket.emit('error', { message: 'Failed to send message' });
                    return;
                }
                
                const messageData = {
                    id: this.lastID,
                    content: content.trim(),
                    username: userInfo.username,
                    userId: userInfo.userId,
                    roomId: targetRoomId,
                    timestamp: new Date().toISOString()
                };
                
                // Send to all clients in room
                io.to(`room_${targetRoomId}`).emit('new_message', messageData);
            }
        );
    });
    
    // Handle disconnection
    socket.on('disconnect', () => {
        const userInfo = connectedUsers.get(socket.id);
        
        if (userInfo) {
            console.log(`User ${userInfo.username} disconnected`);
            
            connectedUsers.delete(socket.id);
            broadcastOnlineUsers();
            
            socket.broadcast.emit('user_left', {
                username: userInfo.username,
                message: `${userInfo.username} left the chat`
            });
        }
    });
});

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Visit http://localhost:${PORT} to access the messenger`);
});
