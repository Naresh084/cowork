use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;

const APP_DIR_NAME: &str = "cowork";
const LEGACY_APP_DIR_NAME: &str = "gemini-cowork";
const CREDENTIALS_FILE: &str = "credentials.json";

#[derive(Serialize, Deserialize, Default)]
struct CredentialStore {
    credentials: HashMap<String, String>,
}

fn config_root() -> Result<PathBuf, String> {
    dirs::config_dir().ok_or("Could not determine config directory".to_string())
}

fn get_store_path() -> Result<PathBuf, String> {
    let config_dir = config_root()?;
    let app_dir = config_dir.join(APP_DIR_NAME);
    fs::create_dir_all(&app_dir)
        .map_err(|e| format!("Failed to create config directory: {}", e))?;
    Ok(app_dir.join(CREDENTIALS_FILE))
}

fn get_legacy_store_path() -> Result<PathBuf, String> {
    let config_dir = config_root()?;
    Ok(config_dir.join(LEGACY_APP_DIR_NAME).join(CREDENTIALS_FILE))
}

fn ensure_secure_permissions(path: &PathBuf) -> Result<(), String> {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(path, fs::Permissions::from_mode(0o600))
            .map_err(|e| format!("Failed to set file permissions: {}", e))?;
    }
    Ok(())
}

fn migrate_legacy_store_if_needed(current_path: &PathBuf) -> Result<(), String> {
    if current_path.exists() {
        return Ok(());
    }

    let legacy_path = get_legacy_store_path()?;
    if !legacy_path.exists() {
        return Ok(());
    }

    if let Some(parent) = current_path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create credentials directory: {}", e))?;
    }

    fs::copy(&legacy_path, current_path)
        .map_err(|e| format!("Failed to migrate legacy credentials: {}", e))?;
    ensure_secure_permissions(current_path)
}

fn read_store() -> Result<CredentialStore, String> {
    let path = get_store_path()?;
    migrate_legacy_store_if_needed(&path)?;

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

    fs::write(&path, data)
        .map_err(|e| format!("Failed to write credentials: {}", e))?;

    ensure_secure_permissions(&path)
}

pub async fn credentials_get(service: String, account: String) -> Result<Option<String>, String> {
    let key = format!("{}.{}", service, account);
    let store = read_store()?;
    Ok(store.credentials.get(&key).cloned())
}

pub async fn credentials_set(
    service: String,
    account: String,
    value: String,
) -> Result<(), String> {
    let key = format!("{}.{}", service, account);
    let mut store = read_store()?;
    store.credentials.insert(key, value);
    write_store(&store)
}

pub async fn credentials_delete(service: String, account: String) -> Result<(), String> {
    let key = format!("{}.{}", service, account);
    let mut store = read_store()?;
    store.credentials.remove(&key);
    write_store(&store)
}
