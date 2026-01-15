# Features Guide

Comprehensive documentation for all Connectty features.

> **Platform Note:** Features below are for the **desktop app** (Windows, macOS, Linux). The web client provides SSH terminal access only.

---

## Comparison with Other Clients

### Full Feature Matrix

| Feature | Connectty | Termius | SecureCRT | PuTTY | MobaXterm | Xpipe |
|:--------|:---------:|:-------:|:---------:|:-----:|:---------:|:-----:|
| **Pricing** | Free | $10/mo+ | $119+ | Free | Free/$70 | Free |
| **Open Source** | Yes | No | No | Yes | No | Yes |
| **Cross-Platform** | Win/Linux/Mac/Web | All | Win/Mac | Win | Win | All |
| | | | | | | |
| **SSH Terminal** | Yes | Yes | Yes | Yes | Yes | Yes |
| **RDP Sessions** | Embedded + Native | No | No | No | Yes | No |
| **Serial/COM** | Yes | No | Yes | Yes | Yes | No |
| **SFTP Browser** | Dual-pane | Yes | Yes | No (PSFTP) | Yes | Yes |
| **Local Shells** | Yes (incl. WSL) | No | No | No | Yes | Yes |
| | | | | | | |
| **Cloud Discovery** | 6 providers | No | No | No | No | Limited |
| **VMware vSphere** | Yes | No | No | No | No | No |
| **Proxmox VE** | Yes | No | No | No | No | No |
| **AWS EC2** | Yes | No | No | No | No | Yes |
| **Azure VMs** | Yes | No | No | No | No | Yes |
| **GCP Compute** | Yes | No | No | No | No | Yes |
| **IBM BigFix** | Yes | No | No | No | No | No |
| | | | | | | |
| **Bulk Commands** | Yes | No | No | No | No | No |
| **Parallel Execution** | Yes | No | No | No | No | No |
| **Saved Scripts** | Yes | No | Yes | No | Yes | No |
| **Command Variables** | Yes | No | Yes | No | Yes | No |
| | | | | | | |
| **Credential Vault** | Encrypted | Encrypted | Yes | No | Yes | Yes |
| **Auto-Assign Creds** | Yes | No | No | No | No | No |
| **SSH Key Support** | Yes | Yes | Yes | Yes | Yes | Yes |
| **SSH Agent** | Yes | Yes | Yes | Yes | Yes | Yes |
| | | | | | | |
| **Connection Groups** | Nested | Folders | Folders | No | Folders | Yes |
| **Import/Export** | JSON/CSV/SSH Config | Proprietary | Proprietary | Registry | Proprietary | Yes |
| **System Tray** | Yes | Yes | Yes | No | Yes | Yes |
| **Themes** | 18 | 8 | Limited | No | Limited | Yes |

### Detailed Comparisons

<details>
<summary><b>vs. Termius</b> — Popular cross-platform SSH client</summary>

| Aspect | Connectty | Termius |
|:-------|:----------|:--------|
| **Price** | Free forever | Free tier limited, $10/mo for teams |
| **Cloud Discovery** | 6 providers built-in | None |
| **Bulk Commands** | Yes, parallel execution | No |
| **RDP Support** | Embedded + native | No |
| **Serial Ports** | Full configuration | No |
| **Local Shells** | Windows, Linux, macOS, WSL | No |
| **Data Ownership** | Local SQLite, self-hosted | Cloud-synced to Termius servers |
| **Open Source** | Yes (MIT) | No |

**Bottom line:** Termius excels at mobile access and cloud sync. Connectty wins on server discovery, bulk operations, and protocol variety.

</details>

<details>
<summary><b>vs. SecureCRT</b> — Enterprise terminal emulator</summary>

| Aspect | Connectty | SecureCRT |
|:-------|:----------|:----------|
| **Price** | Free | $119 per seat |
| **Cloud Discovery** | 6 providers | None |
| **Bulk Commands** | GUI-based, parallel | Script-based |
| **RDP Support** | Embedded + native | No |
| **Scripting** | Saved commands/scripts | VBScript, Python, JScript |
| **Serial Config** | Full | Full |
| **Enterprise Features** | Self-hostable | Single-user focus |
| **Open Source** | Yes | No |

**Bottom line:** SecureCRT has deeper scripting capabilities. Connectty offers better cloud integration and is free.

</details>

<details>
<summary><b>vs. PuTTY</b> — Classic open-source SSH client</summary>

