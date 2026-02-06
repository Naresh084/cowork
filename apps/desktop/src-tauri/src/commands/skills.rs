use crate::commands::agent::AgentState;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, State};

// ============================================================================
// Skill Types
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillSource {
    #[serde(rename = "type")]
    pub source_type: String,
    pub path: String,
    pub priority: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillRequirements {
    pub bins: Option<Vec<String>>,
    pub any_bins: Option<Vec<String>>,
    pub env: Option<Vec<String>>,
    pub os: Option<Vec<String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InstallOption {
    pub kind: String,
    pub formula: Option<String>,
    pub tap: Option<String>,
    pub package: Option<String>,
    pub module: Option<String>,
    pub url: Option<String>,
    pub instructions: Option<String>,
    pub label: Option<String>,
    pub bins: Option<Vec<String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillMetadata {
    pub author: Option<String>,
    pub version: Option<String>,
    pub emoji: Option<String>,
    pub homepage: Option<String>,
    pub category: Option<String>,
    pub tags: Option<Vec<String>>,
    pub requires: Option<SkillRequirements>,
    pub install: Option<Vec<InstallOption>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillFrontmatter {
    pub name: String,
    pub description: String,
    pub license: Option<String>,
    pub compatibility: Option<String>,
    pub homepage: Option<String>,
    #[serde(rename = "allowed-tools")]
    pub allowed_tools: Option<String>,
    pub metadata: Option<SkillMetadata>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillManifest {
    pub id: String,
    pub source: SkillSource,
    pub frontmatter: SkillFrontmatter,
    pub skill_path: String,
    pub has_scripts: bool,
    pub has_references: bool,
    pub has_assets: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillEligibility {
    pub eligible: bool,
    pub missing_bins: Vec<String>,
    pub missing_env_vars: Vec<String>,
    pub platform_mismatch: bool,
    pub install_hints: Vec<String>,
    pub found_bins: Option<std::collections::HashMap<String, String>>,
}

#[allow(dead_code)]
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InstalledSkill {
    #[serde(flatten)]
    pub manifest: SkillManifest,
    pub enabled: bool,
    pub installed_at: i64,
    pub eligibility: SkillEligibility,
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
// Skill Commands
// ============================================================================

/// Discover all available skills from all sources
#[tauri::command]
pub async fn agent_discover_skills(
    app: AppHandle,
    state: State<'_, AgentState>,
    working_directory: Option<String>,
) -> Result<Vec<SkillManifest>, String> {
    ensure_sidecar(&app, &state).await?;

    let manager = &state.manager;
    let params = serde_json::json!({
        "workingDirectory": working_directory,
    });

    let result = manager.send_command("discover_skills", params).await?;

    // Parse the skills array from the result
    let response: serde_json::Value = result;
    let skills = response
        .get("skills")
        .and_then(|s| s.as_array())
        .ok_or("Invalid response format: missing skills array")?;

    serde_json::from_value(serde_json::Value::Array(skills.clone()))
        .map_err(|e| format!("Failed to parse skills: {}", e))
}

/// Install a skill from marketplace to managed directory
#[tauri::command]
pub async fn agent_install_skill(
    app: AppHandle,
    state: State<'_, AgentState>,
    skill_id: String,
) -> Result<(), String> {
    ensure_sidecar(&app, &state).await?;

    let manager = &state.manager;
    let params = serde_json::json!({
        "skillId": skill_id,
    });

    manager.send_command("install_skill", params).await?;
    Ok(())
}

/// Uninstall a skill from managed directory
#[tauri::command]
pub async fn agent_uninstall_skill(
    app: AppHandle,
    state: State<'_, AgentState>,
    skill_id: String,
) -> Result<(), String> {
    ensure_sidecar(&app, &state).await?;

    let manager = &state.manager;
    let params = serde_json::json!({
        "skillId": skill_id,
    });

    manager.send_command("uninstall_skill", params).await?;
    Ok(())
}

/// Check eligibility for a specific skill
#[tauri::command]
pub async fn agent_check_skill_eligibility(
    app: AppHandle,
    state: State<'_, AgentState>,
    skill_id: String,
) -> Result<SkillEligibility, String> {
    ensure_sidecar(&app, &state).await?;

    let manager = &state.manager;
    let params = serde_json::json!({
        "skillId": skill_id,
    });

    let result = manager.send_command("check_skill_eligibility", params).await?;
    serde_json::from_value(result).map_err(|e| format!("Failed to parse eligibility: {}", e))
}

/// Get skill content for display
#[tauri::command]
pub async fn agent_get_skill_content(
    app: AppHandle,
    state: State<'_, AgentState>,
    skill_id: String,
) -> Result<String, String> {
    ensure_sidecar(&app, &state).await?;

    let manager = &state.manager;
    let params = serde_json::json!({
        "skillId": skill_id,
    });

    let result = manager.send_command("get_skill_content", params).await?;
    let content = result
        .get("content")
        .and_then(|c| c.as_str())
        .ok_or("Invalid response format: missing content")?;

    Ok(content.to_string())
}

/// Create a new custom skill
#[tauri::command]
pub async fn agent_create_skill(
    app: AppHandle,
    state: State<'_, AgentState>,
    name: String,
    description: String,
    emoji: Option<String>,
    category: Option<String>,
    content: String,
    requirements: Option<serde_json::Value>,
) -> Result<String, String> {
    ensure_sidecar(&app, &state).await?;

    let manager = &state.manager;
    let params = serde_json::json!({
        "name": name,
        "description": description,
        "emoji": emoji,
        "category": category,
        "content": content,
        "requirements": requirements,
    });

    let result = manager.send_command("create_skill", params).await?;

    let skill_id = result
        .get("skillId")
        .and_then(|s| s.as_str())
        .ok_or("Invalid response: missing skillId")?
        .to_string();

    Ok(skill_id)
}
