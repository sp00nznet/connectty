import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import { WebLinksAddon } from 'xterm-addon-web-links';
import 'xterm/css/xterm.css';
import type { ServerConnection, Credential, ConnectionGroup, User, SSHSessionEvent } from '@connectty/shared';
import { api } from '../services/api';
import { wsService } from '../services/websocket';
import ConnectionModal from './ConnectionModal';
import ProviderPanel from './ProviderPanel';
import BulkCommandPanel from './BulkCommandPanel';
import ImportExportModal from './ImportExportModal';
import SFTPPanel from './SFTPPanel';

type MainView = 'terminal' | 'providers' | 'commands' | 'sftp';

interface DashboardProps {
  user: User;
  onLogout: () => void;
}

interface SSHSession {
  id: string;
  connectionId: string;
  connectionName: string;
  terminal: Terminal;
  fitAddon: FitAddon;
}

export default function Dashboard({ user, onLogout }: DashboardProps) {
  const [connections, setConnections] = useState<ServerConnection[]>([]);
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [groups, setGroups] = useState<ConnectionGroup[]>([]);
  const [sessions, setSessions] = useState<SSHSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showConnectionModal, setShowConnectionModal] = useState(false);
  const [editingConnection, setEditingConnection] = useState<ServerConnection | null>(null);
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [connectingId, setConnectingId] = useState<string | null>(null);
  const [mainView, setMainView] = useState<MainView>('terminal');
  const [showImportExport, setShowImportExport] = useState(false);

  const terminalContainerRef = useRef<HTMLDivElement>(null);
  const sessionsRef = useRef<SSHSession[]>([]);

  // Keep ref in sync
  useEffect(() => {
    sessionsRef.current = sessions;
  }, [sessions]);

  // Load data on mount
  useEffect(() => {
    loadData();

    // Listen for WebSocket messages
    const unsubscribe = wsService.onMessage(handleWSMessage);
    return () => unsubscribe();
  }, []);

  // Fit terminal on active session change
  useEffect(() => {
    const activeSession = sessions.find((s) => s.id === activeSessionId);
    if (activeSession && terminalContainerRef.current) {
      terminalContainerRef.current.innerHTML = '';
      activeSession.terminal.open(terminalContainerRef.current);
      activeSession.fitAddon.fit();
    }
  }, [activeSessionId, sessions]);

  // Handle window resize
  useEffect(() => {
    const handleResize = () => {
      const activeSession = sessions.find((s) => s.id === activeSessionId);
      if (activeSession) {
        activeSession.fitAddon.fit();
        const { cols, rows } = activeSession.terminal;
        wsService.resize(activeSession.id, cols, rows);
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [activeSessionId, sessions]);

  const loadData = async () => {
    try {
      const [conns, creds, grps] = await Promise.all([
        api.getConnections(),
        api.getCredentials(),
        api.getGroups(),
      ]);
      setConnections(conns);
      setCredentials(creds);
      setGroups(grps);
    } catch (err) {
      showNotification('error', 'Failed to load data');
    }
  };

  const handleWSMessage = useCallback((event: SSHSessionEvent & { sessionId?: string; type: string }) => {
    if (event.type === 'connected' && event.sessionId) {
      // Session connected, terminal already created
      setConnectingId(null);
      return;
    }

    if (!event.sessionId) return;

    const currentSessions = sessionsRef.current;
    const session = currentSessions.find((s) => s.id === event.sessionId);

    if (!session) return;

    switch (event.type) {
      case 'data':
        if (event.data) {
          session.terminal.write(event.data);
        }
        break;
      case 'close':
        showNotification('success', `Disconnected from ${session.connectionName}`);
        setSessions((prev) => prev.filter((s) => s.id !== event.sessionId));
        break;
      case 'error':
        showNotification('error', event.message || 'Connection error');
        break;
    }
  }, []);

  const showNotification = (type: 'success' | 'error', message: string) => {
    setNotification({ type, message });
    setTimeout(() => setNotification(null), 4000);
  };

  const handleConnect = async (connection: ServerConnection) => {
    if (connectingId) return;

    setConnectingId(connection.id);

    // Create terminal before connecting
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
    const webLinksAddon = new WebLinksAddon();
    terminal.loadAddon(fitAddon);
    terminal.loadAddon(webLinksAddon);

    // We need to wait for the sessionId from the server
    const handleConnected = (event: SSHSessionEvent & { sessionId?: string; type: string }) => {
      if (event.type === 'connected' && event.sessionId) {
        const sessionId = event.sessionId;

        terminal.onData((data) => {
          wsService.sendData(sessionId, data);
        });

        terminal.onResize(({ cols, rows }) => {
          wsService.resize(sessionId, cols, rows);
        });

        const newSession: SSHSession = {
          id: sessionId,
          connectionId: connection.id,
          connectionName: connection.name,
          terminal,
          fitAddon,
        };

        setSessions((prev) => [...prev, newSession]);
        setActiveSessionId(sessionId);
        setConnectingId(null);
        showNotification('success', `Connected to ${connection.name}`);

        // Remove this one-time handler
        unsubscribe();
      } else if (event.type === 'error') {
        setConnectingId(null);
        showNotification('error', event.message || 'Failed to connect');
        terminal.dispose();
        unsubscribe();
      }
    };

    const unsubscribe = wsService.onMessage(handleConnected);

    // Initiate connection
    wsService.connectSSH(connection.id);
  };

  const handleDisconnect = (sessionId: string) => {
    wsService.disconnectSSH(sessionId);
    setSessions((prev) => prev.filter((s) => s.id !== sessionId));
    if (activeSessionId === sessionId) {
      const remaining = sessions.filter((s) => s.id !== sessionId);
      setActiveSessionId(remaining[0]?.id || null);
    }
  };

  const handleSaveConnection = async (data: Partial<ServerConnection>) => {
    try {
      if (editingConnection) {
        await api.updateConnection(editingConnection.id, data);
        showNotification('success', 'Connection updated');
      } else {
        await api.createConnection(data);
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
      try {
        await api.deleteConnection(id);
        await loadData();
        showNotification('success', 'Connection deleted');
      } catch (err) {
        showNotification('error', (err as Error).message);
      }
    }
  };

  const filteredConnections = connections.filter(
    (conn) =>
      conn.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      conn.hostname.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="app">
      {/* Header */}
      <header className="app-header">
        <div className="logo">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#e94560" strokeWidth="2">
            <polyline points="4 17 10 11 4 5" />
            <line x1="12" y1="19" x2="20" y2="19" />
          </svg>
          <h1>Connectty</h1>
        </div>

        <nav className="main-nav">
          <button
            className={`nav-btn ${mainView === 'terminal' ? 'active' : ''}`}
            onClick={() => setMainView('terminal')}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="4 17 10 11 4 5" />
              <line x1="12" y1="19" x2="20" y2="19" />
            </svg>
            Terminal
          </button>
          <button
            className={`nav-btn ${mainView === 'providers' ? 'active' : ''}`}
            onClick={() => setMainView('providers')}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
              <line x1="8" y1="21" x2="16" y2="21" />
              <line x1="12" y1="17" x2="12" y2="21" />
            </svg>
            Providers
          </button>
          <button
            className={`nav-btn ${mainView === 'commands' ? 'active' : ''}`}
            onClick={() => setMainView('commands')}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
            </svg>
            Commands
          </button>
          <button
            className={`nav-btn ${mainView === 'sftp' ? 'active' : ''}`}
            onClick={() => setMainView('sftp')}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" />
            </svg>
            Files
          </button>
        </nav>

        <div className="user-info">
          <span className="user-name">{user.displayName}</span>
          <button className="btn btn-secondary btn-sm" onClick={onLogout}>
            Sign Out
          </button>
        </div>
      </header>

      {/* Main */}
      <main className="app-main">
        {/* Sidebar */}
        <aside className="sidebar">
          <div className="sidebar-header">
            <button className="btn btn-primary btn-sm" onClick={() => setShowConnectionModal(true)}>
              + New
            </button>
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => setShowImportExport(true)}
              title="Import / Export"
            >
              ⇄
            </button>
            <div className="search-input">
              <input
                type="text"
                placeholder="Search..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>

          <div className="sidebar-content">
            <ul className="connection-list">
              {filteredConnections.map((conn) => (
                <li
                  key={conn.id}
                  className={`connection-item ${sessions.some((s) => s.connectionId === conn.id) ? 'active' : ''}`}
                  onDoubleClick={() => handleConnect(conn)}
                >
                  <span className={`status-dot ${sessions.some((s) => s.connectionId === conn.id) ? 'connected' : ''}`} />
                  <div className="connection-info">
                    <div className="connection-name">{conn.name}</div>
                    <div className="connection-host">
                      {conn.username ? `${conn.username}@` : ''}
                      {conn.hostname}:{conn.port}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '4px' }}>
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleConnect(conn);
                      }}
                      disabled={connectingId === conn.id}
                    >
                      {connectingId === conn.id ? '...' : 'Connect'}
                    </button>
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingConnection(conn);
                        setShowConnectionModal(true);
                      }}
                    >
                      Edit
                    </button>
                  </div>
                </li>
              ))}

              {filteredConnections.length === 0 && (
                <div className="empty-state">
                  <p>No connections found</p>
                </div>
              )}
            </ul>
          </div>
        </aside>

        {/* Content */}
        <div className="main-content">
          {mainView === 'terminal' && (
            <>
              {sessions.length > 0 ? (
                <>
                  {/* Session Tabs */}
                  <div className="session-tabs">
                    {sessions.map((session) => (
                      <button
                        key={session.id}
                        className={`session-tab ${activeSessionId === session.id ? 'active' : ''}`}
                        onClick={() => setActiveSessionId(session.id)}
                      >
                        <span className="status-dot connected" />
                        {session.connectionName}
                        <span
                          className="close-btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDisconnect(session.id);
                          }}
                        >
                          ×
                        </span>
                      </button>
                    ))}

                    {/* New Tab Button */}
                    <button
                      className="new-tab-btn"
                      onClick={() => setShowConnectionModal(true)}
                      title="New Connection"
                    >
                      +
                    </button>
                  </div>

                  {/* Terminal */}
                  <div className="terminal-container" ref={terminalContainerRef} />
                </>
              ) : (
                <div className="welcome-screen">
                  <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#e94560" strokeWidth="1.5">
                    <polyline points="4 17 10 11 4 5" />
                    <line x1="12" y1="19" x2="20" y2="19" />
                  </svg>
                  <h2>Welcome to Connectty</h2>
                  <p>Select a connection from the sidebar or create a new one to get started.</p>
                  <button className="btn btn-primary" onClick={() => setShowConnectionModal(true)}>
                    Create Connection
                  </button>
                </div>
              )}
            </>
          )}

          {mainView === 'providers' && (
            <ProviderPanel
              credentials={credentials}
              groups={groups}
              onHostsImported={loadData}
              onNotification={showNotification}
            />
          )}

          {mainView === 'commands' && (
            <BulkCommandPanel
              connections={connections}
              onNotification={showNotification}
            />
          )}

          {mainView === 'sftp' && (
            <SFTPPanel
              connections={connections}
              onNotification={showNotification}
            />
          )}
        </div>
      </main>

      {/* Connection Modal */}
      {showConnectionModal && (
        <ConnectionModal
          connection={editingConnection}
          credentials={credentials}
          groups={groups}
          onClose={() => {
            setShowConnectionModal(false);
            setEditingConnection(null);
          }}
          onSave={handleSaveConnection}
          onDelete={editingConnection ? () => handleDeleteConnection(editingConnection.id) : undefined}
        />
      )}

      {/* Import/Export Modal */}
      {showImportExport && (
        <ImportExportModal
          onClose={() => setShowImportExport(false)}
          onImportComplete={loadData}
          onNotification={showNotification}
        />
      )}

      {/* Notification */}
      {notification && <div className={`notification ${notification.type}`}>{notification.message}</div>}
    </div>
  );
}