| Aspect | Connectty | PuTTY |
|:-------|:----------|:------|
| **Price** | Free | Free |
| **Interface** | Modern tabbed UI | Single window per session |
| **Cloud Discovery** | 6 providers | None |
| **Bulk Commands** | Yes | No |
| **Credential Storage** | Encrypted vault | Registry (unencrypted) |
| **SFTP** | Integrated dual-pane | Separate PSFTP tool |
| **Themes** | 18 themes | Manual color config |
| **Cross-Platform** | Yes | Windows-focused |

**Bottom line:** PuTTY is lightweight and reliable. Connectty modernizes the experience with tabs, themes, and infrastructure integration.

</details>

<details>
<summary><b>vs. MobaXterm</b> — Windows-focused terminal</summary>

| Aspect | Connectty | MobaXterm |
|:-------|:----------|:----------|
| **Price** | Free | Free (Home) / $70 (Pro) |
| **Platform** | Win/Linux/Mac/Web | Windows only |
| **Cloud Discovery** | 6 providers | None |
| **Bulk Commands** | Yes, with GUI | MultiExec (Pro only) |
| **X11 Forwarding** | No | Yes |
| **Built-in Tools** | Local shells | Unix tools, X server |
| **Open Source** | Yes | No |

**Bottom line:** MobaXterm packs more Unix tools for Windows. Connectty offers cross-platform support and cloud provider discovery.

</details>

<details>
<summary><b>vs. Xpipe</b> — Open-source connection hub</summary>

| Aspect | Connectty | Xpipe |
|:-------|:----------|:------|
| **Price** | Free | Free |
| **Cloud Discovery** | 6 providers | AWS, Azure, GCP |
| **VMware/Proxmox** | Yes | No |
| **Bulk Commands** | Full GUI with parallel exec | No |
| **RDP Support** | Embedded + native | No |
| **Serial Ports** | Yes | No |
| **Terminal** | Embedded xterm.js | Launches external terminal |
| **Open Source** | Yes | Yes |

**Bottom line:** Xpipe focuses on shell connections and file browsing. Connectty offers more protocols and bulk execution.

</details>

---

## Connection Types

### SSH Connections

Full-featured SSH terminal for Linux, Unix, macOS, and network devices.

**Authentication Methods:**

| Method | Description |
|:-------|:------------|
| **Password** | Username/password authentication |
| **Private Key** | RSA, ECDSA, Ed25519 keys (with optional passphrase) |
| **SSH Agent** | Forward keys from ssh-agent |
| **Keyboard-Interactive** | Multi-factor and challenge-response |

**Terminal Features:**

- xterm-256color with full color support
- Automatic terminal resize on window change
- Copy/paste with keyboard shortcuts
- Unicode and emoji support
- Mouse support for terminal applications (vim, htop, etc.)

---

### RDP Connections

Connect to Windows hosts via Remote Desktop Protocol with tabbed sessions.

**Connection Modes:**

| Mode | Description |
|:-----|:------------|
| **Embedded (Default)** | Canvas-based tabbed sessions using node-rdpjs-2 |
| **Native Fallback** | `mstsc.exe` (Windows) or `xfreerdp` (Linux) |

**Embedded RDP Features:**
- Full graphical desktop in tabbed interface
- Keyboard input with proper scan code mapping
- Mouse click, drag, and scroll wheel support
- Multi-monitor awareness
- Automatic bitmap decompression

**Native Client Features:**
- Domain authentication support
- Custom port configuration
- Network Level Authentication (NLA)
- Automatic credential passing

**When to Use Each:**

```
┌───────────────────────────────────────────────────────────────┐
│  Use Embedded When:          Use Native When:                 │
├───────────────────────────────────────────────────────────────┤
│  • Multi-session tabbed UI   • Maximum performance needed     │
│  • Quick switching needed    • Full clipboard support         │
│  • Unified interface         • Audio/video streaming          │
│  • node-rdpjs-2 installed    • Embedded unavailable           │
└───────────────────────────────────────────────────────────────┘
```

---

### Serial Connections

Connect to serial/COM port devices for console access to network equipment, embedded systems, and serial consoles.

**Supported Settings:**

| Setting | Available Options |
|:--------|:------------------|
| **Device** | Auto-detected COM/tty ports |
| **Baud Rate** | 300, 1200, 2400, 4800, 9600, 19200, 38400, 57600, 115200, 230400, 460800, 921600 |
| **Data Bits** | 5, 6, 7, 8 |
| **Stop Bits** | 1, 1.5, 2 |
| **Parity** | None, Odd, Even, Mark, Space |
| **Flow Control** | None, Hardware (RTS/CTS), Software (XON/XOFF) |

**Common Use Cases:**

