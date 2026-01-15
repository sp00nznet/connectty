/**
 * Admin routes - System administration and user management
 */

import { Router } from 'express';
import * as bcrypt from 'bcrypt';
import type { DatabaseService } from '../services/database';
import { adminMiddleware } from '../middleware/auth';

export function createAdminRoutes(db: DatabaseService): Router {
  const router = Router();

  // Apply admin middleware to all routes
  router.use(adminMiddleware);

  // Get system statistics
  router.get('/stats', async (req, res) => {
    try {
      const stats = await db.getSystemStats();
      res.json({
        success: true,
        data: stats,
      });
    } catch (err) {
      res.status(500).json({
        success: false,
        error: (err as Error).message,
      });
    }
  });

  // Get all users
  router.get('/users', async (req, res) => {
    try {
      const users = await db.getAllUsers();
      res.json({
        success: true,
        data: users,
      });
    } catch (err) {
      res.status(500).json({
        success: false,
        error: (err as Error).message,
      });
    }
  });

  // Update user admin status
  router.put('/users/:id/admin', async (req, res) => {
    try {
      const { isAdmin } = req.body;

      if (typeof isAdmin !== 'boolean') {
        res.status(400).json({
          success: false,
          error: 'isAdmin must be a boolean',
        });
        return;
      }

      const user = await db.updateUserAdmin(req.params.id, isAdmin);

      if (!user) {
        res.status(404).json({
          success: false,
          error: 'User not found',
        });
        return;
      }

      res.json({
        success: true,
        data: user,
        message: `User ${isAdmin ? 'promoted to' : 'demoted from'} admin`,
      });
    } catch (err) {
      res.status(500).json({
        success: false,
        error: (err as Error).message,
      });
    }
  });

  // Delete user
  router.delete('/users/:id', async (req, res) => {
    try {
      // Prevent deleting yourself
      if (req.params.id === req.userId) {
        res.status(400).json({
          success: false,
          error: 'Cannot delete your own account',
        });
        return;
      }

      const success = await db.deleteUser(req.params.id);

      if (!success) {
        res.status(404).json({
          success: false,
          error: 'User not found',
        });
        return;
      }

      res.json({
        success: true,
        message: 'User deleted successfully',
      });
    } catch (err) {
      res.status(500).json({
        success: false,
        error: (err as Error).message,
      });
    }
  });

  // Get all connections (from all users)
  router.get('/connections', async (req, res) => {
    try {
      const result = await db.pool.query(
        'SELECT c.*, u.username as owner_username FROM connections c JOIN users u ON c.user_id = u.id ORDER BY c.created_at DESC'
      );
      res.json({
        success: true,
        data: result.rows,
      });
    } catch (err) {
      res.status(500).json({
        success: false,
        error: (err as Error).message,
      });
    }
  });

  // Get all credentials (from all users)
  router.get('/credentials', async (req, res) => {
    try {
      const result = await db.pool.query(
        'SELECT c.id, c.name, c.type, c.username, c.is_shared, c.created_at, c.updated_at, u.username as owner_username FROM credentials c JOIN users u ON c.user_id = u.id ORDER BY c.created_at DESC'
      );
      res.json({
        success: true,
        data: result.rows,
      });
    } catch (err) {
      res.status(500).json({
        success: false,
        error: (err as Error).message,
      });
    }
  });

  // Get all providers (from all users)
  router.get('/providers', async (req, res) => {
    try {
      const result = await db.pool.query(
        'SELECT p.id, p.name, p.type, p.is_shared, p.auto_discover, p.discover_interval, p.last_discovery_at, p.created_at, p.updated_at, u.username as owner_username FROM providers p JOIN users u ON p.user_id = u.id ORDER BY p.created_at DESC'
      );
      res.json({
        success: true,
        data: result.rows,
      });
    } catch (err) {
      res.status(500).json({
        success: false,
        error: (err as Error).message,
      });
    }
  });

  // Get session logs (with filters)
  router.get('/logs', async (req, res) => {
    try {
      const { userId, connectionId, sessionId, sessionType, startDate, endDate, limit } = req.query;

      const filters: any = {};
      if (userId) filters.userId = userId as string;
      if (connectionId) filters.connectionId = connectionId as string;
      if (sessionId) filters.sessionId = sessionId as string;
      if (sessionType) filters.sessionType = sessionType as string;
      if (startDate) filters.startDate = new Date(startDate as string);
      if (endDate) filters.endDate = new Date(endDate as string);
      if (limit) filters.limit = parseInt(limit as string, 10);

      const logs = await db.getSessionLogs(filters);
      res.json({
        success: true,
        data: logs,
      });
    } catch (err) {
      res.status(500).json({
        success: false,
        error: (err as Error).message,
      });
    }
  });

  // Delete old session logs
  router.delete('/logs', async (req, res) => {
    try {
      const { sessionId, olderThan } = req.body;

      const filters: any = {};
      if (sessionId) filters.sessionId = sessionId as string;
      if (olderThan) filters.olderThan = new Date(olderThan as string);

      const deleted = await db.deleteSessionLogs(filters);
      res.json({
        success: true,
        message: `Deleted ${deleted} log entries`,
        data: { deleted },
      });
    } catch (err) {
      res.status(500).json({
        success: false,
        error: (err as Error).message,
      });
    }
  });

  // Create admin user (for initial setup or adding admins without AD)
  router.post('/users', async (req, res) => {
    try {
      const { username, password, displayName, email, isAdmin } = req.body;

      if (!username || !password || !displayName) {
        res.status(400).json({
          success: false,
          error: 'username, password, and displayName are required',
        });
        return;
      }

      // Check if user already exists
      const existing = await db.getUserByUsername(username);
      if (existing) {
        res.status(400).json({
          success: false,
          error: 'User already exists',
        });
        return;
      }

      // Hash password
      const passwordHash = await bcrypt.hash(password, 12);

      const user = await db.createUser({
        username,
        passwordHash,
        displayName,
        email,
        isAdmin: isAdmin || false,
        roles: isAdmin ? ['admin'] : ['user'],
      });

      res.status(201).json({
        success: true,
        data: user,
        message: 'User created successfully',
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
