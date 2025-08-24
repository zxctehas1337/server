const { Pool } = require('pg');
require('dotenv').config();

async function resetDatabase() {
    const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
    });

    try {
        console.log('Connecting to database for reset...');
        
        // Drop all tables in correct order (to handle foreign keys)
        console.log('Dropping existing tables...');
        
        const dropQueries = [
            'DROP TABLE IF EXISTS chat_room_participants CASCADE;',
            'DROP TABLE IF EXISTS messages CASCADE;',
            'DROP TABLE IF EXISTS chat_rooms CASCADE;',
            'DROP TABLE IF EXISTS users CASCADE;'
        ];
        
        for (const query of dropQueries) {
            try {
                await pool.query(query);
            } catch (error) {
                console.log(`Drop table skipped: ${error.message}`);
            }
        }
        
        console.log('All tables dropped. Running initialization...');
        
        // Now run init-db
        const { initializeDatabase } = require('./init-db.js');
        await pool.end(); // Close this connection first
        await initializeDatabase();
        
        console.log('Database reset completed successfully!');
        
    } catch (error) {
        console.error('Error resetting database:', error);
        process.exit(1);
    }
}

if (require.main === module) {
    resetDatabase();
}

module.exports = { resetDatabase };
