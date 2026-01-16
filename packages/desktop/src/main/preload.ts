/**
 * Preload script for Electron - exposes safe APIs to renderer
 */

import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';
import type {
  ServerConnection,
  Credential,
  ConnectionGroup,
  Provider,
  DiscoveredHost,
  DiscoveryResult,
  ImportOptions,
  ExportOptions,
  SSHSessionEvent,
  SavedCommand,
  CommandExecution,
  CommandResult,
  HostFilter,
  CommandTargetOS,
} from '@connectty/shared';

// SFTP types (matching the types in sftp.ts)
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

// Sync account types
export interface SyncAccount {
  id: string;
  provider: 'google' | 'github';
  email: string;
  displayName?: string;
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: number;
  connectedAt: string;
}

export interface SyncConfig {
  deviceId: string;
  deviceName: string;
  lastSyncAt?: string;
  connections: boolean;
  credentials: boolean;
  groups: boolean;
  providers: boolean;
  commands: boolean;
  theme: boolean;
}

export interface SyncOptions {
  connections: boolean;
  credentials: boolean;
  groups: boolean;
  providers: boolean;
  commands: boolean;
  theme: boolean;
}

export interface SyncConfigInfo {
  id: string;
  deviceName: string;
  deviceId: string;
  uploadedAt: string;
  connectionCount: number;
  credentialCount: number;
}

// App settings types
export interface AppSettings {
  minimizeToTray: boolean;
  closeToTray: boolean;
  startMinimized: boolean;
  syncAccounts?: SyncAccount[];
  terminalTheme: 'sync' | 'classic';  // 'sync' = match app theme, 'classic' = black background
}

// Local shell types
export interface LocalShellInfo {
  id: string;
  name: string;
  path: string;
  args?: string[];
  icon?: string;
  elevated?: boolean; // Run as administrator (Windows only)
}

export interface LocalShellSessionEvent {
  type: 'data' | 'close' | 'error';
  data?: string;
  message?: string;
  exitCode?: number;
}

