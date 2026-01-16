/**
 * Sync service for backup and export functionality
 * Supports file import/export, server sync, and OAuth cloud sync
 */

import { createSyncData, parseSSHConfig, parseCSV, exportToCSV } from '@connectty/shared';
import type { ImportOptions, ExportOptions, SyncData, ServerConnection, Credential, ConnectionGroup, Provider, SavedCommand } from '@connectty/shared';
import type { DatabaseService } from './database';
import type { SyncAccount, SyncConfigInfo } from './preload';
import dns from 'dns/promises';
import net from 'net';
import os from 'os';
import crypto from 'crypto';
import { shell, BrowserWindow } from 'electron';
import http from 'http';

/**
 * Resolve a hostname to an IP address.
 * Returns the original value if it's already an IP or if resolution fails.
 */
async function resolveHostnameToIP(hostname: string): Promise<string> {
  // If it's already an IP address, return it as-is
  if (net.isIP(hostname)) {
    return hostname;
  }

  try {
    const result = await dns.lookup(hostname);
    return result.address;
  } catch {
    // If DNS resolution fails, return the original hostname
    return hostname;
  }
}

export class SyncService {
  private db: DatabaseService;

  constructor(db: DatabaseService) {
    this.db = db;
  }

  async importData(content: string, options: ImportOptions): Promise<{ connections: number; credentials: number; groups: number }> {
    let imported = { connections: 0, credentials: 0, groups: 0 };

    switch (options.format) {
      case 'json': {
        const data = JSON.parse(content) as SyncData;
        imported = await this.importSyncData(data, options);
        break;
      }
      case 'csv': {
        const connections = parseCSV(content);
        for (const conn of connections) {
          if (conn.name && conn.hostname) {
            const resolvedIP = await resolveHostnameToIP(conn.hostname);
            this.db.createConnection({
              name: conn.name,
              hostname: resolvedIP,
              port: conn.port || 22,
              connectionType: 'ssh',
              username: conn.username,
              tags: conn.tags || [],
              group: conn.group,
              description: conn.description,
            });
            imported.connections++;
          }
        }
        break;
      }
      case 'ssh_config': {
        const connections = parseSSHConfig(content);
        for (const conn of connections) {
          if (conn.name && conn.hostname) {
            const resolvedIP = await resolveHostnameToIP(conn.hostname);
            this.db.createConnection({
              name: conn.name,
              hostname: resolvedIP,
              port: conn.port || 22,
              connectionType: 'ssh',
              username: conn.username,
              tags: conn.tags || [],
            });
            imported.connections++;
          }
        }
        break;
      }
      case 'putty': {
        // PuTTY session import would require registry reading on Windows
        // For now, support JSON export from PuTTY session manager tools
        try {
          const sessions = JSON.parse(content) as Array<{
            name: string;
            hostname: string;
            port?: number;
            username?: string;
          }>;
          for (const session of sessions) {
            const resolvedIP = await resolveHostnameToIP(session.hostname);
            this.db.createConnection({
              name: session.name,
              hostname: resolvedIP,
              port: session.port || 22,
              connectionType: 'ssh',
              username: session.username,
              tags: ['imported', 'putty'],
            });
            imported.connections++;
          }
        } catch {
          // Invalid format
        }
        break;
      }
    }

    return imported;
  }

  private async importSyncData(
    data: SyncData,
    options: ImportOptions
  ): Promise<{ connections: number; credentials: number; groups: number }> {
    const imported = { connections: 0, credentials: 0, groups: 0 };

    // Import groups first
    const groupIdMap = new Map<string, string>();
    for (const group of data.groups || []) {
      const newGroup = this.db.createGroup({
        name: group.name,
        description: group.description,
        parentId: group.parentId ? groupIdMap.get(group.parentId) : undefined,
        color: group.color,
      });
      groupIdMap.set(group.id, newGroup.id);
      imported.groups++;
    }

    // Import credentials if allowed
    const credentialIdMap = new Map<string, string>();
    if (options.mergeCredentials) {
      for (const cred of data.credentials || []) {
        const newCred = this.db.createCredential({
          name: cred.name,
          type: cred.type,
          username: cred.username,
          secret: cred.secret,
          privateKey: cred.privateKey,
          passphrase: cred.passphrase,
        });
        credentialIdMap.set(cred.id, newCred.id);
        imported.credentials++;
      }
    }

    // Import connections
    for (const conn of data.connections || []) {
      const resolvedIP = await resolveHostnameToIP(conn.hostname);
      this.db.createConnection({
        name: conn.name,
        hostname: resolvedIP,
        port: conn.port,
        connectionType: conn.connectionType || 'ssh',
        osType: conn.osType,
        username: conn.username,
        credentialId: conn.credentialId ? credentialIdMap.get(conn.credentialId) : undefined,
        tags: conn.tags,
        group: conn.group ? groupIdMap.get(conn.group) : undefined,
        description: conn.description,
      });
      imported.connections++;
    }

    return imported;
  }

