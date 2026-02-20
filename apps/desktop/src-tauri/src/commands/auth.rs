// Copyright (c) 2026 Naresh. All rights reserved.
// Licensed under the MIT License. See LICENSE file for details.

use crate::commands::credentials;
use std::fs;

const API_KEY_SERVICE: &str = "cowork";
const LEGACY_API_KEY_ACCOUNT: &str = "api_key";
const STITCH_API_KEY_ACCOUNT: &str = "stitch_api_key";
const GOOGLE_API_KEY_ACCOUNT: &str = "google_api_key";
const FAL_API_KEY_ACCOUNT: &str = "fal_api_key";
const PROVIDER_IDS: [&str; 1] = ["google"];

#[derive(serde::Serialize)]
pub struct ModelInfo {
    pub id: String,
    pub name: String,
    pub description: String,
    pub input_token_limit: u32,
    pub output_token_limit: u32,
    pub thinking: bool,
    pub supported_generation_methods: Vec<String>,
}

#[derive(serde::Serialize)]
pub struct LogoutCleanupResult {
    pub removed_data_dir: bool,
    pub data_dir_path: String,
    pub cleared_credential_accounts: usize,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SecurityPostureStatus {
    pub credential_backend: String,
    pub secure_seed_available: bool,
    pub credentials_vault_present: bool,
    pub connector_vault_present: bool,
    pub plaintext_credentials_present: bool,
    pub plaintext_connector_secrets_present: bool,
    pub migration_status: String,
    pub provider_keys_configured: usize,
    pub auxiliary_keys_configured: usize,
    pub audit_log_present: bool,
    pub audit_log_size_bytes: u64,
}

fn normalize_provider_id(provider_id: &str) -> Result<String, String> {
    let normalized = provider_id.trim().to_lowercase();
    let mapped = if normalized == "gemini" {
        "google".to_string()
    } else {
        normalized
    };

    match mapped.as_str() {
        "google" => Ok(mapped),
        _ => Err(format!("Unsupported provider: {}", provider_id)),
    }
}

fn provider_api_key_account(provider_id: &str) -> Result<String, String> {
    Ok(format!(
        "provider_api_key_{}",
        normalize_provider_id(provider_id)?
    ))
}

fn default_base_url(provider_id: &str) -> Option<&'static str> {
    match provider_id {
        "google" => Some("https://generativelanguage.googleapis.com"),
        _ => None,
    }
}

fn curated_models(_provider_id: &str) -> Vec<ModelInfo> {
    vec![
        ModelInfo {
            id: "gemini-3-flash-preview".to_string(),
            name: "Gemini 3 Flash Preview".to_string(),
            description: "Latest fast preview model".to_string(),
            input_token_limit: 1_048_576,
            output_token_limit: 65_536,
            thinking: true,
            supported_generation_methods: vec![
                "generateContent".to_string(),
                "countTokens".to_string(),
                "createCachedContent".to_string(),
                "batchGenerateContent".to_string(),
            ],
        },
        ModelInfo {
            id: "gemini-3-pro-preview".to_string(),
            name: "Gemini 3 Pro Preview".to_string(),
            description: "Latest reasoning-focused preview model".to_string(),
            input_token_limit: 1_048_576,
            output_token_limit: 65_536,
            thinking: true,
            supported_generation_methods: vec![
                "generateContent".to_string(),
                "countTokens".to_string(),
                "createCachedContent".to_string(),
                "batchGenerateContent".to_string(),
            ],
        },
        ModelInfo {
            id: "gemini-3.1-pro-preview".to_string(),
            name: "Gemini 3.1 Pro Preview".to_string(),
            description: "Latest Gemini 3.1 reasoning preview model".to_string(),
            input_token_limit: 1_048_576,
            output_token_limit: 65_536,
            thinking: true,
            supported_generation_methods: vec![
                "generateContent".to_string(),
                "countTokens".to_string(),
                "createCachedContent".to_string(),
                "batchGenerateContent".to_string(),
            ],
        },
    ]
}

async fn migrate_legacy_google_api_key_if_needed() -> Result<(), String> {
    let google_account = provider_api_key_account("google")?;
    let current = credentials::credentials_get(
        API_KEY_SERVICE.to_string(),
        google_account.clone(),
    )
    .await?;

    if current.is_some() {
        return Ok(());
    }

    let legacy = credentials::credentials_get(
        API_KEY_SERVICE.to_string(),
        LEGACY_API_KEY_ACCOUNT.to_string(),
    )
    .await?;

    if let Some(legacy_key) = legacy {
        credentials::credentials_set(
            API_KEY_SERVICE.to_string(),
            google_account,
            legacy_key,
        )
        .await?;
    }

    Ok(())
}