const api = {
  // Connection operations
  connections: {
    list: (): Promise<ServerConnection[]> => ipcRenderer.invoke('connections:list'),
    get: (id: string): Promise<ServerConnection | null> => ipcRenderer.invoke('connections:get', id),
    create: (connection: Omit<ServerConnection, 'id' | 'createdAt' | 'updatedAt'>): Promise<ServerConnection> =>
      ipcRenderer.invoke('connections:create', connection),
    update: (id: string, updates: Partial<ServerConnection>): Promise<ServerConnection | null> =>
      ipcRenderer.invoke('connections:update', id, updates),
    delete: (id: string): Promise<boolean> => ipcRenderer.invoke('connections:delete', id),
  },

  // Credential operations
  credentials: {
    list: (): Promise<Credential[]> => ipcRenderer.invoke('credentials:list'),
    get: (id: string): Promise<Credential | null> => ipcRenderer.invoke('credentials:get', id),
    create: (credential: Omit<Credential, 'id' | 'createdAt' | 'updatedAt' | 'usedBy'>): Promise<Credential> =>
      ipcRenderer.invoke('credentials:create', credential),
    update: (id: string, updates: Partial<Credential>): Promise<Credential | null> =>
      ipcRenderer.invoke('credentials:update', id, updates),
    delete: (id: string): Promise<boolean> => ipcRenderer.invoke('credentials:delete', id),
  },

  // Group operations
  groups: {
    list: (): Promise<ConnectionGroup[]> => ipcRenderer.invoke('groups:list'),
    create: (group: Omit<ConnectionGroup, 'id' | 'createdAt' | 'updatedAt'>): Promise<ConnectionGroup> =>
      ipcRenderer.invoke('groups:create', group),
    update: (id: string, updates: Partial<ConnectionGroup>): Promise<ConnectionGroup | null> =>
      ipcRenderer.invoke('groups:update', id, updates),
    delete: (id: string): Promise<boolean> => ipcRenderer.invoke('groups:delete', id),
  },

  // Provider operations
  providers: {
    list: (): Promise<Provider[]> => ipcRenderer.invoke('providers:list'),
    get: (id: string): Promise<Provider | null> => ipcRenderer.invoke('providers:get', id),
    create: (provider: Omit<Provider, 'id' | 'createdAt' | 'updatedAt'>): Promise<Provider> =>
      ipcRenderer.invoke('providers:create', provider),
    update: (id: string, updates: Partial<Provider>): Promise<Provider | null> =>
      ipcRenderer.invoke('providers:update', id, updates),
    delete: (id: string): Promise<boolean> => ipcRenderer.invoke('providers:delete', id),
    test: (id: string): Promise<boolean> => ipcRenderer.invoke('providers:test', id),
    testConfig: (providerData: Partial<Provider>): Promise<boolean> => ipcRenderer.invoke('providers:testConfig', providerData),
    discover: (id: string): Promise<DiscoveryResult> => ipcRenderer.invoke('providers:discover', id),
  },

  // Discovered hosts operations
  discovered: {
    list: (providerId?: string): Promise<DiscoveredHost[]> => ipcRenderer.invoke('discovered:list', providerId),
    import: (hostId: string, credentialId?: string, groupId?: string): Promise<ServerConnection> =>
      ipcRenderer.invoke('discovered:import', hostId, credentialId, groupId),
    importAll: (providerId: string, groupId?: string): Promise<ServerConnection[]> =>
      ipcRenderer.invoke('discovered:importAll', providerId, groupId),
    importSelected: (hostIds: string[], credentialId?: string, groupId?: string): Promise<ServerConnection[]> =>
      ipcRenderer.invoke('discovered:importSelected', hostIds, credentialId, groupId),
  },

  // Connection bulk operations
  connectionsBulk: {
    getByProvider: (providerId: string): Promise<ServerConnection[]> =>
      ipcRenderer.invoke('connections:getByProvider', providerId),
    deleteByProvider: (providerId: string): Promise<number> =>
      ipcRenderer.invoke('connections:deleteByProvider', providerId),
  },

  // SSH operations
  ssh: {
    connect: (connectionId: string, password?: string): Promise<string> =>
      ipcRenderer.invoke('ssh:connect', connectionId, password),
    disconnect: (sessionId: string): Promise<void> => ipcRenderer.invoke('ssh:disconnect', sessionId),
    write: (sessionId: string, data: string): Promise<void> => ipcRenderer.invoke('ssh:write', sessionId, data),
    resize: (sessionId: string, cols: number, rows: number): Promise<void> =>
      ipcRenderer.invoke('ssh:resize', sessionId, cols, rows),
    onEvent: (callback: (sessionId: string, event: SSHSessionEvent) => void): (() => void) => {
      const handler = (_event: IpcRendererEvent, sessionId: string, sshEvent: SSHSessionEvent) => {
        callback(sessionId, sshEvent);
      };
      ipcRenderer.on('ssh:event', handler);
      return () => ipcRenderer.removeListener('ssh:event', handler);
    },
  },

  // RDP operations
  rdp: {
    connect: (connectionId: string, embedded?: boolean): Promise<{ sessionId: string | null; embedded: boolean; reason?: string }> =>
      ipcRenderer.invoke('rdp:connect', connectionId, embedded ?? true),
    disconnect: (sessionId: string): Promise<void> => ipcRenderer.invoke('rdp:disconnect', sessionId),
    sendKey: (sessionId: string, scanCode: number, isPressed: boolean, isExtended?: boolean): Promise<void> =>
      ipcRenderer.invoke('rdp:sendKey', sessionId, scanCode, isPressed, isExtended ?? false),
    sendMouse: (sessionId: string, x: number, y: number, button: number, isPressed: boolean): Promise<void> =>
      ipcRenderer.invoke('rdp:sendMouse', sessionId, x, y, button, isPressed),
    sendWheel: (sessionId: string, x: number, y: number, delta: number, isHorizontal?: boolean): Promise<void> =>
      ipcRenderer.invoke('rdp:sendWheel', sessionId, x, y, delta, isHorizontal ?? false),
    isAvailable: (): Promise<boolean> => ipcRenderer.invoke('rdp:isAvailable'),
    onEvent: (callback: (sessionId: string, event: any) => void): (() => void) => {
      const handler = (_event: IpcRendererEvent, sessionId: string, rdpEvent: any) => {
        callback(sessionId, rdpEvent);
      };
      ipcRenderer.on('rdp:event', handler);
      return () => ipcRenderer.removeListener('rdp:event', handler);
    },
  },

  // Serial operations
  serial: {
    connect: (connectionId: string): Promise<string> => ipcRenderer.invoke('serial:connect', connectionId),
    disconnect: (sessionId: string): Promise<void> => ipcRenderer.invoke('serial:disconnect', sessionId),
    write: (sessionId: string, data: string): Promise<void> => ipcRenderer.invoke('serial:write', sessionId, data),
    listPorts: (): Promise<{ path: string; manufacturer?: string; productId?: string }[]> =>
      ipcRenderer.invoke('serial:listPorts'),
    onEvent: (callback: (sessionId: string, event: SSHSessionEvent) => void): (() => void) => {
      const handler = (_event: IpcRendererEvent, sessionId: string, serialEvent: SSHSessionEvent) => {
        callback(sessionId, serialEvent);
      };
      ipcRenderer.on('serial:event', handler);
      return () => ipcRenderer.removeListener('serial:event', handler);
    },
  },

  // Import/Export operations
  import: {
    file: (options: ImportOptions): Promise<{ connections: number; credentials: number; groups: number } | null> =>
      ipcRenderer.invoke('import:file', options),
  },

  export: {
    file: (options: ExportOptions): Promise<boolean> => ipcRenderer.invoke('export:file', options),
  },

  // Sync operations
  sync: {
    // Legacy server sync (deprecated)
    push: (serverUrl: string, token: string): Promise<boolean> => ipcRenderer.invoke('sync:push', serverUrl, token),
    pull: (serverUrl: string, token: string): Promise<{ connections: number; credentials: number; groups: number }> =>
      ipcRenderer.invoke('sync:pull', serverUrl, token),

    // Cloud sync via OAuth providers
    connect: (provider: 'google' | 'github'): Promise<SyncAccount | null> =>
      ipcRenderer.invoke('sync:connect', provider),
    disconnect: (accountId: string): Promise<boolean> => ipcRenderer.invoke('sync:disconnect', accountId),
    upload: (accountId: string, options?: SyncOptions): Promise<{ success: boolean; configId?: string; error?: string }> =>
      ipcRenderer.invoke('sync:upload', accountId, options),
    download: (accountId: string): Promise<{ success: boolean; configs?: SyncConfigInfo[]; error?: string }> =>
      ipcRenderer.invoke('sync:listConfigs', accountId),
    importConfig: (accountId: string, configId: string, options?: SyncOptions): Promise<{
      success: boolean;
      imported?: { connections: number; credentials: number; groups: number; providers: number; commands: number };
      error?: string;
    }> => ipcRenderer.invoke('sync:importConfig', accountId, configId, options),
    getAccounts: (): Promise<SyncAccount[]> => ipcRenderer.invoke('sync:getAccounts'),
  },

  // Command operations (bulk actions)
  commands: {
    // Saved commands CRUD
    list: (category?: string): Promise<SavedCommand[]> => ipcRenderer.invoke('commands:list', category),
    get: (id: string): Promise<SavedCommand | null> => ipcRenderer.invoke('commands:get', id),
    create: (command: Omit<SavedCommand, 'id' | 'createdAt' | 'updatedAt'>): Promise<SavedCommand> =>
      ipcRenderer.invoke('commands:create', command),
    update: (id: string, updates: Partial<SavedCommand>): Promise<SavedCommand | null> =>
      ipcRenderer.invoke('commands:update', id, updates),
    delete: (id: string): Promise<boolean> => ipcRenderer.invoke('commands:delete', id),

    // Command execution
    execute: (data: {
      commandId?: string;
      commandName: string;
      command: string;
      targetOS: CommandTargetOS;
      filter: HostFilter;
      variables?: Record<string, string>;
    }): Promise<{ executionId: string; targetCount: number } | { error: string }> =>
      ipcRenderer.invoke('commands:execute', data),
    cancel: (executionId: string): Promise<boolean> => ipcRenderer.invoke('commands:cancel', executionId),

    // Execution history
    history: (limit?: number): Promise<CommandExecution[]> => ipcRenderer.invoke('commands:history', limit),
    getExecution: (id: string): Promise<CommandExecution | null> => ipcRenderer.invoke('commands:getExecution', id),
    clearHistory: (): Promise<boolean> => ipcRenderer.invoke('commands:clearHistory'),

    // Event listeners for progress updates
    onProgress: (callback: (executionId: string, connectionId: string, result: Partial<CommandResult>) => void): (() => void) => {
      const handler = (_event: IpcRendererEvent, executionId: string, connectionId: string, result: Partial<CommandResult>) => {
        callback(executionId, connectionId, result);
      };
      ipcRenderer.on('command:progress', handler);
      return () => ipcRenderer.removeListener('command:progress', handler);
    },
    onComplete: (callback: (executionId: string) => void): (() => void) => {
      const handler = (_event: IpcRendererEvent, executionId: string) => {
        callback(executionId);
      };
      ipcRenderer.on('command:complete', handler);
      return () => ipcRenderer.removeListener('command:complete', handler);
    },
  },

  // SFTP operations
  sftp: {
    connect: (connectionId: string): Promise<string> => ipcRenderer.invoke('sftp:connect', connectionId),
    disconnect: (sessionId: string): Promise<boolean> => ipcRenderer.invoke('sftp:disconnect', sessionId),
    listRemote: (sessionId: string, remotePath: string): Promise<RemoteFileInfo[]> =>
      ipcRenderer.invoke('sftp:listRemote', sessionId, remotePath),
    listLocal: (localPath: string): Promise<LocalFileInfo[]> => ipcRenderer.invoke('sftp:listLocal', localPath),
    upload: (sessionId: string, localPath: string, remotePath: string): Promise<boolean> =>
      ipcRenderer.invoke('sftp:upload', sessionId, localPath, remotePath),
    download: (sessionId: string, remotePath: string, localPath: string): Promise<boolean> =>
      ipcRenderer.invoke('sftp:download', sessionId, remotePath, localPath),
    mkdir: (sessionId: string, remotePath: string): Promise<boolean> =>
      ipcRenderer.invoke('sftp:mkdir', sessionId, remotePath),
    rmdir: (sessionId: string, remotePath: string): Promise<boolean> =>
      ipcRenderer.invoke('sftp:rmdir', sessionId, remotePath),
    unlink: (sessionId: string, remotePath: string): Promise<boolean> =>
      ipcRenderer.invoke('sftp:unlink', sessionId, remotePath),
    rename: (sessionId: string, oldPath: string, newPath: string): Promise<boolean> =>
      ipcRenderer.invoke('sftp:rename', sessionId, oldPath, newPath),
    chmod: (sessionId: string, remotePath: string, mode: number): Promise<boolean> =>
      ipcRenderer.invoke('sftp:chmod', sessionId, remotePath, mode),
    stat: (sessionId: string, remotePath: string): Promise<RemoteFileInfo> =>
      ipcRenderer.invoke('sftp:stat', sessionId, remotePath),
    homePath: (): Promise<string> => ipcRenderer.invoke('sftp:homePath'),
    sessions: (): Promise<string[]> => ipcRenderer.invoke('sftp:sessions'),
    getTempDir: (): Promise<string> => ipcRenderer.invoke('sftp:getTempDir'),
    selectLocalFolder: (): Promise<string | null> => ipcRenderer.invoke('sftp:selectLocalFolder'),
    selectLocalFile: (): Promise<string[] | null> => ipcRenderer.invoke('sftp:selectLocalFile'),
    selectSaveLocation: (defaultName: string): Promise<string | null> =>
      ipcRenderer.invoke('sftp:selectSaveLocation', defaultName),
    onProgress: (callback: (progress: TransferProgress) => void): (() => void) => {
      const handler = (_event: IpcRendererEvent, progress: TransferProgress) => {
        callback(progress);
      };
      ipcRenderer.on('sftp:progress', handler);
      return () => ipcRenderer.removeListener('sftp:progress', handler);
    },
  },

  // Settings operations
  settings: {
    get: (): Promise<AppSettings> => ipcRenderer.invoke('settings:get'),
    set: (settings: Partial<AppSettings>): Promise<AppSettings> => ipcRenderer.invoke('settings:set', settings),
  },

  // App info
  app: {
    version: (): Promise<string> => ipcRenderer.invoke('app:version'),
    platform: (): Promise<string> => ipcRenderer.invoke('app:platform'),
  },

  // Local shell operations
  localShell: {
    getAvailable: (): Promise<LocalShellInfo[]> => ipcRenderer.invoke('localShell:getAvailable'),
    spawn: (shellId: string): Promise<string> => ipcRenderer.invoke('localShell:spawn', shellId),
    write: (sessionId: string, data: string): Promise<void> => ipcRenderer.invoke('localShell:write', sessionId, data),
    resize: (sessionId: string, cols: number, rows: number): Promise<void> =>
      ipcRenderer.invoke('localShell:resize', sessionId, cols, rows),
    kill: (sessionId: string): Promise<void> => ipcRenderer.invoke('localShell:kill', sessionId),
    onEvent: (callback: (sessionId: string, event: LocalShellSessionEvent) => void): (() => void) => {
      const handler = (_event: IpcRendererEvent, sessionId: string, shellEvent: LocalShellSessionEvent) => {
        callback(sessionId, shellEvent);
      };
      ipcRenderer.on('localShell:event', handler);
      return () => ipcRenderer.removeListener('localShell:event', handler);
    },
  },
};

contextBridge.exposeInMainWorld('connectty', api);

export type ConnecttyAPI = typeof api;
