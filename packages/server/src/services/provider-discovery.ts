/**
 * Provider Discovery Service
 * Handles connecting to and discovering hosts from various cloud providers
 */

import type { Provider, DiscoveredHost } from './database';

interface DiscoveryResult {
  providerHostId: string;
  name: string;
  hostname?: string;
  privateIp?: string;
  publicIp?: string;
  osType?: string;
  osName?: string;
  state?: string;
  metadata?: Record<string, unknown>;
  tags?: string[];
}

interface TestResult {
  success: boolean;
  message: string;
}

export class ProviderDiscoveryService {
  async testConnection(provider: Provider): Promise<TestResult> {
    try {
      switch (provider.type) {
        case 'vmware':
          return await this.testVMware(provider);
        case 'proxmox':
          return await this.testProxmox(provider);
        case 'aws':
          return await this.testAWS(provider);
        case 'azure':
          return await this.testAzure(provider);
        case 'gcp':
          return await this.testGCP(provider);
        case 'bigfix':
          return await this.testBigFix(provider);
        default:
          return { success: false, message: `Unknown provider type: ${provider.type}` };
      }
    } catch (err) {
      return { success: false, message: (err as Error).message };
    }
  }

  async discover(provider: Provider): Promise<DiscoveryResult[]> {
    switch (provider.type) {
      case 'vmware':
        return await this.discoverVMware(provider);
      case 'proxmox':
        return await this.discoverProxmox(provider);
      case 'aws':
        return await this.discoverAWS(provider);
      case 'azure':
        return await this.discoverAzure(provider);
      case 'gcp':
        return await this.discoverGCP(provider);
      case 'bigfix':
        return await this.discoverBigFix(provider);
      default:
        throw new Error(`Unknown provider type: ${provider.type}`);
    }
  }

