# Connectty

Connectty is a comprehensive SSH connection manager with desktop clients for Windows and Debian, an optional containerized server platform, and an HTML5 web client.

## Features

- **Desktop Clients**: Native Electron apps for Windows and Debian/Linux
- **Web Client**: HTML5 browser-based SSH terminal
- **Server Platform**: Containerized backend with PostgreSQL storage
- **Credential Management**: Securely store and share credentials across connections
- **Import/Export**: Support for JSON, CSV, SSH config, and PuTTY session import
- **Sync**: Push/pull data between desktop and server for backup
- **AD Authentication**: Optional Windows Active Directory authentication
- **Persistent Storage**: SQLite for desktop, PostgreSQL for server

## Architecture

```
connectty/
├── packages/
│   ├── shared/       # Shared types and utilities
│   ├── desktop/      # Electron desktop client (Windows/Debian)
│   ├── server/       # Node.js API server
│   └── web/          # React HTML5 web client
├── docker-compose.yml
└── package.json
```

## Quick Start

### Using Docker (Recommended for Server)

1. Clone the repository and navigate to it
2. Copy the environment template:
   ```bash
   cp .env.example .env
   ```
3. Edit `.env` with your configuration (especially `JWT_SECRET` and `DB_PASSWORD`)
4. Start the containers:
   ```bash
   docker-compose up -d
   ```
5. Access the web client at http://localhost:8080

### Desktop Client Development

1. Install dependencies:
   ```bash
   npm install
   ```

2. Build shared package:
   ```bash
   npm run build:shared
   ```

3. Start the desktop client in development mode:
   ```bash
   npm run start:desktop
   ```

### Building Desktop Clients

For Windows:
```bash
npm run dist:win -w @connectty/desktop
```

For Debian/Linux:
```bash
npm run dist:linux -w @connectty/desktop
```

### Server Development

1. Start a PostgreSQL database (or use Docker):
   ```bash
   docker run -d --name postgres -e POSTGRES_PASSWORD=connectty -e POSTGRES_USER=connectty -e POSTGRES_DB=connectty -p 5432:5432 postgres:16-alpine
   ```

2. Start the server in development mode:
   ```bash
   npm run dev:server
   ```

### Web Client Development

```bash
npm run dev:web
```

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `DB_HOST` | PostgreSQL host | localhost |
| `DB_PORT` | PostgreSQL port | 5432 |
| `DB_NAME` | Database name | connectty |
| `DB_USER` | Database user | connectty |
| `DB_PASSWORD` | Database password | connectty |
| `JWT_SECRET` | JWT signing secret | (required in production) |
| `JWT_EXPIRY` | JWT token expiry | 24h |
| `MASTER_KEY` | Credential encryption key | (auto-generated) |
| `AD_ENABLED` | Enable AD authentication | false |
| `AD_URL` | AD LDAP URL | - |
| `AD_BASE_DN` | AD base DN | - |
| `AD_DOMAIN` | AD domain | - |

### Active Directory Authentication

To enable AD authentication:

1. Set `AD_ENABLED=true`
2. Configure the AD connection settings:
   ```env
   AD_ENABLED=true
   AD_URL=ldap://your-ad-server:389
   AD_BASE_DN=DC=corp,DC=example,DC=com
   AD_DOMAIN=corp.example.com
   ```

Users can then log in using their AD credentials with the domain field.

## API Reference

### Authentication

- `POST /api/auth/login` - Login with username/password
- `POST /api/auth/register` - Register new user (local auth only)
- `GET /api/auth/verify` - Verify JWT token

### Connections

- `GET /api/connections` - List all connections
- `GET /api/connections/:id` - Get single connection
- `POST /api/connections` - Create connection
- `PUT /api/connections/:id` - Update connection
- `DELETE /api/connections/:id` - Delete connection

### Credentials

- `GET /api/credentials` - List credentials (secrets masked)
- `POST /api/credentials` - Create credential
- `PUT /api/credentials/:id` - Update credential
- `DELETE /api/credentials/:id` - Delete credential

### Groups

- `GET /api/groups` - List groups
- `POST /api/groups` - Create group
- `PUT /api/groups/:id` - Update group
- `DELETE /api/groups/:id` - Delete group

### Sync

- `POST /api/sync/push` - Push data to server
- `GET /api/sync/pull` - Pull data from server
- `GET /api/sync/export` - Export data (JSON or CSV)

### WebSocket

Connect to `/ws` for SSH terminal sessions:

```javascript
// Authenticate
{ type: 'auth', token: 'your-jwt-token' }

// Connect to SSH
{ type: 'connect', connectionId: 'uuid' }

// Send terminal data
{ type: 'data', sessionId: 'uuid', data: 'ls -la\n' }

// Resize terminal
{ type: 'resize', sessionId: 'uuid', cols: 80, rows: 24 }

// Disconnect
{ type: 'disconnect', sessionId: 'uuid' }
```

## Security Considerations

1. **JWT Secret**: Always use a strong, random JWT secret in production
2. **Database Password**: Change the default database password
3. **Master Key**: If not provided, a random key is generated per instance
4. **HTTPS**: Use a reverse proxy with SSL in production
5. **Credentials**: All sensitive data is encrypted at rest using AES-256-GCM

## License

MIT
