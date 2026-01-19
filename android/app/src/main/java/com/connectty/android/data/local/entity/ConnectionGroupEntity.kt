package com.connectty.android.data.local.entity

import androidx.room.ColumnInfo
import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "connection_groups")
data class ConnectionGroupEntity(
    @PrimaryKey
    val id: String,
    val name: String,
    val description: String? = null,
    @ColumnInfo(name = "parent_id")
    val parentId: String? = null,
    val color: String? = null,
    @ColumnInfo(name = "membership_type")
    val membershipType: String = "static",
    val rules: String? = null, // JSON
    @ColumnInfo(name = "credential_id")
    val credentialId: String? = null,
    @ColumnInfo(name = "assigned_scripts")
    val assignedScripts: String = "[]", // JSON array
    @ColumnInfo(name = "is_shared")
    val isShared: Boolean = false,
    @ColumnInfo(name = "owner_id")
    val ownerId: String? = null,
    @ColumnInfo(name = "created_at")
    val createdAt: Long,
    @ColumnInfo(name = "updated_at")
    val updatedAt: Long
)
