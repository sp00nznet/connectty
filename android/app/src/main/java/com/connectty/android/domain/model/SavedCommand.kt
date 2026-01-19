package com.connectty.android.domain.model

import java.util.Date

data class SavedCommand(
    val id: String,
    val name: String,
    val description: String? = null,
    val type: CommandType,
    val targetOS: CommandTargetOS,
    // For inline commands
    val command: String? = null,
    // For scripts
    val scriptContent: String? = null,
    val scriptLanguage: ScriptLanguage? = null,
    // Metadata
    val category: String? = null,
    val tags: List<String>? = null,
    // Variables
    val variables: List<CommandVariable>? = null,
    // Group assignment
    val assignedGroups: List<String>? = null,
    // Sharing
    val isShared: Boolean = false,
    val ownerId: String? = null,
    // Metadata
    val createdAt: Date,
    val updatedAt: Date
)

enum class CommandType {
    INLINE,
    SCRIPT;

    companion object {
        fun fromString(value: String): CommandType {
            return when (value.lowercase()) {
                "inline" -> INLINE
                "script" -> SCRIPT
                else -> INLINE
            }
        }
    }
}

enum class CommandTargetOS {
    LINUX,
    WINDOWS,
    ALL;

    companion object {
        fun fromString(value: String): CommandTargetOS {
            return when (value.lowercase()) {
                "linux" -> LINUX
                "windows" -> WINDOWS
                "all" -> ALL
                else -> ALL
            }
        }
    }
}

enum class ScriptLanguage {
    BASH,
    POWERSHELL,
    PYTHON;

    companion object {
        fun fromString(value: String): ScriptLanguage {
            return when (value.lowercase()) {
                "bash" -> BASH
                "powershell" -> POWERSHELL
                "python" -> PYTHON
                else -> BASH
            }
        }
    }
}

data class CommandVariable(
    val name: String,
    val description: String? = null,
    val defaultValue: String? = null,
    val required: Boolean = false,
    val type: VariableType = VariableType.STRING
)

enum class VariableType {
    STRING,
    PASSWORD,
    NUMBER,
    BOOLEAN;

    companion object {
        fun fromString(value: String): VariableType {
            return when (value.lowercase()) {
                "string" -> STRING
                "password" -> PASSWORD
                "number" -> NUMBER
                "boolean" -> BOOLEAN
                else -> STRING
            }
        }
    }
}

data class CommandExecution(
    val id: String,
    val commandId: String? = null,
    val commandName: String,
    val command: String,
    val targetOS: CommandTargetOS,
    val connectionIds: List<String>,
    val results: List<CommandResult>,
    val startedAt: Date,
    val completedAt: Date? = null,
    val status: ExecutionStatus
)

enum class ExecutionStatus {
    PENDING,
    RUNNING,
    COMPLETED,
    FAILED,
    CANCELLED;

    companion object {
        fun fromString(value: String): ExecutionStatus {
            return when (value.lowercase()) {
                "pending" -> PENDING
                "running" -> RUNNING
                "completed" -> COMPLETED
                "failed" -> FAILED
                "cancelled" -> CANCELLED
                else -> PENDING
            }
        }
    }
}

data class CommandResult(
    val connectionId: String,
    val connectionName: String,
    val hostname: String,
    val status: ExecutionStatus,
    val exitCode: Int? = null,
    val stdout: String? = null,
    val stderr: String? = null,
    val error: String? = null,
    val startedAt: Date? = null,
    val completedAt: Date? = null
)
