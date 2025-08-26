const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const hpp = require('hpp');
const pino = require('pino');
const logger = pino({ level: process.env.LOG_LEVEL || 'info' });
const { createServer } = require('http');
const { Server } = require('socket.io');
const { Pool } = require('pg');
const path = require('path');
const fs = require('fs');
const passport = require('passport');
const GitHubStrategy = require('passport-github2').Strategy;
const jwt = require('jsonwebtoken');
// Load environment variables from .env (try multiple locations)
(() => {
	try {
		const dotenv = require('dotenv');
		let loaded = false;
		// 1) Try CWD/.env (Render often runs from repo root)
		const cwdEnv = path.resolve(process.cwd(), '.env');
		if (fs.existsSync(cwdEnv)) {
			dotenv.config({ path: cwdEnv });
			logger.info({ envPath: cwdEnv }, 'Loaded .env from CWD');
			loaded = true;
		}
		// 2) Try apps/server/.env (when running server from monorepo root)
		const serverEnv = path.resolve(process.cwd(), 'apps/server/.env');
		if (!loaded && fs.existsSync(serverEnv)) {
			dotenv.config({ path: serverEnv });
			logger.info({ envPath: serverEnv }, 'Loaded .env from apps/server');
			loaded = true;
		}
		// 3) Fallback to default (dotenv will search up the tree)
		if (!loaded) {
			dotenv.config();
			logger.warn('No explicit .env found; using default dotenv config');
		}
	} catch (e) {
		console.error('dotenv load error:', e);
	}
})();

const app = express();
const server = createServer(app);
const io = new Server(server);

// Database connection pool
const pool = new Pool({
    connectionString: process.env.DATABASE_URL || `postgresql://${process.env.DB_USER || 'postgres'}:${process.env.DB_PASSWORD || 'password'}@${process.env.DB_HOST || 'localhost'}:${process.env.DB_PORT || 5432}/${process.env.DB_NAME || 'browser_messenger'}`
});

// Configure Passport GitHub OAuth (stateless)
const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID;
const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET;
const GITHUB_CALLBACK_URL = process.env.GITHUB_CALLBACK_URL || 'https://beckend-yaj1.onrender.com/api/auth/github/callback';
if (GITHUB_CLIENT_ID && GITHUB_CLIENT_SECRET) {
    passport.use(new GitHubStrategy({
        clientID: GITHUB_CLIENT_ID,
        clientSecret: GITHUB_CLIENT_SECRET,
        callbackURL: GITHUB_CALLBACK_URL,
        scope: ['user:email']
    }, async (accessToken, refreshToken, profile, done) => {
        try {
            // Find by github_id
            const existing = await pool.query('SELECT * FROM users WHERE github_id = $1', [profile.id]);
            if (existing.rows.length > 0) {
                // Update last_seen
                await pool.query('UPDATE users SET last_seen = CURRENT_TIMESTAMP WHERE id = $1', [existing.rows[0].id]);
                return done(null, existing.rows[0]);
            }
            // Prepare fields
            const email = Array.isArray(profile.emails) && profile.emails[0] ? profile.emails[0].value : null;
            const username = profile.username || `github_${profile.id}`;
            const avatarUrl = Array.isArray(profile.photos) && profile.photos[0] ? profile.photos[0].value : null;
            // Create user
            const insert = await pool.query(
                `INSERT INTO users (username, email, github_id, avatar_url, is_oauth_user)
                 VALUES ($1, $2, $3, $4, true)
                 RETURNING *`,
                [username, email, profile.id, avatarUrl]
            );
            const user = insert.rows[0];
            // Ensure general room membership
            await pool.query(
                'INSERT INTO chat_room_participants (room_id, user_id) VALUES ($1, $2) ON CONFLICT (room_id, user_id) DO NOTHING',
                [1, user.id]
            );
            return done(null, user);
        } catch (e) {
            return done(e);
        }
    }));
}

// In-memory recent logs buffer for admin viewing
const recentLogs = [];
const maxRecentLogs = parseInt(process.env.ADMIN_LOG_BUFFER || '1000', 10);
function pushRecentLog(level, obj, msg) {
    try {
        recentLogs.push({
            ts: new Date().toISOString(),
            level,
            msg: typeof msg === 'string' ? msg : '',
            data: obj && typeof obj === 'object' ? obj : undefined
        });
        if (recentLogs.length > maxRecentLogs) {
            recentLogs.splice(0, recentLogs.length - maxRecentLogs);
        }
    } catch (_) {
        // noop – avoid breaking logging on buffer errors
    }
}

