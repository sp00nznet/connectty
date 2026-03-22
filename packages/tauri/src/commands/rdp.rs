use tauri::State;
use crate::AppState;

/// Connect to RDP - generates .rdp file and launches external client
#[tauri::command]
pub async fn rdp_connect(
    connection_id: String,
    _embedded: Option<bool>,
    state: State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    let db = state.db.lock().await;
    let connection = db.get_connection(&connection_id).map_err(|e| e.to_string())?;
    let credential = connection.credential_id.as_ref().and_then(|cid| db.get_credential(cid).ok());
    drop(db);

    let port = if connection.port == 22 { 3389 } else { connection.port };

    // Generate .rdp file
    let mut lines = vec![
        format!("full address:s:{}:{}", connection.hostname, port),
        "prompt for credentials:i:1".to_string(),
        "screen mode id:i:2".to_string(),
        "desktopwidth:i:1920".to_string(),
        "desktopheight:i:1080".to_string(),
        "session bpp:i:32".to_string(),
        "compression:i:1".to_string(),
        "connection type:i:7".to_string(),
        "networkautodetect:i:1".to_string(),
        "bandwidthautodetect:i:1".to_string(),
        "allow font smoothing:i:1".to_string(),
        "allow desktop composition:i:1".to_string(),
        "redirectclipboard:i:1".to_string(),
        "autoreconnection enabled:i:1".to_string(),
        "authentication level:i:2".to_string(),
    ];

    if let Some(ref cred) = credential {
        let username = if let Some(ref domain) = cred.domain {
            format!("{}\\{}", domain, cred.username)
        } else {
            cred.username.clone()
        };
        lines.push(format!("username:s:{}", username));
        if let Some(ref domain) = cred.domain {
            lines.push(format!("domain:s:{}", domain));
        }
    }

    let rdp_content = lines.join("\r\n");
    let rdp_path = std::env::temp_dir().join(format!("connectty-{}.rdp", connection_id));
    std::fs::write(&rdp_path, &rdp_content)
        .map_err(|e| format!("Failed to write .rdp file: {}", e))?;

    // Launch RDP client
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("mstsc.exe")
            .arg(rdp_path.to_str().unwrap())
            .spawn()
            .map_err(|e| format!("Failed to launch mstsc: {}", e))?;
    }

    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(rdp_path.to_str().unwrap())
            .spawn()
            .map_err(|e| format!("Failed to launch RDP: {}", e))?;
    }

    #[cfg(target_os = "linux")]
    {
        // Try xfreerdp, then rdesktop, then remmina
        let host = format!("{}:{}", connection.hostname, port);
        let launched = try_linux_rdp(&host, credential.as_ref());
        if !launched {
            return Err("No RDP client found. Install xfreerdp, rdesktop, or remmina.".to_string());
        }
    }

    // Clean up .rdp file after delay
    let rdp_path_clone = rdp_path.clone();
    tokio::spawn(async move {
        tokio::time::sleep(std::time::Duration::from_secs(5)).await;
        let _ = std::fs::remove_file(rdp_path_clone);
    });

    Ok(serde_json::json!({ "sessionId": null, "embedded": false, "reason": "native" }))
}

#[cfg(target_os = "linux")]
fn try_linux_rdp(host: &str, credential: Option<&crate::commands::credentials::Credential>) -> bool {
    for client in &["xfreerdp", "rdesktop"] {
        if std::process::Command::new("which").arg(client).output().map(|o| o.status.success()).unwrap_or(false) {
            let mut cmd = std::process::Command::new(client);
            if *client == "xfreerdp" {
                cmd.arg(format!("/v:{}", host)).arg("/cert:ignore");
                if let Some(cred) = credential {
                    cmd.arg(format!("/u:{}", cred.username));
                }
            } else {
                cmd.arg(host);
                if let Some(cred) = credential {
                    cmd.arg("-u").arg(&cred.username);
                }
            }
            if cmd.spawn().is_ok() { return true; }
        }
    }
    false
}

/// Disconnect RDP - no-op for external client
#[tauri::command]
pub async fn rdp_disconnect(_session_id: String) -> Result<(), String> {
    Ok(())
}
