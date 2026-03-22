use std::collections::HashMap;
use std::sync::{Arc, OnceLock};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, State};
use tokio::sync::Mutex;
use russh::client;
use russh_sftp::client::SftpSession;
use crate::AppState;

#[derive(Debug, Serialize, Deserialize)]
pub struct RemoteFileInfo {
    pub name: String,
    #[serde(rename = "fullPath")]
    pub full_path: String,
    #[serde(rename = "isDirectory")]
    pub is_directory: bool,
    pub size: u64,
    pub modified: Option<String>,
    pub permissions: Option<String>,
    pub owner: Option<String>,
    pub group: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct LocalFileInfo {
    pub name: String,
    #[serde(rename = "fullPath")]
    pub full_path: String,
    #[serde(rename = "isDirectory")]
    pub is_directory: bool,
    pub size: u64,
    pub modified: Option<String>,
}

struct SftpSessionHandle {
    sftp: SftpSession,
    _session: client::Handle<SftpClientHandler>,
}

struct SftpClientHandler;

#[async_trait::async_trait]
impl client::Handler for SftpClientHandler {
    type Error = russh::Error;
    async fn check_server_key(&mut self, _key: &russh_keys::key::PublicKey) -> Result<bool, Self::Error> {
        Ok(true)
    }
}

type SftpMap = Arc<Mutex<HashMap<String, Arc<Mutex<SftpSessionHandle>>>>>;

fn sftp_sessions() -> &'static SftpMap {
    static INSTANCE: OnceLock<SftpMap> = OnceLock::new();
    INSTANCE.get_or_init(|| Arc::new(Mutex::new(HashMap::new())))
}

#[tauri::command]
pub async fn sftp_connect(
    connection_id: String,
    state: State<'_, AppState>,
) -> Result<String, String> {
    let session_id = format!("sftp-{}-{:x}",
        std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_millis(),
        std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().subsec_nanos(),
    );

    let db = state.db.lock().await;
    let connection = db.get_connection(&connection_id).map_err(|e| format!("Connection not found: {}", e))?;

    let credential = connection.credential_id.as_ref()
        .and_then(|cid| db.get_credential(cid).ok());

    let username = credential.as_ref().map(|c| c.username.clone()).filter(|u| !u.is_empty())
        .or_else(|| connection.username.clone().filter(|u| !u.is_empty()))
        .unwrap_or_else(|| "root".to_string());
    let password = credential.as_ref().and_then(|c| c.secret.clone().or(c.password.clone()));
    let hostname = connection.hostname.clone();
    let port = connection.port;
    drop(db);

    let config = client::Config {
        inactivity_timeout: Some(std::time::Duration::from_secs(60)),
        ..Default::default()
    };

    let mut session = client::connect(Arc::new(config), (hostname.as_str(), port as u16), SftpClientHandler)
        .await.map_err(|e| format!("SFTP connection failed: {}", e))?;

    if let Some(pw) = &password {
        let auth = session.authenticate_password(&username, pw)
            .await.map_err(|e| format!("Auth failed: {}", e))?;
        if !auth { return Err("Authentication failed".to_string()); }
    } else {
        return Err("No credentials available for SFTP connection".to_string());
    }

    let channel = session.channel_open_session().await.map_err(|e| format!("Channel failed: {}", e))?;
    channel.request_subsystem(false, "sftp").await.map_err(|e| format!("SFTP subsystem failed: {}", e))?;

    let sftp = SftpSession::new(channel.into_stream()).await.map_err(|e| format!("SFTP session failed: {}", e))?;

    let handle = Arc::new(Mutex::new(SftpSessionHandle { sftp, _session: session }));
    sftp_sessions().lock().await.insert(session_id.clone(), handle);

    Ok(session_id)
}

#[tauri::command]
pub async fn sftp_disconnect(session_id: String) -> Result<(), String> {
    sftp_sessions().lock().await.remove(&session_id);
    Ok(())
}

#[tauri::command]
pub async fn sftp_list_remote(session_id: String, remote_path: String) -> Result<Vec<RemoteFileInfo>, String> {
    let map = sftp_sessions().lock().await;
    let handle = map.get(&session_id).ok_or("SFTP session not found")?.clone();
    drop(map);

    let session = handle.lock().await;
    let entries = session.sftp.read_dir(&remote_path).await.map_err(|e| format!("List failed: {}", e))?;

    let mut files = Vec::new();
    for entry in entries {
        let name = entry.file_name();
        if name == "." || name == ".." { continue; }
        let full_path = if remote_path.ends_with('/') {
            format!("{}{}", remote_path, name)
        } else {
            format!("{}/{}", remote_path, name)
        };

        let is_dir = entry.file_type().is_dir();
        let size = entry.metadata().len();
        let modified = entry.metadata().modified().ok().map(|t| {
            let secs = t.duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_secs();
            format!("{}", secs * 1000) // JS timestamp
        });

        files.push(RemoteFileInfo {
            name, full_path, is_directory: is_dir, size, modified,
            permissions: None, owner: None, group: None,
        });
    }

    Ok(files)
}

