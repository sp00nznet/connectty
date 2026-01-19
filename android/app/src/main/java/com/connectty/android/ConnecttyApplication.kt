package com.connectty.android

import android.app.Application
import com.connectty.android.data.local.ConnecttyDatabase
import timber.log.Timber

class ConnecttyApplication : Application() {
    lateinit var database: ConnecttyDatabase
        private set

    override fun onCreate() {
        super.onCreate()

        // Initialize Timber for logging
        if (BuildConfig.DEBUG) {
            Timber.plant(Timber.DebugTree())
        }

        // Initialize database
        database = ConnecttyDatabase.getInstance(this)

        Timber.d("Connectty application initialized")
    }
}
