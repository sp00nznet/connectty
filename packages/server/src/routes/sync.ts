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

  return router;
}
