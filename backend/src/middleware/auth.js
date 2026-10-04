const db = require('../database');

function authenticate(req, res, next) {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).send('Unauthorized');
    }

    const token = authHeader.split(' ')[1];

    const tokenData = db.prepare('SELECT * FROM oauth_tokens WHERE access_token = ?').get(token);

    if (!tokenData || tokenData.expires_at < Date.now()) {
        return res.status(401).send('Unauthorized or token expired');
    }

    // Attach user_id (which corresponds to our device_id in this simple 1-to-1 mapping)
    req.userId = tokenData.user_id;
    next();
}

module.exports = authenticate;
