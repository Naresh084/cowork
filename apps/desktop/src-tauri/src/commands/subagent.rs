// Subagent Marketplace Commands
// Handles commands for subagent management (install, uninstall, list, create)

use crate::commands::agent::{AgentState, ensure_sidecar_started};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, State};

// ============================================================================
// Subagent Types
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SubagentInfo {
    pub name: String,
    pub display_name: String,
    pub description: String,
    pub version: String,
    pub author: Option<String>,
    pub category: String,
    pub icon: Option<String>,
    pub tags: Option<Vec<String>>,
    pub system_prompt: String,
    pub tools: Option<Vec<String>>,
    pub model: Option<String>,
    pub priority: Option<i32>,
    pub source: Option<String>,
    pub installed: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateSubagentInput {
    pub name: String,
    pub display_name: String,
    pub description: String,
    pub system_prompt: String,
    pub category: Option<String>,
    pub tags: Option<Vec<String>>,
    pub tools: Option<Vec<String>>,
    pub model: Option<String>,
}

// ============================================================================
// Subagent Commands
// ============================================================================

/// List all available subagents
#[tauri::command]
pub async fn deep_subagent_list(
    app: AppHandle,
    state: State<'_, AgentState>,
    working_directory: Option<String>,
) -> Result<Vec<SubagentInfo>, String> {
    ensure_sidecar_started(&app, &state).await?;

    let manager = &state.manager;
    let params = serde_json::json!({
        "workingDirectory": working_directory,
    });

    let result = manager.send_command("subagent_list", params).await?;
    let wrapper: serde_json::Value = serde_json::from_value(result)
        .map_err(|e| format!("Failed to parse result: {}", e))?;
    let subagents = wrapper.get("subagents").cloned().unwrap_or(serde_json::json!([]));
    serde_json::from_value(subagents).map_err(|e| format!("Failed to parse subagents: {}", e))
}

/// Install a subagent (copy from bundled to managed)
#[tauri::command]
pub async fn deep_subagent_install(
    app: AppHandle,
    state: State<'_, AgentState>,
    subagent_name: String,
    working_directory: Option<String>,
) -> Result<(), String> {
    ensure_sidecar_started(&app, &state).await?;

    let manager = &state.manager;
    let params = serde_json::json!({
        "subagentName": subagent_name,
        "workingDirectory": working_directory,
    });

    let result = manager.send_command("subagent_install", params).await?;
    let wrapper: serde_json::Value = serde_json::from_value(result)
        .map_err(|e| format!("Failed to parse result: {}", e))?;

    if wrapper.get("success").and_then(|v| v.as_bool()).unwrap_or(false) {
        Ok(())
    } else {
        Err("Failed to install subagent".to_string())
    }
}

/// Uninstall a subagent (remove from managed)
#[tauri::command]
pub async fn deep_subagent_uninstall(
    app: AppHandle,
    state: State<'_, AgentState>,
    subagent_name: String,
    working_directory: Option<String>,
) -> Result<(), String> {
    ensure_sidecar_started(&app, &state).await?;

    let manager = &state.manager;
    let params = serde_json::json!({
        "subagentName": subagent_name,
        "workingDirectory": working_directory,
    });

    let result = manager.send_command("subagent_uninstall", params).await?;
    let wrapper: serde_json::Value = serde_json::from_value(result)
        .map_err(|e| format!("Failed to parse result: {}", e))?;

    if wrapper.get("success").and_then(|v| v.as_bool()).unwrap_or(false) {
        Ok(())
    } else {
        Err("Failed to uninstall subagent".to_string())
    }
}

/// Check if a subagent is installed
#[tauri::command]
pub async fn deep_subagent_is_installed(
    app: AppHandle,
    state: State<'_, AgentState>,
    subagent_name: String,
    working_directory: Option<String>,
) -> Result<bool, String> {
    ensure_sidecar_started(&app, &state).await?;

    let manager = &state.manager;
    let params = serde_json::json!({
        "subagentName": subagent_name,
        "workingDirectory": working_directory,
    });

    let result = manager.send_command("subagent_is_installed", params).await?;
    let wrapper: serde_json::Value = serde_json::from_value(result)
        .map_err(|e| format!("Failed to parse result: {}", e))?;

    Ok(wrapper.get("installed").and_then(|v| v.as_bool()).unwrap_or(false))
}

/// Get a specific subagent
#[tauri::command]
pub async fn deep_subagent_get(
    app: AppHandle,
    state: State<'_, AgentState>,
    subagent_name: String,
    working_directory: Option<String>,
) -> Result<SubagentInfo, String> {
    ensure_sidecar_started(&app, &state).await?;

    let manager = &state.manager;
    let params = serde_json::json!({
        "subagentName": subagent_name,
        "workingDirectory": working_directory,
    });

    let result = manager.send_command("subagent_get", params).await?;
    serde_json::from_value(result).map_err(|e| format!("Failed to parse subagent: {}", e))
}

/// Create a custom subagent
#[tauri::command]
pub async fn deep_subagent_create(
    app: AppHandle,
    state: State<'_, AgentState>,
    input: CreateSubagentInput,
    working_directory: Option<String>,
) -> Result<String, String> {
    ensure_sidecar_started(&app, &state).await?;

    let manager = &state.manager;
    let params = serde_json::json!({
        "name": input.name,
        "displayName": input.display_name,
        "description": input.description,
        "systemPrompt": input.system_prompt,
        "category": input.category,
        "tags": input.tags,
        "tools": input.tools,
        "model": input.model,
        "workingDirectory": working_directory,
    });

    let result = manager.send_command("subagent_create", params).await?;
    let wrapper: serde_json::Value = serde_json::from_value(result)
        .map_err(|e| format!("Failed to parse result: {}", e))?;

    wrapper
        .get("subagentName")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
        .ok_or_else(|| "Failed to get subagent name".to_string())
}
