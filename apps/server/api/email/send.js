const { sendEmail, sendWelcomeEmail, sendPasswordResetEmail, sendNotificationEmail } = require('../../utils/email');
const { query } = require('../../utils/db');
const { success, badRequest, serverError } = require('../../utils/response');

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { template, to, data } = req.body;

        // Validate input
        if (!template || !to) {
            return badRequest(res, 'Template and recipient email are required');
        }

        // Validate email format
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(to)) {
            return badRequest(res, 'Invalid email format');
        }

        let result;

        // Handle different email templates
        switch (template) {
            case 'welcome':
                if (!data || !data.username) {
                    return badRequest(res, 'Username is required for welcome email');
                }
                result = await sendWelcomeEmail(to, data.username);
                break;

            case 'passwordReset':
                if (!data || !data.resetLink) {
                    return badRequest(res, 'Reset link is required for password reset email');
                }
                result = await sendPasswordResetEmail(to, data.resetLink);
                break;

            case 'notification':
                if (!data || !data.username || !data.message) {
                    return badRequest(res, 'Username and message are required for notification email');
                }
                result = await sendNotificationEmail(to, data.username, data.message);
                break;

            default:
                return badRequest(res, 'Invalid email template');
        }

        if (result.success) {
            // Log email sent to database (optional)
            try {
                await query(
                    'INSERT INTO email_logs (recipient, template, status) VALUES ($1, $2, $3)',
                    [to, template, 'sent']
                );
            } catch (dbError) {
                console.warn('Failed to log email to database:', dbError);
            }

            return success(res, {
                message: 'Email sent successfully',
                messageId: result.messageId
            });
        } else {
            return serverError(res, `Failed to send email: ${result.error}`);
        }

    } catch (error) {
        console.error('Email API error:', error);
        return serverError(res, 'Failed to send email');
    }
}
