const { Pool } = require('pg');
require('dotenv').config();

async function addUserColumnsMigration() {
    const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
    });

    try {
        console.log('Connecting to database for user columns migration...');
        
        // Check which columns are missing
        const columnsCheck = await pool.query(`
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'users' 
            AND table_schema = 'public'
            AND column_name IN ('avatar_url', 'theme_preference', 'last_seen');
        `);
        
        const existingColumns = columnsCheck.rows.map(row => row.column_name);
        const missingColumns = [];
        
        if (!existingColumns.includes('avatar_url')) {
            missingColumns.push('avatar_url');
        }
        if (!existingColumns.includes('theme_preference')) {
            missingColumns.push('theme_preference');
        }
        if (!existingColumns.includes('last_seen')) {
            missingColumns.push('last_seen');
        }
        
        console.log('Existing user columns:', existingColumns);
        console.log('Missing user columns:', missingColumns);
        
        if (missingColumns.length === 0) {
            console.log('All required columns already exist. No action needed.');
            return;
        }
        
        console.log('Adding missing columns to users table...');
        
        // Add all missing columns
        await pool.query(`
            ALTER TABLE users 
            ADD COLUMN IF NOT EXISTS avatar_url VARCHAR(500),
            ADD COLUMN IF NOT EXISTS theme_preference VARCHAR(10) DEFAULT 'light',
            ADD COLUMN IF NOT EXISTS last_seen TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;
        `);
        
        console.log('User columns migration completed successfully!');
        
    } catch (error) {
        console.error('Error during user columns migration:', error);
        process.exit(1);
    } finally {
        await pool.end();
    }
}

if (require.main === module) {
    addUserColumnsMigration();
}

module.exports = { addUserColumnsMigration };
