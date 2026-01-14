/**
 * Core types for connectty SSH client
 */

// ============================================================================
// Connection Types
// ============================================================================

export type ConnectionType = 'ssh' | 'rdp';
export type OSType = 'linux' | 'windows' | 'unix' | 'esxi' | 'unknown';

export interface ServerConnection {
  id: string;
  name: string;
  hostname: string;
  port: number;
  connectionType: ConnectionType;
  osType?: OSType;
  username?: string;
  credentialId?: string;
  tags: string[];
  group?: string;
  description?: string;
  // Provider info (if discovered)
  providerId?: string;
  providerHostId?: string;
  createdAt: Date;
  updatedAt: Date;
  lastConnectedAt?: Date;
}

// ============================================================================
// Credential Types
// ============================================================================

export type CredentialType = 'password' | 'privateKey' | 'agent' | 'domain';

export interface Credential {
  id: string;
  name: string;
  type: CredentialType;
  username: string;
  // For domain credentials (DOMAIN\username)
  domain?: string;
  // Password or private key (encrypted in storage)
  secret?: string;
  // For key-based auth
  privateKey?: string;
  passphrase?: string;
  // Auto-assign rules
  autoAssignPatterns?: string[]; // Hostname patterns to auto-assign this credential
  autoAssignOSTypes?: OSType[];  // OS types to auto-assign this credential
  // Metadata
  createdAt: Date;
  updatedAt: Date;
  usedBy: string[]; // Connection IDs using this credential
}

// ============================================================================
// Provider Types (Cloud & Hypervisor)
// ============================================================================

export type ProviderType = 'esxi' | 'proxmox' | 'aws' | 'gcp' | 'azure';

export interface Provider {
  id: string;
  name: string;
  type: ProviderType;
  enabled: boolean;
  config: ProviderConfig;
  // Auto-discovery settings
  autoDiscover: boolean;
  discoverInterval?: number; // minutes
  lastDiscoveryAt?: Date;
  // Metadata
  createdAt: Date;
  updatedAt: Date;
}

export type ProviderConfig =
  | ESXiConfig
  | ProxmoxConfig
  | AWSConfig
  | GCPConfig
  | AzureConfig;

export interface ESXiConfig {
  type: 'esxi';
  host: string;
  port: number;
  username: string;
  password?: string;
  ignoreCertErrors: boolean;
}

export interface ProxmoxConfig {
  type: 'proxmox';
  host: string;
  port: number;
  username: string;
  password?: string;
  realm: string; // pam, pve, etc.
  ignoreCertErrors: boolean;
}

export interface AWSConfig {
  type: 'aws';
  accessKeyId: string;
  secretAccessKey?: string;
  region: string;
  regions?: string[]; // Additional regions to scan
  assumeRoleArn?: string;
}

export interface GCPConfig {
  type: 'gcp';
  projectId: string;
  serviceAccountKey?: string; // JSON key file content
  zones?: string[]; // Specific zones to scan
}

export interface AzureConfig {
  type: 'azure';
  tenantId: string;
  clientId: string;
  clientSecret?: string;
  subscriptionId: string;
  subscriptions?: string[]; // Additional subscriptions
}

// ============================================================================
// Host Discovery Types
// ============================================================================

export interface DiscoveredHost {
  id: string;
  providerId: string;
  providerHostId: string; // Provider-specific ID (VM ID, instance ID, etc.)
  name: string;
  hostname?: string;
  privateIp?: string;
  publicIp?: string;
  osType: OSType;
  osName?: string; // e.g., "Ubuntu 22.04", "Windows Server 2022"
  state: HostState;
  // Provider-specific metadata
  metadata: Record<string, string>;
  tags: Record<string, string>;
  // Discovery info
  discoveredAt: Date;
  lastSeenAt: Date;
  // Import status
  imported: boolean;
  connectionId?: string;
}

export type HostState = 'running' | 'stopped' | 'suspended' | 'unknown';

export interface DiscoveryResult {
  providerId: string;
  providerName: string;
  success: boolean;
  error?: string;
  hosts: DiscoveredHost[];
  discoveredAt: Date;
}

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
