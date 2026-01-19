package com.connectty.android.data.local.entity

import androidx.room.ColumnInfo
import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "saved_commands")
data class SavedCommandEntity(
    @PrimaryKey
    val id: String,
    val name: String,
    val description: String? = null,
    val type: String = "inline",
    @ColumnInfo(name = "target_os")
    val targetOS: String = "all",
    val command: String? = null,
    @ColumnInfo(name = "script_content")
    val scriptContent: String? = null,
    @ColumnInfo(name = "script_language")
    val scriptLanguage: String? = null,
    val category: String? = null,
    val tags: String = "[]", // JSON array
    val variables: String = "[]", // JSON array
    @ColumnInfo(name = "assigned_groups")
    val assignedGroups: String = "[]", // JSON array
    @ColumnInfo(name = "is_shared")
    val isShared: Boolean = false,
    @ColumnInfo(name = "owner_id")
    val ownerId: String? = null,
    @ColumnInfo(name = "created_at")
    val createdAt: Long,
    @ColumnInfo(name = "updated_at")
    val updatedAt: Long
)
