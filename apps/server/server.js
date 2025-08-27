require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const cors = require('cors'); // Добавлено

const app = express();
const server = createServer(app);

// CORS middleware
app.use(cors({
  origin: true,
  credentials: true
}));
const io = new Server(server, {
  cors: {
    origin: true,
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Admin-Password'],
    credentials: true
  }
});

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
app.set('trust proxy', 1);
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

// GitHub OAuth endpoint
app.get('/api/auth/github', (req, res) => {
    // Redirect to GitHub OAuth
    const clientId = process.env.GITHUB_CLIENT_ID;
    if (!clientId) {
        return res.status(500).json({ error: 'GitHub Client ID not configured' });
    }
    const redirectUri = process.env.GITHUB_CALLBACK_URL || `${req.protocol}://${req.get('host')}/api/auth/github/callback`;
    const githubAuthUrl = `https://github.com/login/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=user:email`;
    
    res.redirect(githubAuthUrl);
});

app.get('/api/auth/github/callback', async (req, res) => {
    const { code } = req.query;
    
    if (!code) {
        return res.redirect('/?error=github_auth_failed');
    }
    
    try {
        // Exchange code for access token
        const axios = require('axios');
        const tokenResponse = await axios.post('https://github.com/login/oauth/access_token', {
            client_id: process.env.GITHUB_CLIENT_ID,
            client_secret: process.env.GITHUB_CLIENT_SECRET,
            code: code
        }, {
            headers: {
                'Accept': 'application/json'
            }
        });

        const { access_token } = tokenResponse.data;

        if (!access_token) {
            console.error('Failed to get access token:', tokenResponse.data);
            return res.redirect('/?error=github_auth_failed');
        }

        // Get user data from GitHub
        const userResponse = await axios.get('https://api.github.com/user', {
            headers: {
                'Authorization': `token ${access_token}`,
                'Accept': 'application/vnd.github.v3+json'
            }
        });

        // Get user emails (optional; may be forbidden for some tokens)
        let emails = [];
        try {
            const emailsResponse = await axios.get('https://api.github.com/user/emails', {
                headers: {
                    'Authorization': `token ${access_token}`,
                    'Accept': 'application/vnd.github.v3+json'
                }
            });
            emails = emailsResponse.data || [];
        } catch (e) {
            // Continue without emails; will create user without email
            emails = [];
        }

        const userData = userResponse.data;
        const primaryEmail = emails.find(email => email.primary)?.email || emails[0]?.email;

        // Check if user already exists
        db.get(
            'SELECT * FROM users WHERE github_id = ?',
            [userData.id.toString()],
            async (err, existingUser) => {
                if (err) {
                    console.error('Error checking existing user:', err);
                    return res.redirect('/?error=github_auth_failed');
                }

                if (existingUser) {
                    // User exists, update last seen
                    db.run(
                        'UPDATE users SET last_seen = CURRENT_TIMESTAMP WHERE id = ?',
                        [existingUser.id],
                        (updateErr) => {
                            if (updateErr) {
                                console.error('Error updating user:', updateErr);
                            }
                            
                            // Generate JWT token
                            const jwt = require('jsonwebtoken');
                            const token = jwt.sign(
                                { userId: existingUser.id, username: existingUser.username },
                                process.env.JWT_SECRET || 'your-secret-key',
                                { expiresIn: '7d' }
                            );
                            
                            res.redirect(`/?token=${token}`);
                        }
                    );
                } else {
                    // Create new user
                    const username = userData.login || `github_${userData.id}`;
                    const avatarUrl = userData.avatar_url;
                    
                    db.run(
                        `INSERT INTO users (username, email, github_id, avatar_url, email_verified, is_oauth_user) 
                         VALUES (?, ?, ?, ?, 1, 1)`,
                        [username, primaryEmail, userData.id.toString(), avatarUrl],
                        function(insertErr) {
                            if (insertErr) {
                                console.error('Error creating GitHub user:', insertErr);
                                return res.redirect('/?error=github_auth_failed');
                            }
                            
                            // Add user to general chat room
                            db.run(
                                'INSERT OR IGNORE INTO chat_room_participants (room_id, user_id) VALUES (?, ?)',
                                [1, this.lastID],
                                (participantErr) => {
                                    if (participantErr) {
                                        console.error('Error adding user to chat room:', participantErr);
                                    }
                                    
                                    // Send welcome email
                                    const { sendWelcomeEmail } = require('./utils/email');
                                    if (primaryEmail) {
                                        sendWelcomeEmail(primaryEmail, username).catch(emailErr => {
                                            console.error('Error sending welcome email:', emailErr);
                                        });
                                    }
                                    
                                    // Generate JWT token
                                    const jwt = require('jsonwebtoken');
                                    const token = jwt.sign(
                                        { userId: this.lastID, username: username },
                                        process.env.JWT_SECRET || 'your-secret-key',
                                        { expiresIn: '7d' }
                                    );
                                    
                                    res.redirect(`/?token=${token}`);
                                }
                            );
                        }
                    );
                }
            }
        );
    } catch (error) {
        console.error('GitHub OAuth error:', error);
        res.redirect('/?error=github_auth_failed');
    }
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
                
                // Send verification email via SMTP
                const { sendVerificationEmail } = require('./utils/email.js');
                sendVerificationEmail(email, username, verificationCode)
                    .then(() => {
                        res.json({ success: true, message: 'Код подтверждения отправлен на ваш email' });
                    })
                    .catch(async (emailErr) => {
                        console.error('Email sending error:', emailErr);
                        // Rollback: delete user if email failed to send
                        db.run('DELETE FROM users WHERE id = ?', [this.lastID], () => {
                            return res.status(500).json({ success: false, error: 'Ошибка при отправке email. Попробуйте позже.' });
                        });
                    });
            }
        );
    });
});

