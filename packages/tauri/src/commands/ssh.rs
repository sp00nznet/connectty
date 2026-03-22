use std::collections::HashMap;
use std::sync::{Arc, OnceLock};
use tauri::{AppHandle, Emitter, State};
use tokio::sync::Mutex;
use russh::client;
use serde::Serialize;
use crate::AppState;

#[derive(Debug, Clone, Serialize)]
pub struct SSHEvent {
    #[serde(rename = "sessionId")]
    pub session_id: String,
    #[serde(rename = "type")]
    pub event_type: String,
    pub data: Option<String>,
    pub message: Option<String>,
    pub code: Option<u32>,
}

struct SSHSessionHandle {
    channel: russh::Channel<client::Msg>,
}

type SSHSessionMap = Arc<Mutex<HashMap<String, Arc<Mutex<SSHSessionHandle>>>>>;

fn ssh_sessions() -> &'static SSHSessionMap {
    static INSTANCE: OnceLock<SSHSessionMap> = OnceLock::new();
    INSTANCE.get_or_init(|| Arc::new(Mutex::new(HashMap::new())))
}

struct ClientHandler {
    session_id: String,
    app: AppHandle,
}

#[async_trait::async_trait]
impl client::Handler for ClientHandler {
    type Error = russh::Error;

    async fn check_server_key(
        &mut self,
        _server_public_key: &russh_keys::key::PublicKey,
    ) -> Result<bool, Self::Error> {
        Ok(true) // TODO: known_hosts checking
    }

    async fn data(
        &mut self, _channel: russh::ChannelId, data: &[u8], _session: &mut client::Session,
    ) -> Result<(), Self::Error> {
        let _ = self.app.emit("ssh:event", SSHEvent {
            session_id: self.session_id.clone(),
            event_type: "data".to_string(),
            data: Some(String::from_utf8_lossy(data).to_string()),
            message: None, code: None,
        });
        Ok(())
    }

    async fn extended_data(
        &mut self, _channel: russh::ChannelId, _ext: u32, data: &[u8], _session: &mut client::Session,
    ) -> Result<(), Self::Error> {
        let _ = self.app.emit("ssh:event", SSHEvent {
            session_id: self.session_id.clone(),
            event_type: "data".to_string(),
            data: Some(String::from_utf8_lossy(data).to_string()),
            message: None, code: None,
        });
        Ok(())
    }
}

