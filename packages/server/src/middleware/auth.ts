/**
 * Authentication middleware
 */

import { Request, Response, NextFunction } from 'express';
import type { User } from '@connectty/shared';
import type { AuthService } from '../services/auth';

declare global {
  namespace Express {
    interface Request {
      user?: User;
      userId?: string;
    }
  }
}

export function authMiddleware(authService: AuthService) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authHeader = req.headers.authorization;

      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        res.status(401).json({ success: false, error: 'Authorization header required' });
        return;
      }

      const token = authHeader.substring(7);
      const user = await authService.getUserFromToken(token);

      if (!user) {
        res.status(401).json({ success: false, error: 'Invalid or expired token' });
        return;
      }

      req.user = user;
      req.userId = user.id;
      next();
    } catch (err) {
      res.status(401).json({ success: false, error: 'Invalid or expired token' });
    }
  };
}

export function adminMiddleware(req: Request, res: Response, next: NextFunction) {
  if (!req.user || !req.user.roles.includes('admin')) {
    res.status(403).json({ success: false, error: 'Admin access required' });
    return;
  }
  next();
}
