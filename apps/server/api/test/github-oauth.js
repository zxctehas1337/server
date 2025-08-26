import { success, serverError } from '../../utils/response';

export default async function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const config = {
            githubClientId: process.env.GITHUB_CLIENT_ID ? '✅ Настроен' : '❌ Не настроен',
            githubClientSecret: process.env.GITHUB_CLIENT_SECRET ? '✅ Настроен' : '❌ Не настроен',
            githubCallbackUrl: process.env.GITHUB_CALLBACK_URL || 'http://localhost:3000/api/auth/github/callback',
            jwtSecret: process.env.JWT_SECRET ? '✅ Настроен' : '❌ Не настроен',
            environment: process.env.NODE_ENV || 'development'
        };

        return success(res, {
            message: 'GitHub OAuth Configuration Status',
            config,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('GitHub OAuth test error:', error);
        return serverError(res, 'Failed to check GitHub OAuth configuration');
    }
}
