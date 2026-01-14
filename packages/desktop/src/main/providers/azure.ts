/**
 * Microsoft Azure Provider
 * Uses Azure SDK to discover VM instances
 */

import type {
  Provider,
  DiscoveredHost,
  DiscoveryResult,
  AzureConfig,
} from '@connectty/shared';
import { generateId } from '@connectty/shared';
import { IProviderService, detectOSType } from './index';

// Dynamic imports of Azure SDKs (optional dependencies)
let ComputeManagementClient: any;
let NetworkManagementClient: any;
let ClientSecretCredential: any;

async function loadAzureSdk() {
  if (!ComputeManagementClient) {
    try {
      const computeModule = await import('@azure/arm-compute');
      ComputeManagementClient = computeModule.ComputeManagementClient;

      const networkModule = await import('@azure/arm-network');
      NetworkManagementClient = networkModule.NetworkManagementClient;

      const identityModule = await import('@azure/identity');
      ClientSecretCredential = identityModule.ClientSecretCredential;
    } catch {
      throw new Error('Azure SDK not installed. Run: npm install @azure/arm-compute @azure/arm-network @azure/identity');
    }
  }
}

export class AzureProvider implements IProviderService {
  async testConnection(provider: Provider): Promise<boolean> {
    const config = provider.config as AzureConfig;
    try {
      await loadAzureSdk();
      const credential = this.createCredential(config);
      const client = new ComputeManagementClient(credential, config.subscriptionId);
      // Try to list VMs to verify connection
      const vms = client.virtualMachines.listAll();
      await vms.next();
      return true;
    } catch {
      return false;
    }
  }

  async discoverHosts(provider: Provider): Promise<DiscoveryResult> {
    const config = provider.config as AzureConfig;
    const hosts: DiscoveredHost[] = [];

    try {
      await loadAzureSdk();

      const subscriptions = [config.subscriptionId, ...(config.subscriptions || [])];
      const uniqueSubscriptions = [...new Set(subscriptions)];

      for (const subscriptionId of uniqueSubscriptions) {
        const credential = this.createCredential(config);
        const computeClient = new ComputeManagementClient(credential, subscriptionId);
        const networkClient = new NetworkManagementClient(credential, subscriptionId);

        // Get all VMs
        for await (const vm of computeClient.virtualMachines.listAll()) {
          const resourceGroup = this.extractResourceGroup(vm.id);

          // Get instance view for power state
          let powerState = 'unknown';
          try {
            const instanceView = await computeClient.virtualMachines.instanceView(
              resourceGroup,
              vm.name
            );
            const status = instanceView.statuses?.find((s: any) => s.code?.startsWith('PowerState/'));
            powerState = status?.code?.replace('PowerState/', '') || 'unknown';
          } catch {
            // Ignore errors getting instance view
          }

          // Get network interfaces for IP addresses
          let privateIp: string | undefined;
          let publicIp: string | undefined;

          for (const nicRef of vm.networkProfile?.networkInterfaces || []) {
            try {
              const nicId = nicRef.id;
              const nicName = nicId?.split('/').pop();
              const nicRg = this.extractResourceGroup(nicId);

              if (nicName && nicRg) {
                const nic = await networkClient.networkInterfaces.get(nicRg, nicName);

                for (const ipConfig of nic.ipConfigurations || []) {
                  privateIp = privateIp || ipConfig.privateIPAddress;

                  if (ipConfig.publicIPAddress?.id) {
                    const pipName = ipConfig.publicIPAddress.id.split('/').pop();
                    const pipRg = this.extractResourceGroup(ipConfig.publicIPAddress.id);

                    if (pipName && pipRg) {
                      const pip = await networkClient.publicIPAddresses.get(pipRg, pipName);
                      publicIp = publicIp || pip.ipAddress;
                    }
                  }
                }
              }
            } catch {
              // Ignore errors getting network info
            }
          }

          const osType = detectOSType(
            vm.storageProfile?.osDisk?.osType,
            vm.storageProfile?.imageReference?.offer,
            vm.tags
          );

          hosts.push({
            id: generateId(),
            providerId: provider.id,
            providerHostId: vm.id || vm.name || generateId(),
            name: vm.name || 'Unknown',
            hostname: publicIp || privateIp || vm.name,
            privateIp,
            publicIp,
            osType,
            osName: `${vm.storageProfile?.imageReference?.publisher || ''} ${vm.storageProfile?.imageReference?.offer || ''} ${vm.storageProfile?.imageReference?.sku || ''}`.trim(),
            state: this.mapState(powerState),
            metadata: {
              vmId: vm.vmId || '',
              resourceGroup,
              location: vm.location || '',
              vmSize: vm.hardwareProfile?.vmSize || '',
              subscriptionId,
            },
            tags: vm.tags || {},
            discoveredAt: new Date(),
            lastSeenAt: new Date(),
            imported: false,
          });
        }
      }

      return {
        providerId: provider.id,
        providerName: provider.name,
        success: true,
        hosts,
        discoveredAt: new Date(),
      };
    } catch (error) {
      return {
        providerId: provider.id,
        providerName: provider.name,
        success: false,
        error: (error as Error).message,
        hosts: [],
        discoveredAt: new Date(),
      };
    }
  }

  private createCredential(config: AzureConfig): any {
    return new ClientSecretCredential(
      config.tenantId,
      config.clientId,
      config.clientSecret || ''
    );
  }

  private extractResourceGroup(resourceId?: string): string {
    if (!resourceId) return '';
    const match = resourceId.match(/resourceGroups\/([^/]+)/i);
    return match ? match[1] : '';
  }

  private mapState(powerState: string): 'running' | 'stopped' | 'suspended' | 'unknown' {
    switch (powerState.toLowerCase()) {
      case 'running':
        return 'running';
      case 'deallocated':
      case 'stopped':
        return 'stopped';
      case 'deallocating':
      case 'starting':
      case 'stopping':
        return 'suspended';
      default:
        return 'unknown';
    }
  }
}
