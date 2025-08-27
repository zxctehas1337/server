require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const path = require('path');
const { query } = require('./utils/db');

const app = express();
const server = createServer(app);
const io = new Server(server);

// Middleware
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// Import API routes
const registerHandler = require('./api/auth/register.js');
const verifyEmailHandler = require('./api/auth/verify-email.js');
const resendCodeHandler = require('./api/auth/resend-code.js');
const loginHandler = require('./api/auth/login.js');

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

// Initialize database tables
async function initializeDatabase() {
    try {
        // Create users table
        await query(`
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                username VARCHAR(255) UNIQUE NOT NULL,
                password_hash TEXT,
                email VARCHAR(255) UNIQUE,
                github_id VARCHAR(255) UNIQUE,
                avatar_url TEXT,
                email_verified BOOLEAN DEFAULT FALSE,
                verification_code VARCHAR(10),
                verification_code_expires TIMESTAMP,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                is_oauth_user BOOLEAN DEFAULT FALSE
            )
        `);

        // Create chat_rooms table
        await query(`
            CREATE TABLE IF NOT EXISTS chat_rooms (
                id SERIAL PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                room_type VARCHAR(50) DEFAULT 'general',
                created_by INTEGER,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY(created_by) REFERENCES users(id)
            )
        `);

        // Create messages table
        await query(`
            CREATE TABLE IF NOT EXISTS messages (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL,
                room_id INTEGER NOT NULL DEFAULT 1,
                content TEXT NOT NULL,
                timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY(user_id) REFERENCES users(id),
                FOREIGN KEY(room_id) REFERENCES chat_rooms(id)
            )
        `);

        // Create chat_room_participants table
        await query(`
            CREATE TABLE IF NOT EXISTS chat_room_participants (
                id SERIAL PRIMARY KEY,
                room_id INTEGER NOT NULL,
                user_id INTEGER NOT NULL,
                joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY(room_id) REFERENCES chat_rooms(id),
                FOREIGN KEY(user_id) REFERENCES users(id),
                UNIQUE(room_id, user_id)
            )
        `);

        // Insert default general room if it doesn't exist
        await query(`
            INSERT INTO chat_rooms (id, name, room_type) 
            VALUES (1, 'General Chat', 'general') 
            ON CONFLICT (id) DO NOTHING
        `);

        console.log('Database initialized successfully');
    } catch (error) {
        console.error('Database initialization error:', error);
    }
}

// Initialize database on startup
// initializeDatabase(); // Temporarily disabled for testing

// Serve main page
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// API Routes
app.post('/api/auth/register', registerHandler);
app.post('/api/auth/verify-email', verifyEmailHandler);
app.post('/api/auth/resend-code', resendCodeHandler);
app.post('/api/auth/login', loginHandler);

// GitHub OAuth endpoint
app.get('/api/auth/github', (req, res) => {
    // Redirect to GitHub OAuth
    const clientId = process.env.GITHUB_CLIENT_ID;
    if (!clientId) {
        return res.status(500).json({ error: 'GitHub Client ID not configured' });
    }
    // Use the configured callback URL from environment
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

        // Get user emails
        const emailsResponse = await axios.get('https://api.github.com/user/emails', {
            headers: {
                'Authorization': `token ${access_token}`,
                'Accept': 'application/vnd.github.v3+json'
            }
        });

        const userData = userResponse.data;
        const emails = emailsResponse.data;
        const primaryEmail = emails.find(email => email.primary)?.email || emails[0]?.email;

        // Check if user already exists
        const existingUser = await query(
            'SELECT * FROM users WHERE github_id = $1',
            [userData.id.toString()]
        );

        if (existingUser.rows.length > 0) {
            // User exists, update last seen
            await query(
                'UPDATE users SET last_seen = CURRENT_TIMESTAMP WHERE id = $1',
                [existingUser.rows[0].id]
            );
            
            // Generate JWT token
            const jwt = require('jsonwebtoken');
            const token = jwt.sign(
                { userId: existingUser.rows[0].id, username: existingUser.rows[0].username },
                process.env.JWT_SECRET || 'your-secret-key',
                { expiresIn: '7d' }
            );
            
            res.redirect(`/?token=${token}`);
        } else {
            // Create new user
            const username = userData.login || `github_${userData.id}`;
            const avatarUrl = userData.avatar_url;
            
            const newUser = await query(
                `INSERT INTO users (username, email, github_id, avatar_url, email_verified, is_oauth_user) 
                 VALUES ($1, $2, $3, $4, true, true) 
                 RETURNING *`,
                [username, primaryEmail, userData.id.toString(), avatarUrl]
            );
            
            // Add user to general chat room
            await query(
                'INSERT INTO chat_room_participants (room_id, user_id) VALUES ($1, $2) ON CONFLICT (room_id, user_id) DO NOTHING',
                [1, newUser.rows[0].id]
            );
            
            // Send welcome email
            const { sendWelcomeEmail } = require('./utils/email.js');
            if (primaryEmail) {
                sendWelcomeEmail(primaryEmail, username).catch(emailErr => {
                    console.error('Error sending welcome email:', emailErr);
                });
            }
            
            // Generate JWT token
            const jwt = require('jsonwebtoken');
            const token = jwt.sign(
                { userId: newUser.rows[0].id, username: username },
                process.env.JWT_SECRET || 'your-secret-key',
                { expiresIn: '7d' }
            );
            
            res.redirect(`/?token=${token}`);
        }
    } catch (error) {
        console.error('GitHub OAuth error:', error);
        res.redirect('/?error=github_auth_failed');
    }
});

