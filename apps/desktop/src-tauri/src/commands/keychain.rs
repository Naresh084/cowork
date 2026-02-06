use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;

const APP_DIR_NAME: &str = "gemini-cowork";
const CREDENTIALS_FILE: &str = "credentials.json";

#[derive(Serialize, Deserialize, Default)]
struct CredentialStore {
    credentials: HashMap<String, String>,
}

fn get_store_path() -> Result<PathBuf, String> {
    let config_dir =
        dirs::config_dir().ok_or("Could not determine config directory")?;
    let app_dir = config_dir.join(APP_DIR_NAME);
    fs::create_dir_all(&app_dir)
        .map_err(|e| format!("Failed to create config directory: {}", e))?;
    Ok(app_dir.join(CREDENTIALS_FILE))
}

fn read_store() -> Result<CredentialStore, String> {
    let path = get_store_path()?;
    if !path.exists() {
        return Ok(CredentialStore::default());
    }
    let data = fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read credentials: {}", e))?;
    serde_json::from_str(&data)
        .map_err(|e| format!("Failed to parse credentials: {}", e))
}

fn write_store(store: &CredentialStore) -> Result<(), String> {
    let path = get_store_path()?;
    let data = serde_json::to_string_pretty(store)
        .map_err(|e| format!("Failed to serialize credentials: {}", e))?;
    fs::write(&path, &data)
        .map_err(|e| format!("Failed to write credentials: {}", e))?;

    // Set restrictive file permissions (owner read/write only)
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(&path, fs::Permissions::from_mode(0o600))
            .map_err(|e| format!("Failed to set file permissions: {}", e))?;
    }

    Ok(())
}

#[tauri::command]
pub async fn keychain_get(service: String, account: String) -> Result<Option<String>, String> {
    let key = format!("{}.{}", service, account);
    let store = read_store()?;
    Ok(store.credentials.get(&key).cloned())
}

#[tauri::command]
pub async fn keychain_set(
    service: String,
    account: String,
    value: String,
) -> Result<(), String> {
    let key = format!("{}.{}", service, account);
    let mut store = read_store()?;
    store.credentials.insert(key, value);
    write_store(&store)
}

#[tauri::command]
pub async fn keychain_delete(service: String, account: String) -> Result<(), String> {
    let key = format!("{}.{}", service, account);
    let mut store = read_store()?;
    store.credentials.remove(&key);
    write_store(&store)
}
