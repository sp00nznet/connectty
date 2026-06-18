use rusqlite::{Connection, Result as SqliteResult, params};
use crate::commands::connections::ServerConnection;
use crate::commands::credentials::Credential;
use crate::commands::groups::ConnectionGroup;

/// SQLite database service - compatible with existing connectty.db schema
pub struct DatabaseService {
    conn: Connection,
    master_key: String,
}

impl DatabaseService {
    pub fn new(db_path: &str) -> SqliteResult<Self> {
        let conn = Connection::open(db_path)?;

        // Enable WAL mode for better concurrent access
        conn.execute_batch("PRAGMA journal_mode=WAL;")?;

        // Create app_config table and get/create master key
        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS app_config (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );"
        )?;

        let master_key = Self::get_or_create_master_key(&conn)?;

        let mut service = Self { conn, master_key };
        service.initialize()?;
        Ok(service)
    }

    fn get_or_create_master_key(conn: &Connection) -> SqliteResult<String> {
        let mut stmt = conn.prepare("SELECT value FROM app_config WHERE key = ?1")?;
        let result: SqliteResult<String> = stmt.query_row(params!["master_key"], |row| row.get(0));

        match result {
            Ok(key) => Ok(key),
            Err(_) => {
                use base64::Engine;
                let mut key_bytes = [0u8; 32];
                getrandom::getrandom(&mut key_bytes).expect("Failed to generate random key");
                let key = base64::engine::general_purpose::STANDARD.encode(key_bytes);
                conn.execute(
                    "INSERT INTO app_config (key, value) VALUES (?1, ?2)",
                    params!["master_key", &key],
                )?;
                Ok(key)
            }
        }
    }

    fn initialize(&mut self) -> SqliteResult<()> {
        self.conn.execute_batch("
            CREATE TABLE IF NOT EXISTS connections (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                hostname TEXT NOT NULL,
                port INTEGER DEFAULT 22,
                connection_type TEXT DEFAULT 'ssh',
                os_type TEXT,
                username TEXT,
                credential_id TEXT,
                tags TEXT DEFAULT '[]',
                group_id TEXT,
                description TEXT,
                serial_settings TEXT,
                provider_id TEXT,
                provider_host_id TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                last_connected_at TEXT
            );

            CREATE TABLE IF NOT EXISTS credentials (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                type TEXT NOT NULL,
                username TEXT NOT NULL,
                domain TEXT,
                encrypted_data TEXT,
                auto_assign_patterns TEXT DEFAULT '[]',
                auto_assign_os_types TEXT DEFAULT '[]',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS connection_groups (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                description TEXT,
                parent_id TEXT,
                color TEXT,
                membership_type TEXT DEFAULT 'static',
                rules TEXT DEFAULT NULL,
                credential_id TEXT,
                assigned_scripts TEXT DEFAULT '[]',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS providers (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                type TEXT NOT NULL,
                enabled INTEGER DEFAULT 1,
                config TEXT NOT NULL,
                auto_discover INTEGER DEFAULT 0,
                discover_interval INTEGER,
                last_discovery_at TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS discovered_hosts (
                id TEXT PRIMARY KEY,
                provider_id TEXT NOT NULL,
                provider_host_id TEXT NOT NULL,
                name TEXT NOT NULL,
                hostname TEXT,
                private_ip TEXT,
                public_ip TEXT,
                os_type TEXT NOT NULL,
                os_name TEXT,
                state TEXT NOT NULL,
                metadata TEXT DEFAULT '{}',
                tags TEXT DEFAULT '{}',
                discovered_at TEXT NOT NULL,
                last_seen_at TEXT NOT NULL,
                imported INTEGER DEFAULT 0,
                connection_id TEXT,
                FOREIGN KEY (provider_id) REFERENCES providers(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS profiles (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                is_default INTEGER DEFAULT 0,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS session_states (
                id TEXT PRIMARY KEY,
                profile_id TEXT NOT NULL,
                name TEXT NOT NULL,
                description TEXT,
                sessions TEXT DEFAULT '[]',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS saved_commands (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                command TEXT NOT NULL,
                category TEXT,
                description TEXT,
                target_os TEXT DEFAULT 'all',
                command_type TEXT DEFAULT 'ssh',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
        ")?;
        Ok(())
    }

    // ---- Connection CRUD ----

    pub fn get_connections(&self) -> SqliteResult<Vec<ServerConnection>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, name, hostname, port, connection_type, os_type, username,
                    credential_id, tags, group_id, description, serial_settings
             FROM connections ORDER BY name"
        )?;

        let connections = stmt.query_map([], |row| {
            Ok(row_to_connection(row))
        })?;

        connections.collect::<SqliteResult<Vec<_>>>()
    }

    pub fn get_connection(&self, id: &str) -> SqliteResult<ServerConnection> {
        self.conn.query_row(
            "SELECT id, name, hostname, port, connection_type, os_type, username,
                    credential_id, tags, group_id, description, serial_settings
             FROM connections WHERE id = ?1",
            params![id],
            |row| Ok(row_to_connection(row)),
        )
    }

    pub fn create_connection(&self, conn: &ServerConnection) -> SqliteResult<ServerConnection> {
        let now = chrono_now();
        let id = uuid::Uuid::new_v4().to_string();
        let tags_str = conn.tags.as_ref().map(|t| serde_json::to_string(t).unwrap_or_default());
        let serial_str = conn.serial_settings.as_ref().map(|s| serde_json::to_string(s).unwrap_or_default());
        self.conn.execute(
            "INSERT INTO connections (id, name, hostname, port, connection_type, os_type,
             username, credential_id, tags, group_id, description, serial_settings, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)",
            params![
                id, conn.name, conn.hostname, conn.port, conn.connection_type,
                conn.os_type, conn.username, conn.credential_id, tags_str,
                conn.group, conn.description, serial_str, now, now
            ],
        )?;
        let mut result = conn.clone();
        result.id = id;
        Ok(result)
    }

    pub fn update_connection(&self, conn: &ServerConnection) -> SqliteResult<()> {
        let now = chrono_now();
        let tags_str = conn.tags.as_ref().map(|t| serde_json::to_string(t).unwrap_or_default());
        self.conn.execute(
            "UPDATE connections SET name=?2, hostname=?3, port=?4, connection_type=?5,
             os_type=?6, username=?7, credential_id=?8, tags=?9, group_id=?10,
             description=?11, updated_at=?12 WHERE id=?1",
            params![
                conn.id, conn.name, conn.hostname, conn.port, conn.connection_type,
                conn.os_type, conn.username, conn.credential_id, tags_str,
                conn.group, conn.description, now
            ],
        )?;
        Ok(())
    }

    pub fn delete_connection(&self, id: &str) -> SqliteResult<()> {
        self.conn.execute("DELETE FROM connections WHERE id = ?1", params![id])?;
        Ok(())
    }

    // ---- Credential CRUD ----

    pub fn get_credentials(&self) -> SqliteResult<Vec<Credential>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, name, type, username, domain, encrypted_data, auto_assign_patterns, auto_assign_os_types
             FROM credentials ORDER BY name"
        )?;
        let master_key = self.master_key.clone();
        let creds = stmt.query_map([], |row| {
            let id: String = row.get(0)?;
            let encrypted_data: Option<String> = row.get(5)?;
            let auto_patterns: Option<String> = row.get(6)?;
            let auto_group: Option<String> = row.get(7)?;

            // Decrypt sensitive fields
            let (secret, private_key, passphrase) = if let Some(enc_str) = encrypted_data {
                decrypt_sensitive_fields(&enc_str, &master_key)
            } else {
                (None, None, None)
            };

            // Get connections using this credential
            // (skipping for list performance - frontend doesn't need it immediately)

            Ok(Credential {
                id,
                name: row.get(1)?,
                credential_type: row.get(2)?,
                username: row.get::<_, Option<String>>(3)?.unwrap_or_default(),
                domain: row.get(4)?,
                secret,
                password: None,
                private_key,
                passphrase,
                auto_assign_patterns: auto_patterns.and_then(|s| serde_json::from_str(&s).ok()),
                auto_assign_group: auto_group,
                used_by: vec![],
            })
        })?;
        creds.collect()
    }

    pub fn get_credential(&self, id: &str) -> SqliteResult<Credential> {
        self.conn.query_row(
            "SELECT id, name, type, username, domain, encrypted_data, auto_assign_patterns, auto_assign_os_types
             FROM credentials WHERE id = ?1",
            params![id],
            |row| {
                let encrypted_data: Option<String> = row.get(5)?;
                let auto_patterns: Option<String> = row.get(6)?;
                let auto_group: Option<String> = row.get(7)?;

                let (secret, private_key, passphrase) = if let Some(enc_str) = encrypted_data {
                    decrypt_sensitive_fields(&enc_str, &self.master_key)
                } else {
                    (None, None, None)
                };

                Ok(Credential {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    credential_type: row.get(2)?,
                    username: row.get::<_, Option<String>>(3)?.unwrap_or_default(),
                    domain: row.get(4)?,
                    secret,
                    password: None,
                    private_key,
                    passphrase,
                    auto_assign_patterns: auto_patterns.and_then(|s| serde_json::from_str(&s).ok()),
                    auto_assign_group: auto_group,
                    used_by: vec![],
                })
            },
        )
    }

    pub fn create_credential(&self, cred: &Credential) -> SqliteResult<Credential> {
        let now = chrono_now();
        let id = uuid::Uuid::new_v4().to_string();

        // Encrypt sensitive data
        let encrypted_data = encrypt_sensitive_fields(cred, &self.master_key);
        let auto_patterns = cred.auto_assign_patterns.as_ref()
            .map(|p| serde_json::to_string(p).unwrap_or_else(|_| "[]".to_string()));

        self.conn.execute(
            "INSERT INTO credentials (id, name, type, username, domain, encrypted_data,
             auto_assign_patterns, auto_assign_os_types, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
            params![
                id, cred.name, cred.credential_type, cred.username, cred.domain,
                encrypted_data, auto_patterns, cred.auto_assign_group, now, now
            ],
        )?;
        let mut result = cred.clone();
        result.id = id.clone();
        // Clear sensitive fields from response
        result.secret = None;
        result.password = None;
        result.private_key = None;
        result.passphrase = None;
        Ok(result)
    }

    pub fn update_credential(&self, id: &str, updates: &serde_json::Value) -> SqliteResult<()> {
        let now = chrono_now();
        let mut sets = vec!["updated_at = ?1".to_string()];
        let mut values: Vec<Box<dyn rusqlite::types::ToSql>> = vec![Box::new(now)];
        let mut idx = 2;

        if let Some(v) = updates.get("name").and_then(|v| v.as_str()) {
            sets.push(format!("name = ?{}", idx)); values.push(Box::new(v.to_string())); idx += 1;
        }
        if let Some(v) = updates.get("type").and_then(|v| v.as_str()) {
            sets.push(format!("type = ?{}", idx)); values.push(Box::new(v.to_string())); idx += 1;
        }
        if let Some(v) = updates.get("username").and_then(|v| v.as_str()) {
            sets.push(format!("username = ?{}", idx)); values.push(Box::new(v.to_string())); idx += 1;
        }
        if let Some(v) = updates.get("domain") {
            sets.push(format!("domain = ?{}", idx));
            values.push(Box::new(v.as_str().map(|s| s.to_string()))); idx += 1;
        }

        // Handle sensitive data updates
        let has_secret = updates.get("secret").is_some() || updates.get("password").is_some();
        let has_key = updates.get("privateKey").is_some();
        let has_passphrase = updates.get("passphrase").is_some();

        if has_secret || has_key || has_passphrase {
            // Build sensitive data map from updates + existing
            let mut sensitive: serde_json::Map<String, serde_json::Value> = serde_json::Map::new();
            if let Some(v) = updates.get("secret").or(updates.get("password")).and_then(|v| v.as_str()) {
                sensitive.insert("secret".to_string(), serde_json::Value::String(v.to_string()));
            }
            if let Some(v) = updates.get("privateKey").and_then(|v| v.as_str()) {
                sensitive.insert("privateKey".to_string(), serde_json::Value::String(v.to_string()));
            }
            if let Some(v) = updates.get("passphrase").and_then(|v| v.as_str()) {
                sensitive.insert("passphrase".to_string(), serde_json::Value::String(v.to_string()));
            }

            if !sensitive.is_empty() {
                let plain = serde_json::to_string(&sensitive).unwrap();
                match crate::services::crypto::encrypt(&plain, &self.master_key) {
                    Ok(enc) => {
                        let enc_json = serde_json::to_string(&enc).unwrap();
                        sets.push(format!("encrypted_data = ?{}", idx));
                        values.push(Box::new(enc_json));
                        idx += 1;
                    }
                    Err(e) => log::error!("Encryption failed: {}", e),
                }
            }
        }

        let sql = format!("UPDATE credentials SET {} WHERE id = ?{}", sets.join(", "), idx);
        values.push(Box::new(id.to_string()));

        let params: Vec<&dyn rusqlite::types::ToSql> = values.iter().map(|v| v.as_ref()).collect();
        self.conn.execute(&sql, params.as_slice())?;
        Ok(())
    }

    pub fn delete_credential(&self, id: &str) -> SqliteResult<()> {
        // Clear credential reference from connections
        self.conn.execute("UPDATE connections SET credential_id = NULL WHERE credential_id = ?1", params![id])?;
        self.conn.execute("DELETE FROM credentials WHERE id = ?1", params![id])?;
        Ok(())
    }

    // ---- Group CRUD ----

    pub fn get_group(&self, id: &str) -> SqliteResult<ConnectionGroup> {
        self.conn.query_row(
            "SELECT id, name, color, description FROM connection_groups WHERE id = ?1",
            params![id],
            |row| Ok(ConnectionGroup {
                id: row.get(0)?, name: row.get(1)?, color: row.get(2)?, description: row.get(3)?,
            }),
        )
    }

    pub fn get_groups(&self) -> SqliteResult<Vec<ConnectionGroup>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, name, color, description FROM connection_groups ORDER BY name"
        )?;
        let groups = stmt.query_map([], |row| {
            Ok(ConnectionGroup {
                id: row.get(0)?,
                name: row.get(1)?,
                color: row.get(2)?,
                description: row.get(3)?,
            })
        })?;
        groups.collect()
    }

    pub fn create_group(&self, group: &ConnectionGroup) -> SqliteResult<ConnectionGroup> {
        let now = chrono_now();
        let id = uuid::Uuid::new_v4().to_string();
        self.conn.execute(
            "INSERT INTO connection_groups (id, name, color, description, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![id, group.name, group.color, group.description, now, now],
        )?;
        let mut result = group.clone();
        result.id = id;
        Ok(result)
    }

    pub fn update_group(&self, group: &ConnectionGroup) -> SqliteResult<()> {
        let now = chrono_now();
        self.conn.execute(
            "UPDATE connection_groups SET name=?2, color=?3, description=?4, updated_at=?5 WHERE id=?1",
            params![group.id, group.name, group.color, group.description, now],
        )?;
        Ok(())
    }

    pub fn delete_group(&self, id: &str) -> SqliteResult<()> {
        self.conn.execute("DELETE FROM connection_groups WHERE id = ?1", params![id])?;
        Ok(())
    }

    // ---- Saved Commands CRUD ----

    pub fn get_saved_commands(&self) -> SqliteResult<Vec<crate::commands::bulk_commands::SavedCommand>> {
        use crate::commands::bulk_commands::SavedCommand;
        let mut stmt = self.conn.prepare(
            "SELECT id, name, command, category, description, target_os, command_type FROM saved_commands ORDER BY name"
        )?;
        let cmds = stmt.query_map([], |row| {
            Ok(SavedCommand {
                id: row.get(0)?,
                name: row.get(1)?,
                command: row.get(2)?,
                category: row.get(3)?,
                description: row.get(4)?,
                target_os: row.get::<_, Option<String>>(5)?.unwrap_or_else(|| "all".to_string()),
                command_type: row.get::<_, Option<String>>(6)?.unwrap_or_else(|| "ssh".to_string()),
            })
        })?;
        cmds.collect()
    }

    pub fn create_saved_command(&self, cmd: &crate::commands::bulk_commands::SavedCommand) -> SqliteResult<crate::commands::bulk_commands::SavedCommand> {
        let now = chrono_now();
        let id = uuid::Uuid::new_v4().to_string();
        self.conn.execute(
            "INSERT INTO saved_commands (id, name, command, category, description, target_os, command_type, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
            params![id, cmd.name, cmd.command, cmd.category, cmd.description, cmd.target_os, cmd.command_type, now, now],
        )?;
        let mut result = cmd.clone();
        result.id = id;
        Ok(result)
    }

    pub fn update_saved_command(&self, id: &str, updates: &serde_json::Value) -> SqliteResult<()> {
        let now = chrono_now();
        let mut sets = vec!["updated_at = ?1".to_string()];
        let mut values: Vec<Box<dyn rusqlite::types::ToSql>> = vec![Box::new(now)];
        let mut idx = 2;

        for (key, col) in &[("name", "name"), ("command", "command"), ("category", "category"),
            ("description", "description"), ("targetOS", "target_os"), ("commandType", "command_type")] {
            if let Some(v) = updates.get(*key).and_then(|v| v.as_str()) {
                sets.push(format!("{} = ?{}", col, idx));
                values.push(Box::new(v.to_string()));
                idx += 1;
            }
        }

        let sql = format!("UPDATE saved_commands SET {} WHERE id = ?{}", sets.join(", "), idx);
        values.push(Box::new(id.to_string()));
        let params: Vec<&dyn rusqlite::types::ToSql> = values.iter().map(|v| v.as_ref()).collect();
        self.conn.execute(&sql, params.as_slice())?;
        Ok(())
    }

    pub fn delete_saved_command(&self, id: &str) -> SqliteResult<()> {
        self.conn.execute("DELETE FROM saved_commands WHERE id = ?1", params![id])?;
        Ok(())
    }

    // ---- Provider CRUD ----

    pub fn get_providers(&self) -> SqliteResult<Vec<crate::commands::providers::Provider>> {
        use crate::commands::providers::Provider;
        let mut stmt = self.conn.prepare(
            "SELECT id, name, type, enabled, config, auto_discover, discover_interval, last_discovery_at FROM providers ORDER BY name"
        )?;
        let provs = stmt.query_map([], |row| {
            let config_str: Option<String> = row.get(4)?;
            let config = config_str.and_then(|s| serde_json::from_str(&s).ok()).unwrap_or(serde_json::Value::Object(Default::default()));
            Ok(Provider {
                id: row.get(0)?, name: row.get(1)?, provider_type: row.get(2)?,
                enabled: row.get::<_, i32>(3)? != 0, config,
                auto_discover: row.get::<_, i32>(5).unwrap_or(0) != 0,
                discover_interval: row.get::<_, Option<u32>>(6)?,
                last_discovery_at: row.get(7)?,
            })
        })?;
        provs.collect()
    }

    pub fn get_provider(&self, id: &str) -> SqliteResult<crate::commands::providers::Provider> {
        use crate::commands::providers::Provider;
        self.conn.query_row(
            "SELECT id, name, type, enabled, config, auto_discover, discover_interval, last_discovery_at FROM providers WHERE id = ?1",
            params![id],
            |row| {
                let config_str: Option<String> = row.get(4)?;
                let config = config_str.and_then(|s| serde_json::from_str(&s).ok()).unwrap_or(serde_json::Value::Object(Default::default()));
                Ok(Provider {
                    id: row.get(0)?, name: row.get(1)?, provider_type: row.get(2)?,
                    enabled: row.get::<_, i32>(3)? != 0, config,
                    auto_discover: row.get::<_, i32>(5).unwrap_or(0) != 0,
                    discover_interval: row.get::<_, Option<u32>>(6)?,
                    last_discovery_at: row.get(7)?,
                })
            },
        )
    }

    pub fn create_provider(&self, prov: &crate::commands::providers::Provider) -> SqliteResult<crate::commands::providers::Provider> {
        let now = chrono_now();
        let id = uuid::Uuid::new_v4().to_string();
        let config_str = serde_json::to_string(&prov.config).unwrap_or_default();
        self.conn.execute(
            "INSERT INTO providers (id, name, type, enabled, config, auto_discover, discover_interval, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
            params![id, prov.name, prov.provider_type, prov.enabled as i32, config_str,
                    prov.auto_discover as i32, prov.discover_interval, now, now],
        )?;
        let mut result = prov.clone();
        result.id = id;
        Ok(result)
    }

    pub fn update_provider(&self, id: &str, updates: &serde_json::Value) -> SqliteResult<()> {
        let now = chrono_now();
        let mut prov = self.get_provider(id)?;
        if let Some(v) = updates.get("name").and_then(|v| v.as_str()) { prov.name = v.to_string(); }
        if let Some(v) = updates.get("type").and_then(|v| v.as_str()) { prov.provider_type = v.to_string(); }
        if let Some(v) = updates.get("enabled").and_then(|v| v.as_bool()) { prov.enabled = v; }
        if let Some(v) = updates.get("config") { prov.config = v.clone(); }
        if let Some(v) = updates.get("autoDiscover").and_then(|v| v.as_bool()) { prov.auto_discover = v; }
        if let Some(v) = updates.get("discoverInterval").and_then(|v| v.as_u64()) { prov.discover_interval = Some(v as u32); }

        let config_str = serde_json::to_string(&prov.config).unwrap_or_default();
        self.conn.execute(
            "UPDATE providers SET name=?2, type=?3, enabled=?4, config=?5, auto_discover=?6, discover_interval=?7, updated_at=?8 WHERE id=?1",
            params![id, prov.name, prov.provider_type, prov.enabled as i32, config_str,
                    prov.auto_discover as i32, prov.discover_interval, now],
        )?;
        Ok(())
    }

    pub fn delete_provider(&self, id: &str) -> SqliteResult<()> {
        self.conn.execute("DELETE FROM discovered_hosts WHERE provider_id = ?1", params![id])?;
        self.conn.execute("DELETE FROM providers WHERE id = ?1", params![id])?;
        Ok(())
    }

    pub fn update_provider_discovery_time(&self, id: &str) -> SqliteResult<()> {
        let now = chrono_now();
        self.conn.execute("UPDATE providers SET last_discovery_at = ?2, updated_at = ?2 WHERE id = ?1", params![id, now])?;
        Ok(())
    }

    // ---- Discovered Hosts ----

    pub fn get_discovered_hosts(&self, provider_id: Option<&str>) -> SqliteResult<Vec<crate::commands::providers::DiscoveredHost>> {
        let cols = "id, provider_id, provider_host_id, name, hostname, private_ip, public_ip, os_type, os_name, state, metadata, tags, imported, connection_id";
        if let Some(pid) = provider_id {
            let mut stmt = self.conn.prepare(&format!("SELECT {} FROM discovered_hosts WHERE provider_id = ?1 ORDER BY name", cols))?;
            let rows = stmt.query_map(params![pid], |row| Ok(row_to_discovered_host(row)))?;
            rows.collect()
        } else {
            let mut stmt = self.conn.prepare(&format!("SELECT {} FROM discovered_hosts ORDER BY name", cols))?;
            let rows = stmt.query_map([], |row| Ok(row_to_discovered_host(row)))?;
            rows.collect()
        }
    }

    pub fn get_discovered_host(&self, id: &str) -> SqliteResult<crate::commands::providers::DiscoveredHost> {
        self.conn.query_row(
            "SELECT id, provider_id, provider_host_id, name, hostname, private_ip, public_ip, os_type, os_name, state, metadata, tags, imported, connection_id FROM discovered_hosts WHERE id = ?1",
            params![id],
            |row| Ok(row_to_discovered_host(row)),
        )
    }

    pub fn upsert_discovered_host(&self, host: &crate::commands::providers::DiscoveredHost) -> SqliteResult<()> {
        let now = chrono_now();
        let id = if host.id.is_empty() { uuid::Uuid::new_v4().to_string() } else { host.id.clone() };
        let metadata_str = serde_json::to_string(&host.metadata).unwrap_or_default();
        let tags_str = serde_json::to_string(&host.tags).unwrap_or_default();

        self.conn.execute(
            "INSERT OR REPLACE INTO discovered_hosts (id, provider_id, provider_host_id, name, hostname, private_ip, public_ip, os_type, os_name, state, metadata, tags, discovered_at, last_seen_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)",
            params![id, host.provider_id, host.provider_host_id, host.name, host.hostname,
                    host.private_ip, host.public_ip, host.os_type, host.os_name, host.state,
                    metadata_str, tags_str, now, now],
        )?;
        Ok(())
    }

    pub fn mark_host_imported(&self, host_id: &str, connection_id: &str) -> SqliteResult<()> {
        self.conn.execute(
            "UPDATE discovered_hosts SET imported = 1, connection_id = ?2 WHERE id = ?1",
            params![host_id, connection_id],
        )?;
        Ok(())
    }

    // ---- Session States ----

    pub fn get_session_states(&self) -> SqliteResult<Vec<crate::commands::session_states::SessionState>> {
        use crate::commands::session_states::SessionState;
        let mut stmt = self.conn.prepare(
            "SELECT id, name, description, sessions FROM session_states ORDER BY name"
        )?;
        let rows = stmt.query_map([], |row| {
            let sessions_str: Option<String> = row.get(3)?;
            Ok(SessionState {
                id: row.get(0)?,
                name: row.get(1)?,
                description: row.get(2)?,
                sessions: sessions_str.and_then(|s| serde_json::from_str(&s).ok())
                    .unwrap_or(serde_json::Value::Array(vec![])),
            })
        })?;
        rows.collect()
    }

    pub fn get_session_state(&self, id: &str) -> SqliteResult<crate::commands::session_states::SessionState> {
        use crate::commands::session_states::SessionState;
        self.conn.query_row(
            "SELECT id, name, description, sessions FROM session_states WHERE id = ?1",
            params![id],
            |row| {
                let sessions_str: Option<String> = row.get(3)?;
                Ok(SessionState {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    description: row.get(2)?,
                    sessions: sessions_str.and_then(|s| serde_json::from_str(&s).ok())
                        .unwrap_or(serde_json::Value::Array(vec![])),
                })
            },
        )
    }

    pub fn create_session_state(&self, ss: &crate::commands::session_states::SessionState) -> SqliteResult<crate::commands::session_states::SessionState> {
        let now = chrono_now();
        let id = uuid::Uuid::new_v4().to_string();
        let sessions_str = serde_json::to_string(&ss.sessions).unwrap_or_else(|_| "[]".to_string());
        // Use a default profile_id since Tauri doesn't have multi-profile yet
        self.conn.execute(
            "INSERT INTO session_states (id, profile_id, name, description, sessions, created_at, updated_at)
             VALUES (?1, 'default', ?2, ?3, ?4, ?5, ?6)",
            params![id, ss.name, ss.description, sessions_str, now, now],
        )?;
        let mut result = ss.clone();
        result.id = id;
        Ok(result)
    }

    pub fn update_session_state(&self, id: &str, updates: &serde_json::Value) -> SqliteResult<()> {
        let now = chrono_now();
        let mut ss = self.get_session_state(id)?;
        if let Some(v) = updates.get("name").and_then(|v| v.as_str()) { ss.name = v.to_string(); }
        if let Some(v) = updates.get("description") { ss.description = v.as_str().map(|s| s.to_string()); }
        if let Some(v) = updates.get("sessions") { ss.sessions = v.clone(); }

        let sessions_str = serde_json::to_string(&ss.sessions).unwrap_or_else(|_| "[]".to_string());
        self.conn.execute(
            "UPDATE session_states SET name=?2, description=?3, sessions=?4, updated_at=?5 WHERE id=?1",
            params![id, ss.name, ss.description, sessions_str, now],
        )?;
        Ok(())
    }

    pub fn delete_session_state(&self, id: &str) -> SqliteResult<()> {
        self.conn.execute("DELETE FROM session_states WHERE id = ?1", params![id])?;
        Ok(())
    }
}

fn decrypt_sensitive_fields(encrypted_data_json: &str, master_key: &str) -> (Option<String>, Option<String>, Option<String>) {
    let enc_data: Result<crate::services::crypto::EncryptedData, _> = serde_json::from_str(encrypted_data_json);
    match enc_data {
        Ok(data) => {
            match crate::services::crypto::decrypt(&data, master_key) {
                Ok(plaintext) => {
                    let map: serde_json::Map<String, serde_json::Value> = serde_json::from_str(&plaintext).unwrap_or_default();
                    (
                        map.get("secret").and_then(|v| v.as_str()).map(|s| s.to_string()),
                        map.get("privateKey").and_then(|v| v.as_str()).map(|s| s.to_string()),
                        map.get("passphrase").and_then(|v| v.as_str()).map(|s| s.to_string()),
                    )
                }
                Err(e) => {
                    log::error!("Failed to decrypt credential: {}", e);
                    (None, None, None)
                }
            }
        }
        Err(_) => (None, None, None),
    }
}

fn encrypt_sensitive_fields(cred: &Credential, master_key: &str) -> Option<String> {
    let mut sensitive: serde_json::Map<String, serde_json::Value> = serde_json::Map::new();

    if let Some(ref s) = cred.secret { sensitive.insert("secret".to_string(), serde_json::Value::String(s.clone())); }
    if let Some(ref s) = cred.password { sensitive.insert("secret".to_string(), serde_json::Value::String(s.clone())); }
    if let Some(ref s) = cred.private_key { sensitive.insert("privateKey".to_string(), serde_json::Value::String(s.clone())); }
    if let Some(ref s) = cred.passphrase { sensitive.insert("passphrase".to_string(), serde_json::Value::String(s.clone())); }

    if sensitive.is_empty() {
        return None;
    }

    let plaintext = serde_json::to_string(&sensitive).unwrap();
    match crate::services::crypto::encrypt(&plaintext, master_key) {
        Ok(enc) => Some(serde_json::to_string(&enc).unwrap()),
        Err(e) => {
            log::error!("Failed to encrypt credential: {}", e);
            None
        }
    }
}

fn row_to_connection(row: &rusqlite::Row) -> ServerConnection {
    let tags_str: Option<String> = row.get(8).unwrap_or(None);
    let tags = tags_str.and_then(|s| serde_json::from_str(&s).ok());
    let serial_str: Option<String> = row.get(11).unwrap_or(None);
    let serial_settings = serial_str.and_then(|s| serde_json::from_str(&s).ok());

    ServerConnection {
        id: row.get(0).unwrap_or_default(),
        name: row.get(1).unwrap_or_default(),
        hostname: row.get(2).unwrap_or_default(),
        port: row.get(3).unwrap_or(22),
        connection_type: row.get(4).unwrap_or_else(|_| "ssh".to_string()),
        os_type: row.get(5).unwrap_or(None),
        username: row.get(6).unwrap_or(None),
        credential_id: row.get(7).unwrap_or(None),
        tags,
        group: row.get(9).unwrap_or(None),
        description: row.get(10).unwrap_or(None),
        serial_settings,
        provider_id: None,
        provider_host_id: None,
    }
}

fn row_to_discovered_host(row: &rusqlite::Row) -> crate::commands::providers::DiscoveredHost {
    let metadata_str: Option<String> = row.get(10).unwrap_or(None);
    let tags_str: Option<String> = row.get(11).unwrap_or(None);
    crate::commands::providers::DiscoveredHost {
        id: row.get(0).unwrap_or_default(),
        provider_id: row.get(1).unwrap_or_default(),
        provider_host_id: row.get(2).unwrap_or_default(),
        name: row.get(3).unwrap_or_default(),
        hostname: row.get(4).unwrap_or(None),
        private_ip: row.get(5).unwrap_or(None),
        public_ip: row.get(6).unwrap_or(None),
        os_type: row.get(7).unwrap_or_else(|_| "linux".to_string()),
        os_name: row.get(8).unwrap_or(None),
        state: row.get(9).unwrap_or_else(|_| "unknown".to_string()),
        metadata: metadata_str.and_then(|s| serde_json::from_str(&s).ok()).unwrap_or(serde_json::Value::Object(Default::default())),
        tags: tags_str.and_then(|s| serde_json::from_str(&s).ok()).unwrap_or(serde_json::Value::Object(Default::default())),
        imported: row.get::<_, i32>(12).unwrap_or(0) != 0,
        connection_id: row.get(13).unwrap_or(None),
    }
}

fn chrono_now() -> String {
    // ISO 8601 timestamp compatible with existing JS Date format
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_millis();
    format!("{}", now)
}
