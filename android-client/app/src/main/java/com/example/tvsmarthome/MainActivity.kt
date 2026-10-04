package com.example.tvsmarthome

import android.content.Context
import android.content.Intent
import android.content.SharedPreferences
import android.os.Bundle
import android.util.Log
import android.widget.TextView
import androidx.fragment.app.FragmentActivity
import java.util.UUID

class MainActivity : FragmentActivity() {

    private lateinit var tvStatus: TextView
    private lateinit var tvPairingCode: TextView
    private lateinit var prefs: SharedPreferences

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        tvStatus = findViewById(R.id.tvStatus)
        tvPairingCode = findViewById(R.id.tvPairingCode)
        prefs = getSharedPreferences("SmartHomePrefs", Context.MODE_PRIVATE)

        // Generate or retrieve Device ID
        var deviceId = prefs.getString("DEVICE_ID", null)
        if (deviceId == null) {
            deviceId = UUID.randomUUID().toString()
            prefs.edit().putString("DEVICE_ID", deviceId).apply()
        }

        // Start Background Service
        val serviceIntent = Intent(this, SmartHomeService::class.java)
        serviceIntent.putExtra("DEVICE_ID", deviceId)
        startService(serviceIntent)

        // Listen for broadcasts from the service to update UI
        // In a real app we'd use LocalBroadcastManager or LiveData,
        // here we use a simple static reference for the MVP
        SmartHomeService.activityCallback = { status, code, paired ->
            runOnUiThread {
                if (paired) {
                    tvStatus.text = getString(R.string.status_paired)
                    tvPairingCode.text = "✓"
                } else if (code != null) {
                    tvStatus.text = getString(R.string.status_connected)
                    tvPairingCode.text = code
                } else {
                    tvStatus.text = status
                }
            }
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        SmartHomeService.activityCallback = null
    }
}
