use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::{Arc, OnceLock};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, State};
use tokio::sync::Mutex;
use crate::AppState;

#[derive(Debug, Clone, Serialize)]
pub struct SerialEvent {
    #[serde(rename = "sessionId")]
    pub session_id: String,
    #[serde(rename = "type")]
    pub event_type: String,
    pub data: Option<String>,
    pub message: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SerialPortInfo {
    pub path: String,
    pub manufacturer: Option<String>,
}

type SerialWriterMap = Arc<Mutex<HashMap<String, Arc<Mutex<Box<dyn Write + Send>>>>>>;

fn serial_writers() -> &'static SerialWriterMap {
    static INSTANCE: OnceLock<SerialWriterMap> = OnceLock::new();
    INSTANCE.get_or_init(|| Arc::new(Mutex::new(HashMap::new())))
}

#[tauri::command]
pub async fn serial_list_ports() -> Result<Vec<SerialPortInfo>, String> {
    let ports = serialport::available_ports().map_err(|e| format!("Failed to list ports: {}", e))?;
    Ok(ports.into_iter().map(|p| SerialPortInfo {
        path: p.port_name,
        manufacturer: match p.port_type {
            serialport::SerialPortType::UsbPort(info) => info.manufacturer,
            _ => None,
        },
    }).collect())
}

#[tauri::command]
pub async fn serial_connect(
    connection_id: String,
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<String, String> {
    let session_id = format!("serial-{}-{:x}",
        std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_millis(),
        std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().subsec_nanos(),
    );

    let db = state.db.lock().await;
    let connection = db.get_connection(&connection_id).map_err(|e| e.to_string())?;
    drop(db);

    // Parse serial settings from connection
    let (device, baud_rate) = if let Some(ref settings) = connection.serial_settings {
        let device = settings.get("device").and_then(|v| v.as_str()).unwrap_or(&connection.hostname);
        let baud = settings.get("baudRate").and_then(|v| v.as_u64()).unwrap_or(9600) as u32;
        (device.to_string(), baud)
    } else {
        (connection.hostname.clone(), 9600)
    };

    let port = serialport::new(&device, baud_rate)
        .timeout(std::time::Duration::from_millis(100))
        .open()
        .map_err(|e| format!("Failed to open serial port {}: {}", device, e))?;

    let mut reader = port.try_clone().map_err(|e| format!("Clone failed: {}", e))?;
    let writer: Box<dyn Write + Send> = Box::new(port);

    serial_writers().lock().await.insert(session_id.clone(), Arc::new(Mutex::new(writer)));

    // Spawn reader thread
    let sid = session_id.clone();
    let app_reader = app.clone();
    std::thread::spawn(move || {
        let mut buf = [0u8; 1024];
        loop {
            match reader.read(&mut buf) {
                Ok(0) => break,
                Ok(n) => {
                    let data = String::from_utf8_lossy(&buf[..n]).to_string();
                    let _ = app_reader.emit("serial:event", SerialEvent {
                        session_id: sid.clone(),
                        event_type: "data".to_string(),
                        data: Some(data),
                        message: None,
                    });
                }
                Err(ref e) if e.kind() == std::io::ErrorKind::TimedOut => continue,
                Err(_) => break,
            }
        }

        let _ = app_reader.emit("serial:event", SerialEvent {
            session_id: sid.clone(),
            event_type: "close".to_string(),
            data: None,
            message: None,
        });
    });

    Ok(session_id)
}

#[tauri::command]
pub async fn serial_disconnect(session_id: String) -> Result<(), String> {
    serial_writers().lock().await.remove(&session_id);
    Ok(())
}

#[tauri::command]
pub async fn serial_write(session_id: String, data: String) -> Result<(), String> {
    let map = serial_writers().lock().await;
    let writer = map.get(&session_id).ok_or("Serial session not found")?.clone();
    drop(map);

    let mut w = writer.lock().await;
    w.write_all(data.as_bytes()).map_err(|e| format!("Write failed: {}", e))?;
    w.flush().map_err(|e| format!("Flush failed: {}", e))?;
    Ok(())
}
