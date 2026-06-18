use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::State;
use crate::AppState;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Provider {
    #[serde(default)]
    pub id: String,
    pub name: String,
    #[serde(rename = "type")]
    pub provider_type: String,
    #[serde(default = "default_true")]
    pub enabled: bool,
    #[serde(default)]
    pub config: Value,
    #[serde(rename = "autoDiscover", default)]
    pub auto_discover: bool,
    #[serde(rename = "discoverInterval", default)]
    pub discover_interval: Option<u32>,
    #[serde(rename = "lastDiscoveryAt", default)]
    pub last_discovery_at: Option<String>,
}

fn default_true() -> bool { true }

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DiscoveredHost {
    #[serde(default)]
    pub id: String,
    #[serde(rename = "providerId")]
    pub provider_id: String,
    #[serde(rename = "providerHostId")]
    pub provider_host_id: String,
    pub name: String,
    pub hostname: Option<String>,
    #[serde(rename = "privateIp")]
    pub private_ip: Option<String>,
    #[serde(rename = "publicIp")]
    pub public_ip: Option<String>,
    #[serde(rename = "osType")]
    pub os_type: String,
    #[serde(rename = "osName")]
    pub os_name: Option<String>,
    pub state: String,
    #[serde(default)]
    pub metadata: Value,
    #[serde(default)]
    pub tags: Value,
    #[serde(default)]
    pub imported: bool,
    #[serde(rename = "connectionId", default)]
    pub connection_id: Option<String>,
}

