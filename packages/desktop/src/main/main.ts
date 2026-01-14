/**
 * Electron main process entry point
 */

import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import * as path from 'path';
import { DatabaseService } from './database';
import { SSHService } from './ssh';
import { SyncService } from './sync';
import type { ServerConnection, Credential, ConnectionGroup, ImportOptions, ExportOptions } from '@connectty/shared';

let mainWindow: BrowserWindow | null = null;
let db: DatabaseService;
let sshService: SSHService;
let syncService: SyncService;

const isDev = process.env.NODE_ENV === 'development';

async function createWindow(): Promise<void> {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
    titleBarStyle: 'hiddenInset',
    show: false,
  });

  if (isDev) {
    await mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    await mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
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

  // SSH session handlers
  ipcMain.handle('ssh:connect', async (_event, connectionId: string) => {
    const connection = db.getConnection(connectionId);
    if (!connection) {
      throw new Error('Connection not found');
    }

    let credential: Credential | null = null;
    if (connection.credentialId) {
      credential = db.getCredential(connection.credentialId);
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

app.whenReady().then(async () => {
  // Initialize services
  const userDataPath = app.getPath('userData');
  db = new DatabaseService(path.join(userDataPath, 'connectty.db'));
  sshService = new SSHService((sessionId, event) => {
    mainWindow?.webContents.send('ssh:event', sessionId, event);
  });
  syncService = new SyncService(db);

  setupIpcHandlers();
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
