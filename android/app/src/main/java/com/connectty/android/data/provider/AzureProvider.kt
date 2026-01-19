package com.connectty.android.data.provider

import com.azure.core.credential.TokenCredential
import com.azure.core.management.AzureEnvironment
import com.azure.core.management.profile.AzureProfile
import com.azure.identity.ClientSecretCredentialBuilder
import com.azure.resourcemanager.AzureResourceManager
import com.azure.resourcemanager.compute.models.VirtualMachine
import com.connectty.android.domain.model.DiscoveredHost
import com.connectty.android.domain.model.HostState
import com.connectty.android.domain.model.OSType
import com.connectty.android.domain.model.Provider
import com.connectty.android.domain.model.ProviderConfig
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import timber.log.Timber
import java.util.Date

/**
 * Azure VM discovery
 */
class AzureProvider : BaseCloudProvider() {

    override fun getProviderType(): String = "azure"

    override suspend fun discover(provider: Provider): Result<List<DiscoveredHost>> = withContext(Dispatchers.IO) {
        try {
            val config = provider.config as? ProviderConfig.Azure
                ?: return@withContext Result.failure(Exception("Invalid Azure configuration"))

            val credential: TokenCredential = ClientSecretCredentialBuilder()
                .tenantId(config.tenantId)
                .clientId(config.clientId)
                .clientSecret(config.clientSecret)
                .build()

            val profile = AzureProfile(AzureEnvironment.AZURE)
            val azure = AzureResourceManager
                .authenticate(credential, profile)
                .withSubscription(config.subscriptionId)

            val allHosts = mutableListOf<DiscoveredHost>()

            // Discover VMs in the primary subscription
            val vms = azure.virtualMachines().list()
            for (vm in vms) {
                val host = convertVMToHost(vm, provider)
                allHosts.add(host)
            }

            // Discover VMs in additional subscriptions if specified
            config.subscriptions?.forEach { subscriptionId ->
                try {
                    val subAzure = AzureResourceManager
                        .authenticate(credential, profile)
                        .withSubscription(subscriptionId)

                    val subVms = subAzure.virtualMachines().list()
                    for (vm in subVms) {
                        val host = convertVMToHost(vm, provider)
                        allHosts.add(host)
                    }
                } catch (e: Exception) {
                    Timber.e(e, "Error discovering VMs in subscription: $subscriptionId")
                }
            }

            Timber.d("Discovered ${allHosts.size} Azure VMs")
            Result.success(allHosts)
        } catch (e: Exception) {
            Timber.e(e, "Azure discovery failed")
            Result.failure(e)
        }
    }

    private fun convertVMToHost(vm: VirtualMachine, provider: Provider): DiscoveredHost {
        val osType = if (vm.osType() == com.azure.resourcemanager.compute.models.OperatingSystemTypes.WINDOWS) {
            OSType.WINDOWS
        } else {
            OSType.LINUX
        }

        val publicIp = vm.getPrimaryPublicIPAddress()?.ipAddress()
        val privateIp = vm.getPrimaryNetworkInterface()?.primaryPrivateIP()

        val metadata = mutableMapOf<String, String>()
        metadata["vmSize"] = vm.size().toString()
        metadata["resourceGroup"] = vm.resourceGroupName()
        metadata["region"] = vm.regionName()
        vm.vmId()?.let { metadata["vmId"] = it }

        return DiscoveredHost(
            id = generateHostId(provider.id, vm.id()),
            providerId = provider.id,
            providerHostId = vm.id(),
            name = vm.name(),
            hostname = publicIp ?: privateIp,
            privateIp = privateIp,
            publicIp = publicIp,
            osType = osType,
            osName = vm.osType().toString(),
            state = parseVMState(vm.powerState()),
            metadata = metadata,
            tags = vm.tags() ?: emptyMap(),
            discoveredAt = Date(),
            lastSeenAt = Date(),
            imported = false
        )
    }

    private fun parseVMState(powerState: com.azure.resourcemanager.compute.models.PowerState?): HostState {
        return when (powerState) {
            com.azure.resourcemanager.compute.models.PowerState.RUNNING -> HostState.RUNNING
            com.azure.resourcemanager.compute.models.PowerState.STOPPED,
            com.azure.resourcemanager.compute.models.PowerState.DEALLOCATED -> HostState.STOPPED
            else -> HostState.UNKNOWN
        }
    }
}
