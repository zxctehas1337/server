let nodemailer;
(async () => {
  nodemailer = (await import('nodemailer')).default;
})();

// Email configuration
const emailConfig = {
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: process.env.SMTP_PORT || 587,
  secure: false, // true for 465, false for other ports
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
};

// Create transporter
const transporter = nodemailer.createTransporter(emailConfig);

/**
 * Verify email configuration
 */
async function verifyEmailConfig() {
  try {
    await transporter.verify();
    return { success: true, message: 'Email configuration is valid' };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Send welcome email
 * @param {string} email - User's email address
 * @param {string} username - User's username
 */
async function sendWelcomeEmail(email, username) {
  const mailOptions = {
    from: process.env.SMTP_FROM || `"Kracken Messenger" <${process.env.SMTP_USER}>`,
    to: email,
    subject: 'Добро пожаловать в Kracken Messenger! 🚀',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="text-align: center; margin-bottom: 30px;">
          <h1 style="color: #6366f1; margin: 0;">⚡ Kracken Messenger</h1>
          <p style="color: #666; margin: 10px 0;">Быстрый и безопасный мессенджер</p>
        </div>
        
        <div style="background: #f8f9fa; padding: 30px; border-radius: 10px; margin-bottom: 20px;">
          <h2 style="color: #333; margin-top: 0;">Добро пожаловать, ${username}! 🎉</h2>
          <p style="color: #555; line-height: 1.6;">
            Мы рады приветствовать вас в Kracken Messenger! Ваш аккаунт успешно создан и готов к использованию.
          </p>
          
          <div style="background: #6366f1; color: white; padding: 20px; border-radius: 8px; text-align: center; margin: 30px 0;">
            <h3 style="margin: 0 0 10px 0; font-size: 18px;">🚀 Начните общение прямо сейчас!</h3>
            <p style="margin: 0; font-size: 16px;">Присоединяйтесь к общим чатам и найдите новых друзей</p>
          </div>
          
          <div style="background: #e8f5e8; padding: 15px; border-radius: 8px; margin: 20px 0;">
            <h4 style="margin: 0 0 10px 0; color: #2d5a2d;">✅ Ваш аккаунт подтвержден</h4>
            <p style="margin: 0; color: #555; font-size: 14px;">
              Email адрес подтвержден автоматически через GitHub OAuth
            </p>
          </div>
        </div>
        
        <div style="text-align: center; color: #999; font-size: 12px;">
          <p>Если у вас есть вопросы, не стесняйтесь обращаться в поддержку.</p>
          <p>© 2024 Kracken Messenger. Все права защищены.</p>
        </div>
      </div>
    `
  };

  try {
    const result = await transporter.sendMail(mailOptions);
    console.log(`Welcome email sent to ${email}`);
    return { success: true, messageId: result.messageId };
  } catch (error) {
    console.error('Email sending error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Send verification email with code
 * @param {string} email - User's email address
 * @param {string} username - User's username
 * @param {string} code - Verification code
 */
async function sendVerificationEmail(email, username, code) {
  const mailOptions = {
    from: process.env.SMTP_FROM || `"Kracken Messenger" <${process.env.SMTP_USER}>`,
    to: email,
    subject: 'Подтверждение email - Kracken Messenger',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="text-align: center; margin-bottom: 30px;">
          <h1 style="color: #6366f1; margin: 0;"> Kracken Messenger</h1>
          <p style="color: #666; margin: 10px 0;">Быстрый и безопасный мессенджер</p>
        </div>
        
        <div style="background: #f8f9fa; padding: 30px; border-radius: 10px; margin-bottom: 20px;">
          <h2 style="color: #333; margin-top: 0;">Привет, ${username}!</h2>
          <p style="color: #555; line-height: 1.6;">
            Спасибо за регистрацию в Kracken Messenger. Для завершения регистрации 
            необходимо подтвердить ваш email адрес.
          </p>
          
          <div style="background: #6366f1; color: white; padding: 20px; border-radius: 8px; text-align: center; margin: 30px 0;">
            <h3 style="margin: 0 0 10px 0; font-size: 18px;">Код подтверждения</h3>
            <div style="font-size: 32px; font-weight: bold; letter-spacing: 8px; font-family: monospace;">
              ${code}
            </div>
          </div>
          
          <p style="color: #666; font-size: 14px; margin: 0;">
            Введите этот код в форму подтверждения на сайте. Код действителен в течение 15 минут.
          </p>
        </div>
        
        <div style="text-align: center; color: #999; font-size: 12px;">
          <p>Если вы не регистрировались в Kracken Messenger, просто проигнорируйте это письмо.</p>
          <p>© 2024 Kracken Messenger. Все права защищены.</p>
        </div>
      </div>
    `
  };

  try {
    const result = await transporter.sendMail(mailOptions);
    console.log(`Verification email sent to ${email}`);
    return { success: true, messageId: result.messageId };
  } catch (error) {
    console.error('Email sending error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Send password reset email
 * @param {string} email - User's email address
 * @param {string} username - User's username
 * @param {string} resetToken - Password reset token
 */
async function sendPasswordResetEmail(email, username, resetToken) {
  const resetUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/reset-password?token=${resetToken}`;
  
  const mailOptions = {
    from: process.env.SMTP_FROM || `"Kracken Messenger" <${process.env.SMTP_USER}>`,
    to: email,
    subject: 'Сброс пароля - Kracken Messenger',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="text-align: center; margin-bottom: 30px;">
          <h1 style="color: #6366f1; margin: 0;">⚡ Kracken Messenger</h1>
          <p style="color: #666; margin: 10px 0;">Быстрый и безопасный мессенджер</p>
        </div>
        
        <div style="background: #f8f9fa; padding: 30px; border-radius: 10px; margin-bottom: 20px;">
          <h2 style="color: #333; margin-top: 0;">Привет, ${username}!</h2>
          <p style="color: #555; line-height: 1.6;">
            Мы получили запрос на сброс пароля для вашего аккаунта в Kracken Messenger.
          </p>
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="${resetUrl}" 
               style="background: #6366f1; color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; display: inline-block; font-weight: bold;">
              Сбросить пароль
            </a>
          </div>
          
          <p style="color: #666; font-size: 14px; margin: 0;">
            Если вы не запрашивали сброс пароля, просто проигнорируйте это письмо.
            Ссылка действительна в течение 1 часа.
          </p>
        </div>
        
        <div style="text-align: center; color: #999; font-size: 12px;">
          <p>© 2024 Kracken Messenger. Все права защищены.</p>
        </div>
      </div>
    `
  };

  try {
    const result = await transporter.sendMail(mailOptions);
    console.log(`Password reset email sent to ${email}`);
    return { success: true, messageId: result.messageId };
  } catch (error) {
    console.error('Email sending error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Send notification email
 * @param {string} email - User's email address
 * @param {string} username - User's username
 * @param {string} message - Notification message
 */
async function sendNotificationEmail(email, username, message) {
  const mailOptions = {
    from: process.env.SMTP_FROM || `"Kracken Messenger" <${process.env.SMTP_USER}>`,
    to: email,
    subject: 'Уведомление - Kracken Messenger',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="text-align: center; margin-bottom: 30px;">
          <h1 style="color: #6366f1; margin: 0;">⚡ Kracken Messenger</h1>
          <p style="color: #666; margin: 10px 0;">Быстрый и безопасный мессенджер</p>
        </div>
        
        <div style="background: #f8f9fa; padding: 30px; border-radius: 10px; margin-bottom: 20px;">
          <h2 style="color: #333; margin-top: 0;">Привет, ${username}!</h2>
          <p style="color: #555; line-height: 1.6;">
            ${message}
          </p>
        </div>
        
        <div style="text-align: center; color: #999; font-size: 12px;">
          <p>© 2024 Kracken Messenger. Все права защищены.</p>
        </div>
      </div>
    `
  };

  try {
    const result = await transporter.sendMail(mailOptions);
    console.log(`Notification email sent to ${email}`);
    return { success: true, messageId: result.messageId };
  } catch (error) {
    console.error('Email sending error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Generic email sending function
 * @param {Object} options - Email options
 */
async function sendEmail(options) {
  const mailOptions = {
    from: process.env.SMTP_FROM || `"Kracken Messenger" <${process.env.SMTP_USER}>`,
    to: options.to,
    subject: options.subject,
    html: options.html,
    text: options.text
  };

  try {
    const result = await transporter.sendMail(mailOptions);
    console.log(`Email sent to ${options.to}`);
    return { success: true, messageId: result.messageId };
  } catch (error) {
    console.error('Email sending error:', error);
    return { success: false, error: error.message };
  }
}

module.exports = {
  verifyEmailConfig,
  sendWelcomeEmail,
  sendVerificationEmail,
  sendPasswordResetEmail,
  sendNotificationEmail,
  sendEmail
};
