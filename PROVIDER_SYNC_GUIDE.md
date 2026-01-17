# Provider Sync - Incremental Host Discovery

Synchronize providers to detect newly discovered hosts, removed hosts, and state changes. The provider sync feature enables incremental updates to your infrastructure inventory, showing you what's new, what's gone, and what has changed.

## Table of Contents

1. [Overview](#overview)
2. [Features](#features)
3. [How It Works](#how-it-works)
4. [API Reference](#api-reference)
5. [Frontend Integration](#frontend-integration)
6. [Examples](#examples)
7. [Best Practices](#best-practices)

---

## Overview

Provider sync performs an incremental discovery operation that compares the current state of hosts from a provider against the previously discovered state. This allows you to:

- **Detect new hosts** that have been added to the infrastructure
- **Identify removed hosts** that are no longer present
- **Track state changes** for existing hosts (running → stopped, etc.)
- **Maintain accurate inventory** without manual refresh

### Supported Providers

- ESXi
- Proxmox
- AWS
- GCP
- Azure
- BigFix

---

## Features

✅ **Incremental discovery** - Only shows changes since last sync
✅ **New host detection** - Automatically identifies newly added infrastructure
✅ **Removed host tracking** - Detects hosts that are no longer present
✅ **State change monitoring** - Identifies hosts that changed state (running/stopped/suspended)
✅ **Import workflow integration** - New hosts trigger import wizard
✅ **Comprehensive summary** - Detailed statistics about sync results
✅ **Persistent state** - Maintains discovery history in database

---

## How It Works

### Sync Process

1. **Current Discovery**
   - Performs fresh discovery operation against provider
   - Retrieves current list of hosts with their states

2. **Historical Comparison**
   - Loads previously discovered hosts from database
   - Compares current vs. previous using provider host IDs

3. **Differential Analysis**
   - **New hosts**: Present in current, not in previous
   - **Removed hosts**: Present in previous, not in current
   - **Existing hosts**: Present in both
   - **Changed hosts**: Existing hosts with state changes

4. **Database Update**
   - Updates or inserts current host information
   - Maintains historical discovery state
   - Updates provider's `lastDiscoveryAt` timestamp

5. **Result Return**
   - Returns detailed sync result with all categories
   - Includes summary counts for quick overview

### State Tracking

Each discovered host maintains:
- `discoveredAt`: First time host was seen
- `lastSeenAt`: Most recent sync where host appeared
- `state`: Current state (running/stopped/suspended/unknown)
- `imported`: Whether host has been imported as connection

---

## API Reference

### Sync Provider

```typescript
await window.connectty.providers.sync(providerId: string): Promise<ProviderSyncResult>
```

Performs an incremental sync operation for a provider.

**Parameters:**
- `providerId` (string): The ID of the provider to sync

**Returns:** `ProviderSyncResult` object containing:

```typescript
interface ProviderSyncResult {
  providerId: string;
  providerName: string;
  success: boolean;
  error?: string;
  syncedAt: Date;

  // Host categorization
  newHosts: DiscoveredHost[];
  removedHosts: DiscoveredHost[];
  existingHosts: DiscoveredHost[];
  changedHosts: Array<{
    host: DiscoveredHost;
    previousState: HostState;
    currentState: HostState;
  }>;

  // Summary statistics
  summary: {
    total: number;      // Total hosts in current discovery
    new: number;        // Newly discovered hosts
    removed: number;    // Hosts no longer present
    existing: number;   // Unchanged hosts
    changed: number;    // Hosts with state changes
    imported: number;   // Hosts already imported as connections
  };
}
```

**Example:**

```typescript
const result = await window.connectty.providers.sync('provider-123');

if (result.success) {
  console.log(`Sync completed at ${result.syncedAt}`);
  console.log(`Found ${result.summary.new} new hosts`);
  console.log(`${result.summary.removed} hosts removed`);
  console.log(`${result.summary.changed} hosts changed state`);

  // Show import wizard for new hosts
  if (result.newHosts.length > 0) {
    showImportWizard(result.newHosts);
  }

  // Show notification for removed hosts
  if (result.removedHosts.length > 0) {
    notifyRemovedHosts(result.removedHosts);
  }

  // Show notification for state changes
  if (result.changedHosts.length > 0) {
    notifyStateChanges(result.changedHosts);
  }
} else {
  console.error(`Sync failed: ${result.error}`);
}
```

---

## Frontend Integration

### Basic Sync Button

```tsx
import React, { useState } from 'react';
import type { ProviderSyncResult } from '@connectty/shared';

export function ProviderSyncButton({ providerId }: { providerId: string }) {
  const [syncing, setSyncing] = useState(false);
  const [lastResult, setLastResult] = useState<ProviderSyncResult | null>(null);

  const handleSync = async () => {
    setSyncing(true);
    try {
      const result = await window.connectty.providers.sync(providerId);
      setLastResult(result);

      if (result.success) {
        // Handle new hosts
        if (result.newHosts.length > 0) {
          // Open import wizard
          openImportWizard(result.newHosts);
        }

        // Handle removed hosts
        if (result.removedHosts.length > 0) {
          // Show notification
          showNotification({
            title: 'Hosts Removed',
            message: `${result.removedHosts.length} hosts are no longer available`,
            type: 'warning',
          });
        }
      }
    } catch (error) {
      console.error('Sync failed:', error);
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div>
      <button onClick={handleSync} disabled={syncing}>
        {syncing ? 'Syncing...' : 'Sync Provider'}
      </button>

      {lastResult && (
        <div className="sync-summary">
          <h4>Last Sync: {new Date(lastResult.syncedAt).toLocaleString()}</h4>
          <ul>
            <li>Total hosts: {lastResult.summary.total}</li>
            <li>New: {lastResult.summary.new}</li>
            <li>Removed: {lastResult.summary.removed}</li>
            <li>Changed: {lastResult.summary.changed}</li>
            <li>Imported: {lastResult.summary.imported}</li>
          </ul>
        </div>
      )}
    </div>
  );
}
```

### Sync Result Display

```tsx
export function SyncResultDisplay({ result }: { result: ProviderSyncResult }) {
  if (!result.success) {
    return (
      <div className="sync-error">
        <h3>Sync Failed</h3>
        <p>{result.error}</p>
      </div>
    );
  }

  return (
    <div className="sync-result">
      <div className="sync-header">
        <h3>{result.providerName} Sync Results</h3>
        <time>{new Date(result.syncedAt).toLocaleString()}</time>
      </div>

      {result.newHosts.length > 0 && (
        <section className="new-hosts">
          <h4>New Hosts ({result.newHosts.length})</h4>
          <ul>
            {result.newHosts.map(host => (
              <li key={host.id}>
                {host.name} ({host.publicIp || host.privateIp}) - {host.state}
              </li>
            ))}
          </ul>
          <button onClick={() => importHosts(result.newHosts)}>
            Import All New Hosts
          </button>
        </section>
      )}

      {result.removedHosts.length > 0 && (
        <section className="removed-hosts">
          <h4>Removed Hosts ({result.removedHosts.length})</h4>
          <ul>
            {result.removedHosts.map(host => (
              <li key={host.id}>
                {host.name} ({host.publicIp || host.privateIp})
                {host.imported && ' - Was imported'}
              </li>
            ))}
          </ul>
        </section>
      )}

      {result.changedHosts.length > 0 && (
        <section className="changed-hosts">
          <h4>State Changes ({result.changedHosts.length})</h4>
          <ul>
            {result.changedHosts.map(({ host, previousState, currentState }) => (
              <li key={host.id}>
                {host.name}: {previousState} → {currentState}
              </li>
            ))}
          </ul>
        </section>
      )}

      {result.summary.total === result.summary.existing &&
       result.summary.changed === 0 && (
        <div className="no-changes">
          <p>No changes detected. All {result.summary.total} hosts unchanged.</p>
        </div>
      )}
    </div>
  );
}
```

### Auto-Sync Component

```tsx
import { useEffect, useState } from 'react';

export function AutoSync({
  providerId,
  intervalMinutes = 15
}: {
  providerId: string;
  intervalMinutes?: number;
}) {
  const [lastSync, setLastSync] = useState<Date | null>(null);
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    if (!enabled) return;

    const sync = async () => {
      const result = await window.connectty.providers.sync(providerId);
      setLastSync(new Date(result.syncedAt));

      // Handle results
      if (result.newHosts.length > 0) {
        showNotification({
          title: 'New Hosts Detected',
          message: `${result.newHosts.length} new hosts found`,
          action: () => openImportWizard(result.newHosts),
        });
      }
    };

    // Initial sync
    sync();

    // Set up interval
    const interval = setInterval(sync, intervalMinutes * 60 * 1000);

    return () => clearInterval(interval);
  }, [enabled, providerId, intervalMinutes]);

  return (
    <div className="auto-sync">
      <label>
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
        />
        Auto-sync every {intervalMinutes} minutes
      </label>
      {lastSync && <span>Last sync: {lastSync.toLocaleTimeString()}</span>}
    </div>
  );
}
```

---

## Examples

### Example 1: Basic Sync

```typescript
// Sync a provider
const result = await window.connectty.providers.sync('esxi-prod-01');

console.log('Sync Summary:', result.summary);
// {
//   total: 45,
//   new: 3,
//   removed: 1,
//   existing: 41,
//   changed: 2,
//   imported: 38
// }
```

### Example 2: Handle New Hosts

```typescript
const result = await window.connectty.providers.sync('aws-us-east-1');

if (result.newHosts.length > 0) {
  console.log(`Found ${result.newHosts.length} new hosts:`);

  result.newHosts.forEach(host => {
    console.log(`- ${host.name} (${host.osType})`);
    console.log(`  IP: ${host.publicIp || host.privateIp}`);
    console.log(`  State: ${host.state}`);
  });

  // Show import wizard
  const selectedHosts = await showHostSelectionDialog(result.newHosts);
  if (selectedHosts.length > 0) {
    const imported = await window.connectty.discovered.importSelected(
      selectedHosts.map(h => h.id),
      'default-credential-id',
      'aws-group-id'
    );
    console.log(`Imported ${imported.length} hosts`);
  }
}
```

### Example 3: Handle Removed Hosts

```typescript
const result = await window.connectty.providers.sync('proxmox-cluster');

if (result.removedHosts.length > 0) {
  console.log(`${result.removedHosts.length} hosts removed:`);

  const importedRemoved = result.removedHosts.filter(h => h.imported);

  if (importedRemoved.length > 0) {
    console.warn('Warning: Some removed hosts were imported as connections:');
    importedRemoved.forEach(host => {
      console.warn(`- ${host.name} (Connection ID: ${host.connectionId})`);
    });

    // Show warning dialog
    showDialog({
      title: 'Imported Hosts Removed',
      message: `${importedRemoved.length} hosts that were imported as connections are no longer available in the provider. Do you want to delete the connections?`,
      actions: [
        {
          label: 'Delete Connections',
          onClick: async () => {
            for (const host of importedRemoved) {
              if (host.connectionId) {
                await window.connectty.connections.delete(host.connectionId);
              }
            }
          },
        },
        { label: 'Keep Connections', onClick: () => {} },
      ],
    });
  }
}
```

### Example 4: Handle State Changes

```typescript
const result = await window.connectty.providers.sync('azure-prod');

if (result.changedHosts.length > 0) {
  console.log('Host state changes:');

  result.changedHosts.forEach(({ host, previousState, currentState }) => {
    console.log(`${host.name}: ${previousState} → ${currentState}`);

    // Alert on critical changes
    if (previousState === 'running' && currentState === 'stopped') {
      showAlert({
        title: 'Host Stopped',
        message: `${host.name} has stopped`,
        severity: 'warning',
      });
    }
  });
}
```

### Example 5: Scheduled Sync

```typescript
// Set up auto-discovery on a provider
const provider = await window.connectty.providers.get('gcp-project');

// Enable auto-discovery
await window.connectty.providers.update(provider.id, {
  autoDiscover: true,
  discoverInterval: 30, // minutes
});

// Manual sync trigger
async function syncAndNotify(providerId: string) {
  const result = await window.connectty.providers.sync(providerId);

  if (!result.success) {
    showNotification({
      title: 'Sync Failed',
      message: result.error,
      type: 'error',
    });
    return;
  }

  // Only notify if there are changes
  const hasChanges =
    result.summary.new > 0 ||
    result.summary.removed > 0 ||
    result.summary.changed > 0;

  if (hasChanges) {
    showNotification({
      title: 'Provider Sync Complete',
      message: `${result.summary.new} new, ${result.summary.removed} removed, ${result.summary.changed} changed`,
      type: 'info',
      action: () => showSyncResults(result),
    });
  }
}
```

---

## Best Practices

### 1. Sync Frequency

**Recommended intervals:**
- **Development environments**: 15-30 minutes
- **Production environments**: 5-10 minutes (if infrastructure changes frequently)
- **Stable environments**: 1-2 hours
- **Manual sync**: On-demand when needed

```typescript
// Set reasonable auto-discovery interval
await window.connectty.providers.update(providerId, {
  autoDiscover: true,
  discoverInterval: 15, // Good default
});
```

### 2. Handle New Hosts Gracefully

Always check for new hosts and provide clear import workflow:

```typescript
const result = await window.connectty.providers.sync(providerId);

if (result.newHosts.length > 0) {
  // Don't auto-import - let user review first
  openImportWizard({
    hosts: result.newHosts,
    provider: result.providerName,
    defaultCredential: provider.defaultCredentialId,
    defaultGroup: provider.defaultGroupId,
  });
}
```

### 3. Warn on Removed Imported Hosts

Detect when imported connections are orphaned:

```typescript
const importedAndRemoved = result.removedHosts.filter(h => h.imported);

if (importedAndRemoved.length > 0) {
  showWarning({
    title: 'Connections May Be Orphaned',
    message: `${importedAndRemoved.length} connections reference hosts that no longer exist in the provider.`,
    suggestions: [
      'Verify hosts are actually removed',
      'Check provider connectivity',
      'Consider archiving connections instead of deleting',
    ],
  });
}
```

### 4. Monitor State Changes

Track important state transitions:

```typescript
const criticalChanges = result.changedHosts.filter(
  ({ previousState, currentState }) =>
    previousState === 'running' && currentState !== 'running'
);

if (criticalChanges.length > 0) {
  logAlert('Critical host state changes detected', criticalChanges);
  sendSlackNotification(`${criticalChanges.length} production hosts stopped`);
}
```

### 5. Error Handling

Always handle sync failures gracefully:

```typescript
try {
  const result = await window.connectty.providers.sync(providerId);

  if (!result.success) {
    // Provider returned error
    console.error('Sync failed:', result.error);

    // Check if it's a transient error
    if (result.error?.includes('timeout') || result.error?.includes('network')) {
      scheduleRetry(providerId, 5); // Retry in 5 minutes
    } else {
      // Persistent error - notify admin
      notifyAdminOfProviderIssue(providerId, result.error);
    }
  }
} catch (error) {
  // Unexpected error
  console.error('Unexpected sync error:', error);
  reportErrorToMonitoring(error);
}
```

### 6. Performance Considerations

For providers with many hosts:

```typescript
// Use pagination or filtering if available
const result = await window.connectty.providers.sync(providerId);

if (result.summary.total > 1000) {
  console.warn(`Large provider with ${result.summary.total} hosts`);

  // Process in batches
  const batches = chunkArray(result.newHosts, 50);
  for (const batch of batches) {
    await processHostBatch(batch);
    await sleep(100); // Avoid overwhelming the UI
  }
}
```

### 7. Audit Trail

Maintain sync history for compliance:

```typescript
const result = await window.connectty.providers.sync(providerId);

// Log sync event
await logAuditEvent({
  type: 'provider_sync',
  providerId: result.providerId,
  timestamp: result.syncedAt,
  summary: result.summary,
  newHosts: result.newHosts.map(h => h.name),
  removedHosts: result.removedHosts.map(h => h.name),
});
```

---

## Summary

The provider sync feature provides:

✅ **Incremental discovery** - Efficient change detection
✅ **New host workflow** - Automatic import wizard trigger
✅ **Removed host tracking** - Identify orphaned connections
✅ **State monitoring** - Track infrastructure changes
✅ **Comprehensive results** - Detailed sync information
✅ **Persistent history** - Maintains discovery state
✅ **Error handling** - Graceful failure recovery

Perfect for maintaining an accurate, up-to-date infrastructure inventory with minimal manual intervention!
