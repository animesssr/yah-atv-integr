const express = require('express');
const http = require('http');
const path = require('path');
const cors = require('cors');
const bodyParser = require('body-parser');
const config = require('./config');

const oauthRoutes = require('./routes/oauth');
const yandexRoutes = require('./routes/yandex');
const { setupWebSocket } = require('./websocket');

const app = express();
const server = http.createServer(app);

// Setup view engine for the authorization page
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Middleware
app.use(cors());
app.use(bodyParser.urlencoded({ extended: true })); // For form submits
app.use(bodyParser.json());

// Request logging (optional, helpful for debugging Yandex requests)
app.use((req, res, next) => {
    console.log(`${req.method} ${req.url}`);
    next();
});

// Routes
app.use('/oauth', oauthRoutes);
// Yandex health check ping (unauthenticated)
app.get('/v1.0/ping', (req, res) => res.status(200).send('OK'));
app.head('/v1.0/', (req, res) => res.status(200).send());

app.use('/v1.0', yandexRoutes);

// Health check endpoint
app.get('/ping', (req, res) => res.send('pong'));

// Setup WebSocket
setupWebSocket(server);

// Start server
server.listen(config.PORT, () => {
    console.log(`Server is running on port ${config.PORT}`);
    console.log(`OAuth Base URL: http://localhost:${config.PORT}/oauth`);
    console.log(`Yandex API Base URL: http://localhost:${config.PORT}/v1.0`);
    console.log(`WebSocket URL: ws://localhost:${config.PORT}/ws`);
});