#[tauri::command]
pub async fn providers_list(state: State<'_, AppState>) -> Result<Vec<Provider>, String> {
    let db = state.db.lock().await;
    db.get_providers().map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn providers_create(provider: Provider, state: State<'_, AppState>) -> Result<Provider, String> {
    let db = state.db.lock().await;
    db.create_provider(&provider).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn providers_update(id: String, updates: Value, state: State<'_, AppState>) -> Result<(), String> {
    let db = state.db.lock().await;
    db.update_provider(&id, &updates).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn providers_delete(id: String, state: State<'_, AppState>) -> Result<(), String> {
    let db = state.db.lock().await;
    db.delete_provider(&id).map_err(|e| e.to_string())
}

/// Discover hosts from a provider
#[tauri::command]
pub async fn providers_discover(
    id: String,
    state: State<'_, AppState>,
) -> Result<Vec<DiscoveredHost>, String> {
    let db = state.db.lock().await;
    let provider = db.get_provider(&id).map_err(|e| e.to_string())?;
    drop(db);

    let hosts = match provider.provider_type.as_str() {
        "proxmox" => discover_proxmox(&provider).await?,
        "esxi" | "vmware" => discover_vmware(&provider).await?,
        "aws" => discover_aws(&provider).await?,
        "azure" => discover_azure(&provider).await?,
        "gcp" => discover_gcp(&provider).await?,
        "bigfix" => discover_bigfix(&provider).await?,
        _ => return Err(format!("Discovery not implemented for provider type: {}", provider.provider_type)),
    };

    // Store discovered hosts in database
    let db = state.db.lock().await;
    for host in &hosts {
        db.upsert_discovered_host(host).ok();
    }
    // Update last discovery timestamp
    db.update_provider_discovery_time(&id).ok();

    Ok(hosts)
}

/// Get discovered hosts for a provider
#[tauri::command]
pub async fn discovered_list(
    provider_id: Option<String>,
    state: State<'_, AppState>,
) -> Result<Vec<DiscoveredHost>, String> {
    let db = state.db.lock().await;
    db.get_discovered_hosts(provider_id.as_deref()).map_err(|e| e.to_string())
}

/// Import selected discovered hosts as connections
#[tauri::command]
pub async fn discovered_import_selected(
    host_ids: Vec<String>,
    credential_id: Option<String>,
    group_id: Option<String>,
    state: State<'_, AppState>,
) -> Result<Vec<crate::commands::connections::ServerConnection>, String> {
    let db = state.db.lock().await;
    let mut imported = Vec::new();

    for host_id in &host_ids {
        if let Ok(host) = db.get_discovered_host(host_id) {
            let hostname = host.public_ip.or(host.private_ip).or(host.hostname)
                .unwrap_or_else(|| host.name.clone());
            let port = if host.os_type == "windows" { 3389u16 } else { 22u16 };
            let conn_type = if host.os_type == "windows" { "rdp" } else { "ssh" };

            let conn = crate::commands::connections::ServerConnection {
                id: String::new(),
                name: host.name.clone(),
                hostname,
                port,
                username: None,
                connection_type: conn_type.to_string(),
                os_type: Some(host.os_type.clone()),
                credential_id: credential_id.clone(),
                tags: Some(host.tags.clone()),
                group: group_id.clone(),
                description: host.os_name.clone(),
                serial_settings: None,
                provider_id: Some(host.provider_id.clone()),
                provider_host_id: Some(host.provider_host_id.clone()),
            };

            if let Ok(created) = db.create_connection(&conn) {
                db.mark_host_imported(host_id, &created.id).ok();
                imported.push(created);
            }
        }
    }

    Ok(imported)
}

// ---- Provider Discovery Implementations ----

async fn discover_proxmox(provider: &Provider) -> Result<Vec<DiscoveredHost>, String> {
    let config = &provider.config;
    let host = config.get("host").and_then(|v| v.as_str()).ok_or("Missing host")?;
    let port = config.get("port").and_then(|v| v.as_u64()).unwrap_or(8006);
    let username = config.get("username").and_then(|v| v.as_str()).ok_or("Missing username")?;
    let password = config.get("password").and_then(|v| v.as_str()).ok_or("Missing password")?;
    let realm = config.get("realm").and_then(|v| v.as_str()).unwrap_or("pam");

    let client = reqwest::Client::builder()
        .danger_accept_invalid_certs(true)
        .build().map_err(|e| e.to_string())?;

    // Authenticate
    let auth_url = format!("https://{}:{}/api2/json/access/ticket", host, port);
    let auth_resp: Value = client.post(&auth_url)
        .form(&[("username", format!("{}@{}", username, realm)), ("password", password.to_string())])
        .send().await.map_err(|e| format!("Auth failed: {}", e))?
        .json().await.map_err(|e| e.to_string())?;

    let ticket = auth_resp["data"]["ticket"].as_str().ok_or("No ticket")?;
    let _csrf = auth_resp["data"]["CSRFPreventionToken"].as_str().unwrap_or("");

    // Enumerate cluster nodes WITH their IPs via /cluster/status, so we can
    // both surface the Proxmox nodes themselves as importable SSH hosts and
    // scan each node for guests.
    let cookie = format!("PVEAuthCookie={}", ticket);
    let mut nodes: Vec<(String, Option<String>, bool)> = Vec::new(); // (name, ip, online)
    let status_url = format!("https://{}:{}/api2/json/cluster/status", host, port);
    if let Ok(resp) = client.get(&status_url).header("Cookie", &cookie).send().await {
        if let Ok(data) = resp.json::<Value>().await {
            for entry in data["data"].as_array().unwrap_or(&vec![]) {
                if entry["type"].as_str() != Some("node") { continue; }
                if let Some(name) = entry["name"].as_str() {
                    let ip = entry["ip"].as_str().map(|s| s.to_string());
                    let online = entry["online"].as_u64().unwrap_or(0) == 1;
                    nodes.push((name.to_string(), ip, online));
                }
            }
        }
    }
    // Fallback to /nodes (no per-node IPs) if cluster/status is unavailable.
    if nodes.is_empty() {
        let nodes_url = format!("https://{}:{}/api2/json/nodes", host, port);
        if let Ok(resp) = client.get(&nodes_url).header("Cookie", &cookie).send().await {
            if let Ok(data) = resp.json::<Value>().await {
                for n in data["data"].as_array().unwrap_or(&vec![]) {
                    if let Some(name) = n["node"].as_str() {
                        let online = n["status"].as_str() != Some("offline");
                        nodes.push((name.to_string(), None, online));
                    }
                }
            }
        }
    }

    let mut hosts = Vec::new();

    // Surface the Proxmox nodes themselves as importable hosts (SSH to the node).
    for (name, ip, online) in &nodes {
        hosts.push(DiscoveredHost {
            id: String::new(),
            provider_id: provider.id.clone(),
            provider_host_id: format!("node-{}", name),
            name: name.clone(),
            hostname: ip.clone(),
            private_ip: ip.clone(),
            public_ip: None,
            os_type: "linux".to_string(),
            os_name: Some("Proxmox VE".to_string()),
            state: if *online { "running".to_string() } else { "stopped".to_string() },
            metadata: serde_json::json!({"node": name, "type": "node"}),
            tags: Value::Object(Default::default()),
            imported: false,
            connection_id: None,
        });
    }

    // Scan each online node for guests.
    for (node_name, _ip, online) in &nodes {
        if !*online { continue; }
        // Get VMs (QEMU)
        let vms_url = format!("https://{}:{}/api2/json/nodes/{}/qemu", host, port, node_name);
        if let Ok(resp) = client.get(&vms_url)
            .header("Cookie", format!("PVEAuthCookie={}", ticket))
            .send().await
        {
            if let Ok(data) = resp.json::<Value>().await {
                for vm in data["data"].as_array().unwrap_or(&vec![]) {
                    let vmid = vm["vmid"].as_u64().unwrap_or(0).to_string();
                    let name = vm["name"].as_str().unwrap_or(&vmid).to_string();
                    let status = vm["status"].as_str().unwrap_or("unknown");
                    let ip = proxmox_qemu_ip(&client, host, port, ticket, node_name, &vmid, status == "running").await;

                    hosts.push(DiscoveredHost {
                        id: String::new(),
                        provider_id: provider.id.clone(),
                        provider_host_id: vmid.clone(),
                        name,
                        hostname: ip.clone(),
                        private_ip: ip,
                        public_ip: None,
                        os_type: "linux".to_string(),
                        os_name: vm["os"].as_str().map(|s| s.to_string()),
                        state: status.to_string(),
                        metadata: serde_json::json!({"node": node_name, "vmid": vmid, "type": "qemu"}),
                        tags: Value::Object(Default::default()),
                        imported: false,
                        connection_id: None,
                    });
                }
            }
        }

        // Get LXC containers
        let lxc_url = format!("https://{}:{}/api2/json/nodes/{}/lxc", host, port, node_name);
        if let Ok(resp) = client.get(&lxc_url)
            .header("Cookie", format!("PVEAuthCookie={}", ticket))
            .send().await
        {
            if let Ok(data) = resp.json::<Value>().await {
                for ct in data["data"].as_array().unwrap_or(&vec![]) {
                    let vmid = ct["vmid"].as_u64().unwrap_or(0).to_string();
                    let name = ct["name"].as_str().unwrap_or(&vmid).to_string();
                    let status = ct["status"].as_str().unwrap_or("unknown");
                    let ip = proxmox_lxc_ip(&client, host, port, ticket, node_name, &vmid, status == "running").await;

                    hosts.push(DiscoveredHost {
                        id: String::new(),
                        provider_id: provider.id.clone(),
                        provider_host_id: format!("lxc-{}", vmid),
                        name,
                        hostname: ip.clone(),
                        private_ip: ip,
                        public_ip: None,
                        os_type: "linux".to_string(),
                        os_name: None,
                        state: status.to_string(),
                        metadata: serde_json::json!({"node": node_name, "vmid": vmid, "type": "lxc"}),
                        tags: Value::Object(Default::default()),
                        imported: false,
                        connection_id: None,
                    });
                }
            }
        }
    }

    Ok(hosts)
}

/// Parse an IPv4 out of a Proxmox `ipconfig0`/`netN` string, e.g.
/// "ip=192.168.1.10/24,gw=..." or "name=eth0,bridge=vmbr0,ip=10.0.0.5/24,...".
fn parse_proxmox_ip(s: &str) -> Option<String> {
    for part in s.split(',') {
        if let Some(rest) = part.trim().strip_prefix("ip=") {
            let ip = rest.split('/').next().unwrap_or("").trim();
            if !ip.is_empty() && ip != "dhcp" && ip != "manual" {
                return Some(ip.to_string());
            }
        }
    }
    None
}

/// Resolve a QEMU VM's IP: guest agent while running, else cloud-init config.
async fn proxmox_qemu_ip(client: &reqwest::Client, host: &str, port: u64, ticket: &str,
                         node: &str, vmid: &str, running: bool) -> Option<String> {
    let cookie = format!("PVEAuthCookie={}", ticket);
    if running {
        let url = format!("https://{}:{}/api2/json/nodes/{}/qemu/{}/agent/network-get-interfaces", host, port, node, vmid);
        if let Ok(resp) = client.get(&url).header("Cookie", &cookie).send().await {
            if let Ok(data) = resp.json::<Value>().await {
                if let Some(ifaces) = data["data"]["result"].as_array() {
                    for iface in ifaces {
                        if iface["name"].as_str() == Some("lo") { continue; }
                        if let Some(addrs) = iface["ip-addresses"].as_array() {
                            for addr in addrs {
                                if addr["ip-address-type"].as_str() == Some("ipv4") {
                                    if let Some(ip) = addr["ip-address"].as_str() {
                                        if ip != "127.0.0.1" { return Some(ip.to_string()); }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
    // Fallback: cloud-init ipconfig0 in the VM config.
    let url = format!("https://{}:{}/api2/json/nodes/{}/qemu/{}/config", host, port, node, vmid);
    if let Ok(resp) = client.get(&url).header("Cookie", &cookie).send().await {
        if let Ok(data) = resp.json::<Value>().await {
            if let Some(s) = data["data"]["ipconfig0"].as_str() {
                return parse_proxmox_ip(s);
            }
        }
    }
    None
}

/// Resolve an LXC container's IP: live interfaces while running, else net0 config.
async fn proxmox_lxc_ip(client: &reqwest::Client, host: &str, port: u64, ticket: &str,
                        node: &str, vmid: &str, running: bool) -> Option<String> {
    let cookie = format!("PVEAuthCookie={}", ticket);
    if running {
        let url = format!("https://{}:{}/api2/json/nodes/{}/lxc/{}/interfaces", host, port, node, vmid);
        if let Ok(resp) = client.get(&url).header("Cookie", &cookie).send().await {
            if let Ok(data) = resp.json::<Value>().await {
                if let Some(ifaces) = data["data"].as_array() {
                    for iface in ifaces {
                        if iface["name"].as_str() == Some("lo") { continue; }
                        if let Some(inet) = iface["inet"].as_str() {
                            let ip = inet.split('/').next().unwrap_or("").trim();
                            if !ip.is_empty() && ip != "127.0.0.1" { return Some(ip.to_string()); }
                        }
                    }
                }
            }
        }
    }
    // Fallback: static net0 in the container config.
    let url = format!("https://{}:{}/api2/json/nodes/{}/lxc/{}/config", host, port, node, vmid);
    if let Ok(resp) = client.get(&url).header("Cookie", &cookie).send().await {
        if let Ok(data) = resp.json::<Value>().await {
            if let Some(s) = data["data"]["net0"].as_str() {
                return parse_proxmox_ip(s);
            }
        }
    }
    None
}

async fn discover_vmware(provider: &Provider) -> Result<Vec<DiscoveredHost>, String> {
    let config = &provider.config;
    let host = config.get("host").and_then(|v| v.as_str()).ok_or("Missing host")?;
    let username = config.get("username").and_then(|v| v.as_str()).ok_or("Missing username")?;
    let password = config.get("password").and_then(|v| v.as_str()).ok_or("Missing password")?;

    let client = reqwest::Client::builder()
        .danger_accept_invalid_certs(true)
        .build().map_err(|e| e.to_string())?;

    // Authenticate with vSphere REST API
    let session_url = format!("https://{}/api/session", host);
    let session_resp = client.post(&session_url)
        .basic_auth(username, Some(password))
        .send().await.map_err(|e| format!("VMware auth failed: {}", e))?;

    if !session_resp.status().is_success() {
        return Err("VMware authentication failed".to_string());
    }
    let session_id = session_resp.text().await.map_err(|e| e.to_string())?
        .trim_matches('"').to_string();

    // List VMs
    let vms_url = format!("https://{}/api/vcenter/vm", host);
    let vms_resp: Value = client.get(&vms_url)
        .header("vmware-api-session-id", &session_id)
        .send().await.map_err(|e| e.to_string())?
        .json().await.map_err(|e| e.to_string())?;

    let mut hosts = Vec::new();
    for vm in vms_resp.as_array().unwrap_or(&vec![]) {
        let vm_id = vm["vm"].as_str().unwrap_or("").to_string();
        let name = vm["name"].as_str().unwrap_or("").to_string();
        let power = vm["power_state"].as_str().unwrap_or("unknown");

        hosts.push(DiscoveredHost {
            id: String::new(),
            provider_id: provider.id.clone(),
            provider_host_id: vm_id,
            name,
            hostname: None,
            private_ip: None,
            public_ip: None,
            os_type: guess_os_from_name(vm["guest_OS"].as_str().unwrap_or("")),
            os_name: vm["guest_OS"].as_str().map(|s| s.to_string()),
            state: power.to_string(),
            metadata: Value::Object(Default::default()),
            tags: Value::Object(Default::default()),
            imported: false,
            connection_id: None,
        });
    }

    // Clean up session
    let _ = client.delete(&session_url)
        .header("vmware-api-session-id", &session_id)
        .send().await;

    Ok(hosts)
}

async fn discover_aws(provider: &Provider) -> Result<Vec<DiscoveredHost>, String> {
    let config = &provider.config;
    let region = config.get("region").and_then(|v| v.as_str()).unwrap_or("us-east-1");
    let access_key = config.get("accessKeyId").and_then(|v| v.as_str());
    let secret_key = config.get("secretAccessKey").and_then(|v| v.as_str());

    // If no credentials configured, try AWS CLI
    if access_key.is_none() || secret_key.is_none() {
        return discover_aws_cli(region, &provider.id).await;
    }

    // Use AWS CLI with explicit credentials via environment
    discover_aws_cli_with_creds(
        region, &provider.id,
        access_key.unwrap(), secret_key.unwrap(),
    ).await
}

async fn discover_aws_cli(region: &str, provider_id: &str) -> Result<Vec<DiscoveredHost>, String> {
    let output = tokio::process::Command::new("aws")
        .args(["ec2", "describe-instances", "--region", region, "--output", "json"])
        .output()
        .await
        .map_err(|e| format!("AWS CLI not found or failed: {}. Install AWS CLI and configure credentials.", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("AWS CLI error: {}", stderr));
    }

    parse_aws_instances(&output.stdout, provider_id)
}

async fn discover_aws_cli_with_creds(
    region: &str, provider_id: &str, access_key: &str, secret_key: &str,
) -> Result<Vec<DiscoveredHost>, String> {
    let output = tokio::process::Command::new("aws")
        .args(["ec2", "describe-instances", "--region", region, "--output", "json"])
        .env("AWS_ACCESS_KEY_ID", access_key)
        .env("AWS_SECRET_ACCESS_KEY", secret_key)
        .env("AWS_DEFAULT_REGION", region)
        .output()
        .await
        .map_err(|e| format!("AWS CLI failed: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("AWS error: {}", stderr));
    }

    parse_aws_instances(&output.stdout, provider_id)
}

fn parse_aws_instances(json_bytes: &[u8], provider_id: &str) -> Result<Vec<DiscoveredHost>, String> {
    let data: Value = serde_json::from_slice(json_bytes)
        .map_err(|e| format!("Failed to parse AWS response: {}", e))?;

    let mut hosts = Vec::new();

    if let Some(reservations) = data.get("Reservations").and_then(|v| v.as_array()) {
        for reservation in reservations {
            if let Some(instances) = reservation.get("Instances").and_then(|v| v.as_array()) {
                for instance in instances {
                    let instance_id = instance.get("InstanceId").and_then(|v| v.as_str()).unwrap_or("").to_string();
                    let state = instance.get("State").and_then(|s| s.get("Name")).and_then(|v| v.as_str()).unwrap_or("unknown");

                    // Get name from tags
                    let name = instance.get("Tags").and_then(|t| t.as_array())
                        .and_then(|tags| tags.iter().find(|t| t.get("Key").and_then(|k| k.as_str()) == Some("Name")))
                        .and_then(|t| t.get("Value").and_then(|v| v.as_str()))
                        .unwrap_or(&instance_id).to_string();

                    let private_ip = instance.get("PrivateIpAddress").and_then(|v| v.as_str()).map(|s| s.to_string());
                    let public_ip = instance.get("PublicIpAddress").and_then(|v| v.as_str()).map(|s| s.to_string());
                    let platform = instance.get("Platform").and_then(|v| v.as_str()).unwrap_or("");

                    // Build tags map
                    let mut tag_map = serde_json::Map::new();
                    if let Some(tags) = instance.get("Tags").and_then(|t| t.as_array()) {
                        for tag in tags {
                            if let (Some(k), Some(v)) = (tag.get("Key").and_then(|v| v.as_str()), tag.get("Value").and_then(|v| v.as_str())) {
                                tag_map.insert(k.to_string(), Value::String(v.to_string()));
                            }
                        }
                    }

                    hosts.push(DiscoveredHost {
                        id: String::new(),
                        provider_id: provider_id.to_string(),
                        provider_host_id: instance_id,
                        name,
                        hostname: public_ip.clone().or(private_ip.clone()),
                        private_ip,
                        public_ip,
                        os_type: if platform.to_lowercase().contains("windows") { "windows".to_string() } else { "linux".to_string() },
                        os_name: instance.get("ImageId").and_then(|v| v.as_str()).map(|s| s.to_string()),
                        state: state.to_string(),
                        metadata: serde_json::json!({
                            "instanceType": instance.get("InstanceType").and_then(|v| v.as_str()),
                            "vpcId": instance.get("VpcId").and_then(|v| v.as_str()),
                        }),
                        tags: Value::Object(tag_map),
                        imported: false,
                        connection_id: None,
                    });
                }
            }
        }
    }

    Ok(hosts)
}

async fn discover_azure(provider: &Provider) -> Result<Vec<DiscoveredHost>, String> {
    let config = &provider.config;
    let subscription_id = config.get("subscriptionId").and_then(|v| v.as_str())
        .ok_or("Missing Azure subscriptionId")?;
    let tenant_id = config.get("tenantId").and_then(|v| v.as_str())
        .ok_or("Missing Azure tenantId")?;
    let client_id = config.get("clientId").and_then(|v| v.as_str())
        .ok_or("Missing Azure clientId")?;
    let client_secret = config.get("clientSecret").and_then(|v| v.as_str())
        .ok_or("Missing Azure clientSecret")?;

    let client = reqwest::Client::new();

    // Get OAuth token
    let token_url = format!("https://login.microsoftonline.com/{}/oauth2/v2.0/token", tenant_id);
    let token_resp: Value = client.post(&token_url)
        .form(&[
            ("grant_type", "client_credentials"),
            ("client_id", client_id),
            ("client_secret", client_secret),
            ("scope", "https://management.azure.com/.default"),
        ])
        .send().await.map_err(|e| format!("Azure auth failed: {}", e))?
        .json().await.map_err(|e| e.to_string())?;

    let token = token_resp.get("access_token").and_then(|v| v.as_str())
        .ok_or("Failed to get Azure token")?;

    // List VMs
    let vms_url = format!(
        "https://management.azure.com/subscriptions/{}/providers/Microsoft.Compute/virtualMachines?api-version=2023-09-01",
        subscription_id
    );
    let vms_resp: Value = client.get(&vms_url)
        .bearer_auth(token)
        .send().await.map_err(|e| e.to_string())?
        .json().await.map_err(|e| e.to_string())?;

    let mut hosts = Vec::new();
    if let Some(vms) = vms_resp.get("value").and_then(|v| v.as_array()) {
        for vm in vms {
            let name = vm.get("name").and_then(|v| v.as_str()).unwrap_or("").to_string();
            let vm_id = vm.get("id").and_then(|v| v.as_str()).unwrap_or("").to_string();
            let location = vm.get("location").and_then(|v| v.as_str()).unwrap_or("");
            let os_type = vm.get("properties")
                .and_then(|p| p.get("storageProfile"))
                .and_then(|s| s.get("osDisk"))
                .and_then(|d| d.get("osType"))
                .and_then(|v| v.as_str())
                .unwrap_or("Linux");

            hosts.push(DiscoveredHost {
                id: String::new(),
                provider_id: provider.id.clone(),
                provider_host_id: vm_id,
                name: name.clone(),
                hostname: None,
                private_ip: None,
                public_ip: None,
                os_type: os_type.to_lowercase(),
                os_name: Some(os_type.to_string()),
                state: "running".to_string(),
                metadata: serde_json::json!({"location": location}),
                tags: vm.get("tags").cloned().unwrap_or(Value::Object(Default::default())),
                imported: false,
                connection_id: None,
            });
        }
    }

    Ok(hosts)
}

async fn discover_gcp(provider: &Provider) -> Result<Vec<DiscoveredHost>, String> {
    // GCP requires service account JSON key - complex OAuth2 flow
    // Use gcloud CLI if available
    let config = &provider.config;
    let project = config.get("projectId").and_then(|v| v.as_str())
        .ok_or("Missing GCP projectId")?;

    let output = tokio::process::Command::new("gcloud")
        .args(["compute", "instances", "list", "--project", project, "--format", "json"])
        .output()
        .await
        .map_err(|e| format!("gcloud CLI not found: {}. Install Google Cloud SDK.", e))?;

    if !output.status.success() {
        return Err(format!("gcloud error: {}", String::from_utf8_lossy(&output.stderr)));
    }

    let instances: Vec<Value> = serde_json::from_slice(&output.stdout)
        .map_err(|e| format!("Parse error: {}", e))?;

    let mut hosts = Vec::new();
    for inst in &instances {
        let name = inst.get("name").and_then(|v| v.as_str()).unwrap_or("").to_string();
        let status = inst.get("status").and_then(|v| v.as_str()).unwrap_or("UNKNOWN");
        let zone = inst.get("zone").and_then(|v| v.as_str()).unwrap_or("");

        // Get IPs from network interfaces
        let mut private_ip = None;
        let mut public_ip = None;
        if let Some(interfaces) = inst.get("networkInterfaces").and_then(|v| v.as_array()) {
            if let Some(iface) = interfaces.first() {
                private_ip = iface.get("networkIP").and_then(|v| v.as_str()).map(|s| s.to_string());
                if let Some(access_configs) = iface.get("accessConfigs").and_then(|v| v.as_array()) {
                    public_ip = access_configs.first()
                        .and_then(|c| c.get("natIP").and_then(|v| v.as_str()))
                        .map(|s| s.to_string());
                }
            }
        }

        hosts.push(DiscoveredHost {
            id: String::new(),
            provider_id: provider.id.clone(),
            provider_host_id: name.clone(),
            name: name.clone(),
            hostname: public_ip.clone().or(private_ip.clone()),
            private_ip, public_ip,
            os_type: "linux".to_string(),
            os_name: None,
            state: status.to_lowercase(),
            metadata: serde_json::json!({"zone": zone}),
            tags: inst.get("labels").cloned().unwrap_or(Value::Object(Default::default())),
            imported: false,
            connection_id: None,
        });
    }

    Ok(hosts)
}

async fn discover_bigfix(provider: &Provider) -> Result<Vec<DiscoveredHost>, String> {
    let config = &provider.config;
    let host = config.get("host").and_then(|v| v.as_str()).ok_or("Missing BigFix host")?;
    let port = config.get("port").and_then(|v| v.as_u64()).unwrap_or(52311);
    let username = config.get("username").and_then(|v| v.as_str()).ok_or("Missing username")?;
    let password = config.get("password").and_then(|v| v.as_str()).ok_or("Missing password")?;

    let client = reqwest::Client::builder()
        .danger_accept_invalid_certs(true)
        .timeout(std::time::Duration::from_secs(30))
        .build().map_err(|e| e.to_string())?;

    // Get list of computers
    let computers_url = format!("https://{}:{}/api/computers", host, port);
    let resp = client.get(&computers_url)
        .basic_auth(username, Some(password))
        .header("Accept", "application/json")
        .send().await.map_err(|e| format!("BigFix API failed: {}", e))?;

    if resp.status().as_u16() == 401 {
        return Err("Authentication failed. Check your AD credentials.".to_string());
    }
    if !resp.status().is_success() {
        return Err(format!("BigFix API error: {}", resp.status()));
    }

    let body = resp.text().await.map_err(|e| e.to_string())?;

    // BigFix can return XML or JSON - try JSON first
    let mut hosts = Vec::new();

    if let Ok(data) = serde_json::from_str::<Value>(&body) {
        // JSON response
        if let Some(computers) = data.as_array().or_else(|| data.get("computers").and_then(|v| v.as_array())) {
            for computer in computers {
                let id = computer.get("ID").or(computer.get("id"))
                    .and_then(|v| v.as_str().or(v.as_u64().map(|n| &*Box::leak(n.to_string().into_boxed_str()))))
                    .unwrap_or("0").to_string();
                let name = computer.get("ComputerName").or(computer.get("name"))
                    .and_then(|v| v.as_str()).unwrap_or(&id).to_string();

                hosts.push(DiscoveredHost {
                    id: String::new(),
                    provider_id: provider.id.clone(),
                    provider_host_id: id,
                    name: name.clone(),
                    hostname: computer.get("DNSName").and_then(|v| v.as_str()).map(|s| s.to_string()),
                    private_ip: computer.get("IPAddress").and_then(|v| v.as_str()).map(|s| s.to_string()),
                    public_ip: None,
                    os_type: guess_os_from_name(computer.get("OS").and_then(|v| v.as_str()).unwrap_or("")),
                    os_name: computer.get("OS").and_then(|v| v.as_str()).map(|s| s.to_string()),
                    state: "online".to_string(),
                    metadata: serde_json::json!({"source": "bigfix"}),
                    tags: Value::Object(Default::default()),
                    imported: false,
                    connection_id: None,
                });
            }
        }
    } else {
        // Try parsing as XML (BigFix default)
        // Simple XML extraction for computer IDs
        for line in body.lines() {
            if let Some(start) = line.find("<Computer ") {
                // Extract Resource URL and ID
                let segment = &line[start..];
                if let Some(id) = extract_xml_attr(segment, "ID") {
                    hosts.push(DiscoveredHost {
                        id: String::new(),
                        provider_id: provider.id.clone(),
                        provider_host_id: id.clone(),
                        name: format!("Computer-{}", id),
                        hostname: None,
                        private_ip: None,
                        public_ip: None,
                        os_type: "linux".to_string(),
                        os_name: None,
                        state: "unknown".to_string(),
                        metadata: serde_json::json!({"bigfixId": id}),
                        tags: Value::Object(Default::default()),
                        imported: false,
                        connection_id: None,
                    });
                }
            }
        }
    }

    Ok(hosts)
}

fn extract_xml_attr(s: &str, attr: &str) -> Option<String> {
    let pattern = format!("{}=\"", attr);
    s.find(&pattern).map(|start| {
        let value_start = start + pattern.len();
        let end = s[value_start..].find('"').unwrap_or(0) + value_start;
        s[value_start..end].to_string()
    })
}

fn guess_os_from_name(name: &str) -> String {
    let lower = name.to_lowercase();
    if lower.contains("windows") || lower.contains("win") {
        "windows".to_string()
    } else if lower.contains("esxi") || lower.contains("vmware") {
        "esxi".to_string()
    } else {
        "linux".to_string()
    }
}
