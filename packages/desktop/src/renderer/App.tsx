import React, { useState, useEffect, useCallback, useRef } from 'react';
import type { ServerConnection, Credential, ConnectionGroup, SSHSessionEvent, ConnectionType, OSType, CredentialType, Provider, ProviderType, DiscoveredHost } from '@connectty/shared';
import type { ConnecttyAPI } from '../main/preload';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import 'xterm/css/xterm.css';

declare global {
  interface Window {
    connectty: ConnecttyAPI;
  }
}

interface SSHSession {
  id: string;
  connectionId: string;
  connectionName: string;
  terminal: Terminal;
  fitAddon: FitAddon;
}

export default function App() {
  const [connections, setConnections] = useState<ServerConnection[]>([]);
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [groups, setGroups] = useState<ConnectionGroup[]>([]);
  const [sessions, setSessions] = useState<SSHSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showConnectionModal, setShowConnectionModal] = useState(false);
  const [showCredentialModal, setShowCredentialModal] = useState(false);
  const [showPasswordPrompt, setShowPasswordPrompt] = useState(false);
  const [pendingConnection, setPendingConnection] = useState<ServerConnection | null>(null);
  const [editingConnection, setEditingConnection] = useState<ServerConnection | null>(null);
  const [editingCredential, setEditingCredential] = useState<Credential | null>(null);
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [showProviderModal, setShowProviderModal] = useState(false);
  const [editingProvider, setEditingProvider] = useState<Provider | null>(null);
  const [providerContextMenu, setProviderContextMenu] = useState<{ x: number; y: number; provider: Provider } | null>(null);
  const [isDiscovering, setIsDiscovering] = useState<string | null>(null);

  const terminalContainerRef = useRef<HTMLDivElement>(null);

  // Load data on mount
  useEffect(() => {
    loadData();

    // Listen for SSH events
    const unsubscribe = window.connectty.ssh.onEvent(handleSSHEvent);
    return () => unsubscribe();
  }, []);

  // Fit terminal on active session change
  useEffect(() => {
    const activeSession = sessions.find(s => s.id === activeSessionId);
    if (activeSession && terminalContainerRef.current) {
      terminalContainerRef.current.innerHTML = '';
      activeSession.terminal.open(terminalContainerRef.current);
      activeSession.fitAddon.fit();
    }
  }, [activeSessionId, sessions]);

  // Handle window resize
  useEffect(() => {
    const handleResize = () => {
      const activeSession = sessions.find(s => s.id === activeSessionId);
      if (activeSession) {
        activeSession.fitAddon.fit();
        const { cols, rows } = activeSession.terminal;
        window.connectty.ssh.resize(activeSession.id, cols, rows);
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [activeSessionId, sessions]);

  const loadData = async () => {
    const [conns, creds, grps, provs] = await Promise.all([
      window.connectty.connections.list(),
      window.connectty.credentials.list(),
      window.connectty.groups.list(),
      window.connectty.providers.list(),
    ]);
    setConnections(conns);
    setCredentials(creds);
    setGroups(grps);
    setProviders(provs);
  };

  const handleSSHEvent = useCallback((sessionId: string, event: SSHSessionEvent) => {
    setSessions(prev => {
      const session = prev.find(s => s.id === sessionId);
      if (!session) return prev;

      switch (event.type) {
        case 'data':
          session.terminal.write(event.data || '');
          break;
        case 'close':
          showNotification('success', `Disconnected from ${session.connectionName}`);
          return prev.filter(s => s.id !== sessionId);
        case 'error':
          showNotification('error', event.message || 'Connection error');
          break;
      }
      return prev;
    });
  }, []);

  const showNotification = (type: 'success' | 'error', message: string) => {
    setNotification({ type, message });
    setTimeout(() => setNotification(null), 4000);
  };

  const handleConnect = async (connection: ServerConnection, password?: string) => {
    // If RDP connection, launch external client
    if (connection.connectionType === 'rdp') {
      try {
        await window.connectty.rdp.connect(connection.id);
        showNotification('success', `Launching RDP client for ${connection.name}`);
      } catch (err) {
        showNotification('error', `Failed to launch RDP: ${(err as Error).message}`);
      }
      return;
    }

    // SSH connection
    // If no credential and no password provided, show password prompt
    if (!connection.credentialId && !password) {
      setPendingConnection(connection);
      setShowPasswordPrompt(true);
      return;
    }

    try {
      const sessionId = await window.connectty.ssh.connect(connection.id, password);

      const terminal = new Terminal({
        cursorBlink: true,
        fontFamily: 'Menlo, Monaco, "Courier New", monospace',
        fontSize: 14,
        theme: {
          background: '#000000',
          foreground: '#ffffff',
          cursor: '#ffffff',
        },
      });

      const fitAddon = new FitAddon();
      terminal.loadAddon(fitAddon);

      terminal.onData((data) => {
        window.connectty.ssh.write(sessionId, data);
      });

      terminal.onResize(({ cols, rows }) => {
        window.connectty.ssh.resize(sessionId, cols, rows);
      });

      const newSession: SSHSession = {
        id: sessionId,
        connectionId: connection.id,
        connectionName: connection.name,
        terminal,
        fitAddon,
      };

      setSessions(prev => [...prev, newSession]);
      setActiveSessionId(sessionId);
      showNotification('success', `Connected to ${connection.name}`);
    } catch (err) {
      showNotification('error', `Failed to connect: ${(err as Error).message}`);
    }
  };

  const handlePasswordSubmit = async (password: string) => {
    setShowPasswordPrompt(false);
    if (pendingConnection) {
      await handleConnect(pendingConnection, password);
      setPendingConnection(null);
    }
  };

  const handleDisconnect = async (sessionId: string) => {
    await window.connectty.ssh.disconnect(sessionId);
    setSessions(prev => prev.filter(s => s.id !== sessionId));
    if (activeSessionId === sessionId) {
      setActiveSessionId(sessions[0]?.id || null);
    }
  };

  const handleCreateConnection = async (data: Partial<ServerConnection>) => {
    try {
      if (editingConnection) {
        await window.connectty.connections.update(editingConnection.id, data);
        showNotification('success', 'Connection updated');
      } else {
        await window.connectty.connections.create(data as Omit<ServerConnection, 'id' | 'createdAt' | 'updatedAt'>);
        showNotification('success', 'Connection created');
      }
      await loadData();
      setShowConnectionModal(false);
      setEditingConnection(null);
    } catch (err) {
      showNotification('error', (err as Error).message);
    }
  };

  const handleCreateCredential = async (data: Partial<Credential>) => {
    try {
      if (editingCredential) {
        await window.connectty.credentials.update(editingCredential.id, data);
        showNotification('success', 'Credential updated');
      } else {
        await window.connectty.credentials.create(data as Omit<Credential, 'id' | 'createdAt' | 'updatedAt' | 'usedBy'>);
        showNotification('success', 'Credential created');
      }
      await loadData();
      setShowCredentialModal(false);
      setEditingCredential(null);
    } catch (err) {
      showNotification('error', (err as Error).message);
    }
  };

  const handleDeleteConnection = async (id: string) => {
    if (confirm('Are you sure you want to delete this connection?')) {
      await window.connectty.connections.delete(id);
      await loadData();
      showNotification('success', 'Connection deleted');
    }
  };

  const handleImport = async () => {
    const result = await window.connectty.import.file({
      format: 'json',
      overwrite: false,
      mergeCredentials: true,
    });

    if (result) {
      await loadData();
      showNotification('success', `Imported ${result.connections} connections`);
    }
  };

  const handleExport = async () => {
    const success = await window.connectty.export.file({
      format: 'json',
      includeCredentials: false,
      encryptSecrets: false,
    });

    if (success) {
      showNotification('success', 'Data exported successfully');
    }
  };

  // Provider handlers
  const handleCreateProvider = async (data: Partial<Provider>) => {
    try {
      if (editingProvider) {
        await window.connectty.providers.update(editingProvider.id, data);
        showNotification('success', 'Provider updated');
      } else {
        await window.connectty.providers.create(data as Omit<Provider, 'id' | 'createdAt' | 'updatedAt'>);
        showNotification('success', 'Provider created');
      }
      await loadData();
      setShowProviderModal(false);
      setEditingProvider(null);
    } catch (err) {
      showNotification('error', (err as Error).message);
    }
  };

  const handleDeleteProvider = async (id: string) => {
    if (confirm('Are you sure you want to delete this provider?')) {
      await window.connectty.providers.delete(id);
      await loadData();
      showNotification('success', 'Provider deleted');
    }
  };

  const handleDiscoverAndImport = async (provider: Provider) => {
    setProviderContextMenu(null);
    setIsDiscovering(provider.id);
    try {
      // Discover hosts from the provider
      const result = await window.connectty.providers.discover(provider.id);

      if (result.hosts.length === 0) {
        showNotification('error', 'No hosts found on this provider');
        setIsDiscovering(null);
        return;
      }

      // Import all discovered hosts with auto-assigned credentials
      const imported = await window.connectty.discovered.importAll(provider.id);

      await loadData();
      showNotification('success', `Imported ${imported.length} connections from ${provider.name}`);
    } catch (err) {
      showNotification('error', `Discovery failed: ${(err as Error).message}`);
    }
    setIsDiscovering(null);
  };

  const handleProviderContextMenu = (e: React.MouseEvent, provider: Provider) => {
    e.preventDefault();
    setProviderContextMenu({ x: e.clientX, y: e.clientY, provider });
  };

  // Close context menu on click outside
  useEffect(() => {
    const handleClick = () => setProviderContextMenu(null);
    if (providerContextMenu) {
      document.addEventListener('click', handleClick);
      return () => document.removeEventListener('click', handleClick);
    }
  }, [providerContextMenu]);

  const filteredConnections = connections.filter(conn =>
    conn.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    conn.hostname.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const groupedConnections = groups.reduce((acc, group) => {
    acc[group.id] = filteredConnections.filter(c => c.group === group.id);
    return acc;
  }, {} as Record<string, ServerConnection[]>);

  const ungroupedConnections = filteredConnections.filter(c => !c.group);

  return (
    <div className="app-container">
      {/* Sidebar */}
      <aside className="sidebar">
        <div className="sidebar-header">
          <h1>Connectty</h1>
          <p className="subtitle">SSH &amp; RDP Connection Manager</p>
        </div>

        <div className="sidebar-actions">
          <button className="btn btn-primary btn-sm" onClick={() => setShowConnectionModal(true)}>
            + New Connection
          </button>
          <button className="btn btn-secondary btn-sm" onClick={() => setShowCredentialModal(true)}>
            Credentials
          </button>
          <button className="btn btn-secondary btn-sm" onClick={() => setShowProviderModal(true)}>
            Providers
          </button>
        </div>

        <div className="sidebar-actions">
          <button className="btn btn-secondary btn-sm" onClick={handleImport}>Import</button>
          <button className="btn btn-secondary btn-sm" onClick={handleExport}>Export</button>
        </div>

        <div className="search-input">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8" />
            <path d="M21 21l-4.35-4.35" />
          </svg>
          <input
            type="text"
            placeholder="Search connections..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <div className="sidebar-content">
          <ul className="connection-list">
            {/* Grouped connections */}
            {groups.map(group => (
              groupedConnections[group.id]?.length > 0 && (
                <li key={group.id} className="connection-group">
                  <div className="connection-group-header">
                    <span style={{ color: group.color }}></span>
                    {group.name}
                  </div>
                  {groupedConnections[group.id].map(conn => (
                    <ConnectionItem
                      key={conn.id}
                      connection={conn}
                      isConnected={sessions.some(s => s.connectionId === conn.id)}
                      onConnect={() => handleConnect(conn)}
                      onEdit={() => { setEditingConnection(conn); setShowConnectionModal(true); }}
                      onDelete={() => handleDeleteConnection(conn.id)}
                    />
                  ))}
                </li>
              )
            ))}

            {/* Ungrouped connections */}
            {ungroupedConnections.length > 0 && (
              <li className="connection-group">
                <div className="connection-group-header">Connections</div>
                {ungroupedConnections.map(conn => (
                  <ConnectionItem
                    key={conn.id}
                    connection={conn}
                    isConnected={sessions.some(s => s.connectionId === conn.id)}
                    onConnect={() => handleConnect(conn)}
                    onEdit={() => { setEditingConnection(conn); setShowConnectionModal(true); }}
                    onDelete={() => handleDeleteConnection(conn.id)}
                  />
                ))}
              </li>
            )}

            {filteredConnections.length === 0 && (
              <div className="empty-state">
                <p>No connections found</p>
              </div>
            )}
          </ul>
        </div>
      </aside>

      {/* Main Content */}
      <main className="main-content">
        {sessions.length > 0 ? (
          <>
            {/* Session Tabs */}
            <div className="session-tabs">
              {sessions.map(session => (
                <button
                  key={session.id}
                  className={`session-tab ${activeSessionId === session.id ? 'active' : ''}`}
                  onClick={() => setActiveSessionId(session.id)}
                >
                  <span className="status-dot connected" />
                  {session.connectionName}
                  <span className="close-btn" onClick={(e) => { e.stopPropagation(); handleDisconnect(session.id); }}>
                    ×
                  </span>
                </button>
              ))}
            </div>

            {/* Terminal */}
            <div className="content-body">
              <div className="terminal-container" ref={terminalContainerRef} />
            </div>
          </>
        ) : (
          <div className="welcome-screen">
            <h2>Welcome to Connectty</h2>
            <p>Select a connection from the sidebar or create a new one to get started.</p>
            <button className="btn btn-primary" onClick={() => setShowConnectionModal(true)}>
              Create Connection
            </button>
          </div>
        )}
      </main>

      {/* Connection Modal */}
      {showConnectionModal && (
        <ConnectionModal
          connection={editingConnection}
          credentials={credentials}
          groups={groups}
          onClose={() => { setShowConnectionModal(false); setEditingConnection(null); }}
          onSave={handleCreateConnection}
        />
      )}

      {/* Credential Modal */}
      {showCredentialModal && (
        <CredentialModal
          credential={editingCredential}
          credentials={credentials}
          onClose={() => { setShowCredentialModal(false); setEditingCredential(null); }}
          onSave={handleCreateCredential}
          onEdit={(cred) => { setEditingCredential(cred); }}
          onDelete={async (id) => {
            await window.connectty.credentials.delete(id);
            await loadData();
            showNotification('success', 'Credential deleted');
          }}
        />
      )}

      {/* Password Prompt Modal */}
      {showPasswordPrompt && pendingConnection && (
        <PasswordPrompt
          connection={pendingConnection}
          onSubmit={handlePasswordSubmit}
          onCancel={() => { setShowPasswordPrompt(false); setPendingConnection(null); }}
        />
      )}

      {/* Provider Modal */}
      {showProviderModal && (
        <ProviderModal
          provider={editingProvider}
          providers={providers}
          onClose={() => { setShowProviderModal(false); setEditingProvider(null); }}
          onSave={handleCreateProvider}
          onEdit={(prov) => { setEditingProvider(prov); }}
          onDelete={handleDeleteProvider}
          onDiscover={handleDiscoverAndImport}
          isDiscovering={isDiscovering}
        />
      )}

      {/* Provider Context Menu */}
      {providerContextMenu && (
        <div
          className="context-menu"
          style={{ left: providerContextMenu.x, top: providerContextMenu.y }}
        >
          <button onClick={() => handleDiscoverAndImport(providerContextMenu.provider)}>
            Discover & Import Hosts
          </button>
          <button onClick={() => { setEditingProvider(providerContextMenu.provider); setShowProviderModal(true); setProviderContextMenu(null); }}>
            Edit Provider
          </button>
          <button onClick={() => { handleDeleteProvider(providerContextMenu.provider.id); setProviderContextMenu(null); }}>
            Delete Provider
          </button>
        </div>
      )}

      {/* Notification */}
      {notification && (
        <div className={`notification ${notification.type}`}>
          {notification.message}
        </div>
      )}
    </div>
  );
}

// Connection Item Component
interface ConnectionItemProps {
  connection: ServerConnection;
  isConnected: boolean;
  onConnect: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

function ConnectionItem({ connection, isConnected, onConnect, onEdit, onDelete }: ConnectionItemProps) {
  const [showMenu, setShowMenu] = useState(false);
  const [menuPosition, setMenuPosition] = useState({ x: 0, y: 0 });

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    setMenuPosition({ x: e.clientX, y: e.clientY });
    setShowMenu(true);
  };

  const isRDP = connection.connectionType === 'rdp';

  return (
    <div
      className="connection-item"
      onDoubleClick={onConnect}
      onContextMenu={handleContextMenu}
    >
      <span className={`status-dot ${isConnected ? 'connected' : ''}`} />
      <div className="connection-info">
        <div className="connection-name">
          <span className="connection-type-badge">{isRDP ? 'RDP' : 'SSH'}</span>
          {connection.name}
        </div>
        <div className="connection-host">{connection.username ? `${connection.username}@` : ''}{connection.hostname}:{connection.port}</div>
      </div>

      {showMenu && (
        <>
          <div className="modal-overlay" style={{ background: 'transparent' }} onClick={() => setShowMenu(false)} />
          <div className="context-menu" style={{ position: 'fixed', left: menuPosition.x, top: menuPosition.y }}>
            <div className="context-menu-item" onClick={() => { onConnect(); setShowMenu(false); }}>
              Connect
            </div>
            <div className="context-menu-item" onClick={() => { onEdit(); setShowMenu(false); }}>
              Edit
            </div>
            <div className="context-menu-divider" />
            <div className="context-menu-item danger" onClick={() => { onDelete(); setShowMenu(false); }}>
              Delete
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// Password Prompt Modal
interface PasswordPromptProps {
  connection: ServerConnection;
  onSubmit: (password: string) => void;
  onCancel: () => void;
}

function PasswordPrompt({ connection, onSubmit, onCancel }: PasswordPromptProps) {
  const [password, setPassword] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(password);
  };

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal modal-sm" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Enter Password</h3>
          <button className="btn btn-icon" onClick={onCancel}>×</button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            <p style={{ marginBottom: '1rem', color: '#a0aec0' }}>
              Enter password for <strong>{connection.username || 'root'}@{connection.hostname}</strong>
            </p>
            <div className="form-group">
              <input
                ref={inputRef}
                type="password"
                className="form-input"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password"
                autoComplete="current-password"
              />
            </div>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onCancel}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary">
              Connect
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Connection Modal Component
interface ConnectionModalProps {
  connection: ServerConnection | null;
  credentials: Credential[];
  groups: ConnectionGroup[];
  onClose: () => void;
  onSave: (data: Partial<ServerConnection>) => void;
}

function ConnectionModal({ connection, credentials, groups, onClose, onSave }: ConnectionModalProps) {
  const [name, setName] = useState(connection?.name || '');
  const [hostname, setHostname] = useState(connection?.hostname || '');
  const [connectionType, setConnectionType] = useState<ConnectionType>(connection?.connectionType || 'ssh');
  const [port, setPort] = useState(connection?.port || 22);
  const [username, setUsername] = useState(connection?.username || '');
  const [credentialId, setCredentialId] = useState(connection?.credentialId || '');
  const [groupId, setGroupId] = useState(connection?.group || '');
  const [description, setDescription] = useState(connection?.description || '');

  // Update port when connection type changes
  useEffect(() => {
    if (!connection) {
      setPort(connectionType === 'rdp' ? 3389 : 22);
    }
  }, [connectionType, connection]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      name,
      hostname,
      port,
      connectionType,
      username: username || undefined,
      credentialId: credentialId || undefined,
      group: groupId || undefined,
      description: description || undefined,
      tags: connection?.tags || [],
    });
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{connection ? 'Edit Connection' : 'New Connection'}</h3>
          <button className="btn btn-icon" onClick={onClose}>×</button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            <div className="form-group">
              <label className="form-label">Connection Type</label>
              <select
                className="form-select"
                value={connectionType}
                onChange={(e) => setConnectionType(e.target.value as ConnectionType)}
              >
                <option value="ssh">SSH (Linux/Unix)</option>
                <option value="rdp">RDP (Windows)</option>
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Name *</label>
              <input
                type="text"
                className="form-input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="My Server"
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label">Hostname *</label>
              <input
                type="text"
                className="form-input"
                value={hostname}
                onChange={(e) => setHostname(e.target.value)}
                placeholder="192.168.1.1 or server.example.com"
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label">Port</label>
              <input
                type="number"
                className="form-input"
                value={port}
                onChange={(e) => setPort(parseInt(e.target.value) || (connectionType === 'rdp' ? 3389 : 22))}
                min="1"
                max="65535"
              />
            </div>

            <div className="form-group">
              <label className="form-label">Username</label>
              <input
                type="text"
                className="form-input"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder={connectionType === 'rdp' ? 'Administrator' : 'root'}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Credential</label>
              <select
                className="form-select"
                value={credentialId}
                onChange={(e) => setCredentialId(e.target.value)}
              >
                <option value="">None (prompt for password)</option>
                {credentials.map((cred) => (
                  <option key={cred.id} value={cred.id}>
                    {cred.name} ({cred.type}{cred.domain ? ` - ${cred.domain}` : ''})
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Group</label>
              <select
                className="form-select"
                value={groupId}
                onChange={(e) => setGroupId(e.target.value)}
              >
                <option value="">No Group</option>
                {groups.map((group) => (
                  <option key={group.id} value={group.id}>
                    {group.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Description</label>
              <input
                type="text"
                className="form-input"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Optional description"
              />
            </div>
          </div>

          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary">
              {connection ? 'Save Changes' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Credential Modal Component
interface CredentialModalProps {
  credential: Credential | null;
  credentials: Credential[];
  onClose: () => void;
  onSave: (data: Partial<Credential>) => Promise<void>;
  onEdit: (cred: Credential) => void;
  onDelete: (id: string) => void;
}

function CredentialModal({ credential, credentials, onClose, onSave, onEdit, onDelete }: CredentialModalProps) {
  const [showForm, setShowForm] = useState(!!credential);
  const [name, setName] = useState(credential?.name || '');
  const [type, setType] = useState<CredentialType>(credential?.type || 'password');
  const [username, setUsername] = useState(credential?.username || '');
  const [domain, setDomain] = useState(credential?.domain || '');
  const [password, setPassword] = useState('');
  const [privateKey, setPrivateKey] = useState(credential?.privateKey || '');
  const [passphrase, setPassphrase] = useState('');
  const [autoAssignOSTypes, setAutoAssignOSTypes] = useState<string[]>(credential?.autoAssignOSTypes || []);

  const osTypeOptions: { value: OSType; label: string }[] = [
    { value: 'linux', label: 'Linux (Ubuntu, CentOS, Debian, etc.)' },
    { value: 'windows', label: 'Windows' },
    { value: 'unix', label: 'Unix (FreeBSD, Solaris, etc.)' },
    { value: 'esxi', label: 'VMware ESXi' },
  ];

  const toggleOSType = (osType: string) => {
    setAutoAssignOSTypes(prev =>
      prev.includes(osType)
        ? prev.filter(t => t !== osType)
        : [...prev, osType]
    );
  };

  const resetForm = () => {
    setName('');
    setType('password');
    setUsername('');
    setDomain('');
    setPassword('');
    setPrivateKey('');
    setPassphrase('');
    setAutoAssignOSTypes([]);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const data: Partial<Credential> = {
      name,
      type,
      username,
      domain: domain || undefined,
      autoAssignOSTypes: autoAssignOSTypes.length > 0 ? autoAssignOSTypes as OSType[] : undefined,
    };

    if (type === 'password' || type === 'domain') {
      data.secret = password || undefined;
    } else if (type === 'privateKey') {
      data.privateKey = privateKey || undefined;
      data.passphrase = passphrase || undefined;
    }

    await onSave(data);
    resetForm();
    setShowForm(false);
  };

  if (!showForm) {
    return (
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal" onClick={(e) => e.stopPropagation()}>
          <div className="modal-header">
            <h3>Credentials</h3>
            <button className="btn btn-icon" onClick={onClose}>×</button>
          </div>
          <div className="modal-body">
            {credentials.length === 0 ? (
              <p style={{ color: '#a0aec0', textAlign: 'center' }}>No credentials saved</p>
            ) : (
              <ul className="credential-list">
                {credentials.map((cred) => (
                  <li key={cred.id} className="credential-item">
                    <div className="credential-info">
                      <div className="credential-name">{cred.name}</div>
                      <div className="credential-details">
                        {cred.domain ? `${cred.domain}\\` : ''}{cred.username} ({cred.type})
                      </div>
                      {cred.autoAssignOSTypes && cred.autoAssignOSTypes.length > 0 && (
                        <div className="credential-os-tags">
                          {cred.autoAssignOSTypes.map(os => (
                            <span key={os} className="os-tag">{os}</span>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="credential-actions">
                      <button className="btn btn-sm btn-secondary" onClick={() => { onEdit(cred); setShowForm(true); }}>
                        Edit
                      </button>
                      <button className="btn btn-sm btn-danger" onClick={() => onDelete(cred.id)}>
                        Delete
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="modal-footer">
            <button className="btn btn-secondary" onClick={onClose}>
              Close
            </button>
            <button className="btn btn-primary" onClick={() => setShowForm(true)}>
              + New Credential
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{credential ? 'Edit Credential' : 'New Credential'}</h3>
          <button className="btn btn-icon" onClick={() => { resetForm(); setShowForm(false); }}>×</button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            <div className="form-group">
              <label className="form-label">Name *</label>
              <input
                type="text"
                className="form-input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="My SSH Key"
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label">Type</label>
              <select
                className="form-select"
                value={type}
                onChange={(e) => setType(e.target.value as CredentialType)}
              >
                <option value="password">Password</option>
                <option value="privateKey">SSH Private Key</option>
                <option value="domain">Domain (DOMAIN\user)</option>
                <option value="agent">SSH Agent</option>
              </select>
            </div>

            {type === 'domain' && (
              <div className="form-group">
                <label className="form-label">Domain</label>
                <input
                  type="text"
                  className="form-input"
                  value={domain}
                  onChange={(e) => setDomain(e.target.value)}
                  placeholder="MYDOMAIN"
                />
              </div>
            )}

            <div className="form-group">
              <label className="form-label">Username *</label>
              <input
                type="text"
                className="form-input"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder={type === 'domain' ? 'Administrator' : 'root'}
                required
              />
            </div>

            {(type === 'password' || type === 'domain') && (
              <div className="form-group">
                <label className="form-label">Password</label>
                <input
                  type="password"
                  className="form-input"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={credential ? '(unchanged)' : 'Enter password'}
                />
              </div>
            )}

            {type === 'privateKey' && (
              <>
                <div className="form-group">
                  <label className="form-label">Private Key</label>
                  <textarea
                    className="form-input"
                    value={privateKey}
                    onChange={(e) => setPrivateKey(e.target.value)}
                    placeholder="-----BEGIN OPENSSH PRIVATE KEY-----"
                    rows={6}
                    style={{ fontFamily: 'monospace', fontSize: '12px' }}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Passphrase (if encrypted)</label>
                  <input
                    type="password"
                    className="form-input"
                    value={passphrase}
                    onChange={(e) => setPassphrase(e.target.value)}
                    placeholder="Optional passphrase"
                  />
                </div>
              </>
            )}

            <div className="form-group">
              <label className="form-label">Auto-assign to OS Types</label>
              <p style={{ fontSize: '0.75rem', color: '#a0aec0', marginBottom: '8px' }}>
                When importing discovered hosts, automatically assign this credential to systems with these OS types
              </p>
              <div className="checkbox-group">
                {osTypeOptions.map(({ value, label }) => (
                  <label key={value} className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={autoAssignOSTypes.includes(value)}
                      onChange={() => toggleOSType(value)}
                    />
                    <span>{label}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>

          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={() => { resetForm(); setShowForm(false); }}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary">
              {credential ? 'Save Changes' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Provider Modal Component
interface ProviderModalProps {
  provider: Provider | null;
  providers: Provider[];
  onClose: () => void;
  onSave: (data: Partial<Provider>) => Promise<void>;
  onEdit: (provider: Provider) => void;
  onDelete: (id: string) => void;
  onDiscover: (provider: Provider) => void;
  isDiscovering: string | null;
}

function ProviderModal({ provider, providers, onClose, onSave, onEdit, onDelete, onDiscover, isDiscovering }: ProviderModalProps) {
  const [showForm, setShowForm] = useState(!!provider);
  const [name, setName] = useState(provider?.name || '');
  const [type, setType] = useState<ProviderType>(provider?.type || 'esxi');
  const [host, setHost] = useState((provider?.config as any)?.host || '');
  const [port, setPort] = useState((provider?.config as any)?.port || (type === 'esxi' ? 443 : type === 'proxmox' ? 8006 : 443));
  const [username, setUsername] = useState((provider?.config as any)?.username || '');
  const [password, setPassword] = useState('');
  const [realm, setRealm] = useState((provider?.config as any)?.realm || 'pam');
  const [ignoreCertErrors, setIgnoreCertErrors] = useState((provider?.config as any)?.ignoreCertErrors ?? true);
  const [enabled, setEnabled] = useState(provider?.enabled ?? true);

  const providerTypes: { value: ProviderType; label: string; defaultPort: number }[] = [
    { value: 'esxi', label: 'VMware ESXi / vSphere', defaultPort: 443 },
    { value: 'proxmox', label: 'Proxmox VE', defaultPort: 8006 },
    { value: 'aws', label: 'AWS (Coming Soon)', defaultPort: 443 },
    { value: 'gcp', label: 'Google Cloud (Coming Soon)', defaultPort: 443 },
    { value: 'azure', label: 'Azure (Coming Soon)', defaultPort: 443 },
  ];

  useEffect(() => {
    const providerType = providerTypes.find(p => p.value === type);
    if (providerType && !provider) {
      setPort(providerType.defaultPort);
    }
  }, [type]);

  const resetForm = () => {
    setName('');
    setType('esxi');
    setHost('');
    setPort(443);
    setUsername('');
    setPassword('');
    setRealm('pam');
    setIgnoreCertErrors(true);
    setEnabled(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const config: any = {
      type,
      host,
      port,
      username,
      ignoreCertErrors,
    };

    if (password) {
      config.password = password;
    }

    if (type === 'proxmox') {
      config.realm = realm;
    }

    const data: Partial<Provider> = {
      name,
      type,
      enabled,
      config,
      autoDiscover: false,
    };

    await onSave(data);
    resetForm();
    setShowForm(false);
  };

  if (!showForm) {
    return (
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal modal-lg" onClick={(e) => e.stopPropagation()}>
          <div className="modal-header">
            <h3>Providers (Hypervisors)</h3>
            <button className="btn btn-icon" onClick={onClose}>×</button>
          </div>
          <div className="modal-body">
            {providers.length === 0 ? (
              <p style={{ color: '#a0aec0', textAlign: 'center' }}>
                No providers configured. Add a hypervisor to discover and import hosts automatically.
              </p>
            ) : (
              <ul className="provider-list">
                {providers.map((prov) => (
                  <li key={prov.id} className="provider-item">
                    <div className="provider-info">
                      <div className="provider-name">
                        {prov.name}
                        <span className={`provider-badge ${prov.type}`}>{prov.type.toUpperCase()}</span>
                      </div>
                      <div className="provider-details">
                        {(prov.config as any).host}:{(prov.config as any).port}
                        {prov.lastDiscoveryAt && (
                          <span className="provider-last-scan">
                            Last scan: {new Date(prov.lastDiscoveryAt).toLocaleString()}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="provider-actions">
                      <button
                        className="btn btn-sm btn-primary"
                        onClick={() => onDiscover(prov)}
                        disabled={isDiscovering === prov.id}
                      >
                        {isDiscovering === prov.id ? 'Scanning...' : 'Import Hosts'}
                      </button>
                      <button className="btn btn-sm btn-secondary" onClick={() => { onEdit(prov); setShowForm(true); }}>
                        Edit
                      </button>
                      <button className="btn btn-sm btn-danger" onClick={() => onDelete(prov.id)}>
                        Delete
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="modal-footer">
            <button className="btn btn-secondary" onClick={onClose}>
              Close
            </button>
            <button className="btn btn-primary" onClick={() => setShowForm(true)}>
              + Add Provider
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{provider ? 'Edit Provider' : 'Add Provider'}</h3>
          <button className="btn btn-icon" onClick={() => { resetForm(); setShowForm(false); }}>×</button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            <div className="form-group">
              <label className="form-label">Name *</label>
              <input
                type="text"
                className="form-input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Production vSphere"
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label">Provider Type</label>
              <select
                className="form-select"
                value={type}
                onChange={(e) => setType(e.target.value as ProviderType)}
                disabled={!!provider}
              >
                {providerTypes.map(pt => (
                  <option key={pt.value} value={pt.value} disabled={['aws', 'gcp', 'azure'].includes(pt.value)}>
                    {pt.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-row">
              <div className="form-group" style={{ flex: 2 }}>
                <label className="form-label">Host *</label>
                <input
                  type="text"
                  className="form-input"
                  value={host}
                  onChange={(e) => setHost(e.target.value)}
                  placeholder="192.168.1.100 or vcenter.local"
                  required
                />
              </div>
              <div className="form-group" style={{ flex: 1 }}>
                <label className="form-label">Port</label>
                <input
                  type="number"
                  className="form-input"
                  value={port}
                  onChange={(e) => setPort(parseInt(e.target.value))}
                />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Username *</label>
              <input
                type="text"
                className="form-input"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder={type === 'esxi' ? 'root' : 'root@pam'}
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label">Password {provider ? '' : '*'}</label>
              <input
                type="password"
                className="form-input"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={provider ? '(unchanged)' : 'Enter password'}
                required={!provider}
              />
            </div>

            {type === 'proxmox' && (
              <div className="form-group">
                <label className="form-label">Realm</label>
                <select
                  className="form-select"
                  value={realm}
                  onChange={(e) => setRealm(e.target.value)}
                >
                  <option value="pam">PAM (Linux)</option>
                  <option value="pve">PVE (Proxmox)</option>
                  <option value="pmxceph">PMXCeph</option>
                </select>
              </div>
            )}

            <div className="form-group">
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={ignoreCertErrors}
                  onChange={(e) => setIgnoreCertErrors(e.target.checked)}
                />
                <span>Ignore SSL certificate errors</span>
              </label>
            </div>
          </div>

          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={() => { resetForm(); setShowForm(false); }}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary">
              {provider ? 'Save Changes' : 'Add Provider'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