fn parse_google_models(body: &serde_json::Value) -> Result<Vec<ModelInfo>, String> {
    const REQUIRED_METHODS: [&str; 4] = [
        "generateContent",
        "countTokens",
        "createCachedContent",
        "batchGenerateContent",
    ];

    let models = body["models"]
        .as_array()
        .ok_or("Invalid Google models response format")?
        .iter()
        .filter_map(|model| {
            let name = model["name"].as_str()?;
            let methods = model["supportedGenerationMethods"]
                .as_array()
                .map(|rows| {
                    rows.iter()
                        .filter_map(|m| m.as_str().map(|s| s.to_string()))
                        .collect::<Vec<String>>()
                })
                .unwrap_or_default();

            if methods.is_empty() {
                return None;
            }

            let supports_required_methods = REQUIRED_METHODS
                .iter()
                .all(|required| methods.iter().any(|method| method == required));

            if !supports_required_methods {
                return None;
            }

            let id = name.strip_prefix("models/").unwrap_or(name);

            Some(ModelInfo {
                id: id.to_string(),
                name: model["displayName"].as_str().unwrap_or(id).to_string(),
                description: model["description"].as_str().unwrap_or("").to_string(),
                input_token_limit: model["inputTokenLimit"].as_u64().unwrap_or(0) as u32,
                output_token_limit: model["outputTokenLimit"].as_u64().unwrap_or(0) as u32,
                thinking: model["thinking"].as_bool().unwrap_or(false),
                supported_generation_methods: methods,
            })
        })
        .collect();

    Ok(models)
}

fn parse_generic_models(body: &serde_json::Value) -> Result<Vec<ModelInfo>, String> {
    let rows = body["data"]
        .as_array()
        .or_else(|| body["models"].as_array())
        .ok_or("Invalid models response format")?;

    let models = rows
        .iter()
        .filter_map(|row| {
            let id_raw = row["id"].as_str().or_else(|| row["name"].as_str())?;
            let id = id_raw.strip_prefix("models/").unwrap_or(id_raw).to_string();
            if id.is_empty() {
                return None;
            }

            let name = row["display_name"]
                .as_str()
                .or_else(|| row["name"].as_str())
                .unwrap_or(&id)
                .to_string();
            let description = row["description"].as_str().unwrap_or("").to_string();
            let input_limit = row["input_token_limit"]
                .as_u64()
                .or_else(|| row["context_window"].as_u64())
                .unwrap_or(0) as u32;
            let output_limit = row["output_token_limit"]
                .as_u64()
                .or_else(|| row["max_output_tokens"].as_u64())
                .unwrap_or(0) as u32;

            Some(ModelInfo {
                id,
                name,
                description,
                input_token_limit: input_limit,
                output_token_limit: output_limit,
                thinking: false,
                supported_generation_methods: vec![],
            })
        })
        .collect();

    Ok(models)
}

async fn provider_models_http(
    provider_id: &str,
    api_key: &str,
    base_url: Option<&str>,
) -> Result<Vec<ModelInfo>, String> {
    let provider = normalize_provider_id(provider_id)?;
    let resolved_base = base_url
        .filter(|value| !value.trim().is_empty())
        .map(|value| value.trim().trim_end_matches('/').to_string())
        .or_else(|| default_base_url(&provider).map(|value| value.to_string()))
        .ok_or_else(|| format!("No base URL configured for provider {}", provider))?;

    let client = reqwest::Client::new();

    let url = format!("{}/v1beta/models?key={}", resolved_base, api_key);
    let mut request = client.get(url);

    request = request.header("content-type", "application/json");
    let response = request.send().await.map_err(|e| e.to_string())?;

    if !response.status().is_success() {
        return Err(format!("Failed to fetch models: {}", response.status()));
    }

    let body: serde_json::Value = response.json().await.map_err(|e| e.to_string())?;
    let parsed = parse_google_models(&body)?;

    if parsed.is_empty() {
        Ok(curated_models(&provider))
    } else {
        Ok(parsed)
    }
}

#[tauri::command]
pub async fn get_provider_api_key(provider_id: String) -> Result<Option<String>, String> {
    let provider = normalize_provider_id(&provider_id)?;
    if provider == "google" {
        migrate_legacy_google_api_key_if_needed().await?;
    }

    let account = provider_api_key_account(&provider)?;
    credentials::credentials_get(API_KEY_SERVICE.to_string(), account).await
}

