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
    discover: (id: string): Promise<DiscoveryResult> => ipcRenderer.invoke('providers:discover', id),
  },

  // Discovered hosts operations
  discovered: {
    list: (providerId?: string): Promise<DiscoveredHost[]> => ipcRenderer.invoke('discovered:list', providerId),
    import: (hostId: string, credentialId?: string): Promise<ServerConnection> =>
      ipcRenderer.invoke('discovered:import', hostId, credentialId),
    importAll: (providerId: string): Promise<ServerConnection[]> =>
      ipcRenderer.invoke('discovered:importAll', providerId),
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
    connect: (connectionId: string): Promise<void> => ipcRenderer.invoke('rdp:connect', connectionId),
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
    push: (serverUrl: string, token: string): Promise<boolean> => ipcRenderer.invoke('sync:push', serverUrl, token),
    pull: (serverUrl: string, token: string): Promise<{ connections: number; credentials: number; groups: number }> =>
      ipcRenderer.invoke('sync:pull', serverUrl, token),
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

  // App info
  app: {
    version: (): Promise<string> => ipcRenderer.invoke('app:version'),
    platform: (): Promise<string> => ipcRenderer.invoke('app:platform'),
  },
};

contextBridge.exposeInMainWorld('connectty', api);

export type ConnecttyAPI = typeof api;
