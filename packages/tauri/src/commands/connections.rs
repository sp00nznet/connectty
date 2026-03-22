use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::State;
use crate::AppState;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ServerConnection {
    #[serde(default)]
    pub id: String,
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub hostname: String,
    #[serde(default = "default_port")]
    pub port: u16,
    #[serde(default)]
    pub username: Option<String>,
    #[serde(rename = "connectionType", default = "default_ssh")]
    pub connection_type: String,
    #[serde(rename = "osType", default)]
    pub os_type: Option<String>,
    #[serde(rename = "credentialId", default)]
    pub credential_id: Option<String>,
    #[serde(default)]
    pub tags: Option<Value>, // Can be string[] from frontend or JSON string from DB
    #[serde(default)]
    pub group: Option<String>,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(rename = "serialSettings", default)]
    pub serial_settings: Option<Value>,
    #[serde(rename = "providerId", default)]
    pub provider_id: Option<String>,
    #[serde(rename = "providerHostId", default)]
    pub provider_host_id: Option<String>,
}

fn default_port() -> u16 { 22 }
fn default_ssh() -> String { "ssh".to_string() }

#[tauri::command]
pub async fn list_connections(state: State<'_, AppState>) -> Result<Vec<ServerConnection>, String> {
    let db = state.db.lock().await;
    db.get_connections().map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_connection(id: String, state: State<'_, AppState>) -> Result<ServerConnection, String> {
    let db = state.db.lock().await;
    db.get_connection(&id).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn create_connection(connection: ServerConnection, state: State<'_, AppState>) -> Result<ServerConnection, String> {
    let db = state.db.lock().await;
    db.create_connection(&connection).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_connection(id: String, updates: Value, state: State<'_, AppState>) -> Result<(), String> {
    let db = state.db.lock().await;
    let mut conn = db.get_connection(&id).map_err(|e| e.to_string())?;

    if let Some(v) = updates.get("name").and_then(|v| v.as_str()) { conn.name = v.to_string(); }
    if let Some(v) = updates.get("hostname").and_then(|v| v.as_str()) { conn.hostname = v.to_string(); }
    if let Some(v) = updates.get("port").and_then(|v| v.as_u64()) { conn.port = v as u16; }
    if let Some(v) = updates.get("username") { conn.username = v.as_str().map(|s| s.to_string()); }
    if let Some(v) = updates.get("connectionType").and_then(|v| v.as_str()) { conn.connection_type = v.to_string(); }
    if let Some(v) = updates.get("osType") { conn.os_type = v.as_str().map(|s| s.to_string()); }
    if let Some(v) = updates.get("credentialId") { conn.credential_id = v.as_str().map(|s| s.to_string()); }
    if let Some(v) = updates.get("group") { conn.group = v.as_str().map(|s| s.to_string()); }
    if let Some(v) = updates.get("description") { conn.description = v.as_str().map(|s| s.to_string()); }
    if let Some(v) = updates.get("tags") { conn.tags = Some(v.clone()); }

    db.update_connection(&conn).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_connection(id: String, state: State<'_, AppState>) -> Result<(), String> {
    let db = state.db.lock().await;
    db.delete_connection(&id).map_err(|e| e.to_string())
}
