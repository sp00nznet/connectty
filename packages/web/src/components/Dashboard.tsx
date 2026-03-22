import { useState, useEffect, useCallback, useRef } from 'react';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import { WebLinksAddon } from 'xterm-addon-web-links';
import 'xterm/css/xterm.css';
import type { ServerConnection, Credential, ConnectionGroup, User, SSHSessionEvent, PanelLayout, LayoutMode, PresetLayout } from '@connectty/shared';
import { api } from '../services/api';
import { wsService } from '../services/websocket';
import { PanelContainer, LayoutPicker, createLayout, createLeaf, assignSession, getLeaves } from './panels';
import ConnectionModal from './ConnectionModal';
import CredentialModal from './CredentialModal';
import GroupModal from './GroupModal';
import ProviderPanel from './ProviderPanel';
import BulkCommandPanel from './BulkCommandPanel';
import ImportExportModal from './ImportExportModal';
import SFTPPanel from './SFTPPanel';
import RDPPanel from './RDPPanel';
import ProfileSelector from './ProfileSelector';

type MainView = 'terminal' | 'providers' | 'commands' | 'sftp' | 'rdp';

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
  const [showCredentialModal, setShowCredentialModal] = useState(false);
  const [showGroupModal, setShowGroupModal] = useState(false);

  // Collapsible sidebar
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(() => {
    return localStorage.getItem('connectty-sidebar-collapsed') === 'true';
  });

  // Panel layout mode
  const [layoutMode, setLayoutMode] = useState<LayoutMode>(() => {
    return (localStorage.getItem('connectty-layout-mode') as LayoutMode) || 'tabs';
  });
  const [panelLayout, setPanelLayout] = useState<PanelLayout | null>(null);
  const [showLayoutPicker, setShowLayoutPicker] = useState(false);
  const [sessionPickerPanelId, setSessionPickerPanelId] = useState<string | null>(null);

  // Collapsible sidebar groups
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(() => {
    const saved = localStorage.getItem('connectty-collapsed-groups');
    return saved ? new Set(JSON.parse(saved)) : new Set();
  });

  const terminalContainerRef = useRef<HTMLDivElement>(null);
  const sessionsRef = useRef<SSHSession[]>([]);

  // Persist sidebar collapsed state and Ctrl+B keyboard shortcut
  useEffect(() => {
    localStorage.setItem('connectty-sidebar-collapsed', String(sidebarCollapsed));
  }, [sidebarCollapsed]);

  useEffect(() => {
    localStorage.setItem('connectty-layout-mode', layoutMode);
  }, [layoutMode]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;

      if (e.ctrlKey && e.key === 'b' && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        setSidebarCollapsed(prev => !prev);
      }

      if (e.ctrlKey && e.shiftKey && (e.key === 'T' || e.key === 't') && !e.altKey) {
        e.preventDefault();
        setLayoutMode(prev => {
          const next = prev === 'tabs' ? 'panels' : 'tabs';
          if (next === 'panels' && !panelLayout) {
            const leaf = createLeaf(activeSessionId || null);
            setPanelLayout({ root: leaf, activePanelId: leaf.id });
          }
          return next;
        });
      }

      if (e.ctrlKey && e.shiftKey && (e.key === 'P' || e.key === 'p') && !e.altKey) {
        if (layoutMode === 'panels') {
          e.preventDefault();
          setShowLayoutPicker(prev => !prev);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [layoutMode, panelLayout, activeSessionId]);

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

  const handleLocalShell = () => {
    if (connectingId === 'local') return;

    setConnectingId('local');

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
    const handleConnected = (event: SSHSessionEvent & { sessionId?: string; sessionType?: string; type: string }) => {
      if (event.type === 'connected' && event.sessionId && event.sessionType === 'local') {
        const sessionId = event.sessionId;

        terminal.onData((data) => {
          wsService.sendData(sessionId, data);
        });

        terminal.onResize(({ cols, rows }) => {
          wsService.resize(sessionId, cols, rows);
        });

        const newSession: SSHSession = {
          id: sessionId,
          connectionId: 'local',
          connectionName: 'Local Shell',
          terminal,
          fitAddon,
        };

        setSessions((prev) => [...prev, newSession]);
        setActiveSessionId(sessionId);
        setConnectingId(null);
        showNotification('success', 'Local shell connected');

        // Remove this one-time handler
        unsubscribe();
      } else if (event.type === 'error') {
        setConnectingId(null);
        showNotification('error', event.message || 'Failed to connect local shell');
        terminal.dispose();
        unsubscribe();
      }
    };

    const unsubscribe = wsService.onMessage(handleConnected);

    // Initiate local connection
    wsService.connectLocal();
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

  // Group connections by their group
  const groupedConnections = groups.reduce((acc, group) => {
    acc[group.id] = filteredConnections.filter(c => c.group === group.id);
    return acc;
  }, {} as Record<string, ServerConnection[]>);

  const ungroupedConnections = filteredConnections.filter(c => !c.group);

  // Toggle group collapse state
  const toggleGroupCollapse = (groupId: string) => {
    setCollapsedGroups(prev => {
      const next = new Set(prev);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }
      localStorage.setItem('connectty-collapsed-groups', JSON.stringify([...next]));
      return next;
    });
  };

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
          <button
            className={`nav-btn ${mainView === 'rdp' ? 'active' : ''}`}
            onClick={() => setMainView('rdp')}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
              <line x1="8" y1="21" x2="16" y2="21" />
              <line x1="12" y1="17" x2="12" y2="21" />
            </svg>
            RDP
          </button>
        </nav>

        <ProfileSelector onProfileSwitch={loadData} />

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
        <aside className={`sidebar ${sidebarCollapsed ? 'collapsed' : ''}`}>
          <div className="sidebar-header">
            <div className="sidebar-header-row">
              <button
                className="sidebar-toggle-btn"
                onClick={() => setSidebarCollapsed(prev => !prev)}
                title={sidebarCollapsed ? 'Expand sidebar (Ctrl+B)' : 'Collapse sidebar (Ctrl+B)'}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  {sidebarCollapsed
                    ? <polyline points="9 18 15 12 9 6" />
                    : <polyline points="15 18 9 12 15 6" />
                  }
                </svg>
              </button>
            </div>
            {!sidebarCollapsed && (
              <div className="sidebar-buttons">
                <button className="btn btn-primary btn-sm" onClick={() => setShowConnectionModal(true)}>
                  + New
                </button>
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() => setShowCredentialModal(true)}
                  title="Credentials"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                    <path d="M7 11V7a5 5 0 0110 0v4"/>
                  </svg>
                </button>
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() => setShowGroupModal(true)}
                  title="Groups"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/>
                  </svg>
                </button>
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() => setShowImportExport(true)}
                  title="Import / Export"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
                    <polyline points="17 8 12 3 7 8"/>
                    <line x1="12" y1="3" x2="12" y2="15"/>
                  </svg>
                </button>
              </div>
            )}
            {!sidebarCollapsed && (
              <div className="search-input">
                <input
                  type="text"
                  placeholder="Search..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
                {searchQuery && (
                  <button
                    className="search-clear-btn"
                    onClick={() => setSearchQuery('')}
                    title="Clear search"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                )}
              </div>
            )}
            {sidebarCollapsed && (
              <div className="sidebar-actions-collapsed">
                <button className="sidebar-icon-btn" onClick={() => setShowConnectionModal(true)} title="New Connection">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                </button>
                <button className="sidebar-icon-btn" onClick={() => setShowCredentialModal(true)} title="Credentials">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0110 0v4"/>
                  </svg>
                </button>
                <button className="sidebar-icon-btn" onClick={() => setShowGroupModal(true)} title="Groups">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/>
                  </svg>
                </button>
              </div>
            )}
          </div>

          {!sidebarCollapsed && <div className="sidebar-content">
            <ul className="connection-list">
              {/* Grouped connections */}
              {groups.map(group => (
                groupedConnections[group.id]?.length > 0 && (
                  <li key={group.id} className={`connection-group ${collapsedGroups.has(group.id) ? 'collapsed' : ''}`}>
                    <div
                      className="connection-group-header"
                      onClick={() => toggleGroupCollapse(group.id)}
                    >
                      <svg
                        className="collapse-chevron"
                        width="12"
                        height="12"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <polyline points="6 9 12 15 18 9" />
                      </svg>
                      <span className="group-color-dot" style={{ backgroundColor: group.color }}></span>
                      {group.name}
                      <span className="connection-count">({groupedConnections[group.id].length})</span>
                    </div>
                    {!collapsedGroups.has(group.id) && groupedConnections[group.id].map(conn => (
                      <div
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
                      </div>
                    ))}
                  </li>
                )
              ))}

              {/* Ungrouped connections */}
              {ungroupedConnections.length > 0 && (
                <li className={`connection-group ${collapsedGroups.has('__ungrouped__') ? 'collapsed' : ''}`}>
                  <div
                    className="connection-group-header"
                    onClick={() => toggleGroupCollapse('__ungrouped__')}
                  >
                    <svg
                      className="collapse-chevron"
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <polyline points="6 9 12 15 18 9" />
                    </svg>
                    Connections
                    <span className="connection-count">({ungroupedConnections.length})</span>
                  </div>
                  {!collapsedGroups.has('__ungrouped__') && ungroupedConnections.map(conn => (
                    <div
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
                    </div>
                  ))}
                </li>
              )}

              {filteredConnections.length === 0 && (
                <div className="empty-state">
                  <p>No connections found</p>
                </div>
              )}
            </ul>
          </div>}
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
                    <button
                      className="new-tab-btn local-shell-btn"
                      onClick={handleLocalShell}
                      disabled={connectingId === 'local'}
                      title="Local Shell"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
                        <line x1="8" y1="21" x2="16" y2="21" />
                        <line x1="12" y1="17" x2="12" y2="21" />
                      </svg>
                    </button>

                    {/* Panel Mode Toggle */}
                    <div className="panel-mode-toggle">
                      <button
                        className={`panel-mode-btn ${layoutMode === 'tabs' ? 'active' : ''}`}
                        onClick={() => setLayoutMode('tabs')}
                        title="Tab mode"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/>
                        </svg>
                      </button>
                      <button
                        className={`panel-mode-btn ${layoutMode === 'panels' ? 'active' : ''}`}
                        onClick={() => {
                          setLayoutMode('panels');
                          if (!panelLayout) {
                            const leaf = createLeaf(activeSessionId || null);
                            setPanelLayout({ root: leaf, activePanelId: leaf.id });
                          }
                        }}
                        title="Panel mode (Ctrl+Shift+T)"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <rect x="3" y="3" width="18" height="18" rx="2"/><line x1="12" y1="3" x2="12" y2="21"/><line x1="3" y1="12" x2="12" y2="12"/>
                        </svg>
                      </button>
                      {layoutMode === 'panels' && (
                        <button
                          className="panel-mode-btn"
                          onClick={() => setShowLayoutPicker(true)}
                          title="Layout presets (Ctrl+Shift+P)"
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>
                          </svg>
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Terminal Content */}
                  {layoutMode === 'panels' && panelLayout ? (
                    <PanelContainer
                      layout={panelLayout}
                      sessions={sessions.map(s => ({ ...s, type: 'ssh' as const }))}
                      onLayoutChange={setPanelLayout}
                      onActivePanelChange={(panelId) => {
                        setPanelLayout(prev => prev ? { ...prev, activePanelId: panelId } : prev);
                        const leaves = panelLayout ? getLeaves(panelLayout.root) : [];
                        const leaf = leaves.find(l => l.id === panelId);
                        if (leaf?.sessionId) setActiveSessionId(leaf.sessionId);
                      }}
                      onSessionSelect={(panelId) => setSessionPickerPanelId(panelId)}
                      onResize={(sessionId, cols, rows) => {
                        wsService.resize(sessionId, cols, rows);
                      }}
                    />
                  ) : (
                    <div className="terminal-container" ref={terminalContainerRef} />
                  )}
                </>
              ) : (
                <div className="welcome-screen">
                  <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#e94560" strokeWidth="1.5">
                    <polyline points="4 17 10 11 4 5" />
                    <line x1="12" y1="19" x2="20" y2="19" />
                  </svg>
                  <h2>Welcome to Connectty</h2>
                  <p>Select a connection from the sidebar or create a new one to get started.</p>
                  <div className="welcome-buttons">
                    <button className="btn btn-primary" onClick={() => setShowConnectionModal(true)}>
                      Create Connection
                    </button>
                    <button
                      className="btn btn-secondary"
                      onClick={handleLocalShell}
                      disabled={connectingId === 'local'}
                    >
                      {connectingId === 'local' ? 'Connecting...' : 'Local Shell'}
                    </button>
                  </div>
                </div>
              )}
            </>
          )}

          {mainView === 'providers' && (
            <ProviderPanel
              credentials={credentials}
              groups={groups}
              connections={connections}
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

          {mainView === 'rdp' && (
            <RDPPanel
              connections={connections}
              onNotification={showNotification}
            />
          )}
        </div>
      </main>

      {/* Layout Picker */}
      {showLayoutPicker && (
        <LayoutPicker
          onSelect={(preset) => {
            const sessionIds = sessions.map(s => s.id);
            setPanelLayout(createLayout(preset, sessionIds));
          }}
          onClose={() => setShowLayoutPicker(false)}
        />
      )}

      {/* Session Picker for empty panels */}
      {sessionPickerPanelId && (
        <div className="layout-picker-overlay" onClick={() => setSessionPickerPanelId(null)}>
          <div className="layout-picker" onClick={e => e.stopPropagation()}>
            <div className="layout-picker-header">
              <h3>Assign Session</h3>
              <button className="pane-action-btn" onClick={() => setSessionPickerPanelId(null)}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>
            <div className="session-picker-list">
              {sessions.map(s => (
                <button
                  key={s.id}
                  className="session-picker-item"
                  onClick={() => {
                    if (panelLayout) {
                      setPanelLayout({
                        ...panelLayout,
                        root: assignSession(panelLayout.root, sessionPickerPanelId, s.id),
                      });
                    }
                    setSessionPickerPanelId(null);
                  }}
                >
                  <span className="session-type-badge ssh">SSH</span>
                  {s.connectionName}
                </button>
              ))}
              {sessions.length === 0 && (
                <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', padding: '8px' }}>No sessions available</p>
              )}
            </div>
          </div>
        </div>
      )}

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

      {/* Credential Modal */}
      {showCredentialModal && (
        <CredentialModal
          onClose={() => setShowCredentialModal(false)}
          onNotification={showNotification}
        />
      )}

      {/* Group Modal */}
      {showGroupModal && (
        <GroupModal
          onClose={() => setShowGroupModal(false)}
          onGroupsChanged={loadData}
          onNotification={showNotification}
        />
      )}

      {/* Notification */}
      {notification && <div className={`notification ${notification.type}`}>{notification.message}</div>}
    </div>
  );
}
