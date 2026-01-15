# Cloud Provider Setup

Configure Connectty to discover and import servers from your hypervisors and cloud platforms.

---

## Overview

Connectty supports automatic discovery from multiple infrastructure providers. Once configured, you can:

1. **Discover** - Scan for running VMs/instances
2. **Import** - Selectively add servers as connections
3. **Sync** - Re-scan to find new or changed servers
4. **Manage** - Bulk operations on provider-imported hosts

---

## VMware vSphere / ESXi

Connect to VMware vCenter Server or standalone ESXi hosts.

### Requirements

- vCenter Server 6.5+ or ESXi 6.5+
- User account with read access to inventory
- Network access to vCenter/ESXi API (port 443)

### Configuration

| Field | Description | Example |
|:------|:------------|:--------|
| **Name** | Display name for this provider | `Production vCenter` |
| **Type** | Select VMware | `vmware` |
| **Hostname** | vCenter or ESXi address | `vcenter.example.com` |
| **Port** | API port (default 443) | `443` |
| **Username** | vSphere user | `administrator@vsphere.local` |
| **Password** | User password | `********` |
| **Verify SSL** | Validate certificate | `true` / `false` |

### Discovered Data

| Field | Source |
|:------|:-------|
| VM Name | vSphere inventory name |
| IP Address | VMware Tools guest info |
| OS Type | Guest OS identifier |
| State | Power state (on/off/suspended) |
| Tags | vSphere tags and custom attributes |

### Permissions Required

Minimum vSphere permissions:
- `VirtualMachine.Inventory.Read`
- `VirtualMachine.GuestOperations.Query`

---

## Proxmox VE

Connect to Proxmox Virtual Environment clusters or standalone nodes.

### Requirements

- Proxmox VE 6.0+
- API user or token with read access
- Network access to Proxmox API (port 8006)

### Configuration

| Field | Description | Example |
|:------|:------------|:--------|
| **Name** | Display name for this provider | `Proxmox Cluster` |
| **Type** | Select Proxmox | `proxmox` |
| **Hostname** | Proxmox node or cluster IP | `proxmox.example.com` |
| **Port** | API port (default 8006) | `8006` |
| **Username** | Proxmox user with realm | `root@pam` or `api@pve` |
| **Password** | User password or API token | `********` |
| **Verify SSL** | Validate certificate | `true` / `false` |

### API Token Setup

For better security, use API tokens instead of passwords:

```bash
# Create API token in Proxmox
pveum user token add root@pam connectty --privsep 0

# Use in Connectty:
# Username: root@pam!connectty
# Password: <token-value>
```

### Discovered Data

| Field | Source |
|:------|:-------|
| VM Name | QEMU/LXC name |
| IP Address | QEMU Guest Agent or config |
| OS Type | Config template |
| State | Running/stopped/paused |
| Type | QEMU VM or LXC container |

### Container Support

Both QEMU VMs and LXC containers are discovered:
- **QEMU**: Full virtual machines
- **LXC**: Lightweight containers

---

## Amazon Web Services (AWS)

Connect to AWS to discover EC2 instances.

### Requirements

- AWS account with EC2 access
- IAM credentials (access key or IAM role)
- Network access to AWS APIs

### Configuration

| Field | Description | Example |
|:------|:------------|:--------|
| **Name** | Display name for this provider | `AWS Production` |
| **Type** | Select AWS | `aws` |
| **Region** | AWS region | `us-east-1` |
| **Access Key ID** | IAM access key | `AKIAIOSFODNN7EXAMPLE` |
| **Secret Access Key** | IAM secret key | `********` |

### IAM Policy

Minimum required permissions:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "ec2:DescribeInstances",
        "ec2:DescribeRegions",
        "ec2:DescribeTags"
      ],
      "Resource": "*"
    }
  ]
}
```

### Discovered Data

| Field | Source |
|:------|:-------|
| Instance Name | `Name` tag |
| Public IP | Elastic IP or auto-assigned |
| Private IP | VPC private address |
| OS Type | Platform (linux/windows) |
| State | Instance state |
| Tags | All EC2 tags |

### Multi-Region

Create separate providers for each AWS region you want to discover.

---

## Google Cloud Platform (GCP)

Connect to GCP to discover Compute Engine instances.

### Requirements

- GCP project with Compute Engine
- Service account with read access
- Network access to GCP APIs

### Configuration

| Field | Description | Example |
|:------|:------------|:--------|
| **Name** | Display name for this provider | `GCP Production` |
| **Type** | Select GCP | `gcp` |
| **Project ID** | GCP project identifier | `my-project-123456` |
| **Zone** | Compute zone | `us-central1-a` |
| **Service Account** | JSON key file contents | `{ "type": "service_account", ... }` |

### Service Account Setup

1. Go to **IAM & Admin** > **Service Accounts**
2. Create a new service account
3. Grant `Compute Viewer` role
4. Create and download JSON key
5. Paste key contents into Connectty

### Discovered Data

| Field | Source |
|:------|:-------|
| Instance Name | Compute Engine name |
| External IP | External NAT IP |
| Internal IP | VPC internal IP |
| OS Type | Boot disk image family |
| State | RUNNING/STOPPED/etc |
| Labels | GCP labels as tags |

---

## Microsoft Azure

Connect to Azure to discover Virtual Machines.

### Requirements

- Azure subscription
- Service principal or managed identity
- Network access to Azure APIs

### Configuration

| Field | Description | Example |
|:------|:------------|:--------|
| **Name** | Display name for this provider | `Azure Production` |
| **Type** | Select Azure | `azure` |
| **Subscription ID** | Azure subscription | `12345678-1234-...` |
| **Tenant ID** | Azure AD tenant | `87654321-4321-...` |
| **Client ID** | Service principal app ID | `abcdef12-3456-...` |
| **Client Secret** | Service principal secret | `********` |

### Service Principal Setup

```bash
# Create service principal with Azure CLI
az ad sp create-for-rbac \
  --name "Connectty" \
  --role "Reader" \
  --scopes "/subscriptions/<subscription-id>"

