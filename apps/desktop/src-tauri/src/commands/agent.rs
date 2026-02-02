use crate::sidecar::{SidecarEvent, SidecarManager};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tauri::{AppHandle, Emitter, Manager, State};
use tokio::sync::Mutex;

// Re-export types from the shared module for frontend use
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionInfo {
    pub id: String,
    pub title: Option<String>,
    pub working_directory: String,
    pub model: String,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionSummary {
    pub id: String,
    pub title: Option<String>,
    pub working_directory: Option<String>,
    pub model: Option<String>,
    pub message_count: u32,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionDetails {
    pub id: String,
    pub title: Option<String>,
    pub working_directory: Option<String>,
    pub model: Option<String>,
    pub messages: Vec<Message>,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Message {
    pub id: String,
    pub session_id: String,
    pub role: String,
    pub content: String,
    pub attachments: Option<Vec<Attachment>>,
    pub tool_calls: Option<serde_json::Value>,
    pub created_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Attachment {
    #[serde(rename = "type")]
    pub attachment_type: String,
    pub name: String,
    pub path: Option<String>,
    pub mime_type: Option<String>,
    pub data: Option<String>, // base64 encoded for inline data
    pub size: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PermissionDecision {
    pub allow: bool,
    pub remember: Option<bool>,
    pub scope: Option<String>, // 'once', 'session', 'always'
}

/// State wrapper for the sidecar manager
pub struct AgentState {
    pub manager: Arc<Mutex<SidecarManager>>,
}

impl AgentState {
    pub fn new() -> Self {
        Self {
            manager: Arc::new(Mutex::new(SidecarManager::new())),
        }
    }
}

impl Default for AgentState {
    fn default() -> Self {
        Self::new()
    }
}

/// Ensure sidecar is started and set up event forwarding
async fn ensure_sidecar_started(
    app: &AppHandle,
    state: &State<'_, AgentState>,
) -> Result<(), String> {
    eprintln!("[ensure_sidecar] getting manager lock...");
    let manager = state.manager.lock().await;
    eprintln!("[ensure_sidecar] got manager lock, checking if running...");

    if !manager.is_running().await {
        eprintln!("[ensure_sidecar] sidecar not running, starting...");
        // Get app data directory
        let app_data_dir = app
            .path()
            .app_data_dir()
            .map_err(|e| format!("Failed to get app data dir: {}", e))?;

        let app_data_str = app_data_dir
            .to_str()
            .ok_or("Invalid app data path")?
            .to_string();

        eprintln!("[ensure_sidecar] starting sidecar with app_data_dir: {}", app_data_str);
        manager.start(&app_data_str).await?;
        eprintln!("[ensure_sidecar] sidecar started");

        // Set up event forwarding to frontend
        let app_handle = app.clone();
        manager
            .set_event_handler(move |event: SidecarEvent| {
                // Forward event to frontend
                let event_name = format!("agent:{}", event.event_type);
                // CRITICAL: Log errors instead of silently discarding them
                // Silent errors make debugging impossible when events fail to emit
                if let Err(e) = app_handle.emit(&event_name, &event) {
                    eprintln!("[event] Failed to emit {}: {}", event_name, e);
                }
            })
            .await;
        eprintln!("[ensure_sidecar] event handler set up");

        // Get API key from keychain and set it on the sidecar
        eprintln!("[ensure_sidecar] getting API key from keychain...");
        if let Ok(Some(api_key)) = crate::commands::auth::get_api_key().await {
            eprintln!("[ensure_sidecar] got API key, setting on sidecar...");
            let params = serde_json::json!({ "apiKey": api_key });
            if let Err(e) = manager.send_command("set_api_key", params).await {
                eprintln!("Warning: Failed to set API key on sidecar: {}", e);
            }
            eprintln!("[ensure_sidecar] API key set on sidecar");
        } else {
            eprintln!("[ensure_sidecar] no API key found in keychain");
        }
    } else {
        eprintln!("[ensure_sidecar] sidecar already running");
    }

    eprintln!("[ensure_sidecar] done");
    Ok(())
}

/// Set the API key for the agent
#[tauri::command]
pub async fn agent_set_api_key(
    app: AppHandle,
    state: State<'_, AgentState>,
    api_key: String,
) -> Result<(), String> {
    ensure_sidecar_started(&app, &state).await?;

    let manager = state.manager.lock().await;
    let params = serde_json::json!({ "apiKey": api_key });

    manager.send_command("set_api_key", params).await?;
    Ok(())
}

/// Create a new session
#[tauri::command]
pub async fn agent_create_session(
    app: AppHandle,
    state: State<'_, AgentState>,
    working_directory: String,
    model: Option<String>,
) -> Result<SessionInfo, String> {
    ensure_sidecar_started(&app, &state).await?;

    let manager = state.manager.lock().await;
    let params = serde_json::json!({
        "workingDirectory": working_directory,
        "model": model,
    });

    let result = manager.send_command("create_session", params).await?;
    serde_json::from_value(result).map_err(|e| format!("Failed to parse session info: {}", e))
}

/// Send a message in a session
#[tauri::command]
pub async fn agent_send_message(
    app: AppHandle,
    state: State<'_, AgentState>,
    session_id: String,
    content: String,
    attachments: Option<Vec<Attachment>>,
) -> Result<(), String> {
    ensure_sidecar_started(&app, &state).await?;

    let manager = state.manager.lock().await;
    let params = serde_json::json!({
        "sessionId": session_id,
        "content": content,
        "attachments": attachments,
    });

    manager.send_command("send_message", params).await?;
    Ok(())
}

/// Respond to a permission request
#[tauri::command]
pub async fn agent_respond_permission(
    app: AppHandle,
    state: State<'_, AgentState>,
    session_id: String,
    permission_id: String,
    decision: PermissionDecision,
) -> Result<(), String> {
    ensure_sidecar_started(&app, &state).await?;

    let manager = state.manager.lock().await;
    let params = serde_json::json!({
        "sessionId": session_id,
        "permissionId": permission_id,
        "decision": decision,
    });

    manager.send_command("respond_permission", params).await?;
    Ok(())
}

/// Stop generation in a session
#[tauri::command]
pub async fn agent_stop_generation(
    app: AppHandle,
    state: State<'_, AgentState>,
    session_id: String,
) -> Result<(), String> {
    ensure_sidecar_started(&app, &state).await?;

    let manager = state.manager.lock().await;
    let params = serde_json::json!({
        "sessionId": session_id,
    });

    manager.send_command("stop_generation", params).await?;
    Ok(())
}

/// List all sessions
#[tauri::command]
pub async fn agent_list_sessions(
    app: AppHandle,
    state: State<'_, AgentState>,
) -> Result<Vec<SessionSummary>, String> {
    eprintln!("[agent] agent_list_sessions called");
    ensure_sidecar_started(&app, &state).await?;
    eprintln!("[agent] sidecar started, getting manager lock...");

    let manager = state.manager.lock().await;
    eprintln!("[agent] got manager lock, sending list_sessions command...");
    let result = manager
        .send_command("list_sessions", serde_json::json!({}))
        .await?;
    eprintln!("[agent] got result from list_sessions: {:?}", result);

    serde_json::from_value(result).map_err(|e| format!("Failed to parse sessions: {}", e))
}

/// Get a specific session with messages
#[tauri::command]
pub async fn agent_get_session(
    app: AppHandle,
    state: State<'_, AgentState>,
    session_id: String,
) -> Result<SessionDetails, String> {
    ensure_sidecar_started(&app, &state).await?;

    let manager = state.manager.lock().await;
    let params = serde_json::json!({
        "sessionId": session_id,
    });

    let result = manager.send_command("get_session", params).await?;
    serde_json::from_value(result).map_err(|e| format!("Failed to parse session: {}", e))
}

/// Delete a session
#[tauri::command]
pub async fn agent_delete_session(
    app: AppHandle,
    state: State<'_, AgentState>,
    session_id: String,
) -> Result<(), String> {
    ensure_sidecar_started(&app, &state).await?;

    let manager = state.manager.lock().await;
    let params = serde_json::json!({
        "sessionId": session_id,
    });

    manager.send_command("delete_session", params).await?;
    Ok(())
}

/// Update session title
#[tauri::command]
pub async fn agent_update_session_title(
    app: AppHandle,
    state: State<'_, AgentState>,
    session_id: String,
    title: String,
) -> Result<(), String> {
    ensure_sidecar_started(&app, &state).await?;

    let manager = state.manager.lock().await;
    let params = serde_json::json!({
        "sessionId": session_id,
        "title": title,
    });

    manager.send_command("update_session_title", params).await?;
    Ok(())
}

/// Update session working directory
#[tauri::command]
pub async fn agent_update_session_working_directory(
    app: AppHandle,
    state: State<'_, AgentState>,
    session_id: String,
    working_directory: String,
) -> Result<(), String> {
    ensure_sidecar_started(&app, &state).await?;

    let manager = state.manager.lock().await;
    let params = serde_json::json!({
        "sessionId": session_id,
        "workingDirectory": working_directory,
    });

    manager.send_command("update_session_working_directory", params).await?;
    Ok(())
}

/// Load memory (GEMINI.md) for a working directory
#[tauri::command]
pub async fn agent_load_memory(
    app: AppHandle,
    state: State<'_, AgentState>,
    working_directory: String,
) -> Result<serde_json::Value, String> {
    ensure_sidecar_started(&app, &state).await?;

    let manager = state.manager.lock().await;
    let params = serde_json::json!({
        "workingDirectory": working_directory,
    });

    manager.send_command("load_memory", params).await
}

/// Save memory (GEMINI.md) for a working directory
#[tauri::command]
pub async fn agent_save_memory(
    app: AppHandle,
    state: State<'_, AgentState>,
    working_directory: String,
    entries: Vec<serde_json::Value>,
) -> Result<(), String> {
    ensure_sidecar_started(&app, &state).await?;

    let manager = state.manager.lock().await;
    let params = serde_json::json!({
        "workingDirectory": working_directory,
        "entries": entries,
    });

    manager.send_command("save_memory", params).await?;
    Ok(())
}

/// Get context usage for a session
#[tauri::command]
pub async fn agent_get_context_usage(
    app: AppHandle,
    state: State<'_, AgentState>,
    session_id: String,
) -> Result<serde_json::Value, String> {
    ensure_sidecar_started(&app, &state).await?;

    let manager = state.manager.lock().await;
    let params = serde_json::json!({
        "sessionId": session_id,
    });

    manager.send_command("get_context_usage", params).await
}

/// Respond to a question from the agent
#[tauri::command]
pub async fn agent_respond_question(
    app: AppHandle,
    state: State<'_, AgentState>,
    session_id: String,
    question_id: String,
    answer: serde_json::Value, // Can be string or array of strings
) -> Result<(), String> {
    ensure_sidecar_started(&app, &state).await?;

    let manager = state.manager.lock().await;
    let params = serde_json::json!({
        "sessionId": session_id,
        "questionId": question_id,
        "answer": answer,
    });

    manager.send_command("respond_question", params).await?;
    Ok(())
}
