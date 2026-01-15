/**
 * Connection routes
 */

import { Router } from 'express';
import type { DatabaseService } from '../services/database';

export function createConnectionRoutes(db: DatabaseService): Router {
  const router = Router();

  // List connections (optionally including shared)
  router.get('/', async (req, res) => {
    try {
      const includeShared = req.query.includeShared === 'true';
      const connections = includeShared
        ? await db.getAllConnectionsWithShared(req.userId!)
        : await db.getConnections(req.userId!);
      res.json({
        success: true,
        data: connections,
      });
    } catch (err) {
      res.status(500).json({
        success: false,
        error: (err as Error).message,
      });
    }
  });

  // Get single connection
  router.get('/:id', async (req, res) => {
    try {
      const connection = await db.getConnection(req.userId!, req.params.id);

      if (!connection) {
        res.status(404).json({
          success: false,
          error: 'Connection not found',
        });
        return;
      }

      res.json({
        success: true,
        data: connection,
      });
    } catch (err) {
      res.status(500).json({
        success: false,
        error: (err as Error).message,
      });
    }
  });

  // Create connection
  router.post('/', async (req, res) => {
    try {
      const { name, hostname, port, username, credentialId, tags, group, description, connectionType } = req.body;

      if (!name || !hostname) {
        res.status(400).json({
          success: false,
          error: 'Name and hostname are required',
        });
        return;
      }

      const connection = await db.createConnection(req.userId!, {
        name,
        hostname,
        port: port || 22,
        connectionType: connectionType || 'ssh',
        username,
        credentialId,
        tags: tags || [],
        group,
        description,
      });

      res.status(201).json({
        success: true,
        data: connection,
      });
    } catch (err) {
      res.status(500).json({
        success: false,
        error: (err as Error).message,
      });
    }
  });

  // Update connection
  router.put('/:id', async (req, res) => {
    try {
      const connection = await db.updateConnection(req.userId!, req.params.id, req.body);

      if (!connection) {
        res.status(404).json({
          success: false,
          error: 'Connection not found',
        });
        return;
      }

      res.json({
        success: true,
        data: connection,
      });
    } catch (err) {
      res.status(500).json({
        success: false,
        error: (err as Error).message,
      });
    }
  });

  // Delete connection
  router.delete('/:id', async (req, res) => {
    try {
      const deleted = await db.deleteConnection(req.userId!, req.params.id);

      if (!deleted) {
        res.status(404).json({
          success: false,
          error: 'Connection not found',
        });
        return;
      }

      res.json({
        success: true,
        message: 'Connection deleted',
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
