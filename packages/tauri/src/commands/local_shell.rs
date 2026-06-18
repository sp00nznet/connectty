use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::{Arc, OnceLock};
use tauri::{AppHandle, Emitter};
use tokio::sync::Mutex;
use portable_pty::{CommandBuilder, NativePtySystem, PtySize, PtySystem};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct LocalShellInfo {
    pub id: String,
    pub name: String,
    pub command: String,
    #[serde(default)]
    pub args: Vec<String>,
    pub icon: String,
    #[serde(default)]
    pub elevated: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct LocalShellEvent {
    #[serde(rename = "sessionId")]
    pub session_id: String,
    #[serde(rename = "type")]
    pub event_type: String,
    pub data: Option<String>,
    pub message: Option<String>,
    #[serde(rename = "exitCode")]
    pub exit_code: Option<u32>,
}

type WriterMap = Arc<Mutex<HashMap<String, Arc<Mutex<Box<dyn Write + Send>>>>>>;
type MasterMap = Arc<Mutex<HashMap<String, Box<dyn portable_pty::MasterPty + Send>>>>;

fn writers() -> &'static WriterMap {
    static INSTANCE: OnceLock<WriterMap> = OnceLock::new();
    INSTANCE.get_or_init(|| Arc::new(Mutex::new(HashMap::new())))
}

fn masters() -> &'static MasterMap {
    static INSTANCE: OnceLock<MasterMap> = OnceLock::new();
    INSTANCE.get_or_init(|| Arc::new(Mutex::new(HashMap::new())))
}

/// List available local shells
#[tauri::command]
pub async fn list_available_shells() -> Result<Vec<LocalShellInfo>, String> {
    let mut shells = Vec::new();

    #[cfg(target_os = "windows")]
    {
        let system_root = std::env::var("SYSTEMROOT").unwrap_or_else(|_| "C:\\Windows".to_string());

        let cmd_path = format!("{}\\System32\\cmd.exe", system_root);
        if std::path::Path::new(&cmd_path).exists() {
            shells.push(LocalShellInfo {
                id: "cmd".to_string(),
                name: "Command Prompt".to_string(),
                command: cmd_path,
                args: vec![],
                icon: "cmd".to_string(),
                elevated: false,
            });
        }

        let ps_path = format!("{}\\System32\\WindowsPowerShell\\v1.0\\powershell.exe", system_root);
        if std::path::Path::new(&ps_path).exists() {
            shells.push(LocalShellInfo {
                id: "powershell".to_string(),
                name: "Windows PowerShell".to_string(),
                command: ps_path,
                args: vec![],
                icon: "powershell".to_string(),
                elevated: false,
            });
        }

        if let Ok(pf) = std::env::var("PROGRAMFILES") {
            let pwsh_path = format!("{}\\PowerShell\\7\\pwsh.exe", pf);
            if std::path::Path::new(&pwsh_path).exists() {
                shells.push(LocalShellInfo {
                    id: "pwsh".to_string(),
                    name: "PowerShell 7".to_string(),
                    command: pwsh_path,
                    args: vec![],
                    icon: "powershell".to_string(),
                    elevated: false,
                });
            }
        }

        // WSL distributions
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        let wsl_path = format!("{}\\System32\\wsl.exe", system_root);
        if std::path::Path::new(&wsl_path).exists() {
            if let Ok(output) = std::process::Command::new(&wsl_path)
                .args(["--list", "--quiet"])
                .creation_flags(CREATE_NO_WINDOW) // don't flash a console window
                .output()
            {
                // WSL outputs UTF-16LE on Windows
                let stdout = decode_utf16le_or_utf8(&output.stdout);
                for line in stdout.lines() {
                    let distro = line.trim()
                        .replace('\0', "")
                        .replace('\u{feff}', "")
                        .replace('\u{fffe}', "");
                    // Filter non-printable chars
                    let distro: String = distro.chars()
                        .filter(|c| c.is_alphanumeric() || *c == ' ' || *c == '-' || *c == '_' || *c == '.')
                        .collect();
                    if distro.is_empty() || distro.contains("Windows Subsystem") {
                        continue;
                    }
                    shells.push(LocalShellInfo {
                        id: format!("wsl-{}", distro.to_lowercase().replace(' ', "-")),
                        name: format!("WSL: {}", distro),
                        command: wsl_path.clone(),
                        args: vec!["-d".to_string(), distro],
                        icon: "linux".to_string(),
                        elevated: false,
                    });
                }
            }
        }
    }

    #[cfg(target_os = "linux")]
    {
        if let Ok(contents) = std::fs::read_to_string("/etc/shells") {
            for line in contents.lines() {
                let line = line.trim();
                if line.is_empty() || line.starts_with('#') { continue; }
                if std::path::Path::new(line).exists() {
                    let name = std::path::Path::new(line).file_name()
                        .and_then(|n| n.to_str()).unwrap_or("shell");
                    let display = match name {
                        "bash" => "Bash", "zsh" => "Zsh", "fish" => "Fish", "sh" => "Shell",
                        other => other,
                    };
                    shells.push(LocalShellInfo {
                        id: name.to_string(), name: display.to_string(),
                        command: line.to_string(), args: vec![],
                        icon: "linux".to_string(), elevated: false,
                    });
                }
            }
        }
    }

    #[cfg(target_os = "macos")]
    {
        for (path, name) in &[("/bin/zsh", "Zsh"), ("/bin/bash", "Bash")] {
            if std::path::Path::new(path).exists() {
                let id = std::path::Path::new(path).file_name().unwrap().to_str().unwrap();
                shells.push(LocalShellInfo {
                    id: id.to_string(), name: name.to_string(),
                    command: path.to_string(), args: vec![],
                    icon: "terminal".to_string(), elevated: false,
                });
            }
        }
    }

    Ok(shells)
}

