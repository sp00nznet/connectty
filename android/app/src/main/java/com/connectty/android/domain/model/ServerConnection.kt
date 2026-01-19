package com.connectty.android.domain.model

import java.util.Date

data class ServerConnection(
    val id: String,
    val name: String,
    val hostname: String,
    val port: Int,
    val connectionType: ConnectionType,
    val osType: OSType = OSType.UNKNOWN,
    val username: String? = null,
    val credentialId: String? = null,
    val tags: List<String> = emptyList(),
    val group: String? = null,
    val description: String? = null,
    // Serial connection settings
    val serialSettings: SerialSettings? = null,
    // Provider info (if discovered)
    val providerId: String? = null,
    val providerHostId: String? = null,
    // Health status
    val healthStatus: HealthStatus? = null,
    val healthLastChecked: Date? = null,
    // Sharing
    val isShared: Boolean = false,
    val ownerId: String? = null,
    // Metadata
    val createdAt: Date,
    val updatedAt: Date,
    val lastConnectedAt: Date? = null
)

enum class HealthStatus {
    GREEN,
    YELLOW,
    RED,
    UNKNOWN;

    companion object {
        fun fromString(value: String): HealthStatus {
            return when (value.lowercase()) {
                "green" -> GREEN
                "yellow" -> YELLOW
                "red" -> RED
                else -> UNKNOWN
            }
        }
    }
}
