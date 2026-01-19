package com.connectty.android.data.connection

import com.connectty.android.domain.model.Credential
import com.connectty.android.domain.model.ServerConnection
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.withContext
import org.apache.sshd.client.SshClient
import org.apache.sshd.client.session.ClientSession
import org.apache.sshd.sftp.client.SftpClient
import org.apache.sshd.sftp.client.SftpClientFactory
import org.apache.sshd.sftp.common.SftpConstants
import org.apache.sshd.common.util.security.SecurityUtils
import timber.log.Timber
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream
import java.util.concurrent.TimeUnit

/**
 * Manages SFTP file transfers using Apache MINA SSHD
 */
class SFTPManager {
    private val client: SshClient = SshClient.setUpDefaultClient()
    private val activeSessions = mutableMapOf<String, SFTPSession>()

    init {
        client.start()
    }

    suspend fun connect(
        connection: ServerConnection,
        credential: Credential?
    ): Result<SFTPSession> = withContext(Dispatchers.IO) {
        try {
            val session = client.connect(
                credential?.username ?: connection.username ?: "root",
                connection.hostname,
                connection.port
            ).verify(10, TimeUnit.SECONDS).session

            // Authenticate
            when {
                credential?.privateKey != null -> {
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
                    val password = credential.password ?: credential.secret ?: ""
                    session.addPasswordIdentity(password)
                }
                else -> {
                    session.close()
                    return@withContext Result.failure(Exception("No credentials provided"))
                }
            }

            if (!session.auth().verify(30, TimeUnit.SECONDS).isSuccess) {
                session.close()
                return@withContext Result.failure(Exception("Authentication failed"))
            }

            val sftpClient = SftpClientFactory.instance().createSftpClient(session)
            val sftpSession = SFTPSession(
                id = connection.id,
                session = session,
                sftpClient = sftpClient
            )

            activeSessions[connection.id] = sftpSession

            Timber.d("SFTP connection established: ${connection.name}")
            Result.success(sftpSession)
        } catch (e: Exception) {
            Timber.e(e, "Failed to connect via SFTP")
            Result.failure(e)
        }
    }

    suspend fun disconnect(connectionId: String) = withContext(Dispatchers.IO) {
        activeSessions[connectionId]?.let { session ->
            try {
                session.close()
                activeSessions.remove(connectionId)
                Timber.d("SFTP connection closed: $connectionId")
            } catch (e: Exception) {
                Timber.e(e, "Error closing SFTP connection")
            }
        }
    }

    fun getSession(connectionId: String): SFTPSession? {
        return activeSessions[connectionId]
    }

    fun shutdown() {
        activeSessions.values.forEach { it.close() }
        activeSessions.clear()
        client.stop()
    }
}

/**
 * Represents an active SFTP session
 */
