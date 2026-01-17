import { useState, useEffect } from 'react';
import { api, Provider, DiscoveredHost } from '../services/api';
import type { Credential, ConnectionGroup, ProviderSyncResult } from '@connectty/shared';
import ProviderModal from './ProviderModal';

interface ProviderPanelProps {
  credentials: Credential[];
  groups: ConnectionGroup[];
  onHostsImported: () => void;
  onNotification: (type: 'success' | 'error', message: string) => void;
}

export default function ProviderPanel({
  credentials,
  groups,
  onHostsImported,
  onNotification,
}: ProviderPanelProps) {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [selectedProvider, setSelectedProvider] = useState<Provider | null>(null);
  const [discoveredHosts, setDiscoveredHosts] = useState<DiscoveredHost[]>([]);
  const [selectedHosts, setSelectedHosts] = useState<Set<string>>(new Set());
  const [showProviderModal, setShowProviderModal] = useState(false);
  const [editingProvider, setEditingProvider] = useState<Provider | null>(null);
  const [loading, setLoading] = useState(false);
  const [discovering, setDiscovering] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<ProviderSyncResult | null>(null);
  const [importing, setImporting] = useState(false);

  // Import options
  const [importCredentialId, setImportCredentialId] = useState('');
  const [importGroupId, setImportGroupId] = useState('');
  const [ipPreference, setIpPreference] = useState<'private' | 'public' | 'hostname'>('private');

  useEffect(() => {
    loadProviders();
  }, []);

  useEffect(() => {
    if (selectedProvider) {
      loadDiscoveredHosts(selectedProvider.id);
    } else {
      setDiscoveredHosts([]);
    }
    setSelectedHosts(new Set());
  }, [selectedProvider]);

  const loadProviders = async () => {
    try {
      setLoading(true);
      const data = await api.getProviders();
      setProviders(data);
    } catch (err) {
      onNotification('error', 'Failed to load providers');
    } finally {
      setLoading(false);
    }
  };

  const loadDiscoveredHosts = async (providerId: string) => {
    try {
      const hosts = await api.getDiscoveredHosts(providerId);
      setDiscoveredHosts(hosts);
    } catch (err) {
      onNotification('error', 'Failed to load discovered hosts');
    }
  };

  const handleSaveProvider = async (data: Partial<Provider>) => {
    try {
      if (editingProvider) {
        await api.updateProvider(editingProvider.id, data);
        onNotification('success', 'Provider updated');
      } else {
        await api.createProvider(data);
        onNotification('success', 'Provider created');
      }
      await loadProviders();
      setShowProviderModal(false);
      setEditingProvider(null);
    } catch (err) {
      onNotification('error', (err as Error).message);
    }
  };

  const handleDeleteProvider = async () => {
    if (!editingProvider) return;

    if (confirm('Are you sure you want to delete this provider?')) {
      try {
        await api.deleteProvider(editingProvider.id);
        if (selectedProvider?.id === editingProvider.id) {
          setSelectedProvider(null);
        }
        await loadProviders();
        setShowProviderModal(false);
        setEditingProvider(null);
        onNotification('success', 'Provider deleted');
      } catch (err) {
        onNotification('error', (err as Error).message);
      }
    }
  };

  const handleTestProvider = async (provider: Provider) => {
    try {
      const result = await api.testProvider(provider.id);
      onNotification(result.success ? 'success' : 'error', result.message);
    } catch (err) {
      onNotification('error', (err as Error).message);
    }
  };

  const handleDiscover = async () => {
    if (!selectedProvider) return;

    try {
      setDiscovering(true);
      setSyncResult(null);
      const hosts = await api.discoverHosts(selectedProvider.id);
      setDiscoveredHosts(hosts);
      onNotification('success', `Discovered ${hosts.length} hosts`);
    } catch (err) {
      onNotification('error', (err as Error).message);
    } finally {
      setDiscovering(false);
    }
  };

  const handleSync = async () => {
    if (!selectedProvider) return;

    try {
      setSyncing(true);
      const result = await api.syncProvider(selectedProvider.id);
      setSyncResult(result);
      await loadDiscoveredHosts(selectedProvider.id);

      const messages: string[] = [];
      if (result.summary.new > 0) messages.push(`${result.summary.new} new`);
      if (result.summary.removed > 0) messages.push(`${result.summary.removed} removed`);
      if (result.summary.changed > 0) messages.push(`${result.summary.changed} changed`);

      if (messages.length > 0) {
        onNotification('success', `Sync complete: ${messages.join(', ')}`);
      } else {
        onNotification('success', 'Sync complete: No changes detected');
      }
    } catch (err) {
      onNotification('error', (err as Error).message);
    } finally {
      setSyncing(false);
    }
  };

  const handleToggleHost = (hostId: string) => {
    const newSelected = new Set(selectedHosts);
    if (newSelected.has(hostId)) {
      newSelected.delete(hostId);
    } else {
      newSelected.add(hostId);
    }
    setSelectedHosts(newSelected);
  };

  const handleSelectAll = () => {
    if (selectedHosts.size === discoveredHosts.filter(h => !h.imported).length) {
      setSelectedHosts(new Set());
    } else {
      setSelectedHosts(new Set(discoveredHosts.filter(h => !h.imported).map(h => h.id)));
    }
  };

  const handleImport = async () => {
    if (!selectedProvider || selectedHosts.size === 0) return;

    try {
      setImporting(true);
      const result = await api.importHosts(
        selectedProvider.id,
        Array.from(selectedHosts),
        {
          credentialId: importCredentialId || undefined,
          group: importGroupId || undefined,
          ipPreference,
        }
      );

      if (result.imported > 0) {
        onNotification('success', `Imported ${result.imported} hosts`);
        onHostsImported();
        await loadDiscoveredHosts(selectedProvider.id);
        setSelectedHosts(new Set());
      }

      if (result.errors > 0) {
        console.error('Import errors:', result.errorDetails);
        onNotification('error', `${result.errors} hosts failed to import`);
      }
    } catch (err) {
      onNotification('error', (err as Error).message);
    } finally {
      setImporting(false);
    }
  };

  const getProviderIcon = (type: string) => {
    switch (type) {
      case 'vmware':
        return '🖥️';
      case 'proxmox':
        return '📦';
      case 'aws':
        return '☁️';
      case 'azure':
        return '🔷';
      case 'gcp':
        return '🌐';
      case 'bigfix':
        return '🔧';
      default:
        return '🔌';
    }
  };

  const getStateColor = (state?: string) => {
    switch (state?.toLowerCase()) {
      case 'running':
      case 'powered_on':
      case 'poweredon':
      case 'online':
        return '#00c853';
      case 'stopped':
      case 'powered_off':
      case 'poweredoff':
      case 'offline':
        return '#ff5252';
      case 'suspended':
      case 'paused':
        return '#ffc107';
      default:
        return '#888';
    }
  };

  return (
    <div className="provider-panel">
      <div className="provider-sidebar">
        <div className="provider-sidebar-header">
          <h3>Providers</h3>
          <button
            className="btn btn-primary btn-sm"
            onClick={() => {
              setEditingProvider(null);
              setShowProviderModal(true);
            }}
          >
            + Add
          </button>
        </div>

        <ul className="provider-list">
          {providers.map((provider) => (
            <li
              key={provider.id}
              className={`provider-item ${selectedProvider?.id === provider.id ? 'selected' : ''}`}
              onClick={() => setSelectedProvider(provider)}
            >
              <span className="provider-icon">{getProviderIcon(provider.type)}</span>
              <div className="provider-info">
                <div className="provider-name">{provider.name}</div>
                <div className="provider-type">{provider.type}</div>
              </div>
              <div className="provider-actions">
                <button
                  className="btn btn-sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleTestProvider(provider);
                  }}
                  title="Test connection"
                >
                  🔌
                </button>
                <button
                  className="btn btn-sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    setEditingProvider(provider);
                    setShowProviderModal(true);
                  }}
                  title="Edit"
                >
                  ✏️
                </button>
              </div>
            </li>
          ))}

          {providers.length === 0 && !loading && (
            <li className="empty-state">
              <p>No providers configured</p>
              <p>Add a cloud provider to discover hosts</p>
            </li>
          )}
        </ul>
      </div>

      <div className="provider-content">
        {selectedProvider ? (
          <>
            <div className="provider-content-header">
              <h3>
                {getProviderIcon(selectedProvider.type)} {selectedProvider.name}
              </h3>
              <div className="button-group">
                <button
                  className="btn btn-secondary"
                  onClick={handleSync}
                  disabled={syncing || discovering}
                  title="Incremental sync - detects new, removed, and changed hosts"
                >
                  {syncing ? 'Syncing...' : 'Sync'}
                </button>
                <button
                  className="btn btn-primary"
                  onClick={handleDiscover}
                  disabled={discovering || syncing}
                  title="Full discovery - fetches all hosts from provider"
                >
                  {discovering ? 'Discovering...' : 'Discover Hosts'}
                </button>
              </div>
            </div>

            {syncResult && (syncResult.summary.new > 0 || syncResult.summary.removed > 0 || syncResult.summary.changed > 0) && (
              <div className="sync-result-banner">
                <div className="sync-result-title">Last Sync Results</div>
                <div className="sync-result-stats">
                  {syncResult.summary.new > 0 && (
                    <span className="sync-stat new">
                      +{syncResult.summary.new} new
                    </span>
                  )}
                  {syncResult.summary.removed > 0 && (
                    <span className="sync-stat removed">
                      -{syncResult.summary.removed} removed
                    </span>
                  )}
                  {syncResult.summary.changed > 0 && (
                    <span className="sync-stat changed">
                      ~{syncResult.summary.changed} changed
                    </span>
                  )}
                  <span className="sync-stat total">
                    {syncResult.summary.total} total
                  </span>
                </div>
                <button
                  className="btn btn-sm"
                  onClick={() => setSyncResult(null)}
                  title="Dismiss"
                >
                  &times;
                </button>
              </div>
            )}

            {discoveredHosts.length > 0 && (
              <>
                <div className="import-options">
                  <div className="form-row inline">
                    <label>Credential:</label>
                    <select
                      value={importCredentialId}
                      onChange={(e) => setImportCredentialId(e.target.value)}
                    >
                      <option value="">None</option>
                      {credentials.map((cred) => (
                        <option key={cred.id} value={cred.id}>
                          {cred.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="form-row inline">
                    <label>Group:</label>
                    <select
                      value={importGroupId}
                      onChange={(e) => setImportGroupId(e.target.value)}
                    >
                      <option value="">None</option>
                      {groups.map((group) => (
                        <option key={group.id} value={group.id}>
                          {group.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="form-row inline">
                    <label>IP Preference:</label>
                    <select
                      value={ipPreference}
                      onChange={(e) => setIpPreference(e.target.value as 'private' | 'public' | 'hostname')}
                    >
                      <option value="private">Private IP</option>
                      <option value="public">Public IP</option>
                      <option value="hostname">Hostname</option>
                    </select>
                  </div>

                  <button
                    className="btn btn-primary"
                    onClick={handleImport}
                    disabled={selectedHosts.size === 0 || importing}
                  >
                    {importing ? 'Importing...' : `Import Selected (${selectedHosts.size})`}
                  </button>
                </div>

                <table className="host-table">
                  <thead>
                    <tr>
                      <th>
                        <input
                          type="checkbox"
                          checked={selectedHosts.size === discoveredHosts.filter(h => !h.imported).length && discoveredHosts.some(h => !h.imported)}
                          onChange={handleSelectAll}
                        />
                      </th>
                      <th>Name</th>
                      <th>Hostname/IP</th>
                      <th>OS</th>
                      <th>State</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {discoveredHosts.map((host) => (
                      <tr key={host.id} className={host.imported ? 'imported' : ''}>
                        <td>
                          <input
                            type="checkbox"
                            checked={selectedHosts.has(host.id)}
                            onChange={() => handleToggleHost(host.id)}
                            disabled={host.imported}
                          />
                        </td>
                        <td>{host.name}</td>
                        <td>
                          {host.hostname || host.privateIp || host.publicIp || '-'}
                          {host.privateIp && host.publicIp && (
                            <span className="ip-alt" title={`Public: ${host.publicIp}`}>
                              ({host.publicIp})
                            </span>
                          )}
                        </td>
                        <td>{host.osName || host.osType || '-'}</td>
                        <td>
                          <span
                            className="state-indicator"
                            style={{ backgroundColor: getStateColor(host.state) }}
                          />
                          {host.state || '-'}
                        </td>
                        <td>
                          {host.imported ? (
                            <span className="badge imported">Imported</span>
                          ) : (
                            <span className="badge new">New</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}

            {discoveredHosts.length === 0 && (
              <div className="empty-state centered">
                <p>No hosts discovered yet</p>
                <p>Click "Discover Hosts" to scan this provider</p>
              </div>
            )}
          </>
        ) : (
          <div className="empty-state centered">
            <p>Select a provider to view discovered hosts</p>
          </div>
        )}
      </div>

      {showProviderModal && (
        <ProviderModal
          provider={editingProvider}
          onClose={() => {
            setShowProviderModal(false);
            setEditingProvider(null);
          }}
          onSave={handleSaveProvider}
          onDelete={editingProvider ? handleDeleteProvider : undefined}
        />
      )}
    </div>
  );
}