```
┌─────────────────────────────────────────────────────────────┐
│  Network Switches    → 9600 baud, 8N1, no flow control     │
│  Cisco Routers       → 9600 baud, 8N1, no flow control     │
│  Embedded Linux      → 115200 baud, 8N1, no flow control   │
│  Arduino/ESP32       → 115200 baud, 8N1, no flow control   │
│  Legacy Equipment    → 2400-9600 baud, varies              │
└─────────────────────────────────────────────────────────────┘
```

---

### SFTP File Browser

Built-in secure file transfer with a dual-pane interface.

**Interface:**

```
┌─────────────────────────────┬─────────────────────────────┐
│  LOCAL                      │  REMOTE                     │
│  /home/user/Downloads       │  /var/www/html              │
├─────────────────────────────┼─────────────────────────────┤
│  📁 ..                      │  📁 ..                      │
│  📁 projects                │  📁 css                     │
│  📄 report.pdf      2.1 MB  │  📁 js                      │
│  📄 config.json     1.2 KB  │  📄 index.html      4.5 KB  │
│  📄 backup.tar.gz   50 MB   │  📄 app.js         12.3 KB  │
└─────────────────────────────┴─────────────────────────────┘
         [Upload →]              [← Download]
```

**Operations:**

| Action | Description |
|:-------|:------------|
| **Upload** | Transfer local files to remote server |
| **Download** | Transfer remote files to local machine |
| **Create Directory** | Make new folders on remote |
| **Delete** | Remove files or empty directories |
| **Rename** | Rename files or directories |
| **Chmod** | Change file permissions |

**Features:**
- Progress tracking for large transfers
- Automatic directory navigation
- Home directory shortcuts
- File size and permission display

---

## Cloud Provider Discovery

Automatically discover and import servers from hypervisors and cloud platforms.

### Supported Providers

| Provider | VM Types | OS Detection | IP Discovery |
|:---------|:---------|:-------------|:-------------|
| **VMware vSphere** | ESXi VMs | Guest tools | VMware Tools |
| **Proxmox VE** | QEMU, LXC | Config-based | QEMU Agent |
| **AWS EC2** | Instances | AMI metadata | Public/Private IP |
| **Google Cloud** | Compute Engine | Metadata | External/Internal |
| **Azure** | Virtual Machines | OS Disk | Public/Private |

### Smart Import Features

**Selective Import:**
- View all discovered hosts before importing
- Check/uncheck individual servers
- Select all or filter by state (running/stopped)

**Credential Assignment:**
- Assign a credential to all selected hosts during import
- Auto-detect credentials based on OS type
- Pattern matching (e.g., `web-*` servers get web credential)

**Duplicate Name Handling:**
When servers from different providers have the same name, Connectty automatically appends the provider name:

```
Before:                    After Import:
├── web-01 (AWS)          ├── web-01 (AWS)
└── web-01 (vCenter)      └── web-01 (vCenter)
                          └── web-01 (Proxmox)
```

**IP Resolution:**
Hostnames are automatically resolved to IP addresses during import for reliable connections, even when DNS is unavailable.

### Provider Management

**Per-Provider Actions:**
- **Discover** - Scan for new/changed VMs
- **Import Hosts** - Selective import with credential assignment
- **Remove Hosts** - Bulk delete all connections from a provider
- **Test Connection** - Verify provider API access

---

## Bulk Command Execution

Execute commands across multiple hosts simultaneously.

### Target Selection

| Method | Example | Description |
|:-------|:--------|:------------|
| **All Hosts** | - | Every connection |
| **By Group** | "Production" | All hosts in group |
| **By Pattern** | `web-*` | Wildcard hostname match |
| **By OS** | Linux | Filter by operating system |
| **Manual** | Select checkboxes | Pick individual hosts |

### Command Types

**1. Inline Command**
```bash
uptime && df -h
```

**2. Saved Command**
```yaml
Name: Check Disk Space
Category: Monitoring
Target OS: Linux
Command: df -h | grep -E '^/dev' | head -10
```

**3. Multi-line Script**
```bash
#!/bin/bash
echo "=== System Report ==="
echo "Hostname: $(hostname)"
echo "Uptime: $(uptime -p)"
echo "Memory:"
free -h
echo "Disk:"
df -h /
```

### Execution Engine

```
┌─────────────────────────────────────────────────────────────┐
│                    Command Execution                        │
├─────────────────────────────────────────────────────────────┤
│  Parallelism:     Up to 10 concurrent connections          │
│  Timeout:         Configurable per-command                 │
│  Protocols:       SSH (Linux/Unix), WinRM (Windows)        │
│  Output:          Real-time streaming per host             │
│  History:         Full execution log with results          │
└─────────────────────────────────────────────────────────────┘
```

