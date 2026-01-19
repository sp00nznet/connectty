# Dynamic Groups Guide

This guide covers the dynamic groups feature in Connectty, which allows automatic group membership based on pattern matching and rules.

## Table of Contents

1. [Overview](#overview)
2. [Group Types](#group-types)
3. [Rule-Based Matching](#rule-based-matching)
4. [API Reference](#api-reference)
5. [Examples](#examples)
6. [Best Practices](#best-practices)

---

## Overview

Groups in Connectty can be **static** (manually assigned) or **dynamic** (pattern-based automatic membership). Dynamic groups automatically include hosts matching specified rules.

### Use Cases

- **Environment-based filtering**: Automatically group dev, staging, prod servers
- **OS-based grouping**: All Linux or Windows hosts together
- **Provider-based organization**: All AWS or Azure VMs in one group
- **Credential auto-assignment**: Apply credentials to matching hosts

---

## Group Types

### Static Groups

Traditional folder-like organization where hosts are manually assigned.

- Hosts manually assigned to the group
- Good for: Project-based grouping, manual organization
- Members don't change unless you add/remove them

### Dynamic Groups

Hosts automatically included based on rules that are evaluated when connections are created or updated.

- Rules evaluated automatically
- Good for: Environment-based filtering, OS-based grouping, provider-based organization
- Membership updates as your infrastructure changes

---

## Rule-Based Matching

Dynamic groups support multiple rule types. All rules in a group must match (AND logic).

### Rule Structure

```typescript
interface GroupRule {
  // Pattern matching (e.g., "dev-web-*", "prod-db-*", "*-linux")
  hostnamePattern?: string;

  // OS type filtering
  osType?: OSType | OSType[];  // 'linux' | 'windows' | 'unix' | 'esxi'

  // Tag matching
  tags?: string[];

  // Provider filtering
  providerId?: string;

  // Connection type filtering
  connectionType?: ConnectionType;  // 'ssh' | 'rdp' | 'serial'
}
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

## API Reference

### Create a Group

```typescript
const group = await window.connectty.groups.create({
  name: "Development Servers",
  description: "All development environment servers",
  membershipType: "dynamic",
  rules: [{
    hostnamePattern: "dev-*",
    osType: "linux"
  }],
  credentialId: "dev-credential-id"  // Optional: auto-assign credential
});
```

### Update a Group

```typescript
await window.connectty.groups.update(groupId, {
  rules: [{
    hostnamePattern: "prod-*",
    tags: ["critical"]
  }]
});
```

### Get Connections in a Group

```typescript
// Works for both static and dynamic groups
const connections = await window.connectty.groups.getConnectionsForGroup(groupId);
```

### List All Groups

```typescript
const groups = await window.connectty.groups.list();
```

### Delete a Group

```typescript
await window.connectty.groups.delete(groupId);
```

---

## Examples

### Example 1: All Development Servers

```typescript
const devGroup = await window.connectty.groups.create({
  name: "Development Servers",
  membershipType: "dynamic",
  rules: [{
    hostnamePattern: "dev-*"
  }]
});
```

### Example 2: All Windows Hosts

```typescript
const windowsGroup = await window.connectty.groups.create({
  name: "Windows Machines",
  membershipType: "dynamic",
  rules: [{
    osType: "windows"
  }]
});
```

### Example 3: Production Linux Database Servers

```typescript
const prodDbGroup = await window.connectty.groups.create({
  name: "Prod DB Servers",
  membershipType: "dynamic",
  rules: [{
    hostnamePattern: "prod-db-*",
    osType: "linux"
  }]
});
```

### Example 4: Multiple OS Types

```typescript
const unixLikeGroup = await window.connectty.groups.create({
  name: "Unix-like Systems",
  membershipType: "dynamic",
  rules: [{
    osType: ["linux", "unix", "esxi"]
  }]
});
```

### Example 5: Provider-Specific Group

```typescript
const awsGroup = await window.connectty.groups.create({
  name: "AWS Instances",
  membershipType: "dynamic",
  rules: [{
    providerId: "aws-provider-id"
  }]
});
```

### Example 6: Auto-Assign Credentials

When a dynamic group has an assigned credential, matching hosts automatically get that credential assigned:

```typescript
const prodGroup = await window.connectty.groups.create({
  name: "Production Servers",
  membershipType: "dynamic",
  rules: [{ hostnamePattern: "prod-*" }],
  credentialId: "prod-credential-id"  // Auto-applied to matching hosts
});
```

---

## Best Practices

### 1. Keep Rules Simple

Complex rule combinations can be confusing. Prefer simple, clear patterns.

**Good:**
```typescript
{ hostnamePattern: "prod-*" }
```

**Avoid:**
```typescript
{ hostnamePattern: "*-prod-*", osType: ["linux", "unix"], tags: ["tier1", "tier2"] }
```

### 2. Use Descriptive Names

The group name should clearly indicate what the group contains.

**Good:**
- "Production Web Servers"
- "Development Linux Hosts"
- "AWS US-East Instances"

**Avoid:**
- "Group 1"
- "Servers"
- "Misc"

### 3. Document Your Patterns

Add descriptions explaining the pattern logic:

```typescript
{
  name: "Web Tier",
  description: "Matches servers with 'web' or 'nginx' in hostname",
  membershipType: "dynamic",
  rules: [{ hostnamePattern: "*web*" }]
}
```

### 4. Test Patterns Before Assigning Credentials

Verify patterns match expected hosts before assigning credentials:

```typescript
// Create group first without credentials
const group = await window.connectty.groups.create({
  name: "Test Group",
  membershipType: "dynamic",
  rules: [{ hostnamePattern: "prod-*" }]
});

// Check matches
const matches = await window.connectty.groups.getConnectionsForGroup(group.id);
console.log("Matching hosts:", matches.map(c => c.name));

// If correct, update with credential
if (matches.length > 0) {
  await window.connectty.groups.update(group.id, {
    credentialId: "prod-credential-id"
  });
}
```

### 5. Use Groups for Bulk Commands

Dynamic groups work great with bulk command execution:

```typescript
await window.connectty.commands.execute({
  commandName: "Check Disk Space",
  command: "df -h",
  targetOS: "linux",
  filter: {
    type: "group",
    groupId: "prod-servers-group-id"
  }
});
```

---

## Migration Notes

### Existing Databases

The implementation includes migrations that automatically add new columns to existing databases. Existing groups will be treated as static groups and continue to work as before.

### Backward Compatibility

- Static groups work exactly as before
- Existing connections, credentials, and groups unchanged
- No breaking changes to existing APIs

---

## Summary

Dynamic groups provide:

- **Automatic host grouping** based on patterns and rules
- **Group-based credentials** with auto-assignment to matching hosts
- **Flexible matching** by hostname pattern, OS type, tags, provider, or connection type
- **Backward compatibility** with existing static groups
