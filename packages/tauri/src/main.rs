// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod services;

use commands::*;
use services::database::DatabaseService;
use std::sync::Arc;
use tauri::Manager;
use tokio::sync::Mutex;

/// Shared application state accessible from all Tauri commands
pub struct AppState {
    pub db: Arc<Mutex<DatabaseService>>,
}

fn main() {
    env_logger::init();

    tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            let app_dir = app
                .path()
                .app_data_dir()
                .expect("Failed to get app data directory");

            std::fs::create_dir_all(&app_dir).ok();

            let db_path = app_dir.join("connectty.db");
            let db = DatabaseService::new(db_path.to_str().unwrap())
                .expect("Failed to initialize database");

            app.manage(AppState {
                db: Arc::new(Mutex::new(db)),
            });

            log::info!("connectty started successfully");
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // Connection CRUD
            connections::list_connections,
            connections::get_connection,
            connections::create_connection,
            connections::update_connection,
            connections::delete_connection,
            // Credential CRUD
            credentials::list_credentials,
            credentials::create_credential,
            credentials::update_credential,
            credentials::delete_credential,
            // Group CRUD
            groups::list_groups,
            groups::create_group,
            groups::update_group,
            groups::delete_group,
            // SSH
            ssh::ssh_connect,
            ssh::ssh_disconnect,
            ssh::ssh_write,
            ssh::ssh_resize,
            // Local Shell
            local_shell::spawn_local_shell,
            local_shell::write_local_shell,
            local_shell::resize_local_shell,
            local_shell::kill_local_shell,
            local_shell::list_available_shells,
            // SFTP
            sftp::sftp_connect,
            sftp::sftp_disconnect,
            sftp::sftp_list_remote,
            sftp::sftp_list_local,
            sftp::sftp_upload,
            sftp::sftp_download,
            sftp::sftp_mkdir,
            sftp::sftp_rmdir,
            sftp::sftp_unlink,
            sftp::sftp_rename,
            sftp::sftp_home_path,
            sftp::sftp_get_temp_dir,
            // Serial
            serial::serial_list_ports,
            serial::serial_connect,
            serial::serial_disconnect,
            serial::serial_write,
            // RDP
            rdp::rdp_connect,
            rdp::rdp_disconnect,
            // Bulk Commands
            bulk_commands::commands_list,
            bulk_commands::commands_create,
            bulk_commands::commands_update,
            bulk_commands::commands_delete,
            bulk_commands::commands_execute,
            bulk_commands::commands_cancel,
            // Providers
            providers::providers_list,
            providers::providers_create,
            providers::providers_update,
            providers::providers_delete,
            providers::providers_discover,
            providers::discovered_list,
            providers::discovered_import_selected,
            // Dialogs
            dialogs::select_local_folder,
            dialogs::select_local_files,
            dialogs::select_save_location,
            dialogs::select_import_file,
            dialogs::select_export_file,
            // Import/Export
            import_export::import_file,
            import_export::export_file,
            // Session States
            session_states::session_states_list,
            session_states::session_states_get,
            session_states::session_states_create,
            session_states::session_states_update,
            session_states::session_states_delete,
            // Sync
            sync::sync_connect,
            sync::sync_disconnect,
            sync::sync_upload,
            sync::sync_list_configs,
            sync::sync_import_config,
            sync::sync_get_accounts,
            // Settings
            settings::get_settings,
            settings::save_settings,
            // App info
            app_info::get_platform,
            app_info::get_version,
            // AI session monitoring
            ai_sessions::ai_sessions_list,
            ai_sessions::ai_session_transcript,
            ai_sessions::ai_search_prompts,
            ai_sessions::ai_sessions_watch_start,
        ])
        .run(tauri::generate_context!())
        .expect("error while running connectty");
}
