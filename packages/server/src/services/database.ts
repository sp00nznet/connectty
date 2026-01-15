/**
 * PostgreSQL Database Service
 */

import { Pool, PoolConfig } from 'pg';
import { generateId, encrypt, decrypt, type EncryptedData } from '@connectty/shared';
import type { ServerConnection, Credential, ConnectionGroup, User } from '@connectty/shared';
import * as crypto from 'crypto';

// Provider types for cloud discovery
export interface Provider {
  id: string;
  userId: string;
  name: string;
  type: string;
  config: Record<string, unknown>;
  autoDiscover: boolean;
  discoverInterval: number;
  lastDiscoveryAt?: Date;
  isShared?: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface DiscoveredHost {
  id: string;
  userId: string;
  providerId: string;
  providerHostId: string;
  name: string;
  hostname?: string;
  privateIp?: string;
  publicIp?: string;
  osType?: string;
  osName?: string;
  state?: string;
  metadata?: Record<string, unknown>;
  tags: string[];
  discoveredAt: Date;
  lastSeenAt: Date;
  imported: boolean;
  connectionId?: string;
}

export interface SavedCommand {
  id: string;
  userId: string;
  name: string;
  description?: string;
  command: string;
  targetOs: string;
  category?: string;
  tags: string[];
  isShared?: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface CommandExecution {
  id: string;
  userId: string;
  commandId?: string;
  commandName: string;
  command: string;
  targetOs?: string;
  connectionIds: string[];
  status: string;
  startedAt: Date;
  completedAt?: Date;
}

export interface CommandResult {
  id: string;
  executionId: string;
  connectionId: string;
  connectionName: string;
  hostname: string;
  status: string;
  exitCode?: number;
  stdout?: string;
  stderr?: string;
  error?: string;
  startedAt?: Date;
  completedAt?: Date;
}

export interface SessionLog {
  id: string;
  userId: string;
  connectionId?: string;
  sessionId: string;
  sessionType: 'ssh' | 'pty' | 'rdp';
  connectionName?: string;
  hostname?: string;
  data: string;
  dataType: 'input' | 'output';
  timestamp: Date;
}

export class DatabaseService {
  public pool: Pool;
  private masterKey: string;

  constructor(config: PoolConfig) {
    this.pool = new Pool(config);
    this.masterKey = process.env.MASTER_KEY || crypto.randomBytes(32).toString('base64');
  }

  async initialize(): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS users (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          username VARCHAR(255) UNIQUE NOT NULL,
          password_hash VARCHAR(255),
          display_name VARCHAR(255) NOT NULL,
          email VARCHAR(255),
          ad_domain VARCHAR(255),
          ad_sid VARCHAR(255),
          roles TEXT[] DEFAULT ARRAY['user'],
          is_admin BOOLEAN DEFAULT false,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          last_login_at TIMESTAMP
        );

        -- Add is_admin column if it doesn't exist (migration for existing databases)
        DO $$ BEGIN
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'is_admin') THEN
            ALTER TABLE users ADD COLUMN is_admin BOOLEAN DEFAULT false;
          END IF;
        END $$;

        CREATE TABLE IF NOT EXISTS connection_groups (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          name VARCHAR(255) NOT NULL,
          description TEXT,
          parent_id UUID REFERENCES connection_groups(id) ON DELETE SET NULL,
          color VARCHAR(20),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS credentials (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          name VARCHAR(255) NOT NULL,
          type VARCHAR(50) NOT NULL,
          username VARCHAR(255) NOT NULL,
          encrypted_data TEXT,
          is_shared BOOLEAN DEFAULT false,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        -- Add is_shared column to credentials if it doesn't exist
        DO $$ BEGIN
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'credentials' AND column_name = 'is_shared') THEN
            ALTER TABLE credentials ADD COLUMN is_shared BOOLEAN DEFAULT false;
          END IF;
        END $$;

        CREATE TABLE IF NOT EXISTS connections (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          name VARCHAR(255) NOT NULL,
          hostname VARCHAR(255) NOT NULL,
          port INTEGER DEFAULT 22,
          connection_type VARCHAR(20) DEFAULT 'ssh',
          username VARCHAR(255),
          credential_id UUID REFERENCES credentials(id) ON DELETE SET NULL,
          tags TEXT[] DEFAULT ARRAY[]::TEXT[],
          group_id UUID REFERENCES connection_groups(id) ON DELETE SET NULL,
          description TEXT,
          is_shared BOOLEAN DEFAULT false,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          last_connected_at TIMESTAMP
        );

        -- Add connection_type column if it doesn't exist (migration for existing databases)
        DO $$ BEGIN
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'connections' AND column_name = 'connection_type') THEN
            ALTER TABLE connections ADD COLUMN connection_type VARCHAR(20) DEFAULT 'ssh';
          END IF;
        END $$;

        -- Add is_shared column to connections if it doesn't exist
        DO $$ BEGIN
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'connections' AND column_name = 'is_shared') THEN
            ALTER TABLE connections ADD COLUMN is_shared BOOLEAN DEFAULT false;
          END IF;
        END $$;

        CREATE INDEX IF NOT EXISTS idx_connections_user ON connections(user_id);
        CREATE INDEX IF NOT EXISTS idx_credentials_user ON credentials(user_id);
        CREATE INDEX IF NOT EXISTS idx_groups_user ON connection_groups(user_id);

        -- Provider tables for cloud discovery
        CREATE TABLE IF NOT EXISTS providers (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          name VARCHAR(255) NOT NULL,
          type VARCHAR(50) NOT NULL,
          config TEXT NOT NULL,
          auto_discover BOOLEAN DEFAULT false,
          discover_interval INTEGER DEFAULT 3600,
          last_discovery_at TIMESTAMP,
          is_shared BOOLEAN DEFAULT false,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        -- Add is_shared column to providers if it doesn't exist
        DO $$ BEGIN
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'providers' AND column_name = 'is_shared') THEN
            ALTER TABLE providers ADD COLUMN is_shared BOOLEAN DEFAULT false;
          END IF;
        END $$;

