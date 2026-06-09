//! AI session monitoring.
//!
//! Watches local agent-CLI session logs and exposes them to the UI:
//!   - Claude Code: ~/.claude/projects/<project>/<sessionId>.jsonl
//!   - Copilot CLI: ~/.copilot/session-state/   (discovered if present)
//!
//! Each JSONL file is an append-only event stream. We parse it to derive a
//! session summary (title, cwd, branch, message/tool counts, last activity)
//! and infer a coarse status from the file's modification time. A filesystem
//! watcher re-scans (debounced) and pushes the fresh list to the frontend via
//! the `ai:sessions` event. Resuming a session is handled on the frontend by
//! spawning a shell and running `claude --resume <id>`.

use serde::Serialize;
use std::path::{Path, PathBuf};
use std::sync::OnceLock;
use tauri::{AppHandle, Emitter};

/// A session is considered "active" if its log was touched this recently.
const ACTIVE_WINDOW_MS: u64 = 15_000;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AiSession {
    pub id: String,
    pub agent: String, // "claude" | "copilot"
    pub title: String,
    pub project: String,
    pub cwd: String,
    pub git_branch: Option<String>,
    pub message_count: u32,
    pub tool_count: u32,
    pub last_prompt: Option<String>,
    pub last_activity: Option<String>, // ISO timestamp from the log
    pub last_activity_ms: u64,         // file mtime (epoch ms), for sort/status
    pub status: String,                // "active" | "idle"
    pub file_path: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AiPromptMatch {
    pub session_id: String,
    pub title: String,
    pub project: String,
    pub cwd: String,
    pub agent: String,
    pub file_path: String,
    pub snippet: String,
    pub timestamp: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AiTranscriptEntry {
    pub role: String, // "user" | "assistant"
    pub text: String,
    pub timestamp: Option<String>,
}

fn claude_projects_dir() -> Option<PathBuf> {
    dirs::home_dir().map(|h| h.join(".claude").join("projects"))
}

fn copilot_state_dir() -> Option<PathBuf> {
    dirs::home_dir().map(|h| h.join(".copilot").join("session-state"))
}

/// Best-effort Copilot CLI session parser. The on-disk schema isn't documented
/// here and there's no local sample to validate against, so this pulls fields
/// by common key names and degrades gracefully (no panics, no effect on the
/// Claude path) when the shape differs.
fn parse_copilot_file(path: &Path) -> Option<AiSession> {
    let meta = std::fs::metadata(path).ok()?;
    if !meta.is_file() {
        return None;
    }
    let content = std::fs::read_to_string(path).ok()?;
    let id = path.file_stem()?.to_string_lossy().to_string();
    let mut cwd = String::new();
    let mut title: Option<String> = None;
    let mut message_count = 0u32;

    let mut glean = |v: &serde_json::Value| {
        if cwd.is_empty() {
            for key in ["cwd", "workingDirectory", "directory", "workspace", "folder"] {
                if let Some(s) = v.get(key).and_then(|x| x.as_str()) {
                    if !s.is_empty() {
                        cwd = s.to_string();
                        break;
                    }
                }
            }
        }
        if title.is_none() {
            for key in ["title", "summary", "name", "description"] {
                if let Some(s) = v.get(key).and_then(|x| x.as_str()) {
                    if !s.is_empty() {
                        title = Some(s.to_string());
                        break;
                    }
                }
            }
        }
    };

    if let Ok(v) = serde_json::from_str::<serde_json::Value>(&content) {
        // Whole-file JSON object/array.
        glean(&v);
        if let Some(arr) = v.get("messages").and_then(|x| x.as_array()) {
            message_count = arr.len() as u32;
        }
    } else {
        // JSONL event stream.
        for line in content.lines() {
            if line.trim().is_empty() {
                continue;
            }
            if let Ok(v) = serde_json::from_str::<serde_json::Value>(line) {
                glean(&v);
                message_count += 1;
            }
        }
    }

    let mtime_ms = meta
        .modified()
        .ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0);
    let status = if now_ms().saturating_sub(mtime_ms) < ACTIVE_WINDOW_MS {
        "active"
    } else {
        "idle"
    };
    let project = if !cwd.is_empty() {
        Path::new(&cwd)
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_else(|| cwd.clone())
    } else {
        "copilot".to_string()
    };

    Some(AiSession {
        id,
        agent: "copilot".to_string(),
        title: title.unwrap_or_else(|| "Copilot session".to_string()),
        project,
        cwd,
        git_branch: None,
        message_count,
        tool_count: 0,
        last_prompt: None,
        last_activity: None,
        last_activity_ms: mtime_ms,
        status: status.to_string(),
        file_path: path.to_string_lossy().to_string(),
    })
}

fn scan_copilot() -> Vec<AiSession> {
    let mut out = Vec::new();
    if let Some(dir) = copilot_state_dir() {
        if let Ok(entries) = std::fs::read_dir(&dir) {
            for e in entries.flatten() {
                let p = e.path();
                if p.is_file() {
                    if let Some(s) = parse_copilot_file(&p) {
                        out.push(s);
                    }
                }
            }
        }
    }
    out
}

fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

/// Pull readable text out of a message `content` field, which may be a bare
/// string or an array of typed blocks (text / tool_use / tool_result).
fn extract_text(content: &serde_json::Value) -> String {
    if let Some(s) = content.as_str() {
        return s.to_string();
    }
    if let Some(arr) = content.as_array() {
        let mut parts = Vec::new();
        for b in arr {
            match b.get("type").and_then(|x| x.as_str()) {
                Some("text") => {
                    if let Some(t) = b.get("text").and_then(|x| x.as_str()) {
                        parts.push(t.to_string());
                    }
                }
                Some("tool_use") => {
                    let name = b.get("name").and_then(|x| x.as_str()).unwrap_or("tool");
                    parts.push(format!("[tool: {}]", name));
                }
                Some("tool_result") => parts.push("[tool result]".to_string()),
                _ => {}
            }
        }
        return parts.join("\n");
    }
    String::new()
}

/// Parse one Claude Code session log into a summary.
fn parse_session_file(path: &Path) -> Option<AiSession> {
    let content = std::fs::read_to_string(path).ok()?;
    let mut session_id = path.file_stem()?.to_string_lossy().to_string();
    let mut cwd = String::new();
    let mut git_branch: Option<String> = None;
    let mut title: Option<String> = None;
    let mut first_prompt: Option<String> = None;
    let mut last_prompt: Option<String> = None;
    let mut last_ts: Option<String> = None;
    let mut message_count = 0u32;
    let mut tool_count = 0u32;

    for line in content.lines() {
        if line.trim().is_empty() {
            continue;
        }
        let v: serde_json::Value = match serde_json::from_str(line) {
            Ok(v) => v,
            Err(_) => continue,
        };
        if let Some(sid) = v.get("sessionId").and_then(|x| x.as_str()) {
            session_id = sid.to_string();
        }
        if let Some(c) = v.get("cwd").and_then(|x| x.as_str()) {
            if !c.is_empty() {
                cwd = c.to_string();
            }
        }
        if let Some(b) = v.get("gitBranch").and_then(|x| x.as_str()) {
            if !b.is_empty() {
                git_branch = Some(b.to_string());
            }
        }
        match v.get("type").and_then(|x| x.as_str()).unwrap_or("") {
            "ai-title" => {
                if let Some(s) = v.get("aiTitle").and_then(|x| x.as_str()) {
                    title = Some(s.to_string());
                }
            }
            "last-prompt" => {
                if let Some(s) = v.get("lastPrompt").and_then(|x| x.as_str()) {
                    last_prompt = Some(s.to_string());
                }
            }
            "user" => {
                message_count += 1;
                if let Some(ts) = v.get("timestamp").and_then(|x| x.as_str()) {
                    last_ts = Some(ts.to_string());
                }
                if first_prompt.is_none() {
                    let txt = v
                        .pointer("/message/content")
                        .map(extract_text)
                        .unwrap_or_default();
                    let txt = txt.trim();
                    if !txt.is_empty() {
                        first_prompt = Some(txt.chars().take(120).collect());
                    }
                }
            }
            "assistant" => {
                message_count += 1;
                if let Some(ts) = v.get("timestamp").and_then(|x| x.as_str()) {
                    last_ts = Some(ts.to_string());
                }
                if let Some(blocks) = v.pointer("/message/content").and_then(|x| x.as_array()) {
                    for block in blocks {
                        if block.get("type").and_then(|x| x.as_str()) == Some("tool_use") {
                            tool_count += 1;
                        }
                    }
                }
            }
            _ => {}
        }
    }

    let mtime_ms = std::fs::metadata(path)
        .ok()
        .and_then(|m| m.modified().ok())
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0);

    let status = if now_ms().saturating_sub(mtime_ms) < ACTIVE_WINDOW_MS {
        "active"
    } else {
        "idle"
    };

    let project = if !cwd.is_empty() {
        Path::new(&cwd)
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_else(|| cwd.clone())
    } else {
        path.parent()
            .and_then(|p| p.file_name())
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_default()
    };

    let title = title
        .or_else(|| first_prompt.clone())
        .or_else(|| last_prompt.clone())
        .unwrap_or_else(|| "Untitled session".to_string());

    Some(AiSession {
        id: session_id,
        agent: "claude".to_string(),
        title,
        project,
        cwd,
        git_branch,
        message_count,
        tool_count,
        last_prompt,
        last_activity: last_ts,
        last_activity_ms: mtime_ms,
        status: status.to_string(),
        file_path: path.to_string_lossy().to_string(),
    })
}

