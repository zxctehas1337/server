const passport = require('passport');
const GitHubStrategy = require('passport-github2').Strategy;
const { query } = require('../../utils/db');
const { success, badRequest, serverError } = require('../../utils/response');

// GitHub OAuth configuration
const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID;
const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET;
const GITHUB_CALLBACK_URL = process.env.GITHUB_CALLBACK_URL || 'http://localhost:3000/api/auth/github/callback';

// Configure GitHub Strategy
passport.use(new GitHubStrategy({
    clientID: GITHUB_CLIENT_ID,
    clientSecret: GITHUB_CLIENT_SECRET,
    callbackURL: GITHUB_CALLBACK_URL,
    scope: ['user:email']
}, async (accessToken, refreshToken, profile, done) => {
    try {
        // Check if user already exists
        let user = await query(
            'SELECT * FROM users WHERE github_id = $1',
            [profile.id]
        );

        if (user.rows.length > 0) {
            // User exists, update last seen
            await query(
                'UPDATE users SET last_seen = CURRENT_TIMESTAMP WHERE id = $1',
                [user.rows[0].id]
            );
            return done(null, user.rows[0]);
        }

        // Create new user
        const email = profile.emails && profile.emails[0] ? profile.emails[0].value : null;
        const username = profile.username || `github_${profile.id}`;
        const avatarUrl = profile.photos && profile.photos[0] ? profile.photos[0].value : null;

        const newUser = await query(
            `INSERT INTO users (username, email, github_id, avatar_url, is_oauth_user) 
             VALUES ($1, $2, $3, $4, true) 
             RETURNING *`,
            [username, email, profile.id, avatarUrl]
        );

        // Add user to general chat room
        await query(
            'INSERT INTO chat_room_participants (room_id, user_id) VALUES ($1, $2) ON CONFLICT (room_id, user_id) DO NOTHING',
            [1, newUser.rows[0].id]
        );

        return done(null, newUser.rows[0]);
    } catch (error) {
        return done(error);
    }
}));

// Serialize user for session
passport.serializeUser((user, done) => {
    done(null, user.id);
});

// Deserialize user from session
passport.deserializeUser(async (id, done) => {
    try {
        const result = await query('SELECT * FROM users WHERE id = $1', [id]);
        done(null, result.rows[0]);
    } catch (error) {
        done(error);
    }
});

// GitHub OAuth routes
export default function handler(req, res) {
    if (req.method === 'GET') {
        // Initiate GitHub OAuth
        passport.authenticate('github', { scope: ['user:email'] })(req, res);
    } else {
        res.status(405).json({ error: 'Method not allowed' });
    }
}

// Callback handler
export function callbackHandler(req, res) {
    passport.authenticate('github', { failureRedirect: '/login' }, (err, user) => {
        if (err) {
            return serverError(res, 'Authentication failed');
        }
        if (!user) {
            return badRequest(res, 'User not found');
        }

        // Create JWT token
        const jwt = require('jsonwebtoken');
        const token = jwt.sign(
            { userId: user.id, username: user.username },
            process.env.JWT_SECRET || 'your-secret-key',
            { expiresIn: '7d' }
        );

        // Redirect to frontend with token
        res.redirect(`/?token=${token}`);
    })(req, res);
}
