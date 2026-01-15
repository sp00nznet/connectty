# Connectty

<div align="center">

**The Modern Connection Manager for DevOps & SysAdmins**

[![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20Linux%20%7C%20macOS%20%7C%20Web-0078D4?style=for-the-badge)](../../releases)
[![License](https://img.shields.io/badge/license-MIT-00C853?style=for-the-badge)](LICENSE)
[![Node](https://img.shields.io/badge/node-≥18-339933?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org)

[Features](#-features) • [Comparison](#-comparison-with-other-clients) • [Quick Start](#-quick-start) • [Documentation](#-documentation)

</div>

---

## Why Connectty?

Managing dozens (or hundreds) of servers shouldn't mean juggling SSH configs, RDP files, and spreadsheets. Connectty brings everything together in one powerful interface with cloud provider integration, bulk command execution, and secure credential management.

**Key Differentiators:**
- **Cloud-native discovery** - Auto-import servers from VMware, Proxmox, AWS, Azure, GCP, BigFix
- **Bulk command execution** - Run commands across hundreds of servers simultaneously
- **Unified interface** - SSH, RDP, Serial, SFTP, and local shells in tabbed sessions
- **Free & open source** - No subscriptions, no seat licenses, no feature gates

---

## Comparison with Other Clients

### Feature Matrix

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

### Detailed Comparison

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

## Features

### Connection Types

| Type | Description | Features |
|:-----|:------------|:---------|
| **SSH** | Full terminal emulation | 256-color, mouse support, agent forwarding, key auth |
| **RDP** | Remote Desktop Protocol | Embedded canvas sessions + native client fallback |
| **Serial** | COM/TTY ports | Baud 300-921600, all parity/flow options |
| **SFTP** | File transfer | Dual-pane browser, drag-drop, chmod, FXP |
| **Local Shell** | Native terminals | cmd, PowerShell, bash, zsh, fish, WSL distros |

### Cloud Provider Integration

Auto-discover and import servers from your infrastructure:

| Provider | Discovery Features |
|:---------|:-------------------|
| **VMware vSphere** | VMs from vCenter/ESXi, VMware Tools IP resolution, tags |
| **Proxmox VE** | QEMU VMs + LXC containers, guest agent IP, live status |
| **AWS EC2** | Multi-region, public/private IPs, instance tags |
| **Google Cloud** | Compute Engine, zones, labels, service account auth |
| **Microsoft Azure** | VMs, resource groups, service principal auth |
| **IBM BigFix** | Managed endpoints, AD auth, online/offline status |

### Bulk Command Execution

Run commands across your entire fleet:

```
┌─────────────────────────────────────────────────────────────────┐
│  Repeated Actions                                                │
├─────────────────────────────────────────────────────────────────┤
│  Target: [Group: Production ▼]    Protocol: [SSH ▼]             │
│                                                                  │
│  ┌─ Saved Commands ─┬─ Scripts ─┐                               │
│  │ • Check Disk Space           │                               │
│  │ • Restart Service            │                               │
│  │ • Update Packages            │                               │
│  └──────────────────────────────┘                               │
│                                                                  │
│  Command: df -h | grep -E '^/dev'                               │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │ web-01    ████████████████████ 100%  ✓  0.8s               ││
│  │ web-02    ████████████████████ 100%  ✓  0.9s               ││
│  │ db-01     ████████████████░░░░  80%     running...         ││
│  │ db-02     ░░░░░░░░░░░░░░░░░░░░   0%     pending            ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                    [Execute All] │
└─────────────────────────────────────────────────────────────────┘
```

**Features:**
- **Parallel execution** across up to 10 hosts simultaneously
- **Target by group, pattern, or manual selection**
- **Saved commands** with categories and variables
- **Multi-line scripts** (Bash, PowerShell, Python)
- **Real-time output** streaming per host
- **Full history** with stdout/stderr capture

### Credential Management

Secure, organized credential storage:

| Feature | Description |
|:--------|:------------|
| **Encryption** | AES-256-GCM with per-installation master key |
| **Types** | Password, SSH private key, SSH agent, domain creds |
| **Auto-assign** | Assign by OS type (Linux/Windows) or hostname pattern (`web-*`) |
| **Organization** | Tags, descriptions, usage tracking |

### Session Management

Modern tabbed interface for all connection types:

- **Multiple tabs** - SSH, RDP, Serial, SFTP, local shells
- **Tab actions** - Rename, duplicate, reorder, close
- **Terminal features** - 256-color, true color, Unicode, mouse support
- **Keyboard shortcuts** - `Ctrl+T` new tab, `Ctrl+W` close, `Ctrl+Tab` switch

### Themes

18 built-in themes for terminal and UI:

| Light | Dark | Popular |
|:------|:-----|:--------|
| Light | Midnight (default) | Dracula |
| Solarized Light | Solarized Dark | Nord |
| GitHub Light | GitHub Dark | Tokyo Night |
| | One Dark | Catppuccin Mocha |
| | Monokai | Gruvbox Dark |
| | Ayu Dark | Everforest |
| | Material Dark | Rosé Pine |
| | High Contrast | |

### System Tray

Background operation with full tray integration:

- **Minimize to tray** - Keep running while hidden
- **Close to tray** - X button hides instead of quitting
- **Start minimized** - Launch directly to tray
- **Quick connect** - Access recent connections from tray menu

### Import & Export

Migrate from other tools or backup your data:

| Format | Import | Export | Notes |
|:-------|:------:|:------:|:------|
| **JSON** | Yes | Yes | Full data including credentials (encrypted) |
| **CSV** | Yes | Yes | Connections only, spreadsheet compatible |
| **SSH Config** | Yes | - | `~/.ssh/config` format |
| **PuTTY Sessions** | Yes | - | Registry export as JSON |

---

## Quick Start

### Desktop App

```bash
# Clone and install
git clone https://github.com/your-org/connectty.git
cd connectty
npm install

# Build shared package first
npm run build -w @connectty/shared

# Run desktop app
npm run start -w @connectty/desktop
```

### Docker (Server + Web)

```bash
# Configure environment
cp .env.example .env
nano .env  # Set JWT_SECRET and DB_PASSWORD

# Launch
docker-compose up -d

# Access at http://localhost:8080
```

---

## Installation

### Pre-built Binaries

Download from [Releases](../../releases):

| Platform | Package | Notes |
|:---------|:--------|:------|
| **Windows** | `Connectty-Setup-x.x.x.exe` | Installer with auto-updates |
| **Debian/Ubuntu** | `connectty_x.x.x_amd64.deb` | `sudo dpkg -i connectty.deb` |
| **Other Linux** | `connectty-x.x.x.AppImage` | Portable, no install needed |
| **macOS** | `Connectty-x.x.x.dmg` | Universal binary (Intel + Apple Silicon) |

### Build from Source

```bash
# Windows installer
npm run dist:win -w @connectty/desktop

# Linux packages (deb, AppImage, rpm)
npm run dist:linux -w @connectty/desktop

# macOS (dmg)
npm run dist:mac -w @connectty/desktop
```

---

## Architecture

```
connectty/
├── packages/
│   ├── shared/          # TypeScript types & utilities
│   ├── desktop/         # Electron app (Windows/Linux/macOS)
│   │   ├── main/        # Node.js backend (SSH, RDP, Serial, DB)
│   │   └── renderer/    # React frontend
│   ├── server/          # Node.js API server
│   └── web/             # React web client
├── docs/                # Documentation
│   ├── FEATURES.md      # Detailed feature guide
│   ├── PROVIDERS.md     # Cloud provider setup
│   ├── CONFIGURATION.md # Environment & settings
│   └── API.md           # REST API reference
└── docker-compose.yml   # Production deployment
```

---

## Security

| Feature | Implementation |
|:--------|:---------------|
| **Credential Encryption** | AES-256-GCM with per-installation key |
| **Key Storage** | Private keys stored encrypted, never in plaintext |
| **SSH Security** | Key auth, agent forwarding, keyboard-interactive |
| **Command Execution** | Input validation, encoded PowerShell (injection-safe) |
| **Provider Auth** | API tokens, service accounts (no password storage) |
| **Transport** | TLS for all API communications |
| **Local Storage** | SQLite with encrypted secrets column |

---

## Documentation

| Document | Description |
|:---------|:------------|
| [Features Guide](docs/FEATURES.md) | Connection types, bulk actions, terminal |
| [Provider Setup](docs/PROVIDERS.md) | Cloud provider configuration |
| [Configuration](docs/CONFIGURATION.md) | Environment variables, Docker, AD |
| [API Reference](docs/API.md) | REST endpoints, WebSocket events |

---

## Development

```bash
# Install dependencies
npm install

# Development mode (hot reload)
npm run dev

# Run tests
npm test

# Type checking
npm run typecheck
```

### Workspace Commands

| Command | Description |
|:--------|:------------|
| `npm run dev:desktop` | Desktop app with hot reload |
| `npm run dev:server` | API server with nodemon |
| `npm run dev:web` | Web client with Vite |
| `npm run build` | Build all packages |

---

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing`
3. Make your changes with tests
4. Commit: `git commit -m 'Add amazing feature'`
5. Push: `git push origin feature/amazing`
6. Open a Pull Request

---

## License

MIT License - see [LICENSE](LICENSE) for details.

---

<div align="center">

**[Report Bug](../../issues) · [Request Feature](../../issues) · [Discussions](../../discussions)**

Built with Electron, React, and xterm.js

</div>