// Monkey-patch logger methods to also store in-memory logs
['debug','info','warn','error'].forEach((lvl) => {
    const orig = logger[lvl] && logger[lvl].bind(logger);
    if (!orig) return;
    logger[lvl] = function(arg1, arg2) {
        if (typeof arg1 === 'string') {
            pushRecentLog(lvl, undefined, arg1);
        } else {
            pushRecentLog(lvl, arg1, arg2);
        }
        return orig.apply(logger, arguments);
    };
});

// Test database connection
pool.connect((err, client, release) => {
    if (err) {
        console.error('Error connecting to database:', err.stack);
    } else {
        console.log('Database connected successfully');
        release();
    }
});

// Middleware
//tabine hello
// Определяем корректный путь к публичным файлам для production

// Для Render и локально: используем абсолютный путь от process.cwd()
const publicPath = path.resolve(process.cwd(), 'apps/server/public');
const indexPath = path.resolve(publicPath, 'index.html');
const notFoundPath = path.resolve(process.cwd(), 'apps/server/404.html');

logger.info({ publicPath }, 'Static files path');
logger.info({ indexPath }, 'Index file path');
logger.debug({ cwd: process.cwd(), dirname: __dirname }, 'Process directories');

// Проверяем существование критических файлов
try {
    const publicExists = fs.existsSync(publicPath);
    const indexExists = fs.existsSync(indexPath);
    const notFoundExists = fs.existsSync(notFoundPath);
    
    logger.info({ publicExists, indexExists }, 'Public and index existence');
    
    if (publicExists) {
        const files = fs.readdirSync(publicPath);
        logger.debug({ files }, 'Files in public directory');
    }
    
    if (!indexExists) {
        logger.error({ indexPath, files: fs.readdirSync(__dirname) }, 'CRITICAL: index.html not found');
    } else {
        logger.info('index.html found successfully');
    }
    if (!notFoundExists) {
        logger.warn({ notFoundPath }, '404.html not found; 404s will return plain text');
    }
} catch (error) {
    logger.error({ err: error }, 'Error checking files');
}

// Security middleware stack
app.use(helmet({
    contentSecurityPolicy: false
}));

const allowedOrigins = (process.env.CORS_ORIGINS || '').split(',').filter(Boolean);
app.use(cors({
    origin: allowedOrigins.length > 0 ? allowedOrigins : true,
    credentials: true
}));

app.use(hpp());
app.use(compression());
app.use(rateLimit({ windowMs: 60 * 1000, max: 120 }));
app.use(express.json({ limit: '1mb' }));
app.use(express.static(publicPath, { maxAge: '1h', etag: true, lastModified: true }));
app.use(passport.initialize());

// Store connected users
const connectedUsers = new Map(); // socketId -> { username, userId, roomId }
const userRooms = new Map(); // userId -> Set of roomIds

// Helper function to broadcast online users
function broadcastOnlineUsers() {
    const onlineUsers = Array.from(connectedUsers.values())
        .filter((user, index, arr) => 
            // Remove duplicates by userId
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
    res.sendFile(indexPath);
});

// GitHub OAuth routes
if (GITHUB_CLIENT_ID && GITHUB_CLIENT_SECRET) {
    app.get('/api/auth/github', passport.authenticate('github', { scope: ['user:email'], session: false }));
    app.get('/api/auth/github/callback', passport.authenticate('github', { session: false, failureRedirect: '/' }), async (req, res) => {
        try {
            const user = req.user;
            const token = jwt.sign(
                { userId: user.id, username: user.username },
                process.env.JWT_SECRET || 'dev-secret',
                { expiresIn: '7d' }
            );
            res.redirect(`/?token=${encodeURIComponent(token)}`);
        } catch (e) {
            logger.error({ err: e }, 'OAuth callback error');
            res.redirect('/');
        }
    });
} else {
    logger.warn('GitHub OAuth not configured; set GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET');
}

