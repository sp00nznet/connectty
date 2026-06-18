/**
 * Tauri adapter for the connectty API.
 *
 * This module implements the same `window.connectty` interface that the
 * Electron preload script exposes, but routes calls through Tauri's
 * invoke() and listen() instead of Electron's ipcRenderer.
 *
 * Result: App.tsx requires ZERO modifications to work with Tauri.
 */

import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';

// Types matching the Electron preload API
type SSHEventCallback = (sessionId: string, event: any) => void;
type LocalShellEventCallback = (sessionId: string, event: any) => void;

interface ConnecttyAPI {
  connections: {
    list: () => Promise<any[]>;
    get: (id: string) => Promise<any>;
    create: (connection: any) => Promise<any>;
    update: (id: string, updates: any) => Promise<void>;
    delete: (id: string) => Promise<void>;
  };
  credentials: {
    list: () => Promise<any[]>;
    get: (id: string) => Promise<any>;
    create: (credential: any) => Promise<any>;
    update: (id: string, updates: any) => Promise<void>;
    delete: (id: string) => Promise<void>;
  };
  groups: {
    list: () => Promise<any[]>;
    create: (group: any) => Promise<any>;
    update: (id: string, updates: any) => Promise<void>;
    delete: (id: string) => Promise<void>;
  };
  ssh: {
    connect: (connectionId: string, password?: string) => Promise<string>;
    disconnect: (sessionId: string) => Promise<void>;
    write: (sessionId: string, data: string) => Promise<void>;
    resize: (sessionId: string, cols: number, rows: number) => Promise<void>;
    onEvent: (callback: SSHEventCallback) => () => void;
  };
  localShell: {
    getAvailable: () => Promise<any[]>;
    spawn: (shellId: string) => Promise<string>;
    write: (sessionId: string, data: string) => Promise<void>;
    resize: (sessionId: string, cols: number, rows: number) => Promise<void>;
    kill: (sessionId: string) => Promise<void>;
    onEvent: (callback: LocalShellEventCallback) => () => void;
  };
  settings: {
    get: () => Promise<any>;
    save: (settings: any) => Promise<void>;
  };
  app: {
    platform: () => Promise<string>;
    version: () => Promise<string>;
  };
  // Stubs for features not yet ported to Tauri
  providers: {
    list: () => Promise<any[]>;
    create: (provider: any) => Promise<any>;
    update: (provider: any) => Promise<void>;
    delete: (id: string) => Promise<void>;
    discover: (id: string) => Promise<any[]>;
    sync: (id: string) => Promise<any>;
    getDiscoveredHosts: (providerId: string) => Promise<any[]>;
  };
  profiles: {
    list: () => Promise<any[]>;
    getActive: () => Promise<any>;
    create: (name: string) => Promise<any>;
    switchTo: (id: string) => Promise<void>;
    delete: (id: string) => Promise<void>;
    getConnections: (profileId: string) => Promise<any[]>;
    updateConnections: (profileId: string, connectionIds: string[]) => Promise<void>;
  };
  sftp: {
    connect: (connectionId: string, password?: string) => Promise<string>;
    disconnect: (sessionId: string) => Promise<void>;
    list: (sessionId: string, path: string) => Promise<any[]>;
    upload: (sessionId: string, localPath: string, remotePath: string) => Promise<void>;
    download: (sessionId: string, remotePath: string, localPath: string) => Promise<void>;
    mkdir: (sessionId: string, path: string) => Promise<void>;
    delete: (sessionId: string, path: string) => Promise<void>;
    rename: (sessionId: string, oldPath: string, newPath: string) => Promise<void>;
    chmod: (sessionId: string, path: string, mode: string) => Promise<void>;
    stat: (sessionId: string, path: string) => Promise<any>;
    readFile: (sessionId: string, path: string) => Promise<string>;
    writeFile: (sessionId: string, path: string, content: string) => Promise<void>;
    listLocal: (path: string) => Promise<any[]>;
    getHomeDir: () => Promise<string>;
    selectFiles: () => Promise<string[]>;
    onProgress: (callback: (progress: any) => void) => () => void;
  };
  rdp: {
    connect: (connectionId: string, password?: string) => Promise<string>;
    disconnect: (sessionId: string) => Promise<void>;
    sendKey: (sessionId: string, keyCode: number, isDown: boolean, isExtended: boolean) => Promise<void>;
    sendMouse: (sessionId: string, x: number, y: number, button: number, isDown: boolean) => Promise<void>;
    sendWheel: (sessionId: string, x: number, y: number, delta: number, isHorizontal: boolean) => Promise<void>;
    onEvent: (callback: (sessionId: string, event: any) => void) => () => void;
    launchExternal: (connectionId: string) => Promise<void>;
  };
  serial: {
    connect: (connectionId: string) => Promise<string>;
    disconnect: (sessionId: string) => Promise<void>;
    write: (sessionId: string, data: string) => Promise<void>;
    onEvent: (callback: (sessionId: string, event: any) => void) => () => void;
  };
  commands: {
    list: () => Promise<any[]>;
    create: (command: any) => Promise<any>;
    update: (command: any) => Promise<void>;
    delete: (id: string) => Promise<void>;
    execute: (commandId: string, connectionIds: string[]) => Promise<string>;
    cancel: (executionId: string) => Promise<void>;
    getResults: (executionId: string) => Promise<any>;
    onProgress: (callback: (data: any) => void) => () => void;
    onComplete: (callback: (data: any) => void) => () => void;
  };
  sync: {
    exportData: () => Promise<any>;
    importData: (data: any) => Promise<void>;
    exportToFile: (format: string) => Promise<void>;
    importFromFile: () => Promise<void>;
    getAccounts: () => Promise<any[]>;
    cloudSync: (accountId: string) => Promise<void>;
    cloudRestore: (accountId: string) => Promise<void>;
  };
  window: {
    setTitleBarOverlay?: (opts?: any) => Promise<any>;
    minimize: () => Promise<void>;
    toggleMaximize?: () => Promise<void>;
    close?: () => Promise<void>;
    isMaximized?: () => Promise<boolean>;
    onMaximizeChange?: (cb: (maximized: boolean) => void) => () => void;
  };
  aiSessions: {
    list: () => Promise<any[]>;
    transcript: (filePath: string) => Promise<any[]>;
    searchPrompts: (query: string) => Promise<any[]>;
    watchStart: () => Promise<void>;
    onUpdate: (callback: (sessions: any[]) => void) => () => void;
  };
}

