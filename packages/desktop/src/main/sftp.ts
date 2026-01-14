/**
 * SFTP service for file transfers
 */

import { Client, SFTPWrapper } from 'ssh2';
import * as fs from 'fs';
import * as path from 'path';
import { generateId } from '@connectty/shared';
import type { ServerConnection, Credential } from '@connectty/shared';

export interface SFTPSession {
  id: string;
  connectionId: string;
  connectionName: string;
  client: Client;
  sftp: SFTPWrapper;
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
  modifiedAt: Date;
  accessedAt: Date;
}

export interface LocalFileInfo {
  name: string;
  path: string;
  size: number;
  isDirectory: boolean;
  isSymlink: boolean;
  modifiedAt: Date;
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

type ProgressCallback = (progress: TransferProgress) => void;

export class SFTPService {
  private sessions: Map<string, SFTPSession> = new Map();
  private onProgress: ProgressCallback;

  constructor(onProgress: ProgressCallback) {
    this.onProgress = onProgress;
  }

  async connect(connection: ServerConnection, credential: Credential | null): Promise<string> {
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
            connectionId: connection.id,
            connectionName: connection.name,
            client,
            sftp,
          };

          this.sessions.set(sessionId, session);
          resolve(sessionId);
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
            config.agent = process.env.SSH_AUTH_SOCK;
            break;
        }
      } else {
        if (process.platform === 'win32') {
          config.agent = '\\\\.\\pipe\\openssh-ssh-agent';
        } else if (process.env.SSH_AUTH_SOCK) {
          config.agent = process.env.SSH_AUTH_SOCK;
        }
      }

      client.connect(config);
    });
  }

  disconnect(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.sftp.end();
      session.client.end();
      this.sessions.delete(sessionId);
    }
  }

  disconnectAll(): void {
    for (const sessionId of this.sessions.keys()) {
      this.disconnect(sessionId);
    }
  }

  async listRemoteDirectory(sessionId: string, remotePath: string): Promise<RemoteFileInfo[]> {
    const session = this.sessions.get(sessionId);
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

          // Convert mode to permission string
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
            modifiedAt: new Date((item.attrs.mtime || 0) * 1000),
            accessedAt: new Date((item.attrs.atime || 0) * 1000),
          };
        });

        // Sort: directories first, then by name
        files.sort((a, b) => {
          if (a.isDirectory && !b.isDirectory) return -1;
          if (!a.isDirectory && b.isDirectory) return 1;
          return a.name.localeCompare(b.name);
        });

        resolve(files);
      });
    });
  }

  async listLocalDirectory(localPath: string): Promise<LocalFileInfo[]> {
    const entries = await fs.promises.readdir(localPath, { withFileTypes: true });

    const files: LocalFileInfo[] = await Promise.all(
      entries.map(async (entry) => {
        const fullPath = path.join(localPath, entry.name);
        let stats: fs.Stats;

        try {
          stats = await fs.promises.stat(fullPath);
        } catch {
          // If we can't stat, return minimal info
          return {
            name: entry.name,
            path: fullPath,
            size: 0,
            isDirectory: entry.isDirectory(),
            isSymlink: entry.isSymbolicLink(),
            modifiedAt: new Date(),
          };
        }

        return {
          name: entry.name,
          path: fullPath,
          size: stats.size,
          isDirectory: stats.isDirectory(),
          isSymlink: stats.isSymbolicLink(),
          modifiedAt: stats.mtime,
        };
      })
    );

    // Sort: directories first, then by name
    files.sort((a, b) => {
      if (a.isDirectory && !b.isDirectory) return -1;
      if (!a.isDirectory && b.isDirectory) return 1;
      return a.name.localeCompare(b.name);
    });

    return files;
  }

  async upload(
    sessionId: string,
    localPath: string,
    remotePath: string
  ): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error('SFTP session not found');

    const transferId = generateId();
    const filename = path.basename(localPath);
    const stats = await fs.promises.stat(localPath);
    const totalBytes = stats.size;

    return new Promise((resolve, reject) => {
      const readStream = fs.createReadStream(localPath);
      const writeStream = session.sftp.createWriteStream(remotePath);

      let bytesTransferred = 0;

      this.onProgress({
        sessionId,
        transferId,
        filename,
        direction: 'upload',
        bytesTransferred: 0,
        totalBytes,
        percentage: 0,
        status: 'transferring',
      });

      readStream.on('data', (chunk: Buffer | string) => {
        const len = typeof chunk === 'string' ? Buffer.byteLength(chunk) : chunk.length;
        bytesTransferred += len;
        const percentage = totalBytes > 0 ? Math.round((bytesTransferred / totalBytes) * 100) : 100;

        this.onProgress({
          sessionId,
          transferId,
          filename,
          direction: 'upload',
          bytesTransferred,
          totalBytes,
          percentage,
          status: 'transferring',
        });
      });

      writeStream.on('close', () => {
        this.onProgress({
          sessionId,
          transferId,
          filename,
          direction: 'upload',
          bytesTransferred: totalBytes,
          totalBytes,
          percentage: 100,
          status: 'completed',
        });
        resolve();
      });

      writeStream.on('error', (err: Error) => {
        this.onProgress({
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
        reject(err);
      });

      readStream.on('error', (err: Error) => {
        this.onProgress({
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
        reject(err);
      });

      readStream.pipe(writeStream);
    });
  }

  async download(
    sessionId: string,
    remotePath: string,
    localPath: string
  ): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error('SFTP session not found');

    const transferId = generateId();
    const filename = path.basename(remotePath);

    // Get remote file size
    const stats = await this.statRemote(sessionId, remotePath);
    const totalBytes = stats.size;

    return new Promise((resolve, reject) => {
      const readStream = session.sftp.createReadStream(remotePath);
      const writeStream = fs.createWriteStream(localPath);

      let bytesTransferred = 0;

      this.onProgress({
        sessionId,
        transferId,
        filename,
        direction: 'download',
        bytesTransferred: 0,
        totalBytes,
        percentage: 0,
        status: 'transferring',
      });

      readStream.on('data', (chunk: Buffer | string) => {
        const len = typeof chunk === 'string' ? Buffer.byteLength(chunk) : chunk.length;
        bytesTransferred += len;
        const percentage = totalBytes > 0 ? Math.round((bytesTransferred / totalBytes) * 100) : 100;

        this.onProgress({
          sessionId,
          transferId,
          filename,
          direction: 'download',
          bytesTransferred,
          totalBytes,
          percentage,
          status: 'transferring',
        });
      });

      writeStream.on('close', () => {
        this.onProgress({
          sessionId,
          transferId,
          filename,
          direction: 'download',
          bytesTransferred: totalBytes,
          totalBytes,
          percentage: 100,
          status: 'completed',
        });
        resolve();
      });

      writeStream.on('error', (err: Error) => {
        this.onProgress({
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
        reject(err);
      });

      readStream.on('error', (err: Error) => {
        this.onProgress({
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
        reject(err);
      });

      readStream.pipe(writeStream);
    });
  }

  async statRemote(sessionId: string, remotePath: string): Promise<RemoteFileInfo> {
    const session = this.sessions.get(sessionId);
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
          modifiedAt: new Date((stats.mtime || 0) * 1000),
          accessedAt: new Date((stats.atime || 0) * 1000),
        });
      });
    });
  }

  async mkdir(sessionId: string, remotePath: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error('SFTP session not found');

    return new Promise((resolve, reject) => {
      session.sftp.mkdir(remotePath, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  async rmdir(sessionId: string, remotePath: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error('SFTP session not found');

    return new Promise((resolve, reject) => {
      session.sftp.rmdir(remotePath, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  async unlink(sessionId: string, remotePath: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error('SFTP session not found');

    return new Promise((resolve, reject) => {
      session.sftp.unlink(remotePath, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  async rename(sessionId: string, oldPath: string, newPath: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error('SFTP session not found');

    return new Promise((resolve, reject) => {
      session.sftp.rename(oldPath, newPath, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  async chmod(sessionId: string, remotePath: string, mode: number): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error('SFTP session not found');

    return new Promise((resolve, reject) => {
      session.sftp.chmod(remotePath, mode, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  getHomePath(): string {
    return process.env.HOME || process.env.USERPROFILE || '/';
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

  getActiveSessions(): string[] {
    return Array.from(this.sessions.keys());
  }

  getSession(sessionId: string): SFTPSession | undefined {
    return this.sessions.get(sessionId);
  }
}
