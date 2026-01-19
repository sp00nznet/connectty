package com.connectty.android.domain.model

enum class ConnectionType {
    SSH,
    RDP,
    SERIAL;

    companion object {
        fun fromString(value: String): ConnectionType {
            return when (value.lowercase()) {
                "ssh" -> SSH
                "rdp" -> RDP
                "serial" -> SERIAL
                else -> SSH
            }
        }
    }

    fun toApiString(): String = name.lowercase()
}

enum class OSType {
    LINUX,
    WINDOWS,
    UNIX,
    ESXI,
    UNKNOWN;

    companion object {
        fun fromString(value: String): OSType {
            return when (value.lowercase()) {
                "linux" -> LINUX
                "windows" -> WINDOWS
                "unix" -> UNIX
                "esxi" -> ESXI
                else -> UNKNOWN
            }
        }
    }

    fun toApiString(): String = name.lowercase()
}
