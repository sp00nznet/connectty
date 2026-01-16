import { useState, useEffect } from 'react';
import { api } from '../services/api';
import type { ConnectionGroup } from '@connectty/shared';

interface GroupModalProps {
  onClose: () => void;
  onGroupsChanged: () => void;
  onNotification: (type: 'success' | 'error', message: string) => void;
}

const PRESET_COLORS = [
  '#e94560', // Red
  '#ff6b35', // Orange
  '#ffc107', // Yellow
  '#4caf50', // Green
  '#00bcd4', // Cyan
  '#2196f3', // Blue
  '#9c27b0', // Purple
  '#e91e63', // Pink
  '#795548', // Brown
  '#607d8b', // Gray
];

export default function GroupModal({ onClose, onGroupsChanged, onNotification }: GroupModalProps) {
  const [groups, setGroups] = useState<ConnectionGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<ConnectionGroup | null>(null);
  const [showForm, setShowForm] = useState(false);

  // Form state
  const [name, setName] = useState('');
  const [color, setColor] = useState(PRESET_COLORS[0]);
  const [description, setDescription] = useState('');

  useEffect(() => {
    loadGroups();
  }, []);

  const loadGroups = async () => {
    try {
      setLoading(true);
      const data = await api.getGroups();
      setGroups(data);
    } catch (err) {
      onNotification('error', 'Failed to load groups');
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setName('');
    setColor(PRESET_COLORS[0]);
    setDescription('');
    setEditing(null);
    setShowForm(false);
  };

  const handleEdit = (group: ConnectionGroup) => {
    setEditing(group);
    setName(group.name);
    setColor(group.color || PRESET_COLORS[0]);
    setDescription(group.description || '');
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!name.trim()) {
      onNotification('error', 'Name is required');
      return;
    }

    const data: Partial<ConnectionGroup> = {
      name,
      color,
      description: description || undefined,
    };

    try {
      if (editing) {
        await api.updateGroup(editing.id, data);
        onNotification('success', 'Group updated');
      } else {
        await api.createGroup(data);
        onNotification('success', 'Group created');
      }
      await loadGroups();
      onGroupsChanged();
      resetForm();
    } catch (err) {
      onNotification('error', (err as Error).message);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this group? Connections in this group will become ungrouped.')) return;

    try {
      await api.deleteGroup(id);
      onNotification('success', 'Group deleted');
      await loadGroups();
      onGroupsChanged();
    } catch (err) {
      onNotification('error', (err as Error).message);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal group-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Groups</h2>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>

        <div className="modal-body">
          {!showForm ? (
            <>
              <div className="group-actions">
                <button
                  className="btn btn-primary"
                  onClick={() => setShowForm(true)}
                >
                  + New Group
                </button>
              </div>

              {loading ? (
                <div className="loading">Loading...</div>
              ) : (
                <div className="group-list">
                  {groups.map((group) => (
                    <div key={group.id} className="group-item">
                      <div
                        className="group-color-indicator"
                        style={{ backgroundColor: group.color }}
                      />
                      <div className="group-info">
                        <div className="group-name">{group.name}</div>
                        {group.description && (
                          <div className="group-description">{group.description}</div>
                        )}
                      </div>
                      <div className="group-item-actions">
                        <button
                          className="btn btn-sm"
                          onClick={() => handleEdit(group)}
                        >
                          Edit
                        </button>
                        <button
                          className="btn btn-sm btn-danger"
                          onClick={() => handleDelete(group.id)}
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  ))}

                  {groups.length === 0 && (
                    <div className="empty-state">
                      <p>No groups created</p>
                      <p>Create groups to organize your connections</p>
                    </div>
                  )}
                </div>
              )}
            </>
          ) : (
            <div className="group-form">
              <h3>{editing ? 'Edit Group' : 'New Group'}</h3>

              <div className="form-row">
                <label>Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Production Servers"
                />
              </div>

              <div className="form-row">
                <label>Color</label>
                <div className="color-picker">
                  {PRESET_COLORS.map((c) => (
                    <button
                      key={c}
                      className={`color-swatch ${color === c ? 'selected' : ''}`}
                      style={{ backgroundColor: c }}
                      onClick={() => setColor(c)}
                      type="button"
                    />
                  ))}
                  <input
                    type="color"
                    value={color}
                    onChange={(e) => setColor(e.target.value)}
                    className="color-input"
                    title="Custom color"
                  />
                </div>
              </div>

              <div className="form-row">
                <label>Description (optional)</label>
                <input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Production environment servers"
                />
              </div>

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
