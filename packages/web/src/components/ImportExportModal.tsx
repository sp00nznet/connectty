import React, { useState, useRef } from 'react';
import { api } from '../services/api';

interface ImportExportModalProps {
  onClose: () => void;
  onImportComplete: () => void;
  onNotification: (type: 'success' | 'error', message: string) => void;
}

type ImportFormat = 'json' | 'csv' | 'ssh-config';

export default function ImportExportModal({
  onClose,
  onImportComplete,
  onNotification,
}: ImportExportModalProps) {
  const [activeTab, setActiveTab] = useState<'import' | 'export'>('import');
  const [importing, setImporting] = useState(false);
  const [exporting, setExporting] = useState(false);

  // Import state
  const [importFormat, setImportFormat] = useState<ImportFormat>('json');
  const [importData, setImportData] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Export state
  const [exportFormat, setExportFormat] = useState<'json' | 'csv'>('json');
  const [includeCredentials, setIncludeCredentials] = useState(false);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      setImportData(content);

      // Auto-detect format from file extension
      if (file.name.endsWith('.json')) {
        setImportFormat('json');
      } else if (file.name.endsWith('.csv')) {
        setImportFormat('csv');
      } else if (file.name.includes('config') || file.name.endsWith('.txt')) {
        setImportFormat('ssh-config');
      }
    };
    reader.readAsText(file);
  };

  const handleImport = async () => {
    if (!importData.trim()) {
      onNotification('error', 'No data to import');
      return;
    }

    try {
      setImporting(true);
      const result = await api.importData(importFormat, importData);

      const parts = [];
      if (result.connections > 0) parts.push(`${result.connections} connections`);
      if (result.credentials > 0) parts.push(`${result.credentials} credentials`);
      if (result.groups > 0) parts.push(`${result.groups} groups`);

      if (parts.length > 0) {
        onNotification('success', `Imported ${parts.join(', ')}`);
        onImportComplete();
      } else {
        onNotification('error', 'No data was imported');
      }

      if (result.errors.length > 0) {
        console.error('Import errors:', result.errors);
      }

      onClose();
    } catch (err) {
      onNotification('error', (err as Error).message);
    } finally {
      setImporting(false);
    }
  };

  const handleExport = async () => {
    try {
      setExporting(true);
      const blob = await api.exportData(exportFormat, includeCredentials);

      // Create download link
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `connectty-export.${exportFormat}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      onNotification('success', 'Export complete');
      onClose();
    } catch (err) {
      onNotification('error', (err as Error).message);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal import-export-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Import / Export</h2>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>

        <div className="modal-tabs">
          <button
            className={`tab ${activeTab === 'import' ? 'active' : ''}`}
            onClick={() => setActiveTab('import')}
          >
            Import
          </button>
          <button
            className={`tab ${activeTab === 'export' ? 'active' : ''}`}
            onClick={() => setActiveTab('export')}
          >
            Export
          </button>
        </div>

        <div className="modal-body">
          {activeTab === 'import' && (
            <div className="import-section">
              <div className="form-row">
                <label>Format</label>
                <select
                  value={importFormat}
                  onChange={(e) => setImportFormat(e.target.value as ImportFormat)}
                >
                  <option value="json">JSON (Connectty export)</option>
                  <option value="csv">CSV</option>
                  <option value="ssh-config">SSH Config (~/.ssh/config)</option>
                </select>
              </div>

              <div className="form-row">
                <label>File</label>
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileSelect}
                  accept=".json,.csv,.txt,.config"
                />
              </div>

              <div className="form-row">
                <label>Or paste data directly</label>
                <textarea
                  value={importData}
                  onChange={(e) => setImportData(e.target.value)}
                  placeholder={getPlaceholder(importFormat)}
                  rows={10}
                />
              </div>

              <div className="format-help">
                {importFormat === 'json' && (
                  <p>Import connections, credentials, and groups from a Connectty JSON export file.</p>
                )}
                {importFormat === 'csv' && (
                  <p>
                    CSV must have a header row with at least a <code>hostname</code> column.
                    Optional columns: <code>name</code>, <code>port</code>, <code>username</code>,
                    <code>tags</code> (semicolon-separated), <code>description</code>.
                  </p>
                )}
                {importFormat === 'ssh-config' && (
                  <p>
                    Paste the contents of your <code>~/.ssh/config</code> file.
                    Host aliases, HostName, Port, and User settings will be imported.
                  </p>
                )}
              </div>
            </div>
          )}

          {activeTab === 'export' && (
            <div className="export-section">
              <div className="form-row">
                <label>Format</label>
                <select
                  value={exportFormat}
                  onChange={(e) => setExportFormat(e.target.value as 'json' | 'csv')}
                >
                  <option value="json">JSON (full export)</option>
                  <option value="csv">CSV (connections only)</option>
                </select>
              </div>

              {exportFormat === 'json' && (
                <div className="form-row checkbox">
                  <label>
                    <input
                      type="checkbox"
                      checked={includeCredentials}
                      onChange={(e) => setIncludeCredentials(e.target.checked)}
                    />
                    Include credentials (passwords, SSH keys)
                  </label>
                  <p className="warning-text">
                    Warning: Credentials will be exported in plain text. Keep the export file secure.
                  </p>
                </div>
              )}

              <div className="export-info">
                {exportFormat === 'json' ? (
                  <p>
                    Export all connections, groups, and optionally credentials as a JSON file.
                    This can be used to backup your data or import into another Connectty instance.
                  </p>
                ) : (
                  <p>
                    Export connections as a CSV file. This is useful for reviewing connections
                    in a spreadsheet or importing into other applications.
                  </p>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          {activeTab === 'import' ? (
            <button
              className="btn btn-primary"
              onClick={handleImport}
              disabled={importing || !importData.trim()}
            >
              {importing ? 'Importing...' : 'Import'}
            </button>
          ) : (
            <button
              className="btn btn-primary"
              onClick={handleExport}
              disabled={exporting}
            >
              {exporting ? 'Exporting...' : 'Export'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function getPlaceholder(format: ImportFormat): string {
  switch (format) {
    case 'json':
      return `{
  "version": "1.0",
  "connections": [...],
  "credentials": [...],
  "groups": [...]
}`;
    case 'csv':
      return `name,hostname,port,username,tags,description
server1,192.168.1.1,22,root,web;production,Web server
server2,192.168.1.2,22,admin,,Database server`;
    case 'ssh-config':
      return `Host webserver
    HostName 192.168.1.1
    User root
    Port 22

Host dbserver
    HostName 192.168.1.2
    User admin`;
    default:
      return '';
  }
}
