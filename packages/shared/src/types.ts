/**
 * Core types for connectty SSH client
 */

// ============================================================================
// Connection Types
// ============================================================================

export type ConnectionType = 'ssh' | 'rdp' | 'serial';
export type OSType = 'linux' | 'windows' | 'unix' | 'esxi' | 'unknown';

// Serial port settings
export type SerialBaudRate = 300 | 1200 | 2400 | 4800 | 9600 | 19200 | 38400 | 57600 | 115200 | 230400 | 460800 | 921600;
export type SerialDataBits = 5 | 6 | 7 | 8;
export type SerialStopBits = 1 | 1.5 | 2;
export type SerialParity = 'none' | 'odd' | 'even' | 'mark' | 'space';
export type SerialFlowControl = 'none' | 'hardware' | 'software';

export interface SerialSettings {
  device: string;  // COM1, /dev/ttyUSB0, etc.
  baudRate: SerialBaudRate;
  dataBits: SerialDataBits;
  stopBits: SerialStopBits;
  parity: SerialParity;
  flowControl: SerialFlowControl;
}

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
  // Serial connection settings
  serialSettings?: SerialSettings;
  // Provider info (if discovered)
  providerId?: string;
  providerHostId?: string;
  // Health status (from Datadog health plugin)
  healthStatus?: HealthStatus;
  healthLastChecked?: Date;
  // Sharing
  isShared?: boolean;
  ownerId?: string;
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
  // Password (for create/update operations)
  password?: string;
  // Password or private key (encrypted in storage)
  secret?: string;
  // For key-based auth
  privateKey?: string;
  passphrase?: string;
  // Auto-assign rules
  autoAssignPatterns?: string[]; // Hostname patterns to auto-assign this credential
  autoAssignGroup?: string;  // Group ID to auto-assign this credential to imported hosts
  // Sharing
  isShared?: boolean;
  ownerId?: string;
  // Metadata
  createdAt: Date;
  updatedAt: Date;
  usedBy: string[]; // Connection IDs using this credential
}

// ============================================================================
// Provider Types (Cloud & Hypervisor)
// ============================================================================

export type ProviderType = 'esxi' | 'proxmox' | 'aws' | 'gcp' | 'azure' | 'bigfix';

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
  // Sharing
  isShared?: boolean;
  ownerId?: string;
  // Metadata
  createdAt: Date;
  updatedAt: Date;
}

export type ProviderConfig =
  | ESXiConfig
  | ProxmoxConfig
  | AWSConfig
  | GCPConfig
  | AzureConfig
  | BigFixConfig;

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

