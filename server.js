const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const { Pool } = require('pg');
const path = require('path');
require('dotenv').config();

const app = express();
const server = createServer(app);
const io = new Server(server);

// Database connection pool
const pool = new Pool({
    connectionString: process.env.DATABASE_URL || `postgresql://${process.env.DB_USER || 'postgres'}:${process.env.DB_PASSWORD || 'password'}@${process.env.DB_HOST || 'localhost'}:${process.env.DB_PORT || 5432}/${process.env.DB_NAME || 'browser_messenger'}`
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
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// Store connected users
const connectedUsers = new Map(); // socketId -> { username, userId }

// Serve main page
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Socket.IO connection handling
io.on('connection', (socket) => {
    console.log(`User connected: ${socket.id}`);
    
    // Handle username setting
    socket.on('set_username', async (data) => {
        try {
            const { username, password } = data;
            
            // For MVP, we'll create user if not exists (simplified authentication)
            const userResult = await pool.query(
                'INSERT INTO users (username, password_hash) VALUES ($1, $2) ON CONFLICT (username) DO UPDATE SET username = EXCLUDED.username RETURNING id, username',
                [username, password] // In production, hash the password!
            );
            
            const user = userResult.rows[0];
            
            // Store user info for this socket
            connectedUsers.set(socket.id, {
                username: user.username,
                userId: user.id
            });
            
            // Send success response to client
            socket.emit('username_set', {
                success: true,
                user: { id: user.id, username: user.username }
            });
            
            // Notify others that user joined
            socket.broadcast.emit('user_joined', {
                username: user.username,
                message: `${user.username} joined the chat`
            });
            
            console.log(`User ${username} (${user.id}) connected on socket ${socket.id}`);
            
        } catch (error) {
            console.error('Error setting username:', error);
            socket.emit('username_set', {
                success: false,
                error: 'Username already taken or server error'
            });
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
            
            const { content } = data;
            
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
                'INSERT INTO messages (user_id, content) VALUES ($1, $2) RETURNING id, content, timestamp',
                [userInfo.userId, content.trim()]
            );
            
            const message = messageResult.rows[0];
            
            // Broadcast message to all connected clients
            const messageData = {
                id: message.id,
                content: message.content,
                username: userInfo.username,
                userId: userInfo.userId,
                timestamp: message.timestamp
            };
            
            // Send to all clients including sender
            io.emit('new_message', messageData);
            
            console.log(`Message from ${userInfo.username}: ${content}`);
            
        } catch (error) {
            console.error('Error sending message:', error);
            socket.emit('error', { message: 'Failed to send message' });
        }
    });
    
    // Handle disconnection
    socket.on('disconnect', () => {
        const userInfo = connectedUsers.get(socket.id);
        
        if (userInfo) {
            console.log(`User ${userInfo.username} disconnected`);
            
            // Notify others that user left
            socket.broadcast.emit('user_left', {
                username: userInfo.username,
                message: `${userInfo.username} left the chat`
            });
            
            // Remove user from connected users
            connectedUsers.delete(socket.id);
        } else {
            console.log(`Anonymous user disconnected: ${socket.id}`);
        }
    });
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).send('Something went wrong!');
});

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Visit http://localhost:${PORT} to access the messenger`);
});

// Graceful shutdown
process.on('SIGINT', async () => {
    console.log('Shutting down gracefully...');
    await pool.end();
    server.close(() => {
        process.exit(0);
    });
});
