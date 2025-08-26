const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL || `postgresql://${process.env.DB_USER || 'postgres'}:${process.env.DB_PASSWORD || 'password'}@${process.env.DB_HOST || 'localhost'}:${process.env.DB_PORT || 5432}/${process.env.DB_NAME || 'browser_messenger'}`
});

async function addEmailLogsTable() {
    const client = await pool.connect();
    
    try {
        await client.query('BEGIN');
        
        // Create email_logs table
        await client.query(`
            CREATE TABLE IF NOT EXISTS email_logs (
                id SERIAL PRIMARY KEY,
                recipient VARCHAR(255) NOT NULL,
                template VARCHAR(100) NOT NULL,
                status VARCHAR(50) NOT NULL DEFAULT 'sent',
                sent_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                error_message TEXT,
                message_id VARCHAR(255)
            )
        `);
        
        // Create indexes for better performance
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_email_logs_recipient ON email_logs(recipient);
            CREATE INDEX IF NOT EXISTS idx_email_logs_template ON email_logs(template);
            CREATE INDEX IF NOT EXISTS idx_email_logs_sent_at ON email_logs(sent_at DESC);
        `);
        
        // Add email field to users table if it doesn't exist
        const emailColumnExists = await client.query(`
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'users' AND column_name = 'email'
        `);
        
        if (emailColumnExists.rows.length === 0) {
            await client.query(`
                ALTER TABLE users ADD COLUMN email VARCHAR(255);
                CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
            `);
        }
        
        // Add github_id field to users table if it doesn't exist
        const githubIdColumnExists = await client.query(`
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'users' AND column_name = 'github_id'
        `);
        
        if (githubIdColumnExists.rows.length === 0) {
            await client.query(`
                ALTER TABLE users ADD COLUMN github_id VARCHAR(255);
                CREATE INDEX IF NOT EXISTS idx_users_github_id ON users(github_id);
            `);
        }
        
        // Add is_oauth_user field to users table if it doesn't exist
        const oauthColumnExists = await client.query(`
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'users' AND column_name = 'is_oauth_user'
        `);
        
        if (oauthColumnExists.rows.length === 0) {
            await client.query(`
                ALTER TABLE users ADD COLUMN is_oauth_user BOOLEAN DEFAULT FALSE;
            `);
        }
        
        // Make password_hash optional for OAuth users
        await client.query(`
            ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;
        `);
        
        await client.query('COMMIT');
        console.log('✅ Email logs table and OAuth fields added successfully');
        
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('❌ Error adding email logs table:', error);
        throw error;
    } finally {
        client.release();
    }
}

// Run migration
addEmailLogsTable()
    .then(() => {
        console.log('Migration completed successfully');
        process.exit(0);
    })
    .catch((error) => {
        console.error('Migration failed:', error);
        process.exit(1);
    });
