use std::sync::Arc;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::{AppHandle, Emitter, State};
use crate::AppState;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SavedCommand {
    #[serde(default)]
    pub id: String,
    pub name: String,
    pub command: String,
    #[serde(default)]
    pub category: Option<String>,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(rename = "targetOS", default = "default_all")]
    pub target_os: String,
    #[serde(rename = "commandType", default = "default_ssh_type")]
    pub command_type: String,
}

fn default_all() -> String { "all".to_string() }
fn default_ssh_type() -> String { "ssh".to_string() }

#[derive(Debug, Clone, Serialize)]
pub struct CommandProgressEvent {
    #[serde(rename = "executionId")]
    pub execution_id: String,
    #[serde(rename = "connectionId")]
    pub connection_id: String,
    pub status: String,
    pub output: Option<String>,
    pub error: Option<String>,
    #[serde(rename = "exitCode")]
    pub exit_code: Option<i32>,
}

/// List saved commands
#[tauri::command]
pub async fn commands_list(state: State<'_, AppState>) -> Result<Vec<SavedCommand>, String> {
    let db = state.db.lock().await;
    db.get_saved_commands().map_err(|e| e.to_string())
}

/// Create a saved command
#[tauri::command]
pub async fn commands_create(command: SavedCommand, state: State<'_, AppState>) -> Result<SavedCommand, String> {
    let db = state.db.lock().await;
    db.create_saved_command(&command).map_err(|e| e.to_string())
}

/// Update a saved command
#[tauri::command]
pub async fn commands_update(id: String, updates: Value, state: State<'_, AppState>) -> Result<(), String> {
    let db = state.db.lock().await;
    db.update_saved_command(&id, &updates).map_err(|e| e.to_string())
}

/// Delete a saved command
#[tauri::command]
pub async fn commands_delete(id: String, state: State<'_, AppState>) -> Result<(), String> {
    let db = state.db.lock().await;
    db.delete_saved_command(&id).map_err(|e| e.to_string())
}

