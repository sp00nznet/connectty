# 🔌 Connectty

<p align="center">
  <strong>A powerful SSH & RDP connection manager for teams and individuals</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/platform-Windows%20%7C%20Linux%20%7C%20Web-blue" alt="Platform">
  <img src="https://img.shields.io/badge/license-MIT-green" alt="License">
  <img src="https://img.shields.io/badge/node-%3E%3D18-brightgreen" alt="Node">
</p>

---

## ✨ Features

<table>
<tr>
<td width="50%">

### 🖥️ Desktop App
- Native Windows & Linux clients
- Tabbed SSH terminal sessions
- RDP connection support
- Offline-first with local SQLite

</td>
<td width="50%">

### 🌐 Web Client
- Browser-based SSH terminal
- No installation required
- Works from any device
- Real-time collaboration ready

</td>
</tr>
<tr>
<td>

### ☁️ Provider Discovery
- VMware ESXi / vSphere
- Proxmox VE
- AWS EC2
- Google Cloud Platform
- Microsoft Azure

</td>
<td>

### ⚡ Bulk Actions
- Execute commands across hosts
- Pattern-based host selection
- Save & reuse commands
- SSH & WinRM support

</td>
</tr>
<tr>
<td>

### 🔐 Security
- AES-256 credential encryption
- Active Directory integration
- SSH key & agent support
- Domain authentication

</td>
<td>

### 🎨 Customization
- 8 built-in themes
- Connection groups
- Tags & filtering
- Import/Export support

</td>
</tr>
</table>

---

## 🚀 Quick Start

### Desktop App (Standalone)

```bash
# Install dependencies
npm install

# Build shared package
npm run build -w @connectty/shared

# Start desktop app
npm run start -w @connectty/desktop
```

### Server + Web (Docker)

```bash
# Clone and configure
cp .env.example .env
# Edit .env with your settings

# Start everything
docker-compose up -d

# Access at http://localhost:8080
```

---

## 📦 Installation

### Pre-built Binaries

Download from [Releases](../../releases):

| Platform | Download |
|----------|----------|
| 🪟 Windows | `Connectty-Setup-x.x.x.exe` |
| 🐧 Debian/Ubuntu | `connectty_x.x.x_amd64.deb` |
| 🐧 Other Linux | `connectty-x.x.x.AppImage` |

### Build from Source

```bash
# Windows installer
npm run dist:win -w @connectty/desktop

# Linux packages
npm run dist:linux -w @connectty/desktop
```

---

## 🏗️ Architecture

```
connectty/
├── 📁 packages/
│   ├── 📦 shared/      # Shared types & utilities
│   ├── 🖥️ desktop/     # Electron app (Win/Linux)
│   ├── 🌐 server/      # Node.js API server
│   └── 🔮 web/         # React web client
├── 📁 docs/            # Documentation
├── 🐳 docker-compose.yml
└── 📄 package.json
```

---

## 🎨 Themes

| Theme | Style |
|-------|-------|
| 🌙 Midnight | Dark blue (default) |
| ☀️ Light | Clean & bright |
| 🧛 Dracula | Purple & pink |
| 🏔️ Nord | Arctic blues |
| 🌅 Solarized | Warm & precise |
| 🎨 Monokai | Vibrant colors |
| 🐙 GitHub Dark | GitHub style |
| 🔲 High Contrast | Accessibility |

---

## 📚 Documentation

| Document | Description |
|----------|-------------|
| [⚙️ Configuration](docs/CONFIGURATION.md) | Environment variables, Docker, AD setup |
| [📡 API Reference](docs/API.md) | REST API endpoints & WebSocket |
| [✨ Features Guide](docs/FEATURES.md) | Detailed feature documentation |

---

## 🔒 Security

- 🔐 **Encryption**: AES-256-GCM for all credentials
- 🎫 **Authentication**: JWT tokens with configurable expiry
- 🏢 **Enterprise**: Active Directory / LDAP support
- 🔑 **SSH**: Private keys, agents, keyboard-interactive
- 🛡️ **Transport**: TLS for all API communications

> ⚠️ Always use strong `JWT_SECRET` and `DB_PASSWORD` in production!

---

## 🛠️ Development

```bash
# Install all dependencies
npm install

# Development mode (all packages)
npm run dev

# Run tests
npm test

# Type checking
npm run typecheck
```

### Package Scripts

| Script | Description |
|--------|-------------|
| `npm run dev:desktop` | Start desktop in dev mode |
| `npm run dev:server` | Start server in dev mode |
| `npm run dev:web` | Start web client in dev mode |
| `npm run build` | Build all packages |
| `npm run dist:win` | Create Windows installer |
| `npm run dist:linux` | Create Linux packages |

---

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing`)
5. Open a Pull Request

---

## 📄 License

MIT License - see [LICENSE](LICENSE) for details.

---

<p align="center">
  Made with ❤️ for sysadmins everywhere
</p>
