import React, { useState, useEffect } from 'react';
import type { Provider } from '../services/api';

interface ProviderModalProps {
  provider: Provider | null;
  onClose: () => void;
  onSave: (data: Partial<Provider>) => void;
  onDelete?: () => void;
}

const PROVIDER_TYPES = [
  { value: 'vmware', label: 'VMware vSphere' },
  { value: 'proxmox', label: 'Proxmox VE' },
  { value: 'aws', label: 'AWS EC2' },
  { value: 'azure', label: 'Microsoft Azure' },
  { value: 'gcp', label: 'Google Cloud' },
  { value: 'bigfix', label: 'IBM BigFix' },
];

export default function ProviderModal({ provider, onClose, onSave, onDelete }: ProviderModalProps) {
  const [name, setName] = useState(provider?.name || '');
  const [type, setType] = useState(provider?.type || 'vmware');
  const [autoDiscover, setAutoDiscover] = useState(provider?.autoDiscover ?? false);
  const [discoverInterval, setDiscoverInterval] = useState(provider?.discoverInterval ?? 3600);

  // Config fields based on provider type
  const [host, setHost] = useState((provider?.config?.host as string) || '');
  const [port, setPort] = useState((provider?.config?.port as number) || getDefaultPort(provider?.type || 'vmware'));
  const [username, setUsername] = useState((provider?.config?.username as string) || '');
  const [password, setPassword] = useState('');
  const [ignoreCert, setIgnoreCert] = useState((provider?.config?.ignoreCert as boolean) ?? true);
  const [realm, setRealm] = useState((provider?.config?.realm as string) || 'pam');

  // AWS specific
  const [accessKeyId, setAccessKeyId] = useState((provider?.config?.accessKeyId as string) || '');
  const [secretAccessKey, setSecretAccessKey] = useState('');
  const [region, setRegion] = useState((provider?.config?.region as string) || 'us-east-1');
  const [regions, setRegions] = useState<string[]>((provider?.config?.regions as string[]) || []);

  // Azure specific
  const [tenantId, setTenantId] = useState((provider?.config?.tenantId as string) || '');
  const [clientId, setClientId] = useState((provider?.config?.clientId as string) || '');
  const [clientSecret, setClientSecret] = useState('');
  const [subscriptionId, setSubscriptionId] = useState((provider?.config?.subscriptionId as string) || '');

  // GCP specific
  const [projectId, setProjectId] = useState((provider?.config?.projectId as string) || '');
  const [serviceAccountKey, setServiceAccountKey] = useState('');

  function getDefaultPort(providerType: string): number {
    switch (providerType) {
      case 'vmware': return 443;
      case 'proxmox': return 8006;
      case 'bigfix': return 52311;
      default: return 443;
    }
  }

  useEffect(() => {
    setPort(getDefaultPort(type));
  }, [type]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const config: Record<string, unknown> = {};

    switch (type) {
      case 'vmware':
        config.host = host;
        config.port = port;
        config.username = username;
        if (password) config.password = password;
        config.ignoreCert = ignoreCert;
        break;

      case 'proxmox':
        config.host = host;
        config.port = port;
        config.username = username;
        if (password) config.password = password;
        config.realm = realm;
        config.ignoreCert = ignoreCert;
        break;

      case 'aws':
        config.accessKeyId = accessKeyId;
        if (secretAccessKey) config.secretAccessKey = secretAccessKey;
        config.region = region;
        if (regions.length > 0) config.regions = regions;
        break;

      case 'azure':
        config.tenantId = tenantId;
        config.clientId = clientId;
        if (clientSecret) config.clientSecret = clientSecret;
        config.subscriptionId = subscriptionId;
        break;

      case 'gcp':
        config.projectId = projectId;
        if (serviceAccountKey) config.serviceAccountKey = serviceAccountKey;
        break;

      case 'bigfix':
        config.host = host;
        config.username = username;
        if (password) config.password = password;
        break;
    }

    onSave({
      name,
      type,
      config,
      autoDiscover,
      discoverInterval,
    });
  };

  const renderConfigFields = () => {
    switch (type) {
      case 'vmware':
        return (
          <>
            <div className="form-row">
              <label>Host</label>
              <input
                type="text"
                value={host}
                onChange={(e) => setHost(e.target.value)}
                placeholder="vcenter.example.com"
                required
              />
            </div>
            <div className="form-row">
              <label>Port</label>
              <input
                type="number"
                value={port}
                onChange={(e) => setPort(parseInt(e.target.value))}
              />
            </div>
            <div className="form-row">
              <label>Username</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="administrator@vsphere.local"
                required
              />
            </div>
            <div className="form-row">
              <label>Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={provider ? '(unchanged)' : ''}
                required={!provider}
              />
            </div>
            <div className="form-row checkbox">
              <label>
                <input
                  type="checkbox"
                  checked={ignoreCert}
                  onChange={(e) => setIgnoreCert(e.target.checked)}
                />
                Ignore SSL certificate errors
              </label>
            </div>
          </>
        );

      case 'proxmox':
        return (
          <>
            <div className="form-row">
              <label>Host</label>
              <input
                type="text"
                value={host}
                onChange={(e) => setHost(e.target.value)}
                placeholder="proxmox.example.com"
                required
              />
            </div>
            <div className="form-row">
              <label>Port</label>
              <input
                type="number"
                value={port}
                onChange={(e) => setPort(parseInt(e.target.value))}
              />
            </div>
            <div className="form-row">
              <label>Username</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="root"
                required
              />
            </div>
            <div className="form-row">
              <label>Realm</label>
              <select value={realm} onChange={(e) => setRealm(e.target.value)}>
                <option value="pam">PAM</option>
                <option value="pve">Proxmox VE</option>
                <option value="ldap">LDAP</option>
              </select>
            </div>
            <div className="form-row">
              <label>Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={provider ? '(unchanged)' : ''}
                required={!provider}
              />
            </div>
            <div className="form-row checkbox">
              <label>
                <input
                  type="checkbox"
                  checked={ignoreCert}
                  onChange={(e) => setIgnoreCert(e.target.checked)}
                />
                Ignore SSL certificate errors
              </label>
            </div>
          </>
        );

      case 'aws':
        return (
          <>
            <div className="form-row">
              <label>Access Key ID</label>
              <input
                type="text"
                value={accessKeyId}
                onChange={(e) => setAccessKeyId(e.target.value)}
                placeholder="AKIAIOSFODNN7EXAMPLE"
                required
              />
            </div>
            <div className="form-row">
              <label>Secret Access Key</label>
              <input
                type="password"
                value={secretAccessKey}
                onChange={(e) => setSecretAccessKey(e.target.value)}
                placeholder={provider ? '(unchanged)' : ''}
                required={!provider}
              />
            </div>
            <div className="form-row">
              <label>Default Region</label>
              <input
                type="text"
                value={region}
                onChange={(e) => setRegion(e.target.value)}
                placeholder="us-east-1"
              />
            </div>
            <div className="form-row">
              <label>Additional Regions (comma-separated)</label>
              <input
                type="text"
                value={regions.join(', ')}
                onChange={(e) => setRegions(e.target.value.split(',').map(r => r.trim()).filter(Boolean))}
                placeholder="us-west-2, eu-west-1"
              />
            </div>
          </>
        );

      case 'azure':
        return (
          <>
            <div className="form-row">
              <label>Tenant ID</label>
              <input
                type="text"
                value={tenantId}
                onChange={(e) => setTenantId(e.target.value)}
                required
              />
            </div>
            <div className="form-row">
              <label>Client ID (Application ID)</label>
              <input
                type="text"
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                required
              />
            </div>
            <div className="form-row">
              <label>Client Secret</label>
              <input
                type="password"
                value={clientSecret}
                onChange={(e) => setClientSecret(e.target.value)}
                placeholder={provider ? '(unchanged)' : ''}
                required={!provider}
              />
            </div>
            <div className="form-row">
              <label>Subscription ID</label>
              <input
                type="text"
                value={subscriptionId}
                onChange={(e) => setSubscriptionId(e.target.value)}
                required
              />
            </div>
          </>
        );

      case 'gcp':
        return (
          <>
            <div className="form-row">
              <label>Project ID</label>
              <input
                type="text"
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
                required
              />
            </div>
            <div className="form-row">
              <label>Service Account Key (JSON)</label>
              <textarea
                value={serviceAccountKey}
                onChange={(e) => setServiceAccountKey(e.target.value)}
                placeholder={provider ? '(unchanged)' : 'Paste JSON key here'}
                rows={6}
                required={!provider}
              />
            </div>
          </>
        );

      case 'bigfix':
        return (
          <>
            <div className="form-row">
              <label>BigFix Server</label>
              <input
                type="text"
                value={host}
                onChange={(e) => setHost(e.target.value)}
                placeholder="bigfix.example.com:52311"
                required
              />
            </div>
            <div className="form-row">
              <label>Username</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
              />
            </div>
            <div className="form-row">
              <label>Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={provider ? '(unchanged)' : ''}
                required={!provider}
              />
            </div>
          </>
        );

      default:
        return null;
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{provider ? 'Edit Provider' : 'Add Provider'}</h2>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            <div className="form-row">
              <label>Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="My VMware vCenter"
                required
              />
            </div>

            <div className="form-row">
              <label>Provider Type</label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value)}
                disabled={!!provider}
              >
                {PROVIDER_TYPES.map((pt) => (
                  <option key={pt.value} value={pt.value}>
                    {pt.label}
                  </option>
                ))}
              </select>
            </div>

            <hr />

            {renderConfigFields()}

            <hr />

            <div className="form-row checkbox">
              <label>
                <input
                  type="checkbox"
                  checked={autoDiscover}
                  onChange={(e) => setAutoDiscover(e.target.checked)}
                />
                Auto-discover hosts periodically
              </label>
            </div>

            {autoDiscover && (
              <div className="form-row">
                <label>Discovery Interval (seconds)</label>
                <input
                  type="number"
                  value={discoverInterval}
                  onChange={(e) => setDiscoverInterval(parseInt(e.target.value))}
                  min={300}
                  max={86400}
                />
              </div>
            )}
          </div>

          <div className="modal-footer">
            {onDelete && (
              <button type="button" className="btn btn-danger" onClick={onDelete}>
                Delete
              </button>
            )}
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary">
              {provider ? 'Save' : 'Add Provider'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
