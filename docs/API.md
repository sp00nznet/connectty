# 📡 API Reference

Connectty provides a RESTful API for managing connections, credentials, and groups.

## 🔐 Authentication

All API endpoints (except login/register) require a valid JWT token in the `Authorization` header:

```
Authorization: Bearer <your-jwt-token>
```

### Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/auth/login` | Login with username/password |
| `POST` | `/api/auth/register` | Register new user (local auth only) |
| `GET` | `/api/auth/verify` | Verify JWT token validity |

### Login Request

```json
POST /api/auth/login
{
  "username": "admin",
  "password": "your-password",
  "domain": "CORP"  // Optional, for AD authentication
}
```

### Login Response

```json
{
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "user": {
    "id": "uuid",
    "username": "admin",
    "email": "admin@example.com"
  }
}
```

---

## 🔌 Connections

Manage SSH and RDP connections.

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/connections` | List all connections |
| `GET` | `/api/connections/:id` | Get single connection |
| `POST` | `/api/connections` | Create connection |
| `PUT` | `/api/connections/:id` | Update connection |
| `DELETE` | `/api/connections/:id` | Delete connection |

### Connection Object

```json
{
  "id": "uuid",
  "name": "Production Server",
  "hostname": "192.168.1.100",
  "port": 22,
  "connectionType": "ssh",  // "ssh" | "rdp"
  "osType": "linux",        // "linux" | "windows" | "unix" | "esxi"
  "username": "root",
  "credentialId": "uuid",
  "group": "uuid",
  "tags": ["production", "web"],
  "description": "Main web server",
  "createdAt": "2024-01-15T10:30:00Z",
  "updatedAt": "2024-01-15T10:30:00Z"
}
```

---

## 🔑 Credentials

Manage authentication credentials.

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/credentials` | List credentials (secrets masked) |
| `GET` | `/api/credentials/:id` | Get single credential |
| `POST` | `/api/credentials` | Create credential |
| `PUT` | `/api/credentials/:id` | Update credential |
| `DELETE` | `/api/credentials/:id` | Delete credential |

### Credential Object

```json
{
  "id": "uuid",
  "name": "Linux Root",
  "type": "password",       // "password" | "privateKey" | "domain" | "agent"
  "username": "root",
  "domain": "CORP",         // For domain credentials
  "secret": "********",     // Masked in responses
  "autoAssignOSTypes": ["linux", "unix"],
  "autoAssignPatterns": ["web-*", "*-prod-*"],
  "createdAt": "2024-01-15T10:30:00Z",
  "updatedAt": "2024-01-15T10:30:00Z"
}
```

### Credential Types

| Type | Description | Required Fields |
|------|-------------|-----------------|
| `password` | Username/password auth | `username`, `secret` |
| `privateKey` | SSH private key auth | `username`, `privateKey`, `passphrase` (optional) |
| `domain` | Windows domain auth | `username`, `secret`, `domain` |
| `agent` | SSH agent forwarding | `username` |

---

## 📁 Groups

Organize connections into groups.

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/groups` | List all groups |
| `POST` | `/api/groups` | Create group |
| `PUT` | `/api/groups/:id` | Update group |
| `DELETE` | `/api/groups/:id` | Delete group |

### Group Object

```json
{
  "id": "uuid",
  "name": "Production",
  "description": "Production servers",
  "parentId": "uuid",       // For nested groups
  "color": "#e94560",
  "createdAt": "2024-01-15T10:30:00Z",
  "updatedAt": "2024-01-15T10:30:00Z"
}
```

---

## 🔄 Sync

Synchronize data between desktop client and server.

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/sync/push` | Push local data to server |
| `GET` | `/api/sync/pull` | Pull data from server |
| `GET` | `/api/sync/export` | Export data (JSON/CSV) |

### Push Request

```json
POST /api/sync/push
{
  "connections": [...],
  "credentials": [...],
  "groups": [...]
}
```

### Export Options

```
GET /api/sync/export?format=json&includeCredentials=false
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `format` | string | `json` or `csv` |
| `includeCredentials` | boolean | Include credentials in export |

---

## 🌐 WebSocket API

Connect to `/ws` for real-time SSH terminal sessions.

### Authentication

```json
{ "type": "auth", "token": "your-jwt-token" }
```

### Connect to SSH

```json
{ "type": "connect", "connectionId": "uuid" }
```

### Send Terminal Data

```json
{ "type": "data", "sessionId": "uuid", "data": "ls -la\n" }
```

### Resize Terminal

```json
{ "type": "resize", "sessionId": "uuid", "cols": 80, "rows": 24 }
```

### Disconnect

```json
{ "type": "disconnect", "sessionId": "uuid" }
```

### Events from Server

```json
// Data received
{ "type": "data", "sessionId": "uuid", "data": "output..." }

// Connection closed
{ "type": "close", "sessionId": "uuid", "code": 0 }

// Error occurred
{ "type": "error", "sessionId": "uuid", "message": "Connection refused" }
```

---

## ⚠️ Error Responses

All errors follow this format:

```json
{
  "error": "Error message",
  "code": "ERROR_CODE",
  "details": {}  // Optional additional info
}
```

### Common Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `UNAUTHORIZED` | 401 | Invalid or missing token |
| `FORBIDDEN` | 403 | Insufficient permissions |
| `NOT_FOUND` | 404 | Resource not found |
| `VALIDATION_ERROR` | 400 | Invalid request data |
| `INTERNAL_ERROR` | 500 | Server error |
