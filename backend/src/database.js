const Database = require('better-sqlite3');
const config = require('./config');

const db = new Database(config.DB_PATH);

// Initialize tables
db.exec(`
  CREATE TABLE IF NOT EXISTS devices (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    pairing_code TEXT,
    paired_user_id TEXT
  );

  CREATE TABLE IF NOT EXISTS oauth_tokens (
    access_token TEXT PRIMARY KEY,
    refresh_token TEXT,
    user_id TEXT NOT NULL,
    client_id TEXT NOT NULL,
    expires_at INTEGER
  );

  CREATE TABLE IF NOT EXISTS auth_codes (
    code TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    client_id TEXT NOT NULL,
    redirect_uri TEXT,
    expires_at INTEGER
  );
`);

module.exports = db;
