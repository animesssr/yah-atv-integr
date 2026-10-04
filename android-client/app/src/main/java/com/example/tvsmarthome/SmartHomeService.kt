package com.example.tvsmarthome

import android.app.Service
import android.content.Context
import android.content.Intent
import android.media.AudioManager
import android.os.IBinder
import android.os.PowerManager
import android.util.Log
import android.view.KeyEvent
import okhttp3.*
import org.json.JSONObject
import java.util.concurrent.TimeUnit
import kotlin.math.roundToInt

class SmartHomeService : Service() {

    private val TAG = "SmartHomeService"
    // IP адрес сервера. Для тестов на эмуляторе используем 10.0.2.2.
    // Если тестируете на реальном ТВ, замените на локальный IP вашего ПК (например, 192.168.1.X)
    // или на ваш домен VPS.
    private val WEBSOCKET_URL = "ws://10.0.2.2:3000/ws"

    private var webSocket: WebSocket? = null
    private var deviceId: String = ""
    private var isPaired = false

    private lateinit var audioManager: AudioManager
    private lateinit var powerManager: PowerManager
    private var wakeLock: PowerManager.WakeLock? = null

    companion object {
        var activityCallback: ((status: String, code: String?, paired: Boolean) -> Unit)? = null
    }

    override fun onCreate() {
        super.onCreate()
        audioManager = getSystemService(Context.AUDIO_SERVICE) as AudioManager
        powerManager = getSystemService(Context.POWER_SERVICE) as PowerManager

        // Acquire partial wakelock to try to keep CPU running when screen is off
        wakeLock = powerManager.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "TvSmartHome::BackgroundConnection")
        wakeLock?.acquire()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        var intentDeviceId = intent?.getStringExtra("DEVICE_ID")
        if (intentDeviceId.isNullOrEmpty()) {
            val prefs = getSharedPreferences("SmartHomePrefs", Context.MODE_PRIVATE)
            intentDeviceId = prefs.getString("DEVICE_ID", "")
        }

