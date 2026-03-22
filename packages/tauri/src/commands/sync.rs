use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
use std::sync::{Arc, OnceLock};
use tauri::State;
use tokio::sync::Mutex;
use crate::AppState;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SyncAccount {
    pub id: String,
    pub provider: String, // "google" or "github"
    pub email: Option<String>,
    pub username: Option<String>,
    #[serde(rename = "accessToken")]
    pub access_token: String,
    #[serde(rename = "refreshToken")]
    pub refresh_token: Option<String>,
    #[serde(rename = "connectedAt")]
    pub connected_at: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[allow(dead_code)]
pub struct SyncConfigInfo {
    pub id: String,
    #[serde(rename = "deviceName")]
    pub device_name: String,
    #[serde(rename = "deviceId")]
    pub device_id: String,
    #[serde(rename = "uploadedAt")]
    pub uploaded_at: String,
    #[serde(rename = "connectionCount")]
    pub connection_count: usize,
    #[serde(rename = "credentialCount")]
    pub credential_count: usize,
}

type AccountMap = Arc<Mutex<HashMap<String, SyncAccount>>>;

fn accounts() -> &'static AccountMap {
    static INSTANCE: OnceLock<AccountMap> = OnceLock::new();
    INSTANCE.get_or_init(|| Arc::new(Mutex::new(HashMap::new())))
}

/// Connect to a sync provider (Google or GitHub) via OAuth
#[tauri::command]
pub async fn sync_connect(
    provider: String,
    app: tauri::AppHandle,
) -> Result<Option<SyncAccount>, String> {
    match provider.as_str() {
        "github" => connect_github(app).await,
        "google" => {
            Err("Google Drive sync requires OAuth client configuration. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET environment variables.".to_string())
        }
        _ => Err(format!("Unknown sync provider: {}", provider)),
    }
}

/// Connect via GitHub - uses device flow (no redirect needed)
async fn connect_github(_app: tauri::AppHandle) -> Result<Option<SyncAccount>, String> {
    // GitHub Device Authorization Flow
    // This doesn't require a client secret, just a client ID
    // User gets a code to enter at github.com/login/device

    let client_id = std::env::var("GITHUB_CLIENT_ID")
        .unwrap_or_else(|_| "Iv1.0000000000000000".to_string()); // Placeholder

    let client = reqwest::Client::new();

    // Step 1: Request device code
    let device_resp: Value = client.post("https://github.com/login/device/code")
        .header("Accept", "application/json")
        .form(&[("client_id", &client_id), ("scope", &"gist".to_string())])
        .send().await.map_err(|e| format!("GitHub API error: {}", e))?
        .json().await.map_err(|e| e.to_string())?;

    let device_code = device_resp.get("device_code").and_then(|v| v.as_str())
        .ok_or("Failed to get device code from GitHub")?;
    let _user_code = device_resp.get("user_code").and_then(|v| v.as_str())
        .ok_or("Failed to get user code")?;
    let verification_uri = device_resp.get("verification_uri").and_then(|v| v.as_str())
        .unwrap_or("https://github.com/login/device");
    let interval = device_resp.get("interval").and_then(|v| v.as_u64()).unwrap_or(5);

    // Open browser for user to enter code
    let _ = open::that(verification_uri);

    // Poll for token (user needs to enter code at github.com/login/device)
    let expires_in = device_resp.get("expires_in").and_then(|v| v.as_u64()).unwrap_or(900);
    let start = std::time::Instant::now();

    loop {
        if start.elapsed().as_secs() > expires_in {
            return Err("Authentication timed out. Please try again.".to_string());
        }

        tokio::time::sleep(std::time::Duration::from_secs(interval)).await;

        let token_resp: Value = client.post("https://github.com/login/oauth/access_token")
            .header("Accept", "application/json")
            .form(&[
                ("client_id", &client_id),
                ("device_code", &device_code.to_string()),
                ("grant_type", &"urn:ietf:params:oauth:grant-type:device_code".to_string()),
            ])
            .send().await.map_err(|e| format!("Token poll failed: {}", e))?
            .json().await.map_err(|e| e.to_string())?;

        if let Some(token) = token_resp.get("access_token").and_then(|v| v.as_str()) {
            // Get user info
            let user_resp: Value = client.get("https://api.github.com/user")
                .header("Authorization", format!("Bearer {}", token))
                .header("User-Agent", "Connectty")
                .send().await.map_err(|e| e.to_string())?
                .json().await.map_err(|e| e.to_string())?;

            let account = SyncAccount {
                id: uuid::Uuid::new_v4().to_string(),
                provider: "github".to_string(),
                email: user_resp.get("email").and_then(|v| v.as_str()).map(|s| s.to_string()),
                username: user_resp.get("login").and_then(|v| v.as_str()).map(|s| s.to_string()),
                access_token: token.to_string(),
                refresh_token: None,
                connected_at: format!("{}", std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH).unwrap().as_secs()),
            };

            accounts().lock().await.insert(account.id.clone(), account.clone());
            return Ok(Some(account));
        }

        let error = token_resp.get("error").and_then(|v| v.as_str()).unwrap_or("");
        if error == "authorization_pending" || error == "slow_down" {
            continue;
        } else {
            return Err(format!("GitHub auth error: {}", error));
        }
    }
}

