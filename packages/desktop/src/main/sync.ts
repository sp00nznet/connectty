/**
 * Sync service for backup and export functionality
 */

import { createSyncData, parseSSHConfig, parseCSV, exportToCSV } from '@connectty/shared';
import type { ImportOptions, ExportOptions, SyncData, ServerConnection, Credential, ConnectionGroup } from '@connectty/shared';
import type { DatabaseService } from './database';
import dns from 'dns/promises';
import net from 'net';

/**
 * Resolve a hostname to an IP address.
 * Returns the original value if it's already an IP or if resolution fails.
 */
async function resolveHostnameToIP(hostname: string): Promise<string> {
  // If it's already an IP address, return it as-is
  if (net.isIP(hostname)) {
    return hostname;
  }

  try {
    const result = await dns.lookup(hostname);
    return result.address;
  } catch {
    // If DNS resolution fails, return the original hostname
    return hostname;
  }
}

export class SyncService {
  private db: DatabaseService;

  constructor(db: DatabaseService) {
    this.db = db;
  }

  async importData(content: string, options: ImportOptions): Promise<{ connections: number; credentials: number; groups: number }> {
    let imported = { connections: 0, credentials: 0, groups: 0 };

    switch (options.format) {
      case 'json': {
        const data = JSON.parse(content) as SyncData;
        imported = await this.importSyncData(data, options);
        break;
      }
      case 'csv': {
        const connections = parseCSV(content);
        for (const conn of connections) {
          if (conn.name && conn.hostname) {
            const resolvedIP = await resolveHostnameToIP(conn.hostname);
            this.db.createConnection({
              name: conn.name,
              hostname: resolvedIP,
              port: conn.port || 22,
              connectionType: 'ssh',
              username: conn.username,
              tags: conn.tags || [],
              group: conn.group,
              description: conn.description,
            });
            imported.connections++;
          }
        }
        break;
      }
      case 'ssh_config': {
        const connections = parseSSHConfig(content);
        for (const conn of connections) {
          if (conn.name && conn.hostname) {
            const resolvedIP = await resolveHostnameToIP(conn.hostname);
            this.db.createConnection({
              name: conn.name,
              hostname: resolvedIP,
              port: conn.port || 22,
              connectionType: 'ssh',
              username: conn.username,
              tags: conn.tags || [],
            });
            imported.connections++;
          }
        }
        break;
      }
      case 'putty': {
        // PuTTY session import would require registry reading on Windows
        // For now, support JSON export from PuTTY session manager tools
        try {
          const sessions = JSON.parse(content) as Array<{
            name: string;
            hostname: string;
            port?: number;
            username?: string;
          }>;
          for (const session of sessions) {
            const resolvedIP = await resolveHostnameToIP(session.hostname);
            this.db.createConnection({
              name: session.name,
              hostname: resolvedIP,
              port: session.port || 22,
              connectionType: 'ssh',
              username: session.username,
              tags: ['imported', 'putty'],
            });
            imported.connections++;
          }
        } catch {
          // Invalid format
        }
        break;
      }
    }

    return imported;
  }

  private async importSyncData(
    data: SyncData,
    options: ImportOptions
  ): Promise<{ connections: number; credentials: number; groups: number }> {
    const imported = { connections: 0, credentials: 0, groups: 0 };

    // Import groups first
    const groupIdMap = new Map<string, string>();
    for (const group of data.groups || []) {
      const newGroup = this.db.createGroup({
        name: group.name,
        description: group.description,
        parentId: group.parentId ? groupIdMap.get(group.parentId) : undefined,
        color: group.color,
      });
      groupIdMap.set(group.id, newGroup.id);
      imported.groups++;
    }

    // Import credentials if allowed
    const credentialIdMap = new Map<string, string>();
    if (options.mergeCredentials) {
      for (const cred of data.credentials || []) {
        const newCred = this.db.createCredential({
          name: cred.name,
          type: cred.type,
          username: cred.username,
          secret: cred.secret,
          privateKey: cred.privateKey,
          passphrase: cred.passphrase,
        });
        credentialIdMap.set(cred.id, newCred.id);
        imported.credentials++;
      }
    }

    // Import connections
    for (const conn of data.connections || []) {
      const resolvedIP = await resolveHostnameToIP(conn.hostname);
      this.db.createConnection({
        name: conn.name,
        hostname: resolvedIP,
        port: conn.port,
        connectionType: conn.connectionType || 'ssh',
        osType: conn.osType,
        username: conn.username,
        credentialId: conn.credentialId ? credentialIdMap.get(conn.credentialId) : undefined,
        tags: conn.tags,
        group: conn.group ? groupIdMap.get(conn.group) : undefined,
        description: conn.description,
      });
      imported.connections++;
    }

    return imported;
  }

  exportData(options: ExportOptions): string {
    const { connections, credentials, groups } = this.db.exportAll();

    if (options.format === 'csv') {
      return exportToCSV(connections);
    }

    // JSON export
    const exportData: SyncData = {
      version: '1.0.0',
      exportedAt: new Date(),
      exportedBy: 'desktop-client',
      connections,
      groups,
      credentials: options.includeCredentials ? this.sanitizeCredentials(credentials, options.encryptSecrets) : [],
    };

    return JSON.stringify(exportData, null, 2);
  }

  private sanitizeCredentials(credentials: Credential[], encrypt: boolean): Credential[] {
    if (encrypt) {
      // Return credentials with secrets intact (they're encrypted at rest)
      return credentials;
    }

    // Remove secrets for non-encrypted export
    return credentials.map((cred) => ({
      ...cred,
      secret: undefined,
      privateKey: undefined,
      passphrase: undefined,
    }));
  }

  async pushToServer(serverUrl: string, token: string): Promise<boolean> {
    const data = this.exportData({ format: 'json', includeCredentials: true, encryptSecrets: true });

    const response = await fetch(`${serverUrl}/api/sync/push`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: data,
    });

    return response.ok;
  }

  async pullFromServer(serverUrl: string, token: string): Promise<{ connections: number; credentials: number; groups: number }> {
    const response = await fetch(`${serverUrl}/api/sync/pull`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      throw new Error('Failed to pull from server');
    }

    const data = (await response.json()) as SyncData;
    return this.importSyncData(data, { format: 'json', overwrite: false, mergeCredentials: true });
  }
}
