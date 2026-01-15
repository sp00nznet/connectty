/**
 * Authentication Service - Local and AD authentication
 */

import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import ldap from 'ldapjs';
import type { User, AuthRequest, AuthResponse } from '@connectty/shared';
import type { DatabaseService } from './database';

interface AuthConfig {
  jwtSecret: string;
  jwtExpiry: string;
  adEnabled: boolean;
  adUrl?: string;
  adBaseDN?: string;
  adDomain?: string;
}

export class AuthService {
  private db: DatabaseService;
  private config: AuthConfig;

  constructor(db: DatabaseService, config: AuthConfig) {
    this.db = db;
    this.config = config;
  }

  async authenticate(request: AuthRequest): Promise<AuthResponse> {
    // Try AD authentication first if enabled and domain is provided
    if (this.config.adEnabled && request.domain) {
      return this.authenticateAD(request);
    }

    // Fall back to local authentication
    return this.authenticateLocal(request);
  }

  private async authenticateLocal(request: AuthRequest): Promise<AuthResponse> {
    const user = await this.db.getUserByUsername(request.username);
    if (!user) {
      throw new Error('Invalid username or password');
    }

    const passwordHash = await this.db.getPasswordHash(request.username);
    if (!passwordHash) {
      throw new Error('Invalid username or password');
    }

    const isValid = await bcrypt.compare(request.password, passwordHash);
    if (!isValid) {
      throw new Error('Invalid username or password');
    }

    await this.db.updateLastLogin(user.id);

    return this.createAuthResponse(user);
  }

  private async authenticateAD(request: AuthRequest): Promise<AuthResponse> {
    if (!this.config.adUrl || !this.config.adBaseDN) {
      throw new Error('AD authentication not configured');
    }

    const client = ldap.createClient({
      url: this.config.adUrl,
    });

    try {
      const userDN = `${request.username}@${request.domain || this.config.adDomain}`;

      await new Promise<void>((resolve, reject) => {
        client.bind(userDN, request.password, (err) => {
          if (err) {
            reject(new Error('Invalid AD credentials'));
          } else {
            resolve();
          }
        });
      });

      // Search for user info
      const searchResult = await new Promise<ldap.SearchEntry | null>((resolve, reject) => {
        const filter = `(&(objectCategory=person)(objectClass=user)(sAMAccountName=${request.username}))`;

        client.search(this.config.adBaseDN!, { filter, scope: 'sub' }, (err, res) => {
          if (err) {
            reject(err);
            return;
          }

          let entry: ldap.SearchEntry | null = null;

          res.on('searchEntry', (e) => {
            entry = e;
          });

          res.on('error', reject);
          res.on('end', () => resolve(entry));
        });
      });

      // Get or create user in local database
      let user = await this.db.getUserByUsername(request.username);

      if (!user) {
        // Extract attributes from LDAP search result
        const attrs = searchResult?.attributes || [];
        const getAttr = (name: string): string | undefined => {
          const attr = attrs.find((a: any) => a.type === name);
          return attr?.values?.[0]?.toString();
        };

        const displayName = getAttr('displayName') || request.username;
        const email = getAttr('mail');
        const adSid = getAttr('objectSid');

        user = await this.db.createUser({
          username: request.username,
          displayName,
          email,
          adDomain: request.domain || this.config.adDomain,
          adSid,
          roles: ['user'],
        });
      }

      await this.db.updateLastLogin(user.id);

      return this.createAuthResponse(user);
    } finally {
      client.unbind();
    }
  }

  async register(username: string, password: string, displayName: string, email?: string): Promise<AuthResponse> {
    const existing = await this.db.getUserByUsername(username);
    if (existing) {
      throw new Error('Username already exists');
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const user = await this.db.createUser({
      username,
      passwordHash,
      displayName,
      email,
      roles: ['user'],
    });

    return this.createAuthResponse(user);
  }

  async verifyToken(token: string): Promise<{ userId: string; username: string }> {
    try {
      const payload = jwt.verify(token, this.config.jwtSecret) as { userId: string; username: string };
      return payload;
    } catch {
      throw new Error('Invalid or expired token');
    }
  }

  async getUserFromToken(token: string): Promise<User | null> {
    const payload = await this.verifyToken(token);
    return this.db.getUserById(payload.userId);
  }

  private createAuthResponse(user: User): AuthResponse {
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 24);

    const token = jwt.sign(
      { userId: user.id, username: user.username },
      this.config.jwtSecret,
      { expiresIn: this.config.jwtExpiry as string }
    );

    return {
      token,
      user,
      expiresAt,
    };
  }
}
