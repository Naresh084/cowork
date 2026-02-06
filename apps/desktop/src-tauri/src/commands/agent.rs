use crate::sidecar::{SidecarEvent, SidecarManager};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tauri::{AppHandle, Emitter, State};

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
    pub last_accessed_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionDetails {
    pub id: String,
    #[serde(default)]
    pub title: Option<String>,
    #[serde(default)]
    pub working_directory: Option<String>,
    #[serde(default)]
    pub model: Option<String>,
    #[serde(default)]
    pub messages: Vec<serde_json::Value>,
    #[serde(default)]
    pub chat_items: Option<Vec<serde_json::Value>>,
    #[serde(default)]
    pub tasks: Option<Vec<serde_json::Value>>,
    #[serde(default)]
    pub artifacts: Option<Vec<serde_json::Value>>,
    #[serde(default)]
    pub tool_executions: Option<Vec<serde_json::Value>>,
    #[serde(default)]
    pub created_at: i64,
    #[serde(default)]
    pub updated_at: i64,
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
pub struct MCPServerConfig {
    pub id: String,
    pub name: String,
    pub command: String,
    pub args: Option<Vec<String>>,
    pub env: Option<std::collections::HashMap<String, String>>,
    pub enabled: Option<bool>,
    pub prompt: Option<String>,
    pub context_file_name: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillConfig {
    pub id: String,
    pub name: String,
    pub path: String,
    pub description: Option<String>,
    pub enabled: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SpecializedModels {
    pub image_generation: String,
    pub video_generation: String,
    pub computer_use: String,
}


/// State wrapper for the sidecar manager
pub struct AgentState {
    pub manager: Arc<SidecarManager>,
}

impl AgentState {
    pub fn new() -> Self {
        Self {
            manager: Arc::new(SidecarManager::new()),
        }
    }
}

impl Default for AgentState {
    fn default() -> Self {
        Self::new()
    }
}

/// Ensure sidecar is started and set up event forwarding (public for use by other command modules)
pub async fn ensure_sidecar_started_public(
    app: &AppHandle,
    state: &State<'_, AgentState>,
) -> Result<(), String> {
    ensure_sidecar_started(app, state).await
}

/// Ensure sidecar is started and set up event forwarding
pub async fn ensure_sidecar_started(
    app: &AppHandle,
    state: &State<'_, AgentState>,
) -> Result<(), String> {
    let manager = &state.manager;

    if !manager.is_running().await {
        // Use home directory for persistence: ~/.cowork
        // This provides consistent, user-accessible storage across platforms
        let home_dir = dirs::home_dir()
            .ok_or("Failed to get home directory")?;
        let gemini_dir = home_dir.join(".cowork");

        // Ensure the directory exists
        std::fs::create_dir_all(&gemini_dir)
            .map_err(|e| format!("Failed to create .cowork directory: {}", e))?;

        let app_data_str = gemini_dir
            .to_str()
            .ok_or("Invalid path")?
            .to_string();

        manager.start(&app_data_str).await?;

        // Initialize persistence in sidecar with app data directory
        let init_params = serde_json::json!({
            "appDataDir": app_data_str
        });
        let _ = manager.send_command("initialize", init_params).await;

        // Set up event forwarding to frontend
        let app_handle = app.clone();
        manager
            .set_event_handler(move |event: SidecarEvent| {
                // Forward event to frontend
                let event_name = format!("agent:{}", event.event_type);
                let _ = app_handle.emit(&event_name, &event);
            })
            .await;

        // Get API key from secure credentials storage and set it on the sidecar
        if let Ok(Some(api_key)) = crate::commands::auth::get_api_key().await {
            let params = serde_json::json!({ "apiKey": api_key });
            let _ = manager.send_command("set_api_key", params).await;
        }
    }

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

    let manager = &state.manager;
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

    let manager = &state.manager;
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

    let manager = &state.manager;
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
    decision: String,
) -> Result<(), String> {
    ensure_sidecar_started(&app, &state).await?;

    let manager = &state.manager;
    let params = serde_json::json!({
        "sessionId": session_id,
        "permissionId": permission_id,
        "decision": decision,
    });

    manager.send_command("respond_permission", params).await?;
    Ok(())
}

/// Set approval mode for a session
#[tauri::command]
pub async fn agent_set_approval_mode(
    app: AppHandle,
    state: State<'_, AgentState>,
    session_id: String,
    mode: String,
) -> Result<(), String> {
    ensure_sidecar_started(&app, &state).await?;

    let manager = &state.manager;
    let params = serde_json::json!({
        "sessionId": session_id,
        "mode": mode,
    });

    manager.send_command("set_approval_mode", params).await?;
    Ok(())
}

/// Update model catalog for context window sizing
#[tauri::command]
pub async fn agent_set_models(
    app: AppHandle,
    state: State<'_, AgentState>,
    models: Vec<serde_json::Value>,
) -> Result<(), String> {
    ensure_sidecar_started(&app, &state).await?;

    let manager = &state.manager;
    let params = serde_json::json!({
        "models": models,
    });

    manager.send_command("set_models", params).await?;
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

    let manager = &state.manager;
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
    ensure_sidecar_started(&app, &state).await?;
    let manager = &state.manager;
    let result = manager
        .send_command("list_sessions", serde_json::json!({}))
        .await?;

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

    let manager = &state.manager;
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

    let manager = &state.manager;
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

    let manager = &state.manager;
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

    let manager = &state.manager;
    let params = serde_json::json!({
        "sessionId": session_id,
        "workingDirectory": working_directory,
    });

    manager.send_command("update_session_working_directory", params).await?;
    Ok(())
}

/// Update session last accessed time
#[tauri::command]
pub async fn agent_update_session_last_accessed(
    app: AppHandle,
    state: State<'_, AgentState>,
    session_id: String,
) -> Result<(), String> {
    ensure_sidecar_started(&app, &state).await?;

    let manager = &state.manager;
    let params = serde_json::json!({
        "sessionId": session_id,
    });

    manager.send_command("update_session_last_accessed", params).await?;
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

    let manager = &state.manager;
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

    let manager = &state.manager;
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

    let manager = &state.manager;
    let params = serde_json::json!({
        "sessionId": session_id,
    });

    manager.send_command("get_context_usage", params).await
}

/// Sync MCP servers to sidecar
#[tauri::command]
pub async fn agent_set_mcp_servers(
    app: AppHandle,
    state: State<'_, AgentState>,
    servers: Vec<MCPServerConfig>,
) -> Result<(), String> {
    ensure_sidecar_started(&app, &state).await?;
    let manager = &state.manager;
    let params = serde_json::json!({
        "servers": servers,
    });
    manager.send_command("set_mcp_servers", params).await?;
    Ok(())
}

/// Sync skills to sidecar
#[tauri::command]
pub async fn agent_set_skills(
    app: AppHandle,
    state: State<'_, AgentState>,
    skills: Vec<SkillConfig>,
) -> Result<(), String> {
    ensure_sidecar_started(&app, &state).await?;
    let manager = &state.manager;
    let params = serde_json::json!({
        "skills": skills,
    });
    manager.send_command("set_skills", params).await?;
    Ok(())
}

/// Set specialized models for image/video generation and computer use
#[tauri::command]
pub async fn agent_set_specialized_models(
    app: AppHandle,
    state: State<'_, AgentState>,
    models: SpecializedModels,
) -> Result<(), String> {
    ensure_sidecar_started(&app, &state).await?;
    let manager = &state.manager;
    let params = serde_json::json!({
        "models": {
            "imageGeneration": models.image_generation,
            "videoGeneration": models.video_generation,
            "computerUse": models.computer_use,
        }
    });
    manager.send_command("set_specialized_models", params).await?;
    Ok(())
}

/// Call an MCP tool from the UI
#[tauri::command]
pub async fn agent_mcp_call_tool(
    app: AppHandle,
    state: State<'_, AgentState>,
    server_id: String,
    tool_name: String,
    args: Option<serde_json::Value>,
) -> Result<serde_json::Value, String> {
    ensure_sidecar_started(&app, &state).await?;
    let manager = &state.manager;
    let params = serde_json::json!({
        "serverId": server_id,
        "toolName": tool_name,
        "args": args.unwrap_or(serde_json::json!({})),
    });
    manager.send_command("mcp_call_tool", params).await
}

/// Load Gemini CLI extensions from disk
#[tauri::command]
pub async fn agent_load_gemini_extensions(
    app: AppHandle,
    state: State<'_, AgentState>,
) -> Result<serde_json::Value, String> {
    ensure_sidecar_started(&app, &state).await?;
    let manager = &state.manager;
    let result = manager
        .send_command("load_gemini_extensions", serde_json::json!({}))
        .await?;
    Ok(result)
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

    let manager = &state.manager;
    let params = serde_json::json!({
        "sessionId": session_id,
        "questionId": question_id,
        "answer": answer,
    });

    manager.send_command("respond_question", params).await?;
    Ok(())
}

/// Get initialization status for frontend coordination
#[tauri::command]
pub async fn agent_get_initialization_status(
    app: AppHandle,
    state: State<'_, AgentState>,
) -> Result<serde_json::Value, String> {
    ensure_sidecar_started(&app, &state).await?;
    let manager = &state.manager;
    manager.send_command("get_initialization_status", serde_json::json!({})).await
}

/// Generic command handler - forwards any command to the sidecar
#[tauri::command]
pub async fn agent_command(
    app: AppHandle,
    state: State<'_, AgentState>,
    command: String,
    params: serde_json::Value,
) -> Result<serde_json::Value, String> {
    ensure_sidecar_started(&app, &state).await?;
    let manager = &state.manager;
    let result = manager.send_command(&command, params).await?;
    Ok(serde_json::json!({ "result": result }))
}
