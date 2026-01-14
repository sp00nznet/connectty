/**
 * SQLite database service for local persistent storage
 */

import Database from 'better-sqlite3';
import { generateId, encrypt, decrypt, type EncryptedData } from '@connectty/shared';
import type { ServerConnection, Credential, ConnectionGroup } from '@connectty/shared';

export class DatabaseService {
  private db: Database.Database;
  private masterKey: string;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.masterKey = this.getOrCreateMasterKey();
    this.initialize();
  }

  private getOrCreateMasterKey(): string {
    const stmt = this.db.prepare(`
      CREATE TABLE IF NOT EXISTS app_config (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      )
    `);
    stmt.run();

    const getKey = this.db.prepare('SELECT value FROM app_config WHERE key = ?');
    const row = getKey.get('master_key') as { value: string } | undefined;

    if (row) {
      return row.value;
    }

    const newKey = require('crypto').randomBytes(32).toString('base64');
    const setKey = this.db.prepare('INSERT INTO app_config (key, value) VALUES (?, ?)');
    setKey.run('master_key', newKey);

    return newKey;
  }

  private initialize(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS connections (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        hostname TEXT NOT NULL,
        port INTEGER DEFAULT 22,
        username TEXT,
        credential_id TEXT,
        tags TEXT DEFAULT '[]',
        group_id TEXT,
        description TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        last_connected_at TEXT
      );

      CREATE TABLE IF NOT EXISTS credentials (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        type TEXT NOT NULL,
        username TEXT NOT NULL,
        encrypted_data TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS connection_groups (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        parent_id TEXT,
        color TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_connections_group ON connections(group_id);
      CREATE INDEX IF NOT EXISTS idx_connections_credential ON connections(credential_id);
      CREATE INDEX IF NOT EXISTS idx_groups_parent ON connection_groups(parent_id);
    `);
  }

  // Connection methods
  getConnections(): ServerConnection[] {
    const stmt = this.db.prepare('SELECT * FROM connections ORDER BY name');
    const rows = stmt.all() as ConnectionRow[];
    return rows.map(this.rowToConnection);
  }

  getConnection(id: string): ServerConnection | null {
    const stmt = this.db.prepare('SELECT * FROM connections WHERE id = ?');
    const row = stmt.get(id) as ConnectionRow | undefined;
    return row ? this.rowToConnection(row) : null;
  }

  createConnection(data: Omit<ServerConnection, 'id' | 'createdAt' | 'updatedAt'>): ServerConnection {
    const id = generateId();
    const now = new Date().toISOString();

    const stmt = this.db.prepare(`
      INSERT INTO connections (id, name, hostname, port, username, credential_id, tags, group_id, description, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      id,
      data.name,
      data.hostname,
      data.port || 22,
      data.username || null,
      data.credentialId || null,
      JSON.stringify(data.tags || []),
      data.group || null,
      data.description || null,
      now,
      now
    );

    return this.getConnection(id)!;
  }

  updateConnection(id: string, updates: Partial<ServerConnection>): ServerConnection | null {
    const existing = this.getConnection(id);
    if (!existing) return null;

    const now = new Date().toISOString();
    const fields: string[] = ['updated_at = ?'];
    const values: unknown[] = [now];

    if (updates.name !== undefined) {
      fields.push('name = ?');
      values.push(updates.name);
    }
    if (updates.hostname !== undefined) {
      fields.push('hostname = ?');
      values.push(updates.hostname);
    }
    if (updates.port !== undefined) {
      fields.push('port = ?');
      values.push(updates.port);
    }
    if (updates.username !== undefined) {
      fields.push('username = ?');
      values.push(updates.username);
    }
    if (updates.credentialId !== undefined) {
      fields.push('credential_id = ?');
      values.push(updates.credentialId);
    }
    if (updates.tags !== undefined) {
      fields.push('tags = ?');
      values.push(JSON.stringify(updates.tags));
    }
    if (updates.group !== undefined) {
      fields.push('group_id = ?');
      values.push(updates.group);
    }
    if (updates.description !== undefined) {
      fields.push('description = ?');
      values.push(updates.description);
    }
    if (updates.lastConnectedAt !== undefined) {
      fields.push('last_connected_at = ?');
      values.push(updates.lastConnectedAt instanceof Date ? updates.lastConnectedAt.toISOString() : updates.lastConnectedAt);
    }

    values.push(id);
    const stmt = this.db.prepare(`UPDATE connections SET ${fields.join(', ')} WHERE id = ?`);
    stmt.run(...values);

    return this.getConnection(id);
  }

  deleteConnection(id: string): boolean {
    const stmt = this.db.prepare('DELETE FROM connections WHERE id = ?');
    const result = stmt.run(id);
    return result.changes > 0;
  }

  // Credential methods
  getCredentials(): Credential[] {
    const stmt = this.db.prepare('SELECT * FROM credentials ORDER BY name');
    const rows = stmt.all() as CredentialRow[];
    return rows.map((row) => this.rowToCredential(row));
  }

  getCredential(id: string): Credential | null {
    const stmt = this.db.prepare('SELECT * FROM credentials WHERE id = ?');
    const row = stmt.get(id) as CredentialRow | undefined;
    return row ? this.rowToCredential(row) : null;
  }

  createCredential(data: Omit<Credential, 'id' | 'createdAt' | 'updatedAt' | 'usedBy'>): Credential {
    const id = generateId();
    const now = new Date().toISOString();

    // Encrypt sensitive data
    const sensitiveData: Record<string, string> = {};
    if (data.secret) sensitiveData.secret = data.secret;
    if (data.privateKey) sensitiveData.privateKey = data.privateKey;
    if (data.passphrase) sensitiveData.passphrase = data.passphrase;

    const encryptedData = Object.keys(sensitiveData).length > 0
      ? encrypt(JSON.stringify(sensitiveData), this.masterKey)
      : null;

    const stmt = this.db.prepare(`
      INSERT INTO credentials (id, name, type, username, encrypted_data, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      id,
      data.name,
      data.type,
      data.username,
      encryptedData ? JSON.stringify(encryptedData) : null,
      now,
      now
    );

    return this.getCredential(id)!;
  }

  updateCredential(id: string, updates: Partial<Credential>): Credential | null {
    const existing = this.getCredential(id);
    if (!existing) return null;

    const now = new Date().toISOString();
    const fields: string[] = ['updated_at = ?'];
    const values: unknown[] = [now];

    if (updates.name !== undefined) {
      fields.push('name = ?');
      values.push(updates.name);
    }
    if (updates.type !== undefined) {
      fields.push('type = ?');
      values.push(updates.type);
    }
    if (updates.username !== undefined) {
      fields.push('username = ?');
      values.push(updates.username);
    }

    // Handle encrypted data updates
    if (updates.secret !== undefined || updates.privateKey !== undefined || updates.passphrase !== undefined) {
      const sensitiveData: Record<string, string> = {};
      if (updates.secret !== undefined) sensitiveData.secret = updates.secret;
      else if (existing.secret) sensitiveData.secret = existing.secret;

      if (updates.privateKey !== undefined) sensitiveData.privateKey = updates.privateKey;
      else if (existing.privateKey) sensitiveData.privateKey = existing.privateKey;

      if (updates.passphrase !== undefined) sensitiveData.passphrase = updates.passphrase;
      else if (existing.passphrase) sensitiveData.passphrase = existing.passphrase;

      const encryptedData = Object.keys(sensitiveData).length > 0
        ? encrypt(JSON.stringify(sensitiveData), this.masterKey)
        : null;

      fields.push('encrypted_data = ?');
      values.push(encryptedData ? JSON.stringify(encryptedData) : null);
    }

    values.push(id);
    const stmt = this.db.prepare(`UPDATE credentials SET ${fields.join(', ')} WHERE id = ?`);
    stmt.run(...values);

    return this.getCredential(id);
  }

  deleteCredential(id: string): boolean {
    const stmt = this.db.prepare('DELETE FROM credentials WHERE id = ?');
    const result = stmt.run(id);
    return result.changes > 0;
  }

  // Group methods
  getGroups(): ConnectionGroup[] {
    const stmt = this.db.prepare('SELECT * FROM connection_groups ORDER BY name');
    const rows = stmt.all() as GroupRow[];
    return rows.map(this.rowToGroup);
  }

  getGroup(id: string): ConnectionGroup | null {
    const stmt = this.db.prepare('SELECT * FROM connection_groups WHERE id = ?');
    const row = stmt.get(id) as GroupRow | undefined;
    return row ? this.rowToGroup(row) : null;
  }

  createGroup(data: Omit<ConnectionGroup, 'id' | 'createdAt' | 'updatedAt'>): ConnectionGroup {
    const id = generateId();
    const now = new Date().toISOString();

    const stmt = this.db.prepare(`
      INSERT INTO connection_groups (id, name, description, parent_id, color, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(id, data.name, data.description || null, data.parentId || null, data.color || null, now, now);

    return this.getGroup(id)!;
  }

  updateGroup(id: string, updates: Partial<ConnectionGroup>): ConnectionGroup | null {
    const existing = this.getGroup(id);
    if (!existing) return null;

    const now = new Date().toISOString();
    const fields: string[] = ['updated_at = ?'];
    const values: unknown[] = [now];

    if (updates.name !== undefined) {
      fields.push('name = ?');
      values.push(updates.name);
    }
    if (updates.description !== undefined) {
      fields.push('description = ?');
      values.push(updates.description);
    }
    if (updates.parentId !== undefined) {
      fields.push('parent_id = ?');
      values.push(updates.parentId);
    }
    if (updates.color !== undefined) {
      fields.push('color = ?');
      values.push(updates.color);
    }

    values.push(id);
    const stmt = this.db.prepare(`UPDATE connection_groups SET ${fields.join(', ')} WHERE id = ?`);
    stmt.run(...values);

    return this.getGroup(id);
  }

  deleteGroup(id: string): boolean {
    const stmt = this.db.prepare('DELETE FROM connection_groups WHERE id = ?');
    const result = stmt.run(id);
    return result.changes > 0;
  }

  // Helper methods
  private rowToConnection(row: ConnectionRow): ServerConnection {
    return {
      id: row.id,
      name: row.name,
      hostname: row.hostname,
      port: row.port,
      username: row.username || undefined,
      credentialId: row.credential_id || undefined,
      tags: JSON.parse(row.tags || '[]'),
      group: row.group_id || undefined,
      description: row.description || undefined,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
      lastConnectedAt: row.last_connected_at ? new Date(row.last_connected_at) : undefined,
    };
  }

  private rowToCredential(row: CredentialRow): Credential {
    let sensitiveData: Record<string, string> = {};

    if (row.encrypted_data) {
      try {
        const encData = JSON.parse(row.encrypted_data) as EncryptedData;
        const decrypted = decrypt(encData, this.masterKey);
        sensitiveData = JSON.parse(decrypted);
      } catch {
        // Failed to decrypt
      }
    }

    // Get connections using this credential
    const usedBy = this.db
      .prepare('SELECT id FROM connections WHERE credential_id = ?')
      .all(row.id) as { id: string }[];

    return {
      id: row.id,
      name: row.name,
      type: row.type as Credential['type'],
      username: row.username,
      secret: sensitiveData.secret,
      privateKey: sensitiveData.privateKey,
      passphrase: sensitiveData.passphrase,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
      usedBy: usedBy.map((r) => r.id),
    };
  }

  private rowToGroup(row: GroupRow): ConnectionGroup {
    return {
      id: row.id,
      name: row.name,
      description: row.description || undefined,
      parentId: row.parent_id || undefined,
      color: row.color || undefined,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }

  // Export all data for sync
  exportAll(): { connections: ServerConnection[]; credentials: Credential[]; groups: ConnectionGroup[] } {
    return {
      connections: this.getConnections(),
      credentials: this.getCredentials(),
      groups: this.getGroups(),
    };
  }

  close(): void {
    this.db.close();
  }
}

interface ConnectionRow {
  id: string;
  name: string;
  hostname: string;
  port: number;
  username: string | null;
  credential_id: string | null;
  tags: string;
  group_id: string | null;
  description: string | null;
  created_at: string;
  updated_at: string;
  last_connected_at: string | null;
}

interface CredentialRow {
  id: string;
  name: string;
  type: string;
  username: string;
  encrypted_data: string | null;
  created_at: string;
  updated_at: string;
}

interface GroupRow {
  id: string;
  name: string;
  description: string | null;
  parent_id: string | null;
  color: string | null;
  created_at: string;
  updated_at: string;
}
