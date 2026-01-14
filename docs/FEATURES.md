# ✨ Features Guide

Detailed documentation for Connectty's key features.

## 📡 Connection Types

### SSH Connections

Connect to Linux, Unix, and ESXi hosts via SSH.

- **Authentication Methods:**
  - Password
  - SSH Private Key (with optional passphrase)
  - SSH Agent forwarding
  - Keyboard-interactive

- **Terminal Features:**
  - Full xterm-256color support
  - Automatic terminal resizing
  - Copy/paste support
  - Customizable themes

### RDP Connections

Connect to Windows hosts via Remote Desktop Protocol.

- **Desktop Client:** Launches native RDP client (mstsc.exe on Windows, xfreerdp on Linux)
- **Supports:** Domain authentication, custom port, NLA

---

## ☁️ Provider Discovery

Automatically discover and import hosts from hypervisors and cloud platforms.

### Supported Providers

| Provider | Auto-Discovery | OS Detection |
|----------|---------------|--------------|
| 🖥️ VMware ESXi/vSphere | ✅ | ✅ |
| 🟠 Proxmox VE | ✅ | ✅ |
| 🟡 AWS EC2 | ✅ | ✅ |
| 🔵 Google Cloud | ✅ | ✅ |
| 🟣 Microsoft Azure | ✅ | ✅ |

### How It Works

1. **Add Provider** - Configure connection to your hypervisor/cloud
2. **Discover** - Scan for running VMs/instances
3. **Auto-Import** - Create SSH/RDP connections automatically
4. **Credential Matching** - Auto-assign credentials based on OS type

### Credential Auto-Assignment

Configure credentials to automatically apply to discovered hosts:

```
Credential: "Linux Root"
├── Auto-assign OS Types: [linux, unix]
└── Auto-assign Patterns: [web-*, *-prod-*]
```

When importing a Linux host named `web-server-01`, it automatically gets assigned this credential.

---

## ⚡ Bulk Actions

Execute commands across multiple hosts simultaneously.

### Host Selection

| Method | Description | Example |
|--------|-------------|---------|
| 🌐 All | All connections | - |
| 📁 Group | By group | "Production" |
| 🔍 Pattern | Hostname wildcard | `web-*`, `192.168.1.*` |
| ✅ Selection | Manual pick | Select checkboxes |
| 💻 OS Type | By operating system | "Linux only" |

### Command Modes

#### 1. Inline Command
Quick one-liner execution:
```bash
uptime && df -h
```

#### 2. Saved Commands
Create reusable commands:
- **Name:** Check Disk Space
- **Category:** Monitoring
- **Target OS:** Linux
- **Command:** `df -h | head -20`

#### 3. Script Execution
Run multi-line scripts:
```bash
#!/bin/bash
echo "=== System Info ==="
hostname
uptime
free -h
df -h /
```

### Execution Features

- ⚡ **Parallel Execution** - Up to 10 concurrent connections
- 📊 **Real-time Progress** - Live status updates per host
- 🛑 **Cancellation** - Stop execution at any time
- 📜 **History** - View past executions and results
- 💾 **Save Results** - Export execution output

### Protocol Support

| OS | Protocol | Notes |
|----|----------|-------|
| Linux/Unix | SSH | Uses `ssh2` library |
| Windows | WinRM | PowerShell Remoting |
| ESXi | SSH | Direct shell access |

---

## 🎨 Themes

Customize the desktop app appearance with 8 built-in themes.

### Available Themes

| Theme | Preview Colors |
|-------|---------------|
| 🌙 **Midnight** | Dark blue, red accents |
| ☀️ **Light** | Clean white, blue accents |
| 🧛 **Dracula** | Purple, pink accents |
| 🏔️ **Nord** | Arctic blues, frost |
| 🌅 **Solarized** | Warm yellows, teals |
| 🎨 **Monokai** | Dark with vibrant colors |
| 🐙 **GitHub Dark** | GitHub's dark mode |
| 🔲 **High Contrast** | Maximum visibility |

### Theme Selection

Click the dropdown in the sidebar header to switch themes. Your preference is saved automatically.

---

## 🔑 Credential Management

Secure storage and organization of authentication credentials.

### Credential Types

| Type | Use Case | Fields |
|------|----------|--------|
| 🔐 Password | Basic auth | Username, Password |
| 🔑 Private Key | SSH key auth | Username, Key, Passphrase |
| 🏢 Domain | Windows AD | Domain, Username, Password |
| 🔗 Agent | SSH agent | Username only |

### Auto-Assignment Rules

Configure credentials to automatically match connections:

**By OS Type:**
- Linux/Unix servers → Linux Root credential
- Windows servers → Domain Admin credential

**By Pattern:**
- `web-*` → Web Server credential
- `db-*` → Database credential
- `192.168.1.*` → Internal Network credential

### Security

- 🔒 AES-256-GCM encryption at rest
- 🙈 Secrets never displayed in UI
- 🔐 Per-installation master key

---

## 📥 Import/Export

Exchange connection data with other tools.

### Import Formats

| Format | Source |
|--------|--------|
| 📄 JSON | Connectty export, custom |
| 📊 CSV | Spreadsheets, databases |
| 🔧 SSH Config | `~/.ssh/config` |
| 🐿️ PuTTY | Windows registry export |

### Export Options

- **Include Credentials:** Export with or without secrets
- **Format:** JSON or CSV
- **Encryption:** Optional password protection

### Sync with Server

Push/pull data between desktop and server:

```
Desktop ──push──> Server ──pull──> Other Devices
```

---

## 🗂️ Groups

Organize connections into hierarchical groups.

### Features

- 📁 Nested groups (parent/child)
- 🎨 Custom colors
- 📝 Descriptions
- 🔍 Filter by group in bulk actions

### Example Structure

```
📁 Production
├── 📁 Web Servers
│   ├── web-01
│   └── web-02
├── 📁 Database
│   └── db-01
└── 📁 Load Balancers
    └── lb-01

📁 Development
└── 📁 Dev Servers
    ├── dev-01
    └── dev-02
```

---

## 🖥️ Terminal Features

Full-featured SSH terminal in the desktop app.

### Capabilities

| Feature | Support |
|---------|---------|
| 🎨 256 colors | ✅ |
| 📐 Auto-resize | ✅ |
| 📋 Copy/paste | ✅ |
| 🔤 Unicode | ✅ |
| ⌨️ Special keys | ✅ |
| 🖱️ Mouse support | ✅ |

### Keyboard Shortcuts

| Action | Shortcut |
|--------|----------|
| Copy | `Ctrl+Shift+C` |
| Paste | `Ctrl+Shift+V` |
| New Tab | `Ctrl+T` |
| Close Tab | `Ctrl+W` |
| Next Tab | `Ctrl+Tab` |
| Previous Tab | `Ctrl+Shift+Tab` |

### Multiple Sessions

- Open multiple SSH sessions in tabs
- Quick switching between connections
- Visual connection status indicators
