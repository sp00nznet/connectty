use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::State;
use crate::AppState;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SessionState {
    #[serde(default)]
    pub id: String,
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub sessions: Value, // Array of saved session configs
}

#[tauri::command]
pub async fn session_states_list(state: State<'_, AppState>) -> Result<Vec<SessionState>, String> {
    let db = state.db.lock().await;
    db.get_session_states().map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn session_states_get(id: String, state: State<'_, AppState>) -> Result<Option<SessionState>, String> {
    let db = state.db.lock().await;
    match db.get_session_state(&id) {
        Ok(s) => Ok(Some(s)),
        Err(_) => Ok(None),
    }
}

#[tauri::command]
pub async fn session_states_create(session_state: SessionState, state: State<'_, AppState>) -> Result<SessionState, String> {
    let db = state.db.lock().await;
    db.create_session_state(&session_state).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn session_states_update(id: String, updates: Value, state: State<'_, AppState>) -> Result<SessionState, String> {
    let db = state.db.lock().await;
    db.update_session_state(&id, &updates).map_err(|e| e.to_string())?;
    db.get_session_state(&id).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn session_states_delete(id: String, state: State<'_, AppState>) -> Result<(), String> {
    let db = state.db.lock().await;
    db.delete_session_state(&id).map_err(|e| e.to_string())
}