  exportData(options: ExportOptions): string {
    const { connections, credentials, groups } = this.db.exportAll();

    if (options.format === 'csv') {
      return exportToCSV(connections);
    }

    // JSON export
    const exportData: SyncData = {
      version: '1.0.0',
      exportedAt: new Date(),
      exportedBy: 'desktop-client',
      connections,
      groups,
      credentials: options.includeCredentials ? this.sanitizeCredentials(credentials, options.encryptSecrets) : [],
    };

    return JSON.stringify(exportData, null, 2);
  }

  private sanitizeCredentials(credentials: Credential[], encrypt: boolean): Credential[] {
    if (encrypt) {
      // Return credentials with secrets intact (they're encrypted at rest)
      return credentials;
    }

    // Remove secrets for non-encrypted export
    return credentials.map((cred) => ({
      ...cred,
      secret: undefined,
      privateKey: undefined,
      passphrase: undefined,
    }));
  }

  async pushToServer(serverUrl: string, token: string): Promise<boolean> {
    const data = this.exportData({ format: 'json', includeCredentials: true, encryptSecrets: true });

    const response = await fetch(`${serverUrl}/api/sync/push`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: data,
    });

    return response.ok;
  }

  async pullFromServer(serverUrl: string, token: string): Promise<{ connections: number; credentials: number; groups: number }> {
    const response = await fetch(`${serverUrl}/api/sync/pull`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      throw new Error('Failed to pull from server');
    }

    const data = (await response.json()) as SyncData;
    return this.importSyncData(data, { format: 'json', overwrite: false, mergeCredentials: true });
  }
}

/**
 * Extended sync data that includes providers and commands
 */
interface ExtendedSyncData extends SyncData {
  providers?: Provider[];
  commands?: SavedCommand[];
  theme?: string;
  deviceName?: string;
  deviceId?: string;
}

/**
 * Cloud Sync Service - OAuth-based sync with Microsoft, Google, and GitHub
 */
export class CloudSyncService {
  private db: DatabaseService;
  private accounts: Map<string, SyncAccount> = new Map();
  private deviceId: string;
  private deviceName: string;

  // OAuth configuration
  private readonly OAUTH_CONFIG = {
    microsoft: {
      clientId: 'YOUR_MICROSOFT_CLIENT_ID', // To be configured by user
      authUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
      tokenUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
      scope: 'openid profile email Files.ReadWrite.AppFolder offline_access',
      redirectUri: 'http://localhost:19283/callback',
    },
    google: {
      clientId: 'YOUR_GOOGLE_CLIENT_ID', // To be configured by user
      authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
      tokenUrl: 'https://oauth2.googleapis.com/token',
      scope: 'openid email profile https://www.googleapis.com/auth/drive.appdata',
      redirectUri: 'http://localhost:19283/callback',
    },
    github: {
      clientId: 'YOUR_GITHUB_CLIENT_ID', // To be configured by user
      authUrl: 'https://github.com/login/oauth/authorize',
      tokenUrl: 'https://github.com/login/oauth/access_token',
      scope: 'gist read:user user:email',
      redirectUri: 'http://localhost:19283/callback',
    },
  };

  constructor(db: DatabaseService) {
    this.db = db;
    this.deviceId = this.getOrCreateDeviceId();
    this.deviceName = os.hostname();
    this.loadAccounts();
  }

