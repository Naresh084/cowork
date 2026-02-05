use crate::commands::agent::AgentState;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, State};

// ============================================================================
// Connector Types
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectorSource {
    #[serde(rename = "type")]
    pub source_type: String,
    pub path: String,
    pub priority: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TransportConfig {
    #[serde(rename = "type")]
    pub transport_type: String,
    pub command: Option<String>,
    pub args: Option<Vec<String>>,
    pub url: Option<String>,
    pub headers: Option<std::collections::HashMap<String, String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SecretDefinition {
    pub key: String,
    pub env_var: Option<String>,
    pub description: String,
    pub required: bool,
    pub placeholder: Option<String>,
    pub validation: Option<String>,
    pub link: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OAuthConfig {
    pub provider: String,
    pub flow: String,
    pub scopes: Vec<String>,
    pub authorization_url: Option<String>,
    pub token_url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AuthConfig {
    #[serde(rename = "type")]
    pub auth_type: String,
    pub secrets: Option<Vec<SecretDefinition>>,
    pub oauth: Option<OAuthConfig>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectorManifest {
    pub id: String,
    pub name: String,
    pub display_name: String,
    pub description: String,
    pub version: String,
    pub icon: String,
    pub category: String,
    pub tags: Vec<String>,
    pub transport: TransportConfig,
    pub auth: AuthConfig,
    pub source: ConnectorSource,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MCPTool {
    pub name: String,
    pub description: Option<String>,
    pub input_schema: Option<serde_json::Value>,
    pub connector_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MCPResource {
    pub uri: String,
    pub name: String,
    pub description: Option<String>,
    pub mime_type: Option<String>,
    pub connector_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MCPPrompt {
    pub name: String,
    pub description: Option<String>,
    pub arguments: Option<Vec<serde_json::Value>>,
    pub connector_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectorCapabilities {
    pub tools: Vec<MCPTool>,
    pub resources: Vec<MCPResource>,
    pub prompts: Vec<MCPPrompt>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SecretsStatus {
    pub configured: bool,
    pub missing: Vec<String>,
    pub provided: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectorState {
    pub id: String,
    pub status: String,
    pub error: Option<String>,
    pub tools: Vec<MCPTool>,
    pub resources: Vec<MCPResource>,
    pub prompts: Vec<MCPPrompt>,
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
// Connector Commands
// ============================================================================

/// Discover all available connectors from all sources
#[tauri::command]
pub async fn discover_connectors(
    app: AppHandle,
    state: State<'_, AgentState>,
    working_directory: Option<String>,
) -> Result<serde_json::Value, String> {
    ensure_sidecar(&app, &state).await?;

    let manager = &state.manager;
    let params = serde_json::json!({
        "workingDirectory": working_directory,
    });

    manager.send_command("discover_connectors", params).await
}

/// Install a connector from marketplace to managed directory
#[tauri::command]
pub async fn install_connector(
    app: AppHandle,
    state: State<'_, AgentState>,
    connector_id: String,
) -> Result<(), String> {
    ensure_sidecar(&app, &state).await?;

    let manager = &state.manager;
    let params = serde_json::json!({
        "connectorId": connector_id,
    });

    manager.send_command("install_connector", params).await?;
    Ok(())
}

/// Uninstall a connector from managed directory
#[tauri::command]
pub async fn uninstall_connector(
    app: AppHandle,
    state: State<'_, AgentState>,
    connector_id: String,
) -> Result<(), String> {
    ensure_sidecar(&app, &state).await?;

    let manager = &state.manager;
    let params = serde_json::json!({
        "connectorId": connector_id,
    });

    manager.send_command("uninstall_connector", params).await?;
    Ok(())
}

/// Connect to a connector's MCP server
#[tauri::command]
pub async fn connect_connector(
    app: AppHandle,
    state: State<'_, AgentState>,
    connector_id: String,
) -> Result<ConnectorCapabilities, String> {
    ensure_sidecar(&app, &state).await?;

    let manager = &state.manager;
    let params = serde_json::json!({
        "connectorId": connector_id,
    });

    let result = manager.send_command("connect_connector", params).await?;
    serde_json::from_value(result).map_err(|e| format!("Failed to parse capabilities: {}", e))
}

/// Disconnect from a connector's MCP server
#[tauri::command]
pub async fn disconnect_connector(
    app: AppHandle,
    state: State<'_, AgentState>,
    connector_id: String,
) -> Result<(), String> {
    ensure_sidecar(&app, &state).await?;

    let manager = &state.manager;
    let params = serde_json::json!({
        "connectorId": connector_id,
    });

    manager.send_command("disconnect_connector", params).await?;
    Ok(())
}

/// Reconnect to a connector (disconnect and connect again)
#[tauri::command]
pub async fn reconnect_connector(
    app: AppHandle,
    state: State<'_, AgentState>,
    connector_id: String,
) -> Result<ConnectorCapabilities, String> {
    ensure_sidecar(&app, &state).await?;

    let manager = &state.manager;
    let params = serde_json::json!({
        "connectorId": connector_id,
    });

    let result = manager.send_command("reconnect_connector", params).await?;
    serde_json::from_value(result).map_err(|e| format!("Failed to parse capabilities: {}", e))
}

/// Configure secrets for a connector
#[tauri::command]
pub async fn configure_connector_secrets(
    app: AppHandle,
    state: State<'_, AgentState>,
    connector_id: String,
    secrets: std::collections::HashMap<String, String>,
) -> Result<(), String> {
    ensure_sidecar(&app, &state).await?;

    let manager = &state.manager;
    let params = serde_json::json!({
        "connectorId": connector_id,
        "secrets": secrets,
    });

    manager.send_command("configure_connector_secrets", params).await?;
    Ok(())
}

/// Get secrets status for a connector
#[tauri::command]
pub async fn get_connector_secrets_status(
    app: AppHandle,
    state: State<'_, AgentState>,
    connector_id: String,
) -> Result<SecretsStatus, String> {
    ensure_sidecar(&app, &state).await?;

    let manager = &state.manager;
    let params = serde_json::json!({
        "connectorId": connector_id,
    });

    let result = manager.send_command("get_connector_secrets_status", params).await?;
    serde_json::from_value(result).map_err(|e| format!("Failed to parse secrets status: {}", e))
}

/// Get connector status
#[tauri::command]
pub async fn get_connector_status(
    app: AppHandle,
    state: State<'_, AgentState>,
    connector_id: String,
) -> Result<String, String> {
    ensure_sidecar(&app, &state).await?;

    let manager = &state.manager;
    let params = serde_json::json!({
        "connectorId": connector_id,
    });

    let result = manager.send_command("get_connector_status", params).await?;
    let status = result
        .get("status")
        .and_then(|s| s.as_str())
        .ok_or("Invalid response format: missing status")?;

    Ok(status.to_string())
}

/// Create a custom connector
#[tauri::command]
pub async fn create_connector(
    app: AppHandle,
    state: State<'_, AgentState>,
    params: serde_json::Value,
) -> Result<serde_json::Value, String> {
    ensure_sidecar(&app, &state).await?;

    let manager = &state.manager;
    manager.send_command("create_connector", params).await
}

/// Call a tool on a connector
#[tauri::command]
pub async fn connector_call_tool(
    app: AppHandle,
    state: State<'_, AgentState>,
    connector_id: String,
    tool_name: String,
    args: serde_json::Value,
) -> Result<serde_json::Value, String> {
    ensure_sidecar(&app, &state).await?;

    let manager = &state.manager;
    let params = serde_json::json!({
        "connectorId": connector_id,
        "toolName": tool_name,
        "args": args,
    });

    manager.send_command("connector_call_tool", params).await
}

/// Get all tools from all connected connectors
#[tauri::command]
pub async fn get_all_connector_tools(
    app: AppHandle,
    state: State<'_, AgentState>,
) -> Result<Vec<MCPTool>, String> {
    ensure_sidecar(&app, &state).await?;

    let manager = &state.manager;
    let params = serde_json::json!({});

    let result = manager.send_command("get_all_connector_tools", params).await?;
    let tools = result
        .get("tools")
        .and_then(|t| t.as_array())
        .ok_or("Invalid response format: missing tools array")?;

    serde_json::from_value(serde_json::Value::Array(tools.clone()))
        .map_err(|e| format!("Failed to parse tools: {}", e))
}

/// Get all connector states
#[tauri::command]
pub async fn get_all_connector_states(
    app: AppHandle,
    state: State<'_, AgentState>,
) -> Result<serde_json::Value, String> {
    ensure_sidecar(&app, &state).await?;

    let manager = &state.manager;
    let params = serde_json::json!({});

    manager.send_command("get_all_connector_states", params).await
}

/// Connect all enabled connectors
#[tauri::command]
pub async fn connect_all_connectors(
    app: AppHandle,
    state: State<'_, AgentState>,
    connector_ids: Vec<String>,
) -> Result<serde_json::Value, String> {
    ensure_sidecar(&app, &state).await?;

    let manager = &state.manager;
    let params = serde_json::json!({
        "connectorIds": connector_ids,
    });

    manager.send_command("connect_all_connectors", params).await
}

/// Disconnect all connectors
#[tauri::command]
pub async fn disconnect_all_connectors(
    app: AppHandle,
    state: State<'_, AgentState>,
) -> Result<(), String> {
    ensure_sidecar(&app, &state).await?;

    let manager = &state.manager;
    let params = serde_json::json!({});

    manager.send_command("disconnect_all_connectors", params).await?;
    Ok(())
}

// ============================================================================
// OAuth Commands
// ============================================================================

/// OAuth flow result from the sidecar
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OAuthFlowResult {
    #[serde(rename = "type")]
    pub flow_type: String,
    pub url: Option<String>,
    pub user_code: Option<String>,
    pub verification_url: Option<String>,
    pub expires_in: Option<i32>,
}

/// Start OAuth flow for a connector
#[tauri::command]
pub async fn start_connector_oauth_flow(
    app: AppHandle,
    state: State<'_, AgentState>,
    connector_id: String,
) -> Result<OAuthFlowResult, String> {
    ensure_sidecar(&app, &state).await?;

    let manager = &state.manager;
    let params = serde_json::json!({
        "connectorId": connector_id,
    });

    let result = manager.send_command("start_connector_oauth_flow", params).await?;
    serde_json::from_value(result).map_err(|e| format!("Failed to parse OAuth flow result: {}", e))
}

/// Poll OAuth device code for completion
#[tauri::command]
pub async fn poll_oauth_device_code(
    app: AppHandle,
    state: State<'_, AgentState>,
    connector_id: String,
) -> Result<bool, String> {
    ensure_sidecar(&app, &state).await?;

    let manager = &state.manager;
    let params = serde_json::json!({
        "connectorId": connector_id,
    });

    let result = manager.send_command("poll_oauth_device_code", params).await?;
    result
        .get("complete")
        .and_then(|c| c.as_bool())
        .ok_or_else(|| "Invalid response format: missing complete field".to_string())
}

/// OAuth status for a connector
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OAuthStatus {
    pub authenticated: bool,
    pub expires_at: Option<i64>,
}

/// Get OAuth status for a connector
#[tauri::command]
pub async fn get_oauth_status(
    app: AppHandle,
    state: State<'_, AgentState>,
    connector_id: String,
) -> Result<OAuthStatus, String> {
    ensure_sidecar(&app, &state).await?;

    let manager = &state.manager;
    let params = serde_json::json!({
        "connectorId": connector_id,
    });

    let result = manager.send_command("get_oauth_status", params).await?;
    serde_json::from_value(result).map_err(|e| format!("Failed to parse OAuth status: {}", e))
}

/// Refresh OAuth tokens for a connector
#[tauri::command]
pub async fn refresh_oauth_tokens(
    app: AppHandle,
    state: State<'_, AgentState>,
    connector_id: String,
) -> Result<(), String> {
    ensure_sidecar(&app, &state).await?;

    let manager = &state.manager;
    let params = serde_json::json!({
        "connectorId": connector_id,
    });

    manager.send_command("refresh_oauth_tokens", params).await?;
    Ok(())
}

/// Revoke OAuth tokens for a connector
#[tauri::command]
pub async fn revoke_oauth_tokens(
    app: AppHandle,
    state: State<'_, AgentState>,
    connector_id: String,
) -> Result<(), String> {
    ensure_sidecar(&app, &state).await?;

    let manager = &state.manager;
    let params = serde_json::json!({
        "connectorId": connector_id,
    });

    manager.send_command("revoke_oauth_tokens", params).await?;
    Ok(())
}

// ============================================================================
// MCP Apps Commands
// ============================================================================

/// MCP App definition
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MCPApp {
    pub uri: String,
    pub name: String,
    pub description: Option<String>,
    pub mime_type: Option<String>,
    pub connector_id: String,
}

/// Get all MCP apps from connected connectors
#[tauri::command]
pub async fn get_connector_apps(
    app: AppHandle,
    state: State<'_, AgentState>,
) -> Result<serde_json::Value, String> {
    ensure_sidecar(&app, &state).await?;

    let manager = &state.manager;
    let params = serde_json::json!({});

    manager.send_command("get_connector_apps", params).await
}

/// Get HTML content for an MCP app
#[tauri::command]
pub async fn get_connector_app_content(
    app: AppHandle,
    state: State<'_, AgentState>,
    connector_id: String,
    app_uri: String,
) -> Result<String, String> {
    ensure_sidecar(&app, &state).await?;

    let manager = &state.manager;
    let params = serde_json::json!({
        "connectorId": connector_id,
        "appUri": app_uri,
    });

    let result = manager.send_command("get_connector_app_content", params).await?;
    result
        .get("content")
        .and_then(|c| c.as_str())
        .map(|s| s.to_string())
        .ok_or_else(|| "Invalid response format: missing content field".to_string())
}

/// Call a tool from an MCP app (via iframe)
#[tauri::command]
pub async fn call_connector_app_tool(
    app: AppHandle,
    state: State<'_, AgentState>,
    connector_id: String,
    tool_name: String,
    args: serde_json::Value,
) -> Result<serde_json::Value, String> {
    ensure_sidecar(&app, &state).await?;

    let manager = &state.manager;
    let params = serde_json::json!({
        "connectorId": connector_id,
        "toolName": tool_name,
        "args": args,
    });

    manager.send_command("call_connector_app_tool", params).await
}
