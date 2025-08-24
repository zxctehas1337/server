const { Pool } = require('pg');
require('dotenv').config();

async function addAvatarMigration() {
    const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
    });

    try {
        console.log('Connecting to database for avatar migration...');
        
        // Check if avatar_url column exists
        const avatarCheck = await pool.query(`
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'users' 
            AND table_schema = 'public'
            AND column_name = 'avatar_url';
        `);
        
        const hasAvatarUrl = avatarCheck.rows.length > 0;
        console.log('Users table has avatar_url column:', hasAvatarUrl);
        
        if (hasAvatarUrl) {
            console.log('Avatar URL column already exists. No action needed.');
            return;
        }
        
        console.log('Adding avatar_url column to users table...');
        
        // Add avatar_url column
        await pool.query(`
            ALTER TABLE users 
            ADD COLUMN avatar_url VARCHAR(500);
        `);
        
        console.log('Avatar migration completed successfully!');
        
    } catch (error) {
        console.error('Error during avatar migration:', error);
        process.exit(1);
    } finally {
        await pool.end();
    }
}

if (require.main === module) {
    addAvatarMigration();
}

module.exports = { addAvatarMigration };
