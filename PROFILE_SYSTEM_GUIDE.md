# Profile System

The profile system allows users to maintain multiple completely isolated instances of Connectty, each with its own connections, credentials, groups, providers, and settings. This is perfect for managing different environments (work/personal), clients, or organizational units.

## Table of Contents

1. [Overview](#overview)
2. [Features](#features)
3. [How It Works](#how-it-works)
4. [API Reference](#api-reference)
5. [Frontend Integration](#frontend-integration)
6. [Examples](#examples)
7. [Migration](#migration)
8. [Best Practices](#best-practices)

---

## Overview

### What Are Profiles?

Profiles provide complete data isolation in Connectty. When you switch profiles, you're essentially switching to a completely different instance with its own:

- **Connections** - SSH/RDP/Serial connections
- **Credentials** - Saved authentication credentials
- **Groups** - Connection groups (static and dynamic)
- **Providers** - Infrastructure providers (ESXi, AWS, etc.)
- **Saved Commands** - Scripts and bulk commands
- **Settings** - App configuration (coming soon)

### Use Cases

**1. Separate Work/Personal**
```
Profile: Work
├── Connections: prod-web-01, staging-db-01, ...
├── Credentials: work-ssh-key, work-rdp, ...
└── Providers: company-aws, company-esxi, ...

Profile: Personal
├── Connections: home-server, raspberry-pi, ...
├── Credentials: personal-key, ...
└── Providers: personal-aws, ...
```

**2. Multi-Client Management**
```
Profile: Client A
├── Connections: clienta-prod-*, clienta-dev-*, ...
└── Credentials: clienta-admin, ...

Profile: Client B
├── Connections: clientb-prod-*, clientb-dev-*, ...
└── Credentials: clientb-admin, ...
```

**3. Environment Separation**
```
Profile: Production
├── Connections: All production servers
└── Strict credential policies

Profile: Development
├── Connections: Dev/test servers
└── Relaxed policies
```

---

## Features

✅ **Complete Isolation** - Each profile is a separate world
✅ **Default Profile** - Existing data automatically migrated to "Default" profile
✅ **Profile Switching** - Instantly switch between profiles
✅ **Cannot Delete Active** - Safety: can't delete the profile you're using
✅ **Cannot Delete Default** - Default profile is protected
✅ **Cascading Delete** - Deleting profile removes all associated data
✅ **Real-time Events** - Frontend notified when profile switches
✅ **Automatic Migration** - Existing installations seamlessly upgraded

---

## How It Works

### Database Structure

#### Profiles Table
```sql
CREATE TABLE profiles (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  is_default INTEGER DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

#### Profile-Scoped Tables

All major tables have `profile_id` column:
- `connections.profile_id`
- `credentials.profile_id`
- `connection_groups.profile_id`
- `providers.profile_id`
- `saved_commands.profile_id`
- `command_history.profile_id`

### Active Profile Tracking

The active profile is stored in `app_config`:
```sql
INSERT INTO app_config (key, value) VALUES ('active_profile_id', 'profile-123');
```

### Filtering Logic

All database queries filter by active profile:
```typescript
getConnections(): ServerConnection[] {
  const activeProfileId = this.getActiveProfileId();
  const stmt = this.db.prepare('SELECT * FROM connections WHERE profile_id = ? ORDER BY name');
  return stmt.all(activeProfileId).map(this.rowToConnection);
}
```

### Profile Switching

When switching profiles:
1. Update active profile in app_config
2. Emit `profiles:switched` event to frontend
3. Frontend reloads all data for new profile

---

## API Reference

### List Profiles

```typescript
await window.connectty.profiles.list(): Promise<Profile[]>
```

Returns all profiles, ordered by default first, then by name.

**Example:**
```typescript
const profiles = await window.connectty.profiles.list();
// [
//   { id: '1', name: 'Default', isDefault: true, ... },
//   { id: '2', name: 'Personal', isDefault: false, ... },
//   { id: '3', name: 'Work', isDefault: false, ... }
// ]
```

### Get Profile

```typescript
await window.connectty.profiles.get(id: string): Promise<Profile | null>
```

Get a specific profile by ID.

**Example:**
```typescript
const profile = await window.connectty.profiles.get('profile-123');
console.log(profile.name); // "Work"
```

### Create Profile

```typescript
await window.connectty.profiles.create(data: {
  name: string;
  description?: string;
}): Promise<Profile>
```

Create a new profile. Starts with no data (empty connections, credentials, etc.).

**Example:**
```typescript
const newProfile = await window.connectty.profiles.create({
  name: 'Client A',
  description: 'Infrastructure for Client A project'
});
```

### Update Profile

```typescript
await window.connectty.profiles.update(
  id: string,
  updates: { name?: string; description?: string }
): Promise<Profile | null>
```

Update profile name or description.

**Example:**
```typescript
await window.connectty.profiles.update('profile-123', {
  name: 'Client A - Updated',
  description: 'Updated description'
});
```

### Delete Profile

```typescript
await window.connectty.profiles.delete(id: string): Promise<boolean>
```

Delete a profile and ALL associated data (connections, credentials, etc.).

**Restrictions:**
- Cannot delete the default profile
- Cannot delete the currently active profile (switch first)

**Example:**
```typescript
try {
  await window.connectty.profiles.delete('profile-123');
  console.log('Profile and all data deleted');
} catch (error) {
  console.error('Cannot delete:', error.message);
}
```

### Get Active Profile

```typescript
await window.connectty.profiles.getActive(): Promise<Profile | null>
```

Get the currently active profile.

**Example:**
```typescript
const active = await window.connectty.profiles.getActive();
console.log(`Currently using: ${active.name}`);
```

### Switch Profile

```typescript
await window.connectty.profiles.switch(profileId: string): Promise<boolean>
```

Switch to a different profile. Triggers `profiles:switched` event.

**Example:**
```typescript
const success = await window.connectty.profiles.switch('profile-456');
if (success) {
  console.log('Switched profile - reload all data');
}
```

### Listen for Profile Switches

```typescript
const unsubscribe = window.connectty.profiles.onSwitched(
  (profileId: string) => void
): () => void
```

Listen for profile switch events to reload data.

**Example:**
```typescript
const unsubscribe = window.connectty.profiles.onSwitched((profileId) => {
  console.log(`Switched to profile: ${profileId}`);
  // Reload all data for new profile
  reloadAllData();
});

// Cleanup when component unmounts
return () => unsubscribe();
```

---

## Frontend Integration

### React Profile Selector Component

```tsx
import React, { useEffect, useState } from 'react';
import type { Profile } from '@connectty/shared';

export function ProfileSelector() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [activeProfile, setActiveProfile] = useState<Profile | null>(null);

  useEffect(() => {
    loadProfiles();
    loadActive();

    // Listen for profile switches
    const unsubscribe = window.connectty.profiles.onSwitched((profileId) => {
      loadActive();
      // Trigger app-wide data reload
      window.location.reload(); // Simple approach
      // or: dispatch({ type: 'RELOAD_ALL_DATA' }); // Redux approach
    });

    return () => unsubscribe();
  }, []);

  const loadProfiles = async () => {
    const list = await window.connectty.profiles.list();
    setProfiles(list);
  };

  const loadActive = async () => {
    const active = await window.connectty.profiles.getActive();
    setActiveProfile(active);
  };

  const handleSwitch = async (profileId: string) => {
    await window.connectty.profiles.switch(profileId);
  };

  return (
    <div className="profile-selector">
      <select
        value={activeProfile?.id || ''}
        onChange={(e) => handleSwitch(e.target.value)}
      >
        {profiles.map(profile => (
          <option key={profile.id} value={profile.id}>
            {profile.name} {profile.isDefault ? '(Default)' : ''}
          </option>
        ))}
      </select>
    </div>
  );
}
```

### Profile Management Dialog

```tsx
export function ProfileManagementDialog() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [activeProfileId, setActiveProfileId] = useState<string>('');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    const [list, active] = await Promise.all([
      window.connectty.profiles.list(),
      window.connectty.profiles.getActive(),
    ]);
    setProfiles(list);
    setActiveProfileId(active?.id || '');
  };

  const handleCreate = async () => {
    const name = prompt('Profile name:');
    if (!name) return;

    const description = prompt('Description (optional):') || undefined;
    await window.connectty.profiles.create({ name, description });
    await loadData();
  };

  const handleDelete = async (profileId: string, profileName: string) => {
    if (!confirm(`Delete profile "${profileName}" and ALL its data?`)) {
      return;
    }

    try {
      await window.connectty.profiles.delete(profileId);
      await loadData();
    } catch (error) {
      alert(`Error: ${error.message}`);
    }
  };

  const handleSwitch = async (profileId: string) => {
    await window.connectty.profiles.switch(profileId);
    // Data will reload via onSwitched event
  };

  return (
    <div className="profile-management">
      <h2>Profiles</h2>

      <button onClick={handleCreate}>+ New Profile</button>

      <div className="profile-list">
        {profiles.map(profile => (
          <div key={profile.id} className="profile-item">
            <div className="profile-info">
              <strong>{profile.name}</strong>
              {profile.isDefault && <span className="badge">Default</span>}
              {profile.id === activeProfileId && <span className="badge active">Active</span>}
              {profile.description && <p>{profile.description}</p>}
            </div>

            <div className="profile-actions">
              {profile.id !== activeProfileId && (
                <button onClick={() => handleSwitch(profile.id)}>
                  Switch
                </button>
              )}
              {!profile.isDefault && profile.id !== activeProfileId && (
                <button
                  onClick={() => handleDelete(profile.id, profile.name)}
                  className="danger"
                >
                  Delete
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
```

### App-Wide Profile Context

```tsx
// ProfileContext.tsx
import React, { createContext, useContext, useEffect, useState } from 'react';
import type { Profile } from '@connectty/shared';

interface ProfileContextType {
  activeProfile: Profile | null;
  profiles: Profile[];
  switchProfile: (profileId: string) => Promise<void>;
  reloadProfile: () => Promise<void>;
}

const ProfileContext = createContext<ProfileContextType | null>(null);

export function ProfileProvider({ children }: { children: React.ReactNode }) {
  const [activeProfile, setActiveProfile] = useState<Profile | null>(null);
  const [profiles, setProfiles] = useState<Profile[]>([]);

  useEffect(() => {
    loadProfileData();

    // Listen for profile switches (from other windows/sources)
    const unsubscribe = window.connectty.profiles.onSwitched(() => {
      loadProfileData();
      // Trigger full app reload
      window.dispatchEvent(new CustomEvent('profile-changed'));
    });

    return () => unsubscribe();
  }, []);

  const loadProfileData = async () => {
    const [active, list] = await Promise.all([
      window.connectty.profiles.getActive(),
      window.connectty.profiles.list(),
    ]);
    setActiveProfile(active);
    setProfiles(list);
  };

  const switchProfile = async (profileId: string) => {
    await window.connectty.profiles.switch(profileId);
    // onSwitched event will handle reload
  };

  const reloadProfile = async () => {
    await loadProfileData();
  };

  return (
    <ProfileContext.Provider value={{ activeProfile, profiles, switchProfile, reloadProfile }}>
      {children}
    </ProfileContext.Provider>
  );
}

export function useProfile() {
  const context = useContext(ProfileContext);
  if (!context) {
    throw new Error('useProfile must be used within ProfileProvider');
  }
  return context;
}
```

---

## Examples

### Example 1: Create Work and Personal Profiles

```typescript
// Create work profile
const work = await window.connectty.profiles.create({
  name: 'Work',
  description: 'Company infrastructure'
});

// Create personal profile
const personal = await window.connectty.profiles.create({
  name: 'Personal',
  description: 'Home lab and personal projects'
});

// Switch to work profile
await window.connectty.profiles.switch(work.id);

// Now all operations (creating connections, etc.) will be in Work profile
const connection = await window.connectty.connections.create({
  name: 'prod-web-01',
  hostname: '10.0.1.10',
  port: 22,
  connectionType: 'ssh',
});
```

### Example 2: Profile Switcher in Settings

```typescript
async function buildProfileSettings() {
  const profiles = await window.connectty.profiles.list();
  const active = await window.connectty.profiles.getActive();

  return {
    section: 'Profiles',
    items: [
      {
        label: 'Active Profile',
        type: 'select',
        value: active?.id,
        options: profiles.map(p => ({ value: p.id, label: p.name })),
        onChange: async (profileId: string) => {
          await window.connectty.profiles.switch(profileId);
        },
      },
      {
        label: 'Manage Profiles',
        type: 'button',
        onClick: () => openProfileManagementDialog(),
      },
    ],
  };
}
```

### Example 3: Auto-Reload on Profile Switch

```typescript
// In your main App component
useEffect(() => {
  const unsubscribe = window.connectty.profiles.onSwitched(() => {
    // Option 1: Full page reload (simplest)
    window.location.reload();

    // Option 2: Reload all data without page refresh
    // reloadConnections();
    // reloadCredentials();
    // reloadGroups();
    // reloadProviders();
    // reloadCommands();
  });

  return () => unsubscribe();
}, []);
```

### Example 4: Bulk Profile Setup

```typescript
async function setupClientProfiles() {
  const clients = ['Client A', 'Client B', 'Client C'];

  for (const clientName of clients) {
    // Create profile
    const profile = await window.connectty.profiles.create({
      name: clientName,
      description: `Infrastructure for ${clientName}`
    });

    // Switch to this profile
    await window.connectty.profiles.switch(profile.id);

    // Create client-specific credential
    await window.connectty.credentials.create({
      name: `${clientName} SSH Key`,
      type: 'publickey',
      username: 'admin',
      privateKey: '...',
    });

    // Create client-specific group
    await window.connectty.groups.create({
      name: `${clientName} Servers`,
      membershipType: 'dynamic',
      rules: { hostnamePatterns: [`${clientName.toLowerCase()}-*`] },
    });
  }

  // Switch back to default
  const profiles = await window.connectty.profiles.list();
  const defaultProfile = profiles.find(p => p.isDefault);
  if (defaultProfile) {
    await window.connectty.profiles.switch(defaultProfile.id);
  }
}
```

---

## Migration

### Automatic Migration

When Connectty is first upgraded to include profiles:

1. **Default Profile Created**
   - A "Default" profile is automatically created
   - Marked as `isDefault: true`
   - Set as the active profile

2. **Existing Data Migrated**
   - All existing connections → Default profile
   - All existing credentials → Default profile
   - All existing groups → Default profile
   - All existing providers → Default profile
   - All existing saved commands → Default profile

3. **Seamless Experience**
   - Users see no difference initially
   - Everything works exactly as before
   - Can create new profiles when ready

### Migration Code

```typescript
// In database.ts - initializeProfiles()
const defaultProfileId = generateId();
const now = new Date().toISOString();

// Create default profile
db.prepare(`
  INSERT INTO profiles (id, name, description, is_default, created_at, updated_at)
  VALUES (?, 'Default', 'Default profile', 1, ?, ?)
`).run(defaultProfileId, now, now);

// Migrate existing data
const tables = ['connections', 'credentials', 'connection_groups', 'providers', 'saved_commands'];
for (const table of tables) {
  db.prepare(`UPDATE ${table} SET profile_id = ? WHERE profile_id IS NULL`)
    .run(defaultProfileId);
}

// Set as active profile
db.prepare(`INSERT INTO app_config (key, value) VALUES ('active_profile_id', ?)`)
  .run(defaultProfileId);
```

---

## Best Practices

### 1. Name Profiles Clearly

**Good:**
- "Work - CompanyName"
- "Personal - Home Lab"
- "Client: Acme Corp"

**Bad:**
- "Profile 1"
- "Test"
- "asdf"

### 2. Use Descriptions

```typescript
await window.connectty.profiles.create({
  name: 'Production',
  description: 'Production infrastructure - handle with care!'
});
```

### 3. Keep Default Profile Clean

The Default profile is protected and can't be deleted. Use it for:
- Testing
- Temporary connections
- Learning Connectty

Then create specific profiles for real work.

### 4. Don't Over-Profile

Profiles add overhead. Don't create a profile for every single use case. Use groups within profiles instead.

**Over-profiled:**
```
- Profile: Prod Web Servers
- Profile: Prod DB Servers
- Profile: Prod App Servers
```

**Better:**
```
Profile: Production
├── Group: Web Servers
├── Group: DB Servers
└── Group: App Servers
```

### 5. Warn Before Switching

```typescript
const handleProfileSwitch = async (profileId: string) => {
  if (!confirm('Switching profiles will reload all data. Continue?')) {
    return;
  }

  await window.connectty.profiles.switch(profileId);
};
```

### 6. Handle Switch Events Gracefully

```typescript
window.connectty.profiles.onSwitched(() => {
  // Show loading indicator
  showLoadingOverlay('Switching profile...');

  // Reload data
  setTimeout(() => {
    window.location.reload();
  }, 500);
});
```

### 7. Export/Backup Profiles

Since deleting a profile deletes ALL data, make sure to back up important profiles:

```typescript
async function backupProfile(profileId: string) {
  // Switch to profile
  await window.connectty.profiles.switch(profileId);

  // Export all data
  await window.connectty.export.file({
    filePath: `/backups/profile-${Date.now()}.json`,
    includeConnections: true,
    includeCredentials: true,
    includeGroups: true,
    includeProviders: true,
  });
}
```

### 8. Profile Switching Shortcut

Consider adding keyboard shortcut for quick profile switching:

```typescript
// Ctrl+P to open profile switcher
document.addEventListener('keydown', (e) => {
  if (e.ctrlKey && e.key === 'p') {
    e.preventDefault();
    openProfileSwitcher();
  }
});
```

---

## Summary

The profile system provides:

✅ **Complete isolation** - Separate workspaces for different contexts
✅ **Easy switching** - One click to change entire environment
✅ **Protected defaults** - Can't accidentally delete important profiles
✅ **Automatic migration** - Existing data seamlessly upgraded
✅ **Real-time sync** - Frontend always knows active profile
✅ **Cascading operations** - Deleting profile cleans up all data
✅ **Flexible organization** - Perfect for work/personal, multi-client, or environment separation

Perfect for managing complex multi-environment infrastructures!