export interface BigFixConfig {
  type: 'bigfix';
  host: string;
  port: number;
  username: string;        // AD username (e.g., DOMAIN\\user or user@domain.com)
  password?: string;
  ignoreCertErrors: boolean;
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

export interface ProviderSyncResult {
  providerId: string;
  providerName: string;
  success: boolean;
  error?: string;
  syncedAt: Date;
  // New hosts discovered (not seen before or previously removed)
  newHosts: DiscoveredHost[];
  // Hosts that are no longer present (were in last discovery, not in current)
  removedHosts: DiscoveredHost[];
  // Hosts that were already known and still present
  existingHosts: DiscoveredHost[];
  // Hosts that changed state (running -> stopped, etc.)
  changedHosts: Array<{
    host: DiscoveredHost;
    previousState: HostState;
    currentState: HostState;
  }>;
  // Summary counts
  summary: {
    total: number;
    new: number;
    removed: number;
    existing: number;
    changed: number;
    imported: number;  // How many were already imported as connections
  };
}

export type GroupMembershipType = 'static' | 'dynamic';

export interface GroupRule {
  // Pattern matching (e.g., "dev-web-*", "prod-db-*", "*-linux")
  hostnamePattern?: string;
  // OS type filtering
  osType?: OSType | OSType[];
  // Tag matching
  tags?: string[];
  // Provider filtering
  providerId?: string;
  // Connection type filtering
  connectionType?: ConnectionType;
}

export interface ConnectionGroup {
  id: string;
  name: string;
  description?: string;
  parentId?: string;
  color?: string;
  // Group type
  membershipType: GroupMembershipType;
  // Dynamic group rules (applied automatically)
  rules?: GroupRule[];
  // Assigned credentials (auto-applied to matching hosts)
  credentialId?: string;
  // Assigned scripts/actions
  assignedScripts?: string[]; // SavedCommand IDs
  // Sharing
  isShared?: boolean;
  ownerId?: string;
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
  isAdmin: boolean;
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
  type: 'data' | 'close' | 'error' | 'resize' | 'connected';
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

// ============================================================================
// Bulk Actions / Command Execution Types
// ============================================================================

export type CommandType = 'inline' | 'script';
export type CommandTargetOS = 'linux' | 'windows' | 'all';

export interface SavedCommand {
  id: string;
  name: string;
  description?: string;
  type: CommandType;
  targetOS: CommandTargetOS;
  // For inline commands
  command?: string;
  // For scripts
  scriptContent?: string;
  scriptLanguage?: 'bash' | 'powershell' | 'python';
  // Metadata
  category?: string; // e.g., 'user-management', 'system', 'networking'
  tags?: string[];
  // Variables that can be substituted (e.g., {{username}}, {{password}})
  variables?: CommandVariable[];
  // Group assignment (for quick access via plugin)
  assignedGroups?: string[]; // Group IDs this command is assigned to
  // Sharing
  isShared?: boolean;
  ownerId?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CommandVariable {
  name: string;
  description?: string;
  defaultValue?: string;
  required: boolean;
  type: 'string' | 'password' | 'number' | 'boolean';
}

export interface CommandExecution {
  id: string;
  commandId?: string; // Reference to saved command (if used)
  commandName: string;
  command: string; // Actual command/script that was run
  targetOS: CommandTargetOS;
  // Targeting
  connectionIds: string[];
  // Results per host
  results: CommandResult[];
  // Timing
  startedAt: Date;
  completedAt?: Date;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
}

export interface CommandResult {
  connectionId: string;
  connectionName: string;
  hostname: string;
  status: 'pending' | 'running' | 'success' | 'error' | 'skipped';
  exitCode?: number;
  stdout?: string;
  stderr?: string;
  error?: string;
  startedAt?: Date;
  completedAt?: Date;
}

export interface HostFilter {
  type: 'all' | 'group' | 'pattern' | 'selection' | 'os';
  // For group filter
  groupId?: string;
  // For pattern filter
  pattern?: string; // e.g., "web-*", "*-prod-*"
  // For selection filter
  connectionIds?: string[];
  // For OS filter
  osType?: OSType;
}

// Pre-built action templates
export interface ActionTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  icon?: string;
  targetOS: CommandTargetOS;
  variables: CommandVariable[];
  linuxCommand?: string;
  windowsCommand?: string;
}

// ============================================================================
// Plugin System Types
// ============================================================================

export type PluginType = 'host-stats' | 'script-manager' | 'box-analyzer' | 'matrix' | 'datadog-health' | 'custom';

export interface PluginDefinition {
  id: string;
  name: string;
  type: PluginType;
  description: string;
  icon?: string;
  enabled: boolean;
  settings?: Record<string, unknown>;
}

export interface HostStats {
  connectionId: string;
  timestamp: Date;
  cpu: {
    usage: number; // percentage
    cores: number;
    loadAverage?: number[];
  };
  memory: {
    total: number; // bytes
    used: number; // bytes
    free: number; // bytes
    usage: number; // percentage
  };
  disk: {
    total: number; // bytes
    used: number; // bytes
    free: number; // bytes
    usage: number; // percentage
  }[];
  network: {
    interface: string;
    bytesReceived: number;
    bytesSent: number;
    packetsReceived: number;
    packetsSent: number;
  }[];
}

// ============================================================================
// What Does This Box Do - System Analysis Types
// ============================================================================

export type TheoryConfidence = 'low' | 'medium' | 'high' | 'certain';
export type SystemRole = 'web-server' | 'database' | 'application-server' | 'cache' | 'message-queue'
  | 'load-balancer' | 'reverse-proxy' | 'file-server' | 'backup-server' | 'monitoring'
  | 'ci-cd' | 'container-host' | 'kubernetes-node' | 'storage' | 'dns' | 'mail-server' | 'unknown';

export interface DetectedApplication {
  name: string;
  version?: string;
  process?: string;
  port?: number;
  confidence: TheoryConfidence;
  evidence: string[]; // List of evidence that led to this detection
}

export interface ConnectedSystem {
  hostname?: string;
  ip: string;
  port: number;
  protocol: string;
  connectionType: 'inbound' | 'outbound' | 'bidirectional';
  purpose?: string; // e.g., "database connection", "API endpoint"
  confidence: TheoryConfidence;
}

export interface SystemTheory {
  connectionId: string;
  timestamp: Date;
  // Primary theory about what this system does
  primaryRole: SystemRole;
  confidence: TheoryConfidence;
  // Supporting evidence for the theory
  evidence: {
    category: string; // e.g., "installed packages", "running processes", "open ports"
    findings: string[];
  }[];
  // Detected applications
  applications: DetectedApplication[];
  // Connected systems
  connectedSystems: ConnectedSystem[];
  // Additional insights
  insights: string[];
  // Datadog integration data (if available)
  datadogMetrics?: {
    tags: string[];
    metrics: Record<string, number>;
    lastUpdated: Date;
  };
}

export interface BoxAnalysisSettings {
  pollingEnabled: boolean;
  pollingInterval: number; // minutes
  datadogEnabled: boolean;
  datadogApiKey?: string;
  datadogAppKey?: string;
  datadogSite?: string; // e.g., 'datadoghq.com', 'datadoghq.eu'
}

export interface MatrixConfig {
  speed: number;        // Animation speed (1-10, default: 5)
  density: number;      // Character density (1-10, default: 5)
  fontSize: number;     // Font size in pixels (default: 14)
  color: string;        // Color of characters (default: '#0F0')
  useJapanese: boolean; // Use Japanese katakana characters (default: true)
}

// ============================================================================
// Datadog Health Monitoring Plugin Types
// ============================================================================

export type HealthStatus = 'green' | 'yellow' | 'red' | 'unknown';

export interface DatadogHealthConfig {
  enabled: boolean;
  apiKey: string;
  appKey: string;
  site?: string;          // Datadog site (datadoghq.com, datadoghq.eu, etc.)
  pollInterval: number;   // Minutes between polls (default: 15)