/// Disconnect a sync account
#[tauri::command]
pub async fn sync_disconnect(account_id: String) -> Result<bool, String> {
    accounts().lock().await.remove(&account_id);
    Ok(true)
}

/// Upload data to sync provider (GitHub Gist)
#[tauri::command]
pub async fn sync_upload(
    account_id: String,
    _options: Option<Value>,
    state: State<'_, AppState>,
) -> Result<Value, String> {
    let map = accounts().lock().await;
    let account = map.get(&account_id).ok_or("Account not found")?.clone();
    drop(map);

    let db = state.db.lock().await;
    let mut data = serde_json::Map::new();
    data.insert("version".to_string(), Value::String("2.0.0".to_string()));
    data.insert("deviceName".to_string(), Value::String(hostname::get().unwrap_or_default().to_string_lossy().to_string()));

    let conns = db.get_connections().map_err(|e| e.to_string())?;
    data.insert("connections".to_string(), serde_json::to_value(&conns).unwrap());
    data.insert("connectionCount".to_string(), Value::Number(conns.len().into()));

    let creds = db.get_credentials().map_err(|e| e.to_string())?;
    // Strip sensitive data
    let safe_creds: Vec<Value> = creds.iter().map(|c| {
        let mut v = serde_json::to_value(c).unwrap();
        if let Some(obj) = v.as_object_mut() {
            obj.remove("secret"); obj.remove("password");
            obj.remove("privateKey"); obj.remove("passphrase");
        }
        v
    }).collect();
    data.insert("credentials".to_string(), Value::Array(safe_creds));
    data.insert("credentialCount".to_string(), Value::Number(creds.len().into()));

    let groups = db.get_groups().map_err(|e| e.to_string())?;
    data.insert("groups".to_string(), serde_json::to_value(&groups).unwrap());
    drop(db);

    // Upload as GitHub Gist
    if account.provider == "github" {
        let client = reqwest::Client::new();
        let gist_data = serde_json::json!({
            "description": "Connectty Sync Backup",
            "public": false,
            "files": {
                "connectty-sync.json": {
                    "content": serde_json::to_string_pretty(&data).unwrap()
                }
            }
        });

        let resp: Value = client.post("https://api.github.com/gists")
            .header("Authorization", format!("Bearer {}", account.access_token))
            .header("User-Agent", "Connectty")
            .json(&gist_data)
            .send().await.map_err(|e| format!("Upload failed: {}", e))?
            .json().await.map_err(|e| e.to_string())?;

        let gist_id = resp.get("id").and_then(|v| v.as_str()).unwrap_or("");
        return Ok(serde_json::json!({ "success": true, "configId": gist_id }));
    }

    Err("Unsupported provider".to_string())
}

