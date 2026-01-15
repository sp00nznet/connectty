/**
 * Bulk Command Execution Service
 * Executes commands across multiple SSH connections in parallel
 */

import { Client } from 'ssh2';
import type { DatabaseService } from './database';
import type { ServerConnection, Credential } from '@connectty/shared';

interface ConnectionWithCreds extends ServerConnection {
  credential?: Credential;
}

export class BulkCommandService {
  private db: DatabaseService;

  constructor(db: DatabaseService) {
    this.db = db;
  }

  async execute(
    executionId: string,
    userId: string,
    command: string,
    connections: ServerConnection[],
    maxParallel: number = 10
  ): Promise<void> {
    // Update execution status
    await this.db.updateCommandExecution(userId, executionId, { status: 'running' });

    // Get credentials for all connections
    const connectionsWithCreds: ConnectionWithCreds[] = await Promise.all(
      connections.map(async (conn) => {
        if (conn.credentialId) {
          const credential = await this.db.getCredential(userId, conn.credentialId);
          return { ...conn, credential: credential || undefined };
        }
        return conn;
      })
    );

    // Execute in batches
    const results = await this.db.getCommandResults(executionId);
    const resultMap = new Map(results.map(r => [r.connectionId, r]));

    const queue = [...connectionsWithCreds];
    const running: Promise<void>[] = [];

    const executeOne = async (conn: ConnectionWithCreds): Promise<void> => {
      const result = resultMap.get(conn.id);
      if (!result) return;

      // Update status to running
      await this.db.updateCommandResult(result.id, {
        status: 'running',
        startedAt: new Date(),
      });

      try {
        const output = await this.executeCommand(conn, command);

        await this.db.updateCommandResult(result.id, {
          status: 'completed',
          exitCode: output.exitCode,
          stdout: output.stdout,
          stderr: output.stderr,
          completedAt: new Date(),
        });
      } catch (err) {
        await this.db.updateCommandResult(result.id, {
          status: 'failed',
          error: (err as Error).message,
          completedAt: new Date(),
        });
      }
    };

    // Process queue with concurrency limit
    while (queue.length > 0 || running.length > 0) {
      // Start new tasks up to the limit
      while (running.length < maxParallel && queue.length > 0) {
        const conn = queue.shift()!;
        const promise = executeOne(conn).then(() => {
          const index = running.indexOf(promise);
          if (index > -1) running.splice(index, 1);
        });
        running.push(promise);
      }

      // Wait for at least one to complete
      if (running.length > 0) {
        await Promise.race(running);
      }
    }

    // Update execution as completed
    await this.db.updateCommandExecution(userId, executionId, {
      status: 'completed',
      completedAt: new Date(),
    });
  }

  private executeCommand(
    conn: ConnectionWithCreds,
    command: string
  ): Promise<{ exitCode: number; stdout: string; stderr: string }> {
    return new Promise((resolve, reject) => {
      const client = new Client();
      const timeout = setTimeout(() => {
        client.end();
        reject(new Error('Connection timeout'));
      }, 30000);

      client.on('ready', () => {
        client.exec(command, (err, stream) => {
          if (err) {
            clearTimeout(timeout);
            client.end();
            reject(err);
            return;
          }

          let stdout = '';
          let stderr = '';

          stream.on('data', (data: Buffer) => {
            stdout += data.toString();
          });

          stream.stderr.on('data', (data: Buffer) => {
            stderr += data.toString();
          });

          stream.on('close', (code: number) => {
            clearTimeout(timeout);
            client.end();
            resolve({
              exitCode: code ?? 0,
              stdout: stdout.slice(0, 100000), // Limit output size
              stderr: stderr.slice(0, 100000),
            });
          });
        });
      });

      client.on('error', (err) => {
        clearTimeout(timeout);
        reject(err);
      });

      // Build connection config
      const connectConfig: Parameters<typeof client.connect>[0] = {
        host: conn.hostname,
        port: conn.port || 22,
        username: conn.username || conn.credential?.username,
        readyTimeout: 30000,
      };

      // Add authentication
      if (conn.credential) {
        if (conn.credential.privateKey) {
          connectConfig.privateKey = conn.credential.privateKey;
          if (conn.credential.passphrase) {
            connectConfig.passphrase = conn.credential.passphrase;
          }
        } else if (conn.credential.secret) {
          connectConfig.password = conn.credential.secret;
        }
      }

      client.connect(connectConfig);
    });
  }
}
