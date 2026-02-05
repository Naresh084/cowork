// Deep Agents Integration Commands
// Handles memory system commands

use crate::commands::agent::{AgentState, ensure_sidecar_started};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, State};

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

