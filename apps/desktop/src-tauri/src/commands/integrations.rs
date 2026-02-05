use crate::commands::agent::AgentState;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, State};

// ============================================================================
// Integration Types
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlatformStatus {
    pub platform: String,
    pub connected: bool,
    pub display_name: Option<String>,
    pub error: Option<String>,
    pub connected_at: Option<i64>,
    pub last_message_at: Option<i64>,
}

// ============================================================================
// Helper Functions
// ============================================================================

/// Ensure sidecar is started (reuse from agent module)
async fn ensure_sidecar(
    app: &AppHandle,
    state: &State<'_, AgentState>,
) -> Result<(), String> {
    crate::commands::agent::ensure_sidecar_started_public(app, state).await
}

// ============================================================================
// Integration Commands
// ============================================================================

/// List statuses of all messaging platforms
#[tauri::command]
pub async fn agent_integration_list_statuses(
    app: AppHandle,
    state: State<'_, AgentState>,
) -> Result<serde_json::Value, String> {
    ensure_sidecar(&app, &state).await?;

    let manager = &state.manager;
    let params = serde_json::json!({});

    manager.send_command("integration_list_statuses", params).await
}

/// Connect a messaging platform with config
#[tauri::command]
pub async fn agent_integration_connect(
    app: AppHandle,
    state: State<'_, AgentState>,
    platform: String,
    config: serde_json::Value,
) -> Result<serde_json::Value, String> {
    ensure_sidecar(&app, &state).await?;

    let manager = &state.manager;
    let params = serde_json::json!({
        "platform": platform,
        "config": config,
    });

    manager.send_command("integration_connect", params).await
}

/// Disconnect a messaging platform
#[tauri::command]
pub async fn agent_integration_disconnect(
    app: AppHandle,
    state: State<'_, AgentState>,
    platform: String,
) -> Result<(), String> {
    ensure_sidecar(&app, &state).await?;

    let manager = &state.manager;
    let params = serde_json::json!({
        "platform": platform,
    });

    manager.send_command("integration_disconnect", params).await?;
    Ok(())
}

/// Get WhatsApp QR code for scanning
#[tauri::command]
pub async fn agent_integration_get_qr(
    app: AppHandle,
    state: State<'_, AgentState>,
) -> Result<serde_json::Value, String> {
    ensure_sidecar(&app, &state).await?;

    let manager = &state.manager;
    let params = serde_json::json!({});

    manager.send_command("integration_get_qr", params).await
}

/// Update platform configuration
#[tauri::command]
pub async fn agent_integration_configure(
    app: AppHandle,
    state: State<'_, AgentState>,
    platform: String,
    config: serde_json::Value,
) -> Result<(), String> {
    ensure_sidecar(&app, &state).await?;

    let manager = &state.manager;
    let params = serde_json::json!({
        "platform": platform,
        "config": config,
    });

    manager.send_command("integration_configure", params).await?;
    Ok(())
}

/// Send a test message on a platform
#[tauri::command]
pub async fn agent_integration_send_test(
    app: AppHandle,
    state: State<'_, AgentState>,
    platform: String,
    message: String,
) -> Result<(), String> {
    ensure_sidecar(&app, &state).await?;

    let manager = &state.manager;
    let params = serde_json::json!({
        "platform": platform,
        "message": message,
    });

    manager.send_command("integration_send_test", params).await?;
    Ok(())
}
