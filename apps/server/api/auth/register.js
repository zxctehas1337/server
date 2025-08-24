const { query } = require('../../utils/db');
const { hashPassword } = require('../../utils/hash');
const { success, badRequest, conflict, serverError } = require('../../utils/response');

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { username, password } = req.body;

    // Validate input
    if (!username || !password) {
      return badRequest(res, 'Username and password are required');
    }

    if (username.length < 3 || username.length > 50) {
      return badRequest(res, 'Username must be between 3 and 50 characters');
    }

    if (password.length < 4) {
      return badRequest(res, 'Password must be at least 4 characters');
    }

    // Check if username already exists
    const existingUser = await query(
      'SELECT id FROM users WHERE username = $1',
      [username]
    );

    if (existingUser.rows.length > 0) {
      return conflict(res, 'Username already taken');
    }

    // Hash password (currently plain text, matches existing behavior)
    const hashedPassword = hashPassword(password);

    // Generate avatar URL
    const avatarUrl = `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(username.toLowerCase())}&backgroundColor=6366f1`;

    // Create user
    const userResult = await query(
      'INSERT INTO users (username, password_hash, avatar_url) VALUES ($1, $2, $3) RETURNING id, username, avatar_url, created_at',
      [username, hashedPassword, avatarUrl]
    );

    const user = userResult.rows[0];

    // Add user to general chat room (room_id = 1)
    await query(
      'INSERT INTO chat_room_participants (room_id, user_id) VALUES ($1, $2) ON CONFLICT (room_id, user_id) DO NOTHING',
      [1, user.id]
    );

    return success(res, {
      user: {
        id: user.id,
        username: user.username,
        avatar_url: user.avatar_url,
        created_at: user.created_at
      }
    }, 201);

  } catch (error) {
    console.error('Registration error:', error);
    return serverError(res, 'Failed to register user');
  }
}
