package com.connectty.android.data.local.entity

import com.connectty.android.domain.model.*
import com.google.gson.Gson
import com.google.gson.reflect.TypeToken
import java.util.Date

/**
 * Extension functions to convert between database entities and domain models
 */

private val gson = Gson()

// Connection Entity Mappers
fun ConnectionEntity.toDomain(): ServerConnection {
    return ServerConnection(
        id = id,
        name = name,
        hostname = hostname,
        port = port,
        connectionType = ConnectionType.fromString(connectionType),
        osType = osType?.let { OSType.fromString(it) },
        username = username,
        credentialId = credentialId,
        tags = gson.fromJson(tags, object : TypeToken<List<String>>() {}.type) ?: emptyList(),
        group = groupId,
        description = description,
        serialSettings = serialSettings?.let { gson.fromJson(it, SerialSettings::class.java) },
        providerId = providerId,
        providerHostId = providerHostId,
        createdAt = Date(createdAt),
        updatedAt = Date(updatedAt),
        lastConnectedAt = lastConnectedAt?.let { Date(it) }
    )
}

fun ServerConnection.toEntity(): ConnectionEntity {
    return ConnectionEntity(
        id = id,
        name = name,
        hostname = hostname,
        port = port,
        connectionType = connectionType.value,
        osType = osType?.value,
        username = username,
        credentialId = credentialId,
        tags = gson.toJson(tags),
        groupId = group,
        description = description,
        serialSettings = serialSettings?.let { gson.toJson(it) },
        providerId = providerId,
        providerHostId = providerHostId,
        createdAt = createdAt.time,
        updatedAt = updatedAt.time,
        lastConnectedAt = lastConnectedAt?.time
    )
}

// Credential Entity Mappers
fun CredentialEntity.toDomain(): Credential {
    return Credential(
        id = id,
        name = name,
        type = CredentialType.fromString(type),
        username = username,
        domain = domain,
        secret = encryptedData,
        autoAssignPatterns = gson.fromJson(autoAssignPatterns, object : TypeToken<List<String>>() {}.type) ?: emptyList(),
        createdAt = Date(createdAt),
        updatedAt = Date(updatedAt),
        usedBy = emptyList() // TODO: Calculate from connections
    )
}

fun Credential.toEntity(): CredentialEntity {
    return CredentialEntity(
        id = id,
        name = name,
        type = type.value,
        username = username,
        domain = domain,
        encryptedData = secret,
        autoAssignPatterns = gson.toJson(autoAssignPatterns ?: emptyList()),
        createdAt = createdAt.time,
        updatedAt = updatedAt.time
    )
}

// Provider Entity Mappers
fun ProviderEntity.toDomain(): Provider {
    val config = when (type) {
        "aws" -> gson.fromJson(config, AWSConfig::class.java)
        "azure" -> gson.fromJson(config, AzureConfig::class.java)
        "gcp" -> gson.fromJson(config, GCPConfig::class.java)
        "esxi" -> gson.fromJson(config, ESXiConfig::class.java)
        "proxmox" -> gson.fromJson(config, ProxmoxConfig::class.java)
        "bigfix" -> gson.fromJson(config, BigFixConfig::class.java)
        else -> throw IllegalArgumentException("Unknown provider type: $type")
    }

    return Provider(
        id = id,
        name = name,
        type = ProviderType.fromString(type),
        enabled = enabled,
        config = config,
        autoDiscover = autoDiscover,
        discoverInterval = discoverInterval,
        lastDiscoveryAt = lastDiscoveryAt?.let { Date(it) },
        createdAt = Date(createdAt),
        updatedAt = Date(updatedAt)
    )
}

fun Provider.toEntity(): ProviderEntity {
    return ProviderEntity(
        id = id,
        name = name,
        type = type.value,
        enabled = enabled,
        config = gson.toJson(config),
        autoDiscover = autoDiscover,
        discoverInterval = discoverInterval,
        lastDiscoveryAt = lastDiscoveryAt?.time,
        createdAt = createdAt.time,
        updatedAt = updatedAt.time
    )
}

