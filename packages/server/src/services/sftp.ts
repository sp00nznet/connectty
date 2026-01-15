/**
 * SFTP service for web file browser
 */

import { Client, SFTPWrapper } from 'ssh2';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { generateId } from '@connectty/shared';
import type { DatabaseService } from './database';
import { Readable, Writable } from 'stream';

export interface SFTPSession {
  id: string;
  userId: string;
  connectionId: string;
  connectionName: string;
  client: Client;
  sftp: SFTPWrapper;
  currentPath: string;
}

export interface RemoteFileInfo {
  name: string;
  path: string;
  size: number;
  isDirectory: boolean;
  isSymlink: boolean;
  permissions: string;
  owner: number;
  group: number;
  modifiedAt: string;
  accessedAt: string;
}

export interface TransferProgress {
  sessionId: string;
  transferId: string;
  filename: string;
  direction: 'upload' | 'download';
  bytesTransferred: number;
  totalBytes: number;
  percentage: number;
  status: 'pending' | 'transferring' | 'completed' | 'error';
  error?: string;
}

type ProgressCallback = (userId: string, progress: TransferProgress) => void;

export class SFTPService {
  private sessions: Map<string, SFTPSession> = new Map();
  private onProgress: ProgressCallback;
  private db: DatabaseService;
  private tempDir: string;

  constructor(db: DatabaseService, onProgress: ProgressCallback) {
    this.db = db;
    this.onProgress = onProgress;
    this.tempDir = path.join(os.tmpdir(), 'connectty-sftp');

    // Ensure temp directory exists
    if (!fs.existsSync(this.tempDir)) {
      fs.mkdirSync(this.tempDir, { recursive: true });
    }
  }

