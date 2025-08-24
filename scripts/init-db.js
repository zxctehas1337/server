const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

async function initializeDatabase() {
    const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
    });

    try {
        console.log('Connecting to database...');
        
        // Create users table first (base table)
        await pool.query(`
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                username VARCHAR(50) UNIQUE NOT NULL,
                password_hash VARCHAR(255) NOT NULL,
                avatar_url VARCHAR(500),
                theme_preference VARCHAR(10) DEFAULT 'light',
                last_seen TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);
        
        // Create chat_rooms table
        await pool.query(`
            CREATE TABLE IF NOT EXISTS chat_rooms (
                id SERIAL PRIMARY KEY,
                name VARCHAR(100) NOT NULL,
                room_type VARCHAR(20) DEFAULT 'general',
                created_by INTEGER REFERENCES users(id),
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);
        
        // Insert default general room
        await pool.query(`
            INSERT INTO chat_rooms (id, name, room_type) 
            VALUES (1, 'General Chat', 'general')
            ON CONFLICT (id) DO NOTHING;
        `);
        
        // Check if messages table exists and has room_id column
        const tableCheck = await pool.query(`
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'messages' 
            AND table_schema = 'public'
            AND column_name = 'room_id';
        `);
        
        const hasRoomId = tableCheck.rows.length > 0;
        console.log('Messages table has room_id column:', hasRoomId);
        
        if (!hasRoomId) {
            // Check if messages table exists at all
            const messagesTableExists = await pool.query(`
                SELECT EXISTS (
                    SELECT FROM information_schema.tables 
                    WHERE table_schema = 'public' 
                    AND table_name = 'messages'
                );
            `);
            
            if (messagesTableExists.rows[0].exists) {
                console.log('Migrating existing messages table...');
                
                // Add room_id column to existing messages table
                await pool.query(`ALTER TABLE messages ADD COLUMN room_id INTEGER;`);
                
                // Set default room_id = 1 (General Chat) for existing messages
                await pool.query(`UPDATE messages SET room_id = 1 WHERE room_id IS NULL;`);
                
                // Make room_id NOT NULL
                await pool.query(`ALTER TABLE messages ALTER COLUMN room_id SET NOT NULL;`);
                
                // Add foreign key constraint
                await pool.query(`
                    ALTER TABLE messages 
                    ADD CONSTRAINT fk_messages_room_id 
                    FOREIGN KEY (room_id) REFERENCES chat_rooms(id) ON DELETE CASCADE;
                `);
            } else {
                console.log('Creating new messages table with room_id...');
            }
        }
        
        // Create messages table (will be skipped if exists)
        await pool.query(`
            CREATE TABLE IF NOT EXISTS messages (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                room_id INTEGER NOT NULL REFERENCES chat_rooms(id) ON DELETE CASCADE,
                content TEXT NOT NULL,
                timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);
        
        // Create chat_room_participants table
        await pool.query(`
            CREATE TABLE IF NOT EXISTS chat_room_participants (
                id SERIAL PRIMARY KEY,
                room_id INTEGER NOT NULL REFERENCES chat_rooms(id) ON DELETE CASCADE,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                joined_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(room_id, user_id)
            );
        `);
        
        // Create all indexes
        console.log('Creating indexes...');
        
        // Create indexes one by one to avoid conflicts
        const indexes = [
            'CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages(timestamp DESC);',
            'CREATE INDEX IF NOT EXISTS idx_messages_user_id ON messages(user_id);',
            'CREATE INDEX IF NOT EXISTS idx_messages_room_id ON messages(room_id);',
            'CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);',
            'CREATE INDEX IF NOT EXISTS idx_chat_room_participants_room_id ON chat_room_participants(room_id);',
            'CREATE INDEX IF NOT EXISTS idx_chat_room_participants_user_id ON chat_room_participants(user_id);'
        ];
        
        for (const indexQuery of indexes) {
            try {
                await pool.query(indexQuery);
            } catch (error) {
                console.log(`Index creation skipped (might already exist): ${error.message}`);
            }
        }
        
        // Add constraints
        console.log('Adding constraints...');
        
        try {
            await pool.query(`
                DO $$ 
                BEGIN
                    IF NOT EXISTS (
                        SELECT 1 FROM information_schema.table_constraints 
                        WHERE constraint_name = 'check_content_length' 
                        AND table_name = 'messages'
                    ) THEN
                        ALTER TABLE messages ADD CONSTRAINT check_content_length CHECK (LENGTH(content) <= 1000);
                    END IF;
                    
                    IF NOT EXISTS (
                        SELECT 1 FROM information_schema.table_constraints 
                        WHERE constraint_name = 'check_username_length' 
                        AND table_name = 'users'
                    ) THEN
                        ALTER TABLE users ADD CONSTRAINT check_username_length CHECK (LENGTH(username) >= 3 AND LENGTH(username) <= 50);
                    END IF;
                END $$;
            `);
        } catch (error) {
            console.log(`Constraints creation skipped: ${error.message}`);
        }
        
        console.log('Database schema initialized successfully!');
        
        // Test the connection by checking if tables exist
        const result = await pool.query(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public' 
            AND table_type = 'BASE TABLE'
            ORDER BY table_name;
        `);
        
        console.log('Tables in database:', result.rows.map(row => row.table_name));
        
    } catch (error) {
        console.error('Error initializing database:', error);
        process.exit(1);
    } finally {
        await pool.end();
    }
}

// Run if called directly
if (require.main === module) {
    initializeDatabase();
}

module.exports = { initializeDatabase };