  private getOrCreateDeviceId(): string {
    // Try to load existing device ID from settings
    const settings = this.db.getSettings?.() || {};
    if (settings.deviceId) {
      return settings.deviceId;
    }
    // Generate new device ID
    const deviceId = crypto.randomUUID();
    this.db.setSettings?.({ ...settings, deviceId });
    return deviceId;
  }

  private loadAccounts(): void {
    const settings = this.db.getSettings?.() || {};
    const accounts = settings.syncAccounts || [];
    for (const account of accounts) {
      this.accounts.set(account.id, account);
    }
  }

  private saveAccounts(): void {
    const accounts = Array.from(this.accounts.values());
    const settings = this.db.getSettings?.() || {};
    this.db.setSettings?.({ ...settings, syncAccounts: accounts });
  }

  getAccounts(): SyncAccount[] {
    return Array.from(this.accounts.values());
  }

  /**
   * Start OAuth flow to connect a new cloud account
   */
  async connect(provider: 'microsoft' | 'google' | 'github'): Promise<SyncAccount | null> {
    const config = this.OAUTH_CONFIG[provider];
    const state = crypto.randomBytes(16).toString('hex');
    const codeVerifier = crypto.randomBytes(32).toString('base64url');
    const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url');

    // Build authorization URL
    const authParams = new URLSearchParams({
      client_id: config.clientId,
      redirect_uri: config.redirectUri,
      response_type: 'code',
      scope: config.scope,
      state,
      ...(provider !== 'github' && {
        code_challenge: codeChallenge,
        code_challenge_method: 'S256',
      }),
    });

    const authUrl = `${config.authUrl}?${authParams.toString()}`;

    // Start local HTTP server and wait for callback
    const authCode = await this.startOAuthCallbackAndOpenBrowser(state, authUrl);
    if (!authCode) {
      return null;
    }

    // Exchange code for tokens
    const tokens = await this.exchangeCodeForTokens(provider, authCode, codeVerifier);
    if (!tokens) {
      return null;
    }

    // Get user info
    const userInfo = await this.getUserInfo(provider, tokens.accessToken);
    if (!userInfo) {
      return null;
    }

    // Create account
    const account: SyncAccount = {
      id: crypto.randomUUID(),
      provider,
      email: userInfo.email,
      displayName: userInfo.displayName,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresAt: tokens.expiresAt,
      connectedAt: new Date().toISOString(),
    };

    this.accounts.set(account.id, account);
    this.saveAccounts();

    return account;
  }

  /**
   * Start a local HTTP server to receive OAuth callback and open the browser
   */
  private startOAuthCallbackAndOpenBrowser(expectedState: string, authUrl: string): Promise<string | null> {
    return new Promise((resolve) => {
      const server = http.createServer((req, res) => {
        const url = new URL(req.url || '', `http://localhost:19283`);
        const code = url.searchParams.get('code');
        const state = url.searchParams.get('state');

        if (state !== expectedState) {
          res.writeHead(400, { 'Content-Type': 'text/html' });
          res.end('<html><body><h1>Error: State mismatch</h1></body></html>');
          server.close();
          resolve(null);
          return;
        }

        if (code) {
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end('<html><body><h1>Authorization successful!</h1><p>You can close this window and return to Connectty.</p><script>window.close();</script></body></html>');
          server.close();
          resolve(code);
        } else {
          res.writeHead(400, { 'Content-Type': 'text/html' });
          res.end('<html><body><h1>Error: No authorization code received</h1></body></html>');
          server.close();
          resolve(null);
        }
      });

      server.listen(19283, '127.0.0.1', () => {
        // Server is now listening, open the browser
        shell.openExternal(authUrl);
      });

      // Timeout after 5 minutes
      setTimeout(() => {
        server.close();
        resolve(null);
      }, 5 * 60 * 1000);
    });
  }

