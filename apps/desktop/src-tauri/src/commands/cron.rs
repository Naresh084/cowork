use crate::commands::agent::{ensure_sidecar_started_public, AgentState};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, State};

// ============================================================================
// Cron Schedule Types
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum CronSchedule {
    #[serde(rename = "at")]
    At { timestamp: i64 },
    #[serde(rename = "every")]
    Every {
        interval_ms: i64,
        #[serde(skip_serializing_if = "Option::is_none")]
        start_at: Option<i64>,
    },
    #[serde(rename = "cron")]
    Cron {
        expression: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        timezone: Option<String>,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CronJob {
    pub id: String,
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    pub prompt: String,
    pub schedule: CronSchedule,
    pub session_target: String, // "main" | "isolated"
    pub wake_mode: String,      // "next-heartbeat" | "now"
    pub working_directory: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,
    pub status: String, // "active" | "paused" | "completed" | "failed"
    #[serde(skip_serializing_if = "Option::is_none")]
    pub delete_after_run: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max_runs: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max_turns: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tags: Option<Vec<String>>,
    pub created_at: i64,
    pub updated_at: i64,
    pub run_count: u32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_run_at: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub next_run_at: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_status: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_error: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_duration_ms: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CronRun {
    pub id: String,
    pub job_id: String,
    pub session_id: String,
    pub started_at: i64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub completed_at: Option<i64>,
    pub result: String, // "success" | "error" | "timeout" | "cancelled"
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub summary: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub prompt_tokens: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub completion_tokens: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateCronJobInput {
    pub name: String,
    pub prompt: String,
    pub schedule: CronSchedule,
    pub working_directory: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub session_target: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub wake_mode: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub delete_after_run: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max_runs: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max_turns: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tags: Option<Vec<String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateCronJobInput {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub prompt: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub schedule: Option<CronSchedule>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub session_target: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub wake_mode: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub delete_after_run: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max_runs: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max_turns: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tags: Option<Vec<String>>,
}

// ============================================================================
// Tauri Commands
// ============================================================================

/// List all cron jobs
#[tauri::command]
pub async fn cron_list_jobs(
    app: AppHandle,
    state: State<'_, AgentState>,
) -> Result<Vec<CronJob>, String> {
    ensure_sidecar_started_public(&app, &state).await?;

    let manager = &state.manager;
    let result = manager
        .send_command("cron_list_jobs", serde_json::json!({}))
        .await?;

    serde_json::from_value(result).map_err(|e| format!("Failed to parse cron jobs: {}", e))
}

/// Get a specific cron job by ID
#[tauri::command]
pub async fn cron_get_job(
    app: AppHandle,
    state: State<'_, AgentState>,
    job_id: String,
) -> Result<CronJob, String> {
    ensure_sidecar_started_public(&app, &state).await?;

    let manager = &state.manager;
    let params = serde_json::json!({ "jobId": job_id });
    let result = manager.send_command("cron_get_job", params).await?;

    serde_json::from_value(result).map_err(|e| format!("Failed to parse cron job: {}", e))
}

/// Create a new cron job
#[tauri::command]
pub async fn cron_create_job(
    app: AppHandle,
    state: State<'_, AgentState>,
    input: CreateCronJobInput,
) -> Result<CronJob, String> {
    ensure_sidecar_started_public(&app, &state).await?;

    let manager = &state.manager;
    let params = serde_json::to_value(&input)
        .map_err(|e| format!("Failed to serialize input: {}", e))?;
    let result = manager.send_command("cron_create_job", params).await?;

    serde_json::from_value(result).map_err(|e| format!("Failed to parse created job: {}", e))
}

/// Update an existing cron job
#[tauri::command]
pub async fn cron_update_job(
    app: AppHandle,
    state: State<'_, AgentState>,
    job_id: String,
    input: UpdateCronJobInput,
) -> Result<CronJob, String> {
    ensure_sidecar_started_public(&app, &state).await?;

    let manager = &state.manager;
    let mut params = serde_json::to_value(&input)
        .map_err(|e| format!("Failed to serialize input: {}", e))?;
    params["jobId"] = serde_json::json!(job_id);
    let result = manager.send_command("cron_update_job", params).await?;

    serde_json::from_value(result).map_err(|e| format!("Failed to parse updated job: {}", e))
}

/// Delete a cron job
#[tauri::command]
pub async fn cron_delete_job(
    app: AppHandle,
    state: State<'_, AgentState>,
    job_id: String,
) -> Result<(), String> {
    ensure_sidecar_started_public(&app, &state).await?;

    let manager = &state.manager;
    let params = serde_json::json!({ "jobId": job_id });
    manager.send_command("cron_delete_job", params).await?;

    Ok(())
}

/// Pause a cron job
#[tauri::command]
pub async fn cron_pause_job(
    app: AppHandle,
    state: State<'_, AgentState>,
    job_id: String,
) -> Result<CronJob, String> {
    ensure_sidecar_started_public(&app, &state).await?;

    let manager = &state.manager;
    let params = serde_json::json!({ "jobId": job_id });
    let result = manager.send_command("cron_pause_job", params).await?;

    serde_json::from_value(result).map_err(|e| format!("Failed to parse job: {}", e))
}

/// Resume a paused cron job
#[tauri::command]
pub async fn cron_resume_job(
    app: AppHandle,
    state: State<'_, AgentState>,
    job_id: String,
) -> Result<CronJob, String> {
    ensure_sidecar_started_public(&app, &state).await?;

    let manager = &state.manager;
    let params = serde_json::json!({ "jobId": job_id });
    let result = manager.send_command("cron_resume_job", params).await?;

    serde_json::from_value(result).map_err(|e| format!("Failed to parse job: {}", e))
}

/// Trigger immediate execution of a cron job
#[tauri::command]
pub async fn cron_trigger_job(
    app: AppHandle,
    state: State<'_, AgentState>,
    job_id: String,
) -> Result<CronRun, String> {
    ensure_sidecar_started_public(&app, &state).await?;

    let manager = &state.manager;
    let params = serde_json::json!({ "jobId": job_id });
    let result = manager.send_command("cron_trigger_job", params).await?;

    serde_json::from_value(result).map_err(|e| format!("Failed to parse run result: {}", e))
}

/// Get run history for a cron job
#[tauri::command]
pub async fn cron_get_runs(
    app: AppHandle,
    state: State<'_, AgentState>,
    job_id: String,
    limit: Option<u32>,
    offset: Option<u32>,
) -> Result<Vec<CronRun>, String> {
    ensure_sidecar_started_public(&app, &state).await?;

    let manager = &state.manager;
    let params = serde_json::json!({
        "jobId": job_id,
        "limit": limit,
        "offset": offset,
    });
    let result = manager.send_command("cron_get_runs", params).await?;

    serde_json::from_value(result).map_err(|e| format!("Failed to parse runs: {}", e))
}

/// Get cron service status
#[tauri::command]
pub async fn cron_get_status(
    app: AppHandle,
    state: State<'_, AgentState>,
) -> Result<serde_json::Value, String> {
    ensure_sidecar_started_public(&app, &state).await?;

    let manager = &state.manager;
    manager
        .send_command("cron_get_status", serde_json::json!({}))
        .await
}
