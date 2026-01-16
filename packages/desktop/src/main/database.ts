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
  SavedCommand,
  CommandExecution,
  CommandType,
  CommandTargetOS,
  CommandVariable,
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
    // Create tables first
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
        serial_settings TEXT,
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

      CREATE TABLE IF NOT EXISTS saved_commands (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        type TEXT NOT NULL DEFAULT 'inline',
        target_os TEXT NOT NULL DEFAULT 'all',
        command TEXT,
        script_content TEXT,
        script_language TEXT,
        category TEXT,
        tags TEXT DEFAULT '[]',
        variables TEXT DEFAULT '[]',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS command_history (
        id TEXT PRIMARY KEY,
        command_id TEXT,
        command_name TEXT NOT NULL,
        command TEXT NOT NULL,
        target_os TEXT NOT NULL,
        connection_ids TEXT NOT NULL DEFAULT '[]',
        results TEXT NOT NULL DEFAULT '[]',
        started_at TEXT NOT NULL,
        completed_at TEXT,
        status TEXT NOT NULL DEFAULT 'pending'
      );

      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);

    // Run migrations for existing databases BEFORE creating indexes
    this.runMigrations();

    // Create indexes after migrations have added any missing columns
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_connections_group ON connections(group_id);
      CREATE INDEX IF NOT EXISTS idx_connections_credential ON connections(credential_id);
      CREATE INDEX IF NOT EXISTS idx_connections_provider ON connections(provider_id);
      CREATE INDEX IF NOT EXISTS idx_groups_parent ON connection_groups(parent_id);
      CREATE INDEX IF NOT EXISTS idx_discovered_provider ON discovered_hosts(provider_id);
      CREATE INDEX IF NOT EXISTS idx_connections_name ON connections(name);
      CREATE INDEX IF NOT EXISTS idx_discovered_imported ON discovered_hosts(imported, provider_id);
    `);
  }

  private runMigrations(): void {
    // Add new columns to existing tables if they don't exist
    const migrations = [
      { table: 'connections', column: 'connection_type', sql: "ALTER TABLE connections ADD COLUMN connection_type TEXT DEFAULT 'ssh'" },
      { table: 'connections', column: 'os_type', sql: 'ALTER TABLE connections ADD COLUMN os_type TEXT' },
      { table: 'connections', column: 'provider_id', sql: 'ALTER TABLE connections ADD COLUMN provider_id TEXT' },
      { table: 'connections', column: 'provider_host_id', sql: 'ALTER TABLE connections ADD COLUMN provider_host_id TEXT' },
      { table: 'connections', column: 'serial_settings', sql: 'ALTER TABLE connections ADD COLUMN serial_settings TEXT' },
      { table: 'credentials', column: 'domain', sql: 'ALTER TABLE credentials ADD COLUMN domain TEXT' },
      { table: 'credentials', column: 'auto_assign_patterns', sql: "ALTER TABLE credentials ADD COLUMN auto_assign_patterns TEXT DEFAULT '[]'" },
      { table: 'credentials', column: 'auto_assign_os_types', sql: "ALTER TABLE credentials ADD COLUMN auto_assign_os_types TEXT DEFAULT '[]'" },
      { table: 'credentials', column: 'auto_assign_group', sql: 'ALTER TABLE credentials ADD COLUMN auto_assign_group TEXT' },
    ];

    // Cache table schemas to avoid multiple PRAGMA calls (optimization)
    const schemaCache = new Map<string, Set<string>>();
    const tables = [...new Set(migrations.map(m => m.table))];

    for (const table of tables) {
      try {
        const columns = this.db.pragma(`table_info(${table})`) as Array<{ name: string }>;
        schemaCache.set(table, new Set(columns.map(c => c.name)));
      } catch {
        schemaCache.set(table, new Set());
      }
    }

    // Run migrations using cached schema
    for (const migration of migrations) {
      const tableColumns = schemaCache.get(migration.table);
      if (tableColumns && !tableColumns.has(migration.column)) {
        try {
          this.db.exec(migration.sql);
          tableColumns.add(migration.column);
        } catch {
          // Column might already exist
        }
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
    const defaultPort = connectionType === 'rdp' ? 3389 : connectionType === 'serial' ? 0 : 22;

    const stmt = this.db.prepare(`
      INSERT INTO connections (id, name, hostname, port, connection_type, os_type, username, credential_id, tags, group_id, description, serial_settings, provider_id, provider_host_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      data.serialSettings ? JSON.stringify(data.serialSettings) : null,
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
    if (updates.serialSettings !== undefined) {
      fields.push('serial_settings = ?');
      values.push(updates.serialSettings ? JSON.stringify(updates.serialSettings) : null);
    }

    values.push(id);
    const stmt = this.db.prepare(`UPDATE connections SET ${fields.join(', ')} WHERE id = ?`);
    stmt.run(...values);

    return this.getConnection(id);
  }

  deleteConnection(id: string): boolean {
    // Reset the discovered_hosts imported flag if this connection was imported from a provider
    this.db.prepare(
      'UPDATE discovered_hosts SET imported = 0, connection_id = NULL WHERE connection_id = ?'
    ).run(id);

    const stmt = this.db.prepare('DELETE FROM connections WHERE id = ?');
    const result = stmt.run(id);
    return result.changes > 0;
  }

  getConnectionsByProvider(providerId: string): ServerConnection[] {
    const stmt = this.db.prepare('SELECT * FROM connections WHERE provider_id = ? ORDER BY name');
    const rows = stmt.all(providerId) as ConnectionRow[];
    return rows.map((row) => this.rowToConnection(row));
  }

  deleteConnectionsByProvider(providerId: string): number {
    // Reset all discovered_hosts imported flags for this provider
    this.db.prepare(
      'UPDATE discovered_hosts SET imported = 0, connection_id = NULL WHERE provider_id = ?'
    ).run(providerId);

    const stmt = this.db.prepare('DELETE FROM connections WHERE provider_id = ?');
    const result = stmt.run(providerId);
    return result.changes;
  }

  // Credential methods
  getCredentials(): Credential[] {
    const stmt = this.db.prepare('SELECT * FROM credentials ORDER BY name');
    const rows = stmt.all() as CredentialRow[];

    // Batch load all credential->connection mappings in ONE query (fixes N+1 problem)
    const usedByMap = new Map<string, string[]>();
    const usedByRows = this.db.prepare(
      'SELECT credential_id, id FROM connections WHERE credential_id IS NOT NULL'
    ).all() as Array<{ credential_id: string; id: string }>;

    for (const row of usedByRows) {
      if (!usedByMap.has(row.credential_id)) {
        usedByMap.set(row.credential_id, []);
      }
      usedByMap.get(row.credential_id)!.push(row.id);
    }

    return rows.map((row) => this.rowToCredential(row, usedByMap.get(row.id)));
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
      INSERT INTO credentials (id, name, type, username, domain, encrypted_data, auto_assign_patterns, auto_assign_group, created_at, updated_at)
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
      data.autoAssignGroup || null,
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
    if (updates.autoAssignGroup !== undefined) {
      fields.push('auto_assign_group = ?');
      values.push(updates.autoAssignGroup || null);
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

  // Clear only non-imported discovered hosts (for re-discovery)
  clearNonImportedDiscoveredHosts(providerId: string): void {
    const stmt = this.db.prepare('DELETE FROM discovered_hosts WHERE provider_id = ? AND imported = 0');
    stmt.run(providerId);
  }

  // Saved command methods
  getSavedCommands(category?: string): SavedCommand[] {
    const sql = category
      ? 'SELECT * FROM saved_commands WHERE category = ? ORDER BY name'
      : 'SELECT * FROM saved_commands ORDER BY name';
    const stmt = this.db.prepare(sql);
    const rows = (category ? stmt.all(category) : stmt.all()) as SavedCommandRow[];
    return rows.map((row) => this.rowToSavedCommand(row));
  }

  getSavedCommand(id: string): SavedCommand | null {
    const stmt = this.db.prepare('SELECT * FROM saved_commands WHERE id = ?');
    const row = stmt.get(id) as SavedCommandRow | undefined;
    return row ? this.rowToSavedCommand(row) : null;
  }

  createSavedCommand(data: Omit<SavedCommand, 'id' | 'createdAt' | 'updatedAt'>): SavedCommand {
    const id = generateId();
    const now = new Date().toISOString();

    const stmt = this.db.prepare(`
      INSERT INTO saved_commands (
        id, name, description, type, target_os, command,
        script_content, script_language, category, tags, variables,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      id,
      data.name,
      data.description || null,
      data.type,
      data.targetOS,
      data.command || null,
      data.scriptContent || null,
      data.scriptLanguage || null,
      data.category || null,
      JSON.stringify(data.tags || []),
      JSON.stringify(data.variables || []),
      now,
      now
    );

    return this.getSavedCommand(id)!;
  }

  updateSavedCommand(id: string, updates: Partial<SavedCommand>): SavedCommand | null {
    const existing = this.getSavedCommand(id);
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
    if (updates.type !== undefined) {
      fields.push('type = ?');
      values.push(updates.type);
    }
    if (updates.targetOS !== undefined) {
      fields.push('target_os = ?');
      values.push(updates.targetOS);
    }
    if (updates.command !== undefined) {
      fields.push('command = ?');
      values.push(updates.command);
    }
    if (updates.scriptContent !== undefined) {
      fields.push('script_content = ?');
      values.push(updates.scriptContent);
    }
    if (updates.scriptLanguage !== undefined) {
      fields.push('script_language = ?');
      values.push(updates.scriptLanguage);
    }
    if (updates.category !== undefined) {
      fields.push('category = ?');
      values.push(updates.category);
    }
    if (updates.tags !== undefined) {
      fields.push('tags = ?');
      values.push(JSON.stringify(updates.tags));
    }
    if (updates.variables !== undefined) {
      fields.push('variables = ?');
      values.push(JSON.stringify(updates.variables));
    }

    values.push(id);
    const stmt = this.db.prepare(`UPDATE saved_commands SET ${fields.join(', ')} WHERE id = ?`);
    stmt.run(...values);

    return this.getSavedCommand(id);
  }

  deleteSavedCommand(id: string): boolean {
    const stmt = this.db.prepare('DELETE FROM saved_commands WHERE id = ?');
    const result = stmt.run(id);
    return result.changes > 0;
  }

  // Command execution history methods
  getCommandHistory(limit = 50): CommandExecution[] {
    const stmt = this.db.prepare(
      'SELECT * FROM command_history ORDER BY started_at DESC LIMIT ?'
    );
    const rows = stmt.all(limit) as CommandHistoryRow[];
    return rows.map((row) => this.rowToCommandExecution(row));
  }

  getCommandExecution(id: string): CommandExecution | null {
    const stmt = this.db.prepare('SELECT * FROM command_history WHERE id = ?');
    const row = stmt.get(id) as CommandHistoryRow | undefined;
    return row ? this.rowToCommandExecution(row) : null;
  }

  createCommandExecution(data: Omit<CommandExecution, 'id'>): CommandExecution {
    const id = generateId();

    const stmt = this.db.prepare(`
      INSERT INTO command_history (
        id, command_id, command_name, command, target_os,
        connection_ids, results, started_at, completed_at, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      id,
      data.commandId || null,
      data.commandName,
      data.command,
      data.targetOS,
      JSON.stringify(data.connectionIds),
      JSON.stringify(data.results),
      data.startedAt instanceof Date ? data.startedAt.toISOString() : data.startedAt,
      data.completedAt ? (data.completedAt instanceof Date ? data.completedAt.toISOString() : data.completedAt) : null,
      data.status
    );

    return this.getCommandExecution(id)!;
  }

  updateCommandExecution(id: string, updates: Partial<CommandExecution>): CommandExecution | null {
    const existing = this.getCommandExecution(id);
    if (!existing) return null;

    const fields: string[] = [];
    const values: unknown[] = [];

    if (updates.results !== undefined) {
      fields.push('results = ?');
      values.push(JSON.stringify(updates.results));
    }
    if (updates.completedAt !== undefined) {
      fields.push('completed_at = ?');
      values.push(updates.completedAt instanceof Date ? updates.completedAt.toISOString() : updates.completedAt);
    }
    if (updates.status !== undefined) {
      fields.push('status = ?');
      values.push(updates.status);
    }

    if (fields.length === 0) return existing;

    values.push(id);
    const stmt = this.db.prepare(`UPDATE command_history SET ${fields.join(', ')} WHERE id = ?`);
    stmt.run(...values);

    return this.getCommandExecution(id);
  }

  deleteCommandExecution(id: string): boolean {
    const stmt = this.db.prepare('DELETE FROM command_history WHERE id = ?');
    const result = stmt.run(id);
    return result.changes > 0;
  }

  clearCommandHistory(): void {
    this.db.prepare('DELETE FROM command_history').run();
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
      serialSettings: row.serial_settings ? JSON.parse(row.serial_settings) : undefined,
      providerId: row.provider_id || undefined,
      providerHostId: row.provider_host_id || undefined,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
      lastConnectedAt: row.last_connected_at ? new Date(row.last_connected_at) : undefined,
    };
  }

  private rowToCredential(row: CredentialRow, preloadedUsedBy?: string[]): Credential {
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

    // Use pre-loaded usedBy if available, otherwise query (for single credential lookups)
    const usedBy = preloadedUsedBy ?? (this.db
      .prepare('SELECT id FROM connections WHERE credential_id = ?')
      .all(row.id) as Array<{ id: string }>)
      .map((r) => r.id);

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
      autoAssignGroup: row.auto_assign_group || undefined,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
      usedBy,
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

  private rowToSavedCommand(row: SavedCommandRow): SavedCommand {
    return {
      id: row.id,
      name: row.name,
      description: row.description || undefined,
      type: row.type as CommandType,
      targetOS: row.target_os as CommandTargetOS,
      command: row.command || undefined,
      scriptContent: row.script_content || undefined,
      scriptLanguage: row.script_language as SavedCommand['scriptLanguage'],
      category: row.category || undefined,
      tags: JSON.parse(row.tags || '[]'),
      variables: JSON.parse(row.variables || '[]') as CommandVariable[],
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }

  private rowToCommandExecution(row: CommandHistoryRow): CommandExecution {
    return {
      id: row.id,
      commandId: row.command_id || undefined,
      commandName: row.command_name,
      command: row.command,
      targetOS: row.target_os as CommandTargetOS,
      connectionIds: JSON.parse(row.connection_ids || '[]'),
      results: JSON.parse(row.results || '[]'),
      startedAt: new Date(row.started_at),
      completedAt: row.completed_at ? new Date(row.completed_at) : undefined,
      status: row.status as CommandExecution['status'],
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

  // Settings management
  getSettings(): Record<string, unknown> {
    try {
      const row = this.db.prepare('SELECT value FROM settings WHERE key = ?').get('app_settings') as { value: string } | undefined;
      if (row) {
        return JSON.parse(row.value);
      }
    } catch {
      // Table may not exist yet
    }
    return {};
  }

  setSettings(settings: Record<string, unknown>): void {
    const value = JSON.stringify(settings);
    this.db.prepare(
      'INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, ?)'
    ).run('app_settings', value, new Date().toISOString());
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
  serial_settings: string | null;
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
  auto_assign_group: string | null;
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

interface SavedCommandRow {
  id: string;
  name: string;
  description: string | null;
  type: string;
  target_os: string;
  command: string | null;
  script_content: string | null;
  script_language: string | null;
  category: string | null;
  tags: string;
  variables: string;
  created_at: string;
  updated_at: string;
}

interface CommandHistoryRow {
  id: string;
  command_id: string | null;
  command_name: string;
  command: string;
  target_os: string;
  connection_ids: string;
  results: string;
  started_at: string;
  completed_at: string | null;
  status: string;
}
