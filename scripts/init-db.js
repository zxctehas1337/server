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
        
        // First, check if messages table exists and has room_id column
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
            console.log('Performing database migration...');
            
            // Create chat_rooms table first if it doesn't exist
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
            
            // Check if messages table exists
            const messagesTableExists = await pool.query(`
                SELECT EXISTS (
                    SELECT FROM information_schema.tables 
                    WHERE table_schema = 'public' 
                    AND table_name = 'messages'
                );
            `);
            
            if (messagesTableExists.rows[0].exists) {
                // Add room_id column to existing messages table
                console.log('Adding room_id column to existing messages table...');
                await pool.query(`
                    ALTER TABLE messages 
                    ADD COLUMN IF NOT EXISTS room_id INTEGER;
                `);
                
                // Set default room_id = 1 (General Chat) for existing messages
                await pool.query(`
                    UPDATE messages 
                    SET room_id = 1 
                    WHERE room_id IS NULL;
                `);
                
                // Make room_id NOT NULL and add foreign key constraint
                await pool.query(`
                    ALTER TABLE messages 
                    ALTER COLUMN room_id SET NOT NULL;
                `);
                
                await pool.query(`
                    ALTER TABLE messages 
                    ADD CONSTRAINT fk_messages_room_id 
                    FOREIGN KEY (room_id) REFERENCES chat_rooms(id) ON DELETE CASCADE;
                `);
            }
            
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
            
            // Update users table with new columns if needed
            await pool.query(`
                ALTER TABLE users 
                ADD COLUMN IF NOT EXISTS avatar_url VARCHAR(500),
                ADD COLUMN IF NOT EXISTS theme_preference VARCHAR(10) DEFAULT 'light',
                ADD COLUMN IF NOT EXISTS last_seen TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;
            `);
            
            console.log('Migration completed successfully!');
        }
        
        // Now execute the full schema to ensure everything is up to date
        const schemaPath = path.join(__dirname, '..', 'sql', 'schema.sql');
        const schema = fs.readFileSync(schemaPath, 'utf8');
        
        console.log('Executing database schema...');
        await pool.query(schema);
        
        console.log('Database schema initialized successfully!');
        
        // Test the connection by checking if tables exist
        const result = await pool.query(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public' 
            AND table_type = 'BASE TABLE';
        `);
        
        console.log('Created tables:', result.rows.map(row => row.table_name));
        
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
