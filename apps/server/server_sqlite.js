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
        password_hash TEXT,
        email TEXT UNIQUE,
        github_id TEXT UNIQUE,
        avatar_url TEXT,
        email_verified INTEGER DEFAULT 0,
        verification_code TEXT,
        verification_code_expires DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        last_seen DATETIME DEFAULT CURRENT_TIMESTAMP,
        is_oauth_user INTEGER DEFAULT 0
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

// API endpoints for authentication
app.post('/api/auth/register', (req, res) => {
    const { username, email, password } = req.body;
    
    if (!username || !email || !password) {
        return res.status(400).json({ success: false, error: 'Все поля обязательны для заполнения' });
    }
    
    if (username.length < 3) {
        return res.status(400).json({ success: false, error: 'Имя пользователя должно содержать минимум 3 символа' });
    }
    
    if (password.length < 6) {
        return res.status(400).json({ success: false, error: 'Пароль должен содержать минимум 6 символов' });
    }
    
    const bcrypt = require('bcrypt');
    const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes
    
    bcrypt.hash(password, 10).then(hash => {
        db.run(
            `INSERT INTO users (username, email, password_hash, verification_code, verification_code_expires) 
             VALUES (?, ?, ?, ?, ?)`,
            [username, email, hash, verificationCode, expiresAt.toISOString()],
            function(err) {
                if (err) {
                    if (err.message.includes('UNIQUE constraint failed')) {
                        return res.status(400).json({ success: false, error: 'Пользователь с таким именем или email уже существует' });
                    }
                    return res.status(500).json({ success: false, error: 'Ошибка при регистрации' });
                }
                
                console.log(`Verification code for ${email}: ${verificationCode}`);
                res.json({ success: true, message: 'Код подтверждения отправлен на ваш email' });
            }
        );
    });
});

app.post('/api/auth/verify-email', (req, res) => {
    const { code } = req.body;
    
    if (!code || code.length !== 6) {
        return res.status(400).json({ success: false, error: 'Неверный код подтверждения' });
    }
    
    db.get(
        `SELECT id, username, email, verification_code, verification_code_expires 
         FROM users 
         WHERE verification_code = ? AND email_verified = 0`,
        [code],
        (err, user) => {
            if (err) {
                return res.status(500).json({ success: false, error: 'Ошибка при проверке кода' });
            }
            
            if (!user) {
                return res.status(400).json({ success: false, error: 'Неверный код подтверждения' });
            }
            
            if (new Date() > new Date(user.verification_code_expires)) {
                return res.status(400).json({ success: false, error: 'Код подтверждения истек' });
            }
            
            db.run(
                `UPDATE users 
                 SET email_verified = 1, 
                     verification_code = NULL, 
                     verification_code_expires = NULL,
                     updated_at = CURRENT_TIMESTAMP
                 WHERE id = ?`,
                [user.id],
                (err) => {
                    if (err) {
                        return res.status(500).json({ success: false, error: 'Ошибка при подтверждении email' });
                    }
                    
                    // Add user to general chat room
                    db.run(
                        'INSERT INTO chat_room_participants (room_id, user_id) VALUES (1, ?)',
                        [user.id]
                    );
                    
                    res.json({ success: true, message: 'Email успешно подтвержден' });
                }
            );
        }
    );
});

app.post('/api/auth/resend-code', (req, res) => {
    const { email } = req.body;
    
    if (!email || !email.includes('@')) {
        return res.status(400).json({ success: false, error: 'Пожалуйста, введите корректный email' });
    }
    
    db.get(
        `SELECT id, username, email 
         FROM users 
         WHERE email = ? AND email_verified = 0`,
        [email],
        (err, user) => {
            if (err) {
                return res.status(500).json({ success: false, error: 'Ошибка при поиске пользователя' });
            }
            
            if (!user) {
                return res.status(400).json({ success: false, error: 'Пользователь с таким email не найден' });
            }
            
            const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
            const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes
            
            db.run(
                `UPDATE users 
                 SET verification_code = ?, 
                     verification_code_expires = ?
                 WHERE id = ?`,
                [verificationCode, expiresAt.toISOString(), user.id],
                (err) => {
                    if (err) {
                        return res.status(500).json({ success: false, error: 'Ошибка при обновлении кода' });
                    }
                    
                    console.log(`New verification code for ${email}: ${verificationCode}`);
                    res.json({ success: true, message: 'Код подтверждения отправлен повторно' });
                }
            );
        }
    );
});

// Socket.IO connection handling
io.on('connection', (socket) => {
    console.log(`User connected: ${socket.id}`);
    
    // Handle login (only for existing users)
    socket.on('login', (data) => {
        const { username, password } = data;
        
        if (!username || !password || username.length < 3 || password.length < 4) {
            socket.emit('login_error', { error: 'Неверные учетные данные' });
            return;
        }
        
        const bcrypt = require('bcrypt');
        
        db.get(
            'SELECT id, username, password_hash, email, email_verified, avatar_url FROM users WHERE username = ?',
            [username],
            (err, user) => {
                if (err) {
                    socket.emit('login_error', { error: 'Ошибка сервера при входе' });
                    return;
                }
                
                if (!user) {
                    socket.emit('login_error', { error: 'Пользователь не найден. Зарегистрируйтесь через email или войдите через GitHub.' });
                    return;
                }
                
                // Check if email is verified (for non-OAuth users)
                if (user.email && !user.email_verified && !user.is_oauth_user) {
                    socket.emit('login_error', { error: 'Пожалуйста, подтвердите ваш email перед входом' });
                    return;
                }
                
                bcrypt.compare(password, user.password_hash, (err, isMatch) => {
                    if (err || !isMatch) {
                        socket.emit('login_error', { error: 'Неверное имя пользователя или пароль' });
                        return;
                    }
                    
                    // Generate avatar URL if not set
                    let avatarUrl = user.avatar_url;
                    if (!avatarUrl) {
                        avatarUrl = `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(username.toLowerCase())}&backgroundColor=6366f1`;
                        db.run('UPDATE users SET avatar_url = ? WHERE id = ?', [avatarUrl, user.id]);
                    }
                    
                    // Update last seen
                    db.run('UPDATE users SET last_seen = CURRENT_TIMESTAMP WHERE id = ?', [user.id]);
                    
                    // Store user info for this socket
                    connectedUsers.set(socket.id, {
                        username: user.username,
                        userId: user.id,
                        roomId: 1
                    });
                    
                    // Initialize user rooms
                    if (!userRooms.has(user.id)) {
                        userRooms.set(user.id, new Set([1]));
                    }
                    
                    // Join user to general room
                    socket.join('room_1');
                    
                    // Send success response
                    socket.emit('login_success', {
                        success: true,
                        user: {
                            id: user.id,
                            username: user.username,
                            avatar_url: avatarUrl,
                            email: user.email,
                            email_verified: user.email_verified
                        }
                    });
                    
                    // Add user to general chat room
                    db.run('INSERT INTO chat_room_participants (room_id, user_id) VALUES (1, ?)', [user.id]);
                    
                    // Broadcast online users
                    broadcastOnlineUsers();
                    
                    // Notify others
                    socket.broadcast.emit('user_joined', {
                        username: user.username,
                        message: `${user.username} joined the chat`
                    });
                    
                    console.log(`User logged in: ${user.username} (ID: ${user.id})`);
                });
            }
        );
    });
        
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