        deviceId = intentDeviceId ?: ""
        if (deviceId.isNotEmpty() && webSocket == null) {
            connectWebSocket()
        }
        return START_STICKY
    }

    override fun onBind(intent: Intent?): IBinder? = null

    private fun connectWebSocket() {
        Log.d(TAG, "Connecting to WebSocket...")
        activityCallback?.invoke("Подключение к серверу...", null, false)

        val client = OkHttpClient.Builder()
            .readTimeout(0, TimeUnit.MILLISECONDS) // Keep alive
            .pingInterval(30, TimeUnit.SECONDS) // Ping/Pong for keep-alive
            .build()

        val request = Request.Builder()
            .url(WEBSOCKET_URL)
            .build()

        webSocket = client.newWebSocket(request, object : WebSocketListener() {
            override fun onOpen(webSocket: WebSocket, response: Response) {
                Log.d(TAG, "WebSocket Connected")
                val regMsg = JSONObject().apply {
                    put("type", "register")
                    put("deviceId", deviceId)
                    put("name", "Android TV (Sber)")
                }
                webSocket.send(regMsg.toString())
            }

            override fun onMessage(webSocket: WebSocket, text: String) {
                Log.d(TAG, "Message received: $text")
                try {
                    val json = JSONObject(text)

                    // Handle registration response
                    if (json.optString("type") == "registered") {
                        val pairingCode = json.optString("pairingCode")
                        isPaired = json.optBoolean("paired")
                        activityCallback?.invoke("Подключено", pairingCode, isPaired)
                        return
                    }

                    // Handle Yandex actions
                    val action = json.optString("action")
                    val instance = json.optString("instance")

                    when (action) {
                        "devices.capabilities.on_off" -> {
                            val isOn = json.optBoolean("value")
                            handleOnOff(isOn)
                        }
                        "devices.capabilities.range" -> {
                            if (instance == "volume") {
                                val volume = json.optInt("value")
                                handleVolume(volume)
                            }
                        }
                        "devices.capabilities.toggle" -> {
                            if (instance == "pause") {
                                val pause = json.optBoolean("value")
                                handlePausePlay(pause)
                            }
                        }
                        "devices.capabilities.mode" -> {
                            if (instance == "input_source") {
                                val appMode = json.optString("value")
                                handleAppLaunch(appMode)
                            }
                        }
                    }
                } catch (e: Exception) {
                    Log.e(TAG, "Error parsing message", e)
                }
            }

            override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
                Log.d(TAG, "WebSocket Closed")
                this@SmartHomeService.webSocket = null
                reconnect()
            }

            override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
                Log.e(TAG, "WebSocket Failure", t)
                this@SmartHomeService.webSocket = null
                activityCallback?.invoke("Ошибка подключения, переподключение...", null, false)
                reconnect()
            }
        })
    }

    private fun reconnect() {
        Thread {
            Thread.sleep(5000)
            if (webSocket == null) {
                connectWebSocket()
            }
        }.start()
    }

    // --- Action Handlers ---

    private fun handleVolume(targetVolume: Int) {
        val maxVolume = audioManager.getStreamMaxVolume(AudioManager.STREAM_MUSIC)
        // Convert Yandex percentage (0-100) to Android volume level
        val level = (targetVolume / 100.0 * maxVolume).roundToInt()
        audioManager.setStreamVolume(AudioManager.STREAM_MUSIC, level, AudioManager.FLAG_SHOW_UI)
    }

    private fun handlePausePlay(pause: Boolean) {
        // We simulate a media key press.
        // Note: For some Android TV versions, simulating key presses requires AccessibilityService
        // or system privileges. If this doesn't work, AudioManager's requestAudioFocus might be needed.
        val keyCode = if (pause) KeyEvent.KEYCODE_MEDIA_PAUSE else KeyEvent.KEYCODE_MEDIA_PLAY

        try {
            val intent = Intent(Intent.ACTION_MEDIA_BUTTON).apply {
                putExtra(Intent.EXTRA_KEY_EVENT, KeyEvent(KeyEvent.ACTION_DOWN, keyCode))
            }
            sendOrderedBroadcast(intent, null)

            val intentUp = Intent(Intent.ACTION_MEDIA_BUTTON).apply {
                putExtra(Intent.EXTRA_KEY_EVENT, KeyEvent(KeyEvent.ACTION_UP, keyCode))
            }
            sendOrderedBroadcast(intentUp, null)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to send media key", e)
        }
    }

    private fun handleAppLaunch(appName: String) {
        val packageName = when (appName) {
            "one" -> "com.google.android.youtube.tv" // YouTube
            "two" -> "ru.kinopoisk.tv" // Kinopoisk
            "three" -> "com.wireguard.android" // VPN
            else -> return
        }

        try {
            val launchIntent = packageManager.getLaunchIntentForPackage(packageName)
            if (launchIntent != null) {
                launchIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                startActivity(launchIntent)
            } else {
                Log.e(TAG, "App not found: $packageName")
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error launching app", e)
        }
    }

    private fun handleOnOff(turnOn: Boolean) {
        if (turnOn) {
            // Waking up screen requires system privileges or device admin on modern Android.
            // A simple WakeLock might turn on the screen if ACQUIRE_CAUSES_WAKEUP is used (deprecated).
            try {
                val screenLock = powerManager.newWakeLock(
                    PowerManager.SCREEN_BRIGHT_WAKE_LOCK or PowerManager.ACQUIRE_CAUSES_WAKEUP,
                    "TvSmartHome::TurnOn"
                )
                screenLock.acquire(3000) // Acquire for 3 seconds
            } catch (e: Exception) {
                Log.e(TAG, "Failed to wake up TV", e)
            }
        } else {
            // Turning off screen is restricted.
            // Often requires DevicePolicyManager (Admin rights) or AccessibilityService.
            // As a fallback, we send KEYCODE_POWER if permitted, or just let TV sleep.
             try {
                // Simulate power button press (Requires system permission INJECT_EVENTS in real env)
                // This will likely fail on non-rooted/non-system apps, but it's the standard intent approach.
                 val runtime = Runtime.getRuntime()
                 runtime.exec("input keyevent ${KeyEvent.KEYCODE_POWER}")
            } catch (e: Exception) {
                Log.e(TAG, "Failed to sleep TV (Needs root/system)", e)
            }
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        webSocket?.close(1000, "Service Destroyed")
        wakeLock?.let {
            if (it.isHeld) it.release()
        }
    }
}
