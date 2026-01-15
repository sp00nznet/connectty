/**
 * Sharing routes - Manage shared resources between users
 */

import { Router } from 'express';
import type { DatabaseService } from '../services/database';

export function createSharingRoutes(db: DatabaseService): Router {
  const router = Router();

  // Toggle sharing for a resource
  router.post('/:type/:id/share', async (req, res) => {
    try {
      const { type, id } = req.params;
      const { isShared } = req.body;

      if (!['connection', 'credential', 'provider', 'command'].includes(type)) {
        res.status(400).json({
          success: false,
          error: 'Invalid resource type. Must be one of: connection, credential, provider, command',
        });
        return;
      }

      if (typeof isShared !== 'boolean') {
        res.status(400).json({
          success: false,
          error: 'isShared must be a boolean',
        });
        return;
      }

      const success = await db.toggleSharing(
        type as 'connection' | 'credential' | 'provider' | 'command',
        id,
        req.userId!,
        isShared
      );

      if (!success) {
        res.status(404).json({
          success: false,
          error: 'Resource not found or you do not have permission to modify it',
        });
        return;
      }

      res.json({
        success: true,
        message: `Resource ${isShared ? 'shared' : 'unshared'} successfully`,
      });
    } catch (err) {
      res.status(500).json({
        success: false,
        error: (err as Error).message,
      });
    }
  });

  // Get all shared connections
  router.get('/connections', async (req, res) => {
    try {
      const connections = await db.getSharedConnections();
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

  // Get all shared credentials
  router.get('/credentials', async (req, res) => {
    try {
      const credentials = await db.getSharedCredentials();
      res.json({
        success: true,
        data: credentials,
      });
    } catch (err) {
      res.status(500).json({
        success: false,
        error: (err as Error).message,
      });
    }
  });

  // Get all shared providers
  router.get('/providers', async (req, res) => {
    try {
      const providers = await db.getSharedProviders();
      res.json({
        success: true,
        data: providers,
      });
    } catch (err) {
      res.status(500).json({
        success: false,
        error: (err as Error).message,
      });
    }
  });

  // Get all shared commands
  router.get('/commands', async (req, res) => {
    try {
      const commands = await db.getSharedCommands();
      res.json({
        success: true,
        data: commands,
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