// API info endpoint
app.get('/api', (req, res) => {
    res.json({
        message: 'Kracken Messenger Backend API',
        version: '2.0.0',
        status: 'online',
        endpoints: {
            socketio: 'Connect via Socket.IO for real-time messaging',
            events: ['set_username', 'join_room', 'send_message', 'new_message', 'online_users']
        },
        timestamp: new Date().toISOString()
    });
});

// Basic healthcheck endpoint
app.get('/api/health', async (req, res) => {
    const start = Date.now();
    let dbOk = false;
    try {
        const result = await pool.query('SELECT 1 as ok');
        dbOk = result.rows[0]?.ok === 1;
    } catch (e) {
        logger.error({ err: e }, 'Healthcheck DB query failed');
    }
    res.json({
        ok: true,
        uptimeSec: Math.round(process.uptime()),
        db: dbOk ? 'ok' : 'error',
        latencyMs: Date.now() - start,
        timestamp: new Date().toISOString()
    });
});

// Simple ping endpoint
app.get('/api/ping', (req, res) => {
    res.json({ pong: true, timestamp: new Date().toISOString() });
});

// Server time endpoint
app.get('/api/time', (req, res) => {
    const now = new Date();
    res.json({
        iso: now.toISOString(),
        epochMs: now.getTime(),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
    });
});

// Echo endpoint (for testing any HTTP method)
app.all('/api/echo', (req, res) => {
    res.json({
        method: req.method,
        path: req.path,
        query: req.query,
        body: req.body,
        headers: {
            'user-agent': req.get('user-agent'),
            'content-type': req.get('content-type'),
            'accept': req.get('accept')
        },
        ip: req.ip,
        timestamp: new Date().toISOString()
    });
});

// Demo login endpoint (username/password)
app.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body || {};
        if (!username || !password) {
            return res.status(400).json({ success: false, error: 'username and password are required' });
        }

        const userResult = await pool.query(
            `SELECT id, username, password_hash, COALESCE(avatar_url, '') as avatar_url FROM users WHERE username = $1`,
            [username]
        );
        if (userResult.rows.length === 0) {
            return res.status(401).json({ success: false, error: 'Invalid credentials' });
        }

        const bcrypt = require('bcrypt');
        const valid = await bcrypt.compare(password, userResult.rows[0].password_hash);
        if (!valid) {
            return res.status(401).json({ success: false, error: 'Invalid credentials' });
        }

        // For test purposes, we do not issue JWT here. Return user info only.
        const user = {
            id: userResult.rows[0].id,
            username: userResult.rows[0].username,
            avatar_url: userResult.rows[0].avatar_url
        };
        return res.json({ success: true, user });
    } catch (err) {
        logger.error({ err }, 'Login error');
        return res.status(500).json({ success: false, error: 'Server error' });
    }
});

// Demo logout endpoint (stateless stub)
app.post('/logout', (req, res) => {
    res.json({ success: true, message: 'Logged out (stateless stub)' });
});

// Test GitHub OAuth endpoint (for production testing)
app.get('/api/test/github-oauth', (req, res) => {
    res.json({
        success: true,
        message: 'GitHub OAuth endpoint ready for testing',
        endpoints: {
            auth: 'https://beckend-yaj1.onrender.com/api/auth/github',
            callback: 'https://beckend-yaj1.onrender.com/api/auth/github/callback'
        },
        config: {
            clientId: process.env.GITHUB_CLIENT_ID ? 'Configured' : 'Not configured',
            callbackUrl: process.env.GITHUB_CALLBACK_URL || 'https://beckend-yaj1.onrender.com/api/auth/github/callback'
        },
        timestamp: new Date().toISOString()
    });
});

// Test email endpoint (for production testing)
app.post('/api/test/email', async (req, res) => {
    try {
        const { to, template, data } = req.body;
        
        if (!to || !template) {
            return res.status(400).json({
                success: false,
                error: 'Email and template are required'
            });
        }

        // Simple email validation
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(to)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid email format'
            });
        }

        // Mock email sending (for testing)
        const emailResult = {
            success: true,
            message: 'Email would be sent in production',
            details: {
                to: to,
                template: template,
                data: data,
                smtpConfigured: !!(process.env.SMTP_USER && process.env.SMTP_PASS),
                timestamp: new Date().toISOString()
            }
        };

        // Log to database if email_logs table exists
        try {
            await pool.query(
                'INSERT INTO email_logs (recipient, template, status, message_id) VALUES ($1, $2, $3, $4)',
                [to, template, 'test_sent', `test_${Date.now()}`]
            );
        } catch (dbError) {
            console.log('Email logs table not available:', dbError.message);
        }

        res.json(emailResult);
        
    } catch (error) {
        logger.error({ err: error }, 'Test email endpoint error');
        res.status(500).json({
            success: false,
            error: 'Test email endpoint error',
            details: error.message
        });
    }
});

