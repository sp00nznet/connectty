# Connectty Server

Multi-user SSH/RDP connection management server with Active Directory authentication, resource sharing, and comprehensive session logging.

## Features

### Authentication
- **Local Authentication**: Username/password with bcrypt hashing
- **Active Directory (LDAP)**: Authenticate users against your AD domain
- **JWT Tokens**: Stateless authentication with configurable expiry
- **Admin Accounts**: Special non-AD admin accounts for system administration

### Multi-User Support
- Full multi-tenant architecture with per-user data isolation
- Share credentials, connections, providers, and saved commands between users
- Role-based access control (admin/user)

### Resource Management
- **Connections**: SSH, RDP, and Serial port connections
- **Credentials**: Encrypted password and SSH key storage
- **Providers**: Cloud provider integration (AWS, Azure, GCP, ESXi, Proxmox, BigFix)
- **Saved Commands**: Reusable command templates for bulk execution
- **Connection Groups**: Hierarchical organization of connections

### Sharing Functionality
Mark any resource as shared to make it accessible to all users on the server:
- Shared connections
- Shared credentials
- Shared providers
- Shared saved commands

### Session Logging
Optionally log all SSH and PTY terminal sessions:
- Input logging (commands entered by users)
- Output logging (command responses)
- Session tracking with timestamps
- Admin dashboard for reviewing logs
- Automatic cleanup of old logs

### Admin Dashboard
Comprehensive administration interface:
- View system statistics (users, connections, sessions, etc.)
- User management (create, delete, promote/demote admins)
- View all resources across all users
- Session log viewing and management
- Inventory management

## API Endpoints

### Authentication
```
POST   /api/auth/login       - Login with username/password
POST   /api/auth/register    - Register new user
GET    /api/auth/verify      - Verify JWT token
```

### Connections
```
GET    /api/connections?includeShared=true    - List connections (optionally including shared)
GET    /api/connections/:id                    - Get single connection
POST   /api/connections                        - Create connection
PUT    /api/connections/:id                    - Update connection
DELETE /api/connections/:id                    - Delete connection
```

### Credentials
```
GET    /api/credentials?includeShared=true    - List credentials (optionally including shared)
GET    /api/credentials/:id                    - Get single credential
POST   /api/credentials                        - Create credential
PUT    /api/credentials/:id                    - Update credential
DELETE /api/credentials/:id                    - Delete credential
```

### Providers
```
GET    /api/providers?includeShared=true      - List providers (optionally including shared)
GET    /api/providers/:id                      - Get single provider
POST   /api/providers                          - Create provider
PUT    /api/providers/:id                      - Update provider
DELETE /api/providers/:id                      - Delete provider
POST   /api/providers/:id/discover             - Discover hosts
GET    /api/providers/:id/hosts                - Get discovered hosts
POST   /api/providers/:id/hosts/import         - Import discovered hosts
```

### Saved Commands
```
GET    /api/commands/saved?includeShared=true - List saved commands (optionally including shared)
GET    /api/commands/saved/:id                 - Get single command
POST   /api/commands/saved                     - Create command
PUT    /api/commands/saved/:id                 - Update command
DELETE /api/commands/saved/:id                 - Delete command
POST   /api/commands/execute                   - Execute command
GET    /api/commands/executions                - List executions
GET    /api/commands/executions/:id            - Get execution details
```

### Sharing (Authenticated Users)
```
POST   /api/sharing/:type/:id/share           - Toggle sharing for a resource
GET    /api/sharing/connections               - Get all shared connections
GET    /api/sharing/credentials               - Get all shared credentials
GET    /api/sharing/providers                 - Get all shared providers
GET    /api/sharing/commands                  - Get all shared commands
```

### Admin (Admin Users Only)
```
GET    /api/admin/stats                       - System statistics
GET    /api/admin/users                       - List all users
POST   /api/admin/users                       - Create admin user
PUT    /api/admin/users/:id/admin             - Update admin status
DELETE /api/admin/users/:id                   - Delete user
GET    /api/admin/connections                 - List all connections
GET    /api/admin/credentials                 - List all credentials
GET    /api/admin/providers                   - List all providers
GET    /api/admin/logs                        - Get session logs
DELETE /api/admin/logs                        - Delete old logs
```

