const { query } = require('../../utils/db.js');
const { comparePassword } = require('../../utils/hash.js');
const { success, badRequest, unauthorized, serverError } = require('../../utils/response.js');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { username, password } = req.body;

    // Validate input
    if (!username || !password) {
      return badRequest(res, 'Имя пользователя и пароль обязательны');
    }

    // Find user
    const userResult = await query(
      'SELECT id, username, password_hash, avatar_url, email, email_verified, created_at, last_seen FROM users WHERE username = $1',
      [username]
    );

    if (userResult.rows.length === 0) {
      return unauthorized(res, 'Неверное имя пользователя или пароль');
    }

    const user = userResult.rows[0];

    // Check if email is verified (for non-OAuth users)
    if (user.email && !user.email_verified && !user.is_oauth_user) {
      return unauthorized(res, 'Пожалуйста, подтвердите ваш email перед входом');
    }

    // Verify password
    if (!comparePassword(password, user.password_hash)) {
      return unauthorized(res, 'Неверное имя пользователя или пароль');
    }

    // Update last seen
    await query(
      'UPDATE users SET last_seen = CURRENT_TIMESTAMP WHERE id = $1',
      [user.id]
    );

    // Update avatar URL if not set (for backward compatibility)
    if (!user.avatar_url) {
      const avatarUrl = `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(username.toLowerCase())}&backgroundColor=6366f1`;
      await query(
        'UPDATE users SET avatar_url = $1 WHERE id = $2',
        [avatarUrl, user.id]
      );
      user.avatar_url = avatarUrl;
    }

    // Ensure user is in general chat room (room_id = 1)
    await query(
      'INSERT INTO chat_room_participants (room_id, user_id) VALUES ($1, $2) ON CONFLICT (room_id, user_id) DO NOTHING',
      [1, user.id]
    );

    return success(res, {
      user: {
        id: user.id,
        username: user.username,
        avatar_url: user.avatar_url,
        email: user.email,
        email_verified: user.email_verified,
        created_at: user.created_at,
        last_seen: user.last_seen
      }
    });

  } catch (error) {
    console.error('Login error:', error);
    return serverError(res, 'Ошибка при входе');
  }
}
