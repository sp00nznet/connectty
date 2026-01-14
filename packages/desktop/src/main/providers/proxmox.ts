/**
 * Proxmox VE Provider
 * Uses the Proxmox API to discover VMs and containers
 */

import https from 'https';
import type {
  Provider,
  DiscoveredHost,
  DiscoveryResult,
  ProxmoxConfig,
} from '@connectty/shared';
import { generateId } from '@connectty/shared';
import { IProviderService, detectOSType } from './index';

export class ProxmoxProvider implements IProviderService {
  async testConnection(provider: Provider): Promise<boolean> {
    const config = provider.config as ProxmoxConfig;
    try {
      const ticket = await this.login(config);
      return !!ticket;
    } catch {
      return false;
    }
  }

  async discoverHosts(provider: Provider): Promise<DiscoveryResult> {
    const config = provider.config as ProxmoxConfig;
    const hosts: DiscoveredHost[] = [];

    try {
      const { ticket, csrfToken } = await this.login(config);

      // Get all nodes
      const nodes = await this.getNodes(config, ticket);

      for (const node of nodes) {
        // Get VMs on this node
        const vms = await this.getVMs(config, ticket, node.node);
        for (const vm of vms) {
          const vmConfig = await this.getVMConfig(config, ticket, node.node, vm.vmid);
          const osType = detectOSType(vmConfig.ostype, vm.name);

          hosts.push({
            id: generateId(),
            providerId: provider.id,
            providerHostId: `${node.node}/${vm.vmid}`,
            name: vm.name || `VM ${vm.vmid}`,
            hostname: vmConfig.ipconfig0 ? this.parseIP(vmConfig.ipconfig0) : undefined,
            privateIp: vmConfig.ipconfig0 ? this.parseIP(vmConfig.ipconfig0) : undefined,
            osType,
            osName: vmConfig.ostype,
            state: vm.status === 'running' ? 'running' :
                   vm.status === 'paused' ? 'suspended' : 'stopped',
            metadata: {
              vmid: String(vm.vmid),
              node: node.node,
              type: 'qemu',
              cores: String(vmConfig.cores || 1),
              memory: String(vmConfig.memory || 0),
            },
            tags: vm.tags ? this.parseTags(vm.tags) : {},
            discoveredAt: new Date(),
            lastSeenAt: new Date(),
            imported: false,
          });
        }

        // Get LXC containers on this node
        const containers = await this.getContainers(config, ticket, node.node);
        for (const ct of containers) {
          const ctConfig = await this.getContainerConfig(config, ticket, node.node, ct.vmid);

          hosts.push({
            id: generateId(),
            providerId: provider.id,
            providerHostId: `${node.node}/${ct.vmid}`,
            name: ct.name || `CT ${ct.vmid}`,
            hostname: ctConfig.hostname,
            privateIp: ctConfig.net0 ? this.parseContainerIP(ctConfig.net0) : undefined,
            osType: 'linux',
            osName: ctConfig.ostype || 'Linux Container',
            state: ct.status === 'running' ? 'running' : 'stopped',
            metadata: {
              vmid: String(ct.vmid),
              node: node.node,
              type: 'lxc',
              cores: String(ctConfig.cores || 1),
              memory: String(ctConfig.memory || 0),
            },
            tags: ct.tags ? this.parseTags(ct.tags) : {},
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

  private async login(config: ProxmoxConfig): Promise<{ ticket: string; csrfToken: string }> {
    return new Promise((resolve, reject) => {
      const postData = `username=${encodeURIComponent(config.username)}@${encodeURIComponent(config.realm)}&password=${encodeURIComponent(config.password || '')}`;

      const options = {
        hostname: config.host,
        port: config.port || 8006,
        path: '/api2/json/access/ticket',
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(postData),
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
                ticket: response.data.ticket,
                csrfToken: response.data.CSRFPreventionToken,
              });
            } catch {
              reject(new Error('Invalid response from Proxmox'));
            }
          } else {
            reject(new Error(`Login failed: ${res.statusCode}`));
          }
        });
      });

      req.on('error', reject);
      req.write(postData);
      req.end();
    });
  }

  private async apiGet(config: ProxmoxConfig, ticket: string, path: string): Promise<any> {
    return new Promise((resolve, reject) => {
      const options = {
        hostname: config.host,
        port: config.port || 8006,
        path: `/api2/json${path}`,
        method: 'GET',
        headers: {
          'Cookie': `PVEAuthCookie=${ticket}`,
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
              resolve(response.data);
            } catch {
              reject(new Error('Invalid response'));
            }
          } else {
            reject(new Error(`API call failed: ${res.statusCode}`));
          }
        });
      });

      req.on('error', reject);
      req.end();
    });
  }

  private async getNodes(config: ProxmoxConfig, ticket: string): Promise<any[]> {
    return this.apiGet(config, ticket, '/nodes');
  }

  private async getVMs(config: ProxmoxConfig, ticket: string, node: string): Promise<any[]> {
    return this.apiGet(config, ticket, `/nodes/${node}/qemu`);
  }

  private async getVMConfig(config: ProxmoxConfig, ticket: string, node: string, vmid: number): Promise<any> {
    try {
      return await this.apiGet(config, ticket, `/nodes/${node}/qemu/${vmid}/config`);
    } catch {
      return {};
    }
  }

  private async getContainers(config: ProxmoxConfig, ticket: string, node: string): Promise<any[]> {
    return this.apiGet(config, ticket, `/nodes/${node}/lxc`);
  }

  private async getContainerConfig(config: ProxmoxConfig, ticket: string, node: string, vmid: number): Promise<any> {
    try {
      return await this.apiGet(config, ticket, `/nodes/${node}/lxc/${vmid}/config`);
    } catch {
      return {};
    }
  }

  private parseIP(ipconfig: string): string | undefined {
    // Format: ip=192.168.1.100/24,gw=192.168.1.1
    const match = ipconfig.match(/ip=([^/,]+)/);
    return match ? match[1] : undefined;
  }

  private parseContainerIP(net: string): string | undefined {
    // Format: name=eth0,bridge=vmbr0,ip=192.168.1.100/24,gw=192.168.1.1
    const match = net.match(/ip=([^/,]+)/);
    return match ? match[1] : undefined;
  }

  private parseTags(tags: string): Record<string, string> {
    // Proxmox tags are semicolon-separated
    const result: Record<string, string> = {};
    tags.split(';').forEach((tag, index) => {
      result[`tag${index}`] = tag.trim();
    });
    return result;
  }
}