        CREATE TABLE IF NOT EXISTS discovered_hosts (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          provider_id UUID NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
          provider_host_id VARCHAR(255) NOT NULL,
          name VARCHAR(255) NOT NULL,
          hostname VARCHAR(255),
          private_ip VARCHAR(255),
          public_ip VARCHAR(255),
          os_type VARCHAR(50),
          os_name VARCHAR(255),
          state VARCHAR(50),
          metadata TEXT,
          tags TEXT[] DEFAULT ARRAY[]::TEXT[],
          discovered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          last_seen_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          imported BOOLEAN DEFAULT false,
          connection_id UUID REFERENCES connections(id) ON DELETE SET NULL,
          UNIQUE(provider_id, provider_host_id)
        );

        -- Saved commands for bulk execution
        CREATE TABLE IF NOT EXISTS saved_commands (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          name VARCHAR(255) NOT NULL,
          description TEXT,
          command TEXT NOT NULL,
          target_os VARCHAR(50) DEFAULT 'all',
          category VARCHAR(100),
          tags TEXT[] DEFAULT ARRAY[]::TEXT[],
          is_shared BOOLEAN DEFAULT false,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        -- Add is_shared column to saved_commands if it doesn't exist
        DO $$ BEGIN
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'saved_commands' AND column_name = 'is_shared') THEN
            ALTER TABLE saved_commands ADD COLUMN is_shared BOOLEAN DEFAULT false;
          END IF;
        END $$;

        CREATE TABLE IF NOT EXISTS command_executions (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          command_id UUID REFERENCES saved_commands(id) ON DELETE SET NULL,
          command_name VARCHAR(255) NOT NULL,
          command TEXT NOT NULL,
          target_os VARCHAR(50),
          connection_ids TEXT[] NOT NULL,
          status VARCHAR(50) DEFAULT 'pending',
          started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          completed_at TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS command_results (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          execution_id UUID NOT NULL REFERENCES command_executions(id) ON DELETE CASCADE,
          connection_id UUID NOT NULL,
          connection_name VARCHAR(255) NOT NULL,
          hostname VARCHAR(255) NOT NULL,
          status VARCHAR(50) DEFAULT 'pending',
          exit_code INTEGER,
          stdout TEXT,
          stderr TEXT,
          error TEXT,
          started_at TIMESTAMP,
          completed_at TIMESTAMP
        );

        -- Session logs for SSH/terminal input/output auditing
        CREATE TABLE IF NOT EXISTS session_logs (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          connection_id UUID REFERENCES connections(id) ON DELETE SET NULL,
          session_id VARCHAR(255) NOT NULL,
          session_type VARCHAR(20) NOT NULL,
          connection_name VARCHAR(255),
          hostname VARCHAR(255),
          data TEXT NOT NULL,
          data_type VARCHAR(20) NOT NULL,
          timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE INDEX IF NOT EXISTS idx_session_logs_user ON session_logs(user_id);
        CREATE INDEX IF NOT EXISTS idx_session_logs_session ON session_logs(session_id);
        CREATE INDEX IF NOT EXISTS idx_session_logs_connection ON session_logs(connection_id);
        CREATE INDEX IF NOT EXISTS idx_session_logs_timestamp ON session_logs(timestamp);

        CREATE INDEX IF NOT EXISTS idx_providers_user ON providers(user_id);
        CREATE INDEX IF NOT EXISTS idx_discovered_hosts_user ON discovered_hosts(user_id);
        CREATE INDEX IF NOT EXISTS idx_discovered_hosts_provider ON discovered_hosts(provider_id);
        CREATE INDEX IF NOT EXISTS idx_saved_commands_user ON saved_commands(user_id);
        CREATE INDEX IF NOT EXISTS idx_command_executions_user ON command_executions(user_id);
      `);
    } finally {
      client.release();
    }
  }

  // User methods
  async createUser(data: {
    username: string;
    passwordHash?: string;
    displayName: string;
    email?: string;
    adDomain?: string;
    adSid?: string;
    roles?: string[];
    isAdmin?: boolean;
  }): Promise<User> {
    const result = await this.pool.query(
      `INSERT INTO users (username, password_hash, display_name, email, ad_domain, ad_sid, roles, is_admin)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [data.username, data.passwordHash, data.displayName, data.email, data.adDomain, data.adSid, data.roles || ['user'], data.isAdmin || false]
    );
    return this.rowToUser(result.rows[0]);
  }

  async getUserByUsername(username: string): Promise<User | null> {
    const result = await this.pool.query('SELECT * FROM users WHERE username = $1', [username]);
    return result.rows[0] ? this.rowToUser(result.rows[0]) : null;
  }

  async getUserById(id: string): Promise<User | null> {
    const result = await this.pool.query('SELECT * FROM users WHERE id = $1', [id]);
    return result.rows[0] ? this.rowToUser(result.rows[0]) : null;
  }

  async getPasswordHash(username: string): Promise<string | null> {
    const result = await this.pool.query('SELECT password_hash FROM users WHERE username = $1', [username]);
    return result.rows[0]?.password_hash || null;
  }

  async updateLastLogin(userId: string): Promise<void> {
    await this.pool.query('UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE id = $1', [userId]);
  }

  // Connection methods
  async getConnections(userId: string): Promise<ServerConnection[]> {
    const result = await this.pool.query(
      'SELECT * FROM connections WHERE user_id = $1 ORDER BY name',
      [userId]
    );
    return result.rows.map(this.rowToConnection);
  }

  async getConnection(userId: string, id: string): Promise<ServerConnection | null> {
    const result = await this.pool.query(
      'SELECT * FROM connections WHERE id = $1 AND user_id = $2',
      [id, userId]
    );
    return result.rows[0] ? this.rowToConnection(result.rows[0]) : null;
  }

