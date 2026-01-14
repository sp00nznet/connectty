/**
 * Google Cloud Platform Provider
 * Uses GCP Compute API to discover VM instances
 */

import type {
  Provider,
  DiscoveredHost,
  DiscoveryResult,
  GCPConfig,
} from '@connectty/shared';
import { generateId } from '@connectty/shared';
import { IProviderService, detectOSType } from './index';

// Dynamic import of GCP SDK (optional dependency)
let InstancesClient: any;

async function loadGCPSdk() {
  if (!InstancesClient) {
    try {
      const computeModule = await import('@google-cloud/compute');
      InstancesClient = computeModule.InstancesClient;
    } catch {
      throw new Error('GCP SDK not installed. Run: npm install @google-cloud/compute');
    }
  }
}

export class GCPProvider implements IProviderService {
  async testConnection(provider: Provider): Promise<boolean> {
    const config = provider.config as GCPConfig;
    try {
      await loadGCPSdk();
      const client = this.createClient(config);
      // Try to list zones to verify connection
      const [zones] = await client.aggregatedList({
        project: config.projectId,
        maxResults: 1,
      });
      return true;
    } catch {
      return false;
    }
  }

  async discoverHosts(provider: Provider): Promise<DiscoveryResult> {
    const config = provider.config as GCPConfig;
    const hosts: DiscoveredHost[] = [];

    try {
      await loadGCPSdk();
      const client = this.createClient(config);

      // Use aggregatedList to get instances from all zones
      const [instancesIterator] = await client.aggregatedList({
        project: config.projectId,
      });

      for await (const [zone, instancesObj] of instancesIterator) {
        const instances = instancesObj.instances || [];
        const zoneName = zone.replace('zones/', '');

        // Skip if specific zones are configured and this zone isn't in the list
        if (config.zones?.length && !config.zones.some(z => zoneName.includes(z))) {
          continue;
        }

        for (const instance of instances) {
          const osType = detectOSType(
            instance.labels?.os,
            instance.disks?.[0]?.licenses?.[0],
            instance.labels
          );

          // Get IP addresses
          let privateIp: string | undefined;
          let publicIp: string | undefined;

          for (const networkInterface of instance.networkInterfaces || []) {
            privateIp = privateIp || networkInterface.networkIP;
            for (const accessConfig of networkInterface.accessConfigs || []) {
              publicIp = publicIp || accessConfig.natIP;
            }
          }

          hosts.push({
            id: generateId(),
            providerId: provider.id,
            providerHostId: String(instance.id),
            name: instance.name || String(instance.id),
            hostname: publicIp || privateIp,
            privateIp,
            publicIp,
            osType,
            osName: instance.labels?.os,
            state: this.mapState(instance.status),
            metadata: {
              instanceId: String(instance.id),
              zone: zoneName,
              machineType: instance.machineType?.split('/').pop() || '',
              network: instance.networkInterfaces?.[0]?.network?.split('/').pop() || '',
              project: config.projectId,
            },
            tags: instance.labels || {},
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

  private createClient(config: GCPConfig): any {
    const clientConfig: any = {};

    if (config.serviceAccountKey) {
      try {
        const credentials = JSON.parse(config.serviceAccountKey);
        clientConfig.credentials = credentials;
      } catch {
        // If not valid JSON, treat as file path (handled by SDK)
        clientConfig.keyFilename = config.serviceAccountKey;
      }
    }

    return new InstancesClient(clientConfig);
  }

  private mapState(status?: string): 'running' | 'stopped' | 'suspended' | 'unknown' {
    switch (status) {
      case 'RUNNING':
        return 'running';
      case 'TERMINATED':
      case 'STOPPED':
        return 'stopped';
      case 'SUSPENDED':
      case 'SUSPENDING':
      case 'STAGING':
      case 'PROVISIONING':
        return 'suspended';
      default:
        return 'unknown';
    }
  }
}
