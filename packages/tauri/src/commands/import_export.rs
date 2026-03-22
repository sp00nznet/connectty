use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::State;
use crate::AppState;
use super::dialogs::file_path_to_string;

#[derive(Debug, Serialize, Deserialize)]
pub struct ImportResult {
    pub connections: usize,
    pub credentials: usize,
    pub groups: usize,
}

/// Import connections/credentials/groups from a file
#[tauri::command]
pub async fn import_file(
    options: Value,
    app: tauri::AppHandle,
    state: State<'_, AppState>,
) -> Result<Option<ImportResult>, String> {
    use tauri_plugin_dialog::DialogExt;

    let format = options.get("format").and_then(|v| v.as_str()).unwrap_or("json");

    let file_path = {
        let mut builder = app.dialog().file().set_title("Import");
        match format {
            "csv" => { builder = builder.add_filter("CSV", &["csv"]); }
            "sshconfig" => { builder = builder.add_filter("SSH Config", &["config", "conf", ""]); }
            _ => { builder = builder.add_filter("JSON", &["json"]); }
        }
        builder = builder.add_filter("All Files", &["*"]);
        builder.blocking_pick_file()
    };

    let path_str = match file_path {
        Some(p) => file_path_to_string(p),
        None => return Ok(None),
    };

    let contents = std::fs::read_to_string(&path_str)
        .map_err(|e| format!("Failed to read file: {}", e))?;

    let db = state.db.lock().await;
    let mut result = ImportResult { connections: 0, credentials: 0, groups: 0 };

    match format {
        "json" => {
            let data: Value = serde_json::from_str(&contents)
                .map_err(|e| format!("Invalid JSON: {}", e))?;

            if let Some(conns) = data.get("connections").and_then(|v| v.as_array()) {
                for conn_val in conns {
                    if let Ok(conn) = serde_json::from_value::<crate::commands::connections::ServerConnection>(conn_val.clone()) {
                        if db.create_connection(&conn).is_ok() { result.connections += 1; }
                    }
                }
            }
            if let Some(creds) = data.get("credentials").and_then(|v| v.as_array()) {
                for cred_val in creds {
                    if let Ok(cred) = serde_json::from_value::<crate::commands::credentials::Credential>(cred_val.clone()) {
                        if db.create_credential(&cred).is_ok() { result.credentials += 1; }
                    }
                }
            }
            if let Some(groups) = data.get("groups").and_then(|v| v.as_array()) {
                for group_val in groups {
                    if let Ok(group) = serde_json::from_value::<crate::commands::groups::ConnectionGroup>(group_val.clone()) {
                        if db.create_group(&group).is_ok() { result.groups += 1; }
                    }
                }
            }
        }
        "csv" => {
            let connections = parse_csv(&contents);
            for conn in connections {
                if db.create_connection(&conn).is_ok() { result.connections += 1; }
            }
        }
        "sshconfig" => {
            let connections = parse_ssh_config(&contents);
            for conn in connections {
                if db.create_connection(&conn).is_ok() { result.connections += 1; }
            }
        }
        _ => {
            return Err(format!("Unsupported import format: {}", format));
        }
    }

    Ok(Some(result))
}