  async createConnection(userId: string, data: Omit<ServerConnection, 'id' | 'createdAt' | 'updatedAt'>): Promise<ServerConnection> {
    const result = await this.pool.query(
      `INSERT INTO connections (user_id, name, hostname, port, connection_type, username, credential_id, tags, group_id, description)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [userId, data.name, data.hostname, data.port || 22, data.connectionType || 'ssh', data.username, data.credentialId, data.tags || [], data.group, data.description]
    );
    return this.rowToConnection(result.rows[0]);
  }

  async updateConnection(userId: string, id: string, updates: Partial<ServerConnection>): Promise<ServerConnection | null> {
    const fields: string[] = ['updated_at = CURRENT_TIMESTAMP'];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (updates.name !== undefined) {
      fields.push(`name = $${paramIndex++}`);
      values.push(updates.name);
    }
    if (updates.hostname !== undefined) {
      fields.push(`hostname = $${paramIndex++}`);
      values.push(updates.hostname);
    }
    if (updates.port !== undefined) {
      fields.push(`port = $${paramIndex++}`);
      values.push(updates.port);
    }
    if (updates.connectionType !== undefined) {
      fields.push(`connection_type = $${paramIndex++}`);
      values.push(updates.connectionType);
    }
    if (updates.username !== undefined) {
      fields.push(`username = $${paramIndex++}`);
      values.push(updates.username);
    }
    if (updates.credentialId !== undefined) {
      fields.push(`credential_id = $${paramIndex++}`);
      values.push(updates.credentialId);
    }
    if (updates.tags !== undefined) {
      fields.push(`tags = $${paramIndex++}`);
      values.push(updates.tags);
    }
    if (updates.group !== undefined) {
      fields.push(`group_id = $${paramIndex++}`);
      values.push(updates.group);
    }
    if (updates.description !== undefined) {
      fields.push(`description = $${paramIndex++}`);
      values.push(updates.description);
    }
    if (updates.lastConnectedAt !== undefined) {
      fields.push(`last_connected_at = $${paramIndex++}`);
      values.push(updates.lastConnectedAt);
    }

    values.push(id, userId);

    const result = await this.pool.query(
      `UPDATE connections SET ${fields.join(', ')} WHERE id = $${paramIndex++} AND user_id = $${paramIndex} RETURNING *`,
      values
    );
    return result.rows[0] ? this.rowToConnection(result.rows[0]) : null;
  }

  async deleteConnection(userId: string, id: string): Promise<boolean> {
    const result = await this.pool.query(
      'DELETE FROM connections WHERE id = $1 AND user_id = $2',
      [id, userId]
    );
    return (result.rowCount ?? 0) > 0;
  }

  // Credential methods
  async getCredentials(userId: string): Promise<Credential[]> {
    const result = await this.pool.query(
      'SELECT * FROM credentials WHERE user_id = $1 ORDER BY name',
      [userId]
    );
    return Promise.all(result.rows.map((row) => this.rowToCredential(row, userId)));
  }

  async getCredential(userId: string, id: string): Promise<Credential | null> {
    const result = await this.pool.query(
      'SELECT * FROM credentials WHERE id = $1 AND user_id = $2',
      [id, userId]
    );
    return result.rows[0] ? this.rowToCredential(result.rows[0], userId) : null;
  }

  async createCredential(userId: string, data: Omit<Credential, 'id' | 'createdAt' | 'updatedAt' | 'usedBy'>): Promise<Credential> {
    const sensitiveData: Record<string, string> = {};
    if (data.secret) sensitiveData.secret = data.secret;
    if (data.privateKey) sensitiveData.privateKey = data.privateKey;
    if (data.passphrase) sensitiveData.passphrase = data.passphrase;

    const encryptedData = Object.keys(sensitiveData).length > 0
      ? encrypt(JSON.stringify(sensitiveData), this.masterKey)
      : null;

    const result = await this.pool.query(
      `INSERT INTO credentials (user_id, name, type, username, encrypted_data)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [userId, data.name, data.type, data.username, encryptedData ? JSON.stringify(encryptedData) : null]
    );
    return this.rowToCredential(result.rows[0], userId);
  }

  async updateCredential(userId: string, id: string, updates: Partial<Credential>): Promise<Credential | null> {
    const existing = await this.getCredential(userId, id);
    if (!existing) return null;

    const fields: string[] = ['updated_at = CURRENT_TIMESTAMP'];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (updates.name !== undefined) {
      fields.push(`name = $${paramIndex++}`);
      values.push(updates.name);
    }
    if (updates.type !== undefined) {
      fields.push(`type = $${paramIndex++}`);
      values.push(updates.type);
    }
    if (updates.username !== undefined) {
      fields.push(`username = $${paramIndex++}`);
      values.push(updates.username);
    }

    if (updates.secret !== undefined || updates.privateKey !== undefined || updates.passphrase !== undefined) {
      const sensitiveData: Record<string, string> = {};
      sensitiveData.secret = updates.secret ?? existing.secret ?? '';
      sensitiveData.privateKey = updates.privateKey ?? existing.privateKey ?? '';
      sensitiveData.passphrase = updates.passphrase ?? existing.passphrase ?? '';

      const encryptedData = encrypt(JSON.stringify(sensitiveData), this.masterKey);
      fields.push(`encrypted_data = $${paramIndex++}`);
      values.push(JSON.stringify(encryptedData));
    }

    values.push(id, userId);

    const result = await this.pool.query(
      `UPDATE credentials SET ${fields.join(', ')} WHERE id = $${paramIndex++} AND user_id = $${paramIndex} RETURNING *`,
      values
    );
    return result.rows[0] ? this.rowToCredential(result.rows[0], userId) : null;
  }

  async deleteCredential(userId: string, id: string): Promise<boolean> {
    const result = await this.pool.query(
      'DELETE FROM credentials WHERE id = $1 AND user_id = $2',
      [id, userId]
    );
    return (result.rowCount ?? 0) > 0;
  }

  // Group methods
  async getGroups(userId: string): Promise<ConnectionGroup[]> {
    const result = await this.pool.query(
      'SELECT * FROM connection_groups WHERE user_id = $1 ORDER BY name',
      [userId]
    );
    return result.rows.map(this.rowToGroup);
  }

