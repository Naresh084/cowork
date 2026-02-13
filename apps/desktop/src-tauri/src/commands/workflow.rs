use crate::commands::agent::{ensure_sidecar_started_public, AgentState};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, State};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkflowDefinition {
    pub id: String,
    pub version: i64,
    pub status: String,
    pub name: String,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub tags: Vec<String>,
    #[serde(default)]
    pub schema_version: String,
    #[serde(default)]
    pub triggers: Vec<serde_json::Value>,
    #[serde(default)]
    pub nodes: Vec<serde_json::Value>,
    #[serde(default)]
    pub edges: Vec<serde_json::Value>,
    #[serde(default)]
    pub defaults: serde_json::Value,
    #[serde(default)]
    pub permissions_profile: Option<String>,
    #[serde(default)]
    pub created_by: Option<String>,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkflowRun {
    pub id: String,
    pub workflow_id: String,
    pub workflow_version: i64,
    pub trigger_type: String,
    #[serde(default)]
    pub trigger_context: serde_json::Value,
    #[serde(default)]
    pub input: serde_json::Value,
    #[serde(default)]
    pub output: Option<serde_json::Value>,
    pub status: String,
    #[serde(default)]
    pub started_at: Option<i64>,
    #[serde(default)]
    pub completed_at: Option<i64>,
    #[serde(default)]
    pub current_node_id: Option<String>,
    #[serde(default)]
    pub error: Option<String>,
    #[serde(default)]
    pub correlation_id: Option<String>,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkflowEvent {
    pub id: String,
    pub run_id: String,
    pub ts: i64,
    #[serde(rename = "type")]
    pub event_type: String,
    #[serde(default)]
    pub payload: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkflowValidationReport {
    pub valid: bool,
    #[serde(default)]
    pub errors: Vec<String>,
    #[serde(default)]
    pub warnings: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkflowRunDetails {
    pub run: WorkflowRun,
    #[serde(default)]
    pub node_runs: Vec<serde_json::Value>,
    #[serde(default)]
    pub events: Vec<WorkflowEvent>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkflowScheduledTaskSummary {
    pub workflow_id: String,
    pub workflow_version: i64,
    pub name: String,
    pub status: String,
    #[serde(default)]
    pub schedules: Vec<serde_json::Value>,
    pub enabled: bool,
    #[serde(default)]
    pub next_run_at: Option<i64>,
    pub run_count: i64,
    #[serde(default)]
    pub last_run_at: Option<i64>,
    #[serde(default)]
    pub last_run_status: Option<String>,
}

#[tauri::command]
pub async fn workflow_list(
    app: AppHandle,
    state: State<'_, AgentState>,
    limit: Option<u32>,
    offset: Option<u32>,
) -> Result<Vec<WorkflowDefinition>, String> {
    ensure_sidecar_started_public(&app, &state).await?;

    let result = state
        .manager
        .send_command(
            "workflow_list",
            serde_json::json!({
                "limit": limit,
                "offset": offset,
            }),
        )
        .await?;

    serde_json::from_value(result).map_err(|e| format!("Failed to parse workflows: {}", e))
}

#[tauri::command]
pub async fn workflow_get(
    app: AppHandle,
    state: State<'_, AgentState>,
    workflow_id: String,
    version: Option<u32>,
) -> Result<Option<WorkflowDefinition>, String> {
    ensure_sidecar_started_public(&app, &state).await?;

    let result = state
        .manager
        .send_command(
            "workflow_get",
            serde_json::json!({
                "workflowId": workflow_id,
                "version": version,
            }),
        )
        .await?;

    serde_json::from_value(result).map_err(|e| format!("Failed to parse workflow: {}", e))
}

#[tauri::command]
pub async fn workflow_create_draft(
    app: AppHandle,
    state: State<'_, AgentState>,
    input: serde_json::Value,
) -> Result<WorkflowDefinition, String> {
    ensure_sidecar_started_public(&app, &state).await?;

    let result = state.manager.send_command("workflow_create_draft", input).await?;
    serde_json::from_value(result).map_err(|e| format!("Failed to parse workflow draft: {}", e))
}

#[tauri::command]
pub async fn workflow_create_from_prompt(
    app: AppHandle,
    state: State<'_, AgentState>,
    input: serde_json::Value,
) -> Result<WorkflowDefinition, String> {
    ensure_sidecar_started_public(&app, &state).await?;

    let result = state
        .manager
        .send_command("workflow_create_from_prompt", input)
        .await?;
    serde_json::from_value(result).map_err(|e| format!("Failed to parse workflow draft: {}", e))
}

#[tauri::command]
pub async fn workflow_update_draft(
    app: AppHandle,
    state: State<'_, AgentState>,
    workflow_id: String,
    updates: serde_json::Value,
) -> Result<WorkflowDefinition, String> {
    ensure_sidecar_started_public(&app, &state).await?;

    let result = state
        .manager
        .send_command(
            "workflow_update_draft",
            serde_json::json!({
                "workflowId": workflow_id,
                "updates": updates,
            }),
        )
        .await?;

    serde_json::from_value(result).map_err(|e| format!("Failed to parse workflow draft: {}", e))
}

#[tauri::command]
pub async fn workflow_validate(
    app: AppHandle,
    state: State<'_, AgentState>,
    definition: serde_json::Value,
) -> Result<WorkflowValidationReport, String> {
    ensure_sidecar_started_public(&app, &state).await?;

    let result = state
        .manager
        .send_command("workflow_validate", definition)
        .await?;

    serde_json::from_value(result)
        .map_err(|e| format!("Failed to parse workflow validation report: {}", e))
}

#[tauri::command]
pub async fn workflow_publish(
    app: AppHandle,
    state: State<'_, AgentState>,
    workflow_id: String,
) -> Result<WorkflowDefinition, String> {
    ensure_sidecar_started_public(&app, &state).await?;

    let result = state
        .manager
        .send_command(
            "workflow_publish",
            serde_json::json!({ "workflowId": workflow_id }),
        )
        .await?;

    serde_json::from_value(result).map_err(|e| format!("Failed to parse workflow: {}", e))
}

#[tauri::command]
pub async fn workflow_archive(
    app: AppHandle,
    state: State<'_, AgentState>,
    workflow_id: String,
) -> Result<WorkflowDefinition, String> {
    ensure_sidecar_started_public(&app, &state).await?;

    let result = state
        .manager
        .send_command(
            "workflow_archive",
            serde_json::json!({ "workflowId": workflow_id }),
        )
        .await?;

    serde_json::from_value(result).map_err(|e| format!("Failed to parse workflow: {}", e))
}

#[tauri::command]
pub async fn workflow_run(
    app: AppHandle,
    state: State<'_, AgentState>,
    input: serde_json::Value,
) -> Result<WorkflowRun, String> {
    ensure_sidecar_started_public(&app, &state).await?;

    let result = state.manager.send_command("workflow_run", input).await?;
    serde_json::from_value(result).map_err(|e| format!("Failed to parse workflow run: {}", e))
}

#[tauri::command]
pub async fn workflow_list_runs(
    app: AppHandle,
    state: State<'_, AgentState>,
    workflow_id: Option<String>,
    status: Option<String>,
    limit: Option<u32>,
    offset: Option<u32>,
) -> Result<Vec<WorkflowRun>, String> {
    ensure_sidecar_started_public(&app, &state).await?;

    let result = state
        .manager
        .send_command(
            "workflow_list_runs",
            serde_json::json!({
                "workflowId": workflow_id,
                "status": status,
                "limit": limit,
                "offset": offset,
            }),
        )
        .await?;

    serde_json::from_value(result).map_err(|e| format!("Failed to parse workflow runs: {}", e))
}

#[tauri::command]
pub async fn workflow_get_run(
    app: AppHandle,
    state: State<'_, AgentState>,
    run_id: String,
) -> Result<WorkflowRunDetails, String> {
    ensure_sidecar_started_public(&app, &state).await?;

    let result = state
        .manager
        .send_command(
            "workflow_get_run",
            serde_json::json!({ "runId": run_id }),
        )
        .await?;

    serde_json::from_value(result).map_err(|e| format!("Failed to parse workflow run details: {}", e))
}

#[tauri::command]
pub async fn workflow_get_run_events(
    app: AppHandle,
    state: State<'_, AgentState>,
    run_id: String,
    since_ts: Option<i64>,
) -> Result<Vec<WorkflowEvent>, String> {
    ensure_sidecar_started_public(&app, &state).await?;

    let result = state
        .manager
        .send_command(
            "workflow_get_run_events",
            serde_json::json!({
                "runId": run_id,
                "sinceTs": since_ts,
            }),
        )
        .await?;

    serde_json::from_value(result).map_err(|e| format!("Failed to parse workflow events: {}", e))
}

#[tauri::command]
pub async fn workflow_cancel_run(
    app: AppHandle,
    state: State<'_, AgentState>,
    run_id: String,
) -> Result<WorkflowRun, String> {
    ensure_sidecar_started_public(&app, &state).await?;

    let result = state
        .manager
        .send_command(
            "workflow_cancel_run",
            serde_json::json!({ "runId": run_id }),
        )
        .await?;

    serde_json::from_value(result).map_err(|e| format!("Failed to parse workflow run: {}", e))
}

#[tauri::command]
pub async fn workflow_pause_run(
    app: AppHandle,
    state: State<'_, AgentState>,
    run_id: String,
) -> Result<WorkflowRun, String> {
    ensure_sidecar_started_public(&app, &state).await?;

    let result = state
        .manager
        .send_command(
            "workflow_pause_run",
            serde_json::json!({ "runId": run_id }),
        )
        .await?;

    serde_json::from_value(result).map_err(|e| format!("Failed to parse workflow run: {}", e))
}

#[tauri::command]
pub async fn workflow_resume_run(
    app: AppHandle,
    state: State<'_, AgentState>,
    run_id: String,
) -> Result<WorkflowRun, String> {
    ensure_sidecar_started_public(&app, &state).await?;

    let result = state
        .manager
        .send_command(
            "workflow_resume_run",
            serde_json::json!({ "runId": run_id }),
        )
        .await?;

    serde_json::from_value(result).map_err(|e| format!("Failed to parse workflow run: {}", e))
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkflowBackfillResult {
    pub queued: u32,
}

#[tauri::command]
pub async fn workflow_backfill_schedule(
    app: AppHandle,
    state: State<'_, AgentState>,
    workflow_id: String,
    from: i64,
    to: i64,
) -> Result<WorkflowBackfillResult, String> {
    ensure_sidecar_started_public(&app, &state).await?;

    let result = state
        .manager
        .send_command(
            "workflow_backfill_schedule",
            serde_json::json!({
                "workflowId": workflow_id,
                "from": from,
                "to": to,
            }),
        )
        .await?;

    serde_json::from_value(result).map_err(|e| format!("Failed to parse backfill result: {}", e))
}

#[tauri::command]
pub async fn workflow_list_scheduled(
    app: AppHandle,
    state: State<'_, AgentState>,
    limit: Option<u32>,
    offset: Option<u32>,
) -> Result<Vec<WorkflowScheduledTaskSummary>, String> {
    ensure_sidecar_started_public(&app, &state).await?;

    let result = state
        .manager
        .send_command(
            "workflow_list_scheduled",
            serde_json::json!({
                "limit": limit,
                "offset": offset,
            }),
        )
        .await?;

    serde_json::from_value(result)
        .map_err(|e| format!("Failed to parse workflow scheduled tasks: {}", e))
}

#[tauri::command]
pub async fn workflow_pause_scheduled(
    app: AppHandle,
    state: State<'_, AgentState>,
    workflow_id: String,
) -> Result<serde_json::Value, String> {
    ensure_sidecar_started_public(&app, &state).await?;

    state
        .manager
        .send_command(
            "workflow_pause_scheduled",
            serde_json::json!({ "workflowId": workflow_id }),
        )
        .await
}

#[tauri::command]
pub async fn workflow_resume_scheduled(
    app: AppHandle,
    state: State<'_, AgentState>,
    workflow_id: String,
) -> Result<serde_json::Value, String> {
    ensure_sidecar_started_public(&app, &state).await?;

    state
        .manager
        .send_command(
            "workflow_resume_scheduled",
            serde_json::json!({ "workflowId": workflow_id }),
        )
        .await
}

#[tauri::command]
pub async fn workflow_evaluate_triggers(
    app: AppHandle,
    state: State<'_, AgentState>,
    message: String,
    workflow_ids: Option<Vec<String>>,
    min_confidence: Option<f64>,
    activation_threshold: Option<f64>,
    max_results: Option<u32>,
    auto_run: Option<bool>,
    input: Option<serde_json::Value>,
) -> Result<serde_json::Value, String> {
    ensure_sidecar_started_public(&app, &state).await?;

    state
        .manager
        .send_command(
            "workflow_evaluate_triggers",
            serde_json::json!({
                "message": message,
                "workflowIds": workflow_ids,
                "minConfidence": min_confidence,
                "activationThreshold": activation_threshold,
                "maxResults": max_results,
                "autoRun": auto_run.unwrap_or(false),
                "input": input.unwrap_or_else(|| serde_json::json!({})),
            }),
        )
        .await
}
