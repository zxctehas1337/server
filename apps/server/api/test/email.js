import { sendWelcomeEmail, verifyEmailConfig } from '../../utils/email';
import { success, badRequest, serverError } from '../../utils/response';

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

            case 'test':
                // Test email configuration
                const configResult = await verifyEmailConfig();
                if (!configResult.success) {
                    return serverError(res, `Email configuration error: ${configResult.error}`);
                }
                
                // Send a test email
                result = await sendWelcomeEmail(to, 'TestUser');
                break;

            default:
                return badRequest(res, 'Invalid email template. Use "welcome" or "test"');
        }

        if (result.success) {
            return success(res, {
                message: 'Email sent successfully',
                messageId: result.messageId,
                template,
                recipient: to
            });
        } else {
            return serverError(res, `Failed to send email: ${result.error}`);
        }

    } catch (error) {
        console.error('Email test error:', error);
        return serverError(res, 'Failed to send test email');
    }
}
