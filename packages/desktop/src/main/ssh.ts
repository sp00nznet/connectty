/**
 * SSH connection service using ssh2
 */

import { Client, ClientChannel } from 'ssh2';
import { generateId } from '@connectty/shared';
import type { ServerConnection, Credential, SSHSessionEvent } from '@connectty/shared';
import * as net from 'net';

interface SSHSession {
  id: string;
  client: Client;
  stream: ClientChannel | null;
  connectionId: string;
}

type EventCallback = (sessionId: string, event: SSHSessionEvent) => void;

/**
 * Check if Windows SSH agent (OpenSSH) is reachable
 * Returns false if agent is not running, avoiding connection errors
 */
function checkWindowsAgent(): Promise<boolean> {
  return new Promise((resolve) => {
    const pipePath = '\\\\.\\pipe\\openssh-ssh-agent';
    const socket = net.connect(pipePath);
    const timeout = setTimeout(() => {
      socket.destroy();
      resolve(false);
    }, 1000);

    socket.on('connect', () => {
      clearTimeout(timeout);
      socket.destroy();
      resolve(true);
    });

    socket.on('error', () => {
      clearTimeout(timeout);
      resolve(false);
    });
  });
}

export class SSHService {
  private sessions: Map<string, SSHSession> = new Map();
  private onEvent: EventCallback;

  constructor(onEvent: EventCallback) {
    this.onEvent = onEvent;
  }

  async connect(connection: ServerConnection, credential: Credential | null): Promise<string> {
    const sessionId = generateId();
    const client = new Client();

    // Build connection config before creating the Promise
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
          // Handle agent credential - use platform-appropriate path
          if (process.platform === 'win32') {
            const agentAvailable = await checkWindowsAgent();
            if (agentAvailable) {
              config.agent = '\\\\.\\pipe\\openssh-ssh-agent';
            } else {
              throw new Error('SSH agent is not running. Start the OpenSSH Authentication Agent service or use a different authentication method.');
            }
          } else if (process.env.SSH_AUTH_SOCK) {
            config.agent = process.env.SSH_AUTH_SOCK;
          } else {
            throw new Error('SSH agent socket not found. Ensure ssh-agent is running.');
          }
          break;
      }
    } else {
      // No credential provided - try SSH agent if available
      if (process.platform === 'win32') {
        // On Windows, check if OpenSSH agent is running before trying to use it
        const agentAvailable = await checkWindowsAgent();
        if (agentAvailable) {
          config.agent = '\\\\.\\pipe\\openssh-ssh-agent';
        }
      } else if (process.env.SSH_AUTH_SOCK) {
        config.agent = process.env.SSH_AUTH_SOCK;
      }

      // Enable keyboard-interactive auth to allow password prompts
      config.tryKeyboard = true;
    }

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
            client,
            stream,
            connectionId: connection.id,
          };

          this.sessions.set(sessionId, session);

          stream.on('data', (data: Buffer) => {
            this.onEvent(sessionId, {
              type: 'data',
              data: data.toString('utf-8'),
            });
          });

          stream.on('close', () => {
            this.onEvent(sessionId, {
              type: 'close',
              code: 0,
            });
            this.cleanup(sessionId);
          });

          stream.stderr.on('data', (data: Buffer) => {
            this.onEvent(sessionId, {
              type: 'data',
              data: data.toString('utf-8'),
            });
          });

          resolve(sessionId);
        });
      });

      client.on('error', (err) => {
        this.onEvent(sessionId, {
          type: 'error',
          message: err.message,
        });
        this.cleanup(sessionId);
        reject(err);
      });

      client.on('close', () => {
        this.onEvent(sessionId, {
          type: 'close',
          code: 0,
        });
        this.cleanup(sessionId);
      });

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

  private cleanup(sessionId: string): void {
    this.sessions.delete(sessionId);
  }

  getActiveSessions(): string[] {
    return Array.from(this.sessions.keys());
  }

  getClient(sessionId: string): Client | undefined {
    return this.sessions.get(sessionId)?.client;
  }
}