#[tauri::command]
pub async fn sftp_list_local(local_path: String) -> Result<Vec<LocalFileInfo>, String> {
    let entries = std::fs::read_dir(&local_path).map_err(|e| format!("Failed to read directory: {}", e))?;
    let mut files = Vec::new();

    for entry in entries.flatten() {
        let metadata = entry.metadata().map_err(|e| format!("Metadata error: {}", e))?;
        let name = entry.file_name().to_string_lossy().to_string();
        let full_path = entry.path().to_string_lossy().to_string();

        files.push(LocalFileInfo {
            name, full_path,
            is_directory: metadata.is_dir(),
            size: metadata.len(),
            modified: metadata.modified().ok().map(|t| {
                let secs = t.duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_secs();
                format!("{}", secs * 1000)
            }),
        });
    }

    Ok(files)
}

#[tauri::command]
pub async fn sftp_upload(
    session_id: String,
    local_path: String,
    remote_path: String,
    _app: AppHandle,
) -> Result<(), String> {
    let map = sftp_sessions().lock().await;
    let handle = map.get(&session_id).ok_or("SFTP session not found")?.clone();
    drop(map);

    let data = tokio::fs::read(&local_path).await.map_err(|e| format!("Read failed: {}", e))?;
    let session = handle.lock().await;

    let mut file = session.sftp.create(&remote_path).await.map_err(|e| format!("Create failed: {}", e))?;
    use tokio::io::AsyncWriteExt;
    file.write_all(&data).await.map_err(|e| format!("Write failed: {}", e))?;
    file.shutdown().await.map_err(|e| format!("Shutdown failed: {}", e))?;

    Ok(())
}

#[tauri::command]
pub async fn sftp_download(
    session_id: String,
    remote_path: String,
    local_path: String,
    _app: AppHandle,
) -> Result<(), String> {
    let map = sftp_sessions().lock().await;
    let handle = map.get(&session_id).ok_or("SFTP session not found")?.clone();
    drop(map);

    let session = handle.lock().await;
    let mut file = session.sftp.open(&remote_path).await.map_err(|e| format!("Open failed: {}", e))?;

    use tokio::io::AsyncReadExt;
    let mut data = Vec::new();
    file.read_to_end(&mut data).await.map_err(|e| format!("Read failed: {}", e))?;

    tokio::fs::write(&local_path, &data).await.map_err(|e| format!("Write local failed: {}", e))?;
    Ok(())
}

#[tauri::command]
pub async fn sftp_mkdir(session_id: String, remote_path: String) -> Result<(), String> {
    let map = sftp_sessions().lock().await;
    let handle = map.get(&session_id).ok_or("SFTP session not found")?.clone();
    drop(map);
    let session = handle.lock().await;
    session.sftp.create_dir(&remote_path).await.map_err(|e| format!("Mkdir failed: {}", e))?;
    Ok(())
}

#[tauri::command]
pub async fn sftp_rmdir(session_id: String, remote_path: String) -> Result<(), String> {
    let map = sftp_sessions().lock().await;
    let handle = map.get(&session_id).ok_or("SFTP session not found")?.clone();
    drop(map);
    let session = handle.lock().await;
    session.sftp.remove_dir(&remote_path).await.map_err(|e| format!("Rmdir failed: {}", e))?;
    Ok(())
}

#[tauri::command]
pub async fn sftp_unlink(session_id: String, remote_path: String) -> Result<(), String> {
    let map = sftp_sessions().lock().await;
    let handle = map.get(&session_id).ok_or("SFTP session not found")?.clone();
    drop(map);
    let session = handle.lock().await;
    session.sftp.remove_file(&remote_path).await.map_err(|e| format!("Unlink failed: {}", e))?;
    Ok(())
}

#[tauri::command]
pub async fn sftp_rename(session_id: String, old_path: String, new_path: String) -> Result<(), String> {
    let map = sftp_sessions().lock().await;
    let handle = map.get(&session_id).ok_or("SFTP session not found")?.clone();
    drop(map);
    let session = handle.lock().await;
    session.sftp.rename(&old_path, &new_path).await.map_err(|e| format!("Rename failed: {}", e))?;
    Ok(())
}

#[tauri::command]
pub async fn sftp_home_path() -> Result<String, String> {
    dirs::home_dir()
        .map(|p| p.to_string_lossy().to_string())
        .ok_or_else(|| "Could not determine home directory".to_string())
}

#[tauri::command]
pub async fn sftp_get_temp_dir() -> Result<String, String> {
    Ok(std::env::temp_dir().to_string_lossy().to_string())
}
