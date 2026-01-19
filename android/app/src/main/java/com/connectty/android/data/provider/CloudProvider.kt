package com.connectty.android.data.provider

import com.connectty.android.domain.model.DiscoveredHost
import com.connectty.android.domain.model.HostState
import com.connectty.android.domain.model.OSType
import com.connectty.android.domain.model.Provider
import com.connectty.android.domain.model.ProviderConfig
import java.util.Date

/**
 * Base interface for cloud provider discovery
 */
interface CloudProvider {
    suspend fun discover(provider: Provider): Result<List<DiscoveredHost>>
    fun getProviderType(): String
}

/**
 * Base cloud provider implementation with common utilities
 */
abstract class BaseCloudProvider : CloudProvider {
    protected fun generateHostId(providerId: String, instanceId: String): String {
        return "$providerId-$instanceId"
    }

    protected fun parseOSType(osName: String?): OSType {
        if (osName == null) return OSType.UNKNOWN

        return when {
            osName.contains("windows", ignoreCase = true) -> OSType.WINDOWS
            osName.contains("linux", ignoreCase = true) -> OSType.LINUX
            osName.contains("ubuntu", ignoreCase = true) -> OSType.LINUX
            osName.contains("centos", ignoreCase = true) -> OSType.LINUX
            osName.contains("redhat", ignoreCase = true) -> OSType.LINUX
            osName.contains("debian", ignoreCase = true) -> OSType.LINUX
            osName.contains("amazon", ignoreCase = true) -> OSType.LINUX
            osName.contains("unix", ignoreCase = true) -> OSType.UNIX
            else -> OSType.UNKNOWN
        }
    }

    protected fun parseHostState(state: String): HostState {
        return when (state.lowercase()) {
            "running" -> HostState.RUNNING
            "stopped", "terminated" -> HostState.STOPPED
            "suspended", "paused" -> HostState.SUSPENDED
            else -> HostState.UNKNOWN
        }
    }
}
