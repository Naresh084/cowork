// Deep Agents Integration Commands
// Handles commands for slash commands and memory system

use crate::commands::agent::{AgentState, ensure_sidecar_started};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, State};

// ============================================================================
// Command Types
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CommandInfo {
    pub name: String,
    pub display_name: String,
    pub description: String,
    pub version: String,
    pub author: Option<String>,
    pub aliases: Vec<String>,
    pub category: String,
    pub icon: Option<String>,
    pub arguments: Vec<CommandArgument>,
    #[serde(rename = "type")]
    pub command_type: String,
    pub requires_session: bool,
    pub requires_working_dir: bool,
    pub auto_suggest: bool,
    pub priority: i32,
    pub source: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CommandArgument {
    pub name: String,
    #[serde(rename = "type")]
    pub arg_type: String,
    pub required: bool,
    pub default: Option<serde_json::Value>,
    pub description: Option<String>,
    pub options: Option<Vec<CommandOption>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CommandOption {
    pub value: String,
    pub label: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CommandResult {
    pub success: bool,
    pub message: Option<String>,
    pub data: Option<serde_json::Value>,
    pub artifacts: Option<Vec<CommandArtifact>>,
    pub actions: Option<Vec<CommandAction>>,
    pub error: Option<CommandError>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CommandArtifact {
    #[serde(rename = "type")]
    pub artifact_type: String,
    pub path: Option<String>,
    pub content: Option<String>,
    pub description: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CommandAction {
    #[serde(rename = "type")]
    pub action_type: String,
    pub payload: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CommandError {
    pub code: String,
    pub message: String,
    pub suggestion: Option<String>,
}

// ============================================================================
// Memory Types
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Memory {
    pub id: String,
    pub title: String,
    pub content: String,
    pub group: String,
    pub tags: Vec<String>,
    pub source: String,
    pub confidence: f64,
    pub created_at: String,
    pub updated_at: String,
    pub access_count: i32,
    pub last_accessed_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateMemoryInput {
    pub title: String,
    pub content: String,
    pub group: String,
    pub tags: Option<Vec<String>>,
    pub source: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateMemoryInput {
    pub title: Option<String>,
    pub content: Option<String>,
    pub group: Option<String>,
    pub tags: Option<Vec<String>>,
}

// ============================================================================
// Command Commands
// ============================================================================

/// List all available slash commands
#[tauri::command]
pub async fn deep_command_list(
    app: AppHandle,
    state: State<'_, AgentState>,
    working_directory: Option<String>,
) -> Result<Vec<CommandInfo>, String> {
    ensure_sidecar_started(&app, &state).await?;

    let manager = &state.manager;
    let params = serde_json::json!({
        "workingDirectory": working_directory,
    });

    let result = manager.send_command("command_list", params).await?;
    serde_json::from_value(result).map_err(|e| format!("Failed to parse commands: {}", e))
}

/// Execute a slash command
#[tauri::command]
pub async fn deep_command_execute(
    app: AppHandle,
    state: State<'_, AgentState>,
    name: String,
    args: serde_json::Value,
    working_directory: Option<String>,
) -> Result<CommandResult, String> {
    ensure_sidecar_started(&app, &state).await?;

    let manager = &state.manager;
    let params = serde_json::json!({
        "name": name,
        "args": args,
        "workingDirectory": working_directory,
    });

    let result = manager.send_command("command_execute", params).await?;
    serde_json::from_value(result).map_err(|e| format!("Failed to parse result: {}", e))
}

// ============================================================================
// Memory Commands
// ============================================================================

/// Initialize memory service for a working directory
#[tauri::command]
pub async fn deep_memory_init(
    app: AppHandle,
    state: State<'_, AgentState>,
    working_directory: String,
) -> Result<(), String> {
    ensure_sidecar_started(&app, &state).await?;

    let manager = &state.manager;
    let params = serde_json::json!({
        "workingDirectory": working_directory,
    });

    manager.send_command("deep_memory_init", params).await?;
    Ok(())
}

/// List all memories
#[tauri::command]
pub async fn deep_memory_list(
    app: AppHandle,
    state: State<'_, AgentState>,
    working_directory: String,
    group: Option<String>,
) -> Result<Vec<Memory>, String> {
    ensure_sidecar_started(&app, &state).await?;

    let manager = &state.manager;
    let params = serde_json::json!({
        "workingDirectory": working_directory,
        "group": group,
    });

    let result = manager.send_command("deep_memory_list", params).await?;
    // Handler returns { memories: [...] }
    let wrapper: serde_json::Value = serde_json::from_value(result).map_err(|e| format!("Failed to parse: {}", e))?;
    let memories = wrapper.get("memories").cloned().unwrap_or(serde_json::json!([]));
    serde_json::from_value(memories).map_err(|e| format!("Failed to parse memories: {}", e))
}

/// Create a new memory
#[tauri::command]
pub async fn deep_memory_create(
    app: AppHandle,
    state: State<'_, AgentState>,
    working_directory: String,
    input: CreateMemoryInput,
) -> Result<Memory, String> {
    ensure_sidecar_started(&app, &state).await?;

    let manager = &state.manager;
    let params = serde_json::json!({
        "workingDirectory": working_directory,
        "title": input.title,
        "content": input.content,
        "group": input.group,
        "tags": input.tags.unwrap_or_default(),
        "source": input.source.unwrap_or_else(|| "manual".to_string()),
    });

    let result = manager.send_command("deep_memory_create", params).await?;
    serde_json::from_value(result).map_err(|e| format!("Failed to parse memory: {}", e))
}

/// Read a memory by ID
#[tauri::command]
pub async fn deep_memory_read(
    app: AppHandle,
    state: State<'_, AgentState>,
    working_directory: String,
    id: String,
) -> Result<Memory, String> {
    ensure_sidecar_started(&app, &state).await?;

    let manager = &state.manager;
    let params = serde_json::json!({
        "workingDirectory": working_directory,
        "memoryId": id,
    });

    let result = manager.send_command("deep_memory_read", params).await?;
    serde_json::from_value(result).map_err(|e| format!("Failed to parse memory: {}", e))
}

/// Update a memory
#[tauri::command]
pub async fn deep_memory_update(
    app: AppHandle,
    state: State<'_, AgentState>,
    working_directory: String,
    id: String,
    updates: UpdateMemoryInput,
) -> Result<Memory, String> {
    ensure_sidecar_started(&app, &state).await?;

    let manager = &state.manager;
    let params = serde_json::json!({
        "workingDirectory": working_directory,
        "memoryId": id,
        "title": updates.title,
        "content": updates.content,
        "group": updates.group,
        "tags": updates.tags,
    });

    let result = manager.send_command("deep_memory_update", params).await?;
    serde_json::from_value(result).map_err(|e| format!("Failed to parse memory: {}", e))
}

/// Delete a memory
#[tauri::command]
pub async fn deep_memory_delete(
    app: AppHandle,
    state: State<'_, AgentState>,
    working_directory: String,
    id: String,
) -> Result<bool, String> {
    ensure_sidecar_started(&app, &state).await?;

    let manager = &state.manager;
    let params = serde_json::json!({
        "workingDirectory": working_directory,
        "memoryId": id,
    });

    let result = manager.send_command("deep_memory_delete", params).await?;
    // Handler returns { success: bool }
    let wrapper: serde_json::Value = serde_json::from_value(result).map_err(|e| format!("Failed to parse: {}", e))?;
    wrapper.get("success").and_then(|v| v.as_bool()).ok_or_else(|| "Invalid response".to_string())
}

/// Search memories
#[tauri::command]
pub async fn deep_memory_search(
    app: AppHandle,
    state: State<'_, AgentState>,
    working_directory: String,
    query: String,
    limit: Option<i32>,
) -> Result<Vec<Memory>, String> {
    ensure_sidecar_started(&app, &state).await?;

    let manager = &state.manager;
    let params = serde_json::json!({
        "workingDirectory": working_directory,
        "query": query,
        "limit": limit.unwrap_or(20),
    });

    let result = manager.send_command("deep_memory_search", params).await?;
    // Handler returns { memories: [...] }
    let wrapper: serde_json::Value = serde_json::from_value(result).map_err(|e| format!("Failed to parse: {}", e))?;
    let memories = wrapper.get("memories").cloned().unwrap_or(serde_json::json!([]));
    serde_json::from_value(memories).map_err(|e| format!("Failed to parse memories: {}", e))
}

/// List memory groups
#[tauri::command]
pub async fn deep_memory_list_groups(
    app: AppHandle,
    state: State<'_, AgentState>,
    working_directory: String,
) -> Result<Vec<String>, String> {
    ensure_sidecar_started(&app, &state).await?;

    let manager = &state.manager;
    let params = serde_json::json!({
        "workingDirectory": working_directory,
    });

    let result = manager.send_command("deep_memory_list_groups", params).await?;
    // Handler returns { groups: [...] }
    let wrapper: serde_json::Value = serde_json::from_value(result).map_err(|e| format!("Failed to parse: {}", e))?;
    let groups = wrapper.get("groups").cloned().unwrap_or(serde_json::json!([]));
    serde_json::from_value(groups).map_err(|e| format!("Failed to parse groups: {}", e))
}

/// Create a memory group
#[tauri::command]
pub async fn deep_memory_create_group(
    app: AppHandle,
    state: State<'_, AgentState>,
    working_directory: String,
    name: String,
) -> Result<(), String> {
    ensure_sidecar_started(&app, &state).await?;

    let manager = &state.manager;
    let params = serde_json::json!({
        "workingDirectory": working_directory,
        "name": name,
    });

    manager.send_command("deep_memory_create_group", params).await?;
    Ok(())
}

/// Delete a memory group
#[tauri::command]
pub async fn deep_memory_delete_group(
    app: AppHandle,
    state: State<'_, AgentState>,
    working_directory: String,
    name: String,
) -> Result<(), String> {
    ensure_sidecar_started(&app, &state).await?;

    let manager = &state.manager;
    let params = serde_json::json!({
        "workingDirectory": working_directory,
        "name": name,
    });

    manager.send_command("deep_memory_delete_group", params).await?;
    Ok(())
}

// ============================================================================
// Marketplace Commands
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MarketplaceCommand {
    pub id: String,
    pub manifest: serde_json::Value,
    pub download_url: String,
    pub checksum: String,
    pub downloads: i32,
    pub rating: f64,
    pub verified: bool,
    pub author: String,
    pub description: String,
    pub tags: Vec<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InstalledMarketplaceCommand {
    pub id: String,
    pub manifest: serde_json::Value,
    pub installed_at: String,
    pub updated_at: String,
    pub source: String,
    pub source_url: Option<String>,
    pub version: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InstallResult {
    pub success: bool,
    pub command_id: String,
    pub message: String,
    pub installed_command: Option<InstalledMarketplaceCommand>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateInfo {
    pub command_id: String,
    pub current_version: String,
    pub latest_version: String,
}

/// Search the marketplace
#[tauri::command]
pub async fn marketplace_search(
    app: AppHandle,
    state: State<'_, AgentState>,
    query: Option<String>,
    category: Option<String>,
    tags: Option<Vec<String>>,
    verified: Option<bool>,
    limit: Option<i32>,
    offset: Option<i32>,
) -> Result<Vec<MarketplaceCommand>, String> {
    ensure_sidecar_started(&app, &state).await?;

    let manager = &state.manager;
    let params = serde_json::json!({
        "query": query,
        "category": category,
        "tags": tags,
        "verified": verified,
        "limit": limit,
        "offset": offset,
    });

    let result = manager.send_command("marketplace_search", params).await?;
    // Handler returns { commands: [...] }
    let wrapper: serde_json::Value = serde_json::from_value(result).map_err(|e| format!("Failed to parse: {}", e))?;
    let commands = wrapper.get("commands").cloned().unwrap_or(serde_json::json!([]));
    serde_json::from_value(commands).map_err(|e| format!("Failed to parse marketplace commands: {}", e))
}

/// Get a specific marketplace command
#[tauri::command]
pub async fn marketplace_get_command(
    app: AppHandle,
    state: State<'_, AgentState>,
    command_id: String,
) -> Result<MarketplaceCommand, String> {
    ensure_sidecar_started(&app, &state).await?;

    let manager = &state.manager;
    let params = serde_json::json!({
        "commandId": command_id,
    });

    let result = manager.send_command("marketplace_get_command", params).await?;
    serde_json::from_value(result).map_err(|e| format!("Failed to parse command: {}", e))
}

/// Install a command from marketplace
#[tauri::command]
pub async fn marketplace_install(
    app: AppHandle,
    state: State<'_, AgentState>,
    command_id: String,
) -> Result<InstallResult, String> {
    ensure_sidecar_started(&app, &state).await?;

    let manager = &state.manager;
    let params = serde_json::json!({
        "commandId": command_id,
    });

    let result = manager.send_command("marketplace_install", params).await?;
    serde_json::from_value(result).map_err(|e| format!("Failed to parse install result: {}", e))
}

/// Uninstall a command
#[tauri::command]
pub async fn marketplace_uninstall(
    app: AppHandle,
    state: State<'_, AgentState>,
    command_id: String,
) -> Result<InstallResult, String> {
    ensure_sidecar_started(&app, &state).await?;

    let manager = &state.manager;
    let params = serde_json::json!({
        "commandId": command_id,
    });

    let result = manager.send_command("marketplace_uninstall", params).await?;
    serde_json::from_value(result).map_err(|e| format!("Failed to parse uninstall result: {}", e))
}

/// Update an installed command
#[tauri::command]
pub async fn marketplace_update(
    app: AppHandle,
    state: State<'_, AgentState>,
    command_id: String,
) -> Result<InstallResult, String> {
    ensure_sidecar_started(&app, &state).await?;

    let manager = &state.manager;
    let params = serde_json::json!({
        "commandId": command_id,
    });

    let result = manager.send_command("marketplace_update", params).await?;
    serde_json::from_value(result).map_err(|e| format!("Failed to parse update result: {}", e))
}

/// List installed marketplace commands
#[tauri::command]
pub async fn marketplace_list_installed(
    app: AppHandle,
    state: State<'_, AgentState>,
) -> Result<Vec<InstalledMarketplaceCommand>, String> {
    ensure_sidecar_started(&app, &state).await?;

    let manager = &state.manager;
    let params = serde_json::json!({});

    let result = manager.send_command("marketplace_list_installed", params).await?;
    // Handler returns { commands: [...] }
    let wrapper: serde_json::Value = serde_json::from_value(result).map_err(|e| format!("Failed to parse: {}", e))?;
    let commands = wrapper.get("commands").cloned().unwrap_or(serde_json::json!([]));
    serde_json::from_value(commands).map_err(|e| format!("Failed to parse installed commands: {}", e))
}

/// Check if a command is installed
#[tauri::command]
pub async fn marketplace_is_installed(
    app: AppHandle,
    state: State<'_, AgentState>,
    command_id: String,
) -> Result<bool, String> {
    ensure_sidecar_started(&app, &state).await?;

    let manager = &state.manager;
    let params = serde_json::json!({
        "commandId": command_id,
    });

    let result = manager.send_command("marketplace_is_installed", params).await?;
    // Handler returns { isInstalled: bool }
    let wrapper: serde_json::Value = serde_json::from_value(result).map_err(|e| format!("Failed to parse: {}", e))?;
    wrapper.get("isInstalled").and_then(|v| v.as_bool()).ok_or_else(|| "Invalid response".to_string())
}

/// Check for updates for installed commands
#[tauri::command]
pub async fn marketplace_check_updates(
    app: AppHandle,
    state: State<'_, AgentState>,
) -> Result<Vec<UpdateInfo>, String> {
    ensure_sidecar_started(&app, &state).await?;

    let manager = &state.manager;
    let params = serde_json::json!({});

    let result = manager.send_command("marketplace_check_updates", params).await?;
    // Handler returns { updates: [...] }
    let wrapper: serde_json::Value = serde_json::from_value(result).map_err(|e| format!("Failed to parse: {}", e))?;
    let updates = wrapper.get("updates").cloned().unwrap_or(serde_json::json!([]));
    serde_json::from_value(updates).map_err(|e| format!("Failed to parse updates: {}", e))
}
