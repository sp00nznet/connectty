/**
 * Electron main process entry point
 */

import { app, BrowserWindow, ipcMain, dialog, Tray, Menu, nativeImage } from 'electron';
import * as path from 'path';
import Store from 'electron-store';
import { DatabaseService } from './database';
import { SSHService } from './ssh';
import { RDPService } from './rdp';
import { SyncService } from './sync';
import { CommandService } from './command';
import { SFTPService } from './sftp';
import { getProviderService } from './providers';

// App settings interface
interface AppSettings {
  minimizeToTray: boolean;
  closeToTray: boolean;
  startMinimized: boolean;
}

// Initialize settings store
const settingsStore = new Store<AppSettings>({
  defaults: {
    minimizeToTray: false,
    closeToTray: false,
    startMinimized: false,
  },
});
import type {
  ServerConnection,
  Credential,
  ConnectionGroup,
  Provider,
  DiscoveredHost,
  ImportOptions,
  ExportOptions,
  OSType,
  SavedCommand,
  CommandExecution,
  HostFilter,
} from '@connectty/shared';

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let isQuitting = false;
let db: DatabaseService;
let sshService: SSHService;
let rdpService: RDPService;
let syncService: SyncService;
let commandService: CommandService;
let sftpService: SFTPService;

const isDev = process.env.NODE_ENV === 'development';

/**
 * Create system tray icon and context menu
 */
function createTray(): void {
  const iconPath = process.platform === 'win32'
    ? path.join(__dirname, '../../assets/icon.ico')
    : path.join(__dirname, '../../assets/icon.png');

  const icon = nativeImage.createFromPath(iconPath);
  tray = new Tray(icon.resize({ width: 16, height: 16 }));

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Show Connectty',
      click: () => {
        mainWindow?.show();
        mainWindow?.focus();
      },
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        isQuitting = true;
        app.quit();
      },
    },
  ]);

  tray.setToolTip('Connectty');
  tray.setContextMenu(contextMenu);

  // Double-click to show window
  tray.on('double-click', () => {
    mainWindow?.show();
    mainWindow?.focus();
  });
}

