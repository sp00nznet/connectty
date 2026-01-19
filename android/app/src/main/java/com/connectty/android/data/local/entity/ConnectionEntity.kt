package com.connectty.android.data.local.entity

import androidx.room.ColumnInfo
import androidx.room.Entity
import androidx.room.PrimaryKey
import com.connectty.android.domain.model.ConnectionType
import com.connectty.android.domain.model.OSType
import com.connectty.android.domain.model.SerialSettings

@Entity(tableName = "connections")
data class ConnectionEntity(
    @PrimaryKey
    val id: String,
    val name: String,
    val hostname: String,
    val port: Int = 22,
    @ColumnInfo(name = "connection_type")
    val connectionType: String,
    @ColumnInfo(name = "os_type")
    val osType: String? = null,
    val username: String? = null,
    @ColumnInfo(name = "credential_id")
    val credentialId: String? = null,
    val tags: String = "[]", // JSON array
    @ColumnInfo(name = "group_id")
    val groupId: String? = null,
    val description: String? = null,
    @ColumnInfo(name = "serial_settings")
    val serialSettings: String? = null, // JSON
    @ColumnInfo(name = "provider_id")
    val providerId: String? = null,
    @ColumnInfo(name = "provider_host_id")
    val providerHostId: String? = null,
    @ColumnInfo(name = "health_status")
    val healthStatus: String? = null,
    @ColumnInfo(name = "health_last_checked")
    val healthLastChecked: Long? = null,
    @ColumnInfo(name = "is_shared")
    val isShared: Boolean = false,
    @ColumnInfo(name = "owner_id")
    val ownerId: String? = null,
    @ColumnInfo(name = "created_at")
    val createdAt: Long,
    @ColumnInfo(name = "updated_at")
    val updatedAt: Long,
    @ColumnInfo(name = "last_connected_at")
    val lastConnectedAt: Long? = null
)
