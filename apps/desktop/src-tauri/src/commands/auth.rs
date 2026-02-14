// Copyright (c) 2026 Naresh. All rights reserved.
// Licensed under the MIT License. See LICENSE file for details.

use crate::commands::credentials;
use std::fs;

const API_KEY_SERVICE: &str = "cowork";
const LEGACY_API_KEY_ACCOUNT: &str = "api_key";
const STITCH_API_KEY_ACCOUNT: &str = "stitch_api_key";
const GOOGLE_API_KEY_ACCOUNT: &str = "google_api_key";
const OPENAI_API_KEY_ACCOUNT: &str = "openai_api_key";
const FAL_API_KEY_ACCOUNT: &str = "fal_api_key";
const EXA_API_KEY_ACCOUNT: &str = "exa_api_key";
const TAVILY_API_KEY_ACCOUNT: &str = "tavily_api_key";
const PROVIDER_IDS: [&str; 8] = [
    "google",
    "openai",
    "anthropic",
    "openrouter",
    "moonshot",
    "glm",
    "deepseek",
    "lmstudio",
];

#[derive(serde::Serialize)]
pub struct ModelInfo {
    pub id: String,
    pub name: String,
    pub description: String,
    pub input_token_limit: u32,
    pub output_token_limit: u32,
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
        "google" | "openai" | "anthropic" | "openrouter" | "moonshot" | "glm" | "deepseek" | "lmstudio" => {
            Ok(mapped)
        }
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
        "openai" => Some("https://api.openai.com"),
        "anthropic" => Some("https://api.anthropic.com"),
        "openrouter" => Some("https://openrouter.ai/api"),
        "moonshot" => Some("https://api.moonshot.ai"),
        "glm" => Some("https://open.bigmodel.cn/api/paas"),
        "deepseek" => Some("https://api.deepseek.com"),
        "lmstudio" => Some("http://127.0.0.1:1234"),
        _ => None,
    }
}

