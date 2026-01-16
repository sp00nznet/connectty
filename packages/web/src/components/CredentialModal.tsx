import { useState, useEffect } from 'react';
import { api } from '../services/api';
import type { Credential, CredentialType } from '@connectty/shared';

interface CredentialModalProps {
  onClose: () => void;
  onNotification: (type: 'success' | 'error', message: string) => void;
}

export default function CredentialModal({ onClose, onNotification }: CredentialModalProps) {
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Credential | null>(null);
  const [showForm, setShowForm] = useState(false);

  // Form state
  const [name, setName] = useState('');
  const [credentialType, setCredentialType] = useState<CredentialType>('password');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [privateKey, setPrivateKey] = useState('');
  const [passphrase, setPassphrase] = useState('');
  const [domain, setDomain] = useState('');

  useEffect(() => {
    loadCredentials();
  }, []);

  const loadCredentials = async () => {
    try {
      setLoading(true);
      const data = await api.getCredentials();
      setCredentials(data);
    } catch (err) {
      onNotification('error', 'Failed to load credentials');
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setName('');
    setCredentialType('password');
    setUsername('');
    setPassword('');
    setPrivateKey('');
    setPassphrase('');
    setDomain('');
    setEditing(null);
    setShowForm(false);
  };

  const handleEdit = (cred: Credential) => {
    setEditing(cred);
    setName(cred.name);
    setCredentialType(cred.type);
    setUsername(cred.username || '');
    setPassword('');
    setPrivateKey('');
    setPassphrase('');
    setDomain(cred.domain || '');
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!name.trim()) {
      onNotification('error', 'Name is required');
      return;
    }

    const data: Partial<Credential> = {
      name,
      type: credentialType,
      username: username || undefined,
      domain: domain || undefined,
    };

    if (credentialType === 'password' && password) {
      data.password = password;
    } else if (credentialType === 'privateKey') {
      if (privateKey) data.privateKey = privateKey;
      if (passphrase) data.passphrase = passphrase;
    }

    try {
      if (editing) {
        await api.updateCredential(editing.id, data);
        onNotification('success', 'Credential updated');
      } else {
        await api.createCredential(data);
        onNotification('success', 'Credential created');
      }
      await loadCredentials();
      resetForm();
    } catch (err) {
      onNotification('error', (err as Error).message);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this credential?')) return;

    try {
      await api.deleteCredential(id);
      onNotification('success', 'Credential deleted');
      await loadCredentials();
    } catch (err) {
      onNotification('error', (err as Error).message);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      setPrivateKey(event.target?.result as string);
    };
    reader.readAsText(file);
  };

  return (
    <div className="modal-overlay">
      <div className="modal credential-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Credentials</h2>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>

        <div className="modal-body">
          {!showForm ? (
            <>
              <div className="credential-actions">
                <button
                  className="btn btn-primary"
                  onClick={() => setShowForm(true)}
                >
                  + New Credential
                </button>
              </div>

              {loading ? (
                <div className="loading">Loading...</div>
              ) : (
                <div className="credential-list">
                  {credentials.map((cred) => (
                    <div key={cred.id} className="credential-item">
                      <div className="credential-icon">
                        {cred.type === 'password' ? '🔑' : '🔐'}
                      </div>
                      <div className="credential-info">
                        <div className="credential-name">{cred.name}</div>
                        <div className="credential-meta">
                          {cred.type} {cred.username && `• ${cred.username}`}
                          {cred.domain && ` (${cred.domain})`}
                        </div>
                      </div>
                      <div className="credential-item-actions">
                        <button
                          className="btn btn-sm"
                          onClick={() => handleEdit(cred)}
                        >
                          Edit
                        </button>
                        <button
                          className="btn btn-sm btn-danger"
                          onClick={() => handleDelete(cred.id)}
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  ))}

                  {credentials.length === 0 && (
                    <div className="empty-state">
                      <p>No credentials saved</p>
                      <p>Create credentials to reuse across connections</p>
                    </div>
                  )}
                </div>
              )}
            </>
          ) : (
            <div className="credential-form">
              <h3>{editing ? 'Edit Credential' : 'New Credential'}</h3>

              <div className="form-row">
                <label>Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="My SSH Key"
                />
              </div>

              <div className="form-row">
                <label>Type</label>
                <select
                  value={credentialType}
                  onChange={(e) => setCredentialType(e.target.value as CredentialType)}
                >
                  <option value="password">Password</option>
                  <option value="privateKey">SSH Private Key</option>
                </select>
              </div>

              <div className="form-row">
                <label>Username</label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="root"
                />
              </div>

              {credentialType === 'password' && (
                <>
                  <div className="form-row">
                    <label>Password {editing && '(leave blank to keep current)'}</label>
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                    />
                  </div>
                  <div className="form-row">
                    <label>Domain (optional, for RDP/Windows)</label>
                    <input
                      type="text"
                      value={domain}
                      onChange={(e) => setDomain(e.target.value)}
                      placeholder="DOMAIN"
                    />
                  </div>
                </>
              )}

              {credentialType === 'privateKey' && (
                <>
                  <div className="form-row">
                    <label>Private Key {editing && '(leave blank to keep current)'}</label>
                    <div className="key-input-group">
                      <textarea
                        value={privateKey}
                        onChange={(e) => setPrivateKey(e.target.value)}
                        placeholder="-----BEGIN OPENSSH PRIVATE KEY-----
..."
                        rows={6}
                      />
                      <input
                        type="file"
                        id="key-file-input"
                        onChange={handleFileUpload}
                        style={{ display: 'none' }}
                      />
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => document.getElementById('key-file-input')?.click()}
                      >
                        Browse...
                      </button>
                    </div>
                  </div>
                  <div className="form-row">
                    <label>Passphrase (if key is encrypted)</label>
                    <input
                      type="password"
                      value={passphrase}
                      onChange={(e) => setPassphrase(e.target.value)}
                      placeholder="••••••••"
                    />
                  </div>
                </>
              )}

              <div className="form-actions">
                <button className="btn btn-secondary" onClick={resetForm}>
                  Cancel
                </button>
                <button className="btn btn-primary" onClick={handleSave}>
                  {editing ? 'Update' : 'Create'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