  // Thresholds for health status calculation
  thresholds: {
    cpu: {
      yellow: number;     // CPU usage % to trigger yellow (default: 70)
      red: number;        // CPU usage % to trigger red (default: 90)
    };
    memory: {
      yellow: number;     // Memory usage % to trigger yellow (default: 75)
      red: number;        // Memory usage % to trigger red (default: 90)
    };
    disk: {
      yellow: number;     // Disk usage % to trigger yellow (default: 80)
      red: number;        // Disk usage % to trigger red (default: 95)
    };
  };
}

export interface ConnectionHealthStatus {
  connectionId: string;
  hostname: string;
  status: HealthStatus;
  lastChecked: Date;
  metrics?: {
    cpu?: number;         // Current CPU usage %
    memory?: number;      // Current memory usage %
    disk?: number;        // Highest disk usage %
  };
  issues?: string[];      // List of current issues (e.g., "High CPU usage: 95%")
}

export interface AppSettings {
  minimizeToTray: boolean;
  closeToTray: boolean;
  startMinimized: boolean;
  terminalTheme: 'sync' | 'classic';
  defaultShell: string;
  // Plugin settings
  pluginsEnabled: boolean;
  enabledPlugins: string[]; // Plugin IDs
  // Box analysis settings
  boxAnalysis?: BoxAnalysisSettings;
  // Matrix plugin settings
  matrixConfig?: MatrixConfig;
  // Datadog health monitoring settings
  datadogHealth?: DatadogHealthConfig;
}

// ============================================================================
// Profile System Types
// ============================================================================

export interface Profile {
  id: string;
  name: string;
  description?: string;
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
}
