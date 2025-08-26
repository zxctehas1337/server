const { Pool } = require('pg');

// Database connection
const pool = new Pool({
    connectionString: process.env.DATABASE_URL || `postgresql://${process.env.DB_USER || 'postgres'}:${process.env.DB_PASSWORD || 'password'}@${process.env.DB_HOST || 'localhost'}:${process.env.DB_PORT || 5432}/${process.env.DB_NAME || 'browser_messenger'}`
});

async function migrateEmailVerification() {
    const client = await pool.connect();
    
    try {
        console.log('Starting email verification migration...');
        
        // Begin transaction
        await client.query('BEGIN');
        
        // Add email_verified column if it doesn't exist
        await client.query(`
            DO $$ 
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM information_schema.columns 
                    WHERE table_name = 'users' AND column_name = 'email_verified'
                ) THEN
                    ALTER TABLE users ADD COLUMN email_verified BOOLEAN DEFAULT FALSE;
                END IF;
            END $$;
        `);
        
        // Add verification_code column if it doesn't exist
        await client.query(`
            DO $$ 
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM information_schema.columns 
                    WHERE table_name = 'users' AND column_name = 'verification_code'
                ) THEN
                    ALTER TABLE users ADD COLUMN verification_code VARCHAR(6);
                END IF;
            END $$;
        `);
        
        // Add verification_code_expires column if it doesn't exist
        await client.query(`
            DO $$ 
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM information_schema.columns 
                    WHERE table_name = 'users' AND column_name = 'verification_code_expires'
                ) THEN
                    ALTER TABLE users ADD COLUMN verification_code_expires TIMESTAMP WITH TIME ZONE;
                END IF;
            END $$;
        `);
        
        // Add updated_at column if it doesn't exist
        await client.query(`
            DO $$ 
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM information_schema.columns 
                    WHERE table_name = 'users' AND column_name = 'updated_at'
                ) THEN
                    ALTER TABLE users ADD COLUMN updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;
                END IF;
            END $$;
        `);
        
        // Set existing OAuth users as email verified
        await client.query(`
            UPDATE users 
            SET email_verified = true 
            WHERE is_oauth_user = true AND email IS NOT NULL
        `);
        
        // Set existing users without email as email verified (for backward compatibility)
        await client.query(`
            UPDATE users 
            SET email_verified = true 
            WHERE email IS NULL
        `);
        
        // Commit transaction
        await client.query('COMMIT');
        
        console.log('Email verification migration completed successfully!');
        
        // Show migration results
        const result = await client.query(`
            SELECT 
                COUNT(*) as total_users,
                COUNT(CASE WHEN email_verified = true THEN 1 END) as verified_users,
                COUNT(CASE WHEN email_verified = false THEN 1 END) as unverified_users,
                COUNT(CASE WHEN is_oauth_user = true THEN 1 END) as oauth_users
            FROM users
        `);
        
        console.log('Migration summary:', result.rows[0]);
        
    } catch (error) {
        // Rollback transaction on error
        await client.query('ROLLBACK');
        console.error('Migration failed:', error);
        throw error;
    } finally {
        client.release();
    }
}

// Run migration if this file is executed directly
if (require.main === module) {
    migrateEmailVerification()
        .then(() => {
            console.log('Migration completed successfully');
            process.exit(0);
        })
        .catch((error) => {
            console.error('Migration failed:', error);
            process.exit(1);
        });
}

module.exports = { migrateEmailVerification };
