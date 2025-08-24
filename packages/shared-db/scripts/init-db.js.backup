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
        
        // Read the schema file
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