fn curated_models(provider_id: &str) -> Vec<ModelInfo> {
    match provider_id {
        "google" => vec![
            ModelInfo {
                id: "gemini-3-flash-preview".to_string(),
                name: "Gemini 3 Flash Preview".to_string(),
                description: "Latest fast preview model".to_string(),
                input_token_limit: 1_048_576,
                output_token_limit: 65_536,
            },
            ModelInfo {
                id: "gemini-3-pro-preview".to_string(),
                name: "Gemini 3 Pro Preview".to_string(),
                description: "Latest reasoning-focused preview model".to_string(),
                input_token_limit: 1_048_576,
                output_token_limit: 65_536,
            },
        ],
        "openai" => vec![
            ModelInfo {
                id: "gpt-5.2".to_string(),
                name: "GPT-5.2".to_string(),
                description: "Latest GPT model".to_string(),
                input_token_limit: 400_000,
                output_token_limit: 128_000,
            },
            ModelInfo {
                id: "gpt-4.1".to_string(),
                name: "GPT-4.1".to_string(),
                description: "Broad compatibility fallback model".to_string(),
                input_token_limit: 1_000_000,
                output_token_limit: 32_768,
            },
        ],
        "anthropic" => vec![
            ModelInfo {
                id: "claude-opus-4-6".to_string(),
                name: "Claude Opus 4.6".to_string(),
                description: "Latest Claude flagship model".to_string(),
                input_token_limit: 200_000,
                output_token_limit: 8_192,
            },
            ModelInfo {
                id: "claude-sonnet-4-5".to_string(),
                name: "Claude Sonnet 4.5".to_string(),
                description: "Balanced reasoning and speed".to_string(),
                input_token_limit: 200_000,
                output_token_limit: 8_192,
            },
        ],
        "openrouter" => vec![
            ModelInfo {
                id: "openai/gpt-5.2".to_string(),
                name: "OpenAI GPT-5.2".to_string(),
                description: "Via OpenRouter".to_string(),
                input_token_limit: 0,
                output_token_limit: 0,
            },
            ModelInfo {
                id: "anthropic/claude-opus-4.6".to_string(),
                name: "Claude Opus 4.6".to_string(),
                description: "Via OpenRouter".to_string(),
                input_token_limit: 0,
                output_token_limit: 0,
            },
        ],
        "moonshot" => vec![
            ModelInfo {
                id: "kimi-k2-thinking".to_string(),
                name: "Kimi K2 Thinking".to_string(),
                description: "Moonshot latest reasoning-focused K2 model".to_string(),
                input_token_limit: 262_144,
                output_token_limit: 0,
            },
            ModelInfo {
                id: "kimi-k2.5".to_string(),
                name: "Kimi K2.5".to_string(),
                description: "Moonshot multimodal flagship model".to_string(),
                input_token_limit: 262_144,
                output_token_limit: 0,
            },
            ModelInfo {
                id: "kimi-k2-0711-preview".to_string(),
                name: "Kimi K2 0711 Preview".to_string(),
                description: "Moonshot K2 preview model".to_string(),
                input_token_limit: 131_072,
                output_token_limit: 0,
            },
            ModelInfo {
                id: "kimi-k2-turbo-preview".to_string(),
                name: "Kimi K2 Turbo Preview".to_string(),
                description: "Moonshot high-speed K2 model".to_string(),
                input_token_limit: 262_144,
                output_token_limit: 0,
            },
            ModelInfo {
                id: "kimi-k2-0905-preview".to_string(),
                name: "Kimi K2 0905 Preview".to_string(),
                description: "Moonshot K2 preview model".to_string(),
                input_token_limit: 262_144,
                output_token_limit: 0,
            },
            ModelInfo {
                id: "kimi-k2-thinking-turbo".to_string(),
                name: "Kimi K2 Thinking Turbo".to_string(),
                description: "Moonshot high-speed reasoning K2 model".to_string(),
                input_token_limit: 262_144,
                output_token_limit: 0,
            },
        ],
        "glm" => vec![
            ModelInfo {
                id: "glm-4.7".to_string(),
                name: "GLM-4.7".to_string(),
                description: "GLM flagship model".to_string(),
                input_token_limit: 200_000,
                output_token_limit: 131_072,
            },
            ModelInfo {
                id: "glm-4.7-flashx".to_string(),
                name: "GLM-4.7-FlashX".to_string(),
                description: "GLM fast flagship variant".to_string(),
                input_token_limit: 200_000,
                output_token_limit: 131_072,
            },
            ModelInfo {
                id: "glm-4.6".to_string(),
                name: "GLM-4.6".to_string(),
                description: "GLM high-capability model".to_string(),
                input_token_limit: 200_000,
                output_token_limit: 131_072,
            },
            ModelInfo {
                id: "glm-4.5".to_string(),
                name: "GLM-4.5".to_string(),
                description: "GLM balanced model".to_string(),
                input_token_limit: 200_000,
                output_token_limit: 131_072,
            },
            ModelInfo {
                id: "glm-4.5-x".to_string(),
                name: "GLM-4.5-X".to_string(),
                description: "GLM premium high-reasoning model".to_string(),
                input_token_limit: 200_000,
                output_token_limit: 131_072,
            },
            ModelInfo {
                id: "glm-4.5-air".to_string(),
                name: "GLM-4.5-Air".to_string(),
                description: "GLM lightweight model".to_string(),
                input_token_limit: 200_000,
                output_token_limit: 131_072,
            },
            ModelInfo {
                id: "glm-4.5-airx".to_string(),
                name: "GLM-4.5-AirX".to_string(),
                description: "GLM high-speed lightweight variant".to_string(),
                input_token_limit: 200_000,
                output_token_limit: 131_072,
            },
            ModelInfo {
                id: "glm-4-32b-0414-128k".to_string(),
                name: "GLM-4-32B-0414-128K".to_string(),
                description: "GLM 32B 128K context model".to_string(),
                input_token_limit: 131_072,
                output_token_limit: 131_072,
            },
            ModelInfo {
                id: "glm-4.7-flash".to_string(),
                name: "GLM-4.7-Flash".to_string(),
                description: "GLM free fast model".to_string(),
                input_token_limit: 200_000,
                output_token_limit: 131_072,
            },
            ModelInfo {
                id: "glm-4.5-flash".to_string(),
                name: "GLM-4.5-Flash".to_string(),
                description: "GLM free balanced model".to_string(),
                input_token_limit: 200_000,
                output_token_limit: 131_072,
            },
            ModelInfo {
                id: "glm-4.6v".to_string(),
                name: "GLM-4.6V".to_string(),
                description: "GLM vision model".to_string(),
                input_token_limit: 200_000,
                output_token_limit: 131_072,
            },
            ModelInfo {
                id: "glm-ocr".to_string(),
                name: "GLM-OCR".to_string(),
                description: "GLM OCR model".to_string(),
                input_token_limit: 200_000,
                output_token_limit: 131_072,
            },
            ModelInfo {
                id: "glm-4.6v-flashx".to_string(),
                name: "GLM-4.6V-FlashX".to_string(),
                description: "GLM fast vision model".to_string(),
                input_token_limit: 200_000,
                output_token_limit: 131_072,
            },
            ModelInfo {
                id: "glm-4.5v".to_string(),
                name: "GLM-4.5V".to_string(),
                description: "GLM vision-balanced model".to_string(),
                input_token_limit: 200_000,
                output_token_limit: 131_072,
            },
            ModelInfo {
                id: "glm-4.6v-flash".to_string(),
                name: "GLM-4.6V-Flash".to_string(),
                description: "GLM free fast vision model".to_string(),
                input_token_limit: 200_000,
                output_token_limit: 131_072,
            },
        ],
        "deepseek" => vec![
            ModelInfo {
                id: "deepseek-chat".to_string(),
                name: "DeepSeek Chat".to_string(),
                description: "DeepSeek V3.2 non-thinking mode (max output 8K)".to_string(),
                input_token_limit: 131_072,
                output_token_limit: 8_192,
            },
            ModelInfo {
                id: "deepseek-reasoner".to_string(),
                name: "DeepSeek Reasoner".to_string(),
                description: "DeepSeek V3.2 thinking mode (max output 64K)".to_string(),
                input_token_limit: 131_072,
                output_token_limit: 65_536,
            },
        ],
        "lmstudio" => vec![
            ModelInfo {
                id: "local-model".to_string(),
                name: "Local Model (LM Studio)".to_string(),
                description: "Fallback local model entry when LM Studio /v1/models is unavailable.".to_string(),
                input_token_limit: 0,
                output_token_limit: 0,
            },
        ],
        _ => vec![],
    }
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
    let models = body["models"]
        .as_array()
        .ok_or("Invalid Google models response format")?
        .iter()
        .filter_map(|model| {
            let name = model["name"].as_str()?;
            let methods = model["supportedGenerationMethods"].as_array()?;
            let supports_generate = methods
                .iter()
                .any(|m| m.as_str() == Some("generateContent"));

            if !supports_generate {
                return None;
            }

            let id = name.strip_prefix("models/").unwrap_or(name);

            Some(ModelInfo {
                id: id.to_string(),
                name: model["displayName"].as_str().unwrap_or(id).to_string(),
                description: model["description"].as_str().unwrap_or("").to_string(),
                input_token_limit: model["inputTokenLimit"].as_u64().unwrap_or(0) as u32,
                output_token_limit: model["outputTokenLimit"].as_u64().unwrap_or(0) as u32,
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
    if provider == "glm" {
        return Ok(curated_models(&provider));
    }

    let resolved_base = base_url
        .filter(|value| !value.trim().is_empty())
        .map(|value| value.trim().trim_end_matches('/').to_string())
        .or_else(|| default_base_url(&provider).map(|value| value.to_string()))
        .ok_or_else(|| format!("No base URL configured for provider {}", provider))?;

    let client = reqwest::Client::new();

    let mut request = match provider.as_str() {
        "google" => {
            let url = format!(
                "{}/v1beta/models?key={}",
                resolved_base,
                api_key
            );
            client.get(url)
        }
        "openai" | "openrouter" | "moonshot" => {
            let url = format!("{}/v1/models", resolved_base);
            client.get(url).bearer_auth(api_key)
        }
        "deepseek" => {
            let url = format!("{}/models", resolved_base);
            client.get(url).bearer_auth(api_key)
        }
        "lmstudio" => {
            let url = format!("{}/v1/models", resolved_base);
            let req = client.get(url);
            if api_key.trim().is_empty() {
                req
            } else {
                req.bearer_auth(api_key)
            }
        }
        "anthropic" => {
            let url = format!("{}/v1/models", resolved_base);
            client
                .get(url)
                .header("x-api-key", api_key)
                .header("anthropic-version", "2023-06-01")
        }
        _ => {
            return Ok(curated_models(&provider));
        }
    };

    request = request.header("content-type", "application/json");
    let response = request.send().await.map_err(|e| e.to_string())?;

    if !response.status().is_success() {
        return Err(format!("Failed to fetch models: {}", response.status()));
    }

    let body: serde_json::Value = response.json().await.map_err(|e| e.to_string())?;
    let parsed = if provider == "google" {
        parse_google_models(&body)?
    } else {
        parse_generic_models(&body)?
    };

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
pub async fn get_openai_api_key() -> Result<Option<String>, String> {
    credentials::credentials_get(
        API_KEY_SERVICE.to_string(),
        OPENAI_API_KEY_ACCOUNT.to_string(),
    )
    .await
}

#[tauri::command]
pub async fn set_openai_api_key(api_key: String) -> Result<(), String> {
    if api_key.trim().is_empty() {
        return Err("OpenAI API key cannot be empty".to_string());
    }

    credentials::credentials_set(
        API_KEY_SERVICE.to_string(),
        OPENAI_API_KEY_ACCOUNT.to_string(),
        api_key.trim().to_string(),
    )
    .await
}

#[tauri::command]
pub async fn delete_openai_api_key() -> Result<(), String> {
    credentials::credentials_delete(
        API_KEY_SERVICE.to_string(),
        OPENAI_API_KEY_ACCOUNT.to_string(),
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
pub async fn get_exa_api_key() -> Result<Option<String>, String> {
    credentials::credentials_get(
        API_KEY_SERVICE.to_string(),
        EXA_API_KEY_ACCOUNT.to_string(),
    )
    .await
}

#[tauri::command]
pub async fn set_exa_api_key(api_key: String) -> Result<(), String> {
    if api_key.trim().is_empty() {
        return Err("Exa API key cannot be empty".to_string());
    }

    credentials::credentials_set(
        API_KEY_SERVICE.to_string(),
        EXA_API_KEY_ACCOUNT.to_string(),
        api_key.trim().to_string(),
    )
    .await
}

#[tauri::command]
pub async fn delete_exa_api_key() -> Result<(), String> {
    credentials::credentials_delete(
        API_KEY_SERVICE.to_string(),
        EXA_API_KEY_ACCOUNT.to_string(),
    )
    .await
}

#[tauri::command]
pub async fn get_tavily_api_key() -> Result<Option<String>, String> {
    credentials::credentials_get(
        API_KEY_SERVICE.to_string(),
        TAVILY_API_KEY_ACCOUNT.to_string(),
    )
    .await
}

#[tauri::command]
pub async fn set_tavily_api_key(api_key: String) -> Result<(), String> {
    if api_key.trim().is_empty() {
        return Err("Tavily API key cannot be empty".to_string());
    }

    credentials::credentials_set(
        API_KEY_SERVICE.to_string(),
        TAVILY_API_KEY_ACCOUNT.to_string(),
        api_key.trim().to_string(),
    )
    .await
}

#[tauri::command]
pub async fn delete_tavily_api_key() -> Result<(), String> {
    credentials::credentials_delete(
        API_KEY_SERVICE.to_string(),
        TAVILY_API_KEY_ACCOUNT.to_string(),
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
        OPENAI_API_KEY_ACCOUNT.to_string(),
        FAL_API_KEY_ACCOUNT.to_string(),
        EXA_API_KEY_ACCOUNT.to_string(),
        TAVILY_API_KEY_ACCOUNT.to_string(),
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
        OPENAI_API_KEY_ACCOUNT,
        FAL_API_KEY_ACCOUNT,
        EXA_API_KEY_ACCOUNT,
        TAVILY_API_KEY_ACCOUNT,
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
    let provider = normalize_provider_id(&provider_id)?;
    if api_key.trim().is_empty() && provider != "lmstudio" {
        return Ok(false);
    }

    if provider == "glm" {
        // GLM may not expose a stable model listing endpoint across all base URLs.
        return Ok(true);
    }

    if provider == "lmstudio" {
        let result = provider_models_http(&provider, api_key.trim(), base_url.as_deref()).await;
        return Ok(result.is_ok());
    }

    if provider == "moonshot" || provider == "deepseek" {
        let result = provider_models_http(&provider, api_key.trim(), base_url.as_deref()).await;
        return match result {
            Ok(_) => Ok(true),
            Err(error) => {
                let lower = error.to_lowercase();
                let auth_failed = lower.contains("401")
                    || lower.contains("403")
                    || lower.contains("unauthorized")
                    || lower.contains("forbidden");
                Ok(!auth_failed)
            }
        };
    }

    let result = provider_models_http(&provider, api_key.trim(), base_url.as_deref()).await;
    Ok(result.is_ok())
}

#[tauri::command]
pub async fn fetch_provider_models(
    provider_id: String,
    api_key: String,
    base_url: Option<String>,
) -> Result<Vec<ModelInfo>, String> {
    let provider = normalize_provider_id(&provider_id)?;
    if api_key.trim().is_empty() && provider != "lmstudio" {
        return Ok(curated_models(&provider));
    }

    match provider_models_http(&provider, api_key.trim(), base_url.as_deref()).await {
        Ok(models) => Ok(models),
        Err(error) => {
            if provider == "moonshot" || provider == "deepseek" || provider == "lmstudio" {
                eprintln!(
                    "[auth::fetch_provider_models] Falling back to curated models for {}: {}",
                    provider, error
                );
                return Ok(curated_models(&provider));
            }
            Err(error)
        }
    }
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
