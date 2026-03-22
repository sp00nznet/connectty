use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::State;
use crate::AppState;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Credential {
    #[serde(default)]
    pub id: String,
    #[serde(default)]
    pub name: String,
    #[serde(rename = "type", default)]
    pub credential_type: String,
    #[serde(default)]
    pub username: String,
    #[serde(default)]
    pub domain: Option<String>,
    // Sensitive fields - sent from frontend, encrypted before storage
    #[serde(default)]
    pub secret: Option<String>,
    #[serde(default)]
    pub password: Option<String>,
    #[serde(rename = "privateKey", default)]
    pub private_key: Option<String>,
    #[serde(default)]
    pub passphrase: Option<String>,
    // Auto-assign
    #[serde(rename = "autoAssignPatterns", default)]
    pub auto_assign_patterns: Option<Vec<String>>,
    #[serde(rename = "autoAssignGroup", default)]
    pub auto_assign_group: Option<String>,
    // Metadata
    #[serde(rename = "usedBy", default)]
    pub used_by: Vec<String>,
}

#[tauri::command]
pub async fn list_credentials(state: State<'_, AppState>) -> Result<Vec<Credential>, String> {
    let db = state.db.lock().await;
    db.get_credentials().map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn create_credential(credential: Credential, state: State<'_, AppState>) -> Result<Credential, String> {
    let db = state.db.lock().await;
    db.create_credential(&credential).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_credential(id: String, updates: Value, state: State<'_, AppState>) -> Result<(), String> {
    let db = state.db.lock().await;
    db.update_credential(&id, &updates).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_credential(id: String, state: State<'_, AppState>) -> Result<(), String> {
    let db = state.db.lock().await;
    db.delete_credential(&id).map_err(|e| e.to_string())
}