// Helper to create event listener with cleanup
function createEventListener(eventName: string, callback: (...args: any[]) => void): () => void {
  let unlisten: UnlistenFn | null = null;

  listen(eventName, (event) => {
    const payload = event.payload as any;
    if (payload.sessionId) {
      callback(payload.sessionId, payload.event || payload);
    } else {
      callback(payload);
    }
  }).then((fn) => {
    unlisten = fn;
  });

  return () => {
    unlisten?.();
  };
}

// Stub that returns an empty result (for features not yet ported)
function notImplemented(name: string): () => Promise<never> {
  return () => Promise.reject(`${name} not yet implemented in Tauri backend`);
}

function stubList(): Promise<any[]> {
  return Promise.resolve([]);
}

export const connecttyApi: ConnecttyAPI = {
  connections: {
    list: () => invoke('list_connections'),
    get: (id) => invoke('get_connection', { id }),
    create: (connection) => invoke('create_connection', { connection }),
    update: (id, updates) => invoke('update_connection', { id, updates }),
    delete: (id) => invoke('delete_connection', { id }),
  },
  credentials: {
    list: () => invoke('list_credentials'),
    get: notImplemented('credentials.get'),
    create: (credential) => invoke('create_credential', { credential }),
    update: (id, updates) => invoke('update_credential', { id, updates }),
    delete: (id) => invoke('delete_credential', { id }),
  },
  groups: {
    list: () => invoke('list_groups'),
    create: (group) => invoke('create_group', { group }),
    update: (id, updates) => invoke('update_group', { id, updates }),
    delete: (id) => invoke('delete_group', { id }),
  },
  ssh: {
    connect: (connectionId, password) => invoke('ssh_connect', { connectionId, password }),
    disconnect: (sessionId) => invoke('ssh_disconnect', { sessionId }),
    write: (sessionId, data) => invoke('ssh_write', { sessionId, data }),
    resize: (sessionId, cols, rows) => invoke('ssh_resize', { sessionId, cols, rows }),
    onEvent: (callback) => createEventListener('ssh:event', callback),
  },
  localShell: {
    getAvailable: () => invoke('list_available_shells'),
    spawn: (shellId) => invoke('spawn_local_shell', { shellId }),
    write: (sessionId, data) => invoke('write_local_shell', { sessionId, data }),
    resize: (sessionId, cols, rows) => invoke('resize_local_shell', { sessionId, cols, rows }),
    kill: (sessionId) => invoke('kill_local_shell', { sessionId }),
    onEvent: (callback) => createEventListener('localShell:event', callback),
  },
  settings: {
    get: () => invoke('get_settings'),
    save: (settings) => invoke('save_settings', { settings }),
  },
  app: {
    platform: () => invoke('get_platform'),
    version: () => invoke('get_version'),
  },
  // Stubs for Phase 3-5 features
  providers: {
    list: () => invoke('providers_list'),
    create: (provider: any) => invoke('providers_create', { provider }),
    update: (id: string, updates: any) => invoke('providers_update', { id, updates }),
    delete: (id: string) => invoke('providers_delete', { id }),
    discover: (id: string) => invoke('providers_discover', { id }),
    sync: (id: string) => invoke('providers_discover', { id }),
    getDiscoveredHosts: (providerId: string) => invoke('discovered_list', { providerId }),
  },
  profiles: {
    list: () => Promise.resolve([{ id: 'default', name: 'Default', isDefault: true }]),
    getActive: () => Promise.resolve({ id: 'default', name: 'Default', isDefault: true }),
    create: notImplemented('profiles.create'),
    switchTo: notImplemented('profiles.switchTo'),
    delete: notImplemented('profiles.delete'),
    getConnections: () => Promise.resolve([]),
    updateConnections: notImplemented('profiles.updateConnections'),
  },
  sftp: {
    connect: (connectionId: string) => invoke('sftp_connect', { connectionId }),
    disconnect: (sessionId: string) => invoke('sftp_disconnect', { sessionId }),
    listRemote: (sessionId: string, remotePath: string) => invoke('sftp_list_remote', { sessionId, remotePath }),
    listLocal: (localPath: string) => invoke('sftp_list_local', { localPath }),
    upload: (sessionId: string, localPath: string, remotePath: string) => invoke('sftp_upload', { sessionId, localPath, remotePath }),
    download: (sessionId: string, remotePath: string, localPath: string) => invoke('sftp_download', { sessionId, remotePath, localPath }),
    mkdir: (sessionId: string, remotePath: string) => invoke('sftp_mkdir', { sessionId, remotePath }),
    rmdir: (sessionId: string, remotePath: string) => invoke('sftp_rmdir', { sessionId, remotePath }),
    unlink: (sessionId: string, remotePath: string) => invoke('sftp_unlink', { sessionId, remotePath }),
    rename: (sessionId: string, oldPath: string, newPath: string) => invoke('sftp_rename', { sessionId, oldPath, newPath }),
    chmod: notImplemented('sftp.chmod'),
    stat: notImplemented('sftp.stat'),
    readFile: notImplemented('sftp.readFile'),
    writeFile: notImplemented('sftp.writeFile'),
    homePath: () => invoke('sftp_home_path'),
    sessions: () => Promise.resolve([]),
    getTempDir: () => invoke('sftp_get_temp_dir'),
    selectLocalFolder: () => invoke('select_local_folder'),
    selectLocalFile: () => invoke('select_local_files'),
    selectSaveLocation: (defaultName?: string) => invoke('select_save_location', { defaultName }),
    onProgress: () => () => {},
  },
  rdp: {
    connect: (connectionId: string, embedded?: boolean) => invoke('rdp_connect', { connectionId, embedded }),
    disconnect: (sessionId: string) => invoke('rdp_disconnect', { sessionId }),
    sendKey: notImplemented('rdp.sendKey'),
    sendMouse: notImplemented('rdp.sendMouse'),
    sendWheel: notImplemented('rdp.sendWheel'),
    onEvent: () => () => {},
    launchExternal: (connectionId: string) => invoke('rdp_connect', { connectionId, embedded: false }),
  },
  serial: {
    connect: (connectionId: string) => invoke('serial_connect', { connectionId }),
    disconnect: (sessionId: string) => invoke('serial_disconnect', { sessionId }),
    write: (sessionId: string, data: string) => invoke('serial_write', { sessionId, data }),
    listPorts: () => invoke('serial_list_ports'),
    onEvent: (callback: any) => createEventListener('serial:event', callback),
  },
  commands: {
    list: () => invoke('commands_list'),
    get: (id: string) => invoke('commands_get', { id }),
    create: (command: any) => invoke('commands_create', { command }),
    update: (id: string, updates: any) => invoke('commands_update', { id, updates }),
    delete: (id: string) => invoke('commands_delete', { id }),
    execute: (executionData: any) => invoke('commands_execute', { executionData }),
    cancel: (executionId: string) => invoke('commands_cancel', { executionId }),
    getResults: notImplemented('commands.getResults'),
    history: () => Promise.resolve([]),
    getExecution: notImplemented('commands.getExecution'),
    clearHistory: () => Promise.resolve(true),
    onProgress: (callback: any) => createEventListener('command:progress', callback),
    onComplete: (callback: any) => createEventListener('command:complete', callback),
  },
  sync: {
    push: notImplemented('sync.push'),
    pull: notImplemented('sync.pull'),
    connect: (provider: string) => invoke('sync_connect', { provider }),
    disconnect: (accountId: string) => invoke('sync_disconnect', { accountId }),
    upload: (accountId: string, options?: any) => invoke('sync_upload', { accountId, options }),
    download: (accountId: string) => invoke('sync_list_configs', { accountId }),
    importConfig: (accountId: string, configId: string, options?: any) => invoke('sync_import_config', { accountId, configId, options }),
    getAccounts: () => invoke('sync_get_accounts'),
  },
  // Import/Export
  import: {
    file: (options: any) => invoke('import_file', { options }),
  },
  export: {
    file: (options: any) => invoke('export_file', { options }),
  },
  // Discovered hosts
  discovered: {
    list: (providerId?: string) => invoke('discovered_list', { providerId }),
    import: notImplemented('discovered.import'),
    importAll: notImplemented('discovered.importAll'),
    importSelected: (hostIds: string[], credentialId?: string, groupId?: string) =>
      invoke('discovered_import_selected', { hostIds, credentialId, groupId }),
  },
  // Connection bulk operations
  connectionsBulk: {
    getByProvider: () => Promise.resolve([]),
    deleteByProvider: () => Promise.resolve(0),
  },
  // Session states
  sessionStates: {
    list: () => invoke('session_states_list'),
    get: (id: string) => invoke('session_states_get', { id }),
    create: (sessionState: any) => invoke('session_states_create', { sessionState }),
    update: (id: string, updates: any) => invoke('session_states_update', { id, updates }),
    delete: (id: string) => invoke('session_states_delete', { id }),
  },
  window: {
    // Electron drew native min/max/close as a title-bar overlay; Tauri runs
    // frameless (decorations: false) and we render our own controls, so this
    // is a no-op kept only for API compatibility with the Electron renderer.
    setTitleBarOverlay: () => Promise.resolve(true),
    minimize: () => getCurrentWindow().minimize(),
    toggleMaximize: () => getCurrentWindow().toggleMaximize(),
    close: () => getCurrentWindow().close(),
    isMaximized: () => getCurrentWindow().isMaximized(),
    onMaximizeChange: (cb: (maximized: boolean) => void) => {
      let unlisten: UnlistenFn | null = null;
      const w = getCurrentWindow();
      // Fire once with the current state, then on every resize (covers
      // maximize/restore/snap) report whether the window is maximized.
      w.isMaximized().then(cb);
      w.onResized(async () => cb(await w.isMaximized())).then((fn) => {
        unlisten = fn;
      });
      return () => unlisten?.();
    },
  },
  // AI session monitoring (Claude Code / Copilot)
  aiSessions: {
    list: () => invoke('ai_sessions_list'),
    transcript: (filePath: string) => invoke('ai_session_transcript', { filePath }),
    searchPrompts: (query: string) => invoke('ai_search_prompts', { query }),
    watchStart: () => invoke('ai_sessions_watch_start'),
    onUpdate: (callback: (sessions: any[]) => void) => {
      let unlisten: UnlistenFn | null = null;
      listen('ai:sessions', (event) => callback(event.payload as any[])).then((fn) => {
        unlisten = fn;
      });
      return () => unlisten?.();
    },
  },
};

// Install the adapter - this makes App.tsx work without any changes
(window as any).connectty = connecttyApi;
