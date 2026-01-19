package com.connectty.android.data.connection

import android.content.Context
import android.content.Intent
import android.net.Uri
import com.connectty.android.domain.model.Credential
import com.connectty.android.domain.model.ServerConnection
import timber.log.Timber

/**
 * Manages RDP connections
 * Uses external RDP clients via Intent for maximum compatibility
 * Can be extended with FreeRDP native library integration
 */
class RDPManager(private val context: Context) {

    /**
     * Launches an RDP connection using an external RDP client
     * Supports Microsoft Remote Desktop, aRDP, and other RDP clients
     */
    fun launchRDPConnection(
        connection: ServerConnection,
        credential: Credential?
    ): Result<Unit> {
        return try {
            // Try to launch with RDP URI scheme
            val rdpUri = buildRdpUri(connection, credential)
            val intent = Intent(Intent.ACTION_VIEW, Uri.parse(rdpUri)).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }

            // Check if any app can handle the RDP URI
            if (intent.resolveActivity(context.packageManager) != null) {
                context.startActivity(intent)
                Timber.d("Launched RDP connection: ${connection.name}")
                Result.success(Unit)
            } else {
                // Fallback: Try Microsoft Remote Desktop package
                launchMicrosoftRDP(connection, credential)
            }
        } catch (e: Exception) {
            Timber.e(e, "Failed to launch RDP connection")
            Result.failure(e)
        }
    }

    private fun buildRdpUri(connection: ServerConnection, credential: Credential?): String {
        val username = credential?.username ?: connection.username ?: ""
        val domain = credential?.domain ?: ""
        val password = credential?.password ?: credential?.secret ?: ""

        // Standard RDP URI format
        var uri = "rdp://"

        if (username.isNotEmpty()) {
            uri += username
            if (domain.isNotEmpty()) {
                uri += "@$domain"
            }
            if (password.isNotEmpty()) {
                uri += ":$password"
            }
            uri += "@"
        }

        uri += "${connection.hostname}:${connection.port}"

        return uri
    }

    private fun launchMicrosoftRDP(connection: ServerConnection, credential: Credential?): Result<Unit> {
        return try {
            val intent = Intent(Intent.ACTION_VIEW).apply {
                setClassName(
                    "com.microsoft.rdc.androidx",
                    "com.microsoft.rdc.androidx.rdclient.ui.activity.ConnectionActivity"
                )
                putExtra("hostname", connection.hostname)
                putExtra("port", connection.port)
                credential?.username?.let { putExtra("username", it) }
                credential?.domain?.let { putExtra("domain", it) }
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }

            context.startActivity(intent)
            Timber.d("Launched Microsoft RDP: ${connection.name}")
            Result.success(Unit)
        } catch (e: Exception) {
            Timber.e(e, "Microsoft RDP not installed")
            Result.failure(Exception("No RDP client installed. Please install Microsoft Remote Desktop or aRDP from Play Store"))
        }
    }

    /**
     * Checks if an RDP client is available
     */
    fun isRDPClientAvailable(): Boolean {
        val intent = Intent(Intent.ACTION_VIEW, Uri.parse("rdp://test")).apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        return intent.resolveActivity(context.packageManager) != null
    }

    /**
     * Gets a list of available RDP client apps
     */
    fun getAvailableRDPClients(): List<String> {
        val clients = mutableListOf<String>()

        // Check for Microsoft Remote Desktop
        if (isPackageInstalled("com.microsoft.rdc.androidx")) {
            clients.add("Microsoft Remote Desktop")
        }

        // Check for aRDP
        if (isPackageInstalled("com.freerdp.afreerdp")) {
            clients.add("aRDP")
        }

        // Check for RD Client
        if (isPackageInstalled("com.microsoft.rdc.android")) {
            clients.add("RD Client")
        }

        return clients
    }

    private fun isPackageInstalled(packageName: String): Boolean {
        return try {
            context.packageManager.getPackageInfo(packageName, 0)
            true
        } catch (e: Exception) {
            false
        }
    }
}

/**
 * Native RDP implementation using FreeRDP
 * This is a placeholder for future native RDP integration
 * Requires FreeRDP native libraries and JNI bindings
 */
class NativeRDPSession {
    // TODO: Implement native RDP using FreeRDP library
    // This would require:
    // 1. Compiling FreeRDP for Android (armeabi-v7a, arm64-v8a, x86, x86_64)
    // 2. Creating JNI bindings
    // 3. Implementing frame buffer rendering
    // 4. Handling input events (touch, keyboard)

    fun connect(hostname: String, port: Int, username: String, password: String): Boolean {
        // Native implementation would go here
        throw NotImplementedError("Native RDP not yet implemented. Use external RDP client.")
    }
}
