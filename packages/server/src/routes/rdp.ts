/**
 * RDP routes for generating RDP connection files
 */

import { Router } from 'express';
import type { DatabaseService } from '../services/database';

export function createRDPRoutes(db: DatabaseService): Router {
  const router = Router();

  // Generate RDP file for a connection
  router.get('/file/:connectionId', async (req, res) => {
    try {
      const { connectionId } = req.params;

      const connection = await db.getConnection(connectionId, req.userId!);
      if (!connection) {
        res.status(404).json({
          success: false,
          error: 'Connection not found',
        });
        return;
      }

      let credential = null;
      if (connection.credentialId) {
        credential = await db.getCredential(connection.credentialId, req.userId!);
      }

      // Generate RDP file content
      const rdpContent = generateRDPFile(connection, credential);

      res.setHeader('Content-Type', 'application/x-rdp');
      res.setHeader('Content-Disposition', `attachment; filename="${connection.name}.rdp"`);
      res.send(rdpContent);
    } catch (err) {
      res.status(500).json({
        success: false,
        error: (err as Error).message,
      });
    }
  });

  // Get RDP connection info (for displaying instructions)
  router.get('/info/:connectionId', async (req, res) => {
    try {
      const { connectionId } = req.params;

      const connection = await db.getConnection(connectionId, req.userId!);
      if (!connection) {
        res.status(404).json({
          success: false,
          error: 'Connection not found',
        });
        return;
      }

      let credential = null;
      if (connection.credentialId) {
        credential = await db.getCredential(connection.credentialId, req.userId!);
      }

      res.json({
        success: true,
        data: {
          name: connection.name,
          hostname: connection.hostname,
          port: connection.port || 3389,
          username: credential?.username || connection.username,
          domain: credential?.domain,
          hasCredentials: !!credential,
        },
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

interface Connection {
  hostname: string;
  port: number;
  name: string;
}

interface Credential {
  username?: string;
  domain?: string;
}

function generateRDPFile(connection: Connection, credential: Credential | null): string {
  const port = connection.port || 3389;
  const lines: string[] = [
    `full address:s:${connection.hostname}:${port}`,
    'prompt for credentials:i:1',
    'administrative session:i:0',
    'screen mode id:i:2',
    'use multimon:i:0',
    'desktopwidth:i:1920',
    'desktopheight:i:1080',
    'session bpp:i:32',
    'compression:i:1',
    'keyboardhook:i:2',
    'audiocapturemode:i:0',
    'videoplaybackmode:i:1',
    'connection type:i:7',
    'networkautodetect:i:1',
    'bandwidthautodetect:i:1',
    'displayconnectionbar:i:1',
    'enableworkspacereconnect:i:0',
    'disable wallpaper:i:0',
    'allow font smoothing:i:1',
    'allow desktop composition:i:1',
    'disable full window drag:i:0',
    'disable menu anims:i:0',
    'disable themes:i:0',
    'disable cursor setting:i:0',
    'bitmapcachepersistenable:i:1',
    'audiomode:i:0',
    'redirectprinters:i:0',
    'redirectcomports:i:0',
    'redirectsmartcards:i:0',
    'redirectclipboard:i:1',
    'redirectposdevices:i:0',
    'autoreconnection enabled:i:1',
    'authentication level:i:2',
    'negotiate security layer:i:1',
  ];

  if (credential?.username) {
    const username = credential.domain
      ? `${credential.domain}\\${credential.username}`
      : credential.username;
    lines.push(`username:s:${username}`);

    if (credential.domain) {
      lines.push(`domain:s:${credential.domain}`);
    }
  }

  return lines.join('\r\n');
}
