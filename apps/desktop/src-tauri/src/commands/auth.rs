use crate::commands::credentials;

const API_KEY_SERVICE: &str = "cowork";
const API_KEY_ACCOUNT: &str = "api_key";

#[tauri::command]
pub async fn get_api_key() -> Result<Option<String>, String> {
    credentials::credentials_get(API_KEY_SERVICE.to_string(), API_KEY_ACCOUNT.to_string()).await
}

#[tauri::command]
pub async fn set_api_key(api_key: String) -> Result<(), String> {
    // Basic validation
    if api_key.trim().is_empty() {
        return Err("API key cannot be empty".to_string());
    }

    if !api_key.starts_with("AI") || api_key.len() < 30 {
        return Err("Invalid API key format".to_string());
    }

    credentials::credentials_set(
        API_KEY_SERVICE.to_string(),
        API_KEY_ACCOUNT.to_string(),
        api_key,
    ).await
}

#[tauri::command]
pub async fn delete_api_key() -> Result<(), String> {
    credentials::credentials_delete(API_KEY_SERVICE.to_string(), API_KEY_ACCOUNT.to_string()).await
}

#[tauri::command]
pub async fn validate_api_key(api_key: String) -> Result<bool, String> {
    // Test the API key with a lightweight request
    let url = format!(
        "https://generativelanguage.googleapis.com/v1beta/models?key={}",
        api_key
    );

    let client = reqwest::Client::builder()
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))?;

    let response = client.get(&url).send().await.map_err(|e| {
        format!("Network error: {}", e)
    })?;

    let status = response.status();
    if !status.is_success() {
        return Ok(false);
    }

    Ok(true)
}

#[derive(serde::Serialize)]
pub struct ModelInfo {
    pub id: String,
    pub name: String,
    pub description: String,
    pub input_token_limit: u32,
    pub output_token_limit: u32,
}

#[tauri::command]
pub async fn fetch_models(api_key: String) -> Result<Vec<ModelInfo>, String> {
    let url = format!(
        "https://generativelanguage.googleapis.com/v1beta/models?key={}",
        api_key
    );

    let client = reqwest::Client::new();
    let response = client.get(&url).send().await.map_err(|e| e.to_string())?;

    if !response.status().is_success() {
        return Err(format!("Failed to fetch models: {}", response.status()));
    }

    let body: serde_json::Value = response.json().await.map_err(|e| e.to_string())?;

    let models = body["models"]
        .as_array()
        .ok_or("Invalid response format")?
        .iter()
        .filter_map(|model| {
            let name = model["name"].as_str()?;
            // Only include generateContent capable models
            let methods = model["supportedGenerationMethods"].as_array()?;
            let supports_generate = methods.iter().any(|m| m.as_str() == Some("generateContent"));

            if !supports_generate {
                return None;
            }

            // Extract model ID from "models/gemini-xxx" format
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