#[tauri::command]
pub async fn set_provider_api_key(provider_id: String, api_key: String) -> Result<(), String> {
    let provider = normalize_provider_id(&provider_id)?;
    if api_key.trim().is_empty() {
        return Err("API key cannot be empty".to_string());
    }

    let account = provider_api_key_account(&provider)?;
    credentials::credentials_set(
        API_KEY_SERVICE.to_string(),
        account,
        api_key.trim().to_string(),
    )
    .await
}

#[tauri::command]
pub async fn delete_provider_api_key(provider_id: String) -> Result<(), String> {
    let provider = normalize_provider_id(&provider_id)?;
    let account = provider_api_key_account(&provider)?;
    credentials::credentials_delete(API_KEY_SERVICE.to_string(), account).await
}

#[tauri::command]
pub async fn get_google_api_key() -> Result<Option<String>, String> {
    credentials::credentials_get(
        API_KEY_SERVICE.to_string(),
        GOOGLE_API_KEY_ACCOUNT.to_string(),
    )
    .await
}

#[tauri::command]
pub async fn set_google_api_key(api_key: String) -> Result<(), String> {
    if api_key.trim().is_empty() {
        return Err("Google API key cannot be empty".to_string());
    }

    credentials::credentials_set(
        API_KEY_SERVICE.to_string(),
        GOOGLE_API_KEY_ACCOUNT.to_string(),
        api_key.trim().to_string(),
    )
    .await
}

#[tauri::command]
pub async fn delete_google_api_key() -> Result<(), String> {
    credentials::credentials_delete(
        API_KEY_SERVICE.to_string(),
        GOOGLE_API_KEY_ACCOUNT.to_string(),
    )
    .await
}

#[tauri::command]
pub async fn get_fal_api_key() -> Result<Option<String>, String> {
    credentials::credentials_get(
        API_KEY_SERVICE.to_string(),
        FAL_API_KEY_ACCOUNT.to_string(),
    )
    .await
}

#[tauri::command]
pub async fn set_fal_api_key(api_key: String) -> Result<(), String> {
    if api_key.trim().is_empty() {
        return Err("Fal API key cannot be empty".to_string());
    }

    credentials::credentials_set(
        API_KEY_SERVICE.to_string(),
        FAL_API_KEY_ACCOUNT.to_string(),
        api_key.trim().to_string(),
    )
    .await
}

#[tauri::command]
pub async fn delete_fal_api_key() -> Result<(), String> {
    credentials::credentials_delete(
        API_KEY_SERVICE.to_string(),
        FAL_API_KEY_ACCOUNT.to_string(),
    )
    .await
}

#[tauri::command]
pub async fn get_stitch_api_key() -> Result<Option<String>, String> {
    credentials::credentials_get(
        API_KEY_SERVICE.to_string(),
        STITCH_API_KEY_ACCOUNT.to_string(),
    )
    .await
}

#[tauri::command]
pub async fn set_stitch_api_key(api_key: String) -> Result<(), String> {
    if api_key.trim().is_empty() {
        return Err("Stitch API key cannot be empty".to_string());
    }

    credentials::credentials_set(
        API_KEY_SERVICE.to_string(),
        STITCH_API_KEY_ACCOUNT.to_string(),
        api_key.trim().to_string(),
    )
    .await
}

#[tauri::command]
pub async fn delete_stitch_api_key() -> Result<(), String> {
    credentials::credentials_delete(
        API_KEY_SERVICE.to_string(),
        STITCH_API_KEY_ACCOUNT.to_string(),
    )
    .await
}

#[tauri::command]
pub async fn auth_logout_and_cleanup() -> Result<LogoutCleanupResult, String> {
    let mut accounts_to_clear = vec![
        LEGACY_API_KEY_ACCOUNT.to_string(),
        GOOGLE_API_KEY_ACCOUNT.to_string(),
        FAL_API_KEY_ACCOUNT.to_string(),
        STITCH_API_KEY_ACCOUNT.to_string(),
    ];

    for provider_id in PROVIDER_IDS {
        accounts_to_clear.push(provider_api_key_account(provider_id)?);
    }

    for account in &accounts_to_clear {
        credentials::credentials_delete(API_KEY_SERVICE.to_string(), account.clone()).await?;
    }

    let home_dir = dirs::home_dir().ok_or("Could not determine home directory".to_string())?;
    let data_dir = home_dir.join(".cowork");
    let data_dir_path = data_dir.to_string_lossy().to_string();
    let removed_data_dir = if data_dir.exists() {
        fs::remove_dir_all(&data_dir)
            .map_err(|error| format!("Failed to remove {}: {}", data_dir_path, error))?;
        true
    } else {
        false
    };

    Ok(LogoutCleanupResult {
        removed_data_dir,
        data_dir_path,
        cleared_credential_accounts: accounts_to_clear.len(),
    })
}

