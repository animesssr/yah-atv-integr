module.exports = {
  apps: [
    {
      name: "yandex-tv-backend",
      script: "src/server.js",
      instances: 1, // WebSocket connection state is held in memory, so stick to 1 instance
      autorestart: true,
      watch: false,
      max_memory_restart: "500M",
      env: {
        NODE_ENV: "production",
        PORT: 3000,
        OAUTH_CLIENT_ID: "yandex_smart_home_client",
        OAUTH_CLIENT_SECRET: "your_secret_key_here",
        JWT_SECRET: "your_jwt_secret_here"
      }
    }
  ]
};
