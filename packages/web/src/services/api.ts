/**
 * API service for web client
 */

import type {
  ServerConnection,
  Credential,
  ConnectionGroup,
  User,
  AuthResponse,
  APIResponse,
} from '@connectty/shared';

const API_BASE = '/api';

class ApiService {
  private token: string | null = null;

  setToken(token: string | null) {
    this.token = token;
    if (token) {
      localStorage.setItem('auth_token', token);
    } else {
      localStorage.removeItem('auth_token');
    }
  }

  getToken(): string | null {
    if (!this.token) {
      this.token = localStorage.getItem('auth_token');
    }
    return this.token;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const token = this.getToken();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...((options.headers as Record<string, string>) || {}),
    };

    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    const response = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers,
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Request failed');
    }

    return data;
  }

  // Auth
  async login(username: string, password: string, domain?: string): Promise<AuthResponse> {
    const response = await this.request<APIResponse<AuthResponse>>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password, domain }),
    });

    if (response.data) {
      this.setToken(response.data.token);
    }

    return response.data!;
  }

  async register(username: string, password: string, displayName: string, email?: string): Promise<AuthResponse> {
    const response = await this.request<APIResponse<AuthResponse>>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ username, password, displayName, email }),
    });

    if (response.data) {
      this.setToken(response.data.token);
    }

    return response.data!;
  }

  async verifyToken(): Promise<User | null> {
    try {
      const response = await this.request<APIResponse<{ user: User }>>('/auth/verify');
      return response.data?.user || null;
    } catch {
      this.setToken(null);
      return null;
    }
  }

  logout() {
    this.setToken(null);
  }

  // Connections
  async getConnections(): Promise<ServerConnection[]> {
    const response = await this.request<APIResponse<ServerConnection[]>>('/connections');
    return response.data || [];
  }

  async getConnection(id: string): Promise<ServerConnection | null> {
    const response = await this.request<APIResponse<ServerConnection>>(`/connections/${id}`);
    return response.data || null;
  }

  async createConnection(data: Partial<ServerConnection>): Promise<ServerConnection> {
    const response = await this.request<APIResponse<ServerConnection>>('/connections', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return response.data!;
  }

  async updateConnection(id: string, data: Partial<ServerConnection>): Promise<ServerConnection> {
    const response = await this.request<APIResponse<ServerConnection>>(`/connections/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
    return response.data!;
  }

  async deleteConnection(id: string): Promise<void> {
    await this.request(`/connections/${id}`, { method: 'DELETE' });
  }

  // Credentials
  async getCredentials(): Promise<Credential[]> {
    const response = await this.request<APIResponse<Credential[]>>('/credentials');
    return response.data || [];
  }

  async createCredential(data: Partial<Credential>): Promise<Credential> {
    const response = await this.request<APIResponse<Credential>>('/credentials', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return response.data!;
  }

  async updateCredential(id: string, data: Partial<Credential>): Promise<Credential> {
    const response = await this.request<APIResponse<Credential>>(`/credentials/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
    return response.data!;
  }

  async deleteCredential(id: string): Promise<void> {
    await this.request(`/credentials/${id}`, { method: 'DELETE' });
  }

  // Groups
  async getGroups(): Promise<ConnectionGroup[]> {
    const response = await this.request<APIResponse<ConnectionGroup[]>>('/groups');
    return response.data || [];
  }

  async createGroup(data: Partial<ConnectionGroup>): Promise<ConnectionGroup> {
    const response = await this.request<APIResponse<ConnectionGroup>>('/groups', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return response.data!;
  }

  async deleteGroup(id: string): Promise<void> {
    await this.request(`/groups/${id}`, { method: 'DELETE' });
  }

  // Providers
  async getProviders(): Promise<Provider[]> {
    const response = await this.request<APIResponse<Provider[]>>('/providers');
    return response.data || [];
  }

  async getProvider(id: string): Promise<Provider | null> {
    const response = await this.request<APIResponse<Provider>>(`/providers/${id}`);
    return response.data || null;
  }

  async createProvider(data: Partial<Provider>): Promise<Provider> {
    const response = await this.request<APIResponse<Provider>>('/providers', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return response.data!;
  }

  async updateProvider(id: string, data: Partial<Provider>): Promise<Provider> {
    const response = await this.request<APIResponse<Provider>>(`/providers/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
    return response.data!;
  }

  async deleteProvider(id: string): Promise<void> {
    await this.request(`/providers/${id}`, { method: 'DELETE' });
  }

  async testProvider(id: string): Promise<{ success: boolean; message: string }> {
    const response = await this.request<APIResponse<{ success: boolean; message: string }>>(`/providers/${id}/test`, {
      method: 'POST',
    });
    return response.data!;
  }

  async discoverHosts(providerId: string): Promise<DiscoveredHost[]> {
    const response = await this.request<APIResponse<DiscoveredHost[]>>(`/providers/${providerId}/discover`, {
      method: 'POST',
    });
    return response.data || [];
  }

  async getDiscoveredHosts(providerId: string): Promise<DiscoveredHost[]> {
    const response = await this.request<APIResponse<DiscoveredHost[]>>(`/providers/${providerId}/hosts`);
    return response.data || [];
  }

  async importHosts(providerId: string, hostIds: string[], options: {
    credentialId?: string;
    group?: string;
    ipPreference?: 'private' | 'public' | 'hostname';
  }): Promise<{ imported: number; errors: number; errorDetails: string[] }> {
    const response = await this.request<APIResponse<{ imported: number; errors: number; errorDetails: string[] }>>(`/providers/${providerId}/hosts/import`, {
      method: 'POST',
      body: JSON.stringify({ hostIds, ...options }),
    });
    return response.data!;
  }

  // Saved Commands
  async getSavedCommands(category?: string): Promise<SavedCommand[]> {
    const url = category ? `/commands/saved?category=${encodeURIComponent(category)}` : '/commands/saved';
    const response = await this.request<APIResponse<SavedCommand[]>>(url);
    return response.data || [];
  }

  async getSavedCommand(id: string): Promise<SavedCommand | null> {
    const response = await this.request<APIResponse<SavedCommand>>(`/commands/saved/${id}`);
    return response.data || null;
  }

  async createSavedCommand(data: Partial<SavedCommand>): Promise<SavedCommand> {
    const response = await this.request<APIResponse<SavedCommand>>('/commands/saved', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return response.data!;
  }

  async updateSavedCommand(id: string, data: Partial<SavedCommand>): Promise<SavedCommand> {
    const response = await this.request<APIResponse<SavedCommand>>(`/commands/saved/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
    return response.data!;
  }

  async deleteSavedCommand(id: string): Promise<void> {
    await this.request(`/commands/saved/${id}`, { method: 'DELETE' });
  }

  // Command Execution
  async executeCommand(data: {
    command?: string;
    commandId?: string;
    connectionIds: string[];
    maxParallel?: number;
  }): Promise<{ executionId: string; connectionCount: number }> {
    const response = await this.request<APIResponse<{ executionId: string; connectionCount: number }>>('/commands/execute', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return response.data!;
  }

  async getCommandExecutions(limit?: number): Promise<CommandExecution[]> {
    const url = limit ? `/commands/executions?limit=${limit}` : '/commands/executions';
    const response = await this.request<APIResponse<CommandExecution[]>>(url);
    return response.data || [];
  }

  async getCommandExecution(id: string): Promise<CommandExecutionWithResults | null> {
    const response = await this.request<APIResponse<CommandExecutionWithResults>>(`/commands/executions/${id}`);
    return response.data || null;
  }
}

// Type definitions for new features
export interface Provider {
  id: string;
  userId: string;
  name: string;
  type: string;
  config: Record<string, unknown>;
  autoDiscover: boolean;
  discoverInterval: number;
  lastDiscoveryAt?: Date;
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

export interface CommandExecutionWithResults extends CommandExecution {
  results: CommandResult[];
}

export const api = new ApiService();
