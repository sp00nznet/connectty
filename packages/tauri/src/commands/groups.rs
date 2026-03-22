use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::State;
use crate::AppState;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ConnectionGroup {
    #[serde(default)]
    pub id: String,
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub color: Option<String>,
    #[serde(default)]
    pub description: Option<String>,
}

#[tauri::command]
pub async fn list_groups(state: State<'_, AppState>) -> Result<Vec<ConnectionGroup>, String> {
    let db = state.db.lock().await;
    db.get_groups().map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn create_group(group: ConnectionGroup, state: State<'_, AppState>) -> Result<ConnectionGroup, String> {
    let db = state.db.lock().await;
    db.create_group(&group).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_group(id: String, updates: Value, state: State<'_, AppState>) -> Result<(), String> {
    let db = state.db.lock().await;
    let mut group = db.get_group(&id).map_err(|e| e.to_string())?;
    if let Some(v) = updates.get("name").and_then(|v| v.as_str()) { group.name = v.to_string(); }
    if let Some(v) = updates.get("color") { group.color = v.as_str().map(|s| s.to_string()); }
    if let Some(v) = updates.get("description") { group.description = v.as_str().map(|s| s.to_string()); }
    db.update_group(&group).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_group(id: String, state: State<'_, AppState>) -> Result<(), String> {
    let db = state.db.lock().await;
    db.delete_group(&id).map_err(|e| e.to_string())
}
