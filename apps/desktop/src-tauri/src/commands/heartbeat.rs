use crate::commands::agent::{ensure_sidecar_started_public, AgentState};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, State};

// ============================================================================
// Heartbeat Types
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HeartbeatConfig {
    pub enabled: bool,
    pub interval_ms: i64,
    pub system_events_enabled: bool,
    pub cron_enabled: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HeartbeatStatus {
    pub is_running: bool,
    pub last_heartbeat: Option<i64>,
    pub next_heartbeat: Option<i64>,
    pub event_queue_size: u32,
    pub is_processing: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemEvent {
    pub id: String,
    #[serde(rename = "type")]
    pub event_type: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub payload: Option<serde_json::Value>,
    pub scheduled_at: i64,
    pub priority: String, // "low" | "normal" | "high"
    #[serde(skip_serializing_if = "Option::is_none")]
    pub session_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QueueEventInput {
    #[serde(rename = "type")]
    pub event_type: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub payload: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub priority: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub session_id: Option<String>,
}

// ============================================================================
// Tauri Commands
// ============================================================================

/// Get current heartbeat status
#[tauri::command]
pub async fn heartbeat_get_status(
    app: AppHandle,
    state: State<'_, AgentState>,
) -> Result<HeartbeatStatus, String> {
    ensure_sidecar_started_public(&app, &state).await?;

    let manager = &state.manager;
    let result = manager
        .send_command("heartbeat_get_status", serde_json::json!({}))
        .await?;

    serde_json::from_value(result).map_err(|e| format!("Failed to parse heartbeat status: {}", e))
}

/// Get heartbeat configuration
#[tauri::command]
pub async fn heartbeat_get_config(
    app: AppHandle,
    state: State<'_, AgentState>,
) -> Result<HeartbeatConfig, String> {
    ensure_sidecar_started_public(&app, &state).await?;

    let manager = &state.manager;
    let result = manager
        .send_command("heartbeat_get_config", serde_json::json!({}))
        .await?;

    serde_json::from_value(result).map_err(|e| format!("Failed to parse heartbeat config: {}", e))
}

/// Update heartbeat configuration
#[tauri::command]
pub async fn heartbeat_set_config(
    app: AppHandle,
    state: State<'_, AgentState>,
    config: HeartbeatConfig,
) -> Result<HeartbeatConfig, String> {
    ensure_sidecar_started_public(&app, &state).await?;

    let manager = &state.manager;
    let params = serde_json::to_value(&config)
        .map_err(|e| format!("Failed to serialize config: {}", e))?;
    let result = manager.send_command("heartbeat_set_config", params).await?;

    serde_json::from_value(result).map_err(|e| format!("Failed to parse config: {}", e))
}

/// Start the heartbeat service
#[tauri::command]
pub async fn heartbeat_start(
    app: AppHandle,
    state: State<'_, AgentState>,
) -> Result<(), String> {
    ensure_sidecar_started_public(&app, &state).await?;

    let manager = &state.manager;
    manager
        .send_command("heartbeat_start", serde_json::json!({}))
        .await?;

    Ok(())
}

/// Stop the heartbeat service
#[tauri::command]
pub async fn heartbeat_stop(
    app: AppHandle,
    state: State<'_, AgentState>,
) -> Result<(), String> {
    ensure_sidecar_started_public(&app, &state).await?;

    let manager = &state.manager;
    manager
        .send_command("heartbeat_stop", serde_json::json!({}))
        .await?;

    Ok(())
}

/// Trigger immediate heartbeat wake
#[tauri::command]
pub async fn heartbeat_wake(
    app: AppHandle,
    state: State<'_, AgentState>,
    mode: Option<String>,
) -> Result<(), String> {
    ensure_sidecar_started_public(&app, &state).await?;

    let manager = &state.manager;
    let params = serde_json::json!({
        "mode": mode.unwrap_or_else(|| "now".to_string()),
    });
    manager.send_command("heartbeat_wake", params).await?;

    Ok(())
}

/// Queue a system event for next heartbeat
#[tauri::command]
pub async fn heartbeat_queue_event(
    app: AppHandle,
    state: State<'_, AgentState>,
    input: QueueEventInput,
) -> Result<String, String> {
    ensure_sidecar_started_public(&app, &state).await?;

    let manager = &state.manager;
    let params = serde_json::to_value(&input)
        .map_err(|e| format!("Failed to serialize event: {}", e))?;
    let result = manager.send_command("heartbeat_queue_event", params).await?;

    // Returns the event ID
    result
        .as_str()
        .map(|s| s.to_string())
        .or_else(|| result.get("eventId").and_then(|v| v.as_str()).map(|s| s.to_string()))
        .ok_or_else(|| "Failed to get event ID from response".to_string())
}

/// Get queued events
#[tauri::command]
pub async fn heartbeat_get_events(
    app: AppHandle,
    state: State<'_, AgentState>,
) -> Result<Vec<SystemEvent>, String> {
    ensure_sidecar_started_public(&app, &state).await?;

    let manager = &state.manager;
    let result = manager
        .send_command("heartbeat_get_events", serde_json::json!({}))
        .await?;

    serde_json::from_value(result).map_err(|e| format!("Failed to parse events: {}", e))
}

/// Clear all queued events
#[tauri::command]
pub async fn heartbeat_clear_events(
    app: AppHandle,
    state: State<'_, AgentState>,
) -> Result<u32, String> {
    ensure_sidecar_started_public(&app, &state).await?;

    let manager = &state.manager;
    let result = manager
        .send_command("heartbeat_clear_events", serde_json::json!({}))
        .await?;

    result
        .as_u64()
        .map(|n| n as u32)
        .or_else(|| result.get("count").and_then(|v| v.as_u64()).map(|n| n as u32))
        .ok_or_else(|| "Failed to get cleared count from response".to_string())
}
