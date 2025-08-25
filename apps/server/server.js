const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const { Pool } = require('pg');
const path = require('path');
const fs = require('fs');
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
//tabine hello
// Определяем корректный путь к публичным файлам для production

// Для Render и локально: используем абсолютный путь от process.cwd()
const publicPath = path.resolve(process.cwd(), 'apps/server/public');
const indexPath = path.resolve(publicPath, 'index.html');

console.log('Static files path:', publicPath);
console.log('Index file path:', indexPath);
console.log('Current working directory:', process.cwd());
console.log('__dirname:', __dirname);

// Проверяем существование критических файлов
try {
    const publicExists = fs.existsSync(publicPath);
    const indexExists = fs.existsSync(indexPath);
    
    console.log('Public directory exists:', publicExists);
    console.log('Index.html exists:', indexExists);
    
    if (publicExists) {
        const files = fs.readdirSync(publicPath);
        console.log('Files in public directory:', files);
    }
    
    if (!indexExists) {
        console.error('❌ CRITICAL: index.html not found at:', indexPath);
        console.error('Available files in current directory:', fs.readdirSync(__dirname));
    } else {
        console.log('✅ index.html found successfully');
    }
} catch (error) {
    console.error('Error checking files:', error.message);
}

app.use(express.static(publicPath));
app.use(express.json());

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

// Socket.IO connection handling
io.on('connection', (socket) => {
    // --- Приватные чаты: приглашения и ответы ---
    socket.on('private_chat_invite', (data) => {
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
            io.to(targetSocketId).emit('private_chat_invite', { fromUser: data.fromUser });
        }
    });

    socket.on('private_chat_response', (data) => {
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
            io.to(initiatorSocketId).emit('private_chat_response', {
                accepted: data.accepted,
                toUser: data.toUser,
                fromUserId: data.fromUserId
            });
        }
    });
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
            
            console.log(`User ${username} (${user.id}) connected on socket ${socket.id}`);
            
        } catch (error) {
            console.error('Error setting username:', error);
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
            console.error('Error joining room:', error);
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
            
            console.log(`Message from ${userInfo.username} in room ${targetRoomId}: ${content}`);
            
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
            
            // Update last seen in database
            pool.query(
                'UPDATE users SET last_seen = CURRENT_TIMESTAMP WHERE id = $1',
                [userInfo.userId]
            ).catch(err => console.error('Error updating last_seen:', err));
            
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
