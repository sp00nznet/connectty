/**
 * Connection group routes
 */

import { Router } from 'express';
import type { DatabaseService } from '../services/database';

export function createGroupRoutes(db: DatabaseService): Router {
  const router = Router();

  // List groups
  router.get('/', async (req, res) => {
    try {
      const groups = await db.getGroups(req.userId!);
      res.json({
        success: true,
        data: groups,
      });
    } catch (err) {
      res.status(500).json({
        success: false,
        error: (err as Error).message,
      });
    }
  });

  // Create group
  router.post('/', async (req, res) => {
    try {
      const { name, description, parentId, color } = req.body;

      if (!name) {
        res.status(400).json({
          success: false,
          error: 'Name is required',
        });
        return;
      }

      const group = await db.createGroup(req.userId!, {
        name,
        description,
        parentId,
        color,
      });

      res.status(201).json({
        success: true,
        data: group,
      });
    } catch (err) {
      res.status(500).json({
        success: false,
        error: (err as Error).message,
      });
    }
  });

  // Update group
  router.put('/:id', async (req, res) => {
    try {
      const group = await db.updateGroup(req.userId!, req.params.id, req.body);

      if (!group) {
        res.status(404).json({
          success: false,
          error: 'Group not found',
        });
        return;
      }

      res.json({
        success: true,
        data: group,
      });
    } catch (err) {
      res.status(500).json({
        success: false,
        error: (err as Error).message,
      });
    }
  });

  // Delete group
  router.delete('/:id', async (req, res) => {
    try {
      const deleted = await db.deleteGroup(req.userId!, req.params.id);

      if (!deleted) {
        res.status(404).json({
          success: false,
          error: 'Group not found',
        });
        return;
      }

      res.json({
        success: true,
        message: 'Group deleted',
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
