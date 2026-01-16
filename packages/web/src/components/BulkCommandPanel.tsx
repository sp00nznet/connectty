import { useState, useEffect, useRef } from 'react';
import { api, SavedCommand, CommandExecution, CommandExecutionWithResults } from '../services/api';
import type { ServerConnection } from '@connectty/shared';

interface BulkCommandPanelProps {
  connections: ServerConnection[];
  onNotification: (type: 'success' | 'error', message: string) => void;
}

export default function BulkCommandPanel({
  connections,
  onNotification,
}: BulkCommandPanelProps) {
  const [savedCommands, setSavedCommands] = useState<SavedCommand[]>([]);
  const [executions, setExecutions] = useState<CommandExecution[]>([]);
  const [selectedExecution, setSelectedExecution] = useState<CommandExecutionWithResults | null>(null);
  const [selectedConnections, setSelectedConnections] = useState<Set<string>>(new Set());
  const [command, setCommand] = useState('');
  const [selectedCommandId, setSelectedCommandId] = useState('');
  const [maxParallel, setMaxParallel] = useState(10);
  const [executing, setExecuting] = useState(false);
  const [view, setView] = useState<'execute' | 'history' | 'saved'>('execute');

  // Saved command form
  const [showSaveForm, setShowSaveForm] = useState(false);
  const [newCommandName, setNewCommandName] = useState('');
  const [newCommandDescription, setNewCommandDescription] = useState('');
  const [newCommandCategory, setNewCommandCategory] = useState('');
  const [newCommandTargetOs, setNewCommandTargetOs] = useState('all');

  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    loadSavedCommands();
    loadExecutions();
    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, []);

  const loadSavedCommands = async () => {
    try {
      const commands = await api.getSavedCommands();
      setSavedCommands(commands);
    } catch (err) {
      onNotification('error', 'Failed to load saved commands');
    }
  };

  const loadExecutions = async () => {
    try {
      const execs = await api.getCommandExecutions(20);
      setExecutions(execs);
    } catch (err) {
      onNotification('error', 'Failed to load execution history');
    }
  };

  const loadExecutionDetails = async (id: string) => {
    try {
      const details = await api.getCommandExecution(id);
      setSelectedExecution(details);

      // Poll if still running
      if (details?.status === 'running' || details?.status === 'pending') {
        if (pollIntervalRef.current) {
          clearInterval(pollIntervalRef.current);
        }
        pollIntervalRef.current = setInterval(async () => {
          const updated = await api.getCommandExecution(id);
          setSelectedExecution(updated);
          if (updated?.status === 'completed' || updated?.status === 'failed') {
            if (pollIntervalRef.current) {
              clearInterval(pollIntervalRef.current);
              pollIntervalRef.current = null;
            }
            await loadExecutions();
          }
        }, 2000);
      }
    } catch (err) {
      onNotification('error', 'Failed to load execution details');
    }
  };

  const handleToggleConnection = (connId: string) => {
    const newSelected = new Set(selectedConnections);
    if (newSelected.has(connId)) {
      newSelected.delete(connId);
    } else {
      newSelected.add(connId);
    }
    setSelectedConnections(newSelected);
  };

  const handleSelectAll = () => {
    if (selectedConnections.size === connections.length) {
      setSelectedConnections(new Set());
    } else {
      setSelectedConnections(new Set(connections.map(c => c.id)));
    }
  };

  const handleSelectSavedCommand = (commandId: string) => {
    setSelectedCommandId(commandId);
    const cmd = savedCommands.find(c => c.id === commandId);
    if (cmd) {
      setCommand(cmd.command);
    }
  };

  const handleExecute = async () => {
    if (selectedConnections.size === 0) {
      onNotification('error', 'Select at least one connection');
      return;
    }

    if (!command.trim() && !selectedCommandId) {
      onNotification('error', 'Enter a command or select a saved command');
      return;
    }

    try {
      setExecuting(true);
      const result = await api.executeCommand({
        command: command.trim() || undefined,
        commandId: selectedCommandId || undefined,
        connectionIds: Array.from(selectedConnections),
        maxParallel,
      });

      onNotification('success', `Execution started on ${result.connectionCount} hosts`);
      await loadExecutions();
      loadExecutionDetails(result.executionId);
      setView('history');
    } catch (err) {
      onNotification('error', (err as Error).message);
    } finally {
      setExecuting(false);
    }
  };

  const handleSaveCommand = async () => {
    if (!command.trim() || !newCommandName.trim()) {
      onNotification('error', 'Command and name are required');
      return;
    }

    try {
      await api.createSavedCommand({
        name: newCommandName,
        description: newCommandDescription || undefined,
        command: command.trim(),
        category: newCommandCategory || undefined,
        targetOs: newCommandTargetOs,
      });

      onNotification('success', 'Command saved');
      await loadSavedCommands();
      setShowSaveForm(false);
      setNewCommandName('');
      setNewCommandDescription('');
      setNewCommandCategory('');
    } catch (err) {
      onNotification('error', (err as Error).message);
    }
  };

  const handleDeleteSavedCommand = async (id: string) => {
    if (confirm('Delete this saved command?')) {
      try {
        await api.deleteSavedCommand(id);
        await loadSavedCommands();
        if (selectedCommandId === id) {
          setSelectedCommandId('');
        }
        onNotification('success', 'Command deleted');
      } catch (err) {
        onNotification('error', (err as Error).message);
      }
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return '#00c853';
      case 'running': return '#2196f3';
      case 'failed': return '#ff5252';
      case 'pending': return '#ffc107';
      default: return '#888';
    }
  };

  const renderExecuteView = () => (
    <div className="command-execute">
      <div className="command-input-section">
        <div className="form-row">
          <label>Saved Command</label>
          <select
            value={selectedCommandId}
            onChange={(e) => handleSelectSavedCommand(e.target.value)}
          >
            <option value="">-- Select saved command --</option>
            {savedCommands.map((cmd) => (
              <option key={cmd.id} value={cmd.id}>
                {cmd.category ? `[${cmd.category}] ` : ''}{cmd.name}
              </option>
            ))}
          </select>
        </div>

        <div className="form-row">
          <label>Command</label>
          <textarea
            value={command}
            onChange={(e) => setCommand(e.target.value)}
            placeholder="Enter command to execute..."
            rows={4}
          />
        </div>

        <div className="command-actions">
          <button
            className="btn btn-secondary"
            onClick={() => setShowSaveForm(!showSaveForm)}
            disabled={!command.trim()}
          >
            Save Command
          </button>

          <div className="form-row inline">
            <label>Max Parallel:</label>
            <input
              type="number"
              value={maxParallel}
              onChange={(e) => setMaxParallel(parseInt(e.target.value))}
              min={1}
              max={50}
              style={{ width: '60px' }}
            />
          </div>

          <button
            className="btn btn-primary"
            onClick={handleExecute}
            disabled={executing || selectedConnections.size === 0}
          >
            {executing ? 'Executing...' : `Execute on ${selectedConnections.size} hosts`}
          </button>
        </div>

        {showSaveForm && (
          <div className="save-command-form">
            <div className="form-row">
              <label>Name</label>
              <input
                type="text"
                value={newCommandName}
                onChange={(e) => setNewCommandName(e.target.value)}
                placeholder="Command name"
              />
            </div>
            <div className="form-row">
              <label>Description</label>
              <input
                type="text"
                value={newCommandDescription}
                onChange={(e) => setNewCommandDescription(e.target.value)}
                placeholder="Optional description"
              />
            </div>
            <div className="form-row">
              <label>Category</label>
              <input
                type="text"
                value={newCommandCategory}
                onChange={(e) => setNewCommandCategory(e.target.value)}
                placeholder="Optional category"
              />
            </div>
            <div className="form-row">
              <label>Target OS</label>
              <select
                value={newCommandTargetOs}
                onChange={(e) => setNewCommandTargetOs(e.target.value)}
              >
                <option value="all">All</option>
                <option value="linux">Linux</option>
                <option value="windows">Windows</option>
              </select>
            </div>
            <button className="btn btn-primary" onClick={handleSaveCommand}>
              Save
            </button>
          </div>
        )}
      </div>

      <div className="connection-select-section">
        <div className="section-header">
          <h4>Target Connections</h4>
          <button className="btn btn-sm" onClick={handleSelectAll}>
            {selectedConnections.size === connections.length ? 'Deselect All' : 'Select All'}
          </button>
        </div>

        <div className="connection-grid">
          {connections.map((conn) => (
            <label key={conn.id} className="connection-checkbox">
              <input
                type="checkbox"
                checked={selectedConnections.has(conn.id)}
                onChange={() => handleToggleConnection(conn.id)}
              />
              <span className="connection-label">
                {conn.name}
                <span className="connection-host">{conn.hostname}</span>
              </span>
            </label>
          ))}
        </div>
      </div>
    </div>
  );

  const renderHistoryView = () => (
    <div className="command-history">
      <div className="execution-list">
        <h4>Recent Executions</h4>
        {executions.map((exec) => (
          <div
            key={exec.id}
            className={`execution-item ${selectedExecution?.id === exec.id ? 'selected' : ''}`}
            onClick={() => loadExecutionDetails(exec.id)}
          >
            <span
              className="status-indicator"
              style={{ backgroundColor: getStatusColor(exec.status) }}
            />
            <div className="execution-info">
              <div className="execution-name">{exec.commandName}</div>
              <div className="execution-meta">
                {exec.connectionIds.length} hosts • {new Date(exec.startedAt).toLocaleString()}
              </div>
            </div>
            <span className={`status-badge ${exec.status}`}>{exec.status}</span>
          </div>
        ))}

        {executions.length === 0 && (
          <p className="empty-state">No executions yet</p>
        )}
      </div>

      <div className="execution-details">
        {selectedExecution ? (
          <>
            <div className="execution-header">
              <h4>{selectedExecution.commandName}</h4>
              <span className={`status-badge ${selectedExecution.status}`}>
                {selectedExecution.status}
              </span>
            </div>

            <div className="execution-command">
              <code>{selectedExecution.command}</code>
            </div>

            <div className="results-list">
              {selectedExecution.results.map((result) => (
                <div key={result.id} className={`result-item ${result.status}`}>
                  <div className="result-header">
                    <span
                      className="status-indicator"
                      style={{ backgroundColor: getStatusColor(result.status) }}
                    />
                    <span className="result-name">{result.connectionName}</span>
                    <span className="result-host">{result.hostname}</span>
                    {result.exitCode !== undefined && (
                      <span className={`exit-code ${result.exitCode === 0 ? 'success' : 'error'}`}>
                        Exit: {result.exitCode}
                      </span>
                    )}
                  </div>

                  {result.stdout && (
                    <pre className="result-output stdout">{result.stdout}</pre>
                  )}

                  {result.stderr && (
                    <pre className="result-output stderr">{result.stderr}</pre>
                  )}

                  {result.error && (
                    <pre className="result-output error">{result.error}</pre>
                  )}

                  {result.status === 'pending' && (
                    <div className="result-pending">Waiting...</div>
                  )}

                  {result.status === 'running' && (
                    <div className="result-running">Running...</div>
                  )}
                </div>
              ))}
            </div>
          </>
        ) : (
          <div className="empty-state centered">
            <p>Select an execution to view results</p>
          </div>
        )}
      </div>
    </div>
  );

  const renderSavedView = () => (
    <div className="saved-commands">
      <div className="saved-commands-list">
        {savedCommands.map((cmd) => (
          <div key={cmd.id} className="saved-command-item">
            <div className="saved-command-info">
              <div className="saved-command-name">
                {cmd.category && <span className="category-tag">{cmd.category}</span>}
                {cmd.name}
              </div>
              {cmd.description && (
                <div className="saved-command-description">{cmd.description}</div>
              )}
              <code className="saved-command-code">{cmd.command}</code>
              <div className="saved-command-meta">
                Target: {cmd.targetOs} • Created: {new Date(cmd.createdAt).toLocaleDateString()}
              </div>
            </div>
            <div className="saved-command-actions">
              <button
                className="btn btn-primary btn-sm"
                onClick={() => {
                  setSelectedCommandId(cmd.id);
                  setCommand(cmd.command);
                  setView('execute');
                }}
              >
                Use
              </button>
              <button
                className="btn btn-danger btn-sm"
                onClick={() => handleDeleteSavedCommand(cmd.id)}
              >
                Delete
              </button>
            </div>
          </div>
        ))}

        {savedCommands.length === 0 && (
          <div className="empty-state">
            <p>No saved commands</p>
            <p>Save a command from the Execute tab</p>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="bulk-command-panel">
      <div className="panel-tabs">
        <button
          className={`tab ${view === 'execute' ? 'active' : ''}`}
          onClick={() => setView('execute')}
        >
          Execute
        </button>
        <button
          className={`tab ${view === 'history' ? 'active' : ''}`}
          onClick={() => setView('history')}
        >
          History
        </button>
        <button
          className={`tab ${view === 'saved' ? 'active' : ''}`}
          onClick={() => setView('saved')}
        >
          Saved Commands
        </button>
      </div>

      <div className="panel-content">
        {view === 'execute' && renderExecuteView()}
        {view === 'history' && renderHistoryView()}
        {view === 'saved' && renderSavedView()}
      </div>
    </div>
  );
}
