use crate::commands::agent::AgentState;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, State};

// ============================================================================
// Integration Types
// ============================================================================

#[allow(dead_code)]
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlatformStatus {
    pub platform: String,
    pub connected: bool,
    pub display_name: Option<String>,
    pub identity_phone: Option<String>,
    pub identity_name: Option<String>,
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

/// Get platform configuration
#[tauri::command]
pub async fn agent_integration_get_config(
    app: AppHandle,
    state: State<'_, AgentState>,
    platform: String,
) -> Result<serde_json::Value, String> {
    ensure_sidecar(&app, &state).await?;

    let manager = &state.manager;
    let params = serde_json::json!({
        "platform": platform,
    });

    manager.send_command("integration_get_config", params).await
}

/// Get global integration settings
#[tauri::command]
pub async fn agent_integration_get_settings(
    app: AppHandle,
    state: State<'_, AgentState>,
) -> Result<serde_json::Value, String> {
    ensure_sidecar(&app, &state).await?;

    let manager = &state.manager;
    let params = serde_json::json!({});

    manager.send_command("integration_get_settings", params).await
}

/// Update global integration settings
#[tauri::command]
pub async fn agent_integration_update_settings(
    app: AppHandle,
    state: State<'_, AgentState>,
    settings: serde_json::Value,
) -> Result<(), String> {
    ensure_sidecar(&app, &state).await?;

    let manager = &state.manager;
    let params = serde_json::json!({
        "settings": settings,
    });

    manager
        .send_command("integration_update_settings", params)
        .await?;
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

/// List integration catalog (built-ins + plugins)
#[tauri::command]
pub async fn agent_integration_list_catalog(
    app: AppHandle,
    state: State<'_, AgentState>,
    working_directory: Option<String>,
) -> Result<serde_json::Value, String> {
    ensure_sidecar(&app, &state).await?;
    let manager = &state.manager;
    let params = serde_json::json!({
        "workingDirectory": working_directory,
    });
    manager.send_command("integration_list_catalog", params).await
}

/// Get per-channel integration capabilities
#[tauri::command]
pub async fn agent_integration_get_channel_capabilities(
    app: AppHandle,
    state: State<'_, AgentState>,
    channel: String,
) -> Result<serde_json::Value, String> {
    ensure_sidecar(&app, &state).await?;
    let manager = &state.manager;
    let params = serde_json::json!({ "channel": channel });
    manager
        .send_command("integration_get_channel_capabilities", params)
        .await
}

/// Execute a rich integration action on a channel
#[tauri::command]
pub async fn agent_integration_call_action(
    app: AppHandle,
    state: State<'_, AgentState>,
    channel: String,
    action: String,
    target: Option<serde_json::Value>,
    payload: Option<serde_json::Value>,
) -> Result<serde_json::Value, String> {
    ensure_sidecar(&app, &state).await?;
    let manager = &state.manager;
    let params = serde_json::json!({
        "channel": channel,
        "action": action,
        "target": target,
        "payload": payload,
    });
    manager.send_command("integration_call_action", params).await
}

/// List integration plugins
#[tauri::command]
pub async fn agent_integration_list_plugins(
    app: AppHandle,
    state: State<'_, AgentState>,
    working_directory: Option<String>,
) -> Result<serde_json::Value, String> {
    ensure_sidecar(&app, &state).await?;
    let manager = &state.manager;
    let params = serde_json::json!({
        "workingDirectory": working_directory,
    });
    manager.send_command("integration_list_plugins", params).await
}

/// Install integration plugin
#[tauri::command]
pub async fn agent_integration_install_plugin(
    app: AppHandle,
    state: State<'_, AgentState>,
    plugin: serde_json::Value,
) -> Result<(), String> {
    ensure_sidecar(&app, &state).await?;
    let manager = &state.manager;
    let params = serde_json::json!({ "plugin": plugin });
    manager
        .send_command("integration_install_plugin", params)
        .await?;
    Ok(())
}

/// Uninstall integration plugin
#[tauri::command]
pub async fn agent_integration_uninstall_plugin(
    app: AppHandle,
    state: State<'_, AgentState>,
    plugin_id: String,
) -> Result<(), String> {
    ensure_sidecar(&app, &state).await?;
    let manager = &state.manager;
    let params = serde_json::json!({ "pluginId": plugin_id });
    manager
        .send_command("integration_uninstall_plugin", params)
        .await?;
    Ok(())
}

/// Test integration action with default send
#[tauri::command]
pub async fn agent_integration_test_action(
    app: AppHandle,
    state: State<'_, AgentState>,
    channel: String,
    message: Option<String>,
) -> Result<serde_json::Value, String> {
    ensure_sidecar(&app, &state).await?;
    let manager = &state.manager;
    let params = serde_json::json!({
        "channel": channel,
        "message": message,
    });
    manager.send_command("integration_test_action", params).await
}

/// List integration hooks and runs
#[tauri::command]
pub async fn agent_integration_hooks_list(
    app: AppHandle,
    state: State<'_, AgentState>,
    rule_id: Option<String>,
) -> Result<serde_json::Value, String> {
    ensure_sidecar(&app, &state).await?;
    let manager = &state.manager;
    let params = serde_json::json!({
        "ruleId": rule_id,
    });
    manager.send_command("integration_hooks_list", params).await
}

/// Create integration hook rule
#[tauri::command]
pub async fn agent_integration_hooks_create(
    app: AppHandle,
    state: State<'_, AgentState>,
    input: serde_json::Value,
) -> Result<serde_json::Value, String> {
    ensure_sidecar(&app, &state).await?;
    let manager = &state.manager;
    let params = input;
    manager.send_command("integration_hooks_create", params).await
}

/// Update integration hook rule
#[tauri::command]
pub async fn agent_integration_hooks_update(
    app: AppHandle,
    state: State<'_, AgentState>,
    input: serde_json::Value,
) -> Result<serde_json::Value, String> {
    ensure_sidecar(&app, &state).await?;
    let manager = &state.manager;
    let params = input;
    manager.send_command("integration_hooks_update", params).await
}

/// Delete integration hook rule
#[tauri::command]
pub async fn agent_integration_hooks_delete(
    app: AppHandle,
    state: State<'_, AgentState>,
    rule_id: String,
) -> Result<(), String> {
    ensure_sidecar(&app, &state).await?;
    let manager = &state.manager;
    let params = serde_json::json!({
        "ruleId": rule_id,
    });
    manager
        .send_command("integration_hooks_delete", params)
        .await?;
    Ok(())
}

/// Run integration hook rule immediately
#[tauri::command]
pub async fn agent_integration_hooks_run_now(
    app: AppHandle,
    state: State<'_, AgentState>,
    rule_id: String,
) -> Result<serde_json::Value, String> {
    ensure_sidecar(&app, &state).await?;
    let manager = &state.manager;
    let params = serde_json::json!({
        "ruleId": rule_id,
    });
    manager
        .send_command("integration_hooks_run_now", params)
        .await
}

/// List integration hook runs
#[tauri::command]
pub async fn agent_integration_hooks_runs(
    app: AppHandle,
    state: State<'_, AgentState>,
    rule_id: Option<String>,
) -> Result<serde_json::Value, String> {
    ensure_sidecar(&app, &state).await?;
    let manager = &state.manager;
    let params = serde_json::json!({
        "ruleId": rule_id,
    });
    manager.send_command("integration_hooks_runs", params).await
}
