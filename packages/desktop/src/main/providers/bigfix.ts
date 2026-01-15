/**
 * BigFix Provider
 * Uses the BigFix REST API to discover computers from the BigFix console
 * Authenticates using Active Directory credentials
 */

import https from 'https';
import type {
  Provider,
  DiscoveredHost,
  DiscoveryResult,
  BigFixConfig,
} from '@connectty/shared';
import { generateId } from '@connectty/shared';
import { IProviderService, detectOSType } from './index';

interface BigFixComputer {
  ID: string;
  LastReportTime: string;
  Resource: string;
}

interface BigFixComputerDetail {
  ID: string;
  ComputerName?: string;
  DNSName?: string;
  IPAddress?: string;
  OS?: string;
  AgentType?: string;
  Locked?: string;
  UserName?: string;
  DeviceType?: string;
  properties?: Record<string, string>;
}

export class BigFixProvider implements IProviderService {
  async testConnection(provider: Provider): Promise<boolean> {
    const config = provider.config as BigFixConfig;
    try {
      // Try to get the list of computers (limited to 1) to verify connection
      const response = await this.apiGet(config, '/api/computers');
      return response !== null;
    } catch {
      return false;
    }
  }

  async discoverHosts(provider: Provider): Promise<DiscoveryResult> {
    const config = provider.config as BigFixConfig;
    const hosts: DiscoveredHost[] = [];

    try {
      // Get list of all computers
      const computersResponse = await this.apiGet(config, '/api/computers');
      const computers = this.parseComputerList(computersResponse);

      // Get detailed info for each computer
      for (const computer of computers) {
        try {
          const detailResponse = await this.apiGet(config, `/api/computer/${computer.ID}`);
          const detail = this.parseComputerDetail(detailResponse, computer.ID);

          // Detect OS type from the OS string
          const osType = detectOSType(detail.OS, undefined, {});

          hosts.push({
            id: generateId(),
            providerId: provider.id,
            providerHostId: computer.ID,
            name: detail.ComputerName || detail.DNSName || `Computer-${computer.ID}`,
            hostname: detail.DNSName,
            privateIp: detail.IPAddress,
            osType,
            osName: detail.OS,
            state: this.getComputerState(computer.LastReportTime),
            metadata: {
              bigfixId: computer.ID,
              agentType: detail.AgentType || 'Unknown',
              deviceType: detail.DeviceType || 'Unknown',
              lastUser: detail.UserName || '',
              locked: detail.Locked || 'No',
            },
            tags: detail.properties || {},
            discoveredAt: new Date(),
            lastSeenAt: new Date(computer.LastReportTime || Date.now()),
            imported: false,
          });
        } catch (err) {
          // Skip computers we can't get details for
          console.error(`Failed to get details for computer ${computer.ID}:`, err);
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

  private async apiGet(config: BigFixConfig, path: string): Promise<string> {
    return new Promise((resolve, reject) => {
      // Create Basic Auth header
      const auth = Buffer.from(`${config.username}:${config.password || ''}`).toString('base64');

      const options = {
        hostname: config.host,
        port: config.port || 52311,
        path: path,
        method: 'GET',
        headers: {
          'Authorization': `Basic ${auth}`,
          'Accept': 'application/json, application/xml, text/xml',
        },
        rejectUnauthorized: !config.ignoreCertErrors,
      };

      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          if (res.statusCode === 200) {
            resolve(data);
          } else if (res.statusCode === 401) {
            reject(new Error('Authentication failed. Check your AD credentials.'));
          } else if (res.statusCode === 403) {
            reject(new Error('Access denied. User may not have permission to access BigFix API.'));
          } else {
            reject(new Error(`BigFix API error: ${res.statusCode} ${res.statusMessage}`));
          }
        });
      });

      req.on('error', (err) => {
        if ((err as any).code === 'ECONNREFUSED') {
          reject(new Error(`Connection refused. Check hostname (${config.host}) and port (${config.port}).`));
        } else if ((err as any).code === 'CERT_HAS_EXPIRED' || (err as any).code === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE') {
          reject(new Error('SSL certificate error. Try enabling "Ignore Certificate Errors".'));
        } else {
          reject(err);
        }
      });

      req.setTimeout(30000, () => {
        req.destroy();
        reject(new Error('Request timed out'));
      });

      req.end();
    });
  }

