/**
 * Electron main process entry point
 */

import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import * as path from 'path';
import { DatabaseService } from './database';
import { SSHService } from './ssh';
import { RDPService } from './rdp';
import { SyncService } from './sync';
import { getProviderService } from './providers';
import type {
  ServerConnection,
  Credential,
  ConnectionGroup,
  Provider,
  DiscoveredHost,
  ImportOptions,
  ExportOptions,
  OSType,
} from '@connectty/shared';

let mainWindow: BrowserWindow | null = null;
let db: DatabaseService;
let sshService: SSHService;
let rdpService: RDPService;
let syncService: SyncService;

const isDev = process.env.NODE_ENV === 'development';

async function createWindow(): Promise<void> {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    show: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  // Force show immediately
  mainWindow.show();
  mainWindow.focus();

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

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
    return db.createCredential(credential);
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

    return syncService.importData(content, options);
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

    setupIpcHandlers();
  } catch (err) {
    console.error('Failed to initialize services:', err);
    dialog.showErrorBox('Initialization Error', String(err));
  }

  // Always create window even if services fail
  await createWindow();

  app.on('activate', async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      await createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  sshService.disconnectAll();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  sshService.disconnectAll();
});
