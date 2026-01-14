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
}

export const api = new ApiService();