  /**
   * Exchange authorization code for access tokens
   */
  private async exchangeCodeForTokens(
    provider: 'microsoft' | 'google' | 'github',
    code: string,
    codeVerifier: string
  ): Promise<{ accessToken: string; refreshToken?: string; expiresAt?: number } | null> {
    const config = this.OAUTH_CONFIG[provider];

    const params = new URLSearchParams({
      client_id: config.clientId,
      code,
      redirect_uri: config.redirectUri,
      grant_type: 'authorization_code',
      ...(provider !== 'github' && { code_verifier: codeVerifier }),
    });

    try {
      const response = await fetch(config.tokenUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          ...(provider === 'github' && { Accept: 'application/json' }),
        },
        body: params.toString(),
      });

      if (!response.ok) {
        console.error('Token exchange failed:', await response.text());
        return null;
      }

      const data = await response.json();
      return {
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        expiresAt: data.expires_in ? Date.now() + data.expires_in * 1000 : undefined,
      };
    } catch (error) {
      console.error('Token exchange error:', error);
      return null;
    }
  }

  /**
   * Get user info from the provider
   */
  private async getUserInfo(
    provider: 'microsoft' | 'google' | 'github',
    accessToken: string
  ): Promise<{ email: string; displayName?: string } | null> {
    try {
      let response: Response;
      let data: any;

      switch (provider) {
        case 'microsoft':
          response = await fetch('https://graph.microsoft.com/v1.0/me', {
            headers: { Authorization: `Bearer ${accessToken}` },
          });
          data = await response.json();
          return { email: data.mail || data.userPrincipalName, displayName: data.displayName };

        case 'google':
          response = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
            headers: { Authorization: `Bearer ${accessToken}` },
          });
          data = await response.json();
          return { email: data.email, displayName: data.name };

        case 'github':
          response = await fetch('https://api.github.com/user', {
            headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/vnd.github.v3+json' },
          });
          data = await response.json();
          // Get email separately if not public
          let email = data.email;
          if (!email) {
            const emailResponse = await fetch('https://api.github.com/user/emails', {
              headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/vnd.github.v3+json' },
            });
            const emails = await emailResponse.json();
            email = emails.find((e: any) => e.primary)?.email || emails[0]?.email;
          }
          return { email, displayName: data.name || data.login };
      }
    } catch (error) {
      console.error('Get user info error:', error);
      return null;
    }
  }

  /**
   * Disconnect a cloud account
   */
  async disconnect(accountId: string): Promise<boolean> {
    if (!this.accounts.has(accountId)) {
      return false;
    }
    this.accounts.delete(accountId);
    this.saveAccounts();
    return true;
  }

  /**
   * Upload configuration to cloud storage
   */
  async upload(accountId: string): Promise<{ success: boolean; configId?: string; error?: string }> {
    const account = this.accounts.get(accountId);
    if (!account) {
      return { success: false, error: 'Account not found' };
    }

    try {
      // Refresh token if needed
      await this.refreshTokenIfNeeded(account);

      // Build sync data
      const syncData = this.buildSyncData();
      const content = JSON.stringify(syncData, null, 2);
      const filename = `connectty-config-${this.deviceId}.json`;

      // Upload based on provider
      switch (account.provider) {
        case 'microsoft':
          return await this.uploadToOneDrive(account, filename, content);
        case 'google':
          return await this.uploadToGoogleDrive(account, filename, content);
        case 'github':
          return await this.uploadToGist(account, filename, content);
        default:
          return { success: false, error: 'Unknown provider' };
      }
    } catch (error) {
      return { success: false, error: String(error) };
    }
  }

  /**
   * List available configurations from cloud storage
   */
  async listConfigs(accountId: string): Promise<{ success: boolean; configs?: SyncConfigInfo[]; error?: string }> {
    const account = this.accounts.get(accountId);
    if (!account) {
      return { success: false, error: 'Account not found' };
    }

    try {
      await this.refreshTokenIfNeeded(account);

      switch (account.provider) {
        case 'microsoft':
          return await this.listOneDriveConfigs(account);
        case 'google':
          return await this.listGoogleDriveConfigs(account);
        case 'github':
          return await this.listGistConfigs(account);
        default:
          return { success: false, error: 'Unknown provider' };
      }
    } catch (error) {
      return { success: false, error: String(error) };
    }
  }

  /**
   * Import configuration from cloud storage
   */
  async importConfig(
    accountId: string,
    configId: string
  ): Promise<{
    success: boolean;
    imported?: { connections: number; credentials: number; groups: number; providers: number; commands: number };
    error?: string;
  }> {
    const account = this.accounts.get(accountId);
    if (!account) {
      return { success: false, error: 'Account not found' };
    }

    try {
      await this.refreshTokenIfNeeded(account);

      let content: string;
      switch (account.provider) {
        case 'microsoft':
          content = await this.downloadFromOneDrive(account, configId);
          break;
        case 'google':
          content = await this.downloadFromGoogleDrive(account, configId);
          break;
        case 'github':
          content = await this.downloadFromGist(account, configId);
          break;
        default:
          return { success: false, error: 'Unknown provider' };
      }

      const data = JSON.parse(content) as ExtendedSyncData;
      const imported = await this.importSyncData(data);
      return { success: true, imported };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  }

  private buildSyncData(): ExtendedSyncData {
    const { connections, credentials, groups } = this.db.exportAll();
    const providers = this.db.getProviders();
    const commands = this.db.getSavedCommands();
    const settings = this.db.getSettings?.() || {};

    return {
      version: '1.0.0',
      exportedAt: new Date(),
      exportedBy: 'desktop-client',
      deviceName: this.deviceName,
      deviceId: this.deviceId,
      connections,
      credentials,
      groups,
      providers,
      commands,
      theme: settings.theme,
    };
  }

  private async importSyncData(
    data: ExtendedSyncData
  ): Promise<{ connections: number; credentials: number; groups: number; providers: number; commands: number }> {
    const imported = { connections: 0, credentials: 0, groups: 0, providers: 0, commands: 0 };

    // Import groups first
    const groupIdMap = new Map<string, string>();
    for (const group of data.groups || []) {
      const newGroup = this.db.createGroup({
        name: group.name,
        description: group.description,
        parentId: group.parentId ? groupIdMap.get(group.parentId) : undefined,
        color: group.color,
      });
      groupIdMap.set(group.id, newGroup.id);
      imported.groups++;
    }

    // Import credentials
    const credentialIdMap = new Map<string, string>();
    for (const cred of data.credentials || []) {
      const newCred = this.db.createCredential({
        name: cred.name,
        type: cred.type,
        username: cred.username,
        secret: cred.secret,
        privateKey: cred.privateKey,
        passphrase: cred.passphrase,
      });
      credentialIdMap.set(cred.id, newCred.id);
      imported.credentials++;
    }

    // Import providers
    const providerIdMap = new Map<string, string>();
    for (const provider of data.providers || []) {
      const newProvider = this.db.createProvider({
        name: provider.name,
        type: provider.type,
        config: provider.config,
        enabled: provider.enabled,
      });
      providerIdMap.set(provider.id, newProvider.id);
      imported.providers++;
    }

    // Import connections
    for (const conn of data.connections || []) {
      this.db.createConnection({
        name: conn.name,
        hostname: conn.hostname,
        port: conn.port,
        connectionType: conn.connectionType || 'ssh',
        osType: conn.osType,
        username: conn.username,
        credentialId: conn.credentialId ? credentialIdMap.get(conn.credentialId) : undefined,
        providerId: conn.providerId ? providerIdMap.get(conn.providerId) : undefined,
        tags: conn.tags,
        group: conn.group ? groupIdMap.get(conn.group) : undefined,
        description: conn.description,
      });
      imported.connections++;
    }

    // Import commands
    for (const cmd of data.commands || []) {
      this.db.createSavedCommand({
        name: cmd.name,
        command: cmd.command,
        description: cmd.description,
        category: cmd.category,
        targetOS: cmd.targetOS,
        variables: cmd.variables,
      });
      imported.commands++;
    }

    // Import theme
    if (data.theme) {
      const settings = this.db.getSettings?.() || {};
      this.db.setSettings?.({ ...settings, theme: data.theme });
    }

    return imported;
  }

  private async refreshTokenIfNeeded(account: SyncAccount): Promise<void> {
    if (!account.expiresAt || account.expiresAt > Date.now() + 60000) {
      return; // Token still valid for at least 1 minute
    }

    if (!account.refreshToken) {
      throw new Error('Token expired and no refresh token available');
    }

    const config = this.OAUTH_CONFIG[account.provider];
    const params = new URLSearchParams({
      client_id: config.clientId,
      refresh_token: account.refreshToken,
      grant_type: 'refresh_token',
    });

    const response = await fetch(config.tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });

    if (!response.ok) {
      throw new Error('Failed to refresh token');
    }

    const data = await response.json();
    account.accessToken = data.access_token;
    if (data.refresh_token) {
      account.refreshToken = data.refresh_token;
    }
    account.expiresAt = Date.now() + data.expires_in * 1000;
    this.saveAccounts();
  }

  // OneDrive implementation
  private async uploadToOneDrive(
    account: SyncAccount,
    filename: string,
    content: string
  ): Promise<{ success: boolean; configId?: string; error?: string }> {
    const response = await fetch(
      `https://graph.microsoft.com/v1.0/me/drive/special/approot:/${filename}:/content`,
      {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${account.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: content,
      }
    );

    if (!response.ok) {
      return { success: false, error: await response.text() };
    }

    const data = await response.json();
    return { success: true, configId: data.id };
  }

  private async listOneDriveConfigs(account: SyncAccount): Promise<{ success: boolean; configs?: SyncConfigInfo[]; error?: string }> {
    const response = await fetch(
      `https://graph.microsoft.com/v1.0/me/drive/special/approot/children?$filter=startswith(name,'connectty-config-')`,
      {
        headers: { Authorization: `Bearer ${account.accessToken}` },
      }
    );

    if (!response.ok) {
      return { success: false, error: await response.text() };
    }

    const data = await response.json();
    const configs: SyncConfigInfo[] = [];

    for (const item of data.value || []) {
      // Parse device info from filename
      const match = item.name.match(/connectty-config-(.+)\.json/);
      configs.push({
        id: item.id,
        deviceName: match ? match[1] : 'Unknown',
        deviceId: match ? match[1] : item.id,
        uploadedAt: item.lastModifiedDateTime,
        connectionCount: 0, // Would need to download to get actual counts
        credentialCount: 0,
      });
    }

    return { success: true, configs };
  }

  private async downloadFromOneDrive(account: SyncAccount, configId: string): Promise<string> {
    const response = await fetch(
      `https://graph.microsoft.com/v1.0/me/drive/items/${configId}/content`,
      {
        headers: { Authorization: `Bearer ${account.accessToken}` },
      }
    );

    if (!response.ok) {
      throw new Error('Failed to download from OneDrive');
    }

    return await response.text();
  }

  // Google Drive implementation
  private async uploadToGoogleDrive(
    account: SyncAccount,
    filename: string,
    content: string
  ): Promise<{ success: boolean; configId?: string; error?: string }> {
    // Check if file exists
    const searchResponse = await fetch(
      `https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&q=name='${filename}'`,
      {
        headers: { Authorization: `Bearer ${account.accessToken}` },
      }
    );

    const searchData = await searchResponse.json();
    const existingFile = searchData.files?.[0];

    if (existingFile) {
      // Update existing file
      const response = await fetch(
        `https://www.googleapis.com/upload/drive/v3/files/${existingFile.id}?uploadType=media`,
        {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${account.accessToken}`,
            'Content-Type': 'application/json',
          },
          body: content,
        }
      );

      if (!response.ok) {
        return { success: false, error: await response.text() };
      }

      return { success: true, configId: existingFile.id };
    } else {
      // Create new file
      const metadata = {
        name: filename,
        parents: ['appDataFolder'],
      };

      const formData = new FormData();
      formData.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
      formData.append('file', new Blob([content], { type: 'application/json' }));

      const response = await fetch(
        'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart',
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${account.accessToken}` },
          body: formData,
        }
      );

      if (!response.ok) {
        return { success: false, error: await response.text() };
      }

      const data = await response.json();
      return { success: true, configId: data.id };
    }
  }

  private async listGoogleDriveConfigs(account: SyncAccount): Promise<{ success: boolean; configs?: SyncConfigInfo[]; error?: string }> {
    const response = await fetch(
      `https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&q=name contains 'connectty-config-'&fields=files(id,name,modifiedTime)`,
      {
        headers: { Authorization: `Bearer ${account.accessToken}` },
      }
    );

    if (!response.ok) {
      return { success: false, error: await response.text() };
    }

    const data = await response.json();
    const configs: SyncConfigInfo[] = [];

    for (const item of data.files || []) {
      const match = item.name.match(/connectty-config-(.+)\.json/);
      configs.push({
        id: item.id,
        deviceName: match ? match[1] : 'Unknown',
        deviceId: match ? match[1] : item.id,
        uploadedAt: item.modifiedTime,
        connectionCount: 0,
        credentialCount: 0,
      });
    }

    return { success: true, configs };
  }

  private async downloadFromGoogleDrive(account: SyncAccount, configId: string): Promise<string> {
    const response = await fetch(
      `https://www.googleapis.com/drive/v3/files/${configId}?alt=media`,
      {
        headers: { Authorization: `Bearer ${account.accessToken}` },
      }
    );

    if (!response.ok) {
      throw new Error('Failed to download from Google Drive');
    }

    return await response.text();
  }

  // GitHub Gists implementation
  private async uploadToGist(
    account: SyncAccount,
    filename: string,
    content: string
  ): Promise<{ success: boolean; configId?: string; error?: string }> {
    // Check for existing gist
    const gistsResponse = await fetch('https://api.github.com/gists', {
      headers: {
        Authorization: `Bearer ${account.accessToken}`,
        Accept: 'application/vnd.github.v3+json',
      },
    });

    const gists = await gistsResponse.json();
    const existingGist = gists.find((g: any) => g.files[filename]);

    if (existingGist) {
      // Update existing gist
      const response = await fetch(`https://api.github.com/gists/${existingGist.id}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${account.accessToken}`,
          Accept: 'application/vnd.github.v3+json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          files: { [filename]: { content } },
        }),
      });

      if (!response.ok) {
        return { success: false, error: await response.text() };
      }

      return { success: true, configId: existingGist.id };
    } else {
      // Create new gist
      const response = await fetch('https://api.github.com/gists', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${account.accessToken}`,
          Accept: 'application/vnd.github.v3+json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          description: 'Connectty Configuration Backup',
          public: false,
          files: { [filename]: { content } },
        }),
      });

      if (!response.ok) {
        return { success: false, error: await response.text() };
      }

      const data = await response.json();
      return { success: true, configId: data.id };
    }
  }

  private async listGistConfigs(account: SyncAccount): Promise<{ success: boolean; configs?: SyncConfigInfo[]; error?: string }> {
    const response = await fetch('https://api.github.com/gists', {
      headers: {
        Authorization: `Bearer ${account.accessToken}`,
        Accept: 'application/vnd.github.v3+json',
      },
    });

    if (!response.ok) {
      return { success: false, error: await response.text() };
    }

    const gists = await response.json();
    const configs: SyncConfigInfo[] = [];

    for (const gist of gists) {
      const configFile = Object.entries(gist.files).find(([name]) => name.startsWith('connectty-config-'));
      if (configFile) {
        const match = configFile[0].match(/connectty-config-(.+)\.json/);
        configs.push({
          id: gist.id,
          deviceName: match ? match[1] : 'Unknown',
          deviceId: match ? match[1] : gist.id,
          uploadedAt: gist.updated_at,
          connectionCount: 0,
          credentialCount: 0,
        });
      }
    }

    return { success: true, configs };
  }

  private async downloadFromGist(account: SyncAccount, gistId: string): Promise<string> {
    const response = await fetch(`https://api.github.com/gists/${gistId}`, {
      headers: {
        Authorization: `Bearer ${account.accessToken}`,
        Accept: 'application/vnd.github.v3+json',
      },
    });

    if (!response.ok) {
      throw new Error('Failed to download from GitHub Gists');
    }

    const gist = await response.json();
    const configFile = Object.entries(gist.files).find(([name]) => name.startsWith('connectty-config-'));
    if (!configFile) {
      throw new Error('Config file not found in gist');
    }

    return (configFile[1] as any).content;
  }
}
