/**
 * Authentication routes
 */

import { Router } from 'express';
import type { AuthService } from '../services/auth';
import type { AuthRequest } from '@connectty/shared';

export function createAuthRoutes(authService: AuthService): Router {
  const router = Router();

  // Login
  router.post('/login', async (req, res) => {
    try {
      const { username, password, domain } = req.body as AuthRequest;

      if (!username || !password) {
        res.status(400).json({ success: false, error: 'Username and password required' });
        return;
      }

      const result = await authService.authenticate({ username, password, domain });

      res.json({
        success: true,
        data: result,
      });
    } catch (err) {
      res.status(401).json({
        success: false,
        error: (err as Error).message,
      });
    }
  });

  // Register (local users only)
  router.post('/register', async (req, res) => {
    try {
      const { username, password, displayName, email } = req.body;

      if (!username || !password || !displayName) {
        res.status(400).json({
          success: false,
          error: 'Username, password, and display name required',
        });
        return;
      }

      if (password.length < 8) {
        res.status(400).json({
          success: false,
          error: 'Password must be at least 8 characters',
        });
        return;
      }

      const result = await authService.register(username, password, displayName, email);

      res.json({
        success: true,
        data: result,
      });
    } catch (err) {
      res.status(400).json({
        success: false,
        error: (err as Error).message,
      });
    }
  });

  // Verify token
  router.get('/verify', async (req, res) => {
    try {
      const authHeader = req.headers.authorization;

      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        res.status(401).json({ success: false, error: 'Authorization header required' });
        return;
      }

      const token = authHeader.substring(7);
      const user = await authService.getUserFromToken(token);

      if (!user) {
        res.status(401).json({ success: false, error: 'Invalid token' });
        return;
      }

      res.json({
        success: true,
        data: { user },
      });
    } catch (err) {
      res.status(401).json({
        success: false,
        error: (err as Error).message,
      });
    }
  });

  return router;
}