/// List sync configs from provider
#[tauri::command]
pub async fn sync_list_configs(account_id: String) -> Result<Value, String> {
    let map = accounts().lock().await;
    let account = map.get(&account_id).ok_or("Account not found")?.clone();
    drop(map);

    if account.provider == "github" {
        let client = reqwest::Client::new();
        let resp: Value = client.get("https://api.github.com/gists")
            .header("Authorization", format!("Bearer {}", account.access_token))
            .header("User-Agent", "Connectty")
            .send().await.map_err(|e| e.to_string())?
            .json().await.map_err(|e| e.to_string())?;

        let mut configs = Vec::new();
        if let Some(gists) = resp.as_array() {
            for gist in gists {
                if let Some(files) = gist.get("files") {
                    if files.get("connectty-sync.json").is_some() {
                        configs.push(serde_json::json!({
                            "id": gist.get("id"),
                            "deviceName": gist.get("description"),
                            "uploadedAt": gist.get("updated_at"),
                        }));
                    }
                }
            }
        }

        return Ok(serde_json::json!({ "success": true, "configs": configs }));
    }

    Ok(serde_json::json!({ "success": true, "configs": [] }))
}

/// Import a sync config
#[tauri::command]
pub async fn sync_import_config(
    account_id: String,
    config_id: String,
    _options: Option<Value>,
    state: State<'_, AppState>,
) -> Result<Value, String> {
    let map = accounts().lock().await;
    let account = map.get(&account_id).ok_or("Account not found")?.clone();
    drop(map);

    if account.provider == "github" {
        let client = reqwest::Client::new();
        let resp: Value = client.get(&format!("https://api.github.com/gists/{}", config_id))
            .header("Authorization", format!("Bearer {}", account.access_token))
            .header("User-Agent", "Connectty")
            .send().await.map_err(|e| e.to_string())?
            .json().await.map_err(|e| e.to_string())?;

        let content = resp.get("files")
            .and_then(|f| f.get("connectty-sync.json"))
            .and_then(|f| f.get("content"))
            .and_then(|v| v.as_str())
            .ok_or("Sync file not found in gist")?;

        let data: Value = serde_json::from_str(content)
            .map_err(|e| format!("Invalid sync data: {}", e))?;

        let db = state.db.lock().await;
        let mut imported = serde_json::Map::new();
        let mut conn_count = 0usize;
        let cred_count = 0usize;
        let mut group_count = 0usize;

        if let Some(conns) = data.get("connections").and_then(|v| v.as_array()) {
            for c in conns {
                if let Ok(conn) = serde_json::from_value::<crate::commands::connections::ServerConnection>(c.clone()) {
                    if db.create_connection(&conn).is_ok() { conn_count += 1; }
                }
            }
        }
        if let Some(groups) = data.get("groups").and_then(|v| v.as_array()) {
            for g in groups {
                if let Ok(group) = serde_json::from_value::<crate::commands::groups::ConnectionGroup>(g.clone()) {
                    if db.create_group(&group).is_ok() { group_count += 1; }
                }
            }
        }

        imported.insert("connections".to_string(), Value::Number(conn_count.into()));
        imported.insert("credentials".to_string(), Value::Number(cred_count.into()));
        imported.insert("groups".to_string(), Value::Number(group_count.into()));

        return Ok(serde_json::json!({ "success": true, "imported": imported }));
    }

    Err("Unsupported provider".to_string())
}

/// Get connected sync accounts
#[tauri::command]
pub async fn sync_get_accounts() -> Result<Vec<SyncAccount>, String> {
    let map = accounts().lock().await;
    Ok(map.values().cloned().collect())
}
