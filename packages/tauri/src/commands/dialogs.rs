use tauri_plugin_dialog::DialogExt;

pub fn file_path_to_string(fp: tauri_plugin_dialog::FilePath) -> String {
    match fp {
        tauri_plugin_dialog::FilePath::Path(p) => p.to_string_lossy().to_string(),
        tauri_plugin_dialog::FilePath::Url(u) => u.to_string(),
    }
}

#[tauri::command]
pub async fn select_local_folder(app: tauri::AppHandle) -> Result<Option<String>, String> {
    let result = app.dialog().file().set_title("Select Folder").blocking_pick_folder();
    Ok(result.map(file_path_to_string))
}

#[tauri::command]
pub async fn select_local_files(app: tauri::AppHandle) -> Result<Vec<String>, String> {
    let result = app.dialog().file().set_title("Select Files").blocking_pick_files();
    Ok(result.unwrap_or_default().into_iter().map(file_path_to_string).collect())
}

#[tauri::command]
pub async fn select_save_location(default_name: Option<String>, app: tauri::AppHandle) -> Result<Option<String>, String> {
    let mut builder = app.dialog().file().set_title("Save As");
    if let Some(name) = default_name { builder = builder.set_file_name(&name); }
    let result = builder.blocking_save_file();
    Ok(result.map(file_path_to_string))
}

#[tauri::command]
pub async fn select_import_file(app: tauri::AppHandle) -> Result<Option<String>, String> {
    let result = app.dialog().file()
        .set_title("Import")
        .add_filter("Connectty Files", &["json", "csv"])
        .add_filter("All Files", &["*"])
        .blocking_pick_file();
    Ok(result.map(file_path_to_string))
}

#[tauri::command]
pub async fn select_export_file(default_name: Option<String>, app: tauri::AppHandle) -> Result<Option<String>, String> {
    let mut builder = app.dialog().file()
        .set_title("Export")
        .add_filter("JSON", &["json"])
        .add_filter("CSV", &["csv"]);
    if let Some(name) = default_name { builder = builder.set_file_name(&name); }
    let result = builder.blocking_save_file();
    Ok(result.map(file_path_to_string))
}
