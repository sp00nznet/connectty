/**
 * Core types for connectty SSH client
 */

export interface ServerConnection {
  id: string;
  name: string;
  hostname: string;
  port: number;
  username?: string;
  credentialId?: string;
  tags: string[];
  group?: string;
  description?: string;
  createdAt: Date;
  updatedAt: Date;
  lastConnectedAt?: Date;
}

export interface Credential {
  id: string;
  name: string;
  type: CredentialType;
  username: string;
  // Password or private key (encrypted in storage)
  secret?: string;
  // For key-based auth
  privateKey?: string;
  passphrase?: string;
  // Metadata
  createdAt: Date;
  updatedAt: Date;
  usedBy: string[]; // Connection IDs using this credential
}

export type CredentialType = 'password' | 'privateKey' | 'agent';

export interface ConnectionGroup {
  id: string;
  name: string;
  description?: string;
  parentId?: string;
  color?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface User {
  id: string;
  username: string;
  displayName: string;
  email?: string;
  adDomain?: string;
  adSid?: string;
  roles: UserRole[];
  createdAt: Date;
  lastLoginAt?: Date;
}

export type UserRole = 'admin' | 'user' | 'viewer';

export interface SyncData {
  version: string;
  exportedAt: Date;
  exportedBy: string;
  connections: ServerConnection[];
  credentials: Credential[];
  groups: ConnectionGroup[];
}

export interface SSHSessionOptions {
  connectionId: string;
  cols: number;
  rows: number;
}

export interface SSHSessionEvent {
  type: 'data' | 'close' | 'error' | 'resize';
  data?: string;
  code?: number;
  message?: string;
}

export interface APIResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginatedResponse<T> extends APIResponse<T[]> {
  total: number;
  page: number;
  pageSize: number;
}

export interface AuthRequest {
  username: string;
  password: string;
  domain?: string;
}

export interface AuthResponse {
  token: string;
  user: User;
  expiresAt: Date;
}

export interface ImportOptions {
  format: 'json' | 'csv' | 'putty' | 'ssh_config';
  overwrite: boolean;
  mergeCredentials: boolean;
}

export interface ExportOptions {
  format: 'json' | 'csv';
  includeCredentials: boolean;
  encryptSecrets: boolean;
  password?: string;
}