## Configuration

### Environment Variables

Create a `.env` file based on `.env.example`:

```bash
# Server
PORT=3000
HOST=0.0.0.0

# Database (PostgreSQL required)
DB_HOST=localhost
DB_PORT=5432
DB_NAME=connectty
DB_USER=connectty
DB_PASSWORD=connectty

# JWT Authentication
JWT_SECRET=change-this-in-production
JWT_EXPIRY=24h

# Encryption (optional - auto-generated if not set)
MASTER_KEY=your-secure-master-key

# CORS
CORS_ORIGIN=*

# Active Directory (optional)
AD_ENABLED=false
AD_URL=ldap://ad-server:389
AD_BASE_DN=DC=corp,DC=example,DC=com
AD_DOMAIN=corp.example.com

# Session Logging (optional)
SESSION_LOGGING_ENABLED=false
```

## Setup

### 1. Install Dependencies
```bash
npm install
```

### 2. Setup PostgreSQL Database
```bash
createdb connectty
createuser connectty
psql -c "ALTER USER connectty PASSWORD 'connectty';"
psql -c "GRANT ALL PRIVILEGES ON DATABASE connectty TO connectty;"
```

### 3. Configure Environment
```bash
cp .env.example .env
# Edit .env with your settings
```

### 4. Build
```bash
npm run build
```

### 5. Run
```bash
npm start
```

## Creating Admin Users

### Method 1: Via API (After Initial User Registration)
1. Register a normal user via `/api/auth/register`
2. Manually update the database:
   ```sql
   UPDATE users SET is_admin = true WHERE username = 'your-username';
   ```

### Method 2: Via Admin API (If you already have an admin)
```bash
curl -X POST http://localhost:3000/api/admin/users \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "username": "admin",
    "password": "secure-password",
    "displayName": "Administrator",
    "email": "admin@example.com",
    "isAdmin": true
  }'
```

## Database Schema

### Core Tables
- `users` - User accounts (local and AD)
- `connections` - SSH/RDP/Serial connections
- `credentials` - Encrypted credentials
- `connection_groups` - Hierarchical groups
- `providers` - Cloud/hypervisor providers
- `discovered_hosts` - Auto-discovered hosts
- `saved_commands` - Command templates
- `command_executions` - Command execution history
- `command_results` - Per-host command results
- `session_logs` - Terminal session logs

### Sharing Fields
All shareable resources have:
- `is_shared` (BOOLEAN) - Whether resource is shared
- `user_id` (UUID) - Owner of the resource

## Security Features

### Encryption
- **Credentials**: AES-256-GCM encryption with PBKDF2 key derivation
- **Provider Configs**: Same encryption for cloud API credentials
- **Passwords**: bcrypt hashing with 12 rounds
- **Master Key**: Environment variable or auto-generated on first run

### Access Control
- JWT-based stateless authentication
- Per-user data isolation in database
- Shared resources accessible to all authenticated users
- Admin-only endpoints protected by middleware
- Owner-only modification for owned resources

### Session Logging
- Optional logging (disabled by default)
- Input and output captured separately
- Encrypted storage in database
- Admin-only access to logs
- Retention policy configurable

## WebSocket API

Connect to `ws://localhost:3000/ws` with JWT token:

### SSH Sessions
```json
{
  "type": "ssh",
  "action": "connect",
  "connectionId": "connection-uuid"
}

{
  "type": "ssh",
  "action": "write",
  "sessionId": "session-uuid",
  "data": "command\n"
}

{
  "type": "ssh",
  "action": "resize",
  "sessionId": "session-uuid",
  "cols": 80,
  "rows": 24
}
```

### PTY (Local Terminal) Sessions
```json
{
  "type": "pty",
  "action": "connect"
}

{
  "type": "pty",
  "action": "write",
  "sessionId": "session-uuid",
  "data": "command\n"
}
```

## License

MIT
