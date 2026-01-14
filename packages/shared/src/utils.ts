/**
 * Shared utilities for connectty
 */

import { v4 as uuidv4 } from 'uuid';
import type { ServerConnection, Credential, ConnectionGroup, SyncData } from './types';

export function generateId(): string {
  return uuidv4();
}

export function createConnection(
  partial: Partial<ServerConnection> & Pick<ServerConnection, 'name' | 'hostname'>
): ServerConnection {
  const now = new Date();
  return {
    id: generateId(),
    port: 22,
    tags: [],
    createdAt: now,
    updatedAt: now,
    ...partial,
  };
}

export function createCredential(
  partial: Partial<Credential> & Pick<Credential, 'name' | 'type' | 'username'>
): Credential {
  const now = new Date();
  return {
    id: generateId(),
    usedBy: [],
    createdAt: now,
    updatedAt: now,
    ...partial,
  };
}

export function createGroup(
  partial: Partial<ConnectionGroup> & Pick<ConnectionGroup, 'name'>
): ConnectionGroup {
  const now = new Date();
  return {
    id: generateId(),
    createdAt: now,
    updatedAt: now,
    ...partial,
  };
}

export function createSyncData(
  connections: ServerConnection[],
  credentials: Credential[],
  groups: ConnectionGroup[],
  exportedBy: string
): SyncData {
  return {
    version: '1.0.0',
    exportedAt: new Date(),
    exportedBy,
    connections,
    credentials,
    groups,
  };
}

export function validateHostname(hostname: string): boolean {
  // Basic hostname validation
  const hostnameRegex = /^[a-zA-Z0-9]([a-zA-Z0-9\-\.]*[a-zA-Z0-9])?$/;
  return hostnameRegex.test(hostname) && hostname.length <= 253;
}

export function validatePort(port: number): boolean {
  return Number.isInteger(port) && port > 0 && port <= 65535;
}

export function parseSSHConfig(configContent: string): Partial<ServerConnection>[] {
  const connections: Partial<ServerConnection>[] = [];
  const lines = configContent.split('\n');
  let current: Partial<ServerConnection> | null = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const match = trimmed.match(/^(\w+)\s+(.+)$/);
    if (!match) continue;

    const [, key, value] = match;

    if (key.toLowerCase() === 'host') {
      if (current) {
        connections.push(current);
      }
      current = { name: value, tags: [] };
    } else if (current) {
      switch (key.toLowerCase()) {
        case 'hostname':
          current.hostname = value;
          break;
        case 'port':
          current.port = parseInt(value, 10);
          break;
        case 'user':
          current.username = value;
          break;
      }
    }
  }

  if (current) {
    connections.push(current);
  }

  return connections;
}

export function parsePuttySession(sessionData: Record<string, unknown>): Partial<ServerConnection> {
  return {
    hostname: sessionData['HostName'] as string,
    port: (sessionData['PortNumber'] as number) || 22,
    username: sessionData['UserName'] as string,
    tags: [],
  };
}

export function exportToCSV(connections: ServerConnection[]): string {
  const headers = ['name', 'hostname', 'port', 'username', 'tags', 'group', 'description'];
  const rows = connections.map((conn) => [
    conn.name,
    conn.hostname,
    conn.port.toString(),
    conn.username || '',
    conn.tags.join(';'),
    conn.group || '',
    conn.description || '',
  ]);

  return [
    headers.join(','),
    ...rows.map((row) => row.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(',')),
  ].join('\n');
}

export function parseCSV(csvContent: string): Partial<ServerConnection>[] {
  const lines = csvContent.split('\n').filter((line) => line.trim());
  if (lines.length < 2) return [];

  const headers = lines[0].split(',').map((h) => h.trim().toLowerCase().replace(/"/g, ''));
  const connections: Partial<ServerConnection>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    const conn: Partial<ServerConnection> = { tags: [] };

    headers.forEach((header, index) => {
      const value = values[index]?.replace(/^"|"$/g, '') || '';
      switch (header) {
        case 'name':
          conn.name = value;
          break;
        case 'hostname':
        case 'host':
          conn.hostname = value;
          break;
        case 'port':
          conn.port = parseInt(value, 10) || 22;
          break;
        case 'username':
        case 'user':
          conn.username = value;
          break;
        case 'tags':
          conn.tags = value.split(';').filter(Boolean);
          break;
        case 'group':
          conn.group = value;
          break;
        case 'description':
          conn.description = value;
          break;
      }
    });

    if (conn.name && conn.hostname) {
      connections.push(conn);
    }
  }

  return connections;
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current);
  return result;
}

export function sanitizeForFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 50);
}
