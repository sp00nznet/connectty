import { useState } from 'react';
import { api, RDPConnectionInfo } from '../services/api';
import type { ServerConnection } from '@connectty/shared';

interface RDPPanelProps {
  connections: ServerConnection[];
  onNotification: (type: 'success' | 'error', message: string) => void;
}

export default function RDPPanel({ connections, onNotification }: RDPPanelProps) {
  const [selectedConnectionId, setSelectedConnectionId] = useState<string>('');
  const [connectionInfo, setConnectionInfo] = useState<RDPConnectionInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const handleSelectConnection = async (connectionId: string) => {
    setSelectedConnectionId(connectionId);
    if (!connectionId) {
      setConnectionInfo(null);
      return;
    }

    try {
      setLoading(true);
      const info = await api.rdpGetInfo(connectionId);
      setConnectionInfo(info);
    } catch (err) {
      onNotification('error', (err as Error).message);
      setConnectionInfo(null);
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = async () => {
    if (!selectedConnectionId) return;

    try {
      setDownloading(true);
      await api.rdpDownloadFile(selectedConnectionId);
      onNotification('success', 'RDP file downloaded');
    } catch (err) {
      onNotification('error', (err as Error).message);
    } finally {
      setDownloading(false);
    }
  };

  const handleLaunch = () => {
    // This will trigger the download, which modern browsers may auto-launch
    // based on file type association
    handleDownload();
  };

  return (
    <div className="rdp-panel">
      <div className="rdp-header">
        <h2>Remote Desktop (RDP)</h2>
        <p className="rdp-description">
          Connect to Windows machines using Remote Desktop Protocol. Download an RDP file
          to launch your system's native RDP client.
        </p>
      </div>

      <div className="rdp-content">
        <div className="rdp-connection-select">
          <label>Select Connection</label>
          <select
            value={selectedConnectionId}
            onChange={(e) => handleSelectConnection(e.target.value)}
          >
            <option value="">-- Select a connection --</option>
            {connections.map((conn) => (
              <option key={conn.id} value={conn.id}>
                {conn.name} ({conn.hostname}:{conn.port || 3389})
              </option>
            ))}
          </select>
        </div>

        {loading && (
          <div className="rdp-loading">Loading connection info...</div>
        )}

        {connectionInfo && !loading && (
          <div className="rdp-info-card">
            <h3>{connectionInfo.name}</h3>

            <div className="rdp-info-grid">
              <div className="rdp-info-item">
                <span className="rdp-info-label">Host</span>
                <span className="rdp-info-value">{connectionInfo.hostname}</span>
              </div>
              <div className="rdp-info-item">
                <span className="rdp-info-label">Port</span>
                <span className="rdp-info-value">{connectionInfo.port}</span>
              </div>
              {connectionInfo.username && (
                <div className="rdp-info-item">
                  <span className="rdp-info-label">Username</span>
                  <span className="rdp-info-value">
                    {connectionInfo.domain
                      ? `${connectionInfo.domain}\\${connectionInfo.username}`
                      : connectionInfo.username}
                  </span>
                </div>
              )}
              <div className="rdp-info-item">
                <span className="rdp-info-label">Credentials</span>
                <span className="rdp-info-value">
                  {connectionInfo.hasCredentials
                    ? 'Stored credentials available'
                    : 'Will prompt for credentials'}
                </span>
              </div>
            </div>

            <div className="rdp-actions">
              <button
                className="btn btn-primary"
                onClick={handleLaunch}
                disabled={downloading}
              >
                {downloading ? 'Downloading...' : 'Launch RDP'}
              </button>
              <button
                className="btn btn-secondary"
                onClick={handleDownload}
                disabled={downloading}
              >
                Download .rdp File
              </button>
            </div>

            <div className="rdp-help">
              <h4>How to connect</h4>
              <ol>
                <li>Click "Launch RDP" or "Download .rdp File"</li>
                <li>Open the downloaded file with your RDP client</li>
                <li>
                  <strong>Windows:</strong> The file will open automatically with Remote Desktop Connection
                </li>
                <li>
                  <strong>macOS:</strong> Install Microsoft Remote Desktop from the App Store
                </li>
                <li>
                  <strong>Linux:</strong> Use Remmina, xfreerdp, or rdesktop
                </li>
              </ol>
            </div>
          </div>
        )}

        {!selectedConnectionId && !loading && (
          <div className="rdp-empty">
            <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#555" strokeWidth="1.5">
              <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
              <line x1="8" y1="21" x2="16" y2="21" />
              <line x1="12" y1="17" x2="12" y2="21" />
            </svg>
            <h3>Remote Desktop</h3>
            <p>Select a connection to generate an RDP file for connecting to Windows machines.</p>
          </div>
        )}
      </div>
    </div>
  );
}