// Username/password login
app.post('/api/auth/login', (req, res) => {
    const { username, email, identifier, password } = req.body;

    const loginIdentifier = identifier || email || username;

    if (!loginIdentifier || !password) {
        return res.status(400).json({ success: false, error: 'Имя пользователя/Email и пароль обязательны' });
    }

    db.get(
        'SELECT id, username, password_hash, avatar_url, email, email_verified FROM users WHERE username = ? OR email = ?',
        [loginIdentifier, loginIdentifier],
        (err, user) => {
            if (err) {
                return res.status(500).json({ success: false, error: 'Ошибка при поиске пользователя' });
            }

            if (!user) {
                return res.status(401).json({ success: false, error: 'Неверное имя пользователя или пароль' });
            }

            // If user registered with email/password, enforce verified email before login
            if (user.email && !user.email_verified) {
                return res.status(401).json({ success: false, error: 'Пожалуйста, подтвердите ваш email перед входом' });
            }

            const bcrypt = require('bcrypt');
            bcrypt.compare(password, user.password_hash || '', (compareErr, isMatch) => {
                if (compareErr) {
                    return res.status(500).json({ success: false, error: 'Ошибка при проверке пароля' });
                }

                if (!isMatch) {
                    return res.status(401).json({ success: false, error: 'Неверное имя пользователя или пароль' });
                }

                // Ensure avatar_url is present
                const seed = (user.username || user.email || loginIdentifier).toLowerCase();
                const avatarUrl = user.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(seed)}&backgroundColor=6366f1`;

                // Update last seen and avatar if missing
                db.run('UPDATE users SET last_seen = CURRENT_TIMESTAMP, avatar_url = COALESCE(avatar_url, ?) WHERE id = ?', [avatarUrl, user.id]);

                // Ensure user is in general chat room
                db.run('INSERT OR IGNORE INTO chat_room_participants (room_id, user_id) VALUES (1, ?)', [user.id]);

                const tokenPayload = {
                    id: user.id,
                    username: user.username,
                    email: user.email,
                    avatar_url: avatarUrl
                };
                const token = Buffer.from(JSON.stringify(tokenPayload)).toString('base64');

                return res.json({ success: true, token });
            });
        }
    );
});

// Email login: start (send code)
app.post('/api/auth/login-email-start', (req, res) => {
    const { email } = req.body;

    if (!email || !email.includes('@')) {
        return res.status(400).json({ success: false, error: 'Пожалуйста, введите корректный email' });
    }

    db.get(
        `SELECT id, username, email, email_verified FROM users WHERE email = ?`,
        [email],
        (err, user) => {
            if (err) {
                return res.status(500).json({ success: false, error: 'Ошибка при поиске пользователя' });
            }

            if (!user) {
                return res.status(400).json({ success: false, error: 'Пользователь с таким email не найден' });
            }

            if (!user.email_verified) {
                return res.status(400).json({ success: false, error: 'Email не подтвержден. Завершите регистрацию.' });
            }

            const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
            const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

            db.run(
                `UPDATE users 
                 SET verification_code = ?, verification_code_expires = ?
                 WHERE id = ?`,
                [verificationCode, expiresAt.toISOString(), user.id],
                (updateErr) => {
                    if (updateErr) {
                        return res.status(500).json({ success: false, error: 'Ошибка при создании кода' });
                    }
                    // Send code via email
                    const { sendVerificationEmail } = require('./utils/email.js');
                    sendVerificationEmail(email, user.username, verificationCode)
                        .then(() => {
                            return res.json({ success: true, message: 'Код входа отправлен на ваш email' });
                        })
                        .catch(() => {
                            return res.status(500).json({ success: false, error: 'Ошибка при отправке email' });
                        });
                }
            );
        }
    );
});

// Email login: verify code and return token
app.post('/api/auth/login-email-verify', (req, res) => {
    const { email, code } = req.body;

    if (!email || !email.includes('@') || !code || code.length !== 6) {
        return res.status(400).json({ success: false, error: 'Неверные данные' });
    }

    db.get(
        `SELECT id, username, email, avatar_url, verification_code_expires 
         FROM users 
         WHERE email = ? AND verification_code = ?`,
        [email, code],
        (err, user) => {
            if (err) {
                return res.status(500).json({ success: false, error: 'Ошибка при проверке кода' });
            }

            if (!user) {
                return res.status(400).json({ success: false, error: 'Неверный код' });
            }

            if (new Date() > new Date(user.verification_code_expires)) {
                return res.status(400).json({ success: false, error: 'Код истек' });
            }

            // Clear code and mark last_seen
            db.run(
                `UPDATE users 
                 SET verification_code = NULL, verification_code_expires = NULL, last_seen = CURRENT_TIMESTAMP
                 WHERE id = ?`,
                [user.id],
                (updateErr) => {
                    if (updateErr) {
                        return res.status(500).json({ success: false, error: 'Ошибка при обновлении пользователя' });
                    }

                    const tokenPayload = {
                        id: user.id,
                        username: user.username,
                        email: user.email,
                        avatar_url: user.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent((user.username || user.email).toLowerCase())}&backgroundColor=6366f1`
                    };
                    const token = Buffer.from(JSON.stringify(tokenPayload)).toString('base64');

                    return res.json({ success: true, token });
                }
            );
        }
    );
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
                        'INSERT OR IGNORE INTO chat_room_participants (room_id, user_id) VALUES (1, ?)',
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
                    // Send verification email
                    const { sendVerificationEmail } = require('./utils/email.js');
                    sendVerificationEmail(email, user.username, verificationCode)
                        .then(() => {
                            res.json({ success: true, message: 'Код подтверждения отправлен повторно' });
                        })
                        .catch(() => {
                            res.status(500).json({ success: false, error: 'Ошибка при отправке email' });
                        });
                }
            );
        }
    );
});