/// Execute a command across multiple connections
#[tauri::command]
pub async fn commands_execute(
    execution_data: Value,
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<Value, String> {
    let command = execution_data.get("command").and_then(|v| v.as_str())
        .ok_or("Missing command")?.to_string();
    let _command_name = execution_data.get("commandName").and_then(|v| v.as_str())
        .unwrap_or("Unnamed").to_string();

    // Get target connection IDs from filter
    let db = state.db.lock().await;
    let all_connections = db.get_connections().map_err(|e| e.to_string())?;

    let filter = execution_data.get("filter").cloned().unwrap_or(serde_json::json!({"type": "all"}));
    let filter_type = filter.get("type").and_then(|v| v.as_str()).unwrap_or("all");

    let target_connections: Vec<_> = match filter_type {
        "all" => all_connections,
        "group" => {
            let gid = filter.get("groupId").and_then(|v| v.as_str()).unwrap_or("");
            all_connections.into_iter().filter(|c| c.group.as_deref() == Some(gid)).collect()
        }
        "selection" => {
            let ids: Vec<String> = filter.get("connectionIds")
                .and_then(|v| serde_json::from_value(v.clone()).ok())
                .unwrap_or_default();
            all_connections.into_iter().filter(|c| ids.contains(&c.id)).collect()
        }
        _ => all_connections,
    };

    if target_connections.is_empty() {
        return Ok(serde_json::json!({ "error": "No matching connections found" }));
    }

    let execution_id = uuid::Uuid::new_v4().to_string();

    // Collect connection info and credentials
    let mut targets = Vec::new();
    for conn in &target_connections {
        let credential = conn.credential_id.as_ref().and_then(|cid| db.get_credential(cid).ok());
        targets.push((conn.clone(), credential));
    }
    drop(db);

    let eid = execution_id.clone();
    let app_clone = app.clone();

    // Spawn execution in background
    tokio::spawn(async move {
        let concurrency = 10;
        let semaphore = Arc::new(tokio::sync::Semaphore::new(concurrency));

        let mut handles = Vec::new();
        for (conn, credential) in targets {
            let sem = semaphore.clone();
            let cmd = command.clone();
            let app_inner = app_clone.clone();
            let eid_inner = eid.clone();

            let handle = tokio::spawn(async move {
                let _permit = sem.acquire().await.unwrap();

                let username = credential.as_ref().map(|c| c.username.clone())
                    .filter(|u| !u.is_empty())
                    .or_else(|| conn.username.clone().filter(|u| !u.is_empty()))
                    .unwrap_or_else(|| "root".to_string());
                let password = credential.as_ref().and_then(|c| c.secret.clone().or(c.password.clone()));

                // Connect and execute
                let result = execute_ssh_command(
                    &conn.hostname, conn.port as u16, &username, password.as_deref(), &cmd
                ).await;

                let (status, output, error, exit_code) = match result {
                    Ok((out, code)) => ("success".to_string(), Some(out), None, Some(code)),
                    Err(e) => ("error".to_string(), None, Some(e), None),
                };

                let _ = app_inner.emit("command:progress", CommandProgressEvent {
                    execution_id: eid_inner,
                    connection_id: conn.id.clone(),
                    status, output, error, exit_code,
                });
            });

            handles.push(handle);
        }

        // Wait for all
        for h in handles {
            let _ = h.await;
        }

        let _ = app_clone.emit("command:complete", serde_json::json!({ "executionId": eid }));
    });

    Ok(serde_json::json!({
        "executionId": execution_id,
        "connectionCount": target_connections.len()
    }))
}

/// Cancel a command execution (best-effort)
#[tauri::command]
pub async fn commands_cancel(_execution_id: String) -> Result<(), String> {
    // TODO: Track running tasks and cancel them
    Ok(())
}

/// Execute a single SSH command and return output
async fn execute_ssh_command(
    hostname: &str,
    port: u16,
    username: &str,
    password: Option<&str>,
    command: &str,
) -> Result<(String, i32), String> {
    use russh::client;

    struct Handler;

    #[async_trait::async_trait]
    impl client::Handler for Handler {
        type Error = russh::Error;
        async fn check_server_key(&mut self, _key: &russh_keys::key::PublicKey) -> Result<bool, Self::Error> {
            Ok(true)
        }
    }

    let config = client::Config {
        inactivity_timeout: Some(std::time::Duration::from_secs(30)),
        ..Default::default()
    };

    let mut session = client::connect(Arc::new(config), (hostname, port), Handler)
        .await.map_err(|e| format!("Connection failed: {}", e))?;

    if let Some(pw) = password {
        let auth: bool = session.authenticate_password(username, pw)
            .await.map_err(|e| format!("Auth failed: {}", e))?;
        if !auth { return Err("Authentication failed".to_string()); }
    } else {
        return Err("No password available".to_string());
    }

    let mut channel = session.channel_open_session()
        .await.map_err(|e| format!("Channel failed: {}", e))?;

    channel.exec(true, command)
        .await.map_err(|e| format!("Exec failed: {}", e))?;

    let mut output = String::new();
    let mut exit_code = 0i32;

    // Read all output
    loop {
        tokio::select! {
            msg = channel.wait() => {
                match msg {
                    Some(russh::ChannelMsg::Data { data }) => {
                        output.push_str(&String::from_utf8_lossy(&data));
                    }
                    Some(russh::ChannelMsg::ExtendedData { data, .. }) => {
                        output.push_str(&String::from_utf8_lossy(&data));
                    }
                    Some(russh::ChannelMsg::ExitStatus { exit_status }) => {
                        exit_code = exit_status as i32;
                    }
                    None => break,
                    _ => {}
                }
            }
        }
    }

    Ok((output, exit_code))
}
