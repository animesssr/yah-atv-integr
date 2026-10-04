const WebSocket = require('ws');
const db = require('./database');

// In-memory mapping of deviceId -> WebSocket connection
const activeClients = new Map();

function setupWebSocket(server) {
    const wss = new WebSocket.Server({ server, path: '/ws' });

    wss.on('connection', (ws, req) => {
        let deviceId = null;
        ws.isAlive = true;

        ws.on('pong', () => {
            ws.isAlive = true;
        });

        ws.on('message', (message) => {
            try {
                const data = JSON.parse(message);

                if (data.type === 'register') {
                    deviceId = data.deviceId;
                    const name = data.name || 'Android TV';

                    // Check if device exists in DB
                    let device = db.prepare('SELECT * FROM devices WHERE id = ?').get(deviceId);
                    let pairingCode = null;

                    if (!device) {
                        // Generate a 4-digit pairing code
                        pairingCode = Math.floor(1000 + Math.random() * 9000).toString();
                        db.prepare('INSERT INTO devices (id, name, pairing_code) VALUES (?, ?, ?)')
                          .run(deviceId, name, pairingCode);
                    } else if (!device.paired_user_id) {
                         // Needs pairing, generate new code or use existing
                         pairingCode = device.pairing_code;
                         if (!pairingCode) {
                             pairingCode = Math.floor(1000 + Math.random() * 9000).toString();
                             db.prepare('UPDATE devices SET pairing_code = ? WHERE id = ?').run(pairingCode, deviceId);
                         }
                    }

                    // Store active connection
                    activeClients.set(deviceId, ws);

                    // Respond to TV
                    ws.send(JSON.stringify({
                        type: 'registered',
                        status: 'success',
                        paired: !!(device && device.paired_user_id),
                        pairingCode: pairingCode
                    }));

                    console.log(`Device ${deviceId} registered via WS. Paired: ${!!(device && device.paired_user_id)}`);
                }
            } catch (err) {
                console.error('Error parsing WS message:', err);
            }
        });

        ws.on('close', () => {
            if (deviceId) {
                activeClients.delete(deviceId);
                console.log(`Device ${deviceId} disconnected`);
            }
        });
    });

    // Ping mechanism to keep connections alive and detect dead ones
    const interval = setInterval(() => {
        wss.clients.forEach((ws) => {
            if (ws.isAlive === false) return ws.terminate();
            ws.isAlive = false;
            ws.ping();
        });
    }, 30000); // Ping every 30 seconds

    wss.on('close', () => {
        clearInterval(interval);
    });

    return wss;
}

function getClient(deviceId) {
    return activeClients.get(deviceId);
}

module.exports = {
    setupWebSocket,
    getClient
};