# Output provides:
# - appId (Client ID)
# - password (Client Secret)
# - tenant (Tenant ID)
```

### Discovered Data

| Field | Source |
|:------|:-------|
| VM Name | Azure resource name |
| Public IP | Public IP resource |
| Private IP | NIC private IP |
| OS Type | OS disk type |
| State | Power state |
| Tags | Azure resource tags |

---

## Import Workflow

### Step 1: Add Provider

1. Click **Add Provider** in the sidebar
2. Fill in connection details
3. Click **Test Connection** to verify
4. Save the provider

### Step 2: Discover Hosts

1. Right-click the provider
2. Select **Discover Hosts**
3. Wait for scan to complete

### Step 3: Import Hosts

1. Right-click the provider
2. Select **Import Hosts**
3. Review discovered servers:

```
┌─────────────────────────────────────────────────────────────┐
│  Import Hosts from Production vCenter                       │
├─────────────────────────────────────────────────────────────┤
│  [✓] Select All (15 available)           12 selected       │
│                                                             │
│  Assign Credential: [Linux Root        ▼]                  │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ [✓] web-01          192.168.1.10    running  linux │   │
│  │ [✓] web-02          192.168.1.11    running  linux │   │
│  │ [✓] db-01           192.168.1.20    running  linux │   │
│  │ [ ] test-vm         192.168.1.99    stopped  linux │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  Already Imported (3):                                      │
│  • app-01, app-02, cache-01                                │
│                                                             │
│                    [Cancel]  [Import 12 Hosts]             │
└─────────────────────────────────────────────────────────────┘
```

4. Select hosts to import
5. Optionally assign a credential
6. Click **Import**

### Step 4: Manage Imported Hosts

- **Re-discover**: Scan for new VMs
- **Remove Hosts**: Delete all connections from this provider
- **Edit Provider**: Update connection settings

---

## Credential Auto-Assignment

Configure credentials to automatically match imported hosts.

### By OS Type

```yaml
Credential: "Linux Root"
Settings:
  Auto-assign OS Types: [linux, unix]
```

When importing a Linux VM, this credential is automatically assigned.

### By Hostname Pattern

```yaml
Credential: "Web Servers"
Settings:
  Auto-assign Patterns: ["web-*", "*-www-*"]
```

Hosts matching `web-01`, `prod-www-server`, etc. get this credential.

### Manual Override

During import, select a credential from the dropdown to override auto-assignment for all selected hosts.

---

## Duplicate Name Handling

When importing servers with names that already exist:

**Same Name, Different Provider:**
```
Existing: web-01 (already imported from AWS)
Importing: web-01 (from vCenter)

Result:
├── web-01 (AWS)        ← existing, renamed
└── web-01 (vCenter)    ← new import
```

**Same Name, Same Provider:**
The existing connection remains unchanged; duplicates are skipped.

---

## Troubleshooting

### Connection Failed

| Error | Solution |
|:------|:---------|
| Connection refused | Check hostname/port, firewall rules |
| SSL certificate error | Enable "Verify SSL: false" or install cert |
| Authentication failed | Verify username/password, check permissions |
| Timeout | Network latency, increase timeout |

### No Hosts Discovered

| Issue | Solution |
|:------|:---------|
| Empty results | Check user permissions on provider |
| Missing VMs | Ensure VMs are powered on (some filters apply) |
| Wrong region/zone | Verify region/zone configuration |

### IP Address Missing

| Provider | Solution |
|:---------|:---------|
| VMware | Install/update VMware Tools on guest |
| Proxmox | Install QEMU Guest Agent |
| AWS | Check VPC/subnet configuration |
| GCP | Verify external IP assignment |
| Azure | Check NIC and Public IP resources |

---

## Best Practices

1. **Use API Tokens** - Prefer tokens over passwords where supported
2. **Least Privilege** - Grant minimum required permissions
3. **Separate Providers** - Create one provider per environment/region
4. **Regular Discovery** - Re-scan periodically to catch new VMs
5. **Credential Patterns** - Set up auto-assignment rules to save time