// Socket.IO connection handling
io.on('connection', (socket) => {
    console.log(`User connected: ${socket.id}`);
    
    // Handle token authentication (for OAuth users)
    socket.on('authenticate_with_token', (data) => {
        const { token } = data;
        
        if (!token) {
            socket.emit('token_auth_error', { error: 'Token is required' });
            return;
        }
        
        try {
            let userData = null;
            // Support both Base64 tokens and JWTs
            if (typeof token === 'string' && token.split('.').length === 3) {
                try {
                    const jwt = require('jsonwebtoken');
                    userData = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
                } catch (_) {
                    // If JWT verification fails, fall back to base64 parsing
                    userData = JSON.parse(Buffer.from(token, 'base64').toString());
                }
            } else {
                userData = JSON.parse(Buffer.from(token, 'base64').toString());
            }
            
            // Prefer lookup by id/userId if present, otherwise by username
            const lookupId = userData.userId || userData.id;
            const lookupUsername = userData.username;
            const querySql = lookupId
                ? 'SELECT id, username, email, avatar_url, email_verified FROM users WHERE id = ?'
                : 'SELECT id, username, email, avatar_url, email_verified FROM users WHERE username = ?';
            const queryParam = lookupId ? [lookupId] : [lookupUsername];

            db.get(
                querySql,
                queryParam,
                (err, user) => {
                    if (err) {
                        socket.emit('token_auth_error', { error: 'Database error' });
                        return;
                    }
                    
                    if (!user) {
                        socket.emit('token_auth_error', { error: 'User not found' });
                        return;
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
                    socket.emit('token_auth_success', {
                        success: true,
                        user: {
                            id: user.id,
                            username: user.username,
                            avatar_url: user.avatar_url,
                            email: user.email,
                            email_verified: user.email_verified
                        }
                    });
                    
                    // Add user to general chat room (idempotent)
                    db.run('INSERT OR IGNORE INTO chat_room_participants (room_id, user_id) VALUES (1, ?)', [user.id]);
                    
                    // Broadcast online users
                    broadcastOnlineUsers();
                    
                    // Notify others
                    socket.broadcast.emit('user_joined', {
                        username: user.username,
                        message: `${user.username} joined the chat`
                    });
                    
                    console.log(`User authenticated with token: ${user.username} (ID: ${user.id})`);
                }
            );
        } catch (error) {
            socket.emit('token_auth_error', { error: 'Invalid token' });
        }
    });

    // Username/password login removed in favor of GitHub OAuth and Email code login
    
    // Handle joining room (single general room only)
    socket.on('join_room', (data) => {
        const userInfo = connectedUsers.get(socket.id);
        if (!userInfo) return;
        
        const numericRoomId = 1;
        
        // Leave current room
        if (userInfo.roomId) {
            socket.leave(`room_${userInfo.roomId}`);
        }
        
        // Join new room
        socket.join(`room_${numericRoomId}`);
        userInfo.roomId = numericRoomId;
        
        // Get recent messages
        db.all(
            `SELECT m.id, m.content, m.timestamp, m.user_id, u.username 
             FROM messages m 
             JOIN users u ON m.user_id = u.id 
             WHERE m.room_id = ? 
             ORDER BY m.timestamp DESC 
             LIMIT 50`,
            [numericRoomId],
            (err, messages) => {
                socket.emit('room_joined', {
                    success: true,
                    roomId: numericRoomId,
                    messages: messages ? messages.reverse() : []
                });
            }
        );
    });
    
    // Handle messages (force general room)
    socket.on('send_message', (data) => {
        const userInfo = connectedUsers.get(socket.id);
        if (!userInfo) return;
        
        const { content } = data;
        const targetRoomId = 1;
        
        if (!content || content.trim().length === 0) return;
        
        // Insert message
        db.run(
            "INSERT INTO messages (user_id, room_id, content) VALUES (?, ?, ?)",
            [userInfo.userId, targetRoomId, content.trim()],
            function(err) {
                if (err) {
                    // Use a custom event name instead of reserved 'error'
                    socket.emit('server_error', { message: 'Failed to send message' });
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
