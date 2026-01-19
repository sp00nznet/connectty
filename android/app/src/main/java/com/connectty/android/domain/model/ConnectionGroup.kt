package com.connectty.android.domain.model

import java.util.Date

data class ConnectionGroup(
    val id: String,
    val name: String,
    val description: String? = null,
    val parentId: String? = null,
    val color: String? = null,
    // Group type
    val membershipType: GroupMembershipType,
    // Dynamic group rules
    val rules: List<GroupRule>? = null,
    // Assigned credentials
    val credentialId: String? = null,
    // Assigned scripts/actions
    val assignedScripts: List<String>? = null,
    // Sharing
    val isShared: Boolean = false,
    val ownerId: String? = null,
    // Metadata
    val createdAt: Date,
    val updatedAt: Date
)

enum class GroupMembershipType {
    STATIC,
    DYNAMIC;

    companion object {
        fun fromString(value: String): GroupMembershipType {
            return when (value.lowercase()) {
                "static" -> STATIC
                "dynamic" -> DYNAMIC
                else -> STATIC
            }
        }
    }
}

data class GroupRule(
    val hostnamePattern: String? = null,
    val osType: List<OSType>? = null,
    val tags: List<String>? = null,
    val providerId: String? = null,
    val connectionType: ConnectionType? = null
)