/// Export connections/credentials/groups to a file
#[tauri::command]
pub async fn export_file(
    options: Value,
    app: tauri::AppHandle,
    state: State<'_, AppState>,
) -> Result<bool, String> {
    use tauri_plugin_dialog::DialogExt;

    let format = options.get("format").and_then(|v| v.as_str()).unwrap_or("json");

    let save_path = {
        let mut builder = app.dialog().file()
            .set_title("Export")
            .set_file_name(&format!("connectty-export.{}", format));
        match format {
            "csv" => { builder = builder.add_filter("CSV", &["csv"]); }
            _ => { builder = builder.add_filter("JSON", &["json"]); }
        }
        builder.blocking_save_file()
    };

    let path_str = match save_path {
        Some(p) => file_path_to_string(p),
        None => return Ok(false),
    };

    let db = state.db.lock().await;
    let export_conns = options.get("connections").and_then(|v| v.as_bool()).unwrap_or(true);
    let export_creds = options.get("credentials").and_then(|v| v.as_bool()).unwrap_or(true);
    let export_groups = options.get("groups").and_then(|v| v.as_bool()).unwrap_or(true);

    match format {
        "csv" => {
            if export_conns {
                let conns = db.get_connections().map_err(|e| e.to_string())?;
                let csv = export_connections_csv(&conns);
                std::fs::write(&path_str, csv).map_err(|e| format!("Write failed: {}", e))?;
            }
        }
        _ => {
            let mut data = serde_json::Map::new();
            data.insert("version".to_string(), Value::String("2.0.0".to_string()));

            if export_conns {
                let conns = db.get_connections().map_err(|e| e.to_string())?;
                data.insert("connections".to_string(), serde_json::to_value(&conns).unwrap());
            }
            if export_creds {
                let creds = db.get_credentials().map_err(|e| e.to_string())?;
                let safe: Vec<Value> = creds.iter().map(|c| {
                    let mut v = serde_json::to_value(c).unwrap();
                    if let Some(obj) = v.as_object_mut() {
                        obj.remove("secret"); obj.remove("password");
                        obj.remove("privateKey"); obj.remove("passphrase");
                    }
                    v
                }).collect();
                data.insert("credentials".to_string(), Value::Array(safe));
            }
            if export_groups {
                let groups = db.get_groups().map_err(|e| e.to_string())?;
                data.insert("groups".to_string(), serde_json::to_value(&groups).unwrap());
            }

            let json = serde_json::to_string_pretty(&data).unwrap();
            std::fs::write(&path_str, json).map_err(|e| format!("Write failed: {}", e))?;
        }
    }

    Ok(true)
}

// ---- Parsers ----

/// Parse SSH config file format
fn parse_ssh_config(content: &str) -> Vec<crate::commands::connections::ServerConnection> {
    use crate::commands::connections::ServerConnection;
    let mut connections = Vec::new();
    let mut current: Option<ServerConnection> = None;

    for line in content.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() || trimmed.starts_with('#') { continue; }

        let parts: Vec<&str> = trimmed.splitn(2, |c: char| c.is_whitespace()).collect();
        if parts.len() != 2 { continue; }

        let key = parts[0].to_lowercase();
        let value = parts[1].trim();

        if key == "host" {
            if let Some(conn) = current.take() {
                if !conn.hostname.is_empty() {
                    connections.push(conn);
                }
            }
            current = Some(ServerConnection {
                id: String::new(),
                name: value.to_string(),
                hostname: String::new(),
                port: 22,
                username: None,
                connection_type: "ssh".to_string(),
                os_type: None,
                credential_id: None,
                tags: None,
                group: None,
                description: None,
                serial_settings: None,
                provider_id: None,
                provider_host_id: None,
            });
        } else if let Some(ref mut conn) = current {
            match key.as_str() {
                "hostname" => conn.hostname = value.to_string(),
                "port" => conn.port = value.parse().unwrap_or(22),
                "user" => conn.username = Some(value.to_string()),
                _ => {}
            }
        }
    }

    if let Some(conn) = current {
        if !conn.hostname.is_empty() {
            connections.push(conn);
        }
    }

    // For entries where hostname wasn't set, use the Host name as hostname
    for conn in &mut connections {
        if conn.hostname.is_empty() {
            conn.hostname = conn.name.clone();
        }
    }

    connections
}