  async createGroup(userId: string, data: Omit<ConnectionGroup, 'id' | 'createdAt' | 'updatedAt'>): Promise<ConnectionGroup> {
    const result = await this.pool.query(
      `INSERT INTO connection_groups (user_id, name, description, parent_id, color)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [userId, data.name, data.description, data.parentId, data.color]
    );
    return this.rowToGroup(result.rows[0]);
  }

  async updateGroup(userId: string, id: string, updates: Partial<ConnectionGroup>): Promise<ConnectionGroup | null> {
    const fields: string[] = ['updated_at = CURRENT_TIMESTAMP'];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (updates.name !== undefined) {
      fields.push(`name = $${paramIndex++}`);
      values.push(updates.name);
    }
    if (updates.description !== undefined) {
      fields.push(`description = $${paramIndex++}`);
      values.push(updates.description);
    }
    if (updates.parentId !== undefined) {
      fields.push(`parent_id = $${paramIndex++}`);
      values.push(updates.parentId);
    }
    if (updates.color !== undefined) {
      fields.push(`color = $${paramIndex++}`);
      values.push(updates.color);
    }

    values.push(id, userId);

    const result = await this.pool.query(
      `UPDATE connection_groups SET ${fields.join(', ')} WHERE id = $${paramIndex++} AND user_id = $${paramIndex} RETURNING *`,
      values
    );
    return result.rows[0] ? this.rowToGroup(result.rows[0]) : null;
  }

  async deleteGroup(userId: string, id: string): Promise<boolean> {
    const result = await this.pool.query(
      'DELETE FROM connection_groups WHERE id = $1 AND user_id = $2',
      [id, userId]
    );
    return (result.rowCount ?? 0) > 0;
  }

  // Provider methods
  async getProviders(userId: string): Promise<Provider[]> {
    const result = await this.pool.query(
      'SELECT * FROM providers WHERE user_id = $1 ORDER BY name',
      [userId]
    );
    return result.rows.map(this.rowToProvider.bind(this));
  }

  async getProvider(userId: string, id: string): Promise<Provider | null> {
    const result = await this.pool.query(
      'SELECT * FROM providers WHERE id = $1 AND user_id = $2',
      [id, userId]
    );
    return result.rows[0] ? this.rowToProvider(result.rows[0]) : null;
  }

  async createProvider(userId: string, data: {
    name: string;
    type: string;
    config: Record<string, unknown>;
    autoDiscover?: boolean;
    discoverInterval?: number;
  }): Promise<Provider> {
    // Encrypt sensitive config data
    const encryptedConfig = encrypt(JSON.stringify(data.config), this.masterKey);
    const result = await this.pool.query(
      `INSERT INTO providers (user_id, name, type, config, auto_discover, discover_interval)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [userId, data.name, data.type, JSON.stringify(encryptedConfig), data.autoDiscover ?? false, data.discoverInterval ?? 3600]
    );
    return this.rowToProvider(result.rows[0]);
  }

  async updateProvider(userId: string, id: string, updates: Partial<{
    name: string;
    type: string;
    config: Record<string, unknown>;
    autoDiscover: boolean;
    discoverInterval: number;
    lastDiscoveryAt: Date;
  }>): Promise<Provider | null> {
    const fields: string[] = ['updated_at = CURRENT_TIMESTAMP'];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (updates.name !== undefined) {
      fields.push(`name = $${paramIndex++}`);
      values.push(updates.name);
    }
    if (updates.type !== undefined) {
      fields.push(`type = $${paramIndex++}`);
      values.push(updates.type);
    }
    if (updates.config !== undefined) {
      const encryptedConfig = encrypt(JSON.stringify(updates.config), this.masterKey);
      fields.push(`config = $${paramIndex++}`);
      values.push(JSON.stringify(encryptedConfig));
    }
    if (updates.autoDiscover !== undefined) {
      fields.push(`auto_discover = $${paramIndex++}`);
      values.push(updates.autoDiscover);
    }
    if (updates.discoverInterval !== undefined) {
      fields.push(`discover_interval = $${paramIndex++}`);
      values.push(updates.discoverInterval);
    }
    if (updates.lastDiscoveryAt !== undefined) {
      fields.push(`last_discovery_at = $${paramIndex++}`);
      values.push(updates.lastDiscoveryAt);
    }

    values.push(id, userId);

    const result = await this.pool.query(
      `UPDATE providers SET ${fields.join(', ')} WHERE id = $${paramIndex++} AND user_id = $${paramIndex} RETURNING *`,
      values
    );
    return result.rows[0] ? this.rowToProvider(result.rows[0]) : null;
  }

  async deleteProvider(userId: string, id: string): Promise<boolean> {
    const result = await this.pool.query(
      'DELETE FROM providers WHERE id = $1 AND user_id = $2',
      [id, userId]
    );
    return (result.rowCount ?? 0) > 0;
  }

  // Discovered hosts methods
  async getDiscoveredHosts(userId: string, providerId?: string): Promise<DiscoveredHost[]> {
    let query = 'SELECT * FROM discovered_hosts WHERE user_id = $1';
    const params: unknown[] = [userId];

    if (providerId) {
      query += ' AND provider_id = $2';
      params.push(providerId);
    }

    query += ' ORDER BY name';
    const result = await this.pool.query(query, params);
    return result.rows.map(this.rowToDiscoveredHost.bind(this));
  }

  async getDiscoveredHost(userId: string, id: string): Promise<DiscoveredHost | null> {
    const result = await this.pool.query(
      'SELECT * FROM discovered_hosts WHERE id = $1 AND user_id = $2',
      [id, userId]
    );
    return result.rows[0] ? this.rowToDiscoveredHost(result.rows[0]) : null;
  }

  async upsertDiscoveredHost(userId: string, providerId: string, data: {
    providerHostId: string;
    name: string;
    hostname?: string;
    privateIp?: string;
    publicIp?: string;
    osType?: string;
    osName?: string;
    state?: string;
    metadata?: Record<string, unknown>;
    tags?: string[];
  }): Promise<DiscoveredHost> {
    const result = await this.pool.query(
      `INSERT INTO discovered_hosts (user_id, provider_id, provider_host_id, name, hostname, private_ip, public_ip, os_type, os_name, state, metadata, tags)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       ON CONFLICT (provider_id, provider_host_id)
       DO UPDATE SET
         name = EXCLUDED.name,
         hostname = EXCLUDED.hostname,
         private_ip = EXCLUDED.private_ip,
         public_ip = EXCLUDED.public_ip,
         os_type = EXCLUDED.os_type,
         os_name = EXCLUDED.os_name,
         state = EXCLUDED.state,
         metadata = EXCLUDED.metadata,
         tags = EXCLUDED.tags,
         last_seen_at = CURRENT_TIMESTAMP
       RETURNING *`,
      [
        userId, providerId, data.providerHostId, data.name, data.hostname,
        data.privateIp, data.publicIp, data.osType, data.osName, data.state,
        data.metadata ? JSON.stringify(data.metadata) : null, data.tags || []
      ]
    );
    return this.rowToDiscoveredHost(result.rows[0]);
  }

