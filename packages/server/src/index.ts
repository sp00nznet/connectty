/**
 * Connectty Server Platform - Main Entry Point
 */

import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { DatabaseService } from './services/database';
import { AuthService } from './services/auth';
import { SSHService } from './services/ssh';
import { authMiddleware } from './middleware/auth';
import { createAuthRoutes } from './routes/auth';
import { createConnectionRoutes } from './routes/connections';
import { createCredentialRoutes } from './routes/credentials';
import { createGroupRoutes } from './routes/groups';
import { createSyncRoutes } from './routes/sync';
import { createProviderRoutes } from './routes/providers';
import { createCommandRoutes } from './routes/commands';
import { setupWebSocket } from './services/websocket';
import { ProviderDiscoveryService } from './services/provider-discovery';
import { BulkCommandService } from './services/bulk-commands';

const PORT = parseInt(process.env.PORT || '3000', 10);
const HOST = process.env.HOST || '0.0.0.0';

async function main() {
  // Initialize services
  const db = new DatabaseService({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    database: process.env.DB_NAME || 'connectty',
    user: process.env.DB_USER || 'connectty',
    password: process.env.DB_PASSWORD || 'connectty',
  });

  await db.initialize();
  console.log('Database initialized');

  const authService = new AuthService(db, {
    jwtSecret: process.env.JWT_SECRET || 'change-this-secret-in-production',
    jwtExpiry: process.env.JWT_EXPIRY || '24h',
    adEnabled: process.env.AD_ENABLED === 'true',
    adUrl: process.env.AD_URL,
    adBaseDN: process.env.AD_BASE_DN,
    adDomain: process.env.AD_DOMAIN,
  });

  const sshService = new SSHService(db);
  const providerService = new ProviderDiscoveryService();
  const commandService = new BulkCommandService(db);

  // Create Express app
  const app = express();

  app.use(cors({
    origin: process.env.CORS_ORIGIN || '*',
    credentials: true,
  }));

  app.use(express.json({ limit: '10mb' }));

  // Health check
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', version: '1.0.0' });
  });

  // Public routes
  app.use('/api/auth', createAuthRoutes(authService));

  // Protected routes
  app.use('/api/connections', authMiddleware(authService), createConnectionRoutes(db));
  app.use('/api/credentials', authMiddleware(authService), createCredentialRoutes(db));
  app.use('/api/groups', authMiddleware(authService), createGroupRoutes(db));
  app.use('/api/sync', authMiddleware(authService), createSyncRoutes(db));
  app.use('/api/providers', authMiddleware(authService), createProviderRoutes(db, providerService));
  app.use('/api/commands', authMiddleware(authService), createCommandRoutes(db, commandService));

  // Create HTTP server
  const server = createServer(app);

  // Setup WebSocket for SSH terminal
  const wss = new WebSocketServer({ server, path: '/ws' });
  setupWebSocket(wss, authService, sshService);

  // Start server
  server.listen(PORT, HOST, () => {
    console.log(`Connectty Server running on http://${HOST}:${PORT}`);
    console.log(`WebSocket endpoint: ws://${HOST}:${PORT}/ws`);
  });

  // Graceful shutdown
  process.on('SIGTERM', async () => {
    console.log('Shutting down...');
    sshService.disconnectAll();
    await db.close();
    server.close();
    process.exit(0);
  });
}

main().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
