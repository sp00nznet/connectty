import React, { useState, useRef, useCallback } from 'react';
import { api, SFTPSession, RemoteFileInfo } from '../services/api';
import type { ServerConnection } from '@connectty/shared';

interface SFTPPanelProps {
  connections: ServerConnection[];
  onNotification: (type: 'success' | 'error', message: string) => void;
}

export default function SFTPPanel({ connections, onNotification }: SFTPPanelProps) {
  const [sessions, setSessions] = useState<SFTPSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [currentPath, setCurrentPath] = useState('/');
  const [files, setFiles] = useState<RemoteFileInfo[]>([]);
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [selectedConnectionId, setSelectedConnectionId] = useState('');
  const [showNewFolderInput, setShowNewFolderInput] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [renameTarget, setRenameTarget] = useState<RemoteFileInfo | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadDirectory = useCallback(async (sessionId: string, path: string) => {
    try {
      setLoading(true);
      const result = await api.sftpList(sessionId, path);
      setCurrentPath(result.path);
      setFiles(result.files);
      setSelectedFiles(new Set());
    } catch (err) {
      onNotification('error', (err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [onNotification]);

  const handleConnect = async () => {
    if (!selectedConnectionId) {
      onNotification('error', 'Select a connection');
      return;
    }

    try {
      setConnecting(true);
      const { sessionId } = await api.sftpConnect(selectedConnectionId);
      const connection = connections.find(c => c.id === selectedConnectionId);

      const newSession: SFTPSession = {
        id: sessionId,
        connectionId: selectedConnectionId,
        connectionName: connection?.name || 'Unknown',
        currentPath: '/',
      };

      setSessions(prev => [...prev, newSession]);
      setActiveSessionId(sessionId);
      await loadDirectory(sessionId, '~');
      onNotification('success', `Connected to ${connection?.name}`);
    } catch (err) {
      onNotification('error', (err as Error).message);
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnect = async (sessionId: string) => {
    try {
      await api.sftpDisconnect(sessionId);
      setSessions(prev => prev.filter(s => s.id !== sessionId));
      if (activeSessionId === sessionId) {
        const remaining = sessions.filter(s => s.id !== sessionId);
        setActiveSessionId(remaining[0]?.id || null);
        if (remaining[0]) {
          await loadDirectory(remaining[0].id, remaining[0].currentPath);
        } else {
          setFiles([]);
          setCurrentPath('/');
        }
      }
    } catch (err) {
      onNotification('error', (err as Error).message);
    }
  };

  const handleNavigate = async (path: string) => {
    if (!activeSessionId) return;
    await loadDirectory(activeSessionId, path);
  };

  const handleFileClick = async (file: RemoteFileInfo) => {
    if (file.isDirectory) {
      await handleNavigate(file.path);
    }
  };

  const handleFileSelect = (file: RemoteFileInfo, e: React.MouseEvent) => {
    e.stopPropagation();
    const newSelected = new Set(selectedFiles);
    if (e.ctrlKey || e.metaKey) {
      if (newSelected.has(file.path)) {
        newSelected.delete(file.path);
      } else {
        newSelected.add(file.path);
      }
    } else {
      newSelected.clear();
      newSelected.add(file.path);
    }
    setSelectedFiles(newSelected);
  };

  const handleDownload = async () => {
    if (!activeSessionId || selectedFiles.size === 0) return;

    for (const filePath of selectedFiles) {
      const file = files.find(f => f.path === filePath);
      if (!file || file.isDirectory) continue;

      try {
        const blob = await api.sftpDownload(activeSessionId, filePath);
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = file.name;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        onNotification('success', `Downloaded ${file.name}`);
      } catch (err) {
        onNotification('error', `Failed to download ${file.name}: ${(err as Error).message}`);
      }
    }
  };

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!activeSessionId || !e.target.files) return;

    const uploadFiles = Array.from(e.target.files);
    for (const file of uploadFiles) {
      try {
        await api.sftpUpload(activeSessionId, currentPath, file);
        onNotification('success', `Uploaded ${file.name}`);
      } catch (err) {
        onNotification('error', `Failed to upload ${file.name}: ${(err as Error).message}`);
      }
    }

    // Refresh directory
    await loadDirectory(activeSessionId, currentPath);
    e.target.value = '';
  };

  const handleNewFolder = async () => {
    if (!activeSessionId || !newFolderName.trim()) return;

    try {
      const newPath = currentPath.endsWith('/')
        ? currentPath + newFolderName
        : currentPath + '/' + newFolderName;
      await api.sftpMkdir(activeSessionId, newPath);
      onNotification('success', `Created folder ${newFolderName}`);
      setShowNewFolderInput(false);
      setNewFolderName('');
      await loadDirectory(activeSessionId, currentPath);
    } catch (err) {
      onNotification('error', (err as Error).message);
    }
  };

  const handleDelete = async () => {
    if (!activeSessionId || selectedFiles.size === 0) return;

    if (!confirm(`Delete ${selectedFiles.size} item(s)?`)) return;

    for (const filePath of selectedFiles) {
      const file = files.find(f => f.path === filePath);
      if (!file) continue;

      try {
        if (file.isDirectory) {
          await api.sftpRmdir(activeSessionId, filePath);
        } else {
          await api.sftpUnlink(activeSessionId, filePath);
        }
        onNotification('success', `Deleted ${file.name}`);
      } catch (err) {
        onNotification('error', `Failed to delete ${file.name}: ${(err as Error).message}`);
      }
    }

    await loadDirectory(activeSessionId, currentPath);
  };

  const handleRename = async () => {
    if (!activeSessionId || !renameTarget || !renameValue.trim()) return;

    try {
      const dir = renameTarget.path.substring(0, renameTarget.path.lastIndexOf('/'));
      const newPath = dir + '/' + renameValue;
      await api.sftpRename(activeSessionId, renameTarget.path, newPath);
      onNotification('success', `Renamed to ${renameValue}`);
      setRenameTarget(null);
      setRenameValue('');
      await loadDirectory(activeSessionId, currentPath);
    } catch (err) {
      onNotification('error', (err as Error).message);
    }
  };

  const handleRefresh = async () => {
    if (!activeSessionId) return;
    await loadDirectory(activeSessionId, currentPath);
  };

  const navigateUp = () => {
    if (currentPath === '/') return;
    const parent = currentPath.substring(0, currentPath.lastIndexOf('/')) || '/';
    handleNavigate(parent);
  };

  const formatSize = (bytes: number): string => {
    if (bytes === 0) return '-';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return (bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0) + ' ' + units[i];
  };

  const formatDate = (dateStr: string): string => {
    const date = new Date(dateStr);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
  };

  const activeSession = sessions.find(s => s.id === activeSessionId);

  return (
    <div className="sftp-panel">
      {/* Connection bar */}
      <div className="sftp-connect-bar">
        <select
          value={selectedConnectionId}
          onChange={(e) => setSelectedConnectionId(e.target.value)}
          disabled={connecting}
        >
          <option value="">-- Select Connection --</option>
          {connections.map(conn => (
            <option key={conn.id} value={conn.id}>
              {conn.name} ({conn.hostname})
            </option>
          ))}
        </select>
        <button
          className="btn btn-primary"
          onClick={handleConnect}
          disabled={connecting || !selectedConnectionId}
        >
          {connecting ? 'Connecting...' : 'Connect'}
        </button>
      </div>

      {/* Session tabs */}
      {sessions.length > 0 && (
        <div className="sftp-session-tabs">
          {sessions.map(session => (
            <div
              key={session.id}
              className={`sftp-session-tab ${activeSessionId === session.id ? 'active' : ''}`}
              onClick={() => {
                setActiveSessionId(session.id);
                loadDirectory(session.id, session.currentPath);
              }}
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
            </div>
          ))}
        </div>
      )}

      {/* File browser */}
      {activeSession ? (
        <div className="sftp-browser">
          {/* Toolbar */}
          <div className="sftp-toolbar">
            <button className="btn btn-sm" onClick={navigateUp} title="Go up">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M17 11l-5-5-5 5M12 6v12"/>
              </svg>
            </button>
            <button className="btn btn-sm" onClick={handleRefresh} title="Refresh">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M23 4v6h-6M1 20v-6h6"/>
                <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/>
              </svg>
            </button>
            <div className="sftp-path-bar">
              <input
                type="text"
                value={currentPath}
                onChange={(e) => setCurrentPath(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleNavigate(currentPath)}
              />
              <button className="btn btn-sm" onClick={() => handleNavigate(currentPath)}>Go</button>
            </div>
          </div>

          {/* Action buttons */}
          <div className="sftp-actions">
            <button className="btn btn-primary btn-sm" onClick={handleUploadClick}>
              Upload
            </button>
            <button
              className="btn btn-secondary btn-sm"
              onClick={handleDownload}
              disabled={selectedFiles.size === 0}
            >
              Download
            </button>
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => setShowNewFolderInput(true)}
            >
              New Folder
            </button>
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => {
                const file = files.find(f => selectedFiles.has(f.path));
                if (file) {
                  setRenameTarget(file);
                  setRenameValue(file.name);
                }
              }}
              disabled={selectedFiles.size !== 1}
            >
              Rename
            </button>
            <button
              className="btn btn-danger btn-sm"
              onClick={handleDelete}
              disabled={selectedFiles.size === 0}
            >
              Delete
            </button>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleUpload}
              multiple
              style={{ display: 'none' }}
            />
          </div>

          {/* New folder input */}
          {showNewFolderInput && (
            <div className="sftp-input-row">
              <input
                type="text"
                placeholder="Folder name"
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleNewFolder()}
                autoFocus
              />
              <button className="btn btn-primary btn-sm" onClick={handleNewFolder}>Create</button>
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => {
                  setShowNewFolderInput(false);
                  setNewFolderName('');
                }}
              >
                Cancel
              </button>
            </div>
          )}

          {/* Rename input */}
          {renameTarget && (
            <div className="sftp-input-row">
              <span>Rename "{renameTarget.name}" to:</span>
              <input
                type="text"
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleRename()}
                autoFocus
              />
              <button className="btn btn-primary btn-sm" onClick={handleRename}>Rename</button>
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => {
                  setRenameTarget(null);
                  setRenameValue('');
                }}
              >
                Cancel
              </button>
            </div>
          )}

          {/* File list */}
          <div className="sftp-file-list">
            {loading ? (
              <div className="sftp-loading">Loading...</div>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th style={{ width: '40px' }}></th>
                    <th>Name</th>
                    <th style={{ width: '100px' }}>Size</th>
                    <th style={{ width: '100px' }}>Permissions</th>
                    <th style={{ width: '180px' }}>Modified</th>
                  </tr>
                </thead>
                <tbody>
                  {files.map(file => (
                    <tr
                      key={file.path}
                      className={selectedFiles.has(file.path) ? 'selected' : ''}
                      onClick={(e) => handleFileSelect(file, e)}
                      onDoubleClick={() => handleFileClick(file)}
                    >
                      <td className="file-icon">
                        {file.isDirectory ? (
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="#ffcc00" stroke="#ffcc00">
                            <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/>
                          </svg>
                        ) : file.isSymlink ? (
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#888" strokeWidth="2">
                            <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/>
                            <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/>
                          </svg>
                        ) : (
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#aaa" strokeWidth="2">
                            <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
                            <polyline points="14 2 14 8 20 8"/>
                          </svg>
                        )}
                      </td>
                      <td className="file-name">{file.name}</td>
                      <td className="file-size">{file.isDirectory ? '-' : formatSize(file.size)}</td>
                      <td className="file-permissions">{file.permissions}</td>
                      <td className="file-date">{formatDate(file.modifiedAt)}</td>
                    </tr>
                  ))}
                  {files.length === 0 && (
                    <tr>
                      <td colSpan={5} className="empty-dir">Empty directory</td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}
          </div>

          {/* Status bar */}
          <div className="sftp-status-bar">
            <span>{files.length} items</span>
            {selectedFiles.size > 0 && <span>{selectedFiles.size} selected</span>}
          </div>
        </div>
      ) : (
        <div className="sftp-empty">
          <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#555" strokeWidth="1.5">
            <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/>
          </svg>
          <h3>SFTP File Browser</h3>
          <p>Select a connection and click Connect to browse files</p>
        </div>
      )}
    </div>
  );
}
