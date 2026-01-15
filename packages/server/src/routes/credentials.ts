/**
 * Credential routes
 */

import { Router } from 'express';
import type { DatabaseService } from '../services/database';

export function createCredentialRoutes(db: DatabaseService): Router {
  const router = Router();

  // List credentials (optionally including shared)
  router.get('/', async (req, res) => {
    try {
      const includeShared = req.query.includeShared === 'true';
      const credentials = includeShared
        ? await db.getAllCredentialsWithShared(req.userId!)
        : await db.getCredentials(req.userId!);

      // Don't expose secrets in list view
      const sanitized = credentials.map((cred) => ({
        ...cred,
        secret: cred.secret ? '***' : undefined,
        privateKey: cred.privateKey ? '***' : undefined,
        passphrase: cred.passphrase ? '***' : undefined,
      }));

      res.json({
        success: true,
        data: sanitized,
      });
    } catch (err) {
      res.status(500).json({
        success: false,
        error: (err as Error).message,
      });
    }
  });

  // Get single credential
  router.get('/:id', async (req, res) => {
    try {
      const credential = await db.getCredential(req.userId!, req.params.id);

      if (!credential) {
        res.status(404).json({
          success: false,
          error: 'Credential not found',
        });
        return;
      }

      // Don't expose secrets
      res.json({
        success: true,
        data: {
          ...credential,
          secret: credential.secret ? '***' : undefined,
          privateKey: credential.privateKey ? '***' : undefined,
          passphrase: credential.passphrase ? '***' : undefined,
        },
      });
    } catch (err) {
      res.status(500).json({
        success: false,
        error: (err as Error).message,
      });
    }
  });

  // Create credential
  router.post('/', async (req, res) => {
    try {
      const { name, type, username, secret, privateKey, passphrase } = req.body;

      if (!name || !type || !username) {
        res.status(400).json({
          success: false,
          error: 'Name, type, and username are required',
        });
        return;
      }

      if (!['password', 'privateKey', 'agent'].includes(type)) {
        res.status(400).json({
          success: false,
          error: 'Invalid credential type',
        });
        return;
      }

      const credential = await db.createCredential(req.userId!, {
        name,
        type,
        username,
        secret,
        privateKey,
        passphrase,
      });

      res.status(201).json({
        success: true,
        data: {
          ...credential,
          secret: credential.secret ? '***' : undefined,
          privateKey: credential.privateKey ? '***' : undefined,
          passphrase: credential.passphrase ? '***' : undefined,
        },
      });
    } catch (err) {
      res.status(500).json({
        success: false,
        error: (err as Error).message,
      });
    }
  });

  // Update credential
  router.put('/:id', async (req, res) => {
    try {
      const credential = await db.updateCredential(req.userId!, req.params.id, req.body);

      if (!credential) {
        res.status(404).json({
          success: false,
          error: 'Credential not found',
        });
        return;
      }

      res.json({
        success: true,
        data: {
          ...credential,
          secret: credential.secret ? '***' : undefined,
          privateKey: credential.privateKey ? '***' : undefined,
          passphrase: credential.passphrase ? '***' : undefined,
        },
      });
    } catch (err) {
      res.status(500).json({
        success: false,
        error: (err as Error).message,
      });
    }
  });

  // Delete credential
  router.delete('/:id', async (req, res) => {
    try {
      const deleted = await db.deleteCredential(req.userId!, req.params.id);

      if (!deleted) {
        res.status(404).json({
          success: false,
          error: 'Credential not found',
        });
        return;
      }

      res.json({
        success: true,
        message: 'Credential deleted',
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
