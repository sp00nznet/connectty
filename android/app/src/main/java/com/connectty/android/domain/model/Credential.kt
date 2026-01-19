package com.connectty.android.domain.model

import java.util.Date

data class Credential(
    val id: String,
    val name: String,
    val type: CredentialType,
    val username: String,
    // For domain credentials (DOMAIN\username)
    val domain: String? = null,
    // Password (for create/update operations)
    val password: String? = null,
    // Password or private key (encrypted in storage)
    val secret: String? = null,
    // For key-based auth
    val privateKey: String? = null,
    val passphrase: String? = null,
    // Auto-assign rules
    val autoAssignPatterns: List<String>? = null,
    val autoAssignGroup: String? = null,
    // Sharing
    val isShared: Boolean = false,
    val ownerId: String? = null,
    // Metadata
    val createdAt: Date,
    val updatedAt: Date,
    val usedBy: List<String> = emptyList()
)

enum class CredentialType {
    PASSWORD,
    PRIVATE_KEY,
    AGENT,
    DOMAIN;

    companion object {
        fun fromString(value: String): CredentialType {
            return when (value.lowercase()) {
                "password" -> PASSWORD
                "privatekey" -> PRIVATE_KEY
                "agent" -> AGENT
                "domain" -> DOMAIN
                else -> PASSWORD
            }
        }
    }

    fun toApiString(): String = name.lowercase().replace("_", "")
}
