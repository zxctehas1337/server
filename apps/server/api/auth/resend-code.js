const { query } = require('../../utils/db.js');
const { sendVerificationEmail } = require('../../utils/email.js');
const { success, badRequest, serverError } = require('../../utils/response.js');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { email } = req.body;

    // Validation
    if (!email || !email.includes('@')) {
      return badRequest(res, 'Пожалуйста, введите корректный email');
    }

    // Find user with this email
    const userResult = await query(
      `SELECT id, username, email 
       FROM users 
       WHERE email = $1 AND email_verified = false`,
      [email]
    );

    if (userResult.rows.length === 0) {
      return badRequest(res, 'Пользователь с таким email не найден или email уже подтвержден');
    }

    const user = userResult.rows[0];

    // Generate new verification code
    const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();

    // Update verification code
    await query(
      `UPDATE users 
       SET verification_code = $1, 
           verification_code_expires = NOW() + INTERVAL '15 minutes'
       WHERE id = $2`,
      [verificationCode, user.id]
    );

    // Send verification email
    try {
      await sendVerificationEmail(email, user.username, verificationCode);
    } catch (emailError) {
      console.error('Email sending error:', emailError);
      return serverError(res, 'Ошибка при отправке email. Попробуйте позже.');
    }

    return success(res, {
      message: 'Код подтверждения отправлен повторно'
    });

  } catch (error) {
    console.error('Resend code error:', error);
    return serverError(res, 'Ошибка при отправке кода');
  }
}