/// Spawn a local shell PTY session
#[tauri::command]
pub async fn spawn_local_shell(shell_id: String, app: AppHandle) -> Result<String, String> {
    let shells = list_available_shells().await?;
    let shell_info = shells.into_iter().find(|s| s.id == shell_id)
        .ok_or_else(|| format!("Shell '{}' not found", shell_id))?;

    let session_id = format!("local-{}-{:x}",
        std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_millis(),
        std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().subsec_nanos(),
    );

    let pty_system = NativePtySystem::default();

    let pair = pty_system.openpty(PtySize {
        rows: 24, cols: 80, pixel_width: 0, pixel_height: 0,
    }).map_err(|e| format!("Failed to open PTY: {}", e))?;

    let mut cmd = CommandBuilder::new(&shell_info.command);
    for arg in &shell_info.args {
        cmd.arg(arg);
    }
    cmd.env("TERM", "xterm-256color");
    cmd.env("COLORTERM", "truecolor");
    if let Some(home) = dirs::home_dir() {
        cmd.cwd(home);
    }

    let mut child = pair.slave.spawn_command(cmd)
        .map_err(|e| format!("Failed to spawn shell: {}", e))?;

    // Drop the slave - we only need the master side
    drop(pair.slave);

    let writer = pair.master.take_writer()
        .map_err(|e| format!("Failed to get PTY writer: {}", e))?;

    let mut reader = pair.master.try_clone_reader()
        .map_err(|e| format!("Failed to get PTY reader: {}", e))?;

    // Store writer and master
    writers().lock().await.insert(session_id.clone(), Arc::new(Mutex::new(writer)));
    masters().lock().await.insert(session_id.clone(), pair.master);

    // Spawn reader thread
    let sid_reader = session_id.clone();
    let app_reader = app.clone();
    std::thread::spawn(move || {
        let mut buf = [0u8; 4096];
        loop {
            match reader.read(&mut buf) {
                Ok(0) => break,
                Ok(n) => {
                    let data = String::from_utf8_lossy(&buf[..n]).to_string();
                    let _ = app_reader.emit("localShell:event", LocalShellEvent {
                        session_id: sid_reader.clone(),
                        event_type: "data".to_string(),
                        data: Some(data),
                        message: None,
                        exit_code: None,
                    });
                }
                Err(_) => break,
            }
        }
    });

    // Spawn exit watcher thread
    let sid_exit = session_id.clone();
    let app_exit = app.clone();
    let writers_ref = writers().clone();
    let masters_ref = masters().clone();
    std::thread::spawn(move || {
        let status = child.wait();
        let exit_code = status.ok().map(|s| s.exit_code());

        let _ = app_exit.emit("localShell:event", LocalShellEvent {
            session_id: sid_exit.clone(),
            event_type: "close".to_string(),
            data: None,
            message: None,
            exit_code,
        });

        // Clean up
        let rt = tokio::runtime::Builder::new_current_thread()
            .enable_all().build().unwrap();
        rt.block_on(async {
            writers_ref.lock().await.remove(&sid_exit);
            masters_ref.lock().await.remove(&sid_exit);
        });
    });

    Ok(session_id)
}

/// Write data to a local shell session
#[tauri::command]
pub async fn write_local_shell(session_id: String, data: String) -> Result<(), String> {
    let map = writers().lock().await;
    let writer = map.get(&session_id)
        .ok_or_else(|| format!("Session '{}' not found", session_id))?
        .clone();
    drop(map);

    let mut w = writer.lock().await;
    w.write_all(data.as_bytes()).map_err(|e| format!("Write failed: {}", e))?;
    w.flush().map_err(|e| format!("Flush failed: {}", e))?;
    Ok(())
}

/// Resize a local shell session's PTY
#[tauri::command]
pub async fn resize_local_shell(session_id: String, cols: u32, rows: u32) -> Result<(), String> {
    let mut map = masters().lock().await;
    let master = map.get_mut(&session_id)
        .ok_or_else(|| format!("Session '{}' not found", session_id))?;
    master.resize(PtySize {
        rows: rows as u16, cols: cols as u16, pixel_width: 0, pixel_height: 0,
    }).map_err(|e| format!("Resize failed: {}", e))?;
    Ok(())
}

/// Kill a local shell session
#[tauri::command]
pub async fn kill_local_shell(session_id: String) -> Result<(), String> {
    writers().lock().await.remove(&session_id);
    masters().lock().await.remove(&session_id);
    Ok(())
}

/// Decode bytes as UTF-16LE if it looks like it, otherwise UTF-8
#[cfg(target_os = "windows")]
fn decode_utf16le_or_utf8(bytes: &[u8]) -> String {
    // Check for UTF-16LE BOM or null bytes in even positions (strong indicator)
    let is_utf16 = bytes.len() >= 2
        && (bytes[0] == 0xFF && bytes[1] == 0xFE  // BOM
            || (bytes.len() >= 4 && bytes[1] == 0 && bytes[3] == 0)); // null bytes at odd positions

    if is_utf16 {
        let u16s: Vec<u16> = bytes.chunks_exact(2)
            .map(|chunk| u16::from_le_bytes([chunk[0], chunk[1]]))
            .collect();
        String::from_utf16_lossy(&u16s)
    } else {
        String::from_utf8_lossy(bytes).to_string()
    }
}
