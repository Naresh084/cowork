use keyring::Entry;

const SERVICE_NAME: &str = "com.gemini-cowork.app";

#[tauri::command]
pub async fn keychain_get(service: String, account: String) -> Result<Option<String>, String> {
    eprintln!("[keychain] Getting key for service: {}, account: {}", service, account);

    let full_service = format!("{}.{}", SERVICE_NAME, service);

    let entry = Entry::new(&full_service, &account)
        .map_err(|e| format!("Keyring initialization error: {}", e))?;

    match entry.get_password() {
        Ok(password) => {
            eprintln!("[keychain] Found key, length: {}", password.len());
            Ok(Some(password))
        }
        Err(keyring::Error::NoEntry) => {
            eprintln!("[keychain] Key not found");
            Ok(None)
        }
        Err(keyring::Error::Ambiguous(_)) => {
            eprintln!("[keychain] Ambiguous entry, returning None");
            Ok(None)
        }
        Err(e) => {
            eprintln!("[keychain] Error getting key: {}", e);
            Err(format!("Failed to get credential: {}", e))
        }
    }
}

#[tauri::command]
pub async fn keychain_set(service: String, account: String, value: String) -> Result<(), String> {
    eprintln!("[keychain] Setting key for service: {}, account: {}", service, account);

    let full_service = format!("{}.{}", SERVICE_NAME, service);

    let entry = Entry::new(&full_service, &account)
        .map_err(|e| format!("Keyring initialization error: {}", e))?;

    entry.set_password(&value)
        .map_err(|e| format!("Failed to set credential: {}", e))?;

    eprintln!("[keychain] Key set successfully");
    Ok(())
}

#[tauri::command]
pub async fn keychain_delete(service: String, account: String) -> Result<(), String> {
    eprintln!("[keychain] Deleting key for service: {}, account: {}", service, account);

    let full_service = format!("{}.{}", SERVICE_NAME, service);

    let entry = Entry::new(&full_service, &account)
        .map_err(|e| format!("Keyring initialization error: {}", e))?;

    match entry.delete_credential() {
        Ok(()) => {
            eprintln!("[keychain] Key deleted successfully");
            Ok(())
        }
        Err(keyring::Error::NoEntry) => {
            eprintln!("[keychain] Key not found, nothing to delete");
            Ok(()) // Already deleted or never existed
        }
        Err(e) => {
            eprintln!("[keychain] Error deleting key: {}", e);
            Err(format!("Failed to delete credential: {}", e))
        }
    }
}
