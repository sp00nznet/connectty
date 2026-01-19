# ⚙️ Configuration Guide

This guide covers all configuration options for Connectty server and desktop deployments.

## 📋 Environment Variables

### Server Configuration

Create a `.env` file in the root directory with these variables:

```env
# Database Configuration
DB_HOST=localhost
DB_PORT=5432
DB_NAME=connectty
DB_USER=connectty
DB_PASSWORD=your-secure-password

# Authentication
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
JWT_EXPIRY=24h

# Encryption
MASTER_KEY=optional-32-byte-hex-key

# Active Directory (Optional)
AD_ENABLED=false
AD_URL=ldap://your-ad-server:389
AD_BASE_DN=DC=corp,DC=example,DC=com
AD_DOMAIN=corp.example.com
```

### Variable Reference

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DB_HOST` | No | `localhost` | PostgreSQL server hostname |
| `DB_PORT` | No | `5432` | PostgreSQL server port |
| `DB_NAME` | No | `connectty` | Database name |
| `DB_USER` | No | `connectty` | Database username |
| `DB_PASSWORD` | **Yes** | - | Database password |
| `JWT_SECRET` | **Yes** | - | Secret key for JWT signing (min 32 chars) |
| `JWT_EXPIRY` | No | `24h` | Token expiration time |
| `MASTER_KEY` | No | Auto-generated | AES encryption key for credentials |
| `AD_ENABLED` | No | `false` | Enable Active Directory auth |
| `AD_URL` | If AD enabled | - | LDAP server URL |
| `AD_BASE_DN` | If AD enabled | - | LDAP base distinguished name |
| `AD_DOMAIN` | If AD enabled | - | AD domain name |

---

## 🐳 Docker Configuration

### docker-compose.yml

```yaml
version: '3.8'

services:
  server:
    build:
      context: .
      dockerfile: Dockerfile.server
    ports:
      - "3000:3000"
    environment:
      - DB_HOST=postgres
      - DB_PASSWORD=${DB_PASSWORD}
      - JWT_SECRET=${JWT_SECRET}
    depends_on:
      - postgres

  web:
    build:
      context: .
      dockerfile: Dockerfile.web
    ports:
      - "8080:80"

  postgres:
    image: postgres:16-alpine
    environment:
      - POSTGRES_USER=connectty
      - POSTGRES_PASSWORD=${DB_PASSWORD}
      - POSTGRES_DB=connectty
    volumes:
      - pgdata:/var/lib/postgresql/data

volumes:
  pgdata:
```

### Production Deployment

For production, use these additional settings:

```yaml
services:
  server:
    environment:
      - NODE_ENV=production
    restart: always

  web:
    restart: always
```

---

## 🔐 Active Directory Configuration

### Basic Setup

1. Enable AD authentication:
   ```env
   AD_ENABLED=true
   ```

2. Configure connection settings:
   ```env
   AD_URL=ldap://dc01.corp.example.com:389
   AD_BASE_DN=DC=corp,DC=example,DC=com
   AD_DOMAIN=corp.example.com
   ```

### LDAPS (Secure LDAP)

For secure LDAP connections:

```env
AD_URL=ldaps://dc01.corp.example.com:636
```

### Login Format

Users can authenticate with:
- `username` (uses AD_DOMAIN automatically)
- `DOMAIN\username`
- `username@domain.com`

---

## 🎨 Desktop Client Configuration

### Data Storage

The desktop client stores data in these locations:

| Platform | Location |
|----------|----------|
| Windows | `%APPDATA%\connectty\` |
| Linux | `~/.config/connectty/` |
| macOS | `~/Library/Application Support/connectty/` |

### Database

SQLite database: `connectty.db`

### Themes

The desktop app includes **100+ built-in themes** organized by category:

| Category | Examples |
|----------|----------|
| **Dark - Blues** | Midnight (default), Cobalt, Night Owl, Pacific |
| **Dark - Purples** | Dracula, Synthwave, Cyberpunk, Andromeda |
| **Dark - Greens** | Everforest, Matrix, Vue, Hacker |
| **Dark - Neutrals** | One Dark, GitHub Dark, VS Dark, Obsidian |
| **Dark - Warm** | Gruvbox, Solarized, Tomorrow Night, Coffee |
| **Dark - Pastels** | Catppuccin, Rose Pine, Kanagawa, Lavender |
| **Light - Clean** | Light, GitHub Light, VS Light, Xcode |
| **Light - Warm** | Solarized Light, Gruvbox Light, Paper, Sepia |
| **Light - Cool** | Catppuccin Latte, Rose Pine Dawn, Notion |
| **Neon** | Neon City, Miami, Arcade, Synthwave |
| **Retro** | Amber CRT, Commodore, Apple II, VT220 |
| **Accessibility** | High Contrast, High Contrast Light |

Theme selection is stored in `localStorage` and persists between sessions.

---

## ☁️ Cloud Provider Configuration

### VMware ESXi / vSphere

```json
{
  "type": "esxi",
  "host": "vcenter.local",
  "port": 443,
  "username": "administrator@vsphere.local",
  "password": "********",
  "ignoreCertErrors": true
}
```

### Proxmox VE

```json
{
  "type": "proxmox",
  "host": "proxmox.local",
  "port": 8006,
  "username": "root@pam",
  "password": "********",
  "realm": "pam",
  "ignoreCertErrors": true
}
```

### AWS

```json
{
  "type": "aws",
  "accessKeyId": "AKIAIOSFODNN7EXAMPLE",
  "secretAccessKey": "********",
  "region": "us-east-1"
}
```

**Required IAM Permissions:**
- `ec2:DescribeInstances`
- `ec2:DescribeRegions`

### Google Cloud Platform

```json
{
  "type": "gcp",
  "projectId": "my-project-123456",
  "serviceAccountKey": "{...}"
}
```

**Required Roles:**
- `roles/compute.viewer`

### Microsoft Azure

```json
{
  "type": "azure",
  "tenantId": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
  "clientId": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
  "clientSecret": "********",
  "subscriptionId": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
}
```

**Required Permissions:**
- `Microsoft.Compute/virtualMachines/read`
- `Microsoft.Network/networkInterfaces/read`

---

## 🔒 Security Best Practices

### Production Checklist

- [ ] Use strong, unique `JWT_SECRET` (minimum 32 characters)
- [ ] Use strong `DB_PASSWORD`
- [ ] Set `MASTER_KEY` explicitly for credential encryption
- [ ] Deploy behind HTTPS reverse proxy (nginx, Traefik, etc.)
- [ ] Restrict database access to server container only
- [ ] Enable firewall rules for SSH/RDP ports
- [ ] Regularly backup the database
- [ ] Use AD authentication for enterprise deployments

### Encryption Details

- **Credentials**: AES-256-GCM encryption
- **Database**: Sensitive fields encrypted at rest
- **Transport**: TLS 1.2+ for all API connections
- **Passwords**: Never logged or exposed in responses

### Reverse Proxy (nginx example)

```nginx
server {
    listen 443 ssl;
    server_name connectty.example.com;

    ssl_certificate /etc/ssl/certs/connectty.crt;
    ssl_certificate_key /etc/ssl/private/connectty.key;

    location / {
        proxy_pass http://localhost:8080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
    }

    location /api {
        proxy_pass http://localhost:3000;
    }

    location /ws {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```
