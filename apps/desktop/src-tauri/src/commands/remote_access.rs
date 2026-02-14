// Copyright (c) 2026 Naresh. All rights reserved.
// Licensed under the MIT License. See LICENSE file for details.

use crate::commands::agent::{ensure_sidecar_started_public, AgentState};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, State};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteAccessDeviceSummary {
    pub id: String,
    pub name: String,
    pub platform: String,
    pub created_at: i64,
    pub last_used_at: i64,
    pub expires_at: i64,
    #[serde(default)]
    pub revoked_at: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteDiagnosticEntry {
    pub id: String,
    pub level: String,
    pub message: String,
    pub step: String,
    pub at: i64,
    #[serde(default)]
    pub command_hint: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteAccessStatus {
    pub enabled: bool,
    pub running: bool,
    pub bind_host: String,
    pub bind_port: Option<u16>,
    #[serde(default)]
    pub local_base_url: Option<String>,
    #[serde(default)]
    pub public_base_url: Option<String>,
    pub tunnel_mode: String,
    #[serde(default)]
    pub tunnel_name: Option<String>,
    #[serde(default)]
    pub tunnel_domain: Option<String>,
    pub tunnel_visibility: String,
    #[serde(default)]
    pub tunnel_hints: Vec<String>,
    pub tunnel_state: String,
    #[serde(default)]
    pub tunnel_public_url: Option<String>,
    #[serde(default)]
    pub tunnel_last_error: Option<String>,
    pub tunnel_binary_installed: bool,
    #[serde(default)]
    pub tunnel_binary_path: Option<String>,
    pub tunnel_auth_status: String,
    #[serde(default)]
    pub tunnel_started_at: Option<i64>,
    #[serde(default)]
    pub tunnel_pid: Option<i64>,
    pub config_health: String,
    #[serde(default)]
    pub config_repair_reason: Option<String>,
    #[serde(default)]
    pub last_operation: Option<String>,
    #[serde(default)]
    pub last_operation_at: Option<i64>,
    #[serde(default)]
    pub diagnostics: Vec<RemoteDiagnosticEntry>,
    pub device_count: usize,
    #[serde(default)]
    pub devices: Vec<RemoteAccessDeviceSummary>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemotePairingQr {
    pub qr_data_url: String,
    pub pairing_uri: String,
    pub expires_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DeviceListResult {
    devices: Vec<RemoteAccessDeviceSummary>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RevokeResult {
    revoked: bool,
}

/// Get remote access status.
#[tauri::command]
pub async fn remote_access_get_status(
    app: AppHandle,
    state: State<'_, AgentState>,
) -> Result<RemoteAccessStatus, String> {
    ensure_sidecar_started_public(&app, &state).await?;

    let manager = &state.manager;
    let result = manager
        .send_command("remote_access_get_status", serde_json::json!({}))
        .await?;

    serde_json::from_value(result).map_err(|e| format!("Failed to parse remote status: {}", e))
}

/// Enable remote access.
#[tauri::command]
pub async fn remote_access_enable(
    app: AppHandle,
    state: State<'_, AgentState>,
    public_base_url: Option<String>,
    tunnel_mode: Option<String>,
    tunnel_name: Option<String>,
    tunnel_domain: Option<String>,
    tunnel_visibility: Option<String>,
    bind_port: Option<u16>,
) -> Result<RemoteAccessStatus, String> {
    ensure_sidecar_started_public(&app, &state).await?;

    let manager = &state.manager;
    let params = serde_json::json!({
        "publicBaseUrl": public_base_url,
        "tunnelMode": tunnel_mode,
        "tunnelName": tunnel_name,
        "tunnelDomain": tunnel_domain,
        "tunnelVisibility": tunnel_visibility,
        "bindPort": bind_port,
    });
    let result = manager.send_command("remote_access_enable", params).await?;
    serde_json::from_value(result).map_err(|e| format!("Failed to parse remote status: {}", e))
}

/// Disable remote access.
#[tauri::command]
pub async fn remote_access_disable(
    app: AppHandle,
    state: State<'_, AgentState>,
) -> Result<RemoteAccessStatus, String> {
    ensure_sidecar_started_public(&app, &state).await?;

    let manager = &state.manager;
    let result = manager
        .send_command("remote_access_disable", serde_json::json!({}))
        .await?;

    serde_json::from_value(result).map_err(|e| format!("Failed to parse remote status: {}", e))
}

/// Generate a short-lived pairing QR code for the mobile app.
#[tauri::command]
pub async fn remote_access_generate_qr(
    app: AppHandle,
    state: State<'_, AgentState>,
) -> Result<RemotePairingQr, String> {
    ensure_sidecar_started_public(&app, &state).await?;

    let manager = &state.manager;
    let result = manager
        .send_command("remote_access_generate_qr", serde_json::json!({}))
        .await?;

    serde_json::from_value(result).map_err(|e| format!("Failed to parse pairing QR result: {}", e))
}

/// List paired mobile devices.
#[tauri::command]
pub async fn remote_access_list_devices(
    app: AppHandle,
    state: State<'_, AgentState>,
) -> Result<Vec<RemoteAccessDeviceSummary>, String> {
    ensure_sidecar_started_public(&app, &state).await?;

    let manager = &state.manager;
    let result = manager
        .send_command("remote_access_list_devices", serde_json::json!({}))
        .await?;

    let parsed: DeviceListResult = serde_json::from_value(result)
        .map_err(|e| format!("Failed to parse device list: {}", e))?;
    Ok(parsed.devices)
}

/// Revoke a paired mobile device token.
#[tauri::command]
pub async fn remote_access_revoke_device(
    app: AppHandle,
    state: State<'_, AgentState>,
    device_id: String,
) -> Result<bool, String> {
    ensure_sidecar_started_public(&app, &state).await?;

    let manager = &state.manager;
    let result = manager
        .send_command(
            "remote_access_revoke_device",
            serde_json::json!({ "deviceId": device_id }),
        )
        .await?;

    let parsed: RevokeResult = serde_json::from_value(result)
        .map_err(|e| format!("Failed to parse revoke result: {}", e))?;
    Ok(parsed.revoked)
}

/// Update remote public base URL.
#[tauri::command]
pub async fn remote_access_set_public_base_url(
    app: AppHandle,
    state: State<'_, AgentState>,
    public_base_url: Option<String>,
) -> Result<RemoteAccessStatus, String> {
    ensure_sidecar_started_public(&app, &state).await?;

    let manager = &state.manager;
    let result = manager
        .send_command(
            "remote_access_set_public_base_url",
            serde_json::json!({ "publicBaseUrl": public_base_url }),
        )
        .await?;

    serde_json::from_value(result).map_err(|e| format!("Failed to parse remote status: {}", e))
}

/// Update tunnel mode.
#[tauri::command]
pub async fn remote_access_set_tunnel_mode(
    app: AppHandle,
    state: State<'_, AgentState>,
    tunnel_mode: String,
) -> Result<RemoteAccessStatus, String> {
    ensure_sidecar_started_public(&app, &state).await?;

    let manager = &state.manager;
    let result = manager
        .send_command(
            "remote_access_set_tunnel_mode",
            serde_json::json!({ "tunnelMode": tunnel_mode }),
        )
        .await?;

    serde_json::from_value(result).map_err(|e| format!("Failed to parse remote status: {}", e))
}

/// Update tunnel naming/domain/visibility options.
#[tauri::command]
pub async fn remote_access_set_tunnel_options(
    app: AppHandle,
    state: State<'_, AgentState>,
    tunnel_name: Option<String>,
    tunnel_domain: Option<String>,
    tunnel_visibility: Option<String>,
    public_base_url: Option<String>,
) -> Result<RemoteAccessStatus, String> {
    ensure_sidecar_started_public(&app, &state).await?;

    let manager = &state.manager;
    let result = manager
        .send_command(
            "remote_access_set_tunnel_options",
            serde_json::json!({
                "tunnelName": tunnel_name,
                "tunnelDomain": tunnel_domain,
                "tunnelVisibility": tunnel_visibility,
                "publicBaseUrl": public_base_url,
            }),
        )
        .await?;

    serde_json::from_value(result).map_err(|e| format!("Failed to parse remote status: {}", e))
}

/// Refresh tunnel dependency/auth/runtime health.
#[tauri::command]
pub async fn remote_access_refresh_tunnel(
    app: AppHandle,
    state: State<'_, AgentState>,
) -> Result<RemoteAccessStatus, String> {
    ensure_sidecar_started_public(&app, &state).await?;

    let manager = &state.manager;
    let result = manager
        .send_command("remote_access_refresh_tunnel", serde_json::json!({}))
        .await?;

    serde_json::from_value(result).map_err(|e| format!("Failed to parse remote status: {}", e))
}

/// Install tunnel dependency for selected tunnel mode.
#[tauri::command]
pub async fn remote_access_install_tunnel_binary(
    app: AppHandle,
    state: State<'_, AgentState>,
) -> Result<RemoteAccessStatus, String> {
    ensure_sidecar_started_public(&app, &state).await?;

    let manager = &state.manager;
    let result = manager
        .send_command("remote_access_install_tunnel_binary", serde_json::json!({}))
        .await?;

    serde_json::from_value(result).map_err(|e| format!("Failed to parse remote status: {}", e))
}

/// Authenticate tunnel provider (if required).
#[tauri::command]
pub async fn remote_access_authenticate_tunnel(
    app: AppHandle,
    state: State<'_, AgentState>,
) -> Result<RemoteAccessStatus, String> {
    ensure_sidecar_started_public(&app, &state).await?;

    let manager = &state.manager;
    let result = manager
        .send_command("remote_access_authenticate_tunnel", serde_json::json!({}))
        .await?;

    serde_json::from_value(result).map_err(|e| format!("Failed to parse remote status: {}", e))
}

/// Start managed tunnel process.
#[tauri::command]
pub async fn remote_access_start_tunnel(
    app: AppHandle,
    state: State<'_, AgentState>,
) -> Result<RemoteAccessStatus, String> {
    ensure_sidecar_started_public(&app, &state).await?;

    let manager = &state.manager;
    let result = manager
        .send_command("remote_access_start_tunnel", serde_json::json!({}))
        .await?;

    serde_json::from_value(result).map_err(|e| format!("Failed to parse remote status: {}", e))
}

/// Stop managed tunnel process.
#[tauri::command]
pub async fn remote_access_stop_tunnel(
    app: AppHandle,
    state: State<'_, AgentState>,
) -> Result<RemoteAccessStatus, String> {
    ensure_sidecar_started_public(&app, &state).await?;

    let manager = &state.manager;
    let result = manager
        .send_command("remote_access_stop_tunnel", serde_json::json!({}))
        .await?;

    serde_json::from_value(result).map_err(|e| format!("Failed to parse remote status: {}", e))
}

/// Delete all remote setup and paired devices.
#[tauri::command]
pub async fn remote_access_delete_all(
    app: AppHandle,
    state: State<'_, AgentState>,
) -> Result<RemoteAccessStatus, String> {
    ensure_sidecar_started_public(&app, &state).await?;

    let manager = &state.manager;
    let result = manager
        .send_command("remote_access_delete_all", serde_json::json!({}))
        .await?;

    serde_json::from_value(result).map_err(|e| format!("Failed to parse remote status: {}", e))
}
