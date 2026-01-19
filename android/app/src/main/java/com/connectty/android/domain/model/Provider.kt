package com.connectty.android.domain.model

import java.util.Date

data class Provider(
    val id: String,
    val name: String,
    val type: ProviderType,
    val enabled: Boolean,
    val config: ProviderConfig,
    // Auto-discovery settings
    val autoDiscover: Boolean = false,
    val discoverInterval: Int? = null, // minutes
    val lastDiscoveryAt: Date? = null,
    // Sharing
    val isShared: Boolean = false,
    val ownerId: String? = null,
    // Metadata
    val createdAt: Date,
    val updatedAt: Date
)

enum class ProviderType {
    ESXI,
    PROXMOX,
    AWS,
    GCP,
    AZURE,
    BIGFIX;

    companion object {
        fun fromString(value: String): ProviderType {
            return when (value.lowercase()) {
                "esxi" -> ESXI
                "proxmox" -> PROXMOX
                "aws" -> AWS
                "gcp" -> GCP
                "azure" -> AZURE
                "bigfix" -> BIGFIX
                else -> throw IllegalArgumentException("Unknown provider type: $value")
            }
        }
    }

    fun toApiString(): String = name.lowercase()
}

sealed class ProviderConfig(val type: ProviderType) {
    data class ESXi(
        val host: String,
        val port: Int = 443,
        val username: String,
        val password: String? = null,
        val ignoreCertErrors: Boolean = true
    ) : ProviderConfig(ProviderType.ESXI)

    data class Proxmox(
        val host: String,
        val port: Int = 8006,
        val username: String,
        val password: String? = null,
        val realm: String = "pam",
        val ignoreCertErrors: Boolean = true
    ) : ProviderConfig(ProviderType.PROXMOX)

    data class AWS(
        val accessKeyId: String,
        val secretAccessKey: String? = null,
        val region: String,
        val regions: List<String>? = null,
        val assumeRoleArn: String? = null
    ) : ProviderConfig(ProviderType.AWS)

    data class GCP(
        val projectId: String,
        val serviceAccountKey: String? = null,
        val zones: List<String>? = null
    ) : ProviderConfig(ProviderType.GCP)

    data class Azure(
        val tenantId: String,
        val clientId: String,
        val clientSecret: String? = null,
        val subscriptionId: String,
        val subscriptions: List<String>? = null
    ) : ProviderConfig(ProviderType.AZURE)

    data class BigFix(
        val host: String,
        val port: Int = 52311,
        val username: String,
        val password: String? = null,
        val ignoreCertErrors: Boolean = true
    ) : ProviderConfig(ProviderType.BIGFIX)
}
