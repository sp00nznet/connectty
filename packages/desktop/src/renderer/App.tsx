import React, { useState, useEffect, useCallback, useRef } from 'react';
import type {
  ServerConnection,
  Credential,
  ConnectionGroup,
  SSHSessionEvent,
  ConnectionType,
  OSType,
  CredentialType,
  Provider,
  ProviderType,
  DiscoveredHost,
  SavedCommand,
  CommandExecution,
  CommandResult,
  HostFilter,
  CommandTargetOS,
} from '@connectty/shared';
import type { ConnecttyAPI, RemoteFileInfo, LocalFileInfo, TransferProgress } from '../main/preload';
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
  const [theme, setTheme] = useState(() => localStorage.getItem('connectty-theme') || 'midnight');
  const [showBulkActionsModal, setShowBulkActionsModal] = useState(false);
  const [showSFTPModal, setShowSFTPModal] = useState(false);
  const [sftpConnection, setSftpConnection] = useState<ServerConnection | null>(null);

  const terminalContainerRef = useRef<HTMLDivElement>(null);

  // Available themes
  const themes = [
    { id: 'midnight', name: 'Midnight', description: 'Default dark blue theme' },
    { id: 'light', name: 'Light', description: 'Clean light theme' },
    { id: 'dracula', name: 'Dracula', description: 'Popular dark purple theme' },
    { id: 'nord', name: 'Nord', description: 'Arctic, north-bluish palette' },
    { id: 'solarized', name: 'Solarized Dark', description: 'Precision colors for machines and people' },
    { id: 'monokai', name: 'Monokai', description: 'Sublime Text inspired' },
    { id: 'github', name: 'GitHub Dark', description: 'GitHub\'s dark mode' },
    { id: 'high-contrast', name: 'High Contrast', description: 'Maximum visibility' },
  ];

  // Apply theme to document
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('connectty-theme', theme);
  }, [theme]);

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

  const handleOpenSFTP = (connection: ServerConnection) => {
    setSftpConnection(connection);
    setShowSFTPModal(true);
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
          <div className="header-row">
            <div>
              <h1>Connectty</h1>
              <p className="subtitle">SSH &amp; RDP Connection Manager</p>
            </div>
            <div className="theme-selector">
              <select
                value={theme}
                onChange={(e) => setTheme(e.target.value)}
                title="Change theme"
              >
                {themes.map(t => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>
          </div>
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
          <button className="btn btn-secondary btn-sm" onClick={() => setShowBulkActionsModal(true)}>
            Bulk Actions
          </button>
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
                      onSFTP={() => handleOpenSFTP(conn)}
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
                    onSFTP={() => handleOpenSFTP(conn)}
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

      {/* Bulk Actions Modal */}
      {showBulkActionsModal && (
        <BulkActionsModal
          connections={connections}
          groups={groups}
          onClose={() => setShowBulkActionsModal(false)}
          onNotification={showNotification}
        />
      )}

      {/* SFTP Modal */}
      {showSFTPModal && sftpConnection && (
        <SFTPModal
          connection={sftpConnection}
          credential={sftpConnection.credentialId ? credentials.find(c => c.id === sftpConnection.credentialId) || null : null}
          onClose={() => { setShowSFTPModal(false); setSftpConnection(null); }}
          onNotification={showNotification}
        />
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
  onSFTP?: () => void;
}

function ConnectionItem({ connection, isConnected, onConnect, onEdit, onDelete, onSFTP }: ConnectionItemProps) {
  const [showMenu, setShowMenu] = useState(false);
  const [menuPosition, setMenuPosition] = useState({ x: 0, y: 0 });

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    setMenuPosition({ x: e.clientX, y: e.clientY });
    setShowMenu(true);
  };

  const isRDP = connection.connectionType === 'rdp';
  const isSSH = connection.connectionType === 'ssh';

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
            {isSSH && onSFTP && (
              <div className="context-menu-item" onClick={() => { onSFTP(); setShowMenu(false); }}>
                Open SFTP
              </div>
            )}
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
  // ESXi/Proxmox fields
  const [host, setHost] = useState((provider?.config as any)?.host || '');
  const [port, setPort] = useState((provider?.config as any)?.port || (type === 'esxi' ? 443 : type === 'proxmox' ? 8006 : 443));
  const [username, setUsername] = useState((provider?.config as any)?.username || '');
  const [password, setPassword] = useState('');
  const [realm, setRealm] = useState((provider?.config as any)?.realm || 'pam');
  const [ignoreCertErrors, setIgnoreCertErrors] = useState((provider?.config as any)?.ignoreCertErrors ?? true);
  // AWS fields
  const [accessKeyId, setAccessKeyId] = useState((provider?.config as any)?.accessKeyId || '');
  const [secretAccessKey, setSecretAccessKey] = useState('');
  const [region, setRegion] = useState((provider?.config as any)?.region || 'us-east-1');
  // GCP fields
  const [projectId, setProjectId] = useState((provider?.config as any)?.projectId || '');
  const [serviceAccountKey, setServiceAccountKey] = useState('');
  // Azure fields
  const [tenantId, setTenantId] = useState((provider?.config as any)?.tenantId || '');
  const [clientId, setClientId] = useState((provider?.config as any)?.clientId || '');
  const [clientSecret, setClientSecret] = useState('');
  const [subscriptionId, setSubscriptionId] = useState((provider?.config as any)?.subscriptionId || '');
  const [enabled, setEnabled] = useState(provider?.enabled ?? true);

  const providerTypes: { value: ProviderType; label: string; defaultPort: number }[] = [
    { value: 'esxi', label: 'VMware ESXi / vSphere', defaultPort: 443 },
    { value: 'proxmox', label: 'Proxmox VE', defaultPort: 8006 },
    { value: 'aws', label: 'Amazon Web Services (AWS)', defaultPort: 443 },
    { value: 'gcp', label: 'Google Cloud Platform (GCP)', defaultPort: 443 },
    { value: 'azure', label: 'Microsoft Azure', defaultPort: 443 },
  ];

  const awsRegions = [
    'us-east-1', 'us-east-2', 'us-west-1', 'us-west-2',
    'eu-west-1', 'eu-west-2', 'eu-west-3', 'eu-central-1', 'eu-north-1',
    'ap-northeast-1', 'ap-northeast-2', 'ap-southeast-1', 'ap-southeast-2', 'ap-south-1',
    'sa-east-1', 'ca-central-1',
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
    setAccessKeyId('');
    setSecretAccessKey('');
    setRegion('us-east-1');
    setProjectId('');
    setServiceAccountKey('');
    setTenantId('');
    setClientId('');
    setClientSecret('');
    setSubscriptionId('');
    setEnabled(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    let config: any;

    if (type === 'esxi') {
      config = {
        type: 'esxi',
        host,
        port,
        username,
        ignoreCertErrors,
      };
      if (password) config.password = password;
    } else if (type === 'proxmox') {
      config = {
        type: 'proxmox',
        host,
        port,
        username,
        realm,
        ignoreCertErrors,
      };
      if (password) config.password = password;
    } else if (type === 'aws') {
      config = {
        type: 'aws',
        accessKeyId,
        region,
      };
      if (secretAccessKey) config.secretAccessKey = secretAccessKey;
    } else if (type === 'gcp') {
      config = {
        type: 'gcp',
        projectId,
      };
      if (serviceAccountKey) config.serviceAccountKey = serviceAccountKey;
    } else if (type === 'azure') {
      config = {
        type: 'azure',
        tenantId,
        clientId,
        subscriptionId,
      };
      if (clientSecret) config.clientSecret = clientSecret;
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
                  <option key={pt.value} value={pt.value}>
                    {pt.label}
                  </option>
                ))}
              </select>
            </div>

            {/* ESXi / Proxmox Fields */}
            {(type === 'esxi' || type === 'proxmox') && (
              <>
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
              </>
            )}

            {/* AWS Fields */}
            {type === 'aws' && (
              <>
                <div className="form-group">
                  <label className="form-label">Access Key ID *</label>
                  <input
                    type="text"
                    className="form-input"
                    value={accessKeyId}
                    onChange={(e) => setAccessKeyId(e.target.value)}
                    placeholder="AKIAIOSFODNN7EXAMPLE"
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Secret Access Key {provider ? '' : '*'}</label>
                  <input
                    type="password"
                    className="form-input"
                    value={secretAccessKey}
                    onChange={(e) => setSecretAccessKey(e.target.value)}
                    placeholder={provider ? '(unchanged)' : 'Enter secret access key'}
                    required={!provider}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Region</label>
                  <select
                    className="form-select"
                    value={region}
                    onChange={(e) => setRegion(e.target.value)}
                  >
                    {awsRegions.map(r => (
                      <option key={r} value={r}>{r}</option>
                    ))}
                  </select>
                </div>

                <p style={{ fontSize: '0.75rem', color: '#a0aec0', marginTop: '-8px' }}>
                  Note: Requires @aws-sdk/client-ec2 package to be installed
                </p>
              </>
            )}

            {/* GCP Fields */}
            {type === 'gcp' && (
              <>
                <div className="form-group">
                  <label className="form-label">Project ID *</label>
                  <input
                    type="text"
                    className="form-input"
                    value={projectId}
                    onChange={(e) => setProjectId(e.target.value)}
                    placeholder="my-project-123456"
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Service Account Key (JSON)</label>
                  <textarea
                    className="form-input"
                    value={serviceAccountKey}
                    onChange={(e) => setServiceAccountKey(e.target.value)}
                    placeholder={provider ? '(unchanged - paste new key to update)' : 'Paste service account JSON key'}
                    rows={4}
                    style={{ fontFamily: 'monospace', fontSize: '11px' }}
                  />
                </div>

                <p style={{ fontSize: '0.75rem', color: '#a0aec0', marginTop: '-8px' }}>
                  Note: Requires @google-cloud/compute package to be installed
                </p>
              </>
            )}

            {/* Azure Fields */}
            {type === 'azure' && (
              <>
                <div className="form-group">
                  <label className="form-label">Tenant ID *</label>
                  <input
                    type="text"
                    className="form-input"
                    value={tenantId}
                    onChange={(e) => setTenantId(e.target.value)}
                    placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Client ID (App ID) *</label>
                  <input
                    type="text"
                    className="form-input"
                    value={clientId}
                    onChange={(e) => setClientId(e.target.value)}
                    placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Client Secret {provider ? '' : '*'}</label>
                  <input
                    type="password"
                    className="form-input"
                    value={clientSecret}
                    onChange={(e) => setClientSecret(e.target.value)}
                    placeholder={provider ? '(unchanged)' : 'Enter client secret'}
                    required={!provider}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Subscription ID *</label>
                  <input
                    type="text"
                    className="form-input"
                    value={subscriptionId}
                    onChange={(e) => setSubscriptionId(e.target.value)}
                    placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                    required
                  />
                </div>

                <p style={{ fontSize: '0.75rem', color: '#a0aec0', marginTop: '-8px' }}>
                  Note: Requires @azure/arm-compute, @azure/arm-network, and @azure/identity packages
                </p>
              </>
            )}
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

// Bulk Actions Modal Component
interface BulkActionsModalProps {
  connections: ServerConnection[];
  groups: ConnectionGroup[];
  onClose: () => void;
  onNotification: (type: 'success' | 'error', message: string) => void;
}

function BulkActionsModal({ connections, groups, onClose, onNotification }: BulkActionsModalProps) {
  // Tab state
  const [activeTab, setActiveTab] = useState<'execute' | 'saved' | 'history'>('execute');

  // Host selection state
  const [filterType, setFilterType] = useState<HostFilter['type']>('all');
  const [selectedGroupId, setSelectedGroupId] = useState('');
  const [hostnamePattern, setHostnamePattern] = useState('');
  const [selectedConnectionIds, setSelectedConnectionIds] = useState<string[]>([]);
  const [selectedOsType, setSelectedOsType] = useState<OSType | ''>('');

  // Command state
  const [commandMode, setCommandMode] = useState<'inline' | 'saved' | 'script'>('inline');
  const [inlineCommand, setInlineCommand] = useState('');
  const [targetOS, setTargetOS] = useState<CommandTargetOS>('all');
  const [savedCommands, setSavedCommands] = useState<SavedCommand[]>([]);
  const [selectedCommandId, setSelectedCommandId] = useState('');
  const [scriptContent, setScriptContent] = useState('');
  const [scriptLanguage, setScriptLanguage] = useState<'bash' | 'powershell' | 'python'>('bash');

  // Execution state
  const [isExecuting, setIsExecuting] = useState(false);
  const [currentExecution, setCurrentExecution] = useState<CommandExecution | null>(null);
  const [executionResults, setExecutionResults] = useState<Map<string, Partial<CommandResult>>>(new Map());

  // History state
  const [commandHistory, setCommandHistory] = useState<CommandExecution[]>([]);

  // Saved command form state
  const [showCommandForm, setShowCommandForm] = useState(false);
  const [editingCommand, setEditingCommand] = useState<SavedCommand | null>(null);
  const [commandName, setCommandName] = useState('');
  const [commandDescription, setCommandDescription] = useState('');
  const [commandCategory, setCommandCategory] = useState('');

  // Load saved commands and history
  useEffect(() => {
    loadSavedCommands();
    loadHistory();

    // Subscribe to execution progress
    const unsubProgress = window.connectty.commands.onProgress((execId, connId, result) => {
      if (currentExecution?.id === execId) {
        setExecutionResults(prev => new Map(prev).set(connId, result));
      }
    });

    const unsubComplete = window.connectty.commands.onComplete((execId) => {
      if (currentExecution?.id === execId) {
        setIsExecuting(false);
        loadHistory();
        onNotification('success', 'Command execution completed');
      }
    });

    return () => {
      unsubProgress();
      unsubComplete();
    };
  }, [currentExecution?.id]);

  const loadSavedCommands = async () => {
    const commands = await window.connectty.commands.list();
    setSavedCommands(commands);
  };

  const loadHistory = async () => {
    const history = await window.connectty.commands.history(20);
    setCommandHistory(history);
  };

  // Build filter from selections
  const buildFilter = (): HostFilter => {
    switch (filterType) {
      case 'all':
        return { type: 'all' };
      case 'group':
        return { type: 'group', groupId: selectedGroupId };
      case 'pattern':
        return { type: 'pattern', pattern: hostnamePattern };
      case 'selection':
        return { type: 'selection', connectionIds: selectedConnectionIds };
      case 'os':
        return { type: 'os', osType: selectedOsType as OSType };
      default:
        return { type: 'all' };
    }
  };

  // Get filtered connections for preview
  const getFilteredConnections = (): ServerConnection[] => {
    let filtered = [...connections];

    switch (filterType) {
      case 'group':
        filtered = filtered.filter(c => c.group === selectedGroupId);
        break;
      case 'pattern':
        if (hostnamePattern) {
          const regex = new RegExp(hostnamePattern.replace(/\*/g, '.*'), 'i');
          filtered = filtered.filter(c => regex.test(c.hostname) || regex.test(c.name));
        }
        break;
      case 'selection':
        filtered = filtered.filter(c => selectedConnectionIds.includes(c.id));
        break;
      case 'os':
        if (selectedOsType) {
          filtered = filtered.filter(c => c.osType === selectedOsType);
        }
        break;
    }

    // Further filter by target OS
    if (targetOS !== 'all') {
      const isWindowsTarget = targetOS === 'windows';
      filtered = filtered.filter(c => (c.osType === 'windows') === isWindowsTarget);
    }

    return filtered;
  };

  const toggleConnectionSelection = (id: string) => {
    setSelectedConnectionIds(prev =>
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const handleExecute = async () => {
    let command = '';
    let commandName = 'Ad-hoc Command';

    if (commandMode === 'inline') {
      command = inlineCommand;
    } else if (commandMode === 'saved' && selectedCommandId) {
      const savedCommand = savedCommands.find(c => c.id === selectedCommandId);
      if (savedCommand) {
        command = savedCommand.command || savedCommand.scriptContent || '';
        commandName = savedCommand.name;
      }
    } else if (commandMode === 'script') {
      command = scriptContent;
      commandName = 'Script Execution';
    }

    if (!command.trim()) {
      onNotification('error', 'Please enter a command');
      return;
    }

    setIsExecuting(true);
    setExecutionResults(new Map());

    try {
      const result = await window.connectty.commands.execute({
        commandId: commandMode === 'saved' ? selectedCommandId : undefined,
        commandName,
        command,
        targetOS,
        filter: buildFilter(),
      });

      if ('error' in result) {
        onNotification('error', result.error);
        setIsExecuting(false);
      } else {
        // Fetch the execution to track progress
        const execution = await window.connectty.commands.getExecution(result.executionId);
        setCurrentExecution(execution);
        onNotification('success', `Executing command on ${result.targetCount} hosts...`);
      }
    } catch (err) {
      onNotification('error', `Execution failed: ${(err as Error).message}`);
      setIsExecuting(false);
    }
  };

  const handleCancelExecution = async () => {
    if (currentExecution) {
      await window.connectty.commands.cancel(currentExecution.id);
      setIsExecuting(false);
      onNotification('success', 'Execution cancelled');
    }
  };

  const handleSaveCommand = async () => {
    const data = {
      name: commandName,
      description: commandDescription || undefined,
      type: commandMode === 'script' ? 'script' : 'inline' as const,
      targetOS,
      command: commandMode === 'inline' ? inlineCommand : undefined,
      scriptContent: commandMode === 'script' ? scriptContent : undefined,
      scriptLanguage: commandMode === 'script' ? scriptLanguage : undefined,
      category: commandCategory || undefined,
    };

    try {
      if (editingCommand) {
        await window.connectty.commands.update(editingCommand.id, data);
        onNotification('success', 'Command updated');
      } else {
        await window.connectty.commands.create(data);
        onNotification('success', 'Command saved');
      }
      await loadSavedCommands();
      setShowCommandForm(false);
      setEditingCommand(null);
      setCommandName('');
      setCommandDescription('');
      setCommandCategory('');
    } catch (err) {
      onNotification('error', `Failed to save: ${(err as Error).message}`);
    }
  };

  const handleDeleteCommand = async (id: string) => {
    if (confirm('Delete this saved command?')) {
      await window.connectty.commands.delete(id);
      await loadSavedCommands();
      onNotification('success', 'Command deleted');
    }
  };

  const filteredConnections = getFilteredConnections();

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-xl" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Bulk Actions</h3>
          <button className="btn btn-icon" onClick={onClose}>×</button>
        </div>

        {/* Tabs */}
        <div className="modal-tabs">
          <button
            className={`tab-btn ${activeTab === 'execute' ? 'active' : ''}`}
            onClick={() => setActiveTab('execute')}
          >
            Execute Command
          </button>
          <button
            className={`tab-btn ${activeTab === 'saved' ? 'active' : ''}`}
            onClick={() => setActiveTab('saved')}
          >
            Saved Commands ({savedCommands.length})
          </button>
          <button
            className={`tab-btn ${activeTab === 'history' ? 'active' : ''}`}
            onClick={() => setActiveTab('history')}
          >
            History
          </button>
        </div>

        <div className="modal-body" style={{ maxHeight: '70vh', overflow: 'auto' }}>
          {/* Execute Tab */}
          {activeTab === 'execute' && (
            <div className="bulk-execute-content">
              {/* Host Selection */}
              <div className="bulk-section">
                <h4>Select Hosts</h4>
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Filter By</label>
                    <select
                      className="form-select"
                      value={filterType}
                      onChange={(e) => setFilterType(e.target.value as HostFilter['type'])}
                    >
                      <option value="all">All Connections</option>
                      <option value="group">By Group</option>
                      <option value="pattern">By Hostname Pattern</option>
                      <option value="selection">Individual Selection</option>
                      <option value="os">By OS Type</option>
                    </select>
                  </div>

                  {filterType === 'group' && (
                    <div className="form-group">
                      <label className="form-label">Group</label>
                      <select
                        className="form-select"
                        value={selectedGroupId}
                        onChange={(e) => setSelectedGroupId(e.target.value)}
                      >
                        <option value="">Select a group...</option>
                        {groups.map(g => (
                          <option key={g.id} value={g.id}>{g.name}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  {filterType === 'pattern' && (
                    <div className="form-group">
                      <label className="form-label">Hostname Pattern</label>
                      <input
                        type="text"
                        className="form-input"
                        value={hostnamePattern}
                        onChange={(e) => setHostnamePattern(e.target.value)}
                        placeholder="web-*, *-prod-*, 192.168.1.*"
                      />
                    </div>
                  )}

                  {filterType === 'os' && (
                    <div className="form-group">
                      <label className="form-label">OS Type</label>
                      <select
                        className="form-select"
                        value={selectedOsType}
                        onChange={(e) => setSelectedOsType(e.target.value as OSType)}
                      >
                        <option value="">All</option>
                        <option value="linux">Linux</option>
                        <option value="windows">Windows</option>
                        <option value="unix">Unix</option>
                        <option value="esxi">ESXi</option>
                      </select>
                    </div>
                  )}
                </div>

                {filterType === 'selection' && (
                  <div className="connection-picker">
                    {connections.map(conn => (
                      <label key={conn.id} className="connection-pick-item">
                        <input
                          type="checkbox"
                          checked={selectedConnectionIds.includes(conn.id)}
                          onChange={() => toggleConnectionSelection(conn.id)}
                        />
                        <span className="connection-pick-name">{conn.name}</span>
                        <span className="connection-pick-host">{conn.hostname}</span>
                        <span className={`os-badge ${conn.osType || 'unknown'}`}>
                          {conn.osType || 'unknown'}
                        </span>
                      </label>
                    ))}
                  </div>
                )}

                <div className="host-preview">
                  <strong>{filteredConnections.length}</strong> hosts selected
                  {filteredConnections.length > 0 && filteredConnections.length <= 10 && (
                    <span className="preview-list">
                      : {filteredConnections.map(c => c.name).join(', ')}
                    </span>
                  )}
                </div>
              </div>

              {/* Command Input */}
              <div className="bulk-section">
                <h4>Command</h4>
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Command Mode</label>
                    <select
                      className="form-select"
                      value={commandMode}
                      onChange={(e) => setCommandMode(e.target.value as 'inline' | 'saved' | 'script')}
                    >
                      <option value="inline">Inline Command</option>
                      <option value="saved">Saved Command</option>
                      <option value="script">Script</option>
                    </select>
                  </div>

                  <div className="form-group">
                    <label className="form-label">Target OS</label>
                    <select
                      className="form-select"
                      value={targetOS}
                      onChange={(e) => setTargetOS(e.target.value as CommandTargetOS)}
                    >
                      <option value="all">All (Linux + Windows)</option>
                      <option value="linux">Linux/Unix Only</option>
                      <option value="windows">Windows Only</option>
                    </select>
                  </div>
                </div>

                {commandMode === 'inline' && (
                  <div className="form-group">
                    <label className="form-label">Command</label>
                    <textarea
                      className="form-input command-input"
                      value={inlineCommand}
                      onChange={(e) => setInlineCommand(e.target.value)}
                      placeholder="Enter command to execute (e.g., uptime, df -h, whoami)"
                      rows={3}
                    />
                  </div>
                )}

                {commandMode === 'saved' && (
                  <div className="form-group">
                    <label className="form-label">Select Command</label>
                    <select
                      className="form-select"
                      value={selectedCommandId}
                      onChange={(e) => setSelectedCommandId(e.target.value)}
                    >
                      <option value="">Choose a saved command...</option>
                      {savedCommands.map(cmd => (
                        <option key={cmd.id} value={cmd.id}>
                          {cmd.name} ({cmd.targetOS})
                        </option>
                      ))}
                    </select>
                    {selectedCommandId && (
                      <div className="command-preview">
                        <pre>{savedCommands.find(c => c.id === selectedCommandId)?.command}</pre>
                      </div>
                    )}
                  </div>
                )}

                {commandMode === 'script' && (
                  <>
                    <div className="form-group">
                      <label className="form-label">Script Language</label>
                      <select
                        className="form-select"
                        value={scriptLanguage}
                        onChange={(e) => setScriptLanguage(e.target.value as 'bash' | 'powershell' | 'python')}
                      >
                        <option value="bash">Bash</option>
                        <option value="powershell">PowerShell</option>
                        <option value="python">Python</option>
                      </select>
                    </div>
                    <div className="form-group">
                      <label className="form-label">Script Content</label>
                      <textarea
                        className="form-input script-input"
                        value={scriptContent}
                        onChange={(e) => setScriptContent(e.target.value)}
                        placeholder="#!/bin/bash&#10;# Enter your script here"
                        rows={10}
                      />
                    </div>
                  </>
                )}

                <div className="form-row" style={{ justifyContent: 'flex-end', gap: '8px' }}>
                  {(commandMode === 'inline' || commandMode === 'script') && inlineCommand && (
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => {
                        setShowCommandForm(true);
                        setCommandName('');
                      }}
                    >
                      Save as...
                    </button>
                  )}
                </div>
              </div>

              {/* Execution Results */}
              {(isExecuting || executionResults.size > 0) && (
                <div className="bulk-section">
                  <h4>Execution Progress</h4>
                  <div className="execution-results">
                    {filteredConnections.map(conn => {
                      const result = executionResults.get(conn.id);
                      return (
                        <div key={conn.id} className={`result-item ${result?.status || 'pending'}`}>
                          <div className="result-header">
                            <span className="result-host">{conn.name}</span>
                            <span className={`result-status ${result?.status || 'pending'}`}>
                              {result?.status || 'pending'}
                            </span>
                          </div>
                          {result?.stdout && (
                            <pre className="result-output">{result.stdout}</pre>
                          )}
                          {result?.stderr && (
                            <pre className="result-error">{result.stderr}</pre>
                          )}
                          {result?.error && (
                            <div className="result-error">{result.error}</div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Saved Commands Tab */}
          {activeTab === 'saved' && (
            <div className="saved-commands-content">
              {!showCommandForm ? (
                <>
                  {savedCommands.length === 0 ? (
                    <p style={{ textAlign: 'center', color: '#a0aec0' }}>
                      No saved commands. Create one to reuse it later.
                    </p>
                  ) : (
                    <div className="saved-commands-list">
                      {savedCommands.map(cmd => (
                        <div key={cmd.id} className="saved-command-item">
                          <div className="saved-command-info">
                            <div className="saved-command-name">{cmd.name}</div>
                            <div className="saved-command-meta">
                              <span className={`os-badge ${cmd.targetOS}`}>{cmd.targetOS}</span>
                              {cmd.category && <span className="category-badge">{cmd.category}</span>}
                            </div>
                            {cmd.description && (
                              <div className="saved-command-desc">{cmd.description}</div>
                            )}
                            <pre className="saved-command-preview">
                              {cmd.command || cmd.scriptContent}
                            </pre>
                          </div>
                          <div className="saved-command-actions">
                            <button
                              className="btn btn-sm btn-primary"
                              onClick={() => {
                                setCommandMode('saved');
                                setSelectedCommandId(cmd.id);
                                setActiveTab('execute');
                              }}
                            >
                              Use
                            </button>
                            <button
                              className="btn btn-sm btn-secondary"
                              onClick={() => {
                                setEditingCommand(cmd);
                                setCommandName(cmd.name);
                                setCommandDescription(cmd.description || '');
                                setCommandCategory(cmd.category || '');
                                setInlineCommand(cmd.command || '');
                                setScriptContent(cmd.scriptContent || '');
                                setTargetOS(cmd.targetOS);
                                setCommandMode(cmd.type === 'script' ? 'script' : 'inline');
                                setShowCommandForm(true);
                              }}
                            >
                              Edit
                            </button>
                            <button
                              className="btn btn-sm btn-danger"
                              onClick={() => handleDeleteCommand(cmd.id)}
                            >
                              Delete
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <div className="command-form">
                  <h4>{editingCommand ? 'Edit Command' : 'Save Command'}</h4>
                  <div className="form-group">
                    <label className="form-label">Name *</label>
                    <input
                      type="text"
                      className="form-input"
                      value={commandName}
                      onChange={(e) => setCommandName(e.target.value)}
                      placeholder="e.g., Check Disk Space"
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Description</label>
                    <input
                      type="text"
                      className="form-input"
                      value={commandDescription}
                      onChange={(e) => setCommandDescription(e.target.value)}
                      placeholder="Optional description"
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Category</label>
                    <input
                      type="text"
                      className="form-input"
                      value={commandCategory}
                      onChange={(e) => setCommandCategory(e.target.value)}
                      placeholder="e.g., monitoring, user-management"
                    />
                  </div>
                  <div className="form-row">
                    <button
                      className="btn btn-secondary"
                      onClick={() => {
                        setShowCommandForm(false);
                        setEditingCommand(null);
                      }}
                    >
                      Cancel
                    </button>
                    <button
                      className="btn btn-primary"
                      onClick={handleSaveCommand}
                      disabled={!commandName}
                    >
                      {editingCommand ? 'Update' : 'Save'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* History Tab */}
          {activeTab === 'history' && (
            <div className="history-content">
              {commandHistory.length === 0 ? (
                <p style={{ textAlign: 'center', color: '#a0aec0' }}>
                  No command history yet.
                </p>
              ) : (
                <div className="history-list">
                  {commandHistory.map(exec => (
                    <div key={exec.id} className={`history-item ${exec.status}`}>
                      <div className="history-header">
                        <span className="history-name">{exec.commandName}</span>
                        <span className={`history-status ${exec.status}`}>{exec.status}</span>
                        <span className="history-time">
                          {new Date(exec.startedAt).toLocaleString()}
                        </span>
                      </div>
                      <div className="history-details">
                        <span>{exec.connectionIds.length} hosts</span>
                        <span className={`os-badge ${exec.targetOS}`}>{exec.targetOS}</span>
                      </div>
                      <pre className="history-command">{exec.command}</pre>
                      {exec.results && exec.results.length > 0 && (
                        <div className="history-results-summary">
                          <span className="success">
                            {exec.results.filter(r => r.status === 'success').length} success
                          </span>
                          <span className="error">
                            {exec.results.filter(r => r.status === 'error').length} failed
                          </span>
                          <span className="skipped">
                            {exec.results.filter(r => r.status === 'skipped').length} skipped
                          </span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>
            Close
          </button>
          {activeTab === 'execute' && (
            <>
              {isExecuting ? (
                <button className="btn btn-danger" onClick={handleCancelExecution}>
                  Cancel Execution
                </button>
              ) : (
                <button
                  className="btn btn-primary"
                  onClick={handleExecute}
                  disabled={filteredConnections.length === 0}
                >
                  Execute on {filteredConnections.length} Hosts
                </button>
              )}
            </>
          )}
          {activeTab === 'saved' && !showCommandForm && (
            <button className="btn btn-primary" onClick={() => setShowCommandForm(true)}>
              + New Command
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// SFTP Modal Component
interface SFTPModalProps {
  connection: ServerConnection;
  credential: Credential | null;
  onClose: () => void;
  onNotification: (type: 'success' | 'error', message: string) => void;
}

function SFTPModal({ connection, credential, onClose, onNotification }: SFTPModalProps) {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Local file browser state
  const [localPath, setLocalPath] = useState('');
  const [localFiles, setLocalFiles] = useState<LocalFileInfo[]>([]);
  const [localLoading, setLocalLoading] = useState(false);
  const [selectedLocalFiles, setSelectedLocalFiles] = useState<Set<string>>(new Set());

  // Remote file browser state
  const [remotePath, setRemotePath] = useState('/');
  const [remoteFiles, setRemoteFiles] = useState<RemoteFileInfo[]>([]);
  const [remoteLoading, setRemoteLoading] = useState(false);
  const [selectedRemoteFiles, setSelectedRemoteFiles] = useState<Set<string>>(new Set());

  // Transfer state
  const [transfers, setTransfers] = useState<TransferProgress[]>([]);

  // Connect on mount
  useEffect(() => {
    connectSFTP();
    loadLocalHomePath();

    // Subscribe to transfer progress
    const unsubscribe = window.connectty.sftp.onProgress((progress) => {
      setTransfers(prev => {
        const existing = prev.findIndex(t => t.transferId === progress.transferId);
        if (existing >= 0) {
          const updated = [...prev];
          updated[existing] = progress;
          return updated;
        }
        return [...prev, progress];
      });

      if (progress.status === 'completed') {
        onNotification('success', `${progress.direction === 'upload' ? 'Uploaded' : 'Downloaded'}: ${progress.filename}`);
        // Refresh the directory that received the file
        if (progress.direction === 'upload' && sessionId) {
          loadRemoteDirectory(remotePath);
        } else if (progress.direction === 'download') {
          loadLocalDirectory(localPath);
        }
      } else if (progress.status === 'error') {
        onNotification('error', `Transfer failed: ${progress.error}`);
      }
    });

    return () => {
      unsubscribe();
      if (sessionId) {
        window.connectty.sftp.disconnect(sessionId);
      }
    };
  }, []);

  // Reload directories when session connects
  useEffect(() => {
    if (sessionId) {
      loadRemoteDirectory(remotePath);
    }
  }, [sessionId]);

  // Reload local directory when path changes
  useEffect(() => {
    if (localPath) {
      loadLocalDirectory(localPath);
    }
  }, [localPath]);

  const connectSFTP = async () => {
    try {
      setIsConnecting(true);
      setError(null);
      const id = await window.connectty.sftp.connect(connection.id);
      setSessionId(id);
      onNotification('success', `SFTP connected to ${connection.name}`);
    } catch (err) {
      setError((err as Error).message);
      onNotification('error', `SFTP connection failed: ${(err as Error).message}`);
    } finally {
      setIsConnecting(false);
    }
  };

  const loadLocalHomePath = async () => {
    const home = await window.connectty.sftp.homePath();
    setLocalPath(home);
  };

  const loadLocalDirectory = async (path: string) => {
    try {
      setLocalLoading(true);
      const files = await window.connectty.sftp.listLocal(path);
      setLocalFiles(files);
      setSelectedLocalFiles(new Set());
    } catch (err) {
      onNotification('error', `Failed to read local directory: ${(err as Error).message}`);
    } finally {
      setLocalLoading(false);
    }
  };

  const loadRemoteDirectory = async (path: string) => {
    if (!sessionId) return;
    try {
      setRemoteLoading(true);
      const files = await window.connectty.sftp.listRemote(sessionId, path);
      setRemoteFiles(files);
      setRemotePath(path);
      setSelectedRemoteFiles(new Set());
    } catch (err) {
      onNotification('error', `Failed to read remote directory: ${(err as Error).message}`);
    } finally {
      setRemoteLoading(false);
    }
  };

  const navigateLocal = (file: LocalFileInfo) => {
    if (file.isDirectory) {
      setLocalPath(file.path);
    }
  };

  const navigateLocalUp = () => {
    const parent = localPath.split(/[/\\]/).slice(0, -1).join('/') || '/';
    setLocalPath(parent);
  };

  const navigateRemote = (file: RemoteFileInfo) => {
    if (file.isDirectory) {
      loadRemoteDirectory(file.path);
    }
  };

  const navigateRemoteUp = () => {
    const parent = remotePath.split('/').slice(0, -1).join('/') || '/';
    loadRemoteDirectory(parent);
  };

  const handleUpload = async () => {
    if (!sessionId || selectedLocalFiles.size === 0) return;

    for (const filePath of selectedLocalFiles) {
      const file = localFiles.find(f => f.path === filePath);
      if (file && !file.isDirectory) {
        const remoteFilePath = `${remotePath}/${file.name}`.replace(/\/+/g, '/');
        try {
          await window.connectty.sftp.upload(sessionId, file.path, remoteFilePath);
        } catch (err) {
          onNotification('error', `Upload failed: ${(err as Error).message}`);
        }
      }
    }
    loadRemoteDirectory(remotePath);
  };

  const handleDownload = async () => {
    if (!sessionId || selectedRemoteFiles.size === 0) return;

    for (const filePath of selectedRemoteFiles) {
      const file = remoteFiles.find(f => f.path === filePath);
      if (file && !file.isDirectory) {
        const localFilePath = `${localPath}/${file.name}`.replace(/\/+/g, '/');
        try {
          await window.connectty.sftp.download(sessionId, file.path, localFilePath);
        } catch (err) {
          onNotification('error', `Download failed: ${(err as Error).message}`);
        }
      }
    }
    loadLocalDirectory(localPath);
  };

  const handleSelectLocalFolder = async () => {
    const path = await window.connectty.sftp.selectLocalFolder();
    if (path) {
      setLocalPath(path);
    }
  };

  const toggleLocalSelection = (path: string) => {
    setSelectedLocalFiles(prev => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  };

  const toggleRemoteSelection = (path: string) => {
    setSelectedRemoteFiles(prev => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '-';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const formatDate = (date: Date): string => {
    return new Date(date).toLocaleDateString();
  };

  const handleCreateRemoteFolder = async () => {
    if (!sessionId) return;
    const name = prompt('Enter folder name:');
    if (name) {
      try {
        await window.connectty.sftp.mkdir(sessionId, `${remotePath}/${name}`);
        loadRemoteDirectory(remotePath);
        onNotification('success', `Created folder: ${name}`);
      } catch (err) {
        onNotification('error', `Failed to create folder: ${(err as Error).message}`);
      }
    }
  };

  const handleDeleteRemote = async () => {
    if (!sessionId || selectedRemoteFiles.size === 0) return;
    if (!confirm(`Delete ${selectedRemoteFiles.size} selected item(s)?`)) return;

    for (const filePath of selectedRemoteFiles) {
      const file = remoteFiles.find(f => f.path === filePath);
      if (file) {
        try {
          if (file.isDirectory) {
            await window.connectty.sftp.rmdir(sessionId, file.path);
          } else {
            await window.connectty.sftp.unlink(sessionId, file.path);
          }
        } catch (err) {
          onNotification('error', `Failed to delete ${file.name}: ${(err as Error).message}`);
        }
      }
    }
    loadRemoteDirectory(remotePath);
    onNotification('success', 'Deleted selected items');
  };

  const handleRefresh = () => {
    loadLocalDirectory(localPath);
    if (sessionId) {
      loadRemoteDirectory(remotePath);
    }
  };

  if (isConnecting) {
    return (
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal modal-xl" onClick={(e) => e.stopPropagation()}>
          <div className="modal-header">
            <h3>SFTP - {connection.name}</h3>
            <button className="btn btn-icon" onClick={onClose}>×</button>
          </div>
          <div className="modal-body sftp-connecting">
            <div className="sftp-loading">
              <div className="spinner"></div>
              <p>Connecting to {connection.hostname}...</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal" onClick={(e) => e.stopPropagation()}>
          <div className="modal-header">
            <h3>SFTP - {connection.name}</h3>
            <button className="btn btn-icon" onClick={onClose}>×</button>
          </div>
          <div className="modal-body">
            <div className="sftp-error">
              <p>Connection failed:</p>
              <p className="error-message">{error}</p>
              <button className="btn btn-primary" onClick={connectSFTP}>
                Retry
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-fullscreen" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>SFTP - {connection.name}</h3>
          <div className="sftp-header-actions">
            <button className="btn btn-sm btn-secondary" onClick={handleRefresh}>
              Refresh
            </button>
            <button className="btn btn-icon" onClick={onClose}>×</button>
          </div>
        </div>

        <div className="modal-body sftp-body">
          {/* Transfer Actions Bar */}
          <div className="sftp-actions-bar">
            <button
              className="btn btn-primary btn-sm"
              onClick={handleUpload}
              disabled={selectedLocalFiles.size === 0}
            >
              Upload →
            </button>
            <button
              className="btn btn-primary btn-sm"
              onClick={handleDownload}
              disabled={selectedRemoteFiles.size === 0}
            >
              ← Download
            </button>
          </div>

          <div className="sftp-panels">
            {/* Local Panel */}
            <div className="sftp-panel local-panel">
              <div className="sftp-panel-header">
                <h4>Local</h4>
                <button className="btn btn-sm btn-secondary" onClick={handleSelectLocalFolder}>
                  Browse...
                </button>
              </div>
              <div className="sftp-path-bar">
                <button className="btn btn-sm btn-icon" onClick={navigateLocalUp} title="Go up">
                  ↑
                </button>
                <input
                  type="text"
                  className="form-input sftp-path-input"
                  value={localPath}
                  onChange={(e) => setLocalPath(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && loadLocalDirectory(localPath)}
                />
              </div>
              <div className="sftp-file-list">
                {localLoading ? (
                  <div className="sftp-loading-inline">Loading...</div>
                ) : (
                  <table className="sftp-table">
                    <thead>
                      <tr>
                        <th></th>
                        <th>Name</th>
                        <th>Size</th>
                        <th>Modified</th>
                      </tr>
                    </thead>
                    <tbody>
                      {localFiles.map(file => (
                        <tr
                          key={file.path}
                          className={`sftp-file-row ${selectedLocalFiles.has(file.path) ? 'selected' : ''}`}
                          onClick={() => toggleLocalSelection(file.path)}
                          onDoubleClick={() => navigateLocal(file)}
                        >
                          <td className="sftp-checkbox">
                            <input
                              type="checkbox"
                              checked={selectedLocalFiles.has(file.path)}
                              onChange={() => toggleLocalSelection(file.path)}
                              onClick={(e) => e.stopPropagation()}
                            />
                          </td>
                          <td className="sftp-filename">
                            <span className={`file-icon ${file.isDirectory ? 'folder' : 'file'}`}>
                              {file.isDirectory ? '📁' : '📄'}
                            </span>
                            {file.name}
                          </td>
                          <td className="sftp-filesize">{file.isDirectory ? '-' : formatFileSize(file.size)}</td>
                          <td className="sftp-filedate">{formatDate(file.modifiedAt)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>

            {/* Remote Panel */}
            <div className="sftp-panel remote-panel">
              <div className="sftp-panel-header">
                <h4>Remote ({connection.hostname})</h4>
                <div className="sftp-panel-actions">
                  <button className="btn btn-sm btn-secondary" onClick={handleCreateRemoteFolder}>
                    New Folder
                  </button>
                  <button
                    className="btn btn-sm btn-danger"
                    onClick={handleDeleteRemote}
                    disabled={selectedRemoteFiles.size === 0}
                  >
                    Delete
                  </button>
                </div>
              </div>
              <div className="sftp-path-bar">
                <button className="btn btn-sm btn-icon" onClick={navigateRemoteUp} title="Go up">
                  ↑
                </button>
                <input
                  type="text"
                  className="form-input sftp-path-input"
                  value={remotePath}
                  onChange={(e) => setRemotePath(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && loadRemoteDirectory(remotePath)}
                />
              </div>
              <div className="sftp-file-list">
                {remoteLoading ? (
                  <div className="sftp-loading-inline">Loading...</div>
                ) : (
                  <table className="sftp-table">
                    <thead>
                      <tr>
                        <th></th>
                        <th>Name</th>
                        <th>Size</th>
                        <th>Permissions</th>
                        <th>Modified</th>
                      </tr>
                    </thead>
                    <tbody>
                      {remoteFiles.map(file => (
                        <tr
                          key={file.path}
                          className={`sftp-file-row ${selectedRemoteFiles.has(file.path) ? 'selected' : ''}`}
                          onClick={() => toggleRemoteSelection(file.path)}
                          onDoubleClick={() => navigateRemote(file)}
                        >
                          <td className="sftp-checkbox">
                            <input
                              type="checkbox"
                              checked={selectedRemoteFiles.has(file.path)}
                              onChange={() => toggleRemoteSelection(file.path)}
                              onClick={(e) => e.stopPropagation()}
                            />
                          </td>
                          <td className="sftp-filename">
                            <span className={`file-icon ${file.isDirectory ? 'folder' : 'file'}`}>
                              {file.isDirectory ? '📁' : file.isSymlink ? '🔗' : '📄'}
                            </span>
                            {file.name}
                          </td>
                          <td className="sftp-filesize">{file.isDirectory ? '-' : formatFileSize(file.size)}</td>
                          <td className="sftp-permissions">{file.permissions}</td>
                          <td className="sftp-filedate">{formatDate(file.modifiedAt)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </div>

          {/* Transfer Progress */}
          {transfers.filter(t => t.status === 'transferring').length > 0 && (
            <div className="sftp-transfers">
              <h4>Transfers</h4>
              {transfers.filter(t => t.status === 'transferring').map(transfer => (
                <div key={transfer.transferId} className="sftp-transfer-item">
                  <span className="transfer-filename">{transfer.filename}</span>
                  <span className="transfer-direction">{transfer.direction === 'upload' ? '↑' : '↓'}</span>
                  <div className="transfer-progress">
                    <div
                      className="transfer-progress-bar"
                      style={{ width: `${transfer.percentage}%` }}
                    />
                  </div>
                  <span className="transfer-percent">{transfer.percentage}%</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
