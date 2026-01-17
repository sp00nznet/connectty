# Datadog Health Monitoring Plugin

Automatically monitor server health via Datadog and display red/yellow/green status indicators next to hostnames in the connection list. The plugin polls Datadog every 15 minutes (configurable) for CPU, memory, and disk metrics, calculates overall health status, and updates the UI in real-time.

## Table of Contents

1. [Overview](#overview)
2. [Features](#features)
3. [Setup](#setup)
4. [Configuration](#configuration)
5. [Health Status Calculation](#health-status-calculation)
6. [API Reference](#api-reference)
7. [Frontend Integration](#frontend-integration)
8. [Examples](#examples)
9. [Troubleshooting](#troubleshooting)

---

## Overview

The Datadog Health Monitoring plugin provides automated server health monitoring by:

1. **Polling Datadog API** every N minutes (default: 15)
2. **Fetching metrics** (CPU, memory, disk) for all connections
3. **Calculating health status** based on configurable thresholds
4. **Displaying status indicators** (🟢 green, 🟡 yellow, 🔴 red, ⚫ unknown)
5. **Updating database** with latest health status
6. **Emitting real-time events** when health status changes

### Visual Example

```
Connections List:
🟢 prod-web-01        (192.168.1.10)  # Healthy
🟡 prod-db-01         (192.168.1.20)  # Warning: High CPU
🔴 prod-app-01        (192.168.1.30)  # Critical: High Memory
⚫ dev-test-01        (192.168.1.40)  # Unknown: No metrics
```

---

## Features

✅ **Automatic polling** - Runs every 15 minutes (configurable 1-60 min)
✅ **Multi-metric monitoring** - CPU, memory, and disk usage
✅ **Configurable thresholds** - Customize yellow/red alert levels
✅ **Real-time updates** - UI updates immediately when status changes
✅ **Persistent storage** - Health status saved in database
✅ **Batch processing** - Efficiently polls multiple servers in parallel
✅ **Error handling** - Gracefully handles missing metrics or API failures
✅ **Visual indicators** - Clear color-coded status lights in UI
✅ **Issue tracking** - Lists specific problems (e.g., "High CPU: 95%")

---

## Setup

### 1. Enable Datadog Health Plugin

In Settings → Plugins → Enable "Datadog Health Monitoring"

### 2. Configure Datadog Credentials

You need:
- **API Key**: Your Datadog API key
- **App Key**: Your Datadog application key
- **Site** (optional): Datadog site (default: datadoghq.com)

Get these from: [Datadog → Organization Settings → API Keys](https://app.datadoghq.com/organization-settings/api-keys)

### 3. Configure Thresholds (Optional)

Customize when yellow/red status triggers:

**Default Thresholds:**
- CPU: Yellow @ 70%, Red @ 90%
- Memory: Yellow @ 75%, Red @ 90%
- Disk: Yellow @ 80%, Red @ 95%

### 4. Set Poll Interval (Optional)

Default: 15 minutes
Range: 1-60 minutes

**Recommended:**
- Production monitoring: 5-15 minutes
- Development: 30-60 minutes
- Cost-conscious: 30+ minutes (fewer API calls)

---

## Configuration

### Configuration Object

```typescript
interface DatadogHealthConfig {
  enabled: boolean;
  apiKey: string;
  appKey: string;
  site?: string;          // Default: 'datadoghq.com'
  pollInterval: number;   // Minutes (default: 15)

  thresholds: {
    cpu: {
      yellow: number;     // Default: 70
      red: number;        // Default: 90
    };
    memory: {
      yellow: number;     // Default: 75
      red: number;        // Default: 90
    };
    disk: {
      yellow: number;     // Default: 80
      red: number;        // Default: 95
    };
  };
}
```

### Example Configuration

```typescript
const config: DatadogHealthConfig = {
  enabled: true,
  apiKey: 'your-datadog-api-key',
  appKey: 'your-datadog-app-key',
  site: 'datadoghq.com',
  pollInterval: 15,
  thresholds: {
    cpu: { yellow: 70, red: 90 },
    memory: { yellow: 75, red: 90 },
    disk: { yellow: 80, red: 95 },
  },
};

// Start monitoring
await window.connectty.datadogHealth.start(config);
```

---

## Health Status Calculation

### Status Levels

| Status | Color | Indicator | Meaning |
|--------|-------|-----------|---------|
| `green` | 🟢 Green | All OK | All metrics below yellow threshold |
| `yellow` | 🟡 Yellow | Warning | At least one metric above yellow threshold |
| `red` | 🔴 Red | Critical | At least one metric above red threshold |
| `unknown` | ⚫ Gray | No data | No metrics available from Datadog |

### Calculation Logic

1. **Fetch metrics** from Datadog for the last 5 minutes
2. **Calculate averages** for CPU, memory, disk
3. **Compare with thresholds**:
   - If any metric ≥ red threshold → **red**
   - Else if any metric ≥ yellow threshold → **yellow**
   - Else if metrics available → **green**
   - Else → **unknown**

### Example Calculations

**Scenario 1: Healthy Server**
- CPU: 35%
- Memory: 50%
- Disk: 60%
- **Result**: 🟢 Green (all below yellow thresholds)

**Scenario 2: High CPU Warning**
- CPU: 85%
- Memory: 50%
- Disk: 60%
- **Result**: 🟡 Yellow (CPU above 70% yellow threshold)

**Scenario 3: Critical Memory**
- CPU: 35%
- Memory: 95%
- Disk: 60%
- **Result**: 🔴 Red (Memory above 90% red threshold)

**Scenario 4: No Metrics**
- CPU: N/A
- Memory: N/A
- Disk: N/A
- **Result**: ⚫ Unknown (host not reporting to Datadog)

---

## API Reference

### Start Monitoring

```typescript
await window.connectty.datadogHealth.start(config: DatadogHealthConfig): Promise<boolean>
```

Starts automatic health monitoring with given configuration.

**Parameters:**
- `config`: DatadogHealthConfig object

**Returns:** `true` if started successfully, `false` otherwise

**Example:**
```typescript
const config = await window.connectty.datadogHealth.getDefaultConfig();
config.apiKey = 'your-api-key';
config.appKey = 'your-app-key';
config.enabled = true;

const started = await window.connectty.datadogHealth.start(config);
if (started) {
  console.log('Health monitoring started');
}
```

### Stop Monitoring

```typescript
await window.connectty.datadogHealth.stop(): Promise<boolean>
```

Stops automatic health monitoring.

**Example:**
```typescript
await window.connectty.datadogHealth.stop();
console.log('Health monitoring stopped');
```

### Get Health Status

```typescript
await window.connectty.datadogHealth.getHealthStatus(connectionId: string): Promise<ConnectionHealthStatus | undefined>
```

Get cached health status for a specific connection.

**Returns:**
```typescript
interface ConnectionHealthStatus {
  connectionId: string;
  hostname: string;
  status: 'green' | 'yellow' | 'red' | 'unknown';
  lastChecked: Date;
  metrics?: {
    cpu?: number;
    memory?: number;
    disk?: number;
  };
  issues?: string[];  // e.g., ["High CPU usage: 95%"]
}
```

**Example:**
```typescript
const status = await window.connectty.datadogHealth.getHealthStatus('connection-123');
if (status) {
  console.log(`${status.hostname}: ${status.status}`);
  if (status.issues) {
    status.issues.forEach(issue => console.warn(issue));
  }
}
```

### Get All Health Statuses

```typescript
await window.connectty.datadogHealth.getAllHealthStatuses(): Promise<ConnectionHealthStatus[]>
```

Get all cached health statuses.

**Example:**
```typescript
const allStatuses = await window.connectty.datadogHealth.getAllHealthStatuses();

const critical = allStatuses.filter(s => s.status === 'red');
const warnings = allStatuses.filter(s => s.status === 'yellow');

console.log(`Critical: ${critical.length}, Warnings: ${warnings.length}`);
```

### Force Poll

```typescript
await window.connectty.datadogHealth.forcePoll(config: DatadogHealthConfig): Promise<boolean>
```

Force immediate poll of all connections (doesn't wait for next interval).

**Example:**
```typescript
const config = await window.connectty.datadogHealth.getDefaultConfig();
// ... configure ...
await window.connectty.datadogHealth.forcePoll(config);
console.log('Forced poll complete');
```

### Listen for Status Updates

```typescript
const unsubscribe = window.connectty.datadogHealth.onStatusUpdate(
  (status: ConnectionHealthStatus) => void
): () => void
```

Register callback for real-time health status updates.

**Example:**
```typescript
const unsubscribe = window.connectty.datadogHealth.onStatusUpdate((status) => {
  console.log(`Health status changed for ${status.hostname}: ${status.status}`);

  if (status.status === 'red') {
    showNotification({
      title: 'Critical Server Health',
      message: `${status.hostname} is in critical state`,
      severity: 'error',
    });
  }
});

// Cleanup when component unmounts
return () => unsubscribe();
```

---

## Frontend Integration

### React Component Example

```tsx
import React, { useEffect, useState } from 'react';
import type { ConnectionHealthStatus } from '@connectty/shared';

export function ConnectionList() {
  const [connections, setConnections] = useState<ServerConnection[]>([]);
  const [healthStatuses, setHealthStatuses] = useState<Map<string, ConnectionHealthStatus>>(new Map());

  useEffect(() => {
    // Load connections
    window.connectty.connections.list().then(setConnections);

    // Load health statuses
    window.connectty.datadogHealth.getAllHealthStatuses().then(statuses => {
      const map = new Map(statuses.map(s => [s.connectionId, s]));
      setHealthStatuses(map);
    });

    // Listen for real-time updates
    const unsubscribe = window.connectty.datadogHealth.onStatusUpdate((status) => {
      setHealthStatuses(prev => new Map(prev).set(status.connectionId, status));
    });

    return () => unsubscribe();
  }, []);

  const getHealthIndicator = (connectionId: string) => {
    const status = healthStatuses.get(connectionId);
    if (!status) return '⚫';

    switch (status.status) {
      case 'green': return '🟢';
      case 'yellow': return '🟡';
      case 'red': return '🔴';
      default: return '⚫';
    }
  };

  return (
    <div className="connection-list">
      {connections.map(conn => (
        <div key={conn.id} className="connection-item">
          <span className="health-indicator">{getHealthIndicator(conn.id)}</span>
          <span className="connection-name">{conn.name}</span>
          <span className="connection-hostname">{conn.hostname}</span>
        </div>
      ))}
    </div>
  );
}
```

### Settings Panel Example

```tsx
export function DatadogHealthSettings() {
  const [config, setConfig] = useState<DatadogHealthConfig | null>(null);
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    window.connectty.datadogHealth.getDefaultConfig().then(setConfig);
  }, []);

  const handleSave = async () => {
    if (!config) return;

    const started = await window.connectty.datadogHealth.start(config);
    setEnabled(started);

    if (started) {
      showNotification('Datadog health monitoring started');
    }
  };

  const handleStop = async () => {
    await window.connectty.datadogHealth.stop();
    setEnabled(false);
    showNotification('Datadog health monitoring stopped');
  };

  if (!config) return <div>Loading...</div>;

  return (
    <div className="datadog-health-settings">
      <h3>Datadog Health Monitoring</h3>

      <label>
        API Key:
        <input
          type="password"
          value={config.apiKey}
          onChange={e => setConfig({ ...config, apiKey: e.target.value })}
        />
      </label>

      <label>
        App Key:
        <input
          type="password"
          value={config.appKey}
          onChange={e => setConfig({ ...config, appKey: e.target.value })}
        />
      </label>

      <label>
        Poll Interval (minutes):
        <input
          type="number"
          min="1"
          max="60"
          value={config.pollInterval}
          onChange={e => setConfig({ ...config, pollInterval: parseInt(e.target.value) })}
        />
      </label>

      <fieldset>
        <legend>CPU Thresholds</legend>
        <label>
          Yellow: <input type="number" value={config.thresholds.cpu.yellow}
            onChange={e => setConfig({ ...config, thresholds: { ...config.thresholds, cpu: { ...config.thresholds.cpu, yellow: parseInt(e.target.value) } } })} />%
        </label>
        <label>
          Red: <input type="number" value={config.thresholds.cpu.red}
            onChange={e => setConfig({ ...config, thresholds: { ...config.thresholds, cpu: { ...config.thresholds.cpu, red: parseInt(e.target.value) } } } )} />%
        </label>
      </fieldset>

      {/* Similar for memory and disk... */}

      <div className="actions">
        {enabled ? (
          <button onClick={handleStop}>Stop Monitoring</button>
        ) : (
          <button onClick={handleSave}>Start Monitoring</button>
        )}
      </div>
    </div>
  );
}
```

### Health Status Badge Component

```tsx
interface HealthBadgeProps {
  connectionId: string;
  showDetails?: boolean;
}

export function HealthBadge({ connectionId, showDetails = false }: HealthBadgeProps) {
  const [status, setStatus] = useState<ConnectionHealthStatus | null>(null);

  useEffect(() => {
    window.connectty.datadogHealth.getHealthStatus(connectionId).then(s => setStatus(s || null));

    const unsubscribe = window.connectty.datadogHealth.onStatusUpdate((updatedStatus) => {
      if (updatedStatus.connectionId === connectionId) {
        setStatus(updatedStatus);
      }
    });

    return () => unsubscribe();
  }, [connectionId]);

  if (!status) {
    return <span className="health-badge unknown">⚫</span>;
  }

  const indicator = {
    green: '🟢',
    yellow: '🟡',
    red: '🔴',
    unknown: '⚫',
  }[status.status];

  return (
    <div className={`health-badge ${status.status}`} title={status.issues?.join(', ')}>
      <span className="indicator">{indicator}</span>
      {showDetails && status.metrics && (
        <div className="metrics">
          {status.metrics.cpu !== undefined && <span>CPU: {status.metrics.cpu.toFixed(1)}%</span>}
          {status.metrics.memory !== undefined && <span>MEM: {status.metrics.memory.toFixed(1)}%</span>}
          {status.metrics.disk !== undefined && <span>DISK: {status.metrics.disk.toFixed(1)}%</span>}
        </div>
      )}
    </div>
  );
}
```

---

## Examples

### Example 1: Basic Setup

```typescript
// Get default config
const config = await window.connectty.datadogHealth.getDefaultConfig();

// Configure credentials
config.apiKey = 'your-datadog-api-key';
config.appKey = 'your-datadog-app-key';
config.enabled = true;

// Start monitoring
await window.connectty.datadogHealth.start(config);
console.log('Monitoring started - will poll every 15 minutes');
```

### Example 2: Custom Thresholds

```typescript
const config = await window.connectty.datadogHealth.getDefaultConfig();
config.apiKey = 'your-api-key';
config.appKey = 'your-app-key';

// More aggressive thresholds for production
config.thresholds = {
  cpu: { yellow: 60, red: 80 },
  memory: { yellow: 70, red: 85 },
  disk: { yellow: 75, red: 90 },
};

await window.connectty.datadogHealth.start(config);
```

### Example 3: Real-time Alerts

```typescript
// Setup monitoring
const config = await window.connectty.datadogHealth.getDefaultConfig();
// ... configure ...
await window.connectty.datadogHealth.start(config);

// Listen for critical status changes
window.connectty.datadogHealth.onStatusUpdate((status) => {
  if (status.status === 'red') {
    // Send alert
    sendSlackAlert({
      channel: '#infrastructure-alerts',
      message: `🔴 CRITICAL: ${status.hostname} health is critical`,
      fields: status.issues?.map(issue => ({ title: 'Issue', value: issue })),
    });

    // Show desktop notification
    new Notification('Critical Server Health', {
      body: `${status.hostname}: ${status.issues?.join(', ')}`,
      icon: '/icons/critical.png',
    });
  }
});
```

### Example 4: Dashboard with Statistics

```typescript
async function getDashboardStats() {
  const statuses = await window.connectty.datadogHealth.getAllHealthStatuses();

  const stats = {
    total: statuses.length,
    green: statuses.filter(s => s.status === 'green').length,
    yellow: statuses.filter(s => s.status === 'yellow').length,
    red: statuses.filter(s => s.status === 'red').length,
    unknown: statuses.filter(s => s.status === 'unknown').length,
  };

  console.log('Health Dashboard:');
  console.log(`Total: ${stats.total}`);
  console.log(`🟢 Healthy: ${stats.green} (${(stats.green/stats.total*100).toFixed(1)}%)`);
  console.log(`🟡 Warning: ${stats.yellow} (${(stats.yellow/stats.total*100).toFixed(1)}%)`);
  console.log(`🔴 Critical: ${stats.red} (${(stats.red/stats.total*100).toFixed(1)}%)`);
  console.log(`⚫ Unknown: ${stats.unknown} (${(stats.unknown/stats.total*100).toFixed(1)}%)`);

  return stats;
}
```

### Example 5: Auto-Start on App Launch

```typescript
// In your app initialization
async function initializeApp() {
  // Load saved settings
  const settings = await window.connectty.settings.get();

  if (settings.datadogHealth?.enabled) {
    // Auto-start monitoring with saved config
    await window.connectty.datadogHealth.start(settings.datadogHealth);
    console.log('Datadog health monitoring auto-started');
  }
}
```

---

## Troubleshooting

### Issue: All Connections Show "Unknown"

**Possible Causes:**
1. Datadog API credentials incorrect
2. Hostnames don't match Datadog host tags
3. Datadog Agent not installed on servers

**Solutions:**
1. Verify API/App keys in Datadog dashboard
2. Ensure connection hostname matches Datadog `host:` tag exactly
3. Install Datadog Agent on servers: https://docs.datadoghq.com/agent/

### Issue: Some Connections Never Update

**Possible Causes:**
1. Server not reporting to Datadog
2. Hostname mismatch
3. Datadog Agent stopped

**Solutions:**
1. Check Datadog dashboard - is host reporting?
2. Verify hostname: `hostname` command on server should match connection hostname
3. Restart Datadog Agent: `systemctl restart datadog-agent`

### Issue: Status Updates Delayed

**Possible Causes:**
1. Poll interval too long
2. Many connections causing slow polling
3. Datadog API rate limiting

**Solutions:**
1. Reduce poll interval (minimum 1 minute)
2. Expected behavior - batch polling of 100+ servers takes time
3. Check Datadog API rate limits, consider increasing poll interval

### Issue: Wrong Health Status

**Possible Causes:**
1. Thresholds too aggressive/lenient
2. Metrics averaging over wrong timeframe
3. Server has bursty workload

**Solutions:**
1. Adjust thresholds in config
2. Plugin uses 5-minute average - expected behavior
3. Consider customizing thresholds for specific server types

### Issue: High Datadog API Usage

**Possible Causes:**
1. Poll interval too frequent
2. Too many connections

**Solutions:**
1. Increase poll interval to 30-60 minutes
2. Expected - each connection makes 3 API calls per poll
3. Datadog pricing includes API calls in most plans

---

## Best Practices

### 1. Hostname Consistency

Ensure connection hostnames match Datadog host tags:

```bash
# On server, check Datadog hostname
sudo datadog-agent status | grep -A1 "Hostname:"

# Should match connection hostname exactly
```

### 2. Poll Interval Selection

| Environment | Recommended Interval | Rationale |
|-------------|---------------------|-----------|
| Production Critical | 5-10 minutes | Fast detection of issues |
| Production Standard | 15-30 minutes | Balance cost vs responsiveness |
| Development | 30-60 minutes | Lower priority, cost-conscious |
| Testing | 60 minutes | Minimal monitoring needed |

### 3. Threshold Tuning

Start with defaults, then adjust based on:
- **Normal baseline**: Set yellow at 80% of normal peak
- **Critical threshold**: Set red at point requiring immediate action
- **Server type**: Database servers may need higher memory thresholds

### 4. Alert Integration

```typescript
// Setup alert routing based on severity
window.connectty.datadogHealth.onStatusUpdate((status) => {
  if (status.status === 'red') {
    sendPagerDutyAlert(status);  // Critical - page on-call
  } else if (status.status === 'yellow') {
    sendSlackAlert(status);      // Warning - notify team
  }
  // Green - no action needed
});
```

### 5. Performance Considerations

- Plugin polls in batches of 5 connections concurrently
- 100 connections = ~20 seconds per poll
- Each poll makes 3 API calls per connection (CPU, memory, disk)
- Plan API quota accordingly

---

## Summary

The Datadog Health Monitoring plugin provides:

✅ **Automated monitoring** - Polls every 15 minutes (configurable)
✅ **Visual indicators** - Red/yellow/green status lights in UI
✅ **Multi-metric** - CPU, memory, disk usage
✅ **Configurable** - Custom thresholds and poll intervals
✅ **Real-time** - Instant UI updates when status changes
✅ **Persistent** - Stores health status in database
✅ **Scalable** - Efficiently handles 100+ connections

Perfect for maintaining awareness of infrastructure health at a glance!
