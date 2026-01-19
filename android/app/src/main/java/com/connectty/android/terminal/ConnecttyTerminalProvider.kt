package com.connectty.android.terminal

import android.content.ContentProvider
import android.content.ContentValues
import android.database.Cursor
import android.database.MatrixCursor
import android.net.Uri
import android.os.Bundle
import android.os.ParcelFileDescriptor
import com.connectty.android.data.connection.SSHManager
import com.connectty.android.data.local.ConnecttyDatabase
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import timber.log.Timber
import java.io.FileDescriptor
import java.io.FileInputStream
import java.io.FileOutputStream

/**
 * Terminal Session Provider for Android 15+ Terminal app
 *
 * This allows Connectty SSH sessions to appear as tabs in the Android Terminal app.
 * Users can set Connectty as their default shell provider.
 *
 * Implements the Android Terminal Provider API:
 * https://source.android.com/docs/core/connect/terminal
 */
class ConnecttyTerminalProvider : ContentProvider() {

    companion object {
        private const val AUTHORITY = "com.connectty.android.terminal"
        private const val SESSIONS_PATH = "sessions"
        private const val SESSION_PATH = "session"

        // Column names for session listing
        private const val COLUMN_ID = "id"
        private const val COLUMN_TITLE = "title"
        private const val COLUMN_DESCRIPTION = "description"
        private const val COLUMN_IS_RUNNING = "is_running"
    }

    private lateinit var database: ConnecttyDatabase
    private lateinit var sshManager: SSHManager
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val activeSessions = mutableMapOf<String, TerminalSession>()

    override fun onCreate(): Boolean {
        context?.let { ctx ->
            database = ConnecttyDatabase.getDatabase(ctx)
            sshManager = SSHManager()
        }
        return true
    }

    override fun query(
        uri: Uri,
        projection: Array<out String>?,
        selection: String?,
        selectionArgs: Array<out String>?,
        sortOrder: String?
    ): Cursor? {
        return when (uri.pathSegments.firstOrNull()) {
            SESSIONS_PATH -> queryAvailableSessions()
            else -> null
        }
    }

    /**
     * Returns list of available SSH connections that can be opened as terminal sessions
     */
    private fun queryAvailableSessions(): Cursor {
        val cursor = MatrixCursor(arrayOf(
            COLUMN_ID,
            COLUMN_TITLE,
            COLUMN_DESCRIPTION,
            COLUMN_IS_RUNNING
        ))

        scope.launch {
            try {
                // Get all SSH connections from database
                database.connectionDao().getAllConnections().collect { connections ->
                    connections.filter { it.connectionType == "ssh" }.forEach { conn ->
                        val isRunning = activeSessions.containsKey(conn.id)
                        cursor.addRow(arrayOf(
                            conn.id,
                            conn.name,
                            "${conn.username}@${conn.hostname}:${conn.port}",
                            if (isRunning) 1 else 0
                        ))
                    }
                }
            } catch (e: Exception) {
                Timber.e(e, "Error querying sessions")
            }
        }

        return cursor
    }

    /**
     * Opens a terminal session for a specific connection
     *
     * The Android Terminal app calls this method and receives file descriptors
     * for stdin/stdout/stderr to communicate with the session.
     */
    override fun openFile(uri: Uri, mode: String): ParcelFileDescriptor? {
        val sessionId = uri.pathSegments.getOrNull(1) ?: return null

        return try {
            // Create a pseudo-terminal pipe
            val (masterFd, slaveFd) = createPtyPair()

            // Start SSH session in background
            scope.launch {
                startSSHSession(sessionId, masterFd)
            }

            // Return slave end to Terminal app
            slaveFd
        } catch (e: Exception) {
            Timber.e(e, "Error opening terminal session")
            null
        }
    }

    /**
     * Creates a PTY (pseudo-terminal) pair
     * Returns master and slave file descriptors
     */
    private fun createPtyPair(): Pair<ParcelFileDescriptor, ParcelFileDescriptor> {
        return ParcelFileDescriptor.createPipe()
    }

