/**
 * Sync routes for backup and export
 */

import { Router } from 'express';
import { createSyncData, exportToCSV } from '@connectty/shared';
import type { DatabaseService } from '../services/database';
import type { SyncData, ImportOptions } from '@connectty/shared';

export function createSyncRoutes(db: DatabaseService): Router {
  const router = Router();

  // Push data to server (from desktop client)
  router.post('/push', async (req, res) => {
    try {
      const data = req.body as SyncData;

      if (!data.connections && !data.credentials && !data.groups) {
        res.status(400).json({
          success: false,
          error: 'No data to sync',
        });
        return;
      }

      const result = { connections: 0, credentials: 0, groups: 0 };

      // Import groups first
      const groupIdMap = new Map<string, string>();
      for (const group of data.groups || []) {
        const newGroup = await db.createGroup(req.userId!, {
          name: group.name,
          description: group.description,
          parentId: group.parentId ? groupIdMap.get(group.parentId) : undefined,
          color: group.color,
        });
        groupIdMap.set(group.id, newGroup.id);
        result.groups++;
      }

      // Import credentials
      const credentialIdMap = new Map<string, string>();
      for (const cred of data.credentials || []) {
        const newCred = await db.createCredential(req.userId!, {
          name: cred.name,
          type: cred.type,
          username: cred.username,
          secret: cred.secret,
          privateKey: cred.privateKey,
          passphrase: cred.passphrase,
        });
        credentialIdMap.set(cred.id, newCred.id);
        result.credentials++;
      }

      // Import connections
      for (const conn of data.connections || []) {
        await db.createConnection(req.userId!, {
          name: conn.name,
          hostname: conn.hostname,
          port: conn.port,
          username: conn.username,
          credentialId: conn.credentialId ? credentialIdMap.get(conn.credentialId) : undefined,
          tags: conn.tags,
          group: conn.group ? groupIdMap.get(conn.group) : undefined,
          description: conn.description,
        });
        result.connections++;
      }

      res.json({
        success: true,
        data: result,
        message: `Synced ${result.connections} connections, ${result.credentials} credentials, ${result.groups} groups`,
      });
    } catch (err) {
      res.status(500).json({
        success: false,
        error: (err as Error).message,
      });
    }
  });

  // Pull data from server (to desktop client)
  router.get('/pull', async (req, res) => {
    try {
      const data = await db.exportAll(req.userId!);

      const syncData = createSyncData(
        data.connections,
        data.credentials,
        data.groups,
        req.user!.username
      );

      res.json(syncData);
    } catch (err) {
      res.status(500).json({
        success: false,
        error: (err as Error).message,
      });
    }
  });

  // Export data in various formats
  router.get('/export', async (req, res) => {
    try {
      const format = (req.query.format as string) || 'json';
      const includeCredentials = req.query.includeCredentials === 'true';

      const data = await db.exportAll(req.userId!);

      if (format === 'csv') {
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename="connections.csv"');
        res.send(exportToCSV(data.connections));
        return;
      }

      // JSON export
      const syncData = createSyncData(
        data.connections,
        includeCredentials ? data.credentials : [],
        data.groups,
        req.user!.username
      );

      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', 'attachment; filename="connectty-export.json"');
      res.json(syncData);
    } catch (err) {
      res.status(500).json({
        success: false,
        error: (err as Error).message,
      });
    }
  });

  // Import data from JSON or CSV
  router.post('/import', async (req, res) => {
    try {
      const { format, data, options } = req.body as {
        format: 'json' | 'csv' | 'ssh-config' | 'putty';
        data: string;
        options?: ImportOptions;
      };

      if (!data) {
        res.status(400).json({
          success: false,
          error: 'No data provided',
        });
        return;
      }

      const result = { connections: 0, credentials: 0, groups: 0, errors: [] as string[] };

      if (format === 'json') {
        // Parse JSON data
        let syncData: SyncData;
        try {
          syncData = JSON.parse(data);
        } catch {
          res.status(400).json({
            success: false,
            error: 'Invalid JSON data',
          });
          return;
        }

        // Import groups first
        const groupIdMap = new Map<string, string>();
        for (const group of syncData.groups || []) {
          try {
            const newGroup = await db.createGroup(req.userId!, {
              name: group.name,
              description: group.description,
              parentId: group.parentId ? groupIdMap.get(group.parentId) : undefined,
              color: group.color,
            });
            groupIdMap.set(group.id, newGroup.id);
            result.groups++;
          } catch (err) {
            result.errors.push(`Failed to import group ${group.name}: ${(err as Error).message}`);
          }
        }

        // Import credentials
        const credentialIdMap = new Map<string, string>();
        for (const cred of syncData.credentials || []) {
          try {
            const newCred = await db.createCredential(req.userId!, {
              name: cred.name,
              type: cred.type,
              username: cred.username,
              secret: cred.secret,
              privateKey: cred.privateKey,
              passphrase: cred.passphrase,
            });
            credentialIdMap.set(cred.id, newCred.id);
            result.credentials++;
          } catch (err) {
            result.errors.push(`Failed to import credential ${cred.name}: ${(err as Error).message}`);
          }
        }

        // Import connections
        for (const conn of syncData.connections || []) {
          try {
            await db.createConnection(req.userId!, {
              name: conn.name,
              hostname: conn.hostname,
              port: conn.port || 22,
              username: conn.username,
              credentialId: conn.credentialId ? credentialIdMap.get(conn.credentialId) : undefined,
              tags: conn.tags,
              group: conn.group ? groupIdMap.get(conn.group) : undefined,
              description: conn.description,
            });
            result.connections++;
          } catch (err) {
            result.errors.push(`Failed to import connection ${conn.name}: ${(err as Error).message}`);
          }
        }
      } else if (format === 'csv') {
        // Parse CSV data
        const lines = data.split('\n').filter(line => line.trim());
        if (lines.length < 2) {
          res.status(400).json({
            success: false,
            error: 'CSV must have header row and at least one data row',
          });
          return;
        }

        const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
        const nameIdx = headers.indexOf('name');
        const hostnameIdx = headers.indexOf('hostname') !== -1 ? headers.indexOf('hostname') : headers.indexOf('host');
        const portIdx = headers.indexOf('port');
        const usernameIdx = headers.indexOf('username') !== -1 ? headers.indexOf('username') : headers.indexOf('user');
        const tagsIdx = headers.indexOf('tags');
        const descriptionIdx = headers.indexOf('description');

        if (hostnameIdx === -1) {
          res.status(400).json({
            success: false,
            error: 'CSV must have a hostname or host column',
          });
          return;
        }

        for (let i = 1; i < lines.length; i++) {
          const values = parseCSVLine(lines[i]);
          const hostname = values[hostnameIdx]?.trim();

          if (!hostname) continue;

          try {
            await db.createConnection(req.userId!, {
              name: nameIdx !== -1 ? values[nameIdx]?.trim() || hostname : hostname,
              hostname,
              port: portIdx !== -1 ? parseInt(values[portIdx]) || 22 : 22,
              username: usernameIdx !== -1 ? values[usernameIdx]?.trim() : undefined,
              tags: tagsIdx !== -1 ? values[tagsIdx]?.split(';').map(t => t.trim()).filter(Boolean) || [] : [],
              description: descriptionIdx !== -1 ? values[descriptionIdx]?.trim() : undefined,
            });
            result.connections++;
          } catch (err) {
            result.errors.push(`Failed to import line ${i + 1}: ${(err as Error).message}`);
          }
        }
      } else if (format === 'ssh-config') {
        // Parse SSH config format
        const blocks = data.split(/\n(?=Host\s)/i);

        for (const block of blocks) {
          const lines = block.split('\n').map(l => l.trim()).filter(Boolean);
          if (lines.length === 0) continue;

          const hostMatch = lines[0].match(/^Host\s+(.+)$/i);
          if (!hostMatch) continue;

          const name = hostMatch[1].trim();
          if (name === '*') continue; // Skip wildcard entries

          let hostname = name;
          let port = 22;
          let username: string | undefined;

          for (const line of lines.slice(1)) {
            const [key, ...valueParts] = line.split(/\s+/);
            const value = valueParts.join(' ');

            switch (key.toLowerCase()) {
              case 'hostname':
                hostname = value;
                break;
              case 'port':
                port = parseInt(value) || 22;
                break;
              case 'user':
                username = value;
                break;
            }
          }

          try {
            await db.createConnection(req.userId!, {
              name,
              hostname,
              port,
              username,
              tags: ['ssh-config-import'],
            });
            result.connections++;
          } catch (err) {
            result.errors.push(`Failed to import ${name}: ${(err as Error).message}`);
          }
        }
      } else {
        res.status(400).json({
          success: false,
          error: `Unsupported format: ${format}`,
        });
        return;
      }

      res.json({
        success: true,
        data: result,
        message: `Imported ${result.connections} connections, ${result.credentials} credentials, ${result.groups} groups`,
      });
    } catch (err) {
      res.status(500).json({
        success: false,
        error: (err as Error).message,
      });
    }
  });

  return router;
}

// Helper function to parse CSV line with proper quote handling
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