  private parseComputerList(response: string): BigFixComputer[] {
    const computers: BigFixComputer[] = [];

    try {
      // Try JSON first
      const json = JSON.parse(response);
      if (Array.isArray(json)) {
        return json.map(c => ({
          ID: String(c.ID || c.id || c.ComputerID),
          LastReportTime: c.LastReportTime || c.lastReportTime || new Date().toISOString(),
          Resource: c.Resource || c.resource || '',
        }));
      }
      if (json.computers || json.Computer) {
        const list = json.computers || json.Computer;
        return (Array.isArray(list) ? list : [list]).map((c: any) => ({
          ID: String(c.ID || c.id || c.ComputerID),
          LastReportTime: c.LastReportTime || c.lastReportTime || new Date().toISOString(),
          Resource: c.Resource || c.resource || '',
        }));
      }
    } catch {
      // Parse as XML
    }

    // Parse XML response - BigFix returns BESAPI XML format
    // <BESAPI><Computer Resource="..."><ID>123</ID><LastReportTime>...</LastReportTime></Computer>...</BESAPI>
    const computerMatches = response.matchAll(/<Computer[^>]*Resource="([^"]*)"[^>]*>[\s\S]*?<ID>(\d+)<\/ID>[\s\S]*?(?:<LastReportTime>([^<]*)<\/LastReportTime>)?[\s\S]*?<\/Computer>/gi);

    for (const match of computerMatches) {
      computers.push({
        ID: match[2],
        LastReportTime: match[3] || new Date().toISOString(),
        Resource: match[1],
      });
    }

    // Alternative XML format without Resource attribute
    if (computers.length === 0) {
      const simpleMatches = response.matchAll(/<Computer>[\s\S]*?<ID>(\d+)<\/ID>[\s\S]*?(?:<LastReportTime>([^<]*)<\/LastReportTime>)?[\s\S]*?<\/Computer>/gi);
      for (const match of simpleMatches) {
        computers.push({
          ID: match[1],
          LastReportTime: match[2] || new Date().toISOString(),
          Resource: '',
        });
      }
    }

    return computers;
  }

  private parseComputerDetail(response: string, fallbackId: string): BigFixComputerDetail {
    const detail: BigFixComputerDetail = {
      ID: fallbackId,
      properties: {},
    };

    try {
      // Try JSON first
      const json = JSON.parse(response);
      return {
        ID: String(json.ID || json.id || fallbackId),
        ComputerName: json.ComputerName || json.computerName || json.Name || json.name,
        DNSName: json.DNSName || json.dnsName || json.FQDN || json.fqdn,
        IPAddress: json.IPAddress || json.ipAddress || json.IP || json.ip,
        OS: json.OS || json.os || json.OperatingSystem || json.operatingSystem,
        AgentType: json.AgentType || json.agentType,
        Locked: json.Locked || json.locked,
        UserName: json.UserName || json.userName || json.LastUser || json.lastUser,
        DeviceType: json.DeviceType || json.deviceType,
        properties: json.properties || {},
      };
    } catch {
      // Parse as XML
    }

    // Parse common fields from XML
    // BigFix returns various property formats
    const extractValue = (name: string): string | undefined => {
      // Try property format: <Property Name="...">value</Property>
      const propMatch = response.match(new RegExp(`<Property[^>]*Name="${name}"[^>]*>([^<]*)</Property>`, 'i'));
      if (propMatch) return propMatch[1];

      // Try direct element format: <Name>value</Name>
      const elemMatch = response.match(new RegExp(`<${name}>([^<]*)</${name}>`, 'i'));
      if (elemMatch) return elemMatch[1];

      return undefined;
    };

    detail.ComputerName = extractValue('Computer Name') || extractValue('ComputerName') || extractValue('Name');
    detail.DNSName = extractValue('DNS Name') || extractValue('DNSName') || extractValue('FQDN');
    detail.IPAddress = extractValue('IP Address') || extractValue('IPAddress') || extractValue('IP');
    detail.OS = extractValue('OS') || extractValue('Operating System') || extractValue('OperatingSystem');
    detail.AgentType = extractValue('Agent Type') || extractValue('AgentType');
    detail.Locked = extractValue('Locked') || extractValue('locked');
    detail.UserName = extractValue('User Name') || extractValue('UserName') || extractValue('Last User');
    detail.DeviceType = extractValue('Device Type') || extractValue('DeviceType');

    // Extract all properties for tags
    const propMatches = response.matchAll(/<Property[^>]*Name="([^"]*)"[^>]*>([^<]*)<\/Property>/gi);
    for (const match of propMatches) {
      const key = match[1].replace(/\s+/g, '_').toLowerCase();
      detail.properties![key] = match[2];
    }

    return detail;
  }

  private getComputerState(lastReportTime: string): 'running' | 'stopped' | 'unknown' {
    if (!lastReportTime) return 'unknown';

    try {
      const lastReport = new Date(lastReportTime);
      const now = new Date();
      const hoursSinceReport = (now.getTime() - lastReport.getTime()) / (1000 * 60 * 60);

      // Consider a computer "running" if it reported within the last 24 hours
      if (hoursSinceReport < 24) return 'running';
      // "stopped" if it hasn't reported in over 24 hours
      return 'stopped';
    } catch {
      return 'unknown';
    }
  }
}
