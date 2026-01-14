/**
 * PostgreSQL Database Service
 */

import { Pool, PoolConfig } from 'pg';
import { generateId, encrypt, decrypt, type EncryptedData } from '@connectty/shared';
import type { ServerConnection, Credential, ConnectionGroup, User } from '@connectty/shared';
import * as crypto from 'crypto';

export class DatabaseService {
  private pool: Pool;
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
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          last_login_at TIMESTAMP
        );

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
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS connections (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          name VARCHAR(255) NOT NULL,
          hostname VARCHAR(255) NOT NULL,
          port INTEGER DEFAULT 22,
          username VARCHAR(255),
          credential_id UUID REFERENCES credentials(id) ON DELETE SET NULL,
          tags TEXT[] DEFAULT ARRAY[]::TEXT[],
          group_id UUID REFERENCES connection_groups(id) ON DELETE SET NULL,
          description TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          last_connected_at TIMESTAMP
        );

        CREATE INDEX IF NOT EXISTS idx_connections_user ON connections(user_id);
        CREATE INDEX IF NOT EXISTS idx_credentials_user ON credentials(user_id);
        CREATE INDEX IF NOT EXISTS idx_groups_user ON connection_groups(user_id);
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
  }): Promise<User> {
    const result = await this.pool.query(
      `INSERT INTO users (username, password_hash, display_name, email, ad_domain, ad_sid, roles)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [data.username, data.passwordHash, data.displayName, data.email, data.adDomain, data.adSid, data.roles || ['user']]
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
      `INSERT INTO connections (user_id, name, hostname, port, username, credential_id, tags, group_id, description)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [userId, data.name, data.hostname, data.port || 22, data.username, data.credentialId, data.tags || [], data.group, data.description]
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

  // Export all data for sync
  async exportAll(userId: string): Promise<{ connections: ServerConnection[]; credentials: Credential[]; groups: ConnectionGroup[] }> {
    return {
      connections: await this.getConnections(userId),
      credentials: await this.getCredentials(userId),
      groups: await this.getGroups(userId),
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
      username: row.username as string | undefined,
      credentialId: row.credential_id as string | undefined,
      tags: row.tags as string[],
      group: row.group_id as string | undefined,
      description: row.description as string | undefined,
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
}
