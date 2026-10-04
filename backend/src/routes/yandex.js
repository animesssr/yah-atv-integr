const express = require('express');
const authenticate = require('../middleware/auth');
const db = require('../database');
const { getClient } = require('../websocket'); // We'll export a function to get active WS clients

const router = express.Router();

router.use(authenticate);

// 1. Device discovery (Yandex asks what devices are available)
router.get('/user/devices', (req, res) => {
    const userId = req.userId; // This is the device.id

    // Check if device exists and is paired
    const device = db.prepare('SELECT * FROM devices WHERE id = ?').get(userId);

    if (!device) {
        return res.json({
            request_id: req.headers['x-request-id'],
            payload: {
                user_id: userId,
                devices: []
            }
        });
    }

    // Define our TV capabilities based on user requirements
    const tvDevice = {
        id: device.id,
        name: device.name || 'Телевизор',
        description: 'Android TV',
        room: 'Зал',
        type: 'devices.types.media_device.tv',
        capabilities: [
            {
                type: 'devices.capabilities.on_off',
                retrievable: false // Can't easily retrieve state if offline, so assume false
            },
            {
                type: 'devices.capabilities.range',
                retrievable: false,
                parameters: {
                    instance: 'volume',
                    random_access: true,
                    range: {
                        min: 0,
                        max: 100,
                        precision: 1
                    }
                }
            },
            {
                type: 'devices.capabilities.toggle',
                retrievable: false,
                parameters: {
                    instance: 'pause'
                }
            },
            {
                type: 'devices.capabilities.mode',
                retrievable: false,
                parameters: {
                    instance: 'input_source',
                    modes: [
                        { value: 'one', name: 'YouTube' },
                        { value: 'two', name: 'Кинопоиск' },
                        { value: 'three', name: 'VPN' }
                    ]
                }
            }
        ]
    };

    res.json({
        request_id: req.headers['x-request-id'],
        payload: {
            user_id: userId,
            devices: [tvDevice]
        }
    });
});

// 2. Query device state (Yandex asks for current state)
router.post('/user/devices/query', (req, res) => {
    // For simplicity, we assume devices are offline if WS is disconnected,
    // and we don't store actual state (volume level) in DB right now.

    const { devices } = req.body;
    const deviceStates = devices.map(d => {
        const client = getClient(d.id);
        const isOnline = !!client;

        return {
            id: d.id,
            capabilities: [
                {
                    type: 'devices.capabilities.on_off',
                    state: {
                        instance: 'on',
                        value: isOnline // Just an approximation
                    }
                }
            ]
        };
    });

    res.json({
        request_id: req.headers['x-request-id'],
        payload: {
            devices: deviceStates
        }
    });
});

// 3. Execute actions (Yandex tells us to do something)
router.post('/user/devices/action', (req, res) => {
    const { payload } = req.body;
    const deviceResults = [];

    for (const requestedDevice of payload.devices) {
        const deviceId = requestedDevice.id;
        const client = getClient(deviceId);

        const actionResult = {
            id: deviceId,
            capabilities: []
        };

        if (!client) {
            // TV is offline/not connected
            for (const capability of requestedDevice.capabilities) {
                 actionResult.capabilities.push({
                    type: capability.type,
                    state: {
                        instance: capability.state.instance,
                        action_result: {
                            status: 'ERROR',
                            error_code: 'DEVICE_UNREACHABLE'
                        }
                    }
                });
            }
        } else {
            // TV is online, forward commands via WebSocket
            for (const capability of requestedDevice.capabilities) {
                // Send command to TV
                const command = {
                    action: capability.type,
                    instance: capability.state.instance,
                    value: capability.state.value
                };

                try {
                    client.send(JSON.stringify(command));

                    actionResult.capabilities.push({
                        type: capability.type,
                        state: {
                            instance: capability.state.instance,
                            action_result: {
                                status: 'DONE'
                            }
                        }
                    });
                } catch (e) {
                     actionResult.capabilities.push({
                        type: capability.type,
                        state: {
                            instance: capability.state.instance,
                            action_result: {
                                status: 'ERROR',
                                error_code: 'INTERNAL_ERROR'
                            }
                        }
                    });
                }
            }
        }
        deviceResults.push(actionResult);
    }

    res.json({
        request_id: req.headers['x-request-id'],
        payload: {
            devices: deviceResults
        }
    });
});

module.exports = router;
