-- Browser Messenger Database Schema
-- Create database tables for users and messages

-- Users table: stores user account information
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Messages table: stores chat messages
CREATE TABLE IF NOT EXISTS messages (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_messages_user_id ON messages(user_id);
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);

-- Optional: Add some constraints (only if they don't already exist)
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
