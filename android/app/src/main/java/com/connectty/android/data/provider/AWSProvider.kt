package com.connectty.android.data.provider

import com.amazonaws.auth.AWSStaticCredentialsProvider
import com.amazonaws.auth.BasicAWSCredentials
import com.amazonaws.regions.Region
import com.amazonaws.regions.Regions
import com.amazonaws.services.ec2.AmazonEC2Client
import com.amazonaws.services.ec2.model.DescribeInstancesRequest
import com.amazonaws.services.ec2.model.Instance
import com.connectty.android.domain.model.DiscoveredHost
import com.connectty.android.domain.model.HostState
import com.connectty.android.domain.model.OSType
import com.connectty.android.domain.model.Provider
import com.connectty.android.domain.model.ProviderConfig
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import timber.log.Timber
import java.util.Date
import java.util.UUID

/**
 * AWS EC2 instance discovery
 */
class AWSProvider : BaseCloudProvider() {

    override fun getProviderType(): String = "aws"

    override suspend fun discover(provider: Provider): Result<List<DiscoveredHost>> = withContext(Dispatchers.IO) {
        try {
            val config = provider.config as? ProviderConfig.AWS
                ?: return@withContext Result.failure(Exception("Invalid AWS configuration"))

            val credentials = BasicAWSCredentials(config.accessKeyId, config.secretAccessKey)
            val credentialsProvider = AWSStaticCredentialsProvider(credentials)

            val regions = config.regions?.map { Regions.fromName(it) } ?: listOf(Regions.fromName(config.region))
            val allHosts = mutableListOf<DiscoveredHost>()

            for (region in regions) {
                try {
                    val ec2 = AmazonEC2Client(credentialsProvider).apply {
                        setRegion(Region.getRegion(region))
                    }

                    val request = DescribeInstancesRequest()
                    val result = ec2.describeInstances(request)

                    for (reservation in result.reservations) {
                        for (instance in reservation.instances) {
                            val host = convertInstanceToHost(instance, provider, region.getName())
                            allHosts.add(host)
                        }
                    }

                    Timber.d("Discovered ${allHosts.size} instances in ${region.getName()}")
                } catch (e: Exception) {
                    Timber.e(e, "Error discovering instances in ${region.getName()}")
                }
            }

            Result.success(allHosts)
        } catch (e: Exception) {
            Timber.e(e, "AWS discovery failed")
            Result.failure(e)
        }
    }

    private fun convertInstanceToHost(instance: Instance, provider: Provider, region: String): DiscoveredHost {
        val name = instance.tags?.find { it.key == "Name" }?.value ?: instance.instanceId
        val osType = parseOSType(instance.platform)

        val metadata = mutableMapOf<String, String>()
        metadata["instanceType"] = instance.instanceType
        metadata["availabilityZone"] = instance.placement.availabilityZone
        metadata["region"] = region
        instance.vpcId?.let { metadata["vpcId"] = it }
        instance.subnetId?.let { metadata["subnetId"] = it }
        instance.imageId?.let { metadata["imageId"] = it }

        val tags = instance.tags?.associate { it.key to it.value } ?: emptyMap()

        return DiscoveredHost(
            id = generateHostId(provider.id, instance.instanceId),
            providerId = provider.id,
            providerHostId = instance.instanceId,
            name = name,
            hostname = instance.publicDnsName?.takeIf { it.isNotEmpty() },
            privateIp = instance.privateIpAddress,
            publicIp = instance.publicIpAddress,
            osType = osType,
            osName = instance.platform ?: "Linux/Unix",
            state = parseHostState(instance.state.name),
            metadata = metadata,
            tags = tags,
            discoveredAt = Date(),
            lastSeenAt = Date(),
            imported = false
        )
    }
}
