# Groups and Plugins Feature Implementation Guide

This guide covers the new dynamic groups feature and plugin system implemented in Connectty.

## Table of Contents

1. [Dynamic Groups Feature](#dynamic-groups-feature)
2. [Plugin System](#plugin-system)
3. [Backend Implementation](#backend-implementation)
4. [Frontend Integration Examples](#frontend-integration-examples)

---

## Dynamic Groups Feature

### Overview

Groups can now be **static** (manually assigned) or **dynamic** (pattern-based automatic membership). Dynamic groups automatically include hosts matching specified rules.

### Group Types

#### Static Groups
- Hosts manually assigned to the group
- Traditional folder-like organization
- Good for: Project-based grouping, manual organization

#### Dynamic Groups
- Hosts automatically included based on rules
- Rules evaluated when connections are created/updated
- Good for: Environment-based filtering (dev/prod), OS-based grouping, provider-based organization

### Rule-Based Matching

Dynamic groups support multiple rule types (all rules must match - AND logic):

```typescript
interface GroupRule {
  // Pattern matching (e.g., "dev-web-*", "prod-db-*", "*-linux")
  hostnamePattern?: string;
  // OS type filtering
  osType?: OSType | OSType[];
  // Tag matching
  tags?: string[];
  // Provider filtering
  providerId?: string;
  // Connection type filtering
  connectionType?: ConnectionType;
}
```

### Examples

#### Example 1: All Development Servers
```typescript
{
  name: "Development Servers",
  membershipType: "dynamic",
  rules: [{
    hostnamePattern: "dev-*"
  }]
}
```

#### Example 2: All Windows Hosts
```typescript
{
  name: "Windows Machines",
  membershipType: "dynamic",
  rules: [{
    osType: "windows"
  }]
}
```

#### Example 3: Production Linux Database Servers
```typescript
{
  name: "Prod DB Servers",
  membershipType: "dynamic",
  rules: [
    {
      hostnamePattern: "prod-db-*",
      osType: "linux"
    }
  ]
}
```

### Group-Based Features

#### Auto-Assign Credentials
When a dynamic group has an assigned credential, matching hosts automatically get that credential assigned:

```typescript
{
  name: "Production Servers",
  membershipType: "dynamic",
  rules: [{ hostnamePattern: "prod-*" }],
  credentialId: "prod-credential-id"  // Auto-applied to matching hosts
}
```

#### Assign Scripts/Actions
Groups can have scripts assigned that appear in the plugin panel:

```typescript
{
  name: "Web Servers",
  membershipType: "dynamic",
  rules: [{ tags: ["web"] }],
  assignedScripts: ["restart-nginx-script-id", "check-logs-script-id"]
}
```

### API Methods

#### Create a Group
```typescript
const group = await window.connectty.groups.create({
  name: "Development Servers",
  membershipType: "dynamic",
  rules: [{
    hostnamePattern: "dev-*",
    osType: "linux"
  }],
  credentialId: "dev-credential-id",
  assignedScripts: ["backup-script-id"]
});
```

#### Update a Group
```typescript
await window.connectty.groups.update(groupId, {
  rules: [{
    hostnamePattern: "prod-*",
    tags: ["critical"]
  }]
});
```

#### Get Connections in a Group
```typescript
// Works for both static and dynamic groups
const connections = await window.connectty.groups.getConnectionsForGroup(groupId);
```

---

## Plugin System

### Overview

The plugin system provides extensible functionality through side panels. Two built-in plugins:

1. **Host Stats Plugin**: Real-time CPU, memory, disk, and network monitoring
2. **Script Manager Plugin**: Quick access to group-assigned scripts

### Settings

Plugin settings in `AppSettings`:

```typescript
interface AppSettings {
  // ... other settings
  pluginsEnabled?: boolean;        // Master toggle
  enabledPlugins?: string[];       // Array of enabled plugin IDs
}
```

### Plugin IDs

- `host-stats`: Host statistics monitoring
- `script-manager`: Group-based script quick access

### API Methods

#### Enable/Disable Plugins
```typescript
// Get current settings
const settings = await window.connectty.settings.get();

// Enable plugins
await window.connectty.settings.set({
  pluginsEnabled: true,
  enabledPlugins: ['host-stats', 'script-manager']
});

// Disable plugins
await window.connectty.settings.set({
  pluginsEnabled: false
});
```

#### Host Stats Plugin

Start monitoring a connection:
```typescript
// connectionId = the connection being monitored
// sshSessionId = the active SSH session ID
await window.connectty.plugins.startHostStats(connectionId, sshSessionId);

// Listen for stats updates (every 3 seconds by default)
const unsubscribe = window.connectty.plugins.onHostStats((stats: HostStats) => {
  console.log('CPU Usage:', stats.cpu.usage + '%');
  console.log('Memory Usage:', stats.memory.usage + '%');
  console.log('Disk Usage:', stats.disk[0].usage + '%');
  console.log('Network RX:', stats.network[0].bytesReceived);
});

// Stop monitoring when done
await window.connectty.plugins.stopHostStats(connectionId);
unsubscribe();
```

#### Script Manager Plugin

Get scripts for a connection:
```typescript
// Get scripts assigned to the connection's group
const scripts = await window.connectty.plugins.getConnectionScripts(connectionId);

// Or get scripts for a specific group
const groupScripts = await window.connectty.plugins.getGroupScripts(groupId);
```

### HostStats Type

```typescript
interface HostStats {
  connectionId: string;
  timestamp: Date;
  cpu: {
    usage: number;        // Percentage
    cores: number;
    loadAverage?: number[];  // Linux only: 1, 5, 15 min averages
  };
  memory: {
    total: number;        // Bytes
    used: number;
    free: number;
    usage: number;        // Percentage
  };
  disk: Array<{
    total: number;        // Bytes
    used: number;
    free: number;
    usage: number;        // Percentage
  }>;
  network: Array<{
    interface: string;
    bytesReceived: number;
    bytesSent: number;
    packetsReceived: number;
    packetsSent: number;
  }>;
}
```

---

## Backend Implementation

### Database Schema Changes

#### Groups Table
```sql
CREATE TABLE connection_groups (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  parent_id TEXT,
  color TEXT,
  membership_type TEXT DEFAULT 'static',  -- 'static' or 'dynamic'
  rules TEXT DEFAULT NULL,                 -- JSON array of GroupRule
  credential_id TEXT,                      -- Auto-assign credential
  assigned_scripts TEXT DEFAULT '[]',      -- JSON array of script IDs
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

#### Commands Table
```sql
-- Added field:
assigned_groups TEXT DEFAULT '[]'  -- JSON array of group IDs
```

### New Database Methods

```typescript
// Get connections matching dynamic group rules
db.getConnectionsForGroup(groupId: string): ServerConnection[]

// Get scripts assigned to a group
db.getSavedCommandsForGroup(groupId: string): SavedCommand[]

// Get scripts for a specific connection
db.getSavedCommandsForConnection(connectionId: string): SavedCommand[]

// Update connection's group based on dynamic rules
db.updateDynamicGroupMembership(connectionId: string): void
```

### Pattern Matching

Wildcard patterns supported:
- `*` = match any characters
- `?` = match single character
- Case-insensitive matching

Examples:
- `dev-*` matches `dev-web`, `dev-db`, `dev-api-01`
- `prod-??-*` matches `prod-us-web`, `prod-eu-api`
- `*-linux` matches `server-linux`, `db01-linux`

---

## Frontend Integration Examples

### Example 1: Settings UI for Plugins

```tsx
function PluginSettings() {
  const [settings, setSettings] = useState<AppSettings | null>(null);

  useEffect(() => {
    window.connectty.settings.get().then(setSettings);
  }, []);

  const togglePlugins = async (enabled: boolean) => {
    const newSettings = await window.connectty.settings.set({
      pluginsEnabled: enabled
    });
    setSettings(newSettings);
  };

  const togglePlugin = async (pluginId: string, enabled: boolean) => {
    const current = settings?.enabledPlugins || [];
    const updated = enabled
      ? [...current, pluginId]
      : current.filter(id => id !== pluginId);

    const newSettings = await window.connectty.settings.set({
      enabledPlugins: updated
    });
    setSettings(newSettings);
  };

  return (
    <div>
      <h3>Plugins</h3>
      <label>
        <input
          type="checkbox"
          checked={settings?.pluginsEnabled || false}
          onChange={(e) => togglePlugins(e.target.checked)}
        />
        Enable Plugins
      </label>

      {settings?.pluginsEnabled && (
        <div>
          <h4>Available Plugins</h4>
          <label>
            <input
              type="checkbox"
              checked={settings?.enabledPlugins?.includes('host-stats')}
              onChange={(e) => togglePlugin('host-stats', e.target.checked)}
            />
            Host Statistics Monitor
          </label>
          <label>
            <input
              type="checkbox"
              checked={settings?.enabledPlugins?.includes('script-manager')}
              onChange={(e) => togglePlugin('script-manager', e.target.checked)}
            />
            Script Manager
          </label>
        </div>
      )}
    </div>
  );
}
```

### Example 2: Host Stats Plugin Panel

```tsx
function HostStatsPanel({ connectionId, sshSessionId }: Props) {
  const [stats, setStats] = useState<HostStats | null>(null);
  const [monitoring, setMonitoring] = useState(false);

  useEffect(() => {
    if (!monitoring) return;

    // Start monitoring
    window.connectty.plugins.startHostStats(connectionId, sshSessionId);

    // Listen for updates
    const unsubscribe = window.connectty.plugins.onHostStats((newStats) => {
      if (newStats.connectionId === connectionId) {
        setStats(newStats);
      }
    });

    return () => {
      window.connectty.plugins.stopHostStats(connectionId);
      unsubscribe();
    };
  }, [connectionId, sshSessionId, monitoring]);

  return (
    <div className="host-stats-panel">
      <button onClick={() => setMonitoring(!monitoring)}>
        {monitoring ? 'Stop' : 'Start'} Monitoring
      </button>

      {stats && (
        <div>
          <h4>CPU</h4>
          <progress value={stats.cpu.usage} max={100} />
          <span>{stats.cpu.usage.toFixed(1)}%</span>
          <p>{stats.cpu.cores} cores</p>

          <h4>Memory</h4>
          <progress value={stats.memory.usage} max={100} />
          <span>{stats.memory.usage.toFixed(1)}%</span>
          <p>{formatBytes(stats.memory.used)} / {formatBytes(stats.memory.total)}</p>

          <h4>Disk</h4>
          {stats.disk.map((disk, i) => (
            <div key={i}>
              <progress value={disk.usage} max={100} />
              <span>{disk.usage.toFixed(1)}%</span>
              <p>{formatBytes(disk.used)} / {formatBytes(disk.total)}</p>
            </div>
          ))}

          <h4>Network</h4>
          {stats.network.map((net, i) => (
            <div key={i}>
              <p>{net.interface}</p>
              <p>RX: {formatBytes(net.bytesReceived)}</p>
              <p>TX: {formatBytes(net.bytesSent)}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return (bytes / Math.pow(k, i)).toFixed(2) + ' ' + sizes[i];
}
```

### Example 3: Script Manager Plugin Panel

```tsx
function ScriptManagerPanel({ connectionId }: Props) {
  const [scripts, setScripts] = useState<SavedCommand[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadScripts();
  }, [connectionId]);

  const loadScripts = async () => {
    setLoading(true);
    const scripts = await window.connectty.plugins.getConnectionScripts(connectionId);
    setScripts(scripts);
    setLoading(false);
  };

  const executeScript = async (script: SavedCommand) => {
    const result = await window.connectty.commands.execute({
      commandId: script.id,
      commandName: script.name,
      command: script.command || script.scriptContent || '',
      targetOS: script.targetOS,
      filter: {
        type: 'selection',
        connectionIds: [connectionId]
      }
    });

    if ('error' in result) {
      alert('Error: ' + result.error);
    } else {
      alert(`Script started (Execution ID: ${result.executionId})`);
    }
  };

  if (loading) {
    return <div>Loading scripts...</div>;
  }

  if (scripts.length === 0) {
    return <div>No scripts assigned to this connection's group</div>;
  }

  return (
    <div className="script-manager-panel">
      <h3>Quick Actions</h3>
      {scripts.map(script => (
        <button
          key={script.id}
          onClick={() => executeScript(script)}
          className="script-button"
        >
          {script.name}
          {script.description && <small>{script.description}</small>}
        </button>
      ))}
    </div>
  );
}
```

### Example 4: Dynamic Group Creation Form

```tsx
function CreateDynamicGroupForm() {
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    membershipType: 'dynamic' as const,
    hostnamePattern: '',
    osType: [] as OSType[],
    tags: [] as string[],
    credentialId: '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const group = await window.connectty.groups.create({
      name: formData.name,
      description: formData.description,
      membershipType: 'dynamic',
      rules: [{
        hostnamePattern: formData.hostnamePattern || undefined,
        osType: formData.osType.length > 0 ? formData.osType : undefined,
        tags: formData.tags.length > 0 ? formData.tags : undefined,
      }],
      credentialId: formData.credentialId || undefined,
    });

    console.log('Group created:', group);
  };

  return (
    <form onSubmit={handleSubmit}>
      <input
        type="text"
        placeholder="Group Name"
        value={formData.name}
        onChange={(e) => setFormData({...formData, name: e.target.value})}
        required
      />

      <textarea
        placeholder="Description"
        value={formData.description}
        onChange={(e) => setFormData({...formData, description: e.target.value})}
      />

      <h4>Matching Rules</h4>

      <input
        type="text"
        placeholder="Hostname Pattern (e.g., dev-*, prod-db-*)"
        value={formData.hostnamePattern}
        onChange={(e) => setFormData({...formData, hostnamePattern: e.target.value})}
      />

      <select
        multiple
        value={formData.osType}
        onChange={(e) => {
          const selected = Array.from(e.target.selectedOptions, opt => opt.value as OSType);
          setFormData({...formData, osType: selected});
        }}
      >
        <option value="linux">Linux</option>
        <option value="windows">Windows</option>
        <option value="unix">Unix</option>
        <option value="esxi">ESXi</option>
      </select>

      <button type="submit">Create Dynamic Group</button>
    </form>
  );
}
```

### Example 5: Slide-Away Plugin Panel Layout

```tsx
function MainLayout() {
  const [pluginPanelOpen, setPluginPanelOpen] = useState(false);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [activeSession, setActiveSession] = useState<Session | null>(null);

  useEffect(() => {
    window.connectty.settings.get().then(setSettings);
  }, []);

  const pluginsEnabled = settings?.pluginsEnabled && settings?.enabledPlugins && settings.enabledPlugins.length > 0;

  return (
    <div className="main-layout">
      {/* Main content area */}
      <div className="main-content">
        <TerminalArea />

        {/* Plugin panel toggle button */}
        {pluginsEnabled && activeSession && (
          <button
            className="plugin-toggle"
            onClick={() => setPluginPanelOpen(!pluginPanelOpen)}
          >
            {pluginPanelOpen ? '→' : '←'} Plugins
          </button>
        )}
      </div>

      {/* Slide-away plugin panel */}
      {pluginsEnabled && (
        <div className={`plugin-panel ${pluginPanelOpen ? 'open' : 'closed'}`}>
          <div className="plugin-panel-content">
            {settings?.enabledPlugins?.includes('host-stats') && activeSession?.type === 'ssh' && (
              <HostStatsPanel
                connectionId={activeSession.connectionId}
                sshSessionId={activeSession.sshSessionId}
              />
            )}

            {settings?.enabledPlugins?.includes('script-manager') && activeSession && (
              <ScriptManagerPanel connectionId={activeSession.connectionId} />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// CSS Example
/*
.plugin-panel {
  position: fixed;
  right: 0;
  top: 0;
  bottom: 0;
  width: 300px;
  background: var(--panel-bg);
  border-left: 1px solid var(--border-color);
  transform: translateX(100%);
  transition: transform 0.3s ease;
  overflow-y: auto;
}

.plugin-panel.open {
  transform: translateX(0);
}

.plugin-toggle {
  position: fixed;
  right: 10px;
  top: 50%;
  transform: translateY(-50%);
  z-index: 100;
}
*/
```

---

## Migration Notes

### Existing Databases

The implementation includes migrations that automatically add new columns to existing databases:

- `connection_groups.membership_type` (default: 'static')
- `connection_groups.rules`
- `connection_groups.credential_id`
- `connection_groups.assigned_scripts`
- `saved_commands.assigned_groups`

Existing groups will be treated as static groups and continue to work as before.

### Backward Compatibility

All new features are backward compatible:
- Static groups work exactly as before
- Plugin system is opt-in (disabled by default)
- Existing connections, credentials, and scripts unchanged
- No breaking changes to existing APIs

---

## Best Practices

### Dynamic Groups

1. **Keep rules simple**: Complex rule combinations can be confusing
2. **Use descriptive names**: Name should indicate what the group contains
3. **Document patterns**: Add descriptions explaining the pattern logic
4. **Test patterns**: Verify patterns match expected hosts before assigning credentials/scripts

### Plugins

1. **Start monitoring only when needed**: Don't monitor all connections simultaneously
2. **Stop monitoring when switching**: Clean up when user switches to different connection
3. **Handle errors gracefully**: SSH commands can fail, handle errors in UI
4. **Show loading states**: Stats collection takes a few seconds initially
5. **Cache plugin settings**: Load once and update on changes

### Performance

1. **Limit active monitors**: Don't monitor more than 5-10 hosts simultaneously
2. **Adjust collection interval**: Default 3s is good for most cases
3. **Use debouncing**: When updating group rules, debounce the membership recalculation
4. **Lazy load panels**: Only render plugin panels when they're visible

---

## Troubleshooting

### Host Stats Not Working

**Issue**: No stats appearing in panel

**Solutions**:
1. Verify SSH connection is active
2. Check that host has required commands (`top`, `free`, `df`, `cat /proc/*`)
3. For Windows, ensure PowerShell and WMI are available
4. Check console for error messages

### Dynamic Groups Not Populating

**Issue**: Hosts not automatically added to dynamic group

**Solutions**:
1. Verify rules are correctly formatted
2. Check that `membershipType` is set to `'dynamic'`
3. Test pattern with `wildcardToRegex()` method
4. Manually call `db.updateDynamicGroupMembership(connectionId)` to force re-evaluation

### Scripts Not Appearing in Plugin

**Issue**: Script manager shows no scripts

**Solutions**:
1. Verify connection has a group assigned
2. Check that scripts have `assignedGroups` array including the group ID
3. Ensure script `targetOS` matches the connection's OS type
4. Reload scripts list after assigning to group

---

## Future Enhancements

Potential additions to the plugin system:

1. **Custom Plugins**: Allow users to create custom plugin panels
2. **Plugin Marketplace**: Share plugins with community
3. **Historical Stats**: Store and chart stats over time
4. **Alerts**: Trigger notifications based on stat thresholds
5. **Multi-host Dashboards**: Monitor multiple hosts in single panel
6. **Plugin SDK**: Formal API for third-party plugin development

---

## Summary

This implementation provides:

✅ **Dynamic Groups**: Automatic host grouping based on patterns and rules
✅ **Group-Based Credentials**: Auto-assign credentials to matching hosts
✅ **Group-Based Scripts**: Quick access to scripts via plugin panel
✅ **Plugin System**: Extensible architecture for side panels
✅ **Host Stats Plugin**: Real-time monitoring of CPU/memory/disk/network
✅ **Script Manager Plugin**: Quick access to group-assigned actions
✅ **Backward Compatible**: Works with existing databases and configurations

All backend implementation is complete. Frontend integration can be done incrementally based on UI/UX requirements.