/// Scan every Claude Code project for session logs, newest first.
fn scan_all() -> Vec<AiSession> {
    let mut out = Vec::new();
    if let Some(dir) = claude_projects_dir() {
        if let Ok(projects) = std::fs::read_dir(&dir) {
            for proj in projects.flatten() {
                let p = proj.path();
                if !p.is_dir() {
                    continue;
                }
                if let Ok(files) = std::fs::read_dir(&p) {
                    for f in files.flatten() {
                        let fp = f.path();
                        if fp.extension().and_then(|e| e.to_str()) == Some("jsonl") {
                            if let Some(s) = parse_session_file(&fp) {
                                out.push(s);
                            }
                        }
                    }
                }
            }
        }
    }
    out.extend(scan_copilot());
    out.sort_by(|a, b| b.last_activity_ms.cmp(&a.last_activity_ms));
    out
}

/// Return the current list of AI sessions (one-shot, for initial load).
#[tauri::command]
pub async fn ai_sessions_list() -> Result<Vec<AiSession>, String> {
    Ok(scan_all())
}

/// Search user prompts across every session, returning matches (AND over
/// whitespace-separated terms) with session context and a snippet.
#[tauri::command]
pub async fn ai_search_prompts(query: String) -> Result<Vec<AiPromptMatch>, String> {
    let q = query.trim().to_lowercase();
    if q.is_empty() {
        return Ok(vec![]);
    }
    let terms: Vec<String> = q.split_whitespace().map(|s| s.to_string()).collect();
    let mut out = Vec::new();

    let dir = match claude_projects_dir() {
        Some(d) => d,
        None => return Ok(out),
    };
    let projects = match std::fs::read_dir(&dir) {
        Ok(p) => p,
        Err(_) => return Ok(out),
    };
    for proj in projects.flatten() {
        let p = proj.path();
        if !p.is_dir() {
            continue;
        }
        let files = match std::fs::read_dir(&p) {
            Ok(f) => f,
            Err(_) => continue,
        };
        for f in files.flatten() {
            let fp = f.path();
            if fp.extension().and_then(|e| e.to_str()) != Some("jsonl") {
                continue;
            }
            let content = match std::fs::read_to_string(&fp) {
                Ok(c) => c,
                Err(_) => continue,
            };
            let mut session_id = fp
                .file_stem()
                .map(|s| s.to_string_lossy().to_string())
                .unwrap_or_default();
            let mut cwd = String::new();
            let mut title: Option<String> = None;
            let mut first: Option<String> = None;
            let mut hits: Vec<(String, Option<String>)> = Vec::new();

            for line in content.lines() {
                if line.trim().is_empty() {
                    continue;
                }
                let v: serde_json::Value = match serde_json::from_str(line) {
                    Ok(v) => v,
                    Err(_) => continue,
                };
                if let Some(s) = v.get("sessionId").and_then(|x| x.as_str()) {
                    session_id = s.to_string();
                }
                if let Some(c) = v.get("cwd").and_then(|x| x.as_str()) {
                    if !c.is_empty() {
                        cwd = c.to_string();
                    }
                }
                match v.get("type").and_then(|x| x.as_str()).unwrap_or("") {
                    "ai-title" => {
                        if let Some(s) = v.get("aiTitle").and_then(|x| x.as_str()) {
                            title = Some(s.to_string());
                        }
                    }
                    "user" => {
                        let txt = v
                            .pointer("/message/content")
                            .map(extract_text)
                            .unwrap_or_default();
                        let trimmed = txt.trim();
                        if first.is_none() && !trimmed.is_empty() {
                            first = Some(trimmed.chars().take(60).collect());
                        }
                        let low = txt.to_lowercase();
                        if terms.iter().all(|t| low.contains(t.as_str())) && !trimmed.is_empty() {
                            let snippet: String = trimmed.chars().take(200).collect();
                            let ts = v
                                .get("timestamp")
                                .and_then(|x| x.as_str())
                                .map(|s| s.to_string());
                            hits.push((snippet, ts));
                        }
                    }
                    _ => {}
                }
            }

            if hits.is_empty() {
                continue;
            }
            let project = if !cwd.is_empty() {
                Path::new(&cwd)
                    .file_name()
                    .map(|n| n.to_string_lossy().to_string())
                    .unwrap_or_else(|| cwd.clone())
            } else {
                p.file_name()
                    .map(|n| n.to_string_lossy().to_string())
                    .unwrap_or_default()
            };
            let title = title
                .or(first)
                .unwrap_or_else(|| "Untitled session".to_string());
            for (snippet, timestamp) in hits {
                out.push(AiPromptMatch {
                    session_id: session_id.clone(),
                    title: title.clone(),
                    project: project.clone(),
                    cwd: cwd.clone(),
                    agent: "claude".to_string(),
                    file_path: fp.to_string_lossy().to_string(),
                    snippet,
                    timestamp,
                });
            }
        }
    }
    out.truncate(300);
    Ok(out)
}