/// Parse CSV file with headers: name,hostname,port,username,tags,group,description
fn parse_csv(content: &str) -> Vec<crate::commands::connections::ServerConnection> {
    use crate::commands::connections::ServerConnection;
    let lines: Vec<&str> = content.lines().filter(|l| !l.trim().is_empty()).collect();
    if lines.len() < 2 { return vec![]; }

    let headers: Vec<String> = parse_csv_line(lines[0]).iter()
        .map(|h| h.trim().to_lowercase().replace('"', ""))
        .collect();

    let mut connections = Vec::new();

    for line in &lines[1..] {
        let values = parse_csv_line(line);
        let get = |name: &str| -> String {
            headers.iter().position(|h| h == name)
                .and_then(|i| values.get(i))
                .map(|v| v.replace('"', "").trim().to_string())
                .unwrap_or_default()
        };

        let name = get("name");
        let hostname = if !get("hostname").is_empty() { get("hostname") } else { get("host") };

        if name.is_empty() || hostname.is_empty() { continue; }

        let tags_str = get("tags");
        let tags: Vec<String> = if tags_str.is_empty() {
            vec![]
        } else {
            tags_str.split(';').map(|s| s.trim().to_string()).filter(|s| !s.is_empty()).collect()
        };

        connections.push(ServerConnection {
            id: String::new(),
            name,
            hostname,
            port: get("port").parse().unwrap_or(22),
            username: { let u = get("username").or_else(|| get("user")); if u.is_empty() { None } else { Some(u) } },
            connection_type: "ssh".to_string(),
            os_type: None,
            credential_id: None,
            tags: if tags.is_empty() { None } else { Some(serde_json::to_value(&tags).unwrap()) },
            group: { let g = get("group"); if g.is_empty() { None } else { Some(g) } },
            description: { let d = get("description"); if d.is_empty() { None } else { Some(d) } },
            serial_settings: None,
            provider_id: None,
            provider_host_id: None,
        });
    }

    connections
}

/// Parse a CSV line respecting quoted fields
fn parse_csv_line(line: &str) -> Vec<String> {
    let mut result = Vec::new();
    let mut current = String::new();
    let mut in_quotes = false;
    let chars: Vec<char> = line.chars().collect();
    let mut i = 0;

    while i < chars.len() {
        let c = chars[i];
        if c == '"' {
            if in_quotes && i + 1 < chars.len() && chars[i + 1] == '"' {
                current.push('"');
                i += 1;
            } else {
                in_quotes = !in_quotes;
            }
        } else if c == ',' && !in_quotes {
            result.push(current.clone());
            current.clear();
        } else {
            current.push(c);
        }
        i += 1;
    }
    result.push(current);
    result
}

/// Export connections as CSV
fn export_connections_csv(connections: &[crate::commands::connections::ServerConnection]) -> String {
    let mut csv = String::from("name,hostname,port,username,tags,group,description\n");
    for conn in connections {
        let tags = conn.tags.as_ref()
            .and_then(|t| t.as_array())
            .map(|arr| arr.iter().filter_map(|v| v.as_str()).collect::<Vec<_>>().join(";"))
            .unwrap_or_default();
        let username = conn.username.as_deref().unwrap_or("");
        let group = conn.group.as_deref().unwrap_or("");
        let desc = conn.description.as_deref().unwrap_or("");

        csv.push_str(&format!(
            "\"{}\",\"{}\",{},\"{}\",\"{}\",\"{}\",\"{}\"\n",
            conn.name.replace('"', "\"\""),
            conn.hostname.replace('"', "\"\""),
            conn.port,
            username.replace('"', "\"\""),
            tags.replace('"', "\"\""),
            group.replace('"', "\"\""),
            desc.replace('"', "\"\""),
        ));
    }
    csv
}

// Helper trait for Option<String> to work like get()
trait OrElseEmpty {
    fn or_else<F: FnOnce() -> String>(self, f: F) -> String;
}
impl OrElseEmpty for String {
    fn or_else<F: FnOnce() -> String>(self, f: F) -> String {
        if self.is_empty() { f() } else { self }
    }
}
