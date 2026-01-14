/**
 * RDP connection service
 * Launches external RDP client with connection parameters
 */

import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import type { ServerConnection, Credential } from '@connectty/shared';

export class RDPService {
  /**
   * Launch RDP connection to a host
   */
  async connect(connection: ServerConnection, credential: Credential | null): Promise<void> {
    const platform = process.platform;

    switch (platform) {
      case 'win32':
        await this.connectWindows(connection, credential);
        break;
      case 'darwin':
        await this.connectMac(connection, credential);
        break;
      case 'linux':
        await this.connectLinux(connection, credential);
        break;
      default:
        throw new Error(`RDP not supported on platform: ${platform}`);
    }
  }

  /**
   * Windows: Use mstsc.exe with .rdp file
   */
  private async connectWindows(connection: ServerConnection, credential: Credential | null): Promise<void> {
    const rdpContent = this.generateRDPFile(connection, credential);
    const rdpPath = path.join(os.tmpdir(), `connectty-${connection.id}.rdp`);

    fs.writeFileSync(rdpPath, rdpContent);

    return new Promise((resolve, reject) => {
      const proc = spawn('mstsc.exe', [rdpPath], {
        detached: true,
        stdio: 'ignore',
      });

      proc.on('error', (err) => {
        fs.unlinkSync(rdpPath);
        reject(err);
      });

      proc.unref();

      // Clean up RDP file after a delay
      setTimeout(() => {
        try {
          fs.unlinkSync(rdpPath);
        } catch {
          // Ignore
        }
      }, 5000);

      resolve();
    });
  }

  /**
   * macOS: Use Microsoft Remote Desktop if installed, otherwise open with default handler
   */
  private async connectMac(connection: ServerConnection, credential: Credential | null): Promise<void> {
    const rdpContent = this.generateRDPFile(connection, credential);
    const rdpPath = path.join(os.tmpdir(), `connectty-${connection.id}.rdp`);

    fs.writeFileSync(rdpPath, rdpContent);

    return new Promise((resolve, reject) => {
      const proc = spawn('open', [rdpPath], {
        detached: true,
        stdio: 'ignore',
      });

      proc.on('error', (err) => {
        fs.unlinkSync(rdpPath);
        reject(err);
      });

      proc.unref();

      // Clean up RDP file after a delay
      setTimeout(() => {
        try {
          fs.unlinkSync(rdpPath);
        } catch {
          // Ignore
        }
      }, 5000);

      resolve();
    });
  }

  /**
   * Linux: Use xfreerdp, rdesktop, or remmina
   */
  private async connectLinux(connection: ServerConnection, credential: Credential | null): Promise<void> {
    const rdpClient = await this.findLinuxRDPClient();

    const host = `${connection.hostname}:${connection.port}`;
    const username = credential?.domain
      ? `${credential.domain}\\${credential.username}`
      : credential?.username || connection.username;

    let args: string[];

    switch (rdpClient) {
      case 'xfreerdp':
        args = [
          `/v:${host}`,
          '/cert:ignore',
          '/dynamic-resolution',
        ];
        if (username) args.push(`/u:${username}`);
        if (credential?.secret) args.push(`/p:${credential.secret}`);
        break;

      case 'rdesktop':
        args = [host];
        if (username) args.push('-u', username);
        if (credential?.secret) args.push('-p', credential.secret);
        break;

      case 'remmina':
        // Remmina uses connection files
        const remminaPath = path.join(os.tmpdir(), `connectty-${connection.id}.remmina`);
        const remminaContent = this.generateRemminaFile(connection, credential);
        fs.writeFileSync(remminaPath, remminaContent);
        args = ['-c', remminaPath];
        break;

      default:
        throw new Error('No RDP client found. Please install xfreerdp, rdesktop, or remmina.');
    }

    return new Promise((resolve, reject) => {
      const proc = spawn(rdpClient, args, {
        detached: true,
        stdio: 'ignore',
      });

      proc.on('error', reject);
      proc.unref();
      resolve();
    });
  }

  /**
   * Find available RDP client on Linux
   */
  private async findLinuxRDPClient(): Promise<string> {
    const clients = ['xfreerdp', 'rdesktop', 'remmina'];

    for (const client of clients) {
      try {
        const { execSync } = require('child_process');
        execSync(`which ${client}`, { stdio: 'ignore' });
        return client;
      } catch {
        continue;
      }
    }

    throw new Error('No RDP client found');
  }

  /**
   * Generate .rdp file content
   */
  private generateRDPFile(connection: ServerConnection, credential: Credential | null): string {
    const lines: string[] = [
      `full address:s:${connection.hostname}:${connection.port}`,
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

    if (credential) {
      const username = credential.domain
        ? `${credential.domain}\\${credential.username}`
        : credential.username;
      lines.push(`username:s:${username}`);

      // Note: Password in .rdp files requires encryption
      // For now, we'll prompt for credentials
      if (credential.domain) {
        lines.push(`domain:s:${credential.domain}`);
      }
    }

    return lines.join('\r\n');
  }

  /**
   * Generate Remmina connection file
   */
  private generateRemminaFile(connection: ServerConnection, credential: Credential | null): string {
    const lines: string[] = [
      '[remmina]',
      'name=Connectty - ' + connection.name,
      'protocol=RDP',
      `server=${connection.hostname}:${connection.port}`,
      'colordepth=32',
      'quality=2',
      'viewmode=1',
      'disableclipboard=0',
    ];

    if (credential) {
      const username = credential.domain
        ? `${credential.domain}\\${credential.username}`
        : credential.username;
      lines.push(`username=${username}`);
      if (credential.domain) {
        lines.push(`domain=${credential.domain}`);
      }
    }

    return lines.join('\n');
  }
}