// Test endpoints
app.get('/api/test/github-oauth', async (req, res) => {
    try {
        const config = {
            githubClientId: process.env.GITHUB_CLIENT_ID ? '✅ Настроен' : '❌ Не настроен',
            githubClientSecret: process.env.GITHUB_CLIENT_SECRET ? '✅ Настроен' : '❌ Не настроен',
            githubCallbackUrl: process.env.GITHUB_CALLBACK_URL || 'http://localhost:3000/api/auth/github/callback',
            jwtSecret: process.env.JWT_SECRET ? '✅ Настроен' : '❌ Не настроен',
            environment: process.env.NODE_ENV || 'development'
        };

        res.json({
            success: true,
            message: 'GitHub OAuth Configuration Status',
            config,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('GitHub OAuth test error:', error);
        res.status(500).json({ success: false, error: 'Failed to check GitHub OAuth configuration' });
    }
});

app.post('/api/test/email', async (req, res) => {
    try {
        const { template, to, data } = req.body;

        if (!template || !to) {
            return res.status(400).json({ success: false, error: 'Template and recipient email are required' });
        }

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(to)) {
            return res.status(400).json({ success: false, error: 'Invalid email format' });
        }

        const { sendWelcomeEmail, verifyEmailConfig } = require('./utils/email.js');
        let result;

        switch (template) {
            case 'welcome':
                if (!data || !data.username) {
                    return res.status(400).json({ success: false, error: 'Username is required for welcome email' });
                }
                result = await sendWelcomeEmail(to, data.username);
                break;

            case 'test':
                const configResult = await verifyEmailConfig();
                if (!configResult.success) {
                    return res.status(500).json({ success: false, error: `Email configuration error: ${configResult.error}` });
                }
                result = await sendWelcomeEmail(to, 'TestUser');
                break;

            default:
                return res.status(400).json({ success: false, error: 'Invalid email template. Use "welcome" or "test"' });
        }

        if (result.success) {
            res.json({
                success: true,
                message: 'Email sent successfully',
                messageId: result.messageId,
                template,
                recipient: to
            });
        } else {
            res.status(500).json({ success: false, error: `Failed to send email: ${result.error}` });
        }

    } catch (error) {
        console.error('Email test error:', error);
        res.status(500).json({ success: false, error: 'Failed to send test email' });
    }
});

// API endpoints for authentication are now handled by imported handlers above

// Socket.IO connection handling
io.on('connection', (socket) => {
    console.log('User connected:', socket.id);
    
    socket.on('join', (userData) => {
        connectedUsers.set(socket.id, userData);
        broadcastOnlineUsers();
    });
    
    socket.on('message', async (data) => {
        try {
            const result = await query(
                'INSERT INTO messages (user_id, room_id, content) VALUES ($1, $2, $3) RETURNING *',
                [data.userId, data.roomId || 1, data.content]
            );
            
            const message = result.rows[0];
            io.emit('message', {
                id: message.id,
                userId: message.user_id,
                content: message.content,
                timestamp: message.timestamp
            });
        } catch (error) {
            console.error('Error saving message:', error);
        }
    });
    
    socket.on('disconnect', () => {
        connectedUsers.delete(socket.id);
        broadcastOnlineUsers();
        console.log('User disconnected:', socket.id);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
