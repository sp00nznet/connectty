# Connectty

<div align="center">

**The Modern Connection Manager for DevOps & SysAdmins**

[![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20Linux%20%7C%20Web-0078D4?style=for-the-badge)](../../releases)
[![License](https://img.shields.io/badge/license-MIT-00C853?style=for-the-badge)](LICENSE)
[![Node](https://img.shields.io/badge/node-≥18-339933?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org)

[Features](#-features) • [Quick Start](#-quick-start) • [Documentation](#-documentation) • [Screenshots](#-screenshots)

</div>

---

## Why Connectty?

Managing dozens (or hundreds) of servers shouldn't mean juggling SSH configs, RDP files, and spreadsheets. Connectty brings everything together in one powerful interface with cloud provider integration, bulk command execution, and secure credential management.

---

## Features

<table>
<tr>
<td width="50%" valign="top">

### Connection Types

| Type | Description |
|:-----|:------------|
| **SSH** | Full terminal with xterm.js, 256 colors, tabs |
| **RDP** | Native client integration (mstsc/xfreerdp) |
| **Serial** | COM/TTY device support with full settings |
| **SFTP** | Built-in file browser with drag & drop |

</td>
<td width="50%" valign="top">

### Cloud Providers

| Provider | Features |
|:---------|:---------|
| **VMware vSphere** | ESXi, vCenter discovery |
| **Proxmox VE** | QEMU/LXC containers |
| **AWS EC2** | Multi-region support |
| **Google Cloud** | Compute Engine |
| **Microsoft Azure** | Virtual Machines |
| **IBM BigFix** | Endpoint management |

</td>
</tr>
</table>

### Core Capabilities

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  DISCOVER          CONNECT           MANAGE            AUTOMATE            │
├─────────────────────────────────────────────────────────────────────────────┤
│  • Auto-discover   • SSH terminals   • Credential      • Bulk commands     │
│    from providers  • RDP sessions      vault           • Parallel exec     │
│  • Smart import    • Serial consoles • Groups &        • Saved scripts     │
│  • OS detection    • SFTP browser      folders         • Command history   │
│  • IP resolution   • Tabbed UI       • Tags & search   • WinRM support     │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Smart Provider Import

When importing from cloud providers, Connectty automatically:

- **Resolves hostnames to IPs** for reliable connections
- **Detects duplicate names** across providers and labels them:
  ```
  web-server-01 (AWS)
  web-server-01 (vCenter)
  web-server-01 (Proxmox)
  ```
- **Assigns credentials** based on OS type or hostname patterns
- **Allows selective import** with checkbox selection

### Serial Connection Support

Full serial/COM port support for network equipment, embedded devices, and console servers:

| Setting | Options |
|:--------|:--------|
| **Baud Rate** | 300 - 921600 |
| **Data Bits** | 5, 6, 7, 8 |
| **Stop Bits** | 1, 1.5, 2 |
| **Parity** | None, Odd, Even, Mark, Space |
| **Flow Control** | None, Hardware (RTS/CTS), Software (XON/XOFF) |

### SFTP File Browser

Built-in file transfer with dual-pane interface:

- **Navigate** local and remote filesystems side-by-side
- **Transfer** files with progress tracking
- **Manage** remote files (rename, delete, chmod, mkdir)
- **Drag & drop** between local and remote

### Bulk Command Execution

Run commands across multiple hosts simultaneously:

```
┌──────────────────────────────────────────────────────────────┐
│  Target: [✓] All Linux   [ ] Windows   [ ] Group: Production │
│  ────────────────────────────────────────────────────────────│
│  Command: df -h | head -10                                   │
│  ────────────────────────────────────────────────────────────│
│  Progress:                                                   │
│    web-01 ████████████████████ 100% ✓                       │
│    web-02 ████████████████████ 100% ✓                       │
│    db-01  ████████████░░░░░░░░  60%                         │
│    db-02  ░░░░░░░░░░░░░░░░░░░░   0% pending                 │
└──────────────────────────────────────────────────────────────┘
```

---

## Quick Start

### Desktop App (Standalone)

```bash
# Clone and install
git clone https://github.com/your-org/connectty.git
cd connectty
npm install

# Build and run
npm run build -w @connectty/shared
npm run start -w @connectty/desktop
```

### Server + Web Client (Docker)

```bash
# Configure environment
cp .env.example .env
nano .env  # Set your secrets

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

### Build from Source

```bash
# Windows installer
npm run dist:win -w @connectty/desktop

# Linux packages (deb, AppImage, rpm)
npm run dist:linux -w @connectty/desktop
```

---

## Architecture

```
connectty/
├── packages/
│   ├── shared/          # TypeScript types & utilities
│   ├── desktop/         # Electron app (Windows/Linux)
│   │   ├── main/        # Node.js backend (SSH, Serial, DB)
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

## Themes

8 built-in themes for the terminal and UI:

| | | | |
|:---:|:---:|:---:|:---:|
| **Midnight** | **Light** | **Dracula** | **Nord** |
| Dark blue | Clean white | Purple/pink | Arctic blue |
| **Solarized** | **Monokai** | **GitHub Dark** | **High Contrast** |
| Warm yellow | Vibrant | GitHub style | Accessibility |

---

## Security

| Feature | Implementation |
|:--------|:---------------|
| **Credential Encryption** | AES-256-GCM with per-installation key |
| **Authentication** | JWT tokens, configurable expiry |
| **Enterprise SSO** | Active Directory / LDAP |
| **SSH Security** | Private keys, agent forwarding, keyboard-interactive |
| **Transport** | TLS for all API communications |

> **Important**: Always set strong `JWT_SECRET` and `DB_PASSWORD` values in production.

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

</div>
