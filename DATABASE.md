# Database Setup and Migration

## Available Scripts

### `npm run init-db`
- **Purpose**: Initialize database with proper schema
- **Safe**: Yes, handles existing tables gracefully
- **Use case**: First deployment or when adding new features
- **Migration**: Automatically migrates existing tables without room_id

### `npm run migrate-db` 
- **Purpose**: Run only migration logic for existing databases
- **Safe**: Yes, checks before making changes
- **Use case**: When you need to update existing database structure
- **Migration**: Adds room_id column to existing messages table

### `npm run reset-db`
- **Purpose**: Complete database reset (drops all tables)
- **Safe**: ⚠️ DESTRUCTIVE - will delete all data
- **Use case**: Development only, when you need a fresh start
- **Migration**: Not applicable - creates everything from scratch

## Migration Details

When `init-db` or `migrate-db` runs on an existing database:

1. **Checks** if `messages` table has `room_id` column
2. **Creates** `chat_rooms` table if missing
3. **Adds** `room_id` column to existing `messages` table
4. **Updates** all existing messages to use `room_id = 1` (General Chat)
5. **Creates** foreign key constraints and indexes
6. **Adds** new columns to `users` table if needed

## Deployment

The `postinstall` script automatically runs `init-db` during deployment, so no manual intervention is needed.

## Troubleshooting

If deployment fails with database errors:

1. Check the Render dashboard logs
2. Most issues are handled automatically by the migration logic
3. If persistent issues, consider using the Render shell to manually run `npm run migrate-db`

## Database Structure

After successful initialization:

```
users (id, username, password_hash, avatar_url, theme_preference, last_seen, created_at)
chat_rooms (id, name, room_type, created_by, created_at)
messages (id, user_id, room_id, content, timestamp)
chat_room_participants (id, room_id, user_id, joined_at)
```
