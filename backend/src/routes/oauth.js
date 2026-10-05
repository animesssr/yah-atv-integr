const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../database');
const config = require('../config');

const router = express.Router();

// 1. Authorization endpoint (Yandex redirects here to show UI)
router.get('/authorize', (req, res) => {
  const { client_id, response_type, redirect_uri, state } = req.query;

  // Basic validation
  if (client_id !== config.OAUTH_CLIENT_ID) {
    return res.status(400).send('Invalid client_id');
  }

  // Render the pairing screen where the user enters the code displayed on their TV
  res.render('authorize', { redirect_uri, state, client_id });
});

// 2. Handle the form submission from the authorization page
router.post('/authorize', (req, res) => {
  const { pairing_code, redirect_uri, state, client_id } = req.body;

  // Find the device by pairing code
  const device = db.prepare('SELECT * FROM devices WHERE pairing_code = ?').get(pairing_code);

  if (!device) {
    return res.render('authorize', {
        redirect_uri,
        state,
        client_id,
        error: 'Неверный код. Проверьте код на телевизоре.'
    });
  }

  // Generate an authorization code
  const authCode = uuidv4();
  const userId = device.id; // Treat device ID as user ID for simplicity in linking

  // Store the auth code (valid for 10 minutes)
  const expiresAt = Date.now() + 10 * 60 * 1000;
  db.prepare(`
    INSERT INTO auth_codes (code, user_id, client_id, redirect_uri, expires_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(authCode, userId, client_id, redirect_uri, expiresAt);

  // Link device to "user" (itself) and clear pairing code
  db.prepare('UPDATE devices SET paired_user_id = ?, pairing_code = NULL WHERE id = ?').run(userId, device.id);

  // Redirect back to Yandex with the code
  const redirectUrl = new URL(redirect_uri);
  redirectUrl.searchParams.append('code', authCode);
  redirectUrl.searchParams.append('state', state);

  res.redirect(redirectUrl.toString());
});

// 3. Token endpoint (Yandex exchanges the auth code for access/refresh tokens)
router.post('/token', (req, res) => {
  let { grant_type, code, client_id, client_secret, refresh_token } = req.body;

  // Support for HTTP Basic Auth (Yandex sends credentials in header by default)
  const authHeader = req.headers.authorization;
  if (!client_id && !client_secret && authHeader && authHeader.startsWith('Basic ')) {
    const b64auth = authHeader.split(' ')[1] || '';
    const [login, password] = Buffer.from(b64auth, 'base64').toString().split(':');
    client_id = login;
    client_secret = password;
  }

  if (client_id !== config.OAUTH_CLIENT_ID || client_secret !== config.OAUTH_CLIENT_SECRET) {
    return res.status(401).json({ error: 'invalid_client' });
  }

  if (grant_type === 'authorization_code') {
    // Validate auth code
    const authCodeData = db.prepare('SELECT * FROM auth_codes WHERE code = ? AND client_id = ?').get(code, client_id);

    if (!authCodeData || authCodeData.expires_at < Date.now()) {
        return res.status(400).json({ error: 'invalid_grant' });
    }

    // Delete used auth code
    db.prepare('DELETE FROM auth_codes WHERE code = ?').run(code);

    // Generate tokens
    const accessToken = uuidv4();
    const refreshToken = uuidv4();
    const expiresIn = 3600 * 24 * 30; // 30 days
    const expiresAt = Date.now() + expiresIn * 1000;

    // Store tokens
    db.prepare(`
        INSERT INTO oauth_tokens (access_token, refresh_token, user_id, client_id, expires_at)
        VALUES (?, ?, ?, ?, ?)
    `).run(accessToken, refreshToken, authCodeData.user_id, client_id, expiresAt);

    return res.json({
        access_token: accessToken,
        refresh_token: refreshToken,
        token_type: 'Bearer',
        expires_in: expiresIn
    });

  } else if (grant_type === 'refresh_token') {
    // Validate refresh token
    const tokenData = db.prepare('SELECT * FROM oauth_tokens WHERE refresh_token = ? AND client_id = ?').get(refresh_token, client_id);

    if (!tokenData) {
        return res.status(400).json({ error: 'invalid_grant' });
    }

    // Generate new tokens
    const newAccessToken = uuidv4();
    const newRefreshToken = uuidv4();
    const expiresIn = 3600 * 24 * 30;
    const expiresAt = Date.now() + expiresIn * 1000;

    // Update tokens in DB (delete old, insert new)
    db.prepare('DELETE FROM oauth_tokens WHERE refresh_token = ?').run(refresh_token);
    db.prepare(`
        INSERT INTO oauth_tokens (access_token, refresh_token, user_id, client_id, expires_at)
        VALUES (?, ?, ?, ?, ?)
    `).run(newAccessToken, newRefreshToken, tokenData.user_id, client_id, expiresAt);

    return res.json({
        access_token: newAccessToken,
        refresh_token: newRefreshToken,
        token_type: 'Bearer',
        expires_in: expiresIn
    });
  }

  res.status(400).json({ error: 'unsupported_grant_type' });
});

module.exports = router;