async function createWindow(): Promise<void> {
  // Determine icon path based on platform
  const iconPath = process.platform === 'win32'
    ? path.join(__dirname, '../../assets/icon.ico')
    : path.join(__dirname, '../../assets/icon.png');

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    show: true,
    icon: iconPath,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  // Handle minimize to tray
  mainWindow.on('minimize', (event: Electron.Event) => {
    if (settingsStore.get('minimizeToTray')) {
      event.preventDefault();
      mainWindow?.hide();
    }
  });

  // Handle close to tray
  mainWindow.on('close', (event: Electron.Event) => {
    if (!isQuitting && settingsStore.get('closeToTray')) {
      event.preventDefault();
      mainWindow?.hide();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Show window unless starting minimized
  if (settingsStore.get('startMinimized')) {
    mainWindow.hide();
  } else {
    mainWindow.show();
    mainWindow.focus();
  }

  try {
    if (isDev) {
      await mainWindow.loadURL('http://localhost:5173');
      mainWindow.webContents.openDevTools();
    } else {
      const indexPath = path.join(__dirname, '../renderer/index.html');
      console.log('Loading:', indexPath);
      await mainWindow.loadFile(indexPath);
    }
  } catch (err) {
    console.error('Failed to load window content:', err);
    dialog.showErrorBox('Load Error', String(err));
  }
}

function setupIpcHandlers(): void {
  // Connection handlers
  ipcMain.handle('connections:list', async () => {
    return db.getConnections();
  });

  ipcMain.handle('connections:get', async (_event, id: string) => {
    return db.getConnection(id);
  });

  ipcMain.handle('connections:create', async (_event, connection: Omit<ServerConnection, 'id' | 'createdAt' | 'updatedAt'>) => {
    return db.createConnection(connection);
  });

  ipcMain.handle('connections:update', async (_event, id: string, updates: Partial<ServerConnection>) => {
    return db.updateConnection(id, updates);
  });

  ipcMain.handle('connections:delete', async (_event, id: string) => {
    return db.deleteConnection(id);
  });

  // Credential handlers
  ipcMain.handle('credentials:list', async () => {
    return db.getCredentials();
  });

  ipcMain.handle('credentials:get', async (_event, id: string) => {
    return db.getCredential(id);
  });

  ipcMain.handle('credentials:create', async (_event, credential: Omit<Credential, 'id' | 'createdAt' | 'updatedAt' | 'usedBy'>) => {
    try {
      console.log('Creating credential:', credential.name, credential.type);
      const result = db.createCredential(credential);
      console.log('Credential created:', result.id);
      return result;
    } catch (err) {
      console.error('Failed to create credential:', err);
      throw err;
    }
  });

  ipcMain.handle('credentials:update', async (_event, id: string, updates: Partial<Credential>) => {
    return db.updateCredential(id, updates);
  });

  ipcMain.handle('credentials:delete', async (_event, id: string) => {
    return db.deleteCredential(id);
  });

  // Group handlers
  ipcMain.handle('groups:list', async () => {
    return db.getGroups();
  });

  ipcMain.handle('groups:create', async (_event, group: Omit<ConnectionGroup, 'id' | 'createdAt' | 'updatedAt'>) => {
    return db.createGroup(group);
  });

  ipcMain.handle('groups:update', async (_event, id: string, updates: Partial<ConnectionGroup>) => {
    return db.updateGroup(id, updates);
  });

  ipcMain.handle('groups:delete', async (_event, id: string) => {
    return db.deleteGroup(id);
  });

  // Provider handlers
  ipcMain.handle('providers:list', async () => {
    return db.getProviders();
  });

  ipcMain.handle('providers:get', async (_event, id: string) => {
    return db.getProvider(id);
  });

  ipcMain.handle('providers:create', async (_event, provider: Omit<Provider, 'id' | 'createdAt' | 'updatedAt'>) => {
    return db.createProvider(provider);
  });

  ipcMain.handle('providers:update', async (_event, id: string, updates: Partial<Provider>) => {
    return db.updateProvider(id, updates);
  });

  ipcMain.handle('providers:delete', async (_event, id: string) => {
    return db.deleteProvider(id);
  });

  ipcMain.handle('providers:test', async (_event, id: string) => {
    const provider = db.getProvider(id);
    if (!provider) {
      throw new Error('Provider not found');
    }
    const service = getProviderService(provider.type);
    return service.testConnection(provider);
  });

  ipcMain.handle('providers:discover', async (_event, id: string) => {
    const provider = db.getProvider(id);
    if (!provider) {
      throw new Error('Provider not found');
    }

    const service = getProviderService(provider.type);
    const result = await service.discoverHosts(provider);

    // Store discovered hosts
    for (const host of result.hosts) {
      db.upsertDiscoveredHost(host);
    }

    // Update last discovery time
    db.updateProvider(id, { lastDiscoveryAt: new Date() });

    return result;
  });

  // Discovered hosts handlers
  ipcMain.handle('discovered:list', async (_event, providerId?: string) => {
    return db.getDiscoveredHosts(providerId);
  });

  ipcMain.handle('discovered:import', async (_event, hostId: string, credentialId?: string) => {
    const host = db.getDiscoveredHost(hostId);
    if (!host) {
      throw new Error('Host not found');
    }

    // Determine connection type and port based on OS
    const connectionType = host.osType === 'windows' ? 'rdp' : 'ssh';
    const port = connectionType === 'rdp' ? 3389 : 22;

    // Auto-assign credential if not provided
    let finalCredentialId = credentialId;
    if (!finalCredentialId) {
      finalCredentialId = findMatchingCredential(db, host);
    }

    // Create the connection
    const connection = db.createConnection({
      name: host.name,
      hostname: host.publicIp || host.privateIp || host.hostname || host.name,
      port,
      connectionType,
      osType: host.osType,
      credentialId: finalCredentialId,
      tags: Object.entries(host.tags).map(([k, v]) => `${k}:${v}`),
      providerId: host.providerId,
      providerHostId: host.providerHostId,
      description: host.osName,
    });

    // Mark as imported
    db.markHostImported(hostId, connection.id);

    return connection;
  });

  ipcMain.handle('discovered:importAll', async (_event, providerId: string) => {
    const hosts = db.getDiscoveredHosts(providerId).filter(h => !h.imported);
    const connections: ServerConnection[] = [];

    for (const host of hosts) {
      const connectionType = host.osType === 'windows' ? 'rdp' : 'ssh';
      const port = connectionType === 'rdp' ? 3389 : 22;
      const credentialId = findMatchingCredential(db, host);

      const connection = db.createConnection({
        name: host.name,
        hostname: host.publicIp || host.privateIp || host.hostname || host.name,
        port,
        connectionType,
        osType: host.osType,
        credentialId,
        tags: Object.entries(host.tags).map(([k, v]) => `${k}:${v}`),
        providerId: host.providerId,
        providerHostId: host.providerHostId,
        description: host.osName,
      });

      db.markHostImported(host.id, connection.id);
      connections.push(connection);
    }

    return connections;
  });

  // SSH session handlers
  ipcMain.handle('ssh:connect', async (_event, connectionId: string, password?: string) => {
    const connection = db.getConnection(connectionId);
    if (!connection) {
      throw new Error('Connection not found');
    }

    let credential: Credential | null = null;
    if (connection.credentialId) {
      credential = db.getCredential(connection.credentialId);
    }

    // If password provided (from prompt), create a temporary credential
    if (password && !credential) {
      credential = {
        id: 'temp',
        name: 'temp',
        type: 'password',
        username: connection.username || 'root',
        secret: password,
        createdAt: new Date(),
        updatedAt: new Date(),
        usedBy: [],
      };
    }

    const sessionId = await sshService.connect(connection, credential);

    // Update last connected timestamp
    db.updateConnection(connectionId, { lastConnectedAt: new Date() });

    return sessionId;
  });

  ipcMain.handle('ssh:disconnect', async (_event, sessionId: string) => {
    return sshService.disconnect(sessionId);
  });

  ipcMain.handle('ssh:write', async (_event, sessionId: string, data: string) => {
    return sshService.write(sessionId, data);
  });

  ipcMain.handle('ssh:resize', async (_event, sessionId: string, cols: number, rows: number) => {
    return sshService.resize(sessionId, cols, rows);
  });

  // RDP handlers
  ipcMain.handle('rdp:connect', async (_event, connectionId: string) => {
    const connection = db.getConnection(connectionId);
    if (!connection) {
      throw new Error('Connection not found');
    }

    let credential: Credential | null = null;
    if (connection.credentialId) {
      credential = db.getCredential(connection.credentialId);
    }

    await rdpService.connect(connection, credential);

    // Update last connected timestamp
    db.updateConnection(connectionId, { lastConnectedAt: new Date() });
  });

  // Import/Export handlers
  ipcMain.handle('import:file', async (_event, options: ImportOptions) => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      properties: ['openFile'],
      filters: [
        { name: 'All Supported', extensions: ['json', 'csv'] },
        { name: 'JSON', extensions: ['json'] },
        { name: 'CSV', extensions: ['csv'] },
      ],
    });

    if (result.canceled || !result.filePaths[0]) {
      return null;
    }

    const fs = await import('fs/promises');
    const content = await fs.readFile(result.filePaths[0], 'utf-8');

    return await syncService.importData(content, options);
  });

  ipcMain.handle('export:file', async (_event, options: ExportOptions) => {
    const result = await dialog.showSaveDialog(mainWindow!, {
      filters: [
        { name: options.format === 'json' ? 'JSON' : 'CSV', extensions: [options.format] },
      ],
    });

    if (result.canceled || !result.filePath) {
      return false;
    }

    const data = syncService.exportData(options);
    const fs = await import('fs/promises');
    await fs.writeFile(result.filePath, data);

    return true;
  });

  // Sync handlers
  ipcMain.handle('sync:push', async (_event, serverUrl: string, token: string) => {
    return syncService.pushToServer(serverUrl, token);
  });

  ipcMain.handle('sync:pull', async (_event, serverUrl: string, token: string) => {
    return syncService.pullFromServer(serverUrl, token);
  });

  // App info
  ipcMain.handle('app:version', () => {
    return app.getVersion();
  });

  ipcMain.handle('app:platform', () => {
    return process.platform;
  });

  // Saved command handlers
  ipcMain.handle('commands:list', async (_event, category?: string) => {
    return db.getSavedCommands(category);
  });

  ipcMain.handle('commands:get', async (_event, id: string) => {
    return db.getSavedCommand(id);
  });

  ipcMain.handle('commands:create', async (_event, command: Omit<SavedCommand, 'id' | 'createdAt' | 'updatedAt'>) => {
    return db.createSavedCommand(command);
  });

  ipcMain.handle('commands:update', async (_event, id: string, updates: Partial<SavedCommand>) => {
    return db.updateSavedCommand(id, updates);
  });

  ipcMain.handle('commands:delete', async (_event, id: string) => {
    return db.deleteSavedCommand(id);
  });

  // Command execution handlers
  ipcMain.handle('commands:execute', async (_event, executionData: {
    commandId?: string;
    commandName: string;
    command: string;
    targetOS: 'linux' | 'windows' | 'all';
    filter: HostFilter;
    variables?: Record<string, string>;
  }) => {
    // Get connections based on filter
    const allConnections = db.getConnections();
    let targetConnections: ServerConnection[] = [];

    switch (executionData.filter.type) {
      case 'all':
        targetConnections = allConnections;
        break;
      case 'group':
        targetConnections = allConnections.filter(c => c.group === executionData.filter.groupId);
        break;
      case 'pattern':
        if (executionData.filter.pattern) {
          const regex = new RegExp(executionData.filter.pattern.replace(/\*/g, '.*'), 'i');
          targetConnections = allConnections.filter(c => regex.test(c.hostname) || regex.test(c.name));
        }
        break;
      case 'selection':
        if (executionData.filter.connectionIds) {
          targetConnections = allConnections.filter(c => executionData.filter.connectionIds!.includes(c.id));
        }
        break;
      case 'os':
        if (executionData.filter.osType) {
          targetConnections = allConnections.filter(c => c.osType === executionData.filter.osType);
        }
        break;
    }

    // Further filter by target OS if not 'all'
    if (executionData.targetOS !== 'all') {
      const isWindowsTarget = executionData.targetOS === 'windows';
      targetConnections = targetConnections.filter(c =>
        (c.osType === 'windows') === isWindowsTarget
      );
    }

    if (targetConnections.length === 0) {
      return { error: 'No matching connections found' };
    }

    // Substitute variables in command
    let finalCommand = executionData.command;
    if (executionData.variables) {
      finalCommand = commandService.substituteVariables(executionData.command, executionData.variables);
    }

    // Create execution record
    const execution = db.createCommandExecution({
      commandId: executionData.commandId,
      commandName: executionData.commandName,
      command: finalCommand,
      targetOS: executionData.targetOS,
      connectionIds: targetConnections.map(c => c.id),
      results: targetConnections.map(c => ({
        connectionId: c.id,
        connectionName: c.name,
        hostname: c.hostname,
        status: 'pending' as const,
      })),
      startedAt: new Date(),
      status: 'running',
    });

    // Execute commands asynchronously
    commandService.executeCommand(
      execution,
      targetConnections,
      (credId: string) => db.getCredential(credId),
      {
        onProgress: (connectionId, result) => {
          // Send progress update to renderer
          mainWindow?.webContents.send('command:progress', execution.id, connectionId, result);

          // Update stored results
          const current = db.getCommandExecution(execution.id);
          if (current) {
            const updatedResults = current.results.map(r =>
              r.connectionId === connectionId ? { ...r, ...result } : r
            );
            db.updateCommandExecution(execution.id, { results: updatedResults });
          }
        },
        onComplete: (executionId) => {
          const completed = db.getCommandExecution(executionId);
          if (completed) {
            const allDone = completed.results.every(r =>
              r.status === 'success' || r.status === 'error' || r.status === 'skipped'
            );
            const hasErrors = completed.results.some(r => r.status === 'error');

            db.updateCommandExecution(executionId, {
              completedAt: new Date(),
              status: allDone ? (hasErrors ? 'failed' : 'completed') : 'completed',
            });
          }
          mainWindow?.webContents.send('command:complete', executionId);
        },
      }
    );

    return { executionId: execution.id, targetCount: targetConnections.length };
  });

  ipcMain.handle('commands:cancel', async (_event, executionId: string) => {
    commandService.cancelExecution(executionId);
    db.updateCommandExecution(executionId, { status: 'cancelled' });
    return true;
  });

  // Command history handlers
  ipcMain.handle('commands:history', async (_event, limit?: number) => {
    return db.getCommandHistory(limit);
  });

  ipcMain.handle('commands:getExecution', async (_event, id: string) => {
    return db.getCommandExecution(id);
  });

  ipcMain.handle('commands:clearHistory', async () => {
    db.clearCommandHistory();
    return true;
  });

  // SFTP handlers
  ipcMain.handle('sftp:connect', async (_event, connectionId: string) => {
    const connection = db.getConnection(connectionId);
    if (!connection) {
      throw new Error('Connection not found');
    }

    let credential: Credential | null = null;
    if (connection.credentialId) {
      credential = db.getCredential(connection.credentialId);
    }

    const sessionId = await sftpService.connect(connection, credential);
    return sessionId;
  });

  ipcMain.handle('sftp:disconnect', async (_event, sessionId: string) => {
    sftpService.disconnect(sessionId);
    return true;
  });

  ipcMain.handle('sftp:listRemote', async (_event, sessionId: string, remotePath: string) => {
    return sftpService.listRemoteDirectory(sessionId, remotePath);
  });

  ipcMain.handle('sftp:listLocal', async (_event, localPath: string) => {
    return sftpService.listLocalDirectory(localPath);
  });

  ipcMain.handle('sftp:upload', async (_event, sessionId: string, localPath: string, remotePath: string) => {
    await sftpService.upload(sessionId, localPath, remotePath);
    return true;
  });

  ipcMain.handle('sftp:download', async (_event, sessionId: string, remotePath: string, localPath: string) => {
    await sftpService.download(sessionId, remotePath, localPath);
    return true;
  });

  ipcMain.handle('sftp:mkdir', async (_event, sessionId: string, remotePath: string) => {
    await sftpService.mkdir(sessionId, remotePath);
    return true;
  });

  ipcMain.handle('sftp:rmdir', async (_event, sessionId: string, remotePath: string) => {
    await sftpService.rmdir(sessionId, remotePath);
    return true;
  });

  ipcMain.handle('sftp:unlink', async (_event, sessionId: string, remotePath: string) => {
    await sftpService.unlink(sessionId, remotePath);
    return true;
  });

  ipcMain.handle('sftp:rename', async (_event, sessionId: string, oldPath: string, newPath: string) => {
    await sftpService.rename(sessionId, oldPath, newPath);
    return true;
  });

  ipcMain.handle('sftp:chmod', async (_event, sessionId: string, remotePath: string, mode: number) => {
    await sftpService.chmod(sessionId, remotePath, mode);
    return true;
  });

  ipcMain.handle('sftp:stat', async (_event, sessionId: string, remotePath: string) => {
    return sftpService.statRemote(sessionId, remotePath);
  });

  ipcMain.handle('sftp:homePath', async () => {
    return sftpService.getHomePath();
  });

  ipcMain.handle('sftp:sessions', async () => {
    return sftpService.getActiveSessions();
  });

  ipcMain.handle('sftp:selectLocalFolder', async () => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      properties: ['openDirectory'],
    });
    if (result.canceled || !result.filePaths[0]) {
      return null;
    }
    return result.filePaths[0];
  });

  ipcMain.handle('sftp:selectLocalFile', async () => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      properties: ['openFile', 'multiSelections'],
    });
    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }
    return result.filePaths;
  });

  ipcMain.handle('sftp:selectSaveLocation', async (_event, defaultName: string) => {
    const result = await dialog.showSaveDialog(mainWindow!, {
      defaultPath: defaultName,
    });
    if (result.canceled || !result.filePath) {
      return null;
    }
    return result.filePath;
  });

  // Settings handlers
  ipcMain.handle('settings:get', async () => {
    return {
      minimizeToTray: settingsStore.get('minimizeToTray'),
      closeToTray: settingsStore.get('closeToTray'),
      startMinimized: settingsStore.get('startMinimized'),
    };
  });

  ipcMain.handle('settings:set', async (_event, settings: Partial<AppSettings>) => {
    if (settings.minimizeToTray !== undefined) {
      settingsStore.set('minimizeToTray', settings.minimizeToTray);
    }
    if (settings.closeToTray !== undefined) {
      settingsStore.set('closeToTray', settings.closeToTray);
    }
    if (settings.startMinimized !== undefined) {
      settingsStore.set('startMinimized', settings.startMinimized);
    }
    return {
      minimizeToTray: settingsStore.get('minimizeToTray'),
      closeToTray: settingsStore.get('closeToTray'),
      startMinimized: settingsStore.get('startMinimized'),
    };
  });
}