**Progress Tracking:**
- Live status updates per host
- Success/failure indicators
- Execution time tracking
- Cancelable at any time

---

## Credential Management

Secure storage and intelligent assignment of authentication credentials.

### Credential Types

| Type | Fields | Use Case |
|:-----|:-------|:---------|
| **Password** | Username, Password | Basic authentication |
| **Private Key** | Username, Key file, Passphrase | SSH key authentication |
| **Domain** | Domain, Username, Password | Windows AD/LDAP |
| **SSH Agent** | Username only | Forward from ssh-agent |

### Auto-Assignment Rules

Configure credentials to automatically match connections:

**By OS Type:**
```yaml
Credential: "Linux Root"
Auto-assign OS Types: [linux, unix, esxi]
# → Automatically assigned to all Linux/Unix hosts
```

**By Hostname Pattern:**
```yaml
Credential: "Web Servers"
Auto-assign Patterns: ["web-*", "*-www-*"]
# → Assigned to web-01, prod-www-server, etc.
```

**Priority:**
1. Pattern match (most specific first)
2. OS type match
3. Manual assignment

### Security

| Feature | Implementation |
|:--------|:---------------|
| **Encryption** | AES-256-GCM |
| **Key Derivation** | Per-installation master key |
| **Display** | Secrets never shown in UI |
| **Storage** | Encrypted in SQLite database |

---

## Groups & Organization

Organize connections into hierarchical folders.

### Group Features

- **Nested Groups** - Unlimited depth
- **Custom Colors** - Visual organization
- **Descriptions** - Notes for each group
- **Bulk Actions** - Target entire groups

### Example Structure

```
📁 Production
│   ├── 📁 Web Tier
│   │   ├── web-01 (nginx)
│   │   ├── web-02 (nginx)
│   │   └── web-03 (nginx)
│   ├── 📁 Application Tier
│   │   ├── app-01 (nodejs)
│   │   └── app-02 (nodejs)
│   └── 📁 Database Tier
│       ├── db-primary (postgres)
│       └── db-replica (postgres)
│
📁 Staging
│   └── 📁 All-in-One
│       └── staging-01
│
📁 Network Equipment
    ├── core-switch-01 (serial)
    ├── core-switch-02 (serial)
    └── edge-router-01 (ssh)
```

---

## Terminal Features

Full-featured terminal emulator powered by xterm.js.

### Capabilities

| Feature | Status | Notes |
|:--------|:-------|:------|
| 256 Colors | Supported | Full palette |
| True Color | Supported | 24-bit RGB |
| Unicode | Supported | Including emoji |
| Mouse | Supported | Click, scroll, select |
| Bracketed Paste | Supported | Safe pasting |
| Auto-resize | Supported | Tracks window size |

### Keyboard Shortcuts

| Action | Windows/Linux |
|:-------|:--------------|
| Copy | `Ctrl+Shift+C` |
| Paste | `Ctrl+Shift+V` |
| New Tab | `Ctrl+T` |
| Close Tab | `Ctrl+W` |
| Next Tab | `Ctrl+Tab` |
| Previous Tab | `Ctrl+Shift+Tab` |
| Clear | `Ctrl+L` |
| Search | `Ctrl+Shift+F` |

### Tab Management

- Multiple simultaneous sessions
- Connection status indicator (connected/disconnected)
- Quick tab switching
- Reorder tabs by dragging
- Duplicate session to new tab

---

## Import & Export

Exchange data with other tools and backup your configuration.

### Import Sources

| Format | Source | Fields |
|:-------|:-------|:-------|
| **JSON** | Connectty export | Full data |
| **CSV** | Spreadsheets | Connections |
| **SSH Config** | `~/.ssh/config` | Host entries |
| **PuTTY** | Registry export | Sessions |

### Export Options

```yaml
Export Settings:
  Format: JSON | CSV
  Include:
    - Connections: yes
    - Credentials: yes/no (optional)
    - Groups: yes
    - Providers: yes
  Encryption: Optional password protection
```

### Server Sync

```
┌──────────────┐         ┌──────────────┐         ┌──────────────┐
│   Desktop    │ ──push──│    Server    │──pull── │   Desktop    │
│   Client A   │         │   Database   │         │   Client B   │
└──────────────┘         └──────────────┘         └──────────────┘
```

---

## System Tray

Desktop app can minimize to system tray for quick access.

### Settings

| Option | Description |
|:-------|:------------|
| **Minimize to Tray** | Minimize button sends to tray |
| **Close to Tray** | Close button sends to tray |
| **Start Minimized** | Launch hidden in tray |

### Tray Menu

- **Show Connectty** - Restore window
- **Quick Connect** - Recent connections
- **Quit** - Exit application
