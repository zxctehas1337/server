const { Pool } = require('pg');
require('dotenv').config();

async function migrateDatabase() {
    const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
    });

    try {
        console.log('Connecting to database for migration...');
        
        // Check what columns already exist
        const messagesRoomIdCheck = await pool.query(`
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'messages' 
            AND table_schema = 'public'
            AND column_name = 'room_id';
        `);
        
        const usersAvatarCheck = await pool.query(`
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'users' 
            AND table_schema = 'public'
            AND column_name = 'avatar_url';
        `);
        
        const hasRoomId = messagesRoomIdCheck.rows.length > 0;
        const hasAvatarUrl = usersAvatarCheck.rows.length > 0;
        
        console.log('Messages table has room_id column:', hasRoomId);
        console.log('Users table has avatar_url column:', hasAvatarUrl);
        
        if (hasRoomId && hasAvatarUrl) {
            console.log('Database already fully migrated. No action needed.');
            return;
        }
        
        console.log('Starting database migration...');
        
        // Create chat_rooms table
        console.log('Creating chat_rooms table...');
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
        
        if (messagesTableExists.rows[0].exists && !hasRoomId) {
            console.log('Migrating messages table...');
            
            // Add room_id column
            await pool.query(`ALTER TABLE messages ADD COLUMN room_id INTEGER;`);
            
            // Set default room_id = 1 for existing messages
            await pool.query(`UPDATE messages SET room_id = 1 WHERE room_id IS NULL;`);
            
            // Make room_id NOT NULL
            await pool.query(`ALTER TABLE messages ALTER COLUMN room_id SET NOT NULL;`);
            
            // Add foreign key constraint
            await pool.query(`
                ALTER TABLE messages 
                ADD CONSTRAINT fk_messages_room_id 
                FOREIGN KEY (room_id) REFERENCES chat_rooms(id) ON DELETE CASCADE;
            `);
        } else if (hasRoomId) {
            console.log('Messages table already has room_id column, skipping messages migration.');
        }
        
        // Create chat_room_participants table
        console.log('Creating chat_room_participants table...');
        await pool.query(`
            CREATE TABLE IF NOT EXISTS chat_room_participants (
                id SERIAL PRIMARY KEY,
                room_id INTEGER NOT NULL REFERENCES chat_rooms(id) ON DELETE CASCADE,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                joined_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(room_id, user_id)
            );
        `);
        
        // Update users table
        console.log('Updating users table...');
        await pool.query(`
            ALTER TABLE users 
            ADD COLUMN IF NOT EXISTS avatar_url VARCHAR(500),
            ADD COLUMN IF NOT EXISTS theme_preference VARCHAR(10) DEFAULT 'light',
            ADD COLUMN IF NOT EXISTS last_seen TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;
        `);
        
        console.log('Migration completed successfully!');
        
    } catch (error) {
        console.error('Error during migration:', error);
        process.exit(1);
    } finally {
        await pool.end();
    }
}

if (require.main === module) {
    migrateDatabase();
}

module.exports = { migrateDatabase };
