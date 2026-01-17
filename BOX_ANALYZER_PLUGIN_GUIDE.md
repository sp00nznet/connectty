# Box Analyzer Plugin - "What Does This Box Do?"

This plugin integrates the **whatdoesthisboxdo** system analysis tool into Connectty, providing intelligent system analysis to determine what a connected server does, what applications it runs, and what systems it connects to.

## Table of Contents

1. [Overview](#overview)
2. [Features](#features)
3. [How It Works](#how-it-works)
4. [Data Collected](#data-collected)
5. [Analysis Engine](#analysis-engine)
6. [Datadog Integration](#datadog-integration)
7. [API Reference](#api-reference)
8. [Settings Configuration](#settings-configuration)
9. [Frontend Integration Examples](#frontend-integration-examples)
10. [Troubleshooting](#troubleshooting)

---

## Overview

The Box Analyzer plugin automatically analyzes connected systems via SSH to determine:

- **Primary Role**: What type of server is this? (web server, database, container host, etc.)
- **Detected Applications**: What software is running? (nginx, PostgreSQL, Docker, etc.)
- **Connected Systems**: What external systems is it talking to?
- **Insights**: Actionable intelligence about the system configuration
- **Datadog Metrics**: (Optional) Enhanced monitoring data from Datadog

### Plugin ID
`box-analyzer`

### Requirements
- Active SSH connection to the target system
- Read access to system information commands (`ps`, `ss`, `systemctl`, `dpkg/rpm`)
- (Optional) Datadog API credentials for enhanced monitoring

---

## Features

### Core Analysis
✅ **Automatic Role Detection** - Identifies 15+ server roles
✅ **Application Discovery** - Detects 50+ common applications
✅ **Version Detection** - Extracts application versions from packages/processes
✅ **Connection Mapping** - Identifies connected external systems
✅ **Evidence Collection** - Builds evidence trail for theories
✅ **Confidence Scoring** - Rates confidence in findings (low/medium/high/certain)

### Advanced Features
✅ **Continuous Polling** - Automatically re-analyze at configurable intervals
✅ **Datadog Integration** - Pull metrics and tags from Datadog
✅ **Caching** - Stores analysis results for quick access
✅ **Insight Generation** - Provides actionable recommendations

---

## How It Works

### Analysis Pipeline

```
┌─────────────────┐
│  SSH Connect    │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Data Collection │ ← Processes, Services, Ports, Packages, Connections
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Pattern Matching│ ← Match against known application signatures
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Role Detection  │ ← Determine primary server role
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Datadog Enrich  │ ← (Optional) Add monitoring data
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Theory Complete │ → SystemTheory object
└─────────────────┘
```

### Detected Server Roles

| Role | Detection Criteria |
|------|-------------------|
| `web-server` | nginx, Apache, httpd + ports 80/443 |
| `database` | PostgreSQL, MySQL, MongoDB, Redis |
| `container-host` | Docker, containerd, podman |
| `kubernetes-node` | kubelet, kube-proxy |
| `cache` | Redis, memcached, Varnish |
| `message-queue` | RabbitMQ, Kafka, ActiveMQ |
| `load-balancer` | HAProxy, nginx (with proxy config) |
| `reverse-proxy` | nginx, Traefik, Caddy |
| `monitoring` | Prometheus, Grafana, Nagios, Zabbix |
| `ci-cd` | Jenkins, GitLab Runner, TeamCity |
| `application-server` | Tomcat, JBoss, WebLogic |
| `file-server` | Samba, NFS, FTP |
| `dns` | BIND, dnsmasq, PowerDNS |
| `mail-server` | Postfix, Sendmail, Exim |
| `storage` | Ceph, GlusterFS, MinIO |

---

## Data Collected

### System Information

#### 1. Running Processes
- Top 30 processes by CPU usage
- Process name, PID, CPU percentage
- **Command**: `ps aux --sort=-%cpu | head -30`

#### 2. Active Services
- All running systemd services
- Service names and states
- **Command**: `systemctl list-units --type=service --state=running`

#### 3. Listening Ports
- TCP ports in LISTEN state
- Port number, protocol, owning process
- **Command**: `ss -tulnp | grep LISTEN`

#### 4. Installed Packages
- Top 100 installed packages
- Package names and versions
- **Commands**:
  - Debian/Ubuntu: `dpkg -l`
  - RedHat/CentOS: `rpm -qa`

#### 5. Network Connections
- Established TCP connections
- Local and remote addresses
- **Command**: `ss -tan | grep ESTAB`

#### 6. OS Information
- Distribution name and version
- **Command**: `cat /etc/os-release`

---

## Analysis Engine

### Application Detection

Applications are detected using multi-factor pattern matching:

```typescript
interface ApplicationPattern {
  name: string;
  keywords: string[];      // Process/package names to look for
  commonPorts?: number[];  // Typical ports used
  minMatches: number;      // Minimum matches for detection
}
```

**Example: nginx Detection**
- **Keywords**: `['nginx']`
- **Ports**: `[80, 443]`
- **Confidence**:
  - Low: Package installed only
  - Medium: Package + process running
  - High: Package + process + listening on port 80/443

### Confidence Scoring

| Level | Criteria | Example |
|-------|----------|---------|
| **Low** | Single indicator | Package installed but not running |
| **Medium** | Two indicators | Process running + package installed |
| **High** | Three+ indicators | Process + package + listening on expected port |
| **Certain** | Definitive evidence | Multiple strong indicators + config files |

### Connected Systems Identification

The analyzer identifies connected systems by:

1. Parsing `ss -tan` output for ESTABLISHED connections
2. Extracting remote IP addresses and ports
3. Filtering out localhost connections
4. Grouping by unique IP:port combinations
5. Classifying connection type (inbound/outbound)
6. Assigning low confidence (requires additional analysis)

---

## Datadog Integration

### Overview

When enabled, the plugin enriches analysis with real-time metrics from Datadog.

### Configuration

```typescript
interface BoxAnalysisSettings {
  pollingEnabled: boolean;      // Enable continuous analysis
  pollingInterval: number;      // Minutes between polls (default: 15)
  datadogEnabled: boolean;      // Enable Datadog integration
  datadogApiKey?: string;       // Datadog API key
  datadogAppKey?: string;       // Datadog Application key
  datadogSite?: string;         // Datadog site (default: 'datadoghq.com')
}
```

### Datadog Sites

- `datadoghq.com` - US1 (default)
- `datadoghq.eu` - EU
- `us3.datadoghq.com` - US3
- `us5.datadoghq.com` - US5
- `ap1.datadoghq.com` - AP1
- `ddog-gov.com` - US1-FED

### Data Retrieved from Datadog

#### Host Tags
- Environment tags (prod, dev, staging)
- Service tags
- Team/ownership tags
- Custom tags

#### Key Metrics (Last Hour)
- `system.cpu.user` - CPU usage
- `system.mem.pct_usable` - Memory usage
- `system.disk.in_use` - Disk usage
- `system.net.bytes_rcvd` - Network received

### Storage

Datadog credentials are **encrypted** using the same master key as connection credentials and stored in the settings table.

---

## API Reference

### Start Analysis

```typescript
await window.connectty.boxAnalyzer.start(
  connectionId: string,
  connectionName: string,
  sshSessionId: string,
  enablePolling?: boolean
): Promise<boolean>
```

Starts analyzing a connection. If `enablePolling` is true, will re-analyze at configured intervals.

**Example:**
```typescript
const success = await window.connectty.boxAnalyzer.start(
  'conn-123',
  'web-server-01',
  'ssh-session-456',
  true  // Enable polling
);
```

### Stop Polling

```typescript
await window.connectty.boxAnalyzer.stop(
  connectionId: string
): Promise<boolean>
```

Stops polling for a connection. Does not clear cached data.

### Get Cached Analysis

```typescript
await window.connectty.boxAnalyzer.getCached(
  connectionId: string
): Promise<SystemTheory | null>
```

Retrieves the last analysis result from cache.

### Listen for Analysis Updates

```typescript
const unsubscribe = window.connectty.boxAnalyzer.onTheory((theory: SystemTheory) => {
  console.log('New analysis:', theory);
  console.log('Role:', theory.primaryRole);
  console.log('Confidence:', theory.confidence);
  console.log('Applications:', theory.applications);
});

// Cleanup
unsubscribe();
```

### Datadog Credentials Management

#### Set Credentials
```typescript
await window.connectty.boxAnalyzer.setDatadogCredentials({
  apiKey: 'your-api-key',
  appKey: 'your-app-key',
  site: 'datadoghq.com'  // Optional
});
```

#### Get Credentials
```typescript
const creds = await window.connectty.boxAnalyzer.getDatadogCredentials();
// Returns { apiKey?, appKey?, site? } or null
```

#### Delete Credentials
```typescript
await window.connectty.boxAnalyzer.deleteDatadogCredentials();
```

#### Initialize Datadog Client
```typescript
await window.connectty.boxAnalyzer.initializeDatadog({
  pollingEnabled: true,
  pollingInterval: 15,
  datadogEnabled: true,
  datadogApiKey: 'key',
  datadogAppKey: 'app-key',
  datadogSite: 'datadoghq.com'
});
```

---

## Settings Configuration

### App Settings Integration

The Box Analyzer settings are part of `AppSettings`:

```typescript
interface AppSettings {
  // ... other settings
  boxAnalysis?: BoxAnalysisSettings;
}
```

### Enable Plugin in Settings

```typescript
// Get current settings
const settings = await window.connectty.settings.get();

// Enable box analyzer plugin
await window.connectty.settings.set({
  pluginsEnabled: true,
  enabledPlugins: [...(settings.enabledPlugins || []), 'box-analyzer'],
  boxAnalysis: {
    pollingEnabled: true,
    pollingInterval: 15,  // minutes
    datadogEnabled: false,
  }
});
```

### Configure Polling

```typescript
await window.connectty.settings.set({
  boxAnalysis: {
    ...settings.boxAnalysis,
    pollingEnabled: true,
    pollingInterval: 30  // Poll every 30 minutes
  }
});
```

---

## Frontend Integration Examples

### Example 1: Box Analyzer Panel Component

```tsx
import React, { useState, useEffect } from 'react';
import type { SystemTheory } from '@connectty/shared';

interface BoxAnalyzerPanelProps {
  connectionId: string;
  connectionName: string;
  sshSessionId: string;
}

export function BoxAnalyzerPanel({ connectionId, connectionName, sshSessionId }: BoxAnalyzerPanelProps) {
  const [theory, setTheory] = useState<SystemTheory | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [pollingEnabled, setPollingEnabled] = useState(false);

  useEffect(() => {
    // Load cached analysis on mount
    loadCachedAnalysis();
  }, [connectionId]);

  useEffect(() => {
    if (!analyzing) return;

    // Start analysis
    window.connectty.boxAnalyzer.start(
      connectionId,
      connectionName,
      sshSessionId,
      pollingEnabled
    );

    // Listen for updates
    const unsubscribe = window.connectty.boxAnalyzer.onTheory((newTheory) => {
      if (newTheory.connectionId === connectionId) {
        setTheory(newTheory);
      }
    });

    return () => {
      if (!pollingEnabled) {
        window.connectty.boxAnalyzer.stop(connectionId);
      }
      unsubscribe();
    };
  }, [analyzing, connectionId, connectionName, sshSessionId, pollingEnabled]);

  const loadCachedAnalysis = async () => {
    const cached = await window.connectty.boxAnalyzer.getCached(connectionId);
    if (cached) {
      setTheory(cached);
    }
  };

  const startAnalysis = () => {
    setAnalyzing(true);
  };

  const stopAnalysis = async () => {
    await window.connectty.boxAnalyzer.stop(connectionId);
    setAnalyzing(false);
    setPollingEnabled(false);
  };

  return (
    <div className="box-analyzer-panel">
      <div className="panel-header">
        <h3>What Does This Box Do?</h3>
        <div className="controls">
          <label>
            <input
              type="checkbox"
              checked={pollingEnabled}
              onChange={(e) => setPollingEnabled(e.target.checked)}
              disabled={!analyzing}
            />
            Auto-refresh
          </label>
          <button onClick={analyzing ? stopAnalysis : startAnalysis}>
            {analyzing ? 'Stop' : 'Analyze'}
          </button>
        </div>
      </div>

      {theory && (
        <div className="analysis-results">
          {/* Primary Role */}
          <section className="role-section">
            <h4>Primary Role</h4>
            <div className="role-badge" data-confidence={theory.confidence}>
              {theory.primaryRole.replace(/-/g, ' ').toUpperCase()}
              <span className="confidence">{theory.confidence} confidence</span>
            </div>
          </section>

          {/* Detected Applications */}
          {theory.applications.length > 0 && (
            <section className="applications-section">
              <h4>Detected Applications ({theory.applications.length})</h4>
              <div className="application-list">
                {theory.applications.map((app, idx) => (
                  <div key={idx} className="application-item" data-confidence={app.confidence}>
                    <div className="app-name">
                      {app.name} {app.version && <span className="version">v{app.version}</span>}
                    </div>
                    {app.port && <div className="app-port">Port: {app.port}</div>}
                    <div className="app-evidence">
                      {app.evidence.map((e, i) => (
                        <span key={i} className="evidence-badge">{e}</span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Connected Systems */}
          {theory.connectedSystems.length > 0 && (
            <section className="connections-section">
              <h4>Connected Systems ({theory.connectedSystems.length})</h4>
              <div className="connections-list">
                {theory.connectedSystems.slice(0, 10).map((sys, idx) => (
                  <div key={idx} className="connection-item">
                    <div className="connection-ip">
                      {sys.hostname || sys.ip}:{sys.port}
                    </div>
                    <div className="connection-meta">
                      <span className="protocol">{sys.protocol.toUpperCase()}</span>
                      <span className="type">{sys.connectionType}</span>
                      {sys.purpose && <span className="purpose">{sys.purpose}</span>}
                    </div>
                  </div>
                ))}
                {theory.connectedSystems.length > 10 && (
                  <div className="more-connections">
                    +{theory.connectedSystems.length - 10} more connections
                  </div>
                )}
              </div>
            </section>
          )}

          {/* Evidence */}
          {theory.evidence.length > 0 && (
            <section className="evidence-section">
              <h4>Evidence</h4>
              {theory.evidence.map((ev, idx) => (
                <details key={idx} className="evidence-category">
                  <summary>{ev.category} ({ev.findings.length})</summary>
                  <ul>
                    {ev.findings.slice(0, 10).map((finding, i) => (
                      <li key={i}>{finding}</li>
                    ))}
                    {ev.findings.length > 10 && (
                      <li className="more-findings">
                        +{ev.findings.length - 10} more...
                      </li>
                    )}
                  </ul>
                </details>
              ))}
            </section>
          )}

          {/* Insights */}
          {theory.insights.length > 0 && (
            <section className="insights-section">
              <h4>Insights</h4>
              <ul className="insights-list">
                {theory.insights.map((insight, idx) => (
                  <li key={idx}>{insight}</li>
                ))}
              </ul>
            </section>
          )}

          {/* Datadog Metrics */}
          {theory.datadogMetrics && (
            <section className="datadog-section">
              <h4>Datadog Metrics</h4>
              <div className="datadog-tags">
                {theory.datadogMetrics.tags.map((tag, idx) => (
                  <span key={idx} className="tag">{tag}</span>
                ))}
              </div>
              <div className="datadog-metrics">
                {Object.entries(theory.datadogMetrics.metrics).map(([key, value]) => (
                  <div key={key} className="metric-item">
                    <span className="metric-name">{key}</span>
                    <span className="metric-value">{value.toFixed(2)}</span>
                  </div>
                ))}
              </div>
              <div className="datadog-timestamp">
                Updated: {new Date(theory.datadogMetrics.lastUpdated).toLocaleString()}
              </div>
            </section>
          )}

          {/* Timestamp */}
          <div className="analysis-timestamp">
            Last analyzed: {new Date(theory.timestamp).toLocaleString()}
          </div>
        </div>
      )}

      {!theory && !analyzing && (
        <div className="empty-state">
          <p>Click "Analyze" to discover what this server does</p>
        </div>
      )}

      {analyzing && !theory && (
        <div className="analyzing-state">
          <div className="spinner"></div>
          <p>Analyzing system...</p>
        </div>
      )}
    </div>
  );
}
```

### Example 2: Datadog Settings Component

```tsx
import React, { useState, useEffect } from 'react';

export function DatadogSettings() {
  const [enabled, setEnabled] = useState(false);
  const [credentials, setCredentials] = useState({
    apiKey: '',
    appKey: '',
    site: 'datadoghq.com'
  });
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    loadCredentials();
  }, []);

  const loadCredentials = async () => {
    const creds = await window.connectty.boxAnalyzer.getDatadogCredentials();
    if (creds) {
      setCredentials({
        apiKey: creds.apiKey || '',
        appKey: creds.appKey || '',
        site: creds.site || 'datadoghq.com'
      });
      setEnabled(true);
    }
  };

  const saveCredentials = async () => {
    if (enabled) {
      await window.connectty.boxAnalyzer.setDatadogCredentials(credentials);
      await window.connectty.boxAnalyzer.initializeDatadog({
        pollingEnabled: false,
        pollingInterval: 15,
        datadogEnabled: true,
        ...credentials
      });
    } else {
      await window.connectty.boxAnalyzer.deleteDatadogCredentials();
    }
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="datadog-settings">
      <h3>Datadog Integration</h3>

      <label>
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
        />
        Enable Datadog Integration
      </label>

      {enabled && (
        <div className="datadog-form">
          <div className="form-group">
            <label>API Key</label>
            <input
              type="password"
              value={credentials.apiKey}
              onChange={(e) => setCredentials({...credentials, apiKey: e.target.value})}
              placeholder="Enter Datadog API key"
            />
          </div>

          <div className="form-group">
            <label>Application Key</label>
            <input
              type="password"
              value={credentials.appKey}
              onChange={(e) => setCredentials({...credentials, appKey: e.target.value})}
              placeholder="Enter Datadog application key"
            />
          </div>

          <div className="form-group">
            <label>Site</label>
            <select
              value={credentials.site}
              onChange={(e) => setCredentials({...credentials, site: e.target.value})}
            >
              <option value="datadoghq.com">US1 (datadoghq.com)</option>
              <option value="datadoghq.eu">EU (datadoghq.eu)</option>
              <option value="us3.datadoghq.com">US3</option>
              <option value="us5.datadoghq.com">US5</option>
              <option value="ap1.datadoghq.com">AP1</option>
              <option value="ddog-gov.com">US1-FED</option>
            </select>
          </div>

          <p className="help-text">
            Get your API and application keys from:
            <a href="https://app.datadoghq.com/organization-settings/api-keys" target="_blank">
              Datadog Organization Settings
            </a>
          </p>
        </div>
      )}

      <button onClick={saveCredentials} className="save-button">
        {saved ? '✓ Saved' : 'Save Settings'}
      </button>
    </div>
  );
}
```

---

## Troubleshooting

### Analysis Not Starting

**Issue**: Analysis doesn't start when clicking "Analyze"

**Solutions**:
1. Verify SSH connection is active and established
2. Check that the SSH session ID is valid
3. Look for errors in developer console
4. Ensure plugin is enabled in settings

### No Applications Detected

**Issue**: Analysis runs but no applications found

**Solutions**:
1. Check that SSH user has permissions to run `ps`, `ss`, `systemctl`
2. Verify package manager is installed (`dpkg` or `rpm`)
3. System may be minimal with few packages installed
4. Try running commands manually to verify output

### Datadog Integration Not Working

**Issue**: Datadog metrics not appearing

**Solutions**:
1. Verify API and application keys are correct
2. Check that hostname matches exactly in Datadog
3. Ensure the Datadog site is correct for your region
4. Check network connectivity to Datadog API
5. Look for errors in console (403 = auth failure, 404 = host not found)

### Polling Not Working

**Issue**: Analysis doesn't refresh automatically

**Solutions**:
1. Ensure polling is enabled in settings (`boxAnalysis.pollingEnabled`)
2. Check that polling interval is set (default: 15 minutes)
3. Verify that "Auto-refresh" checkbox is enabled in UI
4. SSH connection must remain active for polling to work

### High CPU Usage

**Issue**: Plugin causing high CPU usage

**Solutions**:
1. Increase polling interval to reduce frequency
2. Disable polling and run manual analysis only
3. Reduce number of connections being analyzed simultaneously
4. Check for large number of processes/packages on target system

---

## Best Practices

### Performance
1. **Limit simultaneous analyses**: Don't analyze more than 5-10 hosts at once
2. **Use reasonable polling intervals**: 15-30 minutes is recommended
3. **Cache results**: Use `getCached()` when possible instead of re-analyzing
4. **Stop polling when not needed**: Clean up when switching connections

### Security
1. **Protect Datadog credentials**: Never log or display API/app keys
2. **Use read-only SSH access**: Analysis doesn't require write permissions
3. **Review detected connections**: Verify connected systems are expected
4. **Monitor for anomalies**: Watch for unexpected applications or connections

### User Experience
1. **Show loading states**: Display spinner/progress during analysis
2. **Handle errors gracefully**: Show user-friendly error messages
3. **Provide context**: Explain what each role/application means
4. **Allow manual refresh**: Don't force polling on users

---

## Summary

The Box Analyzer plugin provides:

✅ **Automatic system analysis** to determine server purpose
✅ **Application detection** with version identification
✅ **Connection mapping** to identify related systems
✅ **Datadog integration** for enhanced monitoring
✅ **Continuous polling** for up-to-date analysis
✅ **Confidence scoring** for reliability assessment
✅ **Evidence collection** for audit trail

All backend implementation is complete. Frontend integration can be done using the provided examples and API reference.