// Test OAuth registration endpoint
app.post('/api/test/oauth-register', async (req, res) => {
    try {
        const { githubId, username, email, avatarUrl } = req.body;
        
        if (!githubId || !username) {
            return res.status(400).json({
                success: false,
                error: 'GitHub ID and username are required'
            });
        }

        // Check if user already exists
        const existingUser = await pool.query(
            'SELECT id, username FROM users WHERE github_id = $1 OR username = $2',
            [githubId, username]
        );

        if (existingUser.rows.length > 0) {
            return res.json({
                success: true,
                message: 'User already exists',
                user: existingUser.rows[0],
                action: 'login'
            });
        }

        // Create new OAuth user
        const newUser = await pool.query(
            `INSERT INTO users (username, email, github_id, avatar_url, is_oauth_user) 
             VALUES ($1, $2, $3, $4, true) 
             RETURNING id, username, email, avatar_url, created_at`,
            [username, email, githubId, avatarUrl]
        );

        // Add user to general chat room
        await pool.query(
            'INSERT INTO chat_room_participants (room_id, user_id) VALUES ($1, $2) ON CONFLICT (room_id, user_id) DO NOTHING',
            [1, newUser.rows[0].id]
        );

        res.json({
            success: true,
            message: 'OAuth user created successfully',
            user: newUser.rows[0],
            action: 'register'
        });

    } catch (error) {
        logger.error({ err: error }, 'OAuth registration error');
        res.status(500).json({
            success: false,
            error: 'OAuth registration failed',
            details: error.message
        });
    }
});

// Server/node status endpoint
app.get('/status', async (req, res) => {
    try {
        const memory = process.memoryUsage();
        const sockets = io.of('/').sockets.size;
        const onlineUsers = Array.from(connectedUsers.values());
        res.json({
            status: 'ok',
            version: '2.0.0',
            uptimeSec: Math.round(process.uptime()),
            socketsConnected: sockets,
            onlineUsersCount: onlineUsers.length,
            onlineUsers: onlineUsers.map(u => ({ id: u.userId, username: u.username })),
            roomsTracked: userRooms.size,
            memory: {
                rss: memory.rss,
                heapTotal: memory.heapTotal,
                heapUsed: memory.heapUsed,
                external: memory.external
            },
            timestamp: new Date().toISOString()
        });
    } catch (err) {
        logger.error({ err }, 'Status endpoint error');
        res.status(500).json({ status: 'error' });
    }
});

// --- Admin utilities ---
function adminGuard(req, res, next) {
    const password = req.get('X-Admin-Password') || req.query.adminPassword;
    const expected = '909the909';
    if (!password || password !== expected) {
        return res.status(401).json({ success: false, error: 'Unauthorized' });
    }
    next();
}

// Delete all messages
app.post('/api/admin/delete-messages', adminGuard, async (req, res) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const result = await client.query('DELETE FROM messages');
        await client.query('COMMIT');
        return res.json({ success: true, deleted: result.rowCount || 0 });
    } catch (err) {
        await client.query('ROLLBACK');
        logger.error({ err }, 'Admin delete messages failed');
        return res.status(500).json({ success: false, error: 'Failed to delete messages' });
    } finally {
        client.release();
    }
});

// Delete all users (and related room participants first to avoid FK issues)
app.post('/api/admin/delete-users', adminGuard, async (req, res) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        // Delete in correct order to avoid FK constraint violations:
        // 1. Messages (references users and rooms)
        // 2. Chat room participants (references users and rooms) 
        // 3. Chat rooms (references users via created_by)
        // 4. Users (finally safe to delete)
        await client.query('DELETE FROM messages');
        await client.query('DELETE FROM chat_room_participants');
        await client.query('DELETE FROM chat_rooms');
        const result = await client.query('DELETE FROM users');
        await client.query('COMMIT');
        // Clear runtime state
        connectedUsers.clear();
        userRooms.clear();
        io.emit('online_users', []);
        return res.json({ success: true, deleted: result.rowCount || 0 });
    } catch (err) {
        await client.query('ROLLBACK');
        logger.error({ err }, 'Admin delete users failed');
        return res.status(500).json({ success: false, error: 'Failed to delete users' });
    } finally {
        client.release();
    }
});

