const { query } = require('../../utils/db.js');
const { hashPassword } = require('../../utils/hash.js');
const { sendVerificationEmail } = require('../../utils/email.js');
const { success, badRequest, serverError } = require('../../utils/response.js');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { username, email, password, tosAccepted } = req.body;

    // Validation
    if (!username || !email || !password) {
      return badRequest(res, 'Все поля обязательны для заполнения');
    }

    if (!tosAccepted) {
      return badRequest(res, 'Вы должны принять условия соглашения и политику конфиденциальности');
    }

    if (username.length < 3) {
      return badRequest(res, 'Имя пользователя должно содержать минимум 3 символа');
    }

    if (password.length < 6) {
      return badRequest(res, 'Пароль должен содержать минимум 6 символов');
    }

    if (!email.includes('@')) {
      return badRequest(res, 'Пожалуйста, введите корректный email');
    }

    // Check if username already exists
    const existingUser = await query(
      'SELECT id FROM users WHERE username = $1',
      [username]
    );

    if (existingUser.rows.length > 0) {
      return badRequest(res, 'Пользователь с таким именем уже существует');
    }

    // Check if email already exists
    const existingEmail = await query(
      'SELECT id FROM users WHERE email = $1',
      [email]
    );

    if (existingEmail.rows.length > 0) {
      return badRequest(res, 'Пользователь с таким email уже существует');
    }

    // Hash password
    const hashedPassword = await hashPassword(password);

    // Generate verification code
    const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();

    // Create user with email_verified = false
    const newUser = await query(
      `INSERT INTO users (username, email, password_hash, email_verified, verification_code, verification_code_expires) 
       VALUES ($1, $2, $3, false, $4, NOW() + INTERVAL '15 minutes') 
       RETURNING id, username, email`,
      [username, email, hashedPassword, verificationCode]
    );

    // Send verification email
    try {
      await sendVerificationEmail(email, username, verificationCode);
    } catch (emailError) {
      console.error('Email sending error:', emailError);
      // Delete the user if email sending fails
      await query('DELETE FROM users WHERE id = $1', [newUser.rows[0].id]);
      return serverError(res, 'Ошибка при отправке email. Попробуйте позже.');
    }

    return success(res, {
      message: 'Код подтверждения отправлен на ваш email',
      userId: newUser.rows[0].id
    });

  } catch (error) {
    console.error('Registration error:', error);
    return serverError(res, 'Ошибка при регистрации');
  }
}