  async bulkUpsertDiscoveredHosts(userId: string, providerId: string, hosts: Array<{
    providerHostId: string;
    name: string;
    hostname?: string;
    privateIp?: string;
    publicIp?: string;
    osType?: string;
    osName?: string;
    state?: string;
    metadata?: Record<string, unknown>;
    tags?: string[];
  }>): Promise<DiscoveredHost[]> {
    const results: DiscoveredHost[] = [];
    for (const host of hosts) {
      const result = await this.upsertDiscoveredHost(userId, providerId, host);
      results.push(result);
    }
    return results;
  }

  async markDiscoveredHostImported(userId: string, id: string, connectionId: string): Promise<DiscoveredHost | null> {
    const result = await this.pool.query(
      `UPDATE discovered_hosts SET imported = true, connection_id = $3 WHERE id = $1 AND user_id = $2 RETURNING *`,
      [id, userId, connectionId]
    );
    return result.rows[0] ? this.rowToDiscoveredHost(result.rows[0]) : null;
  }

  async deleteDiscoveredHost(userId: string, id: string): Promise<boolean> {
    const result = await this.pool.query(
      'DELETE FROM discovered_hosts WHERE id = $1 AND user_id = $2',
      [id, userId]
    );
    return (result.rowCount ?? 0) > 0;
  }

  async deleteDiscoveredHostsByProvider(userId: string, providerId: string): Promise<number> {
    const result = await this.pool.query(
      'DELETE FROM discovered_hosts WHERE provider_id = $1 AND user_id = $2',
      [providerId, userId]
    );
    return result.rowCount ?? 0;
  }

  // Saved commands methods
  async getSavedCommands(userId: string, category?: string): Promise<SavedCommand[]> {
    let query = 'SELECT * FROM saved_commands WHERE user_id = $1';
    const params: unknown[] = [userId];

    if (category) {
      query += ' AND category = $2';
      params.push(category);
    }

    query += ' ORDER BY category, name';
    const result = await this.pool.query(query, params);
    return result.rows.map(this.rowToSavedCommand.bind(this));
  }

  async getSavedCommand(userId: string, id: string): Promise<SavedCommand | null> {
    const result = await this.pool.query(
      'SELECT * FROM saved_commands WHERE id = $1 AND user_id = $2',
      [id, userId]
    );
    return result.rows[0] ? this.rowToSavedCommand(result.rows[0]) : null;
  }