// Get recent server logs (admin)
app.get('/api/admin/logs', adminGuard, (req, res) => {
    const limit = Math.max(1, Math.min(2000, parseInt(req.query.limit || '200', 10)));
    const start = Math.max(0, recentLogs.length - limit);
    const items = recentLogs.slice(start).map((l, idx) => ({
        i: start + idx,
        ts: l.ts,
        level: l.level,
        msg: l.msg,
        data: l.data
    }));
    res.json({ success: true, count: items.length, totalBuffered: recentLogs.length, items });
});

// Clear recent server logs (admin)
app.post('/api/admin/clear-logs', adminGuard, (req, res) => {
    recentLogs.length = 0;
    res.json({ success: true, cleared: true });
});

// Socket.IO connection handling
io.on('connection', (socket) => {
    // --- Приватные чаты: приглашения и ответы ---
    // Unified invite event names
    socket.on('private_invite', (data) => {
        // data: { toUserId, fromUser }
        // Найти сокет приглашённого пользователя
        let targetSocketId = null;
        for (const [sockId, info] of connectedUsers.entries()) {
            if (info.userId === data.toUserId) {
                targetSocketId = sockId;
                break;
            }
        }
        if (targetSocketId) {
            const invitePayload = {
                inviteId: `inv-${Date.now()}-${Math.random().toString(36).slice(2)}`,
                roomId: `private_${Math.min(data.fromUser.id, data.toUserId)}_${Math.max(data.fromUser.id, data.toUserId)}`,
                fromUser: data.fromUser
            };
            io.to(targetSocketId).emit('private_invitation', invitePayload);
        }
    });

    socket.on('private_invite_response', (data) => {
        // data: { accepted, fromUserId, toUser }
        // Найти сокет инициатора приглашения
        let initiatorSocketId = null;
        for (const [sockId, info] of connectedUsers.entries()) {
            if (info.userId == data.fromUserId) {
                initiatorSocketId = sockId;
                break;
            }
        }
        if (initiatorSocketId) {
            io.to(initiatorSocketId).emit('invitation_response_ack', {
                accepted: data.accepted,
                toUser: data.toUser,
                fromUserId: data.fromUserId
            });
        }
    });
    logger.info({ socketId: socket.id }, 'User connected');
    
    // Handle username setting
    socket.on('set_username', async (data) => {
        try {
            const { username, password } = data;

            if (!username || !password || username.length < 3 || password.length < 4) {
                socket.emit('username_set', { success: false, error: 'Invalid credentials' });
                return;
            }

            const bcrypt = require('bcrypt');
            const saltRounds = 10;

            // Try to find existing user
            const existing = await pool.query('SELECT id, username, password_hash FROM users WHERE username = $1', [username]);
            let user;
            if (existing.rows.length === 0) {
                // Create new user with hashed password
                const hash = await bcrypt.hash(password, saltRounds);
                const insert = await pool.query(
                    'INSERT INTO users (username, password_hash) VALUES ($1, $2) RETURNING id, username',
                    [username, hash]
                );
                user = insert.rows[0];
            } else {
                // Verify password
                const ok = await bcrypt.compare(password, existing.rows[0].password_hash);
                if (!ok) {
                    socket.emit('username_set', { success: false, error: 'Invalid username or password' });
                    return;
                }
                user = { id: existing.rows[0].id, username: existing.rows[0].username };
            }
            
            // Generate avatar URL
            const avatarUrl = `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(username.toLowerCase())}&backgroundColor=6366f1`;
            
            // Update user with avatar in database
            await pool.query(
                'UPDATE users SET avatar_url = $1, last_seen = CURRENT_TIMESTAMP WHERE id = $2',
                [avatarUrl, user.id]
            );
            
            // Store user info for this socket
            connectedUsers.set(socket.id, {
                username: user.username,
                userId: user.id,
                roomId: 1 // Default to general chat
            });
            
            // Initialize user rooms
            if (!userRooms.has(user.id)) {
                userRooms.set(user.id, new Set([1])); // Add to general chat
            }
            
            // Join user to general room
            socket.join('room_1');
            
            // Send success response to client
            socket.emit('username_set', {
                success: true,
                user: { 
                    id: user.id, 
                    username: user.username,
                    avatar_url: avatarUrl
                }
            });
            
            // Add user to general chat room if not already there
            await pool.query(
                'INSERT INTO chat_room_participants (room_id, user_id) VALUES ($1, $2) ON CONFLICT (room_id, user_id) DO NOTHING',
                [1, user.id]
            );
            
            // Send updated online users list to all clients
            broadcastOnlineUsers();
            
            // Notify others that user joined
            socket.broadcast.emit('user_joined', {
                username: user.username,
                message: `${user.username} joined the chat`
            });
            
            logger.info({ username, userId: user.id, socketId: socket.id }, 'User authenticated');
            
        } catch (error) {
            logger.error({ err: error }, 'Error setting username');
            socket.emit('username_set', {
                success: false,
                error: 'Username already taken or server error'
            });
        }
    });
    
    // Handle joining room
    socket.on('join_room', async (data) => {
        try {
            const userInfo = connectedUsers.get(socket.id);
            if (!userInfo) {
                socket.emit('error', { message: 'Please set a username first' });
                return;
            }
            
            let { roomId, roomType } = data;
            let actualRoomId = roomId;
            
            // Handle private chat room creation
            if (roomType === 'private' && typeof roomId === 'string' && roomId.startsWith('private_')) {
                // Extract user IDs from private room string (e.g., "private_1_4" -> [1, 4])
                const userIds = roomId.replace('private_', '').split('_').map(id => parseInt(id));
                const [user1Id, user2Id] = userIds.sort((a, b) => a - b); // Sort for consistency
                
                // Check if private room already exists
                const existingRoom = await pool.query(`
                    SELECT cr.id 
                    FROM chat_rooms cr
                    JOIN chat_room_participants crp1 ON cr.id = crp1.room_id
                    JOIN chat_room_participants crp2 ON cr.id = crp2.room_id
                    WHERE cr.room_type = 'private' 
                    AND crp1.user_id = $1 AND crp2.user_id = $2
                    AND crp1.user_id != crp2.user_id
                `, [user1Id, user2Id]);
                
                if (existingRoom.rows.length > 0) {
                    actualRoomId = existingRoom.rows[0].id;
                } else {
                    // Create new private room
                    const newRoom = await pool.query(`
                        INSERT INTO chat_rooms (name, room_type, created_by) 
                        VALUES ($1, 'private', $2) 
                        RETURNING id
                    `, [`Private Chat`, userInfo.userId]);
                    
                    actualRoomId = newRoom.rows[0].id;
                    
                    // Add both participants to the room
                    await pool.query(`
                        INSERT INTO chat_room_participants (room_id, user_id) 
                        VALUES ($1, $2), ($1, $3)
                    `, [actualRoomId, user1Id, user2Id]);
                }
            }
            
            // Leave current room
            if (userInfo.roomId) {
                socket.leave(`room_${userInfo.roomId}`);
            }
            
            // Join new room
            socket.join(`room_${actualRoomId}`);
            userInfo.roomId = actualRoomId;
            
            // Get recent messages for this room
            const messagesResult = await pool.query(`
                SELECT m.id, m.content, m.timestamp, m.user_id, u.username 
                FROM messages m 
                JOIN users u ON m.user_id = u.id 
                WHERE m.room_id = $1 
                ORDER BY m.timestamp DESC 
                LIMIT 50
            `, [actualRoomId]);
            
            socket.emit('room_joined', {
                success: true,
                roomId: actualRoomId,
                originalRoomId: roomId, // Send back original ID for client to track
                messages: messagesResult.rows.reverse()
            });
            
        } catch (error) {
            logger.error({ err: error }, 'Error joining room');
            socket.emit('error', { message: 'Failed to join room' });
        }
    });
    
    // Handle incoming messages
    socket.on('send_message', async (data) => {
        try {
            const userInfo = connectedUsers.get(socket.id);
            
            if (!userInfo) {
                socket.emit('error', { message: 'Please set a username first' });
                return;
            }
            
            const { content, roomId, roomType } = data;
            let targetRoomId = roomId || userInfo.roomId || 1;
            
            // Handle private chat room ID conversion
            if (roomType === 'private' && typeof roomId === 'string' && roomId.startsWith('private_')) {
                // Extract user IDs from private room string
                const userIds = roomId.replace('private_', '').split('_').map(id => parseInt(id));
                const [user1Id, user2Id] = userIds.sort((a, b) => a - b);
                
                // Find the actual room ID from database
                const existingRoom = await pool.query(`
                    SELECT cr.id 
                    FROM chat_rooms cr
                    JOIN chat_room_participants crp1 ON cr.id = crp1.room_id
                    JOIN chat_room_participants crp2 ON cr.id = crp2.room_id
                    WHERE cr.room_type = 'private' 
                    AND crp1.user_id = $1 AND crp2.user_id = $2
                    AND crp1.user_id != crp2.user_id
                `, [user1Id, user2Id]);
                
                if (existingRoom.rows.length > 0) {
                    targetRoomId = existingRoom.rows[0].id;
                } else {
                    socket.emit('error', { message: 'Private room not found' });
                    return;
                }
            }
            
            // Validate message content
            if (!content || content.trim().length === 0) {
                socket.emit('error', { message: 'Message cannot be empty' });
                return;
            }
            
            if (content.length > 1000) {
                socket.emit('error', { message: 'Message too long (max 1000 characters)' });
                return;
            }
            
            // Insert message into database
            const messageResult = await pool.query(
                'INSERT INTO messages (user_id, room_id, content) VALUES ($1, $2, $3) RETURNING id, content, timestamp',
                [userInfo.userId, targetRoomId, content.trim()]
            );
            
            const message = messageResult.rows[0];
            
            // Broadcast message to all clients in the room
            const messageData = {
                id: message.id,
                content: message.content,
                username: userInfo.username,
                userId: userInfo.userId,
                roomId: targetRoomId,
                timestamp: message.timestamp
            };
            
            // Send to all clients in the room including sender
            if (roomType === 'private') {
                // For private messages, send to both participants
                io.to(`room_${targetRoomId}`).emit('new_message', messageData);
            } else {
                // For general/public rooms
                io.to(`room_${targetRoomId}`).emit('new_message', messageData);
            }
            
            logger.debug({ username: userInfo.username, roomId: targetRoomId }, 'Message sent');
            
        } catch (error) {
            logger.error({ err: error }, 'Error sending message');
            socket.emit('error', { message: 'Failed to send message' });
        }
    });
    
    // Handle disconnection
    socket.on('disconnect', () => {
        const userInfo = connectedUsers.get(socket.id);
        
        if (userInfo) {
            logger.info({ username: userInfo.username }, 'User disconnected');
            
            // Update last seen in database
            pool.query(
                'UPDATE users SET last_seen = CURRENT_TIMESTAMP WHERE id = $1',
                [userInfo.userId]
            ).catch(err => logger.error({ err }, 'Error updating last_seen'));
            
            // Remove user from connected users
            connectedUsers.delete(socket.id);
            
            // Update online users list
            broadcastOnlineUsers();
            
            // Notify others that user left
            socket.broadcast.emit('user_left', {
                username: userInfo.username,
                message: `${userInfo.username} left the chat`
            });
        } else {
            logger.info({ socketId: socket.id }, 'Anonymous user disconnected');
        }
    });
});

// 404 handler - must be after all other routes
app.use((req, res, next) => {
    try {
        if (fs.existsSync(notFoundPath)) {
            res.status(404).sendFile(notFoundPath);
        } else {
            res.status(404).send('404 Not Found');
        }
    } catch (e) {
        logger.error({ err: e }, 'Error serving 404 page');
        res.status(404).send('404 Not Found');
    }
});

// Error handling middleware
app.use((err, req, res, next) => {
    logger.error({ err }, 'Unhandled error');
    res.status(500).send('Something went wrong!');
});

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    logger.info({ port: PORT }, 'Server running');
});

// Graceful shutdown
async function shutdown() {
    logger.info('Shutting down gracefully...');
    await pool.end();
    server.close(() => {
        process.exit(0);
    });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
