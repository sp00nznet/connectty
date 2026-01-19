package com.connectty.android.data.local.entity

import androidx.room.ColumnInfo
import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "command_history")
data class CommandHistoryEntity(
    @PrimaryKey
    val id: String,
    @ColumnInfo(name = "command_id")
    val commandId: String? = null,
    @ColumnInfo(name = "command_name")
    val commandName: String,
    val command: String,
    @ColumnInfo(name = "target_os")
    val targetOS: String,
    @ColumnInfo(name = "connection_ids")
    val connectionIds: String = "[]", // JSON array
    val results: String = "[]", // JSON array
    @ColumnInfo(name = "started_at")
    val startedAt: Long,
    @ColumnInfo(name = "completed_at")
    val completedAt: Long? = null,
    val status: String = "pending"
)
