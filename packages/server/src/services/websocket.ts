/**
 * WebSocket handler for SSH and local terminal sessions
 */

import { WebSocketServer, WebSocket } from 'ws';
import type { AuthService } from './auth';
import type { SSHService } from './ssh';
import type { PTYService, PTYSessionEvent } from './pty';
import type { SSHSessionEvent } from '@connectty/shared';

interface WebSocketClient extends WebSocket {
  userId?: string;
  sessionId?: string;
  sessionType?: 'ssh' | 'local';
  isAlive?: boolean;
}

interface WSMessage {
  type: 'auth' | 'connect' | 'local-connect' | 'disconnect' | 'data' | 'resize';
  token?: string;
  connectionId?: string;
  sessionId?: string;
  data?: string;
  cols?: number;
  rows?: number;
}

interface WSResponse {
  type: 'auth_success' | 'auth_error' | 'connected' | 'disconnected' | 'data' | 'error' | 'close';
  sessionId?: string;
  sessionType?: 'ssh' | 'local';
  data?: string;
  message?: string;
  code?: number;
}

export function setupWebSocket(
  wss: WebSocketServer,
  authService: AuthService,
  sshService: SSHService,
  ptyService?: PTYService
): void {
  // Heartbeat to detect stale connections
  const interval = setInterval(() => {
    wss.clients.forEach((ws) => {
      const client = ws as WebSocketClient;
      if (client.isAlive === false) {
        if (client.sessionId) {
          if (client.sessionType === 'local' && ptyService) {
            ptyService.disconnect(client.sessionId);
          } else {
            sshService.disconnect(client.sessionId);
          }
        }
        return client.terminate();
      }
      client.isAlive = false;
      client.ping();
    });
  }, 30000);

  wss.on('close', () => {
    clearInterval(interval);
  });

  wss.on('connection', (ws: WebSocket) => {
    const client = ws as WebSocketClient;
    client.isAlive = true;

    client.on('pong', () => {
      client.isAlive = true;
    });

    client.on('message', async (message: Buffer) => {
      try {
        const msg = JSON.parse(message.toString()) as WSMessage;
        await handleMessage(client, msg, authService, sshService, ptyService);
      } catch (err) {
        sendResponse(client, {
          type: 'error',
          message: (err as Error).message,
        });
      }
    });

    client.on('close', () => {
      if (client.sessionId) {
        if (client.sessionType === 'local' && ptyService) {
          ptyService.disconnect(client.sessionId);
        } else {
          sshService.disconnect(client.sessionId);
        }
      }
    });

    client.on('error', (err) => {
      console.error('WebSocket error:', err);
      if (client.sessionId) {
        if (client.sessionType === 'local' && ptyService) {
          ptyService.disconnect(client.sessionId);
        } else {
          sshService.disconnect(client.sessionId);
        }
      }
    });
  });
}

async function handleMessage(
  client: WebSocketClient,
  msg: WSMessage,
  authService: AuthService,
  sshService: SSHService,
  ptyService?: PTYService
): Promise<void> {
  switch (msg.type) {
    case 'auth': {
      if (!msg.token) {
        sendResponse(client, { type: 'auth_error', message: 'Token required' });
        return;
      }

      try {
        const payload = await authService.verifyToken(msg.token);
        client.userId = payload.userId;
        sendResponse(client, { type: 'auth_success' });
      } catch {
        sendResponse(client, { type: 'auth_error', message: 'Invalid token' });
      }
      break;
    }

    case 'connect': {
      if (!client.userId) {
        sendResponse(client, { type: 'error', message: 'Not authenticated' });
        return;
      }

      if (!msg.connectionId) {
        sendResponse(client, { type: 'error', message: 'Connection ID required' });
        return;
      }

      try {
        const sessionId = await sshService.connect(
          client.userId,
          msg.connectionId,
          (event: SSHSessionEvent) => {
            sendResponse(client, {
              type: event.type as WSResponse['type'],
              sessionId: client.sessionId,
              sessionType: 'ssh',
              data: event.data,
              message: event.message,
              code: event.code,
            });
          }
        );

        client.sessionId = sessionId;
        client.sessionType = 'ssh';
        sendResponse(client, { type: 'connected', sessionId, sessionType: 'ssh' });
      } catch (err) {
        sendResponse(client, { type: 'error', message: (err as Error).message });
      }
      break;
    }

    case 'local-connect': {
      if (!client.userId) {
        sendResponse(client, { type: 'error', message: 'Not authenticated' });
        return;
      }

      if (!ptyService) {
        sendResponse(client, { type: 'error', message: 'Local shell not available' });
        return;
      }

      try {
        const sessionId = ptyService.connect(
          client.userId,
          (event: PTYSessionEvent) => {
            sendResponse(client, {
              type: event.type as WSResponse['type'],
              sessionId: client.sessionId,
              sessionType: 'local',
              data: event.data,
              message: event.message,
              code: event.code,
            });
          }
        );

        client.sessionId = sessionId;
        client.sessionType = 'local';
        sendResponse(client, { type: 'connected', sessionId, sessionType: 'local' });
      } catch (err) {
        sendResponse(client, { type: 'error', message: (err as Error).message });
      }
      break;
    }

    case 'disconnect': {
      if (client.sessionId) {
        if (client.sessionType === 'local' && ptyService) {
          ptyService.disconnect(client.sessionId);
        } else {
          sshService.disconnect(client.sessionId);
        }
        client.sessionId = undefined;
        client.sessionType = undefined;
        sendResponse(client, { type: 'disconnected' });
      }
      break;
    }

    case 'data': {
      if (!client.sessionId) {
        sendResponse(client, { type: 'error', message: 'No active session' });
        return;
      }

      if (msg.data) {
        if (client.sessionType === 'local' && ptyService) {
          ptyService.write(client.sessionId, msg.data);
        } else {
          sshService.write(client.sessionId, msg.data);
        }
      }
      break;
    }

    case 'resize': {
      if (!client.sessionId) {
        return;
      }

      if (msg.cols && msg.rows) {
        if (client.sessionType === 'local' && ptyService) {
          ptyService.resize(client.sessionId, msg.cols, msg.rows);
        } else {
          sshService.resize(client.sessionId, msg.cols, msg.rows);
        }
      }
      break;
    }
  }
}

function sendResponse(client: WebSocketClient, response: WSResponse): void {
  if (client.readyState === WebSocket.OPEN) {
    client.send(JSON.stringify(response));
  }
}
