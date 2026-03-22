#[tauri::command]
pub fn get_platform() -> String {
    std::env::consts::OS.to_string()
}

#[tauri::command]
pub fn get_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}