  // VMware vSphere
  private async testVMware(provider: Provider): Promise<TestResult> {
    const { host, username, password, port = 443, ignoreCert = true } = provider.config as {
      host: string;
      username: string;
      password: string;
      port?: number;
      ignoreCert?: boolean;
    };

    if (!host || !username || !password) {
      return { success: false, message: 'Missing required VMware configuration: host, username, password' };
    }

    try {
      // Try to connect to vSphere API
      const url = `https://${host}:${port}/rest/com/vmware/cis/session`;
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': 'Basic ' + Buffer.from(`${username}:${password}`).toString('base64'),
        },
        ...(ignoreCert ? {
          // @ts-expect-error - Node.js specific option
          agent: new (await import('https')).Agent({ rejectUnauthorized: false })
        } : {}),
      });

      if (response.ok) {
        return { success: true, message: 'Successfully connected to VMware vSphere' };
      } else {
        return { success: false, message: `VMware connection failed: ${response.status} ${response.statusText}` };
      }
    } catch (err) {
      return { success: false, message: `VMware connection failed: ${(err as Error).message}` };
    }
  }

  private async discoverVMware(provider: Provider): Promise<DiscoveryResult[]> {
    const { host, username, password, port = 443, ignoreCert = true } = provider.config as {
      host: string;
      username: string;
      password: string;
      port?: number;
      ignoreCert?: boolean;
    };

    // Get session token
    const sessionUrl = `https://${host}:${port}/rest/com/vmware/cis/session`;
    const https = await import('https');
    const agent = ignoreCert ? new https.Agent({ rejectUnauthorized: false }) : undefined;

    const sessionResponse = await fetch(sessionUrl, {
      method: 'POST',
      headers: {
        'Authorization': 'Basic ' + Buffer.from(`${username}:${password}`).toString('base64'),
      },
      // @ts-expect-error - Node.js specific option
      agent,
    });

    if (!sessionResponse.ok) {
      throw new Error(`Failed to authenticate with VMware: ${sessionResponse.status}`);
    }

    const sessionData = await sessionResponse.json() as { value: string };
    const sessionId = sessionData.value;

    // List VMs
    const vmsUrl = `https://${host}:${port}/rest/vcenter/vm`;
    const vmsResponse = await fetch(vmsUrl, {
      headers: {
        'vmware-api-session-id': sessionId,
      },
      // @ts-expect-error - Node.js specific option
      agent,
    });

    if (!vmsResponse.ok) {
      throw new Error(`Failed to list VMs: ${vmsResponse.status}`);
    }

    const vmsData = await vmsResponse.json() as { value: Array<{
      vm: string;
      name: string;
      power_state: string;
      guest_OS?: string;
    }> };

    const results: DiscoveryResult[] = [];

    for (const vm of vmsData.value || []) {
      // Get VM details including IP
      const vmDetailUrl = `https://${host}:${port}/rest/vcenter/vm/${vm.vm}`;
      const vmDetailResponse = await fetch(vmDetailUrl, {
        headers: { 'vmware-api-session-id': sessionId },
        // @ts-expect-error - Node.js specific option
        agent,
      });

      let privateIp: string | undefined;
      let osName: string | undefined;

      if (vmDetailResponse.ok) {
        const vmDetail = await vmDetailResponse.json() as { value: {
          guest_OS?: string;
          identity?: { ip_address?: string };
        }};
        privateIp = vmDetail.value?.identity?.ip_address;
        osName = vmDetail.value?.guest_OS;
      }

      results.push({
        providerHostId: vm.vm,
        name: vm.name,
        privateIp,
        osType: this.guessOsType(osName || vm.guest_OS),
        osName: osName || vm.guest_OS,
        state: vm.power_state?.toLowerCase(),
        metadata: { vmId: vm.vm },
      });
    }

    // Logout
    await fetch(sessionUrl, {
      method: 'DELETE',
      headers: { 'vmware-api-session-id': sessionId },
      // @ts-expect-error - Node.js specific option
      agent,
    });

    return results;
  }

  // Proxmox VE
  private async testProxmox(provider: Provider): Promise<TestResult> {
    const { host, username, password, realm = 'pam', port = 8006, ignoreCert = true } = provider.config as {
      host: string;
      username: string;
      password: string;
      realm?: string;
      port?: number;
      ignoreCert?: boolean;
    };

    if (!host || !username || !password) {
      return { success: false, message: 'Missing required Proxmox configuration: host, username, password' };
    }

    try {
      const https = await import('https');
      const agent = ignoreCert ? new https.Agent({ rejectUnauthorized: false }) : undefined;

      const url = `https://${host}:${port}/api2/json/access/ticket`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `username=${encodeURIComponent(username)}@${realm}&password=${encodeURIComponent(password)}`,
        // @ts-expect-error - Node.js specific option
        agent,
      });

      if (response.ok) {
        return { success: true, message: 'Successfully connected to Proxmox VE' };
      } else {
        return { success: false, message: `Proxmox connection failed: ${response.status}` };
      }
    } catch (err) {
      return { success: false, message: `Proxmox connection failed: ${(err as Error).message}` };
    }
  }

  private async discoverProxmox(provider: Provider): Promise<DiscoveryResult[]> {
    const { host, username, password, realm = 'pam', port = 8006, ignoreCert = true } = provider.config as {
      host: string;
      username: string;
      password: string;
      realm?: string;
      port?: number;
      ignoreCert?: boolean;
    };

    const https = await import('https');
    const agent = ignoreCert ? new https.Agent({ rejectUnauthorized: false }) : undefined;

    // Get ticket
    const ticketUrl = `https://${host}:${port}/api2/json/access/ticket`;
    const ticketResponse = await fetch(ticketUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `username=${encodeURIComponent(username)}@${realm}&password=${encodeURIComponent(password)}`,
      // @ts-expect-error - Node.js specific option
      agent,
    });

    if (!ticketResponse.ok) {
      throw new Error(`Failed to authenticate with Proxmox: ${ticketResponse.status}`);
    }

    const ticketData = await ticketResponse.json() as { data: { ticket: string; CSRFPreventionToken: string } };
    const { ticket, CSRFPreventionToken } = ticketData.data;

    const headers = {
      'Cookie': `PVEAuthCookie=${ticket}`,
      'CSRFPreventionToken': CSRFPreventionToken,
    };

    // Get nodes
    const nodesUrl = `https://${host}:${port}/api2/json/nodes`;
    const nodesResponse = await fetch(nodesUrl, {
      headers,
      // @ts-expect-error - Node.js specific option
      agent,
    });

    if (!nodesResponse.ok) {
      throw new Error(`Failed to list nodes: ${nodesResponse.status}`);
    }

    const nodesData = await nodesResponse.json() as { data: Array<{ node: string }> };
    const results: DiscoveryResult[] = [];

    for (const nodeInfo of nodesData.data || []) {
      // Get QEMU VMs
      const qemuUrl = `https://${host}:${port}/api2/json/nodes/${nodeInfo.node}/qemu`;
      const qemuResponse = await fetch(qemuUrl, {
        headers,
        // @ts-expect-error - Node.js specific option
        agent,
      });

      if (qemuResponse.ok) {
        const qemuData = await qemuResponse.json() as { data: Array<{
          vmid: number;
          name: string;
          status: string;
        }> };

        for (const vm of qemuData.data || []) {
          // Get guest agent info for IP
          let privateIp: string | undefined;
          try {
            const agentUrl = `https://${host}:${port}/api2/json/nodes/${nodeInfo.node}/qemu/${vm.vmid}/agent/network-get-interfaces`;
            const agentResponse = await fetch(agentUrl, {
              headers,
              // @ts-expect-error - Node.js specific option
              agent,
            });

            if (agentResponse.ok) {
              const agentData = await agentResponse.json() as { data: { result: Array<{
                'ip-addresses'?: Array<{ 'ip-address': string; 'ip-address-type': string }>;
              }> }};

              for (const iface of agentData.data?.result || []) {
                const ipv4 = iface['ip-addresses']?.find(ip => ip['ip-address-type'] === 'ipv4' && !ip['ip-address'].startsWith('127.'));
                if (ipv4) {
                  privateIp = ipv4['ip-address'];
                  break;
                }
              }
            }
          } catch {
            // Guest agent not available
          }

          results.push({
            providerHostId: `qemu-${vm.vmid}`,
            name: vm.name || `VM ${vm.vmid}`,
            privateIp,
            state: vm.status,
            metadata: { node: nodeInfo.node, vmid: vm.vmid, type: 'qemu' },
          });
        }
      }

      // Get LXC containers
      const lxcUrl = `https://${host}:${port}/api2/json/nodes/${nodeInfo.node}/lxc`;
      const lxcResponse = await fetch(lxcUrl, {
        headers,
        // @ts-expect-error - Node.js specific option
        agent,
      });

      if (lxcResponse.ok) {
        const lxcData = await lxcResponse.json() as { data: Array<{
          vmid: number;
          name: string;
          status: string;
        }> };

        for (const ct of lxcData.data || []) {
          // Get container config for IP
          let privateIp: string | undefined;
          try {
            const configUrl = `https://${host}:${port}/api2/json/nodes/${nodeInfo.node}/lxc/${ct.vmid}/config`;
            const configResponse = await fetch(configUrl, {
              headers,
              // @ts-expect-error - Node.js specific option
              agent,
            });

            if (configResponse.ok) {
              const configData = await configResponse.json() as { data: Record<string, string> };
              // Parse net0 config for IP
              const net0 = configData.data?.net0;
              if (net0) {
                const ipMatch = net0.match(/ip=([^,/]+)/);
                if (ipMatch) {
                  privateIp = ipMatch[1];
                }
              }
            }
          } catch {
            // Ignore errors
          }

          results.push({
            providerHostId: `lxc-${ct.vmid}`,
            name: ct.name || `CT ${ct.vmid}`,
            privateIp,
            osType: 'linux',
            state: ct.status,
            metadata: { node: nodeInfo.node, vmid: ct.vmid, type: 'lxc' },
          });
        }
      }
    }

    return results;
  }

  // AWS EC2
  private async testAWS(provider: Provider): Promise<TestResult> {
    const { accessKeyId, secretAccessKey, region = 'us-east-1' } = provider.config as {
      accessKeyId: string;
      secretAccessKey: string;
      region?: string;
    };

    if (!accessKeyId || !secretAccessKey) {
      return { success: false, message: 'Missing required AWS configuration: accessKeyId, secretAccessKey' };
    }

    try {
      // Simple STS GetCallerIdentity call to verify credentials
      const { SignatureV4 } = await import('@smithy/signature-v4');
      const { Sha256 } = await import('@aws-crypto/sha256-js');

      const signer = new SignatureV4({
        credentials: { accessKeyId, secretAccessKey },
        region,
        service: 'sts',
        sha256: Sha256,
      });

      const url = `https://sts.${region}.amazonaws.com/?Action=GetCallerIdentity&Version=2011-06-15`;
      const request = {
        method: 'GET',
        headers: { host: `sts.${region}.amazonaws.com` },
        hostname: `sts.${region}.amazonaws.com`,
        path: '/',
        query: { Action: 'GetCallerIdentity', Version: '2011-06-15' },
        protocol: 'https:',
      };

      const signedRequest = await signer.sign(request);
      const response = await fetch(url, {
        method: 'GET',
        headers: signedRequest.headers as HeadersInit,
      });

      if (response.ok) {
        return { success: true, message: 'Successfully connected to AWS' };
      } else {
        return { success: false, message: `AWS connection failed: ${response.status}` };
      }
    } catch (err) {
      // If AWS SDK packages aren't installed, provide helpful error
      if ((err as Error).message.includes('Cannot find module')) {
        return { success: false, message: 'AWS SDK packages not installed. Run: npm install @smithy/signature-v4 @aws-crypto/sha256-js' };
      }
      return { success: false, message: `AWS connection failed: ${(err as Error).message}` };
    }
  }

  private async discoverAWS(provider: Provider): Promise<DiscoveryResult[]> {
    const { accessKeyId, secretAccessKey, region = 'us-east-1', regions } = provider.config as {
      accessKeyId: string;
      secretAccessKey: string;
      region?: string;
      regions?: string[];
    };

    const targetRegions = regions && regions.length > 0 ? regions : [region];
    const results: DiscoveryResult[] = [];

    try {
      const { SignatureV4 } = await import('@smithy/signature-v4');
      const { Sha256 } = await import('@aws-crypto/sha256-js');

      for (const r of targetRegions) {
        const signer = new SignatureV4({
          credentials: { accessKeyId, secretAccessKey },
          region: r,
          service: 'ec2',
          sha256: Sha256,
        });

        const url = `https://ec2.${r}.amazonaws.com/?Action=DescribeInstances&Version=2016-11-15`;
        const request = {
          method: 'GET',
          headers: { host: `ec2.${r}.amazonaws.com` },
          hostname: `ec2.${r}.amazonaws.com`,
          path: '/',
          query: { Action: 'DescribeInstances', Version: '2016-11-15' },
          protocol: 'https:',
        };

        const signedRequest = await signer.sign(request);
        const response = await fetch(url, {
          method: 'GET',
          headers: signedRequest.headers as HeadersInit,
        });

        if (response.ok) {
          const text = await response.text();
          // Parse XML response (simple regex parsing)
          const instanceMatches = text.matchAll(/<instanceId>([^<]+)<\/instanceId>/g);
          const privateIpMatches = text.matchAll(/<privateIpAddress>([^<]+)<\/privateIpAddress>/g);
          const publicIpMatches = text.matchAll(/<ipAddress>([^<]+)<\/ipAddress>/g);
          const stateMatches = text.matchAll(/<name>([^<]+)<\/name>/g);
          const platformMatches = text.matchAll(/<platform>([^<]+)<\/platform>/g);

          const instanceIds = [...instanceMatches].map(m => m[1]);
          const privateIps = [...privateIpMatches].map(m => m[1]);
          const publicIps = [...publicIpMatches].map(m => m[1]);
          const states = [...stateMatches].map(m => m[1]);
          const platforms = [...platformMatches].map(m => m[1]);

          for (let i = 0; i < instanceIds.length; i++) {
            // Get Name tag
            const nameTagRegex = new RegExp(`<instanceId>${instanceIds[i]}</instanceId>.*?<key>Name</key>\\s*<value>([^<]*)</value>`, 's');
            const nameMatch = text.match(nameTagRegex);
            const name = nameMatch?.[1] || instanceIds[i];

            results.push({
              providerHostId: instanceIds[i],
              name,
              privateIp: privateIps[i],
              publicIp: publicIps[i],
              osType: platforms[i] === 'windows' ? 'windows' : 'linux',
              state: states[i],
              metadata: { region: r, instanceId: instanceIds[i] },
              tags: [`region:${r}`],
            });
          }
        }
      }
    } catch (err) {
      if ((err as Error).message.includes('Cannot find module')) {
        throw new Error('AWS SDK packages not installed. Run: npm install @smithy/signature-v4 @aws-crypto/sha256-js');
      }
      throw err;
    }

    return results;
  }

  // Azure - placeholder implementations
  private async testAzure(provider: Provider): Promise<TestResult> {
    const { tenantId, clientId, clientSecret } = provider.config as {
      tenantId: string;
      clientId: string;
      clientSecret: string;
    };

    if (!tenantId || !clientId || !clientSecret) {
      return { success: false, message: 'Missing required Azure configuration: tenantId, clientId, clientSecret' };
    }

    try {
      // Get OAuth token
      const tokenUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
      const response = await fetch(tokenUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `grant_type=client_credentials&client_id=${clientId}&client_secret=${encodeURIComponent(clientSecret)}&scope=https://management.azure.com/.default`,
      });

      if (response.ok) {
        return { success: true, message: 'Successfully connected to Azure' };
      } else {
        return { success: false, message: `Azure connection failed: ${response.status}` };
      }
    } catch (err) {
      return { success: false, message: `Azure connection failed: ${(err as Error).message}` };
    }
  }

  private async discoverAzure(provider: Provider): Promise<DiscoveryResult[]> {
    const { tenantId, clientId, clientSecret, subscriptionId } = provider.config as {
      tenantId: string;
      clientId: string;
      clientSecret: string;
      subscriptionId: string;
    };

    // Get OAuth token
    const tokenUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
    const tokenResponse = await fetch(tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `grant_type=client_credentials&client_id=${clientId}&client_secret=${encodeURIComponent(clientSecret)}&scope=https://management.azure.com/.default`,
    });

    if (!tokenResponse.ok) {
      throw new Error(`Failed to authenticate with Azure: ${tokenResponse.status}`);
    }

    const tokenData = await tokenResponse.json() as { access_token: string };
    const token = tokenData.access_token;

    // List VMs
    const vmsUrl = `https://management.azure.com/subscriptions/${subscriptionId}/providers/Microsoft.Compute/virtualMachines?api-version=2023-03-01`;
    const vmsResponse = await fetch(vmsUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!vmsResponse.ok) {
      throw new Error(`Failed to list Azure VMs: ${vmsResponse.status}`);
    }

    const vmsData = await vmsResponse.json() as { value: Array<{
      id: string;
      name: string;
      properties: {
        storageProfile?: { osDisk?: { osType?: string } };
        instanceView?: { statuses?: Array<{ code: string }> };
      };
    }> };

    const results: DiscoveryResult[] = [];

    for (const vm of vmsData.value || []) {
      const osType = vm.properties?.storageProfile?.osDisk?.osType?.toLowerCase() as 'linux' | 'windows' | undefined;
      const statuses = vm.properties?.instanceView?.statuses || [];
      const powerState = statuses.find(s => s.code.startsWith('PowerState/'))?.code.replace('PowerState/', '');

      results.push({
        providerHostId: vm.id,
        name: vm.name,
        osType,
        state: powerState,
        metadata: { resourceId: vm.id },
      });
    }

    return results;
  }

  // GCP - placeholder implementations
  private async testGCP(provider: Provider): Promise<TestResult> {
    const { projectId, serviceAccountKey } = provider.config as {
      projectId: string;
      serviceAccountKey: string;
    };

    if (!projectId || !serviceAccountKey) {
      return { success: false, message: 'Missing required GCP configuration: projectId, serviceAccountKey' };
    }

    return { success: true, message: 'GCP configuration validated (full test requires service account authentication)' };
  }

  private async discoverGCP(provider: Provider): Promise<DiscoveryResult[]> {
    // GCP discovery would require OAuth2 with service account
    // This is a placeholder that returns empty results
    console.log('GCP discovery not fully implemented');
    return [];
  }

  // BigFix - placeholder implementations
  private async testBigFix(provider: Provider): Promise<TestResult> {
    const { host, username, password } = provider.config as {
      host: string;
      username: string;
      password: string;
    };

    if (!host || !username || !password) {
      return { success: false, message: 'Missing required BigFix configuration: host, username, password' };
    }

    try {
      const url = `https://${host}/api/login`;
      const https = await import('https');
      const agent = new https.Agent({ rejectUnauthorized: false });

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': 'Basic ' + Buffer.from(`${username}:${password}`).toString('base64'),
        },
        // @ts-expect-error - Node.js specific option
        agent,
      });

      if (response.ok) {
        return { success: true, message: 'Successfully connected to BigFix' };
      } else {
        return { success: false, message: `BigFix connection failed: ${response.status}` };
      }
    } catch (err) {
      return { success: false, message: `BigFix connection failed: ${(err as Error).message}` };
    }
  }

  private async discoverBigFix(provider: Provider): Promise<DiscoveryResult[]> {
    const { host, username, password } = provider.config as {
      host: string;
      username: string;
      password: string;
    };

    const https = await import('https');
    const agent = new https.Agent({ rejectUnauthorized: false });

    // Query computers
    const relevance = encodeURIComponent('(id of it, name of it, ip address of it as string, operating system of it) of bes computers');
    const url = `https://${host}/api/query?relevance=${relevance}`;

    const response = await fetch(url, {
      headers: {
        'Authorization': 'Basic ' + Buffer.from(`${username}:${password}`).toString('base64'),
      },
      // @ts-expect-error - Node.js specific option
      agent,
    });

    if (!response.ok) {
      throw new Error(`BigFix query failed: ${response.status}`);
    }

    const text = await response.text();
    const results: DiscoveryResult[] = [];

    // Parse XML response
    const tupleMatches = text.matchAll(/<Tuple>(.*?)<\/Tuple>/gs);

    for (const match of tupleMatches) {
      const tuple = match[1];
      const answers = [...tuple.matchAll(/<Answer[^>]*>([^<]*)<\/Answer>/g)].map(m => m[1]);

      if (answers.length >= 4) {
        const [id, name, ip, os] = answers;
        results.push({
          providerHostId: id,
          name,
          privateIp: ip,
          osType: this.guessOsType(os),
          osName: os,
          state: 'online',
          metadata: { computerId: id },
        });
      }
    }

    return results;
  }

  private guessOsType(osString?: string): 'linux' | 'windows' | undefined {
    if (!osString) return undefined;
    const lower = osString.toLowerCase();
    if (lower.includes('windows')) return 'windows';
    if (lower.includes('linux') || lower.includes('ubuntu') || lower.includes('centos') ||
        lower.includes('debian') || lower.includes('rhel') || lower.includes('fedora')) {
      return 'linux';
    }
    return undefined;
  }
}
