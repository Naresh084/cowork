// Copyright (c) 2026 Naresh. All rights reserved.
// Licensed under the MIT License. See LICENSE file for details.

use crate::commands::agent::{ensure_sidecar_started_public, AgentState};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, State};

// ============================================================================
// Tool Policy Types
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolRuleConditions {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub path_patterns: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub exclude_paths: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub allowed_commands: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub denied_commands: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub providers: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub session_types: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max_risk_level: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolRule {
    pub tool: String,
    pub action: String, // "allow" | "deny" | "ask"
    #[serde(skip_serializing_if = "Option::is_none")]
    pub conditions: Option<ToolRuleConditions>,
    pub priority: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderSettings {
    pub enabled: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub allowed_tools: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub denied_tools: Option<Vec<String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolPolicy {
    pub id: String,
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    pub profile: String, // "minimal" | "readonly" | "coding" | "messaging" | "research" | "full" | "custom"
    pub global_allow: Vec<String>,
    pub global_deny: Vec<String>,
    pub rules: Vec<ToolRule>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub provider_settings: Option<std::collections::HashMap<String, ProviderSettings>>,
    pub is_default: bool,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolEvaluationResult {
    pub allowed: bool,
    pub action: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reason: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub matched_rule: Option<ToolRule>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolCallContext {
    pub tool_name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub provider: Option<String>,
    pub session_type: String,
    #[serde(default)]
    pub arguments: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdatePolicyInput {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub profile: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub global_allow: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub global_deny: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub rules: Option<Vec<ToolRule>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub provider_settings: Option<std::collections::HashMap<String, ProviderSettings>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AddRuleInput {
    pub tool: String,
    pub action: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub conditions: Option<ToolRuleConditions>,
}

// ============================================================================
// Tauri Commands
// ============================================================================

/// Get current tool policy
#[tauri::command]
pub async fn policy_get(
    app: AppHandle,
    state: State<'_, AgentState>,
) -> Result<ToolPolicy, String> {
    ensure_sidecar_started_public(&app, &state).await?;

    let manager = &state.manager;
    let result = manager
        .send_command("policy_get", serde_json::json!({}))
        .await?;

    serde_json::from_value(result).map_err(|e| format!("Failed to parse policy: {}", e))
}

/// Update tool policy
#[tauri::command]
pub async fn policy_update(
    app: AppHandle,
    state: State<'_, AgentState>,
    input: UpdatePolicyInput,
) -> Result<ToolPolicy, String> {
    ensure_sidecar_started_public(&app, &state).await?;

    let manager = &state.manager;
    let params = serde_json::to_value(&input)
        .map_err(|e| format!("Failed to serialize input: {}", e))?;
    let result = manager.send_command("policy_update", params).await?;

    serde_json::from_value(result).map_err(|e| format!("Failed to parse policy: {}", e))
}

/// Set policy profile (resets rules to profile defaults)
#[tauri::command]
pub async fn policy_set_profile(
    app: AppHandle,
    state: State<'_, AgentState>,
    profile: String,
) -> Result<ToolPolicy, String> {
    ensure_sidecar_started_public(&app, &state).await?;

    let manager = &state.manager;
    let params = serde_json::json!({ "profile": profile });
    let result = manager.send_command("policy_set_profile", params).await?;

    serde_json::from_value(result).map_err(|e| format!("Failed to parse policy: {}", e))
}

/// Add a custom rule to the policy
#[tauri::command]
pub async fn policy_add_rule(
    app: AppHandle,
    state: State<'_, AgentState>,
    input: AddRuleInput,
) -> Result<ToolRule, String> {
    ensure_sidecar_started_public(&app, &state).await?;

    let manager = &state.manager;
    let params = serde_json::to_value(&input)
        .map_err(|e| format!("Failed to serialize input: {}", e))?;
    let result = manager.send_command("policy_add_rule", params).await?;

    serde_json::from_value(result).map_err(|e| format!("Failed to parse rule: {}", e))
}

/// Remove a rule by index
#[tauri::command]
pub async fn policy_remove_rule(
    app: AppHandle,
    state: State<'_, AgentState>,
    index: u32,
) -> Result<(), String> {
    ensure_sidecar_started_public(&app, &state).await?;

    let manager = &state.manager;
    let params = serde_json::json!({ "index": index });
    manager.send_command("policy_remove_rule", params).await?;

    Ok(())
}

/// Evaluate a tool call against the policy
#[tauri::command]
pub async fn policy_evaluate(
    app: AppHandle,
    state: State<'_, AgentState>,
    context: ToolCallContext,
) -> Result<ToolEvaluationResult, String> {
    ensure_sidecar_started_public(&app, &state).await?;

    let manager = &state.manager;
    let params = serde_json::to_value(&context)
        .map_err(|e| format!("Failed to serialize context: {}", e))?;
    let result = manager.send_command("policy_evaluate", params).await?;

    serde_json::from_value(result).map_err(|e| format!("Failed to parse evaluation result: {}", e))
}

/// Reset policy to defaults
#[tauri::command]
pub async fn policy_reset(
    app: AppHandle,
    state: State<'_, AgentState>,
) -> Result<ToolPolicy, String> {
    ensure_sidecar_started_public(&app, &state).await?;

    let manager = &state.manager;
    let result = manager
        .send_command("policy_reset", serde_json::json!({}))
        .await?;

    serde_json::from_value(result).map_err(|e| format!("Failed to parse policy: {}", e))
}

/// Get available tool profiles
#[tauri::command]
pub async fn policy_get_profiles(
    app: AppHandle,
    state: State<'_, AgentState>,
) -> Result<serde_json::Value, String> {
    ensure_sidecar_started_public(&app, &state).await?;

    let manager = &state.manager;
    manager
        .send_command("policy_get_profiles", serde_json::json!({}))
        .await
}

/// Get available tool groups
#[tauri::command]
pub async fn policy_get_groups(
    app: AppHandle,
    state: State<'_, AgentState>,
) -> Result<serde_json::Value, String> {
    ensure_sidecar_started_public(&app, &state).await?;

    let manager = &state.manager;
    manager
        .send_command("policy_get_groups", serde_json::json!({}))
        .await
}