// Connection Group Entity Mappers
fun ConnectionGroupEntity.toDomain(): ConnectionGroup {
    val rules = rulesJson?.let {
        gson.fromJson<List<GroupRule>>(it, object : TypeToken<List<GroupRule>>() {}.type)
    }

    return ConnectionGroup(
        id = id,
        name = name,
        description = description,
        parentId = parentId,
        color = color,
        membershipType = GroupMembershipType.fromString(membershipType),
        rules = rules,
        credentialId = credentialId,
        assignedScripts = gson.fromJson(assignedScripts, object : TypeToken<List<String>>() {}.type) ?: emptyList(),
        createdAt = Date(createdAt),
        updatedAt = Date(updatedAt)
    )
}

fun ConnectionGroup.toEntity(): ConnectionGroupEntity {
    return ConnectionGroupEntity(
        id = id,
        name = name,
        description = description,
        parentId = parentId,
        color = color,
        membershipType = membershipType.value,
        rulesJson = rules?.let { gson.toJson(it) },
        credentialId = credentialId,
        assignedScripts = gson.toJson(assignedScripts ?: emptyList()),
        createdAt = createdAt.time,
        updatedAt = updatedAt.time
    )
}

// Discovered Host Entity Mappers
fun DiscoveredHostEntity.toDomain(): DiscoveredHost {
    return DiscoveredHost(
        id = id,
        providerId = providerId,
        providerHostId = providerHostId,
        name = name,
        hostname = hostname,
        privateIp = privateIp,
        publicIp = publicIp,
        osType = OSType.fromString(osType),
        osName = osName,
        state = HostState.fromString(state),
        metadata = gson.fromJson(metadata, object : TypeToken<Map<String, String>>() {}.type) ?: emptyMap(),
        tags = gson.fromJson(tags, object : TypeToken<Map<String, String>>() {}.type) ?: emptyMap(),
        discoveredAt = Date(discoveredAt),
        lastSeenAt = Date(lastSeenAt),
        imported = imported,
        connectionId = connectionId
    )
}

fun DiscoveredHost.toEntity(): DiscoveredHostEntity {
    return DiscoveredHostEntity(
        id = id,
        providerId = providerId,
        providerHostId = providerHostId,
        name = name,
        hostname = hostname,
        privateIp = privateIp,
        publicIp = publicIp,
        osType = osType.value,
        osName = osName,
        state = state.value,
        metadata = gson.toJson(metadata),
        tags = gson.toJson(tags),
        discoveredAt = discoveredAt.time,
        lastSeenAt = lastSeenAt.time,
        imported = imported,
        connectionId = connectionId
    )
}

// Saved Command Entity Mappers
fun SavedCommandEntity.toDomain(): SavedCommand {
    val variables = variablesJson?.let {
        gson.fromJson<List<CommandVariable>>(it, object : TypeToken<List<CommandVariable>>() {}.type)
    }

    return SavedCommand(
        id = id,
        name = name,
        description = description,
        type = CommandType.fromString(type),
        targetOS = CommandTargetOS.fromString(targetOS),
        command = command,
        scriptContent = scriptContent,
        scriptLanguage = scriptLanguage?.let { ScriptLanguage.fromString(it) },
        category = category,
        tags = gson.fromJson(tags, object : TypeToken<List<String>>() {}.type),
        variables = variables,
        assignedGroups = gson.fromJson(assignedGroups, object : TypeToken<List<String>>() {}.type),
        createdAt = Date(createdAt),
        updatedAt = Date(updatedAt)
    )
}

fun SavedCommand.toEntity(): SavedCommandEntity {
    return SavedCommandEntity(
        id = id,
        name = name,
        description = description,
        type = type.name.lowercase(),
        targetOS = targetOS.name.lowercase(),
        command = command,
        scriptContent = scriptContent,
        scriptLanguage = scriptLanguage?.name?.lowercase(),
        category = category,
        tags = gson.toJson(tags ?: emptyList()),
        variablesJson = variables?.let { gson.toJson(it) },
        assignedGroups = gson.toJson(assignedGroups ?: emptyList()),
        createdAt = createdAt.time,
        updatedAt = updatedAt.time
    )
}
