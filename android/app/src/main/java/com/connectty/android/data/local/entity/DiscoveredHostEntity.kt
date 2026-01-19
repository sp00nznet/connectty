package com.connectty.android.data.local.entity

import androidx.room.ColumnInfo
import androidx.room.Entity
import androidx.room.ForeignKey
import androidx.room.PrimaryKey

@Entity(
    tableName = "discovered_hosts",
    foreignKeys = [
        ForeignKey(
            entity = ProviderEntity::class,
            parentColumns = ["id"],
            childColumns = ["provider_id"],
            onDelete = ForeignKey.CASCADE
        )
    ]
)
data class DiscoveredHostEntity(
    @PrimaryKey
    val id: String,
    @ColumnInfo(name = "provider_id")
    val providerId: String,
    @ColumnInfo(name = "provider_host_id")
    val providerHostId: String,
    val name: String,
    val hostname: String? = null,
    @ColumnInfo(name = "private_ip")
    val privateIp: String? = null,
    @ColumnInfo(name = "public_ip")
    val publicIp: String? = null,
    @ColumnInfo(name = "os_type")
    val osType: String,
    @ColumnInfo(name = "os_name")
    val osName: String? = null,
    val state: String,
    val metadata: String = "{}", // JSON
    val tags: String = "{}", // JSON
    @ColumnInfo(name = "discovered_at")
    val discoveredAt: Long,
    @ColumnInfo(name = "last_seen_at")
    val lastSeenAt: Long,
    val imported: Boolean = false,
    @ColumnInfo(name = "connection_id")
    val connectionId: String? = null
)
