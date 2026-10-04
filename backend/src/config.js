const path = require('path');

module.exports = {
  PORT: process.env.PORT || 3000,
  DB_PATH: path.join(__dirname, '..', 'database.sqlite'),
  OAUTH_CLIENT_ID: process.env.OAUTH_CLIENT_ID || 'yandex_smart_home_client',
  OAUTH_CLIENT_SECRET: process.env.OAUTH_CLIENT_SECRET || 'secret_key',
  JWT_SECRET: process.env.JWT_SECRET || 'super_secret_jwt_key',
};
