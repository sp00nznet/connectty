/**
 * SSH Service for server-side terminal connections
 */

import { Client, ClientChannel } from 'ssh2';
import { generateId } from '@connectty/shared';
import type { ServerConnection, Credential, SSHSessionEvent } from '@connectty/shared';
import type { DatabaseService } from './database';

interface SSHSession {
  id: string;
  userId: string;
  client: Client;
  stream: ClientChannel | null;
  connectionId: string;
  onEvent: (event: SSHSessionEvent) => void;
}

export class SSHService {
  private db: DatabaseService;
  private sessions: Map<string, SSHSession> = new Map();

  constructor(db: DatabaseService) {
    this.db = db;
  }

  async connect(
    userId: string,
    connectionId: string,
    onEvent: (event: SSHSessionEvent) => void
  ): Promise<string> {
    const connection = await this.db.getConnection(userId, connectionId);
    if (!connection) {
      throw new Error('Connection not found');
    }

    let credential: Credential | null = null;
    if (connection.credentialId) {
      credential = await this.db.getCredential(userId, connection.credentialId);
    }

    const sessionId = generateId();
    const client = new Client();

    return new Promise((resolve, reject) => {
      client.on('ready', () => {
        client.shell({ term: 'xterm-256color' }, (err, stream) => {
          if (err) {
            client.end();
            reject(err);
            return;
          }

          const session: SSHSession = {
            id: sessionId,
            userId,
            client,
            stream,
            connectionId,
            onEvent,
          };

          this.sessions.set(sessionId, session);

          stream.on('data', (data: Buffer) => {
            onEvent({
              type: 'data',
              data: data.toString('utf-8'),
            });
          });

          stream.on('close', () => {
            onEvent({
              type: 'close',
              code: 0,
            });
            this.cleanup(sessionId);
          });

          stream.stderr.on('data', (data: Buffer) => {
            onEvent({
              type: 'data',
              data: data.toString('utf-8'),
            });
          });

          // Update last connected timestamp
          this.db.updateConnection(userId, connectionId, { lastConnectedAt: new Date() });

          resolve(sessionId);
        });
      });

      client.on('error', (err) => {
        onEvent({
          type: 'error',
          message: err.message,
        });
        this.cleanup(sessionId);
        reject(err);
      });

      client.on('close', () => {
        onEvent({
          type: 'close',
          code: 0,
        });
        this.cleanup(sessionId);
      });

      // Build connection config
      const config: Parameters<Client['connect']>[0] = {
        host: connection.hostname,
        port: connection.port,
        username: credential?.username || connection.username || 'root',
        readyTimeout: 30000,
        keepaliveInterval: 10000,
      };

      if (credential) {
        switch (credential.type) {
          case 'password':
            config.password = credential.secret;
            break;
          case 'privateKey':
            config.privateKey = credential.privateKey;
            if (credential.passphrase) {
              config.passphrase = credential.passphrase;
            }
            break;
          case 'agent':
            config.agent = process.env.SSH_AUTH_SOCK;
            break;
        }
      }

      client.connect(config);
    });
  }

  write(sessionId: string, data: string): void {
    const session = this.sessions.get(sessionId);
    if (session?.stream) {
      session.stream.write(data);
    }
  }

  resize(sessionId: string, cols: number, rows: number): void {
    const session = this.sessions.get(sessionId);
    if (session?.stream) {
      session.stream.setWindow(rows, cols, 0, 0);
    }
  }

  disconnect(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.stream?.close();
      session.client.end();
      this.cleanup(sessionId);
    }
  }

  disconnectAll(): void {
    for (const sessionId of this.sessions.keys()) {
      this.disconnect(sessionId);
    }
  }

  disconnectUser(userId: string): void {
    for (const [sessionId, session] of this.sessions.entries()) {
      if (session.userId === userId) {
        this.disconnect(sessionId);
      }
    }
  }

  private cleanup(sessionId: string): void {
    this.sessions.delete(sessionId);
  }

  getSession(sessionId: string): SSHSession | undefined {
    return this.sessions.get(sessionId);
  }

  getUserSessions(userId: string): string[] {
    return Array.from(this.sessions.entries())
      .filter(([, session]) => session.userId === userId)
      .map(([id]) => id);
  }
}