#[tauri::command]
pub async fn auth_get_security_posture() -> Result<SecurityPostureStatus, String> {
    let config_root = dirs::config_dir().ok_or("Could not determine config directory".to_string())?;
    let current_config_dir = config_root.join("cowork");
    let legacy_config_dir = config_root.join("cowork");

    let credentials_vault_present = current_config_dir.join("credentials.vault.json").exists();
    let connector_vault_present = current_config_dir.join("secrets.vault.json").exists();
    let plaintext_credentials_present = current_config_dir.join("credentials.json").exists()
        || legacy_config_dir.join("credentials.json").exists();
    let plaintext_connector_secrets_present = current_config_dir.join("secrets.json").exists()
        || legacy_config_dir.join("secrets.json").exists();
    let migration_status = if plaintext_credentials_present || plaintext_connector_secrets_present {
        "legacy_plaintext_detected".to_string()
    } else {
        "clean".to_string()
    };

    let mut provider_keys_configured = 0usize;
    for provider_id in PROVIDER_IDS {
        let account = provider_api_key_account(provider_id)?;
        if credentials::credentials_get(API_KEY_SERVICE.to_string(), account)
            .await?
            .is_some()
        {
            provider_keys_configured += 1;
        }
    }

    let auxiliary_accounts = [
        GOOGLE_API_KEY_ACCOUNT,
        FAL_API_KEY_ACCOUNT,
        STITCH_API_KEY_ACCOUNT,
    ];
    let mut auxiliary_keys_configured = 0usize;
    for account in auxiliary_accounts {
        if credentials::credentials_get(API_KEY_SERVICE.to_string(), account.to_string())
            .await?
            .is_some()
        {
            auxiliary_keys_configured += 1;
        }
    }

    let secure_seed_available = credentials::get_or_create_sidecar_connector_seed().is_ok();

    let home_dir = dirs::home_dir().ok_or("Could not determine home directory".to_string())?;
    let audit_log_path = home_dir.join(".cowork").join("security").join("audit.log");
    let (audit_log_present, audit_log_size_bytes) = match fs::metadata(&audit_log_path) {
        Ok(metadata) => (true, metadata.len()),
        Err(_) => (false, 0),
    };

    Ok(SecurityPostureStatus {
        credential_backend: credentials::credential_backend_label().to_string(),
        secure_seed_available,
        credentials_vault_present,
        connector_vault_present,
        plaintext_credentials_present,
        plaintext_connector_secrets_present,
        migration_status,
        provider_keys_configured,
        auxiliary_keys_configured,
        audit_log_present,
        audit_log_size_bytes,
    })
}

#[tauri::command]
pub async fn validate_provider_connection(
    provider_id: String,
    api_key: String,
    base_url: Option<String>,
) -> Result<bool, String> {
    normalize_provider_id(&provider_id)?;
    if api_key.trim().is_empty() {
        return Ok(false);
    }
    let result = provider_models_http("google", api_key.trim(), base_url.as_deref()).await;
    Ok(result.is_ok())
}

#[tauri::command]
pub async fn fetch_provider_models(
    provider_id: String,
    api_key: String,
    base_url: Option<String>,
) -> Result<Vec<ModelInfo>, String> {
    let provider = normalize_provider_id(&provider_id)?;
    if api_key.trim().is_empty() {
        return Ok(curated_models(&provider));
    }
    provider_models_http(&provider, api_key.trim(), base_url.as_deref())
        .await
        .or_else(|_| Ok(curated_models(&provider)))
}

// ---------------------------------------------------------------------------
// Backward-compatible Gemini-era commands (mapped to provider=google)
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn get_api_key() -> Result<Option<String>, String> {
    get_provider_api_key("google".to_string()).await
}

#[tauri::command]
pub async fn set_api_key(api_key: String) -> Result<(), String> {
    set_provider_api_key("google".to_string(), api_key).await
}

#[tauri::command]
pub async fn delete_api_key() -> Result<(), String> {
    delete_provider_api_key("google".to_string()).await
}

#[tauri::command]
pub async fn validate_api_key(api_key: String) -> Result<bool, String> {
    validate_provider_connection("google".to_string(), api_key, None).await
}

#[tauri::command]
pub async fn fetch_models(api_key: String) -> Result<Vec<ModelInfo>, String> {
    fetch_provider_models("google".to_string(), api_key, None).await
}
