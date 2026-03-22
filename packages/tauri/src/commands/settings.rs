use serde_json::Value;

#[tauri::command]
pub async fn get_settings() -> Result<Value, String> {
    // TODO: Read from tauri-plugin-store or database
    Ok(serde_json::json!({
        "terminalTheme": "sync",
        "minimizeToTray": false,
        "closeToTray": false,
        "startMinimized": false,
        "defaultShell": null,
        "windowsElevationMethod": "gsudo"
    }))
}

#[tauri::command]
pub async fn save_settings(settings: Value) -> Result<(), String> {
    // TODO: Write to tauri-plugin-store or database
    log::info!("Settings saved: {:?}", settings);
    Ok(())
}
