package com.connectty.android.data.provider

import com.connectty.android.domain.model.DiscoveredHost
import com.connectty.android.domain.model.HostState
import com.connectty.android.domain.model.OSType
import com.connectty.android.domain.model.Provider
import com.connectty.android.domain.model.ProviderConfig
import com.google.auth.oauth2.GoogleCredentials
import com.google.cloud.compute.v1.Instance
import com.google.cloud.compute.v1.InstancesClient
import com.google.cloud.compute.v1.InstancesSettings
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import timber.log.Timber
import java.io.ByteArrayInputStream
import java.util.Date

/**
 * Google Cloud Platform VM discovery
 */
class GCPProvider : BaseCloudProvider() {

    override fun getProviderType(): String = "gcp"

    override suspend fun discover(provider: Provider): Result<List<DiscoveredHost>> = withContext(Dispatchers.IO) {
        try {
            val config = provider.config as? ProviderConfig.GCP
                ?: return@withContext Result.failure(Exception("Invalid GCP configuration"))

            val credentials = if (config.serviceAccountKey != null) {
                GoogleCredentials.fromStream(ByteArrayInputStream(config.serviceAccountKey.toByteArray()))
            } else {
                GoogleCredentials.getApplicationDefault()
            }

            val settings = InstancesSettings.newBuilder()
                .setCredentialsProvider { credentials }
                .build()

            val instancesClient = InstancesClient.create(settings)
            val allHosts = mutableListOf<DiscoveredHost>()

            // List all zones if not specified
            val zones = config.zones ?: listOf("us-central1-a", "us-east1-b", "europe-west1-b")

            for (zone in zones) {
                try {
                    val request = com.google.cloud.compute.v1.ListInstancesRequest.newBuilder()
                        .setProject(config.projectId)
                        .setZone(zone)
                        .build()

                    val instances = instancesClient.list(request)

                    for (instance in instances.iterateAll()) {
                        val host = convertInstanceToHost(instance, provider, zone)
                        allHosts.add(host)
                    }

                    Timber.d("Discovered ${allHosts.size} instances in zone $zone")
                } catch (e: Exception) {
                    Timber.e(e, "Error discovering instances in zone: $zone")
                }
            }

            instancesClient.close()

            Result.success(allHosts)
        } catch (e: Exception) {
            Timber.e(e, "GCP discovery failed")
            Result.failure(e)
        }
    }

    private fun convertInstanceToHost(instance: Instance, provider: Provider, zone: String): DiscoveredHost {
        val name = instance.name
        val osType = parseOSType(instance.machineType)

        // Get network interfaces
        val networkInterface = instance.networkInterfacesList.firstOrNull()
        val privateIp = networkInterface?.networkIP
        val publicIp = networkInterface?.accessConfigsList?.firstOrNull()?.natIP

        val metadata = mutableMapOf<String, String>()
        metadata["machineType"] = instance.machineType
        metadata["zone"] = zone
        instance.id?.toString()?.let { metadata["instanceId"] = it }

        // Extract labels (GCP's equivalent of tags)
        val labels = instance.labelsMap ?: emptyMap()

        return DiscoveredHost(
            id = generateHostId(provider.id, instance.id.toString()),
            providerId = provider.id,
            providerHostId = instance.id.toString(),
            name = name,
            hostname = publicIp ?: privateIp,
            privateIp = privateIp,
            publicIp = publicIp,
            osType = osType,
            osName = instance.machineType,
            state = parseHostState(instance.status),
            metadata = metadata,
            tags = labels,
            discoveredAt = Date(),
            lastSeenAt = Date(),
            imported = false
        )
    }
}