/// Return the readable transcript (user prompts + assistant replies) for a
/// session log at the given path.
#[tauri::command]
pub async fn ai_session_transcript(file_path: String) -> Result<Vec<AiTranscriptEntry>, String> {
    let content =
        std::fs::read_to_string(&file_path).map_err(|e| format!("Failed to read log: {}", e))?;
    let mut entries = Vec::new();
    for line in content.lines() {
        if line.trim().is_empty() {
            continue;
        }
        let v: serde_json::Value = match serde_json::from_str(line) {
            Ok(v) => v,
            Err(_) => continue,
        };
        let role = match v.get("type").and_then(|x| x.as_str()) {
            Some("user") => "user",
            Some("assistant") => "assistant",
            _ => continue,
        };
        let text = v
            .pointer("/message/content")
            .map(extract_text)
            .unwrap_or_default();
        let text = text.trim();
        if text.is_empty() {
            continue;
        }
        entries.push(AiTranscriptEntry {
            role: role.to_string(),
            text: text.to_string(),
            timestamp: v
                .get("timestamp")
                .and_then(|x| x.as_str())
                .map(|s| s.to_string()),
        });
    }
    Ok(entries)
}

/// Begin watching the Claude projects directory and push session-list updates
/// to the frontend via the `ai:sessions` event. Idempotent.
#[tauri::command]
pub fn ai_sessions_watch_start(app: AppHandle) -> Result<(), String> {
    static STARTED: OnceLock<()> = OnceLock::new();
    if STARTED.set(()).is_err() {
        return Ok(()); // already watching
    }

    let dir = match claude_projects_dir() {
        Some(d) => d,
        None => return Ok(()), // no home dir; nothing to watch
    };
    std::fs::create_dir_all(&dir).ok();

    std::thread::spawn(move || {
        use notify::{RecursiveMode, Watcher};

        // Emit an initial snapshot immediately.
        let _ = app.emit("ai:sessions", scan_all());

        let (tx, rx) = std::sync::mpsc::channel();
        let mut watcher = match notify::recommended_watcher(move |res| {
            let _ = tx.send(res);
        }) {
            Ok(w) => w,
            Err(e) => {
                log::warn!("ai_sessions: failed to create watcher: {}", e);
                return;
            }
        };
        if let Err(e) = watcher.watch(&dir, RecursiveMode::Recursive) {
            log::warn!("ai_sessions: failed to watch {:?}: {}", dir, e);
            return;
        }
        // Also watch the Copilot session-state dir if it exists.
        if let Some(copilot) = copilot_state_dir() {
            if copilot.exists() {
                let _ = watcher.watch(&copilot, RecursiveMode::Recursive);
            }
        }

        // Debounce: on any event, drain the burst over a short window, then
        // re-scan once and emit.
        loop {
            match rx.recv() {
                Ok(_) => {
                    while rx
                        .recv_timeout(std::time::Duration::from_millis(400))
                        .is_ok()
                    {}
                    let _ = app.emit("ai:sessions", scan_all());
                }
                Err(_) => break,
            }
        }
    });

    Ok(())
}