/// Connect to an SSH server
#[tauri::command]
pub async fn ssh_connect(
    connection_id: String,
    password: Option<String>,
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<String, String> {
    let session_id = format!("ssh-{}-{:x}",
        std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_millis(),
        std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().subsec_nanos(),
    );

    // Look up connection and credential
    let db = state.db.lock().await;
    let connection = db.get_connection(&connection_id)
        .map_err(|e| format!("Connection not found: {}", e))?;

    let credential = connection.credential_id.as_ref()
        .and_then(|cid| db.get_credential(cid).ok());

    let cred_type = credential.as_ref().map(|c| c.credential_type.as_str()).unwrap_or("");

    let username = credential.as_ref()
        .map(|c| c.username.clone()).filter(|u| !u.is_empty())
        .or_else(|| connection.username.clone().filter(|u| !u.is_empty()))
        .unwrap_or_else(|| "root".to_string());

    let auth_password = password.or_else(|| {
        credential.as_ref().and_then(|c| c.secret.clone().or_else(|| c.password.clone()))
    });

    let private_key = credential.as_ref().and_then(|c| c.private_key.clone());
    let passphrase = credential.as_ref().and_then(|c| c.passphrase.clone());

    let hostname = connection.hostname.clone();
    let port = connection.port;
    drop(db);

    // Connect
    let config = client::Config {
        inactivity_timeout: Some(std::time::Duration::from_secs(30)),
        keepalive_interval: Some(std::time::Duration::from_secs(10)),
        ..Default::default()
    };

    let handler = ClientHandler { session_id: session_id.clone(), app: app.clone() };

    let mut session = client::connect(
        Arc::new(config), (hostname.as_str(), port as u16), handler,
    ).await.map_err(|e| format!("Connection failed: {}", e))?;

    // Authenticate based on credential type
    let authenticated: bool = match cred_type {
        "privateKey" => {
            // Private key authentication
            if let Some(ref key_data) = private_key {
                match russh_keys::decode_secret_key(key_data, passphrase.as_deref()) {
                    Ok(key) => {
                        session.authenticate_publickey(&username, Arc::new(key))
                            .await.map_err(|e| format!("Key auth failed: {}", e))?
                    }
                    Err(e) => return Err(format!("Failed to decode private key: {}", e)),
                }
            } else {
                return Err("Private key credential has no key data".to_string());
            }
        }
        "agent" => {
            // SSH agent authentication
            try_agent_auth(&mut session, &username).await
                .map_err(|e| format!("Agent auth failed: {}", e))?
        }
        _ => {
            // Password authentication (default)
            if let Some(ref pw) = auth_password {
                session.authenticate_password(&username, pw)
                    .await.map_err(|e| format!("Auth failed: {}", e))?
            } else {
                // Try agent as fallback before failing
                let agent_ok = try_agent_auth(&mut session, &username).await.unwrap_or(false);
                if !agent_ok {
                    return Err("No password provided and SSH agent not available.".to_string());
                }
                true
            }
        }
    };

    if !authenticated {
        return Err("Authentication failed. Check your credentials.".to_string());
    }

    // Open channel, request PTY and shell
    let channel = session.channel_open_session()
        .await.map_err(|e| format!("Failed to open channel: {}", e))?;

    channel.request_pty(false, "xterm-256color", 80, 24, 0, 0, &[])
        .await.map_err(|e| format!("PTY request failed: {}", e))?;

    channel.request_shell(false)
        .await.map_err(|e| format!("Shell request failed: {}", e))?;

    // Store session
    let handle = Arc::new(Mutex::new(SSHSessionHandle { channel }));
    ssh_sessions().lock().await.insert(session_id.clone(), handle);

    // Watch for close
    let sid_close = session_id.clone();
    let app_close = app.clone();
    tokio::spawn(async move {
        let _ = session.await;
        let _ = app_close.emit("ssh:event", SSHEvent {
            session_id: sid_close.clone(), event_type: "close".to_string(),
            data: None, message: None, code: Some(0),
        });
        ssh_sessions().lock().await.remove(&sid_close);
    });

    Ok(session_id)
}

/// Try SSH agent authentication using russh_keys agent client
async fn try_agent_auth(
    session: &mut client::Handle<ClientHandler>,
    username: &str,
) -> Result<bool, String> {
    // Try to connect to the SSH agent
    let mut agent = match russh_keys::agent::client::AgentClient::connect_env().await {
        Ok(a) => a,
        Err(_) => return Ok(false), // Agent not available
    };

    // Get identities (public keys) from agent
    let identities = match agent.request_identities().await {
        Ok(ids) => ids,
        Err(_) => return Ok(false),
    };

    if identities.is_empty() {
        return Ok(false);
    }

    // Try authenticating with the agent as a signer
    // The agent acts as a Signer that can sign challenges without exposing private keys
    let (_agent_returned, auth_result) = session
        .authenticate_future(username, identities[0].clone(), agent).await;
    match auth_result {
        Ok(result) => Ok(result),
        Err(_) => Ok(false),
    }
}

/// Disconnect an SSH session
#[tauri::command]
pub async fn ssh_disconnect(session_id: String) -> Result<(), String> {
    if let Some(handle) = ssh_sessions().lock().await.remove(&session_id) {
        let session = handle.lock().await;
        let _ = session.channel.eof().await;
    }
    Ok(())
}

/// Write data to an SSH session
#[tauri::command]
pub async fn ssh_write(session_id: String, data: String) -> Result<(), String> {
    let map = ssh_sessions().lock().await;
    let handle = map.get(&session_id)
        .ok_or_else(|| format!("SSH session '{}' not found", session_id))?.clone();
    drop(map);

    let session = handle.lock().await;
    session.channel.data(data.as_bytes())
        .await.map_err(|e| format!("Write failed: {}", e))?;
    Ok(())
}

/// Resize an SSH session's PTY
#[tauri::command]
pub async fn ssh_resize(session_id: String, cols: u32, rows: u32) -> Result<(), String> {
    let map = ssh_sessions().lock().await;
    let handle = map.get(&session_id)
        .ok_or_else(|| format!("SSH session '{}' not found", session_id))?.clone();
    drop(map);

    let session = handle.lock().await;
    session.channel.window_change(cols, rows, 0, 0)
        .await.map_err(|e| format!("Resize failed: {}", e))?;
    Ok(())
}
