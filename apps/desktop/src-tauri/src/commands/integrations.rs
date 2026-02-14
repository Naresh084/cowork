// Copyright (c) 2026 Naresh. All rights reserved.
// Licensed under the MIT License. See LICENSE file for details.

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
    let started_at = std::time::Instant::now();
    let config_keys = config
        .as_object()
        .map(|obj| {
            let mut keys: Vec<&String> = obj.keys().collect();
            keys.sort();
            keys.into_iter()
                .map(|key| key.as_str())
                .collect::<Vec<&str>>()
                .join(",")
        })
        .unwrap_or_else(|| "(non-object)".to_string());
    eprintln!(
        "[integration-tauri] connect:start platform={} configKeys={}",
        platform, config_keys
    );
    ensure_sidecar(&app, &state).await?;

    let manager = &state.manager;
    let params = serde_json::json!({
        "platform": platform,
        "config": config,
    });

    match manager.send_command("integration_connect", params).await {
        Ok(result) => {
            eprintln!(
                "[integration-tauri] connect:done platform={} elapsedMs={}",
                platform,
                started_at.elapsed().as_millis()
            );
            Ok(result)
        }
        Err(error) => {
            eprintln!(
                "[integration-tauri] connect:error platform={} elapsedMs={} error={}",
                platform,
                started_at.elapsed().as_millis(),
                error
            );
            Err(error)
        }
    }
}

/// Run WhatsApp recovery flow (soft reconnect or hard session reset + reconnect)
#[tauri::command]
pub async fn agent_integration_recover_whatsapp(
    app: AppHandle,
    state: State<'_, AgentState>,
    mode: Option<String>,
) -> Result<serde_json::Value, String> {
    let started_at = std::time::Instant::now();
    let normalized_mode = match mode.as_deref() {
        Some("hard") => "hard",
        _ => "soft",
    };
    eprintln!(
        "[integration-tauri] recover-whatsapp:start mode={}",
        normalized_mode
    );

    ensure_sidecar(&app, &state).await?;

    let manager = &state.manager;
    let params = serde_json::json!({
        "mode": normalized_mode,
    });

    match manager
        .send_command("integration_recover_whatsapp", params)
        .await
    {
        Ok(result) => {
            eprintln!(
                "[integration-tauri] recover-whatsapp:done mode={} elapsedMs={}",
                normalized_mode,
                started_at.elapsed().as_millis()
            );
            Ok(result)
        }
        Err(error) => {
            eprintln!(
                "[integration-tauri] recover-whatsapp:error mode={} elapsedMs={} error={}",
                normalized_mode,
                started_at.elapsed().as_millis(),
                error
            );
            Err(error)
        }
    }
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