    /**
     * Starts an SSH session and bridges it to the PTY
     */
    private suspend fun startSSHSession(connectionId: String, ptyFd: ParcelFileDescriptor) {
        try {
            // Get connection details
            val connection = database.connectionDao().getConnectionById(connectionId)
                ?: throw Exception("Connection not found: $connectionId")

            // Get credential if specified
            val credential = connection.credentialId?.let {
                database.credentialDao().getCredentialById(it)
            }

            // Convert entities to domain models
            val serverConnection = connection.toDomain()
            val credentialDomain = credential?.toDomain()

            // Connect via SSH
            val result = sshManager.connect(
                connection = serverConnection,
                credential = credentialDomain,
                terminalWidth = 80,
                terminalHeight = 24
            )

            result.onSuccess { session ->
                // Create terminal session wrapper
                val terminalSession = TerminalSession(
                    id = connectionId,
                    sshSession = session,
                    ptyFd = ptyFd
                )

                activeSessions[connectionId] = terminalSession

                // Bridge SSH I/O to PTY
                terminalSession.start()

                Timber.d("Terminal session started: $connectionId")
            }.onFailure { error ->
                Timber.e(error, "Failed to start SSH session")
                ptyFd.close()
            }

        } catch (e: Exception) {
            Timber.e(e, "Error in startSSHSession")
            ptyFd.close()
        }
    }

    /**
     * Called when a session is closed
     */
    override fun delete(uri: Uri, selection: String?, selectionArgs: Array<out String>?): Int {
        val sessionId = uri.pathSegments.getOrNull(1) ?: return 0

        activeSessions[sessionId]?.let { session ->
            session.stop()
            activeSessions.remove(sessionId)
            scope.launch {
                sshManager.disconnect(sessionId)
            }
            return 1
        }

        return 0
    }

    override fun getType(uri: Uri): String? {
        return when (uri.pathSegments.firstOrNull()) {
            SESSIONS_PATH -> "vnd.android.cursor.dir/terminal_session"
            SESSION_PATH -> "vnd.android.cursor.item/terminal_session"
            else -> null
        }
    }

    override fun insert(uri: Uri, values: ContentValues?): Uri? = null
    override fun update(uri: Uri, values: ContentValues?, selection: String?, selectionArgs: Array<out String>?): Int = 0

    override fun shutdown() {
        activeSessions.values.forEach { it.stop() }
        activeSessions.clear()
        scope.cancel()
        sshManager.shutdown()
        super.shutdown()
    }
}

/**
 * Wraps an SSH session and bridges I/O to a PTY file descriptor
 */
private class TerminalSession(
    val id: String,
    private val sshSession: com.connectty.android.data.connection.SSHSession,
    private val ptyFd: ParcelFileDescriptor
) {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private var isRunning = false

    fun start() {
        isRunning = true

        // Read from PTY and send to SSH
        scope.launch {
            val inputStream = FileInputStream(ptyFd.fileDescriptor)
            val buffer = ByteArray(1024)

            while (isRunning) {
                try {
                    val bytesRead = inputStream.read(buffer)
                    if (bytesRead > 0) {
                        val data = buffer.copyOf(bytesRead)
                        sshSession.sendBytes(data)
                    } else if (bytesRead < 0) {
                        break
                    }
                } catch (e: Exception) {
                    Timber.e(e, "Error reading from PTY")
                    break
                }
            }
        }

        // Read from SSH and write to PTY
        scope.launch {
            val outputStream = FileOutputStream(ptyFd.fileDescriptor)

            while (isRunning) {
                try {
                    for (data in sshSession.outputChannel) {
                        outputStream.write(data)
                        outputStream.flush()
                    }
                } catch (e: Exception) {
                    Timber.e(e, "Error writing to PTY")
                    break
                }
            }
        }
    }

    fun stop() {
        isRunning = false
        scope.cancel()
        sshSession.close()
        ptyFd.close()
    }
}
