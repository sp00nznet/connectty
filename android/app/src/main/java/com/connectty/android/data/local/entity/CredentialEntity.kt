package com.connectty.android.data.local.entity

import androidx.room.ColumnInfo
import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "credentials")
data class CredentialEntity(
    @PrimaryKey
    val id: String,
    val name: String,
    val type: String,
    val username: String,
    val domain: String? = null,
    @ColumnInfo(name = "encrypted_data")
    val encryptedData: String? = null, // JSON encrypted blob
    @ColumnInfo(name = "auto_assign_patterns")
    val autoAssignPatterns: String = "[]", // JSON array
    @ColumnInfo(name = "auto_assign_os_types")
    val autoAssignOsTypes: String = "[]", // JSON array
    @ColumnInfo(name = "is_shared")
    val isShared: Boolean = false,
    @ColumnInfo(name = "owner_id")
    val ownerId: String? = null,
    @ColumnInfo(name = "created_at")
    val createdAt: Long,
    @ColumnInfo(name = "updated_at")
    val updatedAt: Long
)
