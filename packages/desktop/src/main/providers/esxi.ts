/**
 * VMware ESXi Provider
 * Uses the vSphere API to discover VMs
 */

import https from 'https';
import type {
  Provider,
  DiscoveredHost,
  DiscoveryResult,
  ESXiConfig,
} from '@connectty/shared';
import { generateId } from '@connectty/shared';
import { IProviderService, detectOSType } from './index';

export class ESXiProvider implements IProviderService {
  async testConnection(provider: Provider): Promise<boolean> {
    const config = provider.config as ESXiConfig;
    try {
      const sessionId = await this.login(config);
      await this.logout(config, sessionId);
      return true;
    } catch {
      return false;
    }
  }

  async discoverHosts(provider: Provider): Promise<DiscoveryResult> {
    const config = provider.config as ESXiConfig;
    const hosts: DiscoveredHost[] = [];

    try {
      const sessionId = await this.login(config);

      try {
        // Get all VMs
        const vms = await this.getVMs(config, sessionId);

        for (const vm of vms) {
          const osType = detectOSType(vm.guestFullName, vm.guestId);

          hosts.push({
            id: generateId(),
            providerId: provider.id,
            providerHostId: vm.vmId,
            name: vm.name,
            hostname: vm.hostName || vm.ipAddress,
            privateIp: vm.ipAddress,
            osType,
            osName: vm.guestFullName,
            state: vm.powerState === 'poweredOn' ? 'running' :
                   vm.powerState === 'suspended' ? 'suspended' : 'stopped',
            metadata: {
              vmId: vm.vmId,
              datacenter: vm.datacenter || '',
              cluster: vm.cluster || '',
              host: vm.esxiHost || '',
              numCpu: String(vm.numCpu || 0),
              memoryMB: String(vm.memoryMB || 0),
            },
            tags: vm.tags || {},
            discoveredAt: new Date(),
            lastSeenAt: new Date(),
            imported: false,
          });
        }
      } finally {
        await this.logout(config, sessionId);
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

  private async login(config: ESXiConfig): Promise<string> {
    return new Promise((resolve, reject) => {
      const auth = Buffer.from(`${config.username}:${config.password}`).toString('base64');

      const options = {
        hostname: config.host,
        port: config.port || 443,
        path: '/rest/com/vmware/cis/session',
        method: 'POST',
        headers: {
          'Authorization': `Basic ${auth}`,
          'Content-Type': 'application/json',
        },
        rejectUnauthorized: !config.ignoreCertErrors,
      };

      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          if (res.statusCode === 200) {
            try {
              const response = JSON.parse(data);
              resolve(response.value);
            } catch {
              reject(new Error('Invalid response from ESXi'));
            }
          } else {
            reject(new Error(`Login failed: ${res.statusCode}`));
          }
        });
      });

      req.on('error', reject);
      req.end();
    });
  }

  private async logout(config: ESXiConfig, sessionId: string): Promise<void> {
    return new Promise((resolve) => {
      const options = {
        hostname: config.host,
        port: config.port || 443,
        path: '/rest/com/vmware/cis/session',
        method: 'DELETE',
        headers: {
          'vmware-api-session-id': sessionId,
        },
        rejectUnauthorized: !config.ignoreCertErrors,
      };

      const req = https.request(options, () => resolve());
      req.on('error', () => resolve());
      req.end();
    });
  }

  private async getVMs(config: ESXiConfig, sessionId: string): Promise<VMInfo[]> {
    return new Promise((resolve, reject) => {
      const options = {
        hostname: config.host,
        port: config.port || 443,
        path: '/rest/vcenter/vm',
        method: 'GET',
        headers: {
          'vmware-api-session-id': sessionId,
          'Content-Type': 'application/json',
        },
        rejectUnauthorized: !config.ignoreCertErrors,
      };

      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', async () => {
          if (res.statusCode === 200) {
            try {
              const response = JSON.parse(data);
              const vms: VMInfo[] = [];

              for (const vm of response.value || []) {
                // Get detailed VM info
                const details = await this.getVMDetails(config, sessionId, vm.vm);
                vms.push({
                  vmId: vm.vm,
                  name: vm.name,
                  powerState: vm.power_state,
                  ...details,
                });
              }

              resolve(vms);
            } catch (e) {
              reject(new Error(`Failed to parse VM list: ${e}`));
            }
          } else {
            reject(new Error(`Failed to get VMs: ${res.statusCode}`));
          }
        });
      });

      req.on('error', reject);
      req.end();
    });
  }

  private async getVMDetails(config: ESXiConfig, sessionId: string, vmId: string): Promise<Partial<VMInfo>> {
    return new Promise((resolve) => {
      const options = {
        hostname: config.host,
        port: config.port || 443,
        path: `/rest/vcenter/vm/${vmId}/guest/identity`,
        method: 'GET',
        headers: {
          'vmware-api-session-id': sessionId,
          'Content-Type': 'application/json',
        },
        rejectUnauthorized: !config.ignoreCertErrors,
      };

      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          if (res.statusCode === 200) {
            try {
              const response = JSON.parse(data);
              resolve({
                guestId: response.value?.family,
                guestFullName: response.value?.name,
                hostName: response.value?.host_name,
                ipAddress: response.value?.ip_address,
              });
            } catch {
              resolve({});
            }
          } else {
            resolve({});
          }
        });
      });

      req.on('error', () => resolve({}));
      req.end();
    });
  }
}

interface VMInfo {
  vmId: string;
  name: string;
  powerState: string;
  guestId?: string;
  guestFullName?: string;
  hostName?: string;
  ipAddress?: string;
  datacenter?: string;
  cluster?: string;
  esxiHost?: string;
  numCpu?: number;
  memoryMB?: number;
  tags?: Record<string, string>;
}