class SFTPSession(
    val id: String,
    private val session: ClientSession,
    private val sftpClient: SftpClient
) {
    val isConnected: Boolean
        get() = session.isOpen

    /**
     * Lists files in a directory
     */
    suspend fun listDirectory(path: String): List<FileInfo> = withContext(Dispatchers.IO) {
        try {
            sftpClient.readDir(path).map { entry ->
                FileInfo(
                    name = entry.filename,
                    path = "$path/${entry.filename}",
                    size = entry.attributes.size,
                    isDirectory = entry.attributes.isDirectory,
                    isFile = entry.attributes.isRegularFile,
                    permissions = entry.attributes.perms,
                    modifiedTime = entry.attributes.modifyTime.toMillis(),
                    owner = entry.attributes.owner,
                    group = entry.attributes.group
                )
            }
        } catch (e: Exception) {
            Timber.e(e, "Error listing directory: $path")
            emptyList()
        }
    }

    /**
     * Downloads a file with progress tracking
     */
    fun downloadFile(remotePath: String, localFile: File): Flow<TransferProgress> = flow {
        withContext(Dispatchers.IO) {
            try {
                val attrs = sftpClient.stat(remotePath)
                val totalSize = attrs.size
                var transferred = 0L

                emit(TransferProgress.Started(totalSize))

                FileOutputStream(localFile).use { output ->
                    sftpClient.read(remotePath).use { input ->
                        val buffer = ByteArray(8192)
                        var bytesRead: Int

                        while (input.read(buffer).also { bytesRead = it } != -1) {
                            output.write(buffer, 0, bytesRead)
                            transferred += bytesRead

                            val progress = if (totalSize > 0) {
                                (transferred * 100 / totalSize).toInt()
                            } else 0

                            emit(TransferProgress.Progress(transferred, totalSize, progress))
                        }
                    }
                }

                emit(TransferProgress.Completed(transferred))
                Timber.d("Downloaded: $remotePath -> ${localFile.absolutePath}")
            } catch (e: Exception) {
                Timber.e(e, "Error downloading file: $remotePath")
                emit(TransferProgress.Error(e))
            }
        }
    }

    /**
     * Uploads a file with progress tracking
     */
    fun uploadFile(localFile: File, remotePath: String): Flow<TransferProgress> = flow {
        withContext(Dispatchers.IO) {
            try {
                val totalSize = localFile.length()
                var transferred = 0L

                emit(TransferProgress.Started(totalSize))

                FileInputStream(localFile).use { input ->
                    sftpClient.write(remotePath).use { output ->
                        val buffer = ByteArray(8192)
                        var bytesRead: Int

                        while (input.read(buffer).also { bytesRead = it } != -1) {
                            output.write(buffer, 0, bytesRead)
                            transferred += bytesRead

                            val progress = if (totalSize > 0) {
                                (transferred * 100 / totalSize).toInt()
                            } else 0

                            emit(TransferProgress.Progress(transferred, totalSize, progress))
                        }
                    }
                }

                emit(TransferProgress.Completed(transferred))
                Timber.d("Uploaded: ${localFile.absolutePath} -> $remotePath")
            } catch (e: Exception) {
                Timber.e(e, "Error uploading file: $remotePath")
                emit(TransferProgress.Error(e))
            }
        }
    }

    /**
     * Deletes a file or directory
     */
    suspend fun delete(path: String): Result<Unit> = withContext(Dispatchers.IO) {
        try {
            val attrs = sftpClient.stat(path)
            if (attrs.isDirectory) {
                sftpClient.rmdir(path)
            } else {
                sftpClient.remove(path)
            }
            Timber.d("Deleted: $path")
            Result.success(Unit)
        } catch (e: Exception) {
            Timber.e(e, "Error deleting: $path")
            Result.failure(e)
        }
    }

    /**
     * Creates a directory
     */
    suspend fun createDirectory(path: String): Result<Unit> = withContext(Dispatchers.IO) {
        try {
            sftpClient.mkdir(path)
            Timber.d("Created directory: $path")
            Result.success(Unit)
        } catch (e: Exception) {
            Timber.e(e, "Error creating directory: $path")
            Result.failure(e)
        }
    }

    /**
     * Renames a file or directory
     */
    suspend fun rename(oldPath: String, newPath: String): Result<Unit> = withContext(Dispatchers.IO) {
        try {
            sftpClient.rename(oldPath, newPath)
            Timber.d("Renamed: $oldPath -> $newPath")
            Result.success(Unit)
        } catch (e: Exception) {
            Timber.e(e, "Error renaming: $oldPath -> $newPath")
            Result.failure(e)
        }
    }

    /**
     * Gets file/directory info
     */
    suspend fun getFileInfo(path: String): Result<FileInfo> = withContext(Dispatchers.IO) {
        try {
            val attrs = sftpClient.stat(path)
            val info = FileInfo(
                name = File(path).name,
                path = path,
                size = attrs.size,
                isDirectory = attrs.isDirectory,
                isFile = attrs.isRegularFile,
                permissions = attrs.perms,
                modifiedTime = attrs.modifyTime.toMillis(),
                owner = attrs.owner,
                group = attrs.group
            )
            Result.success(info)
        } catch (e: Exception) {
            Timber.e(e, "Error getting file info: $path")
            Result.failure(e)
        }
    }

    fun close() {
        try {
            sftpClient.close()
            session.close()
            Timber.d("SFTP session closed: $id")
        } catch (e: Exception) {
            Timber.e(e, "Error closing SFTP session")
        }
    }
}

/**
 * File information
 */
data class FileInfo(
    val name: String,
    val path: String,
    val size: Long,
    val isDirectory: Boolean,
    val isFile: Boolean,
    val permissions: Int,
    val modifiedTime: Long,
    val owner: String,
    val group: String
)

/**
 * Transfer progress events
 */
sealed class TransferProgress {
    data class Started(val totalSize: Long) : TransferProgress()
    data class Progress(val transferred: Long, val total: Long, val percentage: Int) : TransferProgress()
    data class Completed(val totalTransferred: Long) : TransferProgress()
    data class Error(val error: Throwable) : TransferProgress()
}
