/**
 * Electron main process entry point
 */

import { app, BrowserWindow, ipcMain, dialog, Tray, Menu, nativeImage } from 'electron';
import * as path from 'path';
import Store from 'electron-store';
import { DatabaseService } from './database';
import { SSHService } from './ssh';
import { RDPService } from './rdp';
import { RDPSessionService } from './rdp-session';
import { SerialService } from './serial';
import { SyncService } from './sync';
import { CommandService } from './command';
import { SFTPService } from './sftp';
import { LocalShellService } from './local-shell';
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
let rdpSessionService: RDPSessionService;
let serialService: SerialService;
let syncService: SyncService;
let commandService: CommandService;
let sftpService: SFTPService;
let localShellService: LocalShellService;

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

  // Test provider connection with config (before saving)
  ipcMain.handle('providers:testConfig', async (_event, providerData: Partial<Provider>) => {
    if (!providerData.type || !providerData.config) {
      throw new Error('Provider type and config are required');
    }
    const service = getProviderService(providerData.type);
    // Create a temporary provider object for testing
    const tempProvider: Provider = {
      id: 'temp-test',
      name: providerData.name || 'Test',
      type: providerData.type,
      enabled: true,
      config: providerData.config,
      autoDiscover: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    return service.testConnection(tempProvider);
  });

  ipcMain.handle('providers:discover', async (_event, id: string) => {
    const provider = db.getProvider(id);
    if (!provider) {
      throw new Error('Provider not found');
    }

    const service = getProviderService(provider.type);
    const result = await service.discoverHosts(provider);

    // Clear non-imported hosts before storing new ones
    // This removes hosts that no longer exist in the provider
    db.clearNonImportedDiscoveredHosts(id);

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

  ipcMain.handle('discovered:import', async (_event, hostId: string, credentialId?: string, groupId?: string) => {
    const host = db.getDiscoveredHost(hostId);
    if (!host) {
      throw new Error('Host not found');
    }

    // Determine connection type and port based on OS
    const connectionType = host.osType === 'windows' ? 'rdp' : 'ssh';
    const port = connectionType === 'rdp' ? 3389 : 22;

    // Auto-assign credential if not provided - check for group-based auto-assign
    let finalCredentialId = credentialId;
    if (!finalCredentialId) {
      finalCredentialId = findMatchingCredential(db, host, groupId);
    }

    // Get unique name (adds provider suffix if duplicates exist)
    const uniqueName = getUniqueConnectionName(db, host.name, host.providerId);

    // Create the connection
    const connection = db.createConnection({
      name: uniqueName,
      hostname: host.publicIp || host.privateIp || host.hostname || host.name,
      port,
      connectionType,
      osType: host.osType,
      credentialId: finalCredentialId,
      group: groupId,
      tags: Object.entries(host.tags).map(([k, v]) => `${k}:${v}`),
      providerId: host.providerId,
      providerHostId: host.providerHostId,
      description: host.osName,
    });

    // Mark as imported
    db.markHostImported(hostId, connection.id);

    return connection;
  });

  ipcMain.handle('discovered:importAll', async (_event, providerId: string, groupId?: string) => {
    const hosts = db.getDiscoveredHosts(providerId).filter(h => !h.imported);
    const connections: ServerConnection[] = [];

    for (const host of hosts) {
      const connectionType = host.osType === 'windows' ? 'rdp' : 'ssh';
      const port = connectionType === 'rdp' ? 3389 : 22;
      const credentialId = findMatchingCredential(db, host, groupId);

      // Get unique name (adds provider suffix if duplicates exist)
      const uniqueName = getUniqueConnectionName(db, host.name, host.providerId);

      const connection = db.createConnection({
        name: uniqueName,
        hostname: host.publicIp || host.privateIp || host.hostname || host.name,
        port,
        connectionType,
        osType: host.osType,
        credentialId,
        group: groupId,
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

  ipcMain.handle('discovered:importSelected', async (_event, hostIds: string[], assignedCredentialId?: string, groupId?: string) => {
    const connections: ServerConnection[] = [];

    for (const hostId of hostIds) {
      const host = db.getDiscoveredHost(hostId);
      if (!host || host.imported) continue;

      const connectionType = host.osType === 'windows' ? 'rdp' : 'ssh';
      const port = connectionType === 'rdp' ? 3389 : 22;
      // Use assigned credential if provided, otherwise try to find a matching one based on group
      const credentialId = assignedCredentialId || findMatchingCredential(db, host, groupId);

      // Get unique name (adds provider suffix if duplicates exist)
      const uniqueName = getUniqueConnectionName(db, host.name, host.providerId);

      const connection = db.createConnection({
        name: uniqueName,
        hostname: host.publicIp || host.privateIp || host.hostname || host.name,
        port,
        connectionType,
        osType: host.osType,
        credentialId,
        group: groupId,
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

  ipcMain.handle('connections:getByProvider', async (_event, providerId: string) => {
    return db.getConnectionsByProvider(providerId);
  });

  ipcMain.handle('connections:deleteByProvider', async (_event, providerId: string) => {
    return db.deleteConnectionsByProvider(providerId);
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
      if (!credential) {
        // Credential reference exists but credential was deleted
        throw new Error('Saved credential not found. Please edit the connection and select a valid credential or enter a password.');
      }
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
  // Embedded RDP session handlers (tabbed)
  ipcMain.handle('rdp:connect', async (_event, connectionId: string, embedded: boolean = true) => {
    const connection = db.getConnection(connectionId);
    if (!connection) {
      throw new Error('Connection not found');
    }

    let credential: Credential | null = null;
    if (connection.credentialId) {
      credential = db.getCredential(connection.credentialId);
    }

    // Try embedded RDP if requested and available
    if (embedded && rdpSessionService.isAvailable()) {
      try {
        const sessionId = await rdpSessionService.connect(connection, credential);
        db.updateConnection(connectionId, { lastConnectedAt: new Date() });
        return { sessionId, embedded: true };
      } catch (err: any) {
        // Check for NLA/CredSSP errors (code 5) or other auth failures
        // These require native client with proper Windows auth support
        const errorMsg = err?.message || '';
        if (errorMsg.includes('code:5') || errorMsg.includes('code:1') ||
            errorMsg.includes('SSL') || errorMsg.includes('NLA') ||
            errorMsg.includes('CredSSP') || errorMsg.includes('authentication')) {
          console.log('Embedded RDP failed due to NLA/SSL, falling back to native client');
          // Fall through to native client
        } else {
          throw err;
        }
      }
    }

    // Fall back to external RDP client
    await rdpService.connect(connection, credential);
    db.updateConnection(connectionId, { lastConnectedAt: new Date() });
    return { sessionId: null, embedded: false, reason: 'native' }; // No session ID for external RDP
  });

  ipcMain.handle('rdp:disconnect', async (_event, sessionId: string) => {
    rdpSessionService.disconnect(sessionId);
  });

  ipcMain.handle('rdp:sendKey', async (_event, sessionId: string, scanCode: number, isPressed: boolean, isExtended: boolean) => {
    rdpSessionService.sendKeyEvent(sessionId, scanCode, isPressed, isExtended);
  });

  ipcMain.handle('rdp:sendMouse', async (_event, sessionId: string, x: number, y: number, button: number, isPressed: boolean) => {
    rdpSessionService.sendMouseEvent(sessionId, x, y, button, isPressed);
  });

  ipcMain.handle('rdp:sendWheel', async (_event, sessionId: string, x: number, y: number, delta: number, isHorizontal: boolean) => {
    rdpSessionService.sendWheelEvent(sessionId, x, y, delta, isHorizontal);
  });

  ipcMain.handle('rdp:isAvailable', async () => {
    return rdpSessionService.isAvailable();
  });

  // Serial handlers
  ipcMain.handle('serial:connect', async (_event, connectionId: string) => {
    const connection = db.getConnection(connectionId);
    if (!connection) {
      throw new Error('Connection not found');
    }

    if (connection.connectionType !== 'serial') {
      throw new Error('Not a serial connection');
    }

    if (!connection.serialSettings) {
      throw new Error('Serial settings are required');
    }

    const sessionId = await serialService.connect(connection);

    // Update last connected timestamp
    db.updateConnection(connectionId, { lastConnectedAt: new Date() });
    return sessionId;
  });

  ipcMain.handle('serial:disconnect', async (_event, sessionId: string) => {
    return serialService.disconnect(sessionId);
  });

  ipcMain.handle('serial:write', async (_event, sessionId: string, data: string) => {
    return serialService.write(sessionId, data);
  });

  ipcMain.handle('serial:listPorts', async () => {
    return SerialService.listPorts();
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

  ipcMain.handle('sftp:getTempDir', async () => {
    return os.tmpdir();
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

  // Local shell handlers
  ipcMain.handle('localShell:getAvailable', async () => {
    return localShellService.getAvailableShells();
  });

  ipcMain.handle('localShell:spawn', async (_event, shellId: string) => {
    const shells = await localShellService.getAvailableShells();
    const shellInfo = shells.find(s => s.id === shellId);
    if (!shellInfo) {
      throw new Error(`Shell not found: ${shellId}`);
    }
    return localShellService.spawn(shellInfo);
  });

  ipcMain.handle('localShell:write', async (_event, sessionId: string, data: string) => {
    localShellService.write(sessionId, data);
  });

  ipcMain.handle('localShell:resize', async (_event, sessionId: string, cols: number, rows: number) => {
    localShellService.resize(sessionId, cols, rows);
  });

  ipcMain.handle('localShell:kill', async (_event, sessionId: string) => {
    localShellService.kill(sessionId);
  });
}

/**
 * Find a matching credential for a discovered host based on auto-assign rules
 */
function findMatchingCredential(database: DatabaseService, host: DiscoveredHost, targetGroupId?: string): string | undefined {
  const credentials = database.getCredentials();

  for (const cred of credentials) {
    // Check group match - if importing into a group, use credentials assigned to that group
    if (targetGroupId && cred.autoAssignGroup === targetGroupId) {
      return cred.id;
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

/**
 * Generate a unique connection name, adding provider suffix if there are duplicates.
 * Also updates existing connections with the same name to include their provider suffix.
 */
function getUniqueConnectionName(
  database: DatabaseService,
  hostName: string,
  hostProviderId: string
): string {
  const allConnections = database.getConnections();
  const provider = database.getProvider(hostProviderId);
  const providerName = provider?.name || 'Unknown';

  // Find connections with the same base name (ignoring any existing provider suffix)
  const duplicates = allConnections.filter(conn => {
    // Extract base name by removing any existing " (provider)" suffix
    const baseConnName = conn.name.replace(/\s*\([^)]+\)\s*$/, '');
    return baseConnName === hostName && conn.providerId !== hostProviderId;
  });

  if (duplicates.length > 0) {
    // Update existing connections to include their provider suffix if they don't have one
    for (const dup of duplicates) {
      // Check if this connection already has a provider suffix
      if (!dup.name.match(/\s*\([^)]+\)\s*$/)) {
        const dupProvider = dup.providerId ? database.getProvider(dup.providerId) : null;
        const dupProviderName = dupProvider?.name || 'Manual';
        const newName = `${dup.name} (${dupProviderName})`;
        database.updateConnection(dup.id, { name: newName });
      }
    }

    // Return name with provider suffix for the new import
    return `${hostName} (${providerName})`;
  }

  // Check if there's an existing connection with exactly this name from the same provider
  const sameProviderDup = allConnections.find(conn =>
    conn.name === hostName && conn.providerId === hostProviderId
  );

  if (sameProviderDup) {
    // Same provider, same name - add provider suffix anyway for clarity
    return `${hostName} (${providerName})`;
  }

  // No duplicates, return original name
  return hostName;
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
    rdpSessionService = new RDPSessionService((sessionId, event) => {
      mainWindow?.webContents.send('rdp:event', sessionId, event);
    });
    serialService = new SerialService((sessionId, event) => {
      mainWindow?.webContents.send('serial:event', sessionId, event);
    });
    syncService = new SyncService(db);
    commandService = new CommandService();
    sftpService = new SFTPService((progress) => {
      mainWindow?.webContents.send('sftp:progress', progress);
    });
    localShellService = new LocalShellService((sessionId, event) => {
      mainWindow?.webContents.send('localShell:event', sessionId, event);
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
  localShellService?.disconnectAll();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  isQuitting = true;
  sshService?.disconnectAll();
  sftpService?.disconnectAll();
  localShellService?.disconnectAll();
});
