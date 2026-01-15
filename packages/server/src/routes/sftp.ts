/**
 * SFTP routes for file browser
 */

import { Router } from 'express';
import multer from 'multer';
import * as path from 'path';
import type { SFTPService } from '../services/sftp';

export function createSFTPRoutes(sftpService: SFTPService): Router {
  const router = Router();

  // Configure multer for file uploads
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: 500 * 1024 * 1024, // 500MB limit
    },
  });

  // Connect to SFTP
  router.post('/connect', async (req, res) => {
    try {
      const { connectionId } = req.body;

      if (!connectionId) {
        res.status(400).json({
          success: false,
          error: 'Connection ID is required',
        });
        return;
      }

      const sessionId = await sftpService.connect(req.userId!, connectionId);

      res.json({
        success: true,
        data: { sessionId },
      });
    } catch (err) {
      res.status(500).json({
        success: false,
        error: (err as Error).message,
      });
    }
  });

  // Disconnect from SFTP
  router.post('/disconnect', async (req, res) => {
    try {
      const { sessionId } = req.body;

      if (!sessionId) {
        res.status(400).json({
          success: false,
          error: 'Session ID is required',
        });
        return;
      }

      sftpService.disconnect(sessionId, req.userId!);

      res.json({
        success: true,
      });
    } catch (err) {
      res.status(500).json({
        success: false,
        error: (err as Error).message,
      });
    }
  });

  // Get active sessions
  router.get('/sessions', async (req, res) => {
    try {
      const sessions = sftpService.getUserSessions(req.userId!);

      res.json({
        success: true,
        data: sessions,
      });
    } catch (err) {
      res.status(500).json({
        success: false,
        error: (err as Error).message,
      });
    }
  });

  // List directory
  router.get('/list/:sessionId', async (req, res) => {
    try {
      const { sessionId } = req.params;
      const remotePath = (req.query.path as string) || '/';

      const files = await sftpService.listDirectory(sessionId, req.userId!, remotePath);

      res.json({
        success: true,
        data: {
          path: remotePath,
          files,
        },
      });
    } catch (err) {
      res.status(500).json({
        success: false,
        error: (err as Error).message,
      });
    }
  });

  // Get file info
  router.get('/stat/:sessionId', async (req, res) => {
    try {
      const { sessionId } = req.params;
      const remotePath = req.query.path as string;

      if (!remotePath) {
        res.status(400).json({
          success: false,
          error: 'Path is required',
        });
        return;
      }

      const info = await sftpService.stat(sessionId, req.userId!, remotePath);

      res.json({
        success: true,
        data: info,
      });
    } catch (err) {
      res.status(500).json({
        success: false,
        error: (err as Error).message,
      });
    }
  });

  // Download file
  router.get('/download/:sessionId', async (req, res) => {
    try {
      const { sessionId } = req.params;
      const remotePath = req.query.path as string;

      if (!remotePath) {
        res.status(400).json({
          success: false,
          error: 'Path is required',
        });
        return;
      }

      // Get file info first
      const info = await sftpService.stat(sessionId, req.userId!, remotePath);

      if (info.isDirectory) {
        res.status(400).json({
          success: false,
          error: 'Cannot download a directory',
        });
        return;
      }

      const filename = path.basename(remotePath);

      res.setHeader('Content-Type', 'application/octet-stream');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('Content-Length', info.size);

      await sftpService.readFile(
        sessionId,
        req.userId!,
        remotePath,
        (chunk) => res.write(chunk),
        () => res.end(),
        (err) => {
          if (!res.headersSent) {
            res.status(500).json({
              success: false,
              error: err.message,
            });
          } else {
            res.end();
          }
        }
      );
    } catch (err) {
      if (!res.headersSent) {
        res.status(500).json({
          success: false,
          error: (err as Error).message,
        });
      }
    }
  });

  // Upload file
  router.post('/upload/:sessionId', upload.single('file'), async (req, res) => {
    try {
      const { sessionId } = req.params;
      const remotePath = req.body.path as string;

      if (!remotePath) {
        res.status(400).json({
          success: false,
          error: 'Path is required',
        });
        return;
      }

      if (!req.file) {
        res.status(400).json({
          success: false,
          error: 'No file uploaded',
        });
        return;
      }

      const filename = req.file.originalname;
      const fullRemotePath = remotePath.endsWith('/')
        ? remotePath + filename
        : remotePath + '/' + filename;

      const { writeStream } = await sftpService.writeFile(
        sessionId,
        req.userId!,
        fullRemotePath,
        req.file.size
      );

      // Write the buffer to the stream
      writeStream.write(req.file.buffer);
      writeStream.end();

      // Wait for the stream to close
      await new Promise<void>((resolve, reject) => {
        writeStream.on('close', () => resolve());
        writeStream.on('error', (err) => reject(err));
      });

      res.json({
        success: true,
        data: {
          path: fullRemotePath,
          size: req.file.size,
        },
      });
    } catch (err) {
      res.status(500).json({
        success: false,
        error: (err as Error).message,
      });
    }
  });

  // Create directory
  router.post('/mkdir/:sessionId', async (req, res) => {
    try {
      const { sessionId } = req.params;
      const { path: remotePath } = req.body;

      if (!remotePath) {
        res.status(400).json({
          success: false,
          error: 'Path is required',
        });
        return;
      }

      await sftpService.mkdir(sessionId, req.userId!, remotePath);

      res.json({
        success: true,
      });
    } catch (err) {
      res.status(500).json({
        success: false,
        error: (err as Error).message,
      });
    }
  });

  // Remove directory
  router.delete('/rmdir/:sessionId', async (req, res) => {
    try {
      const { sessionId } = req.params;
      const remotePath = req.query.path as string;

      if (!remotePath) {
        res.status(400).json({
          success: false,
          error: 'Path is required',
        });
        return;
      }

      await sftpService.rmdir(sessionId, req.userId!, remotePath);

      res.json({
        success: true,
      });
    } catch (err) {
      res.status(500).json({
        success: false,
        error: (err as Error).message,
      });
    }
  });

  // Delete file
  router.delete('/unlink/:sessionId', async (req, res) => {
    try {
      const { sessionId } = req.params;
      const remotePath = req.query.path as string;

      if (!remotePath) {
        res.status(400).json({
          success: false,
          error: 'Path is required',
        });
        return;
      }

      await sftpService.unlink(sessionId, req.userId!, remotePath);

      res.json({
        success: true,
      });
    } catch (err) {
      res.status(500).json({
        success: false,
        error: (err as Error).message,
      });
    }
  });

  // Rename/move file
  router.post('/rename/:sessionId', async (req, res) => {
    try {
      const { sessionId } = req.params;
      const { oldPath, newPath } = req.body;

      if (!oldPath || !newPath) {
        res.status(400).json({
          success: false,
          error: 'Old path and new path are required',
        });
        return;
      }

      await sftpService.rename(sessionId, req.userId!, oldPath, newPath);

      res.json({
        success: true,
      });
    } catch (err) {
      res.status(500).json({
        success: false,
        error: (err as Error).message,
      });
    }
  });

  // Change permissions
  router.post('/chmod/:sessionId', async (req, res) => {
    try {
      const { sessionId } = req.params;
      const { path: remotePath, mode } = req.body;

      if (!remotePath || mode === undefined) {
        res.status(400).json({
          success: false,
          error: 'Path and mode are required',
        });
        return;
      }

      await sftpService.chmod(sessionId, req.userId!, remotePath, mode);

      res.json({
        success: true,
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
