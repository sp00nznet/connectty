package com.connectty.android.data.connection

import com.connectty.android.domain.model.Credential
import com.connectty.android.domain.model.ServerConnection
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.withContext
import org.apache.sshd.client.SshClient
import org.apache.sshd.client.channel.ChannelShell
import org.apache.sshd.client.channel.ClientChannelEvent
import org.apache.sshd.client.session.ClientSession
import org.apache.sshd.common.channel.PtyMode
import org.apache.sshd.common.util.security.SecurityUtils
import timber.log.Timber
import java.io.InputStream
import java.io.OutputStream
import java.nio.charset.StandardCharsets
import java.util.EnumSet
import java.util.concurrent.TimeUnit

/**
 * Manages SSH connections using Apache MINA SSHD
 */
class SSHManager {
    private val client: SshClient = SshClient.setUpDefaultClient()
    private val activeSessions = mutableMapOf<String, SSHSession>()

    init {
        client.start()
    }

    suspend fun connect(
        connection: ServerConnection,
        credential: Credential?,
        terminalWidth: Int = 80,
        terminalHeight: Int = 24
    ): Result<SSHSession> = withContext(Dispatchers.IO) {
        try {
            val session = client.connect(
                credential?.username ?: connection.username ?: "root",
                connection.hostname,
                connection.port
            ).verify(10, TimeUnit.SECONDS).session

            // Authenticate
            when {
                credential?.privateKey != null -> {
                    // Key-based authentication
                    val keyPair = SecurityUtils.loadKeyPairIdentities(
                        null,
                        null,
                        credential.privateKey.byteInputStream(),
                        null
                    ).firstOrNull()

                    if (keyPair != null) {
                        session.addPublicKeyIdentity(keyPair)
                    } else {
                        session.close()
                        return@withContext Result.failure(Exception("Failed to load private key"))
                    }
                }
                credential?.password != null || credential?.secret != null -> {
                    // Password authentication
                    val password = credential.password ?: credential.secret ?: ""
                    session.addPasswordIdentity(password)
                }
                else -> {
                    session.close()
                    return@withContext Result.failure(Exception("No credentials provided"))
                }
            }

            // Verify authentication
            if (!session.auth().verify(30, TimeUnit.SECONDS).isSuccess) {
                session.close()
                return@withContext Result.failure(Exception("Authentication failed"))
            }

            // Create shell channel
            val channel = session.createShellChannel()

            // Set PTY settings
            channel.setPtyType("xterm-256color")
            channel.setPtyColumns(terminalWidth)
            channel.setPtyLines(terminalHeight)

            // Set PTY modes
            val ptyModes = mapOf(
                PtyMode.ECHO to 1,
                PtyMode.ICRNL to 1,
                PtyMode.ONLCR to 1,
                PtyMode.OPOST to 1
            )
            channel.setPtyModes(ptyModes)

            // Open the channel
            channel.open().verify(10, TimeUnit.SECONDS)

            val sshSession = SSHSession(
                id = connection.id,
                session = session,
                channel = channel,
                terminalWidth = terminalWidth,
                terminalHeight = terminalHeight
            )

            activeSessions[connection.id] = sshSession

            Timber.d("SSH connection established: ${connection.name}")
            Result.success(sshSession)
        } catch (e: Exception) {
            Timber.e(e, "Failed to connect via SSH")
            Result.failure(e)
        }
    }

    suspend fun disconnect(connectionId: String) = withContext(Dispatchers.IO) {
        activeSessions[connectionId]?.let { session ->
            try {
                session.close()
                activeSessions.remove(connectionId)
                Timber.d("SSH connection closed: $connectionId")
            } catch (e: Exception) {
                Timber.e(e, "Error closing SSH connection")
            }
        }
    }

    fun getSession(connectionId: String): SSHSession? {
        return activeSessions[connectionId]
    }

    fun shutdown() {
        activeSessions.values.forEach { it.close() }
        activeSessions.clear()
        client.stop()
    }
}

/**
 * Represents an active SSH session
 */
class SSHSession(
    val id: String,
    private val session: ClientSession,
    private val channel: ChannelShell,
    var terminalWidth: Int,
    var terminalHeight: Int
) {
    val outputChannel = Channel<ByteArray>(Channel.UNLIMITED)
    val isConnected: Boolean
        get() = session.isOpen && channel.isOpen

    private var outputReader: Thread? = null

    init {
        startOutputReader()
    }

    private fun startOutputReader() {
        outputReader = Thread {
            try {
                val buffer = ByteArray(8192)
                val inputStream = channel.invertedOut // Output from remote

                while (isConnected && !Thread.currentThread().isInterrupted) {
                    val bytesRead = inputStream.read(buffer)
                    if (bytesRead > 0) {
                        val data = buffer.copyOf(bytesRead)
                        outputChannel.trySend(data)
                    } else if (bytesRead < 0) {
                        break
                    }
                }
            } catch (e: Exception) {
                Timber.e(e, "Error reading SSH output")
            }
        }.apply {
            name = "SSH-Output-Reader-$id"
            isDaemon = true
            start()
        }
    }

    /**
     * Sends input to the remote shell
     */
    suspend fun sendInput(data: String) = withContext(Dispatchers.IO) {
        try {
            val outputStream = channel.invertedIn // Input to remote
            outputStream.write(data.toByteArray(StandardCharsets.UTF_8))
            outputStream.flush()
        } catch (e: Exception) {
            Timber.e(e, "Error sending SSH input")
            throw e
        }
    }

    /**
     * Sends raw bytes to the remote shell
     */
    suspend fun sendBytes(data: ByteArray) = withContext(Dispatchers.IO) {
        try {
            val outputStream = channel.invertedIn
            outputStream.write(data)
            outputStream.flush()
        } catch (e: Exception) {
            Timber.e(e, "Error sending SSH bytes")
            throw e
        }
    }

    /**
     * Resizes the terminal
     */
    suspend fun resize(width: Int, height: Int) = withContext(Dispatchers.IO) {
        try {
            terminalWidth = width
            terminalHeight = height
            channel.sendWindowChange(width, height)
            Timber.d("Terminal resized: ${width}x${height}")
        } catch (e: Exception) {
            Timber.e(e, "Error resizing terminal")
        }
    }

    /**
     * Closes the SSH session
     */
    fun close() {
        try {
            outputReader?.interrupt()
            outputChannel.close()
            channel.close()
            session.close()
            Timber.d("SSH session closed: $id")
        } catch (e: Exception) {
            Timber.e(e, "Error closing SSH session")
        }
    }
}

/**
 * SSH Event types
 */
sealed class SSHEvent {
    data class Data(val data: ByteArray) : SSHEvent()
    data class Error(val error: Throwable) : SSHEvent()
    object Connected : SSHEvent()
    object Disconnected : SSHEvent()
}