  async createSavedCommand(userId: string, data: {
    name: string;
    description?: string;
    command: string;
    targetOs?: string;
    category?: string;
    tags?: string[];
  }): Promise<SavedCommand> {
    const result = await this.pool.query(
      `INSERT INTO saved_commands (user_id, name, description, command, target_os, category, tags)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [userId, data.name, data.description, data.command, data.targetOs || 'all', data.category, data.tags || []]
    );
    return this.rowToSavedCommand(result.rows[0]);
  }

  async updateSavedCommand(userId: string, id: string, updates: Partial<{
    name: string;
    description: string;
    command: string;
    targetOs: string;
    category: string;
    tags: string[];
  }>): Promise<SavedCommand | null> {
    const fields: string[] = ['updated_at = CURRENT_TIMESTAMP'];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (updates.name !== undefined) {
      fields.push(`name = $${paramIndex++}`);
      values.push(updates.name);
    }
    if (updates.description !== undefined) {
      fields.push(`description = $${paramIndex++}`);
      values.push(updates.description);
    }
    if (updates.command !== undefined) {
      fields.push(`command = $${paramIndex++}`);
      values.push(updates.command);
    }
    if (updates.targetOs !== undefined) {
      fields.push(`target_os = $${paramIndex++}`);
      values.push(updates.targetOs);
    }
    if (updates.category !== undefined) {
      fields.push(`category = $${paramIndex++}`);
      values.push(updates.category);
    }
    if (updates.tags !== undefined) {
      fields.push(`tags = $${paramIndex++}`);
      values.push(updates.tags);
    }

    values.push(id, userId);

    const result = await this.pool.query(
      `UPDATE saved_commands SET ${fields.join(', ')} WHERE id = $${paramIndex++} AND user_id = $${paramIndex} RETURNING *`,
      values
    );
    return result.rows[0] ? this.rowToSavedCommand(result.rows[0]) : null;
  }

  async deleteSavedCommand(userId: string, id: string): Promise<boolean> {
    const result = await this.pool.query(
      'DELETE FROM saved_commands WHERE id = $1 AND user_id = $2',
      [id, userId]
    );
    return (result.rowCount ?? 0) > 0;
  }

  // Command execution methods
  async getCommandExecutions(userId: string, limit = 50): Promise<CommandExecution[]> {
    const result = await this.pool.query(
      'SELECT * FROM command_executions WHERE user_id = $1 ORDER BY started_at DESC LIMIT $2',
      [userId, limit]
    );
    return result.rows.map(this.rowToCommandExecution.bind(this));
  }

  async getCommandExecution(userId: string, id: string): Promise<CommandExecution | null> {
    const result = await this.pool.query(
      'SELECT * FROM command_executions WHERE id = $1 AND user_id = $2',
      [id, userId]
    );
    return result.rows[0] ? this.rowToCommandExecution(result.rows[0]) : null;
  }

  async createCommandExecution(userId: string, data: {
    commandId?: string;
    commandName: string;
    command: string;
    targetOs?: string;
    connectionIds: string[];
  }): Promise<CommandExecution> {
    const result = await this.pool.query(
      `INSERT INTO command_executions (user_id, command_id, command_name, command, target_os, connection_ids, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'pending')
       RETURNING *`,
      [userId, data.commandId, data.commandName, data.command, data.targetOs, data.connectionIds]
    );
    return this.rowToCommandExecution(result.rows[0]);
  }

  async updateCommandExecution(userId: string, id: string, updates: {
    status?: string;
    completedAt?: Date;
  }): Promise<CommandExecution | null> {
    const fields: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (updates.status !== undefined) {
      fields.push(`status = $${paramIndex++}`);
      values.push(updates.status);
    }
    if (updates.completedAt !== undefined) {
      fields.push(`completed_at = $${paramIndex++}`);
      values.push(updates.completedAt);
    }

    if (fields.length === 0) return null;

    values.push(id, userId);

    const result = await this.pool.query(
      `UPDATE command_executions SET ${fields.join(', ')} WHERE id = $${paramIndex++} AND user_id = $${paramIndex} RETURNING *`,
      values
    );
    return result.rows[0] ? this.rowToCommandExecution(result.rows[0]) : null;
  }

  // Command result methods
  async getCommandResults(executionId: string): Promise<CommandResult[]> {
    const result = await this.pool.query(
      'SELECT * FROM command_results WHERE execution_id = $1 ORDER BY connection_name',
      [executionId]
    );
    return result.rows.map(this.rowToCommandResult.bind(this));
  }

  async createCommandResult(executionId: string, data: {
    connectionId: string;
    connectionName: string;
    hostname: string;
  }): Promise<CommandResult> {
    const result = await this.pool.query(
      `INSERT INTO command_results (execution_id, connection_id, connection_name, hostname, status)
       VALUES ($1, $2, $3, $4, 'pending')
       RETURNING *`,
      [executionId, data.connectionId, data.connectionName, data.hostname]
    );
    return this.rowToCommandResult(result.rows[0]);
  }

  async updateCommandResult(id: string, updates: {
    status?: string;
    exitCode?: number;
    stdout?: string;
    stderr?: string;
    error?: string;
    startedAt?: Date;
    completedAt?: Date;
  }): Promise<CommandResult | null> {
    const fields: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (updates.status !== undefined) {
      fields.push(`status = $${paramIndex++}`);
      values.push(updates.status);
    }
    if (updates.exitCode !== undefined) {
      fields.push(`exit_code = $${paramIndex++}`);
      values.push(updates.exitCode);
    }
    if (updates.stdout !== undefined) {
      fields.push(`stdout = $${paramIndex++}`);
      values.push(updates.stdout);
    }
    if (updates.stderr !== undefined) {
      fields.push(`stderr = $${paramIndex++}`);
      values.push(updates.stderr);
    }
    if (updates.error !== undefined) {
      fields.push(`error = $${paramIndex++}`);
      values.push(updates.error);
    }
    if (updates.startedAt !== undefined) {
      fields.push(`started_at = $${paramIndex++}`);
      values.push(updates.startedAt);
    }
    if (updates.completedAt !== undefined) {
      fields.push(`completed_at = $${paramIndex++}`);
      values.push(updates.completedAt);
    }

    if (fields.length === 0) return null;

    values.push(id);

    const result = await this.pool.query(
      `UPDATE command_results SET ${fields.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
      values
    );
    return result.rows[0] ? this.rowToCommandResult(result.rows[0]) : null;
  }

  // Export all data for sync
  async exportAll(userId: string): Promise<{
    connections: ServerConnection[];
    credentials: Credential[];
    groups: ConnectionGroup[];
    providers: Provider[];
    savedCommands: SavedCommand[];
  }> {
    return {
      connections: await this.getConnections(userId),
      credentials: await this.getCredentials(userId),
      groups: await this.getGroups(userId),
      providers: await this.getProviders(userId),
      savedCommands: await this.getSavedCommands(userId),
    };
  }

  // Session logging methods
  async createSessionLog(data: {
    userId: string;
    connectionId?: string;
    sessionId: string;
    sessionType: 'ssh' | 'pty' | 'rdp';
    connectionName?: string;
    hostname?: string;
    data: string;
    dataType: 'input' | 'output';
  }): Promise<SessionLog> {
    const result = await this.pool.query(
      `INSERT INTO session_logs (user_id, connection_id, session_id, session_type, connection_name, hostname, data, data_type)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [data.userId, data.connectionId, data.sessionId, data.sessionType, data.connectionName, data.hostname, data.data, data.dataType]
    );
    return this.rowToSessionLog(result.rows[0]);
  }

  async getSessionLogs(filters: {
    userId?: string;
    connectionId?: string;
    sessionId?: string;
    sessionType?: string;
    startDate?: Date;
    endDate?: Date;
    limit?: number;
  }): Promise<SessionLog[]> {
    let query = 'SELECT * FROM session_logs WHERE 1=1';
    const params: unknown[] = [];
    let paramIndex = 1;

    if (filters.userId) {
      query += ` AND user_id = $${paramIndex++}`;
      params.push(filters.userId);
    }
    if (filters.connectionId) {
      query += ` AND connection_id = $${paramIndex++}`;
      params.push(filters.connectionId);
    }
    if (filters.sessionId) {
      query += ` AND session_id = $${paramIndex++}`;
      params.push(filters.sessionId);
    }
    if (filters.sessionType) {
      query += ` AND session_type = $${paramIndex++}`;
      params.push(filters.sessionType);
    }
    if (filters.startDate) {
      query += ` AND timestamp >= $${paramIndex++}`;
      params.push(filters.startDate);
    }
    if (filters.endDate) {
      query += ` AND timestamp <= $${paramIndex++}`;
      params.push(filters.endDate);
    }

    query += ' ORDER BY timestamp DESC';

    if (filters.limit) {
      query += ` LIMIT $${paramIndex++}`;
      params.push(filters.limit);
    }

    const result = await this.pool.query(query, params);
    return result.rows.map(this.rowToSessionLog.bind(this));
  }

  async deleteSessionLogs(filters: {
    sessionId?: string;
    olderThan?: Date;
  }): Promise<number> {
    let query = 'DELETE FROM session_logs WHERE 1=1';
    const params: unknown[] = [];
    let paramIndex = 1;

    if (filters.sessionId) {
      query += ` AND session_id = $${paramIndex++}`;
      params.push(filters.sessionId);
    }
    if (filters.olderThan) {
      query += ` AND timestamp < $${paramIndex++}`;
      params.push(filters.olderThan);
    }

    const result = await this.pool.query(query, params);
    return result.rowCount ?? 0;
  }

  // Sharing methods
  async toggleSharing(type: 'connection' | 'credential' | 'provider' | 'command', id: string, userId: string, isShared: boolean): Promise<boolean> {
    const tableMap = {
      connection: 'connections',
      credential: 'credentials',
      provider: 'providers',
      command: 'saved_commands',
    };
    const table = tableMap[type];

    const result = await this.pool.query(
      `UPDATE ${table} SET is_shared = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 AND user_id = $3 RETURNING *`,
      [isShared, id, userId]
    );
    return (result.rowCount ?? 0) > 0;
  }

  async getSharedConnections(): Promise<ServerConnection[]> {
    const result = await this.pool.query(
      'SELECT * FROM connections WHERE is_shared = true ORDER BY name'
    );
    return result.rows.map(this.rowToConnection);
  }

  async getSharedCredentials(): Promise<Credential[]> {
    const result = await this.pool.query(
      'SELECT * FROM credentials WHERE is_shared = true ORDER BY name'
    );
    const creds: Credential[] = [];
    for (const row of result.rows) {
      creds.push(await this.rowToCredential(row, row.user_id as string));
    }
    return creds;
  }

  async getSharedProviders(): Promise<Provider[]> {
    const result = await this.pool.query(
      'SELECT * FROM providers WHERE is_shared = true ORDER BY name'
    );
    return result.rows.map(this.rowToProvider.bind(this));
  }

  async getSharedCommands(): Promise<SavedCommand[]> {
    const result = await this.pool.query(
      'SELECT * FROM saved_commands WHERE is_shared = true ORDER BY category, name'
    );
    return result.rows.map(this.rowToSavedCommand.bind(this));
  }

  async getAllConnectionsWithShared(userId: string): Promise<ServerConnection[]> {
    const result = await this.pool.query(
      'SELECT * FROM connections WHERE user_id = $1 OR is_shared = true ORDER BY name',
      [userId]
    );
    return result.rows.map(this.rowToConnection);
  }

  async getAllCredentialsWithShared(userId: string): Promise<Credential[]> {
    const result = await this.pool.query(
      'SELECT * FROM credentials WHERE user_id = $1 OR is_shared = true ORDER BY name',
      [userId]
    );
    const creds: Credential[] = [];
    for (const row of result.rows) {
      creds.push(await this.rowToCredential(row, userId));
    }
    return creds;
  }

  async getAllProvidersWithShared(userId: string): Promise<Provider[]> {
    const result = await this.pool.query(
      'SELECT * FROM providers WHERE user_id = $1 OR is_shared = true ORDER BY name',
      [userId]
    );
    return result.rows.map(this.rowToProvider.bind(this));
  }

  async getAllCommandsWithShared(userId: string): Promise<SavedCommand[]> {
    const result = await this.pool.query(
      'SELECT * FROM saved_commands WHERE user_id = $1 OR is_shared = true ORDER BY category, name',
      [userId]
    );
    return result.rows.map(this.rowToSavedCommand.bind(this));
  }

  // Admin methods
  async getAllUsers(): Promise<User[]> {
    const result = await this.pool.query('SELECT * FROM users ORDER BY created_at DESC');
    return result.rows.map(this.rowToUser.bind(this));
  }

  async updateUserAdmin(userId: string, isAdmin: boolean): Promise<User | null> {
    const result = await this.pool.query(
      'UPDATE users SET is_admin = $1 WHERE id = $2 RETURNING *',
      [isAdmin, userId]
    );
    return result.rows[0] ? this.rowToUser(result.rows[0]) : null;
  }

  async deleteUser(userId: string): Promise<boolean> {
    const result = await this.pool.query('DELETE FROM users WHERE id = $1', [userId]);
    return (result.rowCount ?? 0) > 0;
  }

  async getSystemStats(): Promise<{
    totalUsers: number;
    totalConnections: number;
    totalCredentials: number;
    totalProviders: number;
    totalCommands: number;
    totalSessions: number;
    activeUsers24h: number;
  }> {
    const [users, connections, credentials, providers, commands, sessions, activeUsers] = await Promise.all([
      this.pool.query('SELECT COUNT(*) FROM users'),
      this.pool.query('SELECT COUNT(*) FROM connections'),
      this.pool.query('SELECT COUNT(*) FROM credentials'),
      this.pool.query('SELECT COUNT(*) FROM providers'),
      this.pool.query('SELECT COUNT(*) FROM saved_commands'),
      this.pool.query('SELECT COUNT(DISTINCT session_id) FROM session_logs'),
      this.pool.query('SELECT COUNT(DISTINCT user_id) FROM session_logs WHERE timestamp > NOW() - INTERVAL \'24 hours\''),
    ]);

    return {
      totalUsers: parseInt(users.rows[0].count),
      totalConnections: parseInt(connections.rows[0].count),
      totalCredentials: parseInt(credentials.rows[0].count),
      totalProviders: parseInt(providers.rows[0].count),
      totalCommands: parseInt(commands.rows[0].count),
      totalSessions: parseInt(sessions.rows[0].count),
      activeUsers24h: parseInt(activeUsers.rows[0].count),
    };
  }

  async close(): Promise<void> {
    await this.pool.end();
  }

  // Row converters
  private rowToUser(row: Record<string, unknown>): User {
    return {
      id: row.id as string,
      username: row.username as string,
      displayName: row.display_name as string,
      email: row.email as string | undefined,
      adDomain: row.ad_domain as string | undefined,
      adSid: row.ad_sid as string | undefined,
      roles: row.roles as User['roles'],
      isAdmin: (row.is_admin as boolean) || false,
      createdAt: new Date(row.created_at as string),
      lastLoginAt: row.last_login_at ? new Date(row.last_login_at as string) : undefined,
    };
  }

  private rowToConnection(row: Record<string, unknown>): ServerConnection {
    return {
      id: row.id as string,
      name: row.name as string,
      hostname: row.hostname as string,
      port: row.port as number,
      connectionType: (row.connection_type as ServerConnection['connectionType']) || 'ssh',
      username: row.username as string | undefined,
      credentialId: row.credential_id as string | undefined,
      tags: row.tags as string[],
      group: row.group_id as string | undefined,
      description: row.description as string | undefined,
      isShared: (row.is_shared as boolean) || false,
      ownerId: row.user_id as string,
      createdAt: new Date(row.created_at as string),
      updatedAt: new Date(row.updated_at as string),
      lastConnectedAt: row.last_connected_at ? new Date(row.last_connected_at as string) : undefined,
    };
  }

  private async rowToCredential(row: Record<string, unknown>, userId: string): Promise<Credential> {
    let sensitiveData: Record<string, string> = {};

    if (row.encrypted_data) {
      try {
        const encData = JSON.parse(row.encrypted_data as string) as EncryptedData;
        const decrypted = decrypt(encData, this.masterKey);
        sensitiveData = JSON.parse(decrypted);
      } catch {
        // Failed to decrypt
      }
    }

    // Get connections using this credential
    const usedByResult = await this.pool.query(
      'SELECT id FROM connections WHERE credential_id = $1 AND user_id = $2',
      [row.id, userId]
    );

    return {
      id: row.id as string,
      name: row.name as string,
      type: row.type as Credential['type'],
      username: row.username as string,
      secret: sensitiveData.secret,
      privateKey: sensitiveData.privateKey,
      passphrase: sensitiveData.passphrase,
      isShared: (row.is_shared as boolean) || false,
      ownerId: row.user_id as string,
      createdAt: new Date(row.created_at as string),
      updatedAt: new Date(row.updated_at as string),
      usedBy: usedByResult.rows.map((r) => r.id as string),
    };
  }

  private rowToGroup(row: Record<string, unknown>): ConnectionGroup {
    return {
      id: row.id as string,
      name: row.name as string,
      description: row.description as string | undefined,
      parentId: row.parent_id as string | undefined,
      color: row.color as string | undefined,
      createdAt: new Date(row.created_at as string),
      updatedAt: new Date(row.updated_at as string),
    };
  }

  private rowToProvider(row: Record<string, unknown>): Provider {
    let config: Record<string, unknown> = {};
    if (row.config) {
      try {
        const encData = JSON.parse(row.config as string) as EncryptedData;
        const decrypted = decrypt(encData, this.masterKey);
        config = JSON.parse(decrypted);
      } catch {
        // Failed to decrypt, try parsing as plain JSON
        try {
          config = JSON.parse(row.config as string);
        } catch {
          // Use empty config
        }
      }
    }

    return {
      id: row.id as string,
      userId: row.user_id as string,
      name: row.name as string,
      type: row.type as string,
      config,
      autoDiscover: row.auto_discover as boolean,
      discoverInterval: row.discover_interval as number,
      lastDiscoveryAt: row.last_discovery_at ? new Date(row.last_discovery_at as string) : undefined,
      isShared: (row.is_shared as boolean) || false,
      createdAt: new Date(row.created_at as string),
      updatedAt: new Date(row.updated_at as string),
    };
  }

  private rowToDiscoveredHost(row: Record<string, unknown>): DiscoveredHost {
    let metadata: Record<string, unknown> | undefined;
    if (row.metadata) {
      try {
        metadata = JSON.parse(row.metadata as string);
      } catch {
        // Ignore parse errors
      }
    }

    return {
      id: row.id as string,
      userId: row.user_id as string,
      providerId: row.provider_id as string,
      providerHostId: row.provider_host_id as string,
      name: row.name as string,
      hostname: row.hostname as string | undefined,
      privateIp: row.private_ip as string | undefined,
      publicIp: row.public_ip as string | undefined,
      osType: row.os_type as string | undefined,
      osName: row.os_name as string | undefined,
      state: row.state as string | undefined,
      metadata,
      tags: (row.tags as string[]) || [],
      discoveredAt: new Date(row.discovered_at as string),
      lastSeenAt: new Date(row.last_seen_at as string),
      imported: row.imported as boolean,
      connectionId: row.connection_id as string | undefined,
    };
  }

  private rowToSavedCommand(row: Record<string, unknown>): SavedCommand {
    return {
      id: row.id as string,
      userId: row.user_id as string,
      name: row.name as string,
      description: row.description as string | undefined,
      command: row.command as string,
      targetOs: row.target_os as string,
      category: row.category as string | undefined,
      tags: (row.tags as string[]) || [],
      isShared: (row.is_shared as boolean) || false,
      createdAt: new Date(row.created_at as string),
      updatedAt: new Date(row.updated_at as string),
    };
  }

  private rowToCommandExecution(row: Record<string, unknown>): CommandExecution {
    return {
      id: row.id as string,
      userId: row.user_id as string,
      commandId: row.command_id as string | undefined,
      commandName: row.command_name as string,
      command: row.command as string,
      targetOs: row.target_os as string | undefined,
      connectionIds: (row.connection_ids as string[]) || [],
      status: row.status as string,
      startedAt: new Date(row.started_at as string),
      completedAt: row.completed_at ? new Date(row.completed_at as string) : undefined,
    };
  }

  private rowToCommandResult(row: Record<string, unknown>): CommandResult {
    return {
      id: row.id as string,
      executionId: row.execution_id as string,
      connectionId: row.connection_id as string,
      connectionName: row.connection_name as string,
      hostname: row.hostname as string,
      status: row.status as string,
      exitCode: row.exit_code as number | undefined,
      stdout: row.stdout as string | undefined,
      stderr: row.stderr as string | undefined,
      error: row.error as string | undefined,
      startedAt: row.started_at ? new Date(row.started_at as string) : undefined,
      completedAt: row.completed_at ? new Date(row.completed_at as string) : undefined,
    };
  }

  private rowToSessionLog(row: Record<string, unknown>): SessionLog {
    return {
      id: row.id as string,
      userId: row.user_id as string,
      connectionId: row.connection_id as string | undefined,
      sessionId: row.session_id as string,
      sessionType: row.session_type as SessionLog['sessionType'],
      connectionName: row.connection_name as string | undefined,
      hostname: row.hostname as string | undefined,
      data: row.data as string,
      dataType: row.data_type as SessionLog['dataType'],
      timestamp: new Date(row.timestamp as string),
    };
  }
}
