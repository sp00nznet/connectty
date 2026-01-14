import React, { useState, useEffect, useCallback, useRef } from 'react';
import type { ServerConnection, Credential, ConnectionGroup, SSHSessionEvent } from '@connectty/shared';
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
  const [editingConnection, setEditingConnection] = useState<ServerConnection | null>(null);
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

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
    const [conns, creds, grps] = await Promise.all([
      window.connectty.connections.list(),
      window.connectty.credentials.list(),
      window.connectty.groups.list(),
    ]);
    setConnections(conns);
    setCredentials(creds);
    setGroups(grps);
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

  const handleConnect = async (connection: ServerConnection) => {
    try {
      const sessionId = await window.connectty.ssh.connect(connection.id);

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
          <p className="subtitle">SSH Connection Manager</p>
        </div>

        <div className="sidebar-actions">
          <button className="btn btn-primary btn-sm" onClick={() => setShowConnectionModal(true)}>
            + New Connection
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

  return (
    <div
      className="connection-item"
      onDoubleClick={onConnect}
      onContextMenu={(e) => { e.preventDefault(); setShowMenu(true); }}
    >
      <span className={`status-dot ${isConnected ? 'connected' : ''}`} />
      <div className="connection-info">
        <div className="connection-name">{connection.name}</div>
        <div className="connection-host">{connection.username ? `${connection.username}@` : ''}{connection.hostname}:{connection.port}</div>
      </div>

      {showMenu && (
        <>
          <div className="modal-overlay" style={{ background: 'transparent' }} onClick={() => setShowMenu(false)} />
          <div className="context-menu" style={{ top: 'auto', right: 16 }}>
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
  const [port, setPort] = useState(connection?.port || 22);
  const [username, setUsername] = useState(connection?.username || '');
  const [credentialId, setCredentialId] = useState(connection?.credentialId || '');
  const [groupId, setGroupId] = useState(connection?.group || '');
  const [description, setDescription] = useState(connection?.description || '');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      name,
      hostname,
      port,
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
                onChange={(e) => setPort(parseInt(e.target.value) || 22)}
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
                placeholder="root"
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
                    {cred.name} ({cred.type})
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
