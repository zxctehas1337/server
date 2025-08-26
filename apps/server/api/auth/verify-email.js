const { query } = require('../../utils/db.js');
const { success, badRequest, serverError } = require('../../utils/response.js');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { code } = req.body;

    // Validation
    if (!code || code.length !== 6) {
      return badRequest(res, 'Неверный код подтверждения');
    }

    // Find user with this verification code
    const userResult = await query(
      `SELECT id, username, email, verification_code, verification_code_expires 
       FROM users 
       WHERE verification_code = $1 AND email_verified = false`,
      [code]
    );

    if (userResult.rows.length === 0) {
      return badRequest(res, 'Неверный код подтверждения');
    }

    const user = userResult.rows[0];

    // Check if code is expired
    if (new Date() > new Date(user.verification_code_expires)) {
      return badRequest(res, 'Код подтверждения истек. Запросите новый код.');
    }

    // Verify email and clear verification code
    await query(
      `UPDATE users 
       SET email_verified = true, 
           verification_code = NULL, 
           verification_code_expires = NULL,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [user.id]
    );

    // Add user to general chat room
    await query(
      'INSERT INTO chat_room_participants (room_id, user_id) VALUES ($1, $2) ON CONFLICT (room_id, user_id) DO NOTHING',
      [1, user.id]
    );

    return success(res, {
      message: 'Email успешно подтвержден',
      user: {
        id: user.id,
        username: user.username,
        email: user.email
      }
    });

  } catch (error) {
    console.error('Email verification error:', error);
    return serverError(res, 'Ошибка при подтверждении email');
  }
}
