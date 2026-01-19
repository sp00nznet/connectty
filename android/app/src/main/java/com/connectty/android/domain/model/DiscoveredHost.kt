package com.connectty.android.domain.model

import java.util.Date

data class DiscoveredHost(
    val id: String,
    val providerId: String,
    val providerHostId: String,
    val name: String,
    val hostname: String? = null,
    val privateIp: String? = null,
    val publicIp: String? = null,
    val osType: OSType,
    val osName: String? = null,
    val state: HostState,
    // Provider-specific metadata
    val metadata: Map<String, String> = emptyMap(),
    val tags: Map<String, String> = emptyMap(),
    // Discovery info
    val discoveredAt: Date,
    val lastSeenAt: Date,
    // Import status
    val imported: Boolean = false,
    val connectionId: String? = null
)

enum class HostState {
    RUNNING,
    STOPPED,
    SUSPENDED,
    UNKNOWN;

    companion object {
        fun fromString(value: String): HostState {
            return when (value.lowercase()) {
                "running" -> RUNNING
                "stopped" -> STOPPED
                "suspended" -> SUSPENDED
                else -> UNKNOWN
            }
        }
    }
}

data class DiscoveryResult(
    val providerId: String,
    val providerName: String,
    val success: Boolean,
    val error: String? = null,
    val hosts: List<DiscoveredHost>,
    val discoveredAt: Date
)
