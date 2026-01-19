package com.connectty.android.data.local.entity

import androidx.room.ColumnInfo
import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "providers")
data class ProviderEntity(
    @PrimaryKey
    val id: String,
    val name: String,
    val type: String,
    val enabled: Boolean = true,
    val config: String, // JSON
    @ColumnInfo(name = "auto_discover")
    val autoDiscover: Boolean = false,
    @ColumnInfo(name = "discover_interval")
    val discoverInterval: Int? = null,
    @ColumnInfo(name = "last_discovery_at")
    val lastDiscoveryAt: Long? = null,
    @ColumnInfo(name = "is_shared")
    val isShared: Boolean = false,
    @ColumnInfo(name = "owner_id")
    val ownerId: String? = null,
    @ColumnInfo(name = "created_at")
    val createdAt: Long,
    @ColumnInfo(name = "updated_at")
    val updatedAt: Long
)