/**
 * Find a matching credential for a discovered host based on auto-assign rules
 */
function findMatchingCredential(database: DatabaseService, host: DiscoveredHost): string | undefined {
  const credentials = database.getCredentials();

  for (const cred of credentials) {
    // Check OS type match
    if (cred.autoAssignOSTypes?.length) {
      if (cred.autoAssignOSTypes.includes(host.osType)) {
        return cred.id;
      }
    }

    // Check hostname pattern match
    if (cred.autoAssignPatterns?.length) {
      const hostname = host.hostname || host.name;
      for (const pattern of cred.autoAssignPatterns) {
        const regex = new RegExp(pattern.replace(/\*/g, '.*'), 'i');
        if (regex.test(hostname)) {
          return cred.id;
        }
      }
    }
  }

  return undefined;
}

app.whenReady().then(async () => {
  try {
    // Initialize services
    const userDataPath = app.getPath('userData');
    db = new DatabaseService(path.join(userDataPath, 'connectty.db'));
    sshService = new SSHService((sessionId, event) => {
      mainWindow?.webContents.send('ssh:event', sessionId, event);
    });
    rdpService = new RDPService();
    syncService = new SyncService(db);
    commandService = new CommandService();
    sftpService = new SFTPService((progress) => {
      mainWindow?.webContents.send('sftp:progress', progress);
    });

    setupIpcHandlers();
  } catch (err) {
    console.error('Failed to initialize services:', err);
    dialog.showErrorBox('Initialization Error', String(err));
  }

  // Create system tray
  createTray();

  // Always create window even if services fail
  await createWindow();

  app.on('activate', async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      await createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  sshService?.disconnectAll();
  sftpService?.disconnectAll();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  isQuitting = true;
  sshService?.disconnectAll();
  sftpService?.disconnectAll();
});
