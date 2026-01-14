import React, { useState } from 'react';
import type { ServerConnection, Credential, ConnectionGroup } from '@connectty/shared';

interface ConnectionModalProps {
  connection: ServerConnection | null;
  credentials: Credential[];
  groups: ConnectionGroup[];
  onClose: () => void;
  onSave: (data: Partial<ServerConnection>) => void;
  onDelete?: () => void;
}

export default function ConnectionModal({
  connection,
  credentials,
  groups,
  onClose,
  onSave,
  onDelete,
}: ConnectionModalProps) {
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
          <button className="btn btn-secondary btn-sm" onClick={onClose}>
            ×
          </button>
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
                autoFocus
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
            {onDelete && (
              <button
                type="button"
                className="btn btn-secondary"
                style={{ marginRight: 'auto', color: '#ef4444' }}
                onClick={onDelete}
              >
                Delete
              </button>
            )}
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
