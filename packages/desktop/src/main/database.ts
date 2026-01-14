/**
 * SQLite database service for local persistent storage
 */

import Database from 'better-sqlite3';
import { generateId, encrypt, decrypt, type EncryptedData } from '@connectty/shared';
import type {
  ServerConnection,
  Credential,
  ConnectionGroup,
  Provider,
  DiscoveredHost,
  ProviderConfig,
  ConnectionType,
  OSType,
} from '@connectty/shared';

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
        connection_type TEXT DEFAULT 'ssh',
        os_type TEXT,
        username TEXT,
        credential_id TEXT,
        tags TEXT DEFAULT '[]',
        group_id TEXT,
        description TEXT,
        provider_id TEXT,
        provider_host_id TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        last_connected_at TEXT
      );

      CREATE TABLE IF NOT EXISTS credentials (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        type TEXT NOT NULL,
        username TEXT NOT NULL,
        domain TEXT,
        encrypted_data TEXT,
        auto_assign_patterns TEXT DEFAULT '[]',
        auto_assign_os_types TEXT DEFAULT '[]',
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

      CREATE TABLE IF NOT EXISTS providers (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        type TEXT NOT NULL,
        enabled INTEGER DEFAULT 1,
        config TEXT NOT NULL,
        auto_discover INTEGER DEFAULT 0,
        discover_interval INTEGER,
        last_discovery_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS discovered_hosts (
        id TEXT PRIMARY KEY,
        provider_id TEXT NOT NULL,
        provider_host_id TEXT NOT NULL,
        name TEXT NOT NULL,
        hostname TEXT,
        private_ip TEXT,
        public_ip TEXT,
        os_type TEXT NOT NULL,
        os_name TEXT,
        state TEXT NOT NULL,
        metadata TEXT DEFAULT '{}',
        tags TEXT DEFAULT '{}',
        discovered_at TEXT NOT NULL,
        last_seen_at TEXT NOT NULL,
        imported INTEGER DEFAULT 0,
        connection_id TEXT,
        FOREIGN KEY (provider_id) REFERENCES providers(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_connections_group ON connections(group_id);
      CREATE INDEX IF NOT EXISTS idx_connections_credential ON connections(credential_id);
      CREATE INDEX IF NOT EXISTS idx_connections_provider ON connections(provider_id);
      CREATE INDEX IF NOT EXISTS idx_groups_parent ON connection_groups(parent_id);
      CREATE INDEX IF NOT EXISTS idx_discovered_provider ON discovered_hosts(provider_id);
    `);

    // Run migrations for existing databases
    this.runMigrations();
  }

  private runMigrations(): void {
    // Add new columns to existing tables if they don't exist
    const migrations = [
      { table: 'connections', column: 'connection_type', sql: "ALTER TABLE connections ADD COLUMN connection_type TEXT DEFAULT 'ssh'" },
      { table: 'connections', column: 'os_type', sql: 'ALTER TABLE connections ADD COLUMN os_type TEXT' },
      { table: 'connections', column: 'provider_id', sql: 'ALTER TABLE connections ADD COLUMN provider_id TEXT' },
      { table: 'connections', column: 'provider_host_id', sql: 'ALTER TABLE connections ADD COLUMN provider_host_id TEXT' },
      { table: 'credentials', column: 'domain', sql: 'ALTER TABLE credentials ADD COLUMN domain TEXT' },
      { table: 'credentials', column: 'auto_assign_patterns', sql: "ALTER TABLE credentials ADD COLUMN auto_assign_patterns TEXT DEFAULT '[]'" },
      { table: 'credentials', column: 'auto_assign_os_types', sql: "ALTER TABLE credentials ADD COLUMN auto_assign_os_types TEXT DEFAULT '[]'" },
    ];

    for (const migration of migrations) {
      try {
        const columns = this.db.pragma(`table_info(${migration.table})`) as Array<{ name: string }>;
        if (!columns.some(col => col.name === migration.column)) {
          this.db.exec(migration.sql);
        }
      } catch {
        // Column might already exist or table doesn't exist yet
      }
    }
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
    const connectionType = data.connectionType || 'ssh';
    const defaultPort = connectionType === 'rdp' ? 3389 : 22;

    const stmt = this.db.prepare(`
      INSERT INTO connections (id, name, hostname, port, connection_type, os_type, username, credential_id, tags, group_id, description, provider_id, provider_host_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      id,
      data.name,
      data.hostname,
      data.port || defaultPort,
      connectionType,
      data.osType || null,
      data.username || null,
      data.credentialId || null,
      JSON.stringify(data.tags || []),
      data.group || null,
      data.description || null,
      data.providerId || null,
      data.providerHostId || null,
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
    if (updates.connectionType !== undefined) {
      fields.push('connection_type = ?');
      values.push(updates.connectionType);
    }
    if (updates.osType !== undefined) {
      fields.push('os_type = ?');
      values.push(updates.osType);
    }
    if (updates.providerId !== undefined) {
      fields.push('provider_id = ?');
      values.push(updates.providerId);
    }
    if (updates.providerHostId !== undefined) {
      fields.push('provider_host_id = ?');
      values.push(updates.providerHostId);
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
      INSERT INTO credentials (id, name, type, username, domain, encrypted_data, auto_assign_patterns, auto_assign_os_types, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      id,
      data.name,
      data.type,
      data.username,
      data.domain || null,
      encryptedData ? JSON.stringify(encryptedData) : null,
      JSON.stringify(data.autoAssignPatterns || []),
      JSON.stringify(data.autoAssignOSTypes || []),
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
    if (updates.domain !== undefined) {
      fields.push('domain = ?');
      values.push(updates.domain);
    }
    if (updates.autoAssignPatterns !== undefined) {
      fields.push('auto_assign_patterns = ?');
      values.push(JSON.stringify(updates.autoAssignPatterns));
    }
    if (updates.autoAssignOSTypes !== undefined) {
      fields.push('auto_assign_os_types = ?');
      values.push(JSON.stringify(updates.autoAssignOSTypes));
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

  // Provider methods
  getProviders(): Provider[] {
    const stmt = this.db.prepare('SELECT * FROM providers ORDER BY name');
    const rows = stmt.all() as ProviderRow[];
    return rows.map((row) => this.rowToProvider(row));
  }

  getProvider(id: string): Provider | null {
    const stmt = this.db.prepare('SELECT * FROM providers WHERE id = ?');
    const row = stmt.get(id) as ProviderRow | undefined;
    return row ? this.rowToProvider(row) : null;
  }

  createProvider(data: Omit<Provider, 'id' | 'createdAt' | 'updatedAt'>): Provider {
    const id = generateId();
    const now = new Date().toISOString();

    // Encrypt sensitive fields in config
    const configToStore = this.encryptProviderConfig(data.config);

    const stmt = this.db.prepare(`
      INSERT INTO providers (id, name, type, enabled, config, auto_discover, discover_interval, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      id,
      data.name,
      data.type,
      data.enabled ? 1 : 0,
      JSON.stringify(configToStore),
      data.autoDiscover ? 1 : 0,
      data.discoverInterval || null,
      now,
      now
    );

    return this.getProvider(id)!;
  }

  updateProvider(id: string, updates: Partial<Provider>): Provider | null {
    const existing = this.getProvider(id);
    if (!existing) return null;

    const now = new Date().toISOString();
    const fields: string[] = ['updated_at = ?'];
    const values: unknown[] = [now];

    if (updates.name !== undefined) {
      fields.push('name = ?');
      values.push(updates.name);
    }
    if (updates.enabled !== undefined) {
      fields.push('enabled = ?');
      values.push(updates.enabled ? 1 : 0);
    }
    if (updates.config !== undefined) {
      const configToStore = this.encryptProviderConfig(updates.config);
      fields.push('config = ?');
      values.push(JSON.stringify(configToStore));
    }
    if (updates.autoDiscover !== undefined) {
      fields.push('auto_discover = ?');
      values.push(updates.autoDiscover ? 1 : 0);
    }
    if (updates.discoverInterval !== undefined) {
      fields.push('discover_interval = ?');
      values.push(updates.discoverInterval);
    }
    if (updates.lastDiscoveryAt !== undefined) {
      fields.push('last_discovery_at = ?');
      values.push(updates.lastDiscoveryAt instanceof Date ? updates.lastDiscoveryAt.toISOString() : updates.lastDiscoveryAt);
    }

    values.push(id);
    const stmt = this.db.prepare(`UPDATE providers SET ${fields.join(', ')} WHERE id = ?`);
    stmt.run(...values);

    return this.getProvider(id);
  }

  deleteProvider(id: string): boolean {
    // Also delete discovered hosts for this provider
    this.db.prepare('DELETE FROM discovered_hosts WHERE provider_id = ?').run(id);
    const stmt = this.db.prepare('DELETE FROM providers WHERE id = ?');
    const result = stmt.run(id);
    return result.changes > 0;
  }

  // Discovered host methods
  getDiscoveredHosts(providerId?: string): DiscoveredHost[] {
    const sql = providerId
      ? 'SELECT * FROM discovered_hosts WHERE provider_id = ? ORDER BY name'
      : 'SELECT * FROM discovered_hosts ORDER BY name';
    const stmt = this.db.prepare(sql);
    const rows = (providerId ? stmt.all(providerId) : stmt.all()) as DiscoveredHostRow[];
    return rows.map((row) => this.rowToDiscoveredHost(row));
  }

  getDiscoveredHost(id: string): DiscoveredHost | null {
    const stmt = this.db.prepare('SELECT * FROM discovered_hosts WHERE id = ?');
    const row = stmt.get(id) as DiscoveredHostRow | undefined;
    return row ? this.rowToDiscoveredHost(row) : null;
  }

  upsertDiscoveredHost(host: DiscoveredHost): DiscoveredHost {
    const existing = this.db.prepare(
      'SELECT id FROM discovered_hosts WHERE provider_id = ? AND provider_host_id = ?'
    ).get(host.providerId, host.providerHostId) as { id: string } | undefined;

    if (existing) {
      // Update existing
      const stmt = this.db.prepare(`
        UPDATE discovered_hosts SET
          name = ?, hostname = ?, private_ip = ?, public_ip = ?,
          os_type = ?, os_name = ?, state = ?,
          metadata = ?, tags = ?, last_seen_at = ?
        WHERE id = ?
      `);
      stmt.run(
        host.name,
        host.hostname || null,
        host.privateIp || null,
        host.publicIp || null,
        host.osType,
        host.osName || null,
        host.state,
        JSON.stringify(host.metadata),
        JSON.stringify(host.tags),
        new Date().toISOString(),
        existing.id
      );
      return this.getDiscoveredHost(existing.id)!;
    } else {
      // Insert new
      const stmt = this.db.prepare(`
        INSERT INTO discovered_hosts (
          id, provider_id, provider_host_id, name, hostname,
          private_ip, public_ip, os_type, os_name, state,
          metadata, tags, discovered_at, last_seen_at, imported, connection_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      const now = new Date().toISOString();
      stmt.run(
        host.id,
        host.providerId,
        host.providerHostId,
        host.name,
        host.hostname || null,
        host.privateIp || null,
        host.publicIp || null,
        host.osType,
        host.osName || null,
        host.state,
        JSON.stringify(host.metadata),
        JSON.stringify(host.tags),
        now,
        now,
        host.imported ? 1 : 0,
        host.connectionId || null
      );
      return this.getDiscoveredHost(host.id)!;
    }
  }

  markHostImported(hostId: string, connectionId: string): void {
    const stmt = this.db.prepare(
      'UPDATE discovered_hosts SET imported = 1, connection_id = ? WHERE id = ?'
    );
    stmt.run(connectionId, hostId);
  }

  deleteDiscoveredHost(id: string): boolean {
    const stmt = this.db.prepare('DELETE FROM discovered_hosts WHERE id = ?');
    const result = stmt.run(id);
    return result.changes > 0;
  }

  clearDiscoveredHosts(providerId: string): void {
    const stmt = this.db.prepare('DELETE FROM discovered_hosts WHERE provider_id = ?');
    stmt.run(providerId);
  }

  // Helper to encrypt sensitive provider config fields
  private encryptProviderConfig(config: ProviderConfig): Record<string, unknown> {
    const result: Record<string, unknown> = { ...config };
    const sensitiveFields = ['password', 'secretAccessKey', 'serviceAccountKey', 'clientSecret'];

    for (const field of sensitiveFields) {
      if (field in result && result[field]) {
        const encrypted = encrypt(String(result[field]), this.masterKey);
        result[field] = { encrypted: true, data: encrypted };
      }
    }

    return result;
  }

  // Helper to decrypt sensitive provider config fields
  private decryptProviderConfig(config: Record<string, unknown>): ProviderConfig {
    const result: Record<string, unknown> = { ...config };

    for (const [key, value] of Object.entries(result)) {
      if (value && typeof value === 'object' && 'encrypted' in value && (value as any).encrypted) {
        try {
          result[key] = decrypt((value as any).data, this.masterKey);
        } catch {
          result[key] = undefined;
        }
      }
    }

    return result as unknown as ProviderConfig;
  }

  // Helper methods
  private rowToConnection(row: ConnectionRow): ServerConnection {
    return {
      id: row.id,
      name: row.name,
      hostname: row.hostname,
      port: row.port,
      connectionType: (row.connection_type as ConnectionType) || 'ssh',
      osType: row.os_type as OSType | undefined,
      username: row.username || undefined,
      credentialId: row.credential_id || undefined,
      tags: JSON.parse(row.tags || '[]'),
      group: row.group_id || undefined,
      description: row.description || undefined,
      providerId: row.provider_id || undefined,
      providerHostId: row.provider_host_id || undefined,
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
      domain: row.domain || undefined,
      secret: sensitiveData.secret,
      privateKey: sensitiveData.privateKey,
      passphrase: sensitiveData.passphrase,
      autoAssignPatterns: row.auto_assign_patterns ? JSON.parse(row.auto_assign_patterns) : undefined,
      autoAssignOSTypes: row.auto_assign_os_types ? JSON.parse(row.auto_assign_os_types) : undefined,
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

  private rowToProvider(row: ProviderRow): Provider {
    const config = this.decryptProviderConfig(JSON.parse(row.config));
    return {
      id: row.id,
      name: row.name,
      type: row.type as Provider['type'],
      enabled: row.enabled === 1,
      config,
      autoDiscover: row.auto_discover === 1,
      discoverInterval: row.discover_interval || undefined,
      lastDiscoveryAt: row.last_discovery_at ? new Date(row.last_discovery_at) : undefined,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }

  private rowToDiscoveredHost(row: DiscoveredHostRow): DiscoveredHost {
    return {
      id: row.id,
      providerId: row.provider_id,
      providerHostId: row.provider_host_id,
      name: row.name,
      hostname: row.hostname || undefined,
      privateIp: row.private_ip || undefined,
      publicIp: row.public_ip || undefined,
      osType: row.os_type as OSType,
      osName: row.os_name || undefined,
      state: row.state as DiscoveredHost['state'],
      metadata: JSON.parse(row.metadata || '{}'),
      tags: JSON.parse(row.tags || '{}'),
      discoveredAt: new Date(row.discovered_at),
      lastSeenAt: new Date(row.last_seen_at),
      imported: row.imported === 1,
      connectionId: row.connection_id || undefined,
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
  connection_type: string | null;
  os_type: string | null;
  username: string | null;
  credential_id: string | null;
  tags: string;
  group_id: string | null;
  description: string | null;
  provider_id: string | null;
  provider_host_id: string | null;
  created_at: string;
  updated_at: string;
  last_connected_at: string | null;
}

interface CredentialRow {
  id: string;
  name: string;
  type: string;
  username: string;
  domain: string | null;
  encrypted_data: string | null;
  auto_assign_patterns: string | null;
  auto_assign_os_types: string | null;
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

interface ProviderRow {
  id: string;
  name: string;
  type: string;
  enabled: number;
  config: string;
  auto_discover: number;
  discover_interval: number | null;
  last_discovery_at: string | null;
  created_at: string;
  updated_at: string;
}

interface DiscoveredHostRow {
  id: string;
  provider_id: string;
  provider_host_id: string;
  name: string;
  hostname: string | null;
  private_ip: string | null;
  public_ip: string | null;
  os_type: string;
  os_name: string | null;
  state: string;
  metadata: string;
  tags: string;
  discovered_at: string;
  last_seen_at: string;
  imported: number;
  connection_id: string | null;
}