  async connect(userId: string, connectionId: string): Promise<string> {
    const connection = await this.db.getConnection(connectionId, userId);
    if (!connection) {
      throw new Error('Connection not found');
    }

    let credential = null;
    if (connection.credentialId) {
      credential = await this.db.getCredential(connection.credentialId, userId);
    }

    const sessionId = generateId();
    const client = new Client();

    return new Promise((resolve, reject) => {
      client.on('ready', () => {
        client.sftp((err, sftp) => {
          if (err) {
            client.end();
            reject(err);
            return;
          }

          const session: SFTPSession = {
            id: sessionId,
            userId,
            connectionId: connection.id,
            connectionName: connection.name,
            client,
            sftp,
            currentPath: '/',
          };

          this.sessions.set(sessionId, session);

          // Get home directory
          sftp.realpath('.', (err, absPath) => {
            if (!err && absPath) {
              session.currentPath = absPath;
            }
            resolve(sessionId);
          });
        });
      });

      client.on('error', (err) => {
        reject(err);
      });

      // Build connection config
      const config: Parameters<Client['connect']>[0] = {
        host: connection.hostname,
        port: connection.port,
        username: credential?.username || connection.username || 'root',
        readyTimeout: 30000,
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
            if (process.platform === 'win32') {
              config.agent = '\\\\.\\pipe\\openssh-ssh-agent';
            } else if (process.env.SSH_AUTH_SOCK) {
              config.agent = process.env.SSH_AUTH_SOCK;
            }
            break;
        }
      } else {
        // Try SSH agent
        if (process.platform === 'win32') {
          config.agent = '\\\\.\\pipe\\openssh-ssh-agent';
        } else if (process.env.SSH_AUTH_SOCK) {
          config.agent = process.env.SSH_AUTH_SOCK;
        }
      }

      client.connect(config);
    });
  }

  disconnect(sessionId: string, userId: string): void {
    const session = this.sessions.get(sessionId);
    if (session && session.userId === userId) {
      session.sftp.end();
      session.client.end();
      this.sessions.delete(sessionId);
    }
  }

  disconnectUser(userId: string): void {
    for (const [sessionId, session] of this.sessions.entries()) {
      if (session.userId === userId) {
        session.sftp.end();
        session.client.end();
        this.sessions.delete(sessionId);
      }
    }
  }

  async listDirectory(sessionId: string, userId: string, remotePath: string): Promise<RemoteFileInfo[]> {
    const session = this.getSession(sessionId, userId);
    if (!session) throw new Error('SFTP session not found');

    return new Promise((resolve, reject) => {
      session.sftp.readdir(remotePath, (err, list) => {
        if (err) {
          reject(err);
          return;
        }

        const files: RemoteFileInfo[] = list.map((item) => {
          const isDirectory = item.attrs.isDirectory();
          const isSymlink = item.attrs.isSymbolicLink();
          const mode = item.attrs.mode || 0;
          const permissions = this.modeToPermissions(mode);

          return {
            name: item.filename,
            path: path.posix.join(remotePath, item.filename),
            size: item.attrs.size || 0,
            isDirectory,
            isSymlink,
            permissions,
            owner: item.attrs.uid || 0,
            group: item.attrs.gid || 0,
            modifiedAt: new Date((item.attrs.mtime || 0) * 1000).toISOString(),
            accessedAt: new Date((item.attrs.atime || 0) * 1000).toISOString(),
          };
        });

        // Sort: directories first, then by name
        files.sort((a, b) => {
          if (a.isDirectory && !b.isDirectory) return -1;
          if (!a.isDirectory && b.isDirectory) return 1;
          return a.name.localeCompare(b.name);
        });

        // Update current path
        session.currentPath = remotePath;

        resolve(files);
      });
    });
  }

  async stat(sessionId: string, userId: string, remotePath: string): Promise<RemoteFileInfo> {
    const session = this.getSession(sessionId, userId);
    if (!session) throw new Error('SFTP session not found');

    return new Promise((resolve, reject) => {
      session.sftp.stat(remotePath, (err, stats) => {
        if (err) {
          reject(err);
          return;
        }

        resolve({
          name: path.basename(remotePath),
          path: remotePath,
          size: stats.size || 0,
          isDirectory: stats.isDirectory(),
          isSymlink: stats.isSymbolicLink(),
          permissions: this.modeToPermissions(stats.mode || 0),
          owner: stats.uid || 0,
          group: stats.gid || 0,
          modifiedAt: new Date((stats.mtime || 0) * 1000).toISOString(),
          accessedAt: new Date((stats.atime || 0) * 1000).toISOString(),
        });
      });
    });
  }

  async readFile(
    sessionId: string,
    userId: string,
    remotePath: string,
    onData: (chunk: Buffer) => void,
    onEnd: () => void,
    onError: (err: Error) => void
  ): Promise<number> {
    const session = this.getSession(sessionId, userId);
    if (!session) throw new Error('SFTP session not found');

    const stats = await this.stat(sessionId, userId, remotePath);
    const totalBytes = stats.size;

    const transferId = generateId();
    const filename = path.basename(remotePath);
    let bytesTransferred = 0;

    this.onProgress(userId, {
      sessionId,
      transferId,
      filename,
      direction: 'download',
      bytesTransferred: 0,
      totalBytes,
      percentage: 0,
      status: 'transferring',
    });

    const readStream = session.sftp.createReadStream(remotePath);

    readStream.on('data', (chunk: Buffer) => {
      bytesTransferred += chunk.length;
      const percentage = totalBytes > 0 ? Math.round((bytesTransferred / totalBytes) * 100) : 100;

      this.onProgress(userId, {
        sessionId,
        transferId,
        filename,
        direction: 'download',
        bytesTransferred,
        totalBytes,
        percentage,
        status: 'transferring',
      });

      onData(chunk);
    });

    readStream.on('end', () => {
      this.onProgress(userId, {
        sessionId,
        transferId,
        filename,
        direction: 'download',
        bytesTransferred: totalBytes,
        totalBytes,
        percentage: 100,
        status: 'completed',
      });
      onEnd();
    });

    readStream.on('error', (err) => {
      this.onProgress(userId, {
        sessionId,
        transferId,
        filename,
        direction: 'download',
        bytesTransferred,
        totalBytes,
        percentage: Math.round((bytesTransferred / totalBytes) * 100),
        status: 'error',
        error: err.message,
      });
      onError(err);
    });

    return totalBytes;
  }

  async writeFile(
    sessionId: string,
    userId: string,
    remotePath: string,
    totalBytes: number
  ): Promise<{ transferId: string; writeStream: Writable }> {
    const session = this.getSession(sessionId, userId);
    if (!session) throw new Error('SFTP session not found');

    const transferId = generateId();
    const filename = path.basename(remotePath);
    let bytesTransferred = 0;

    this.onProgress(userId, {
      sessionId,
      transferId,
      filename,
      direction: 'upload',
      bytesTransferred: 0,
      totalBytes,
      percentage: 0,
      status: 'transferring',
    });

    const writeStream = session.sftp.createWriteStream(remotePath);

    // Track progress
    const originalWrite = writeStream.write.bind(writeStream);
    writeStream.write = (chunk: Buffer | string, ...args: any[]): boolean => {
      const len = Buffer.isBuffer(chunk) ? chunk.length : Buffer.byteLength(chunk);
      bytesTransferred += len;
      const percentage = totalBytes > 0 ? Math.round((bytesTransferred / totalBytes) * 100) : 100;

      this.onProgress(userId, {
        sessionId,
        transferId,
        filename,
        direction: 'upload',
        bytesTransferred,
        totalBytes,
        percentage,
        status: 'transferring',
      });

      return originalWrite(chunk, ...args);
    };

    writeStream.on('close', () => {
      this.onProgress(userId, {
        sessionId,
        transferId,
        filename,
        direction: 'upload',
        bytesTransferred: totalBytes,
        totalBytes,
        percentage: 100,
        status: 'completed',
      });
    });

    writeStream.on('error', (err) => {
      this.onProgress(userId, {
        sessionId,
        transferId,
        filename,
        direction: 'upload',
        bytesTransferred,
        totalBytes,
        percentage: Math.round((bytesTransferred / totalBytes) * 100),
        status: 'error',
        error: err.message,
      });
    });

    return { transferId, writeStream };
  }

  async mkdir(sessionId: string, userId: string, remotePath: string): Promise<void> {
    const session = this.getSession(sessionId, userId);
    if (!session) throw new Error('SFTP session not found');

    return new Promise((resolve, reject) => {
      session.sftp.mkdir(remotePath, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  async rmdir(sessionId: string, userId: string, remotePath: string): Promise<void> {
    const session = this.getSession(sessionId, userId);
    if (!session) throw new Error('SFTP session not found');

    return new Promise((resolve, reject) => {
      session.sftp.rmdir(remotePath, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  async unlink(sessionId: string, userId: string, remotePath: string): Promise<void> {
    const session = this.getSession(sessionId, userId);
    if (!session) throw new Error('SFTP session not found');

    return new Promise((resolve, reject) => {
      session.sftp.unlink(remotePath, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  async rename(sessionId: string, userId: string, oldPath: string, newPath: string): Promise<void> {
    const session = this.getSession(sessionId, userId);
    if (!session) throw new Error('SFTP session not found');

    return new Promise((resolve, reject) => {
      session.sftp.rename(oldPath, newPath, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  async chmod(sessionId: string, userId: string, remotePath: string, mode: number): Promise<void> {
    const session = this.getSession(sessionId, userId);
    if (!session) throw new Error('SFTP session not found');

    return new Promise((resolve, reject) => {
      session.sftp.chmod(remotePath, mode, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  getSession(sessionId: string, userId: string): SFTPSession | null {
    const session = this.sessions.get(sessionId);
    if (session && session.userId === userId) {
      return session;
    }
    return null;
  }

  getUserSessions(userId: string): Array<{ id: string; connectionId: string; connectionName: string; currentPath: string }> {
    const userSessions: Array<{ id: string; connectionId: string; connectionName: string; currentPath: string }> = [];
    for (const session of this.sessions.values()) {
      if (session.userId === userId) {
        userSessions.push({
          id: session.id,
          connectionId: session.connectionId,
          connectionName: session.connectionName,
          currentPath: session.currentPath,
        });
      }
    }
    return userSessions;
  }

  private modeToPermissions(mode: number): string {
    const types = ['---', '--x', '-w-', '-wx', 'r--', 'r-x', 'rw-', 'rwx'];
    const owner = types[(mode >> 6) & 7];
    const group = types[(mode >> 3) & 7];
    const other = types[mode & 7];

    let type = '-';
    if ((mode & 0o170000) === 0o040000) type = 'd';
    else if ((mode & 0o170000) === 0o120000) type = 'l';

    return type + owner + group + other;
  }
}
