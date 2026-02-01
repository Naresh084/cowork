use std::process::Command;

#[tauri::command]
pub async fn keychain_get(service: String, account: String) -> Result<Option<String>, String> {
    #[cfg(target_os = "macos")]
    {
        let output = Command::new("security")
            .args([
                "find-generic-password",
                "-s", &service,
                "-a", &account,
                "-w",
            ])
            .output()
            .map_err(|e| e.to_string())?;

        if output.status.success() {
            let value = String::from_utf8_lossy(&output.stdout).trim().to_string();
            Ok(Some(value))
        } else {
            Ok(None)
        }
    }

    #[cfg(not(target_os = "macos"))]
    {
        // Fallback for non-macOS platforms
        Ok(None)
    }
}

#[tauri::command]
pub async fn keychain_set(service: String, account: String, value: String) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        // First try to delete existing entry
        let _ = Command::new("security")
            .args([
                "delete-generic-password",
                "-s", &service,
                "-a", &account,
            ])
            .output();

        // Add new entry
        let output = Command::new("security")
            .args([
                "add-generic-password",
                "-s", &service,
                "-a", &account,
                "-w", &value,
                "-U",
            ])
            .output()
            .map_err(|e| e.to_string())?;

        if output.status.success() {
            Ok(())
        } else {
            Err(String::from_utf8_lossy(&output.stderr).to_string())
        }
    }

    #[cfg(not(target_os = "macos"))]
    {
        Err("Keychain not supported on this platform".to_string())
    }
}

#[tauri::command]
pub async fn keychain_delete(service: String, account: String) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        let output = Command::new("security")
            .args([
                "delete-generic-password",
                "-s", &service,
                "-a", &account,
            ])
            .output()
            .map_err(|e| e.to_string())?;

        if output.status.success() {
            Ok(())
        } else {
            // Ignore error if item doesn't exist
            Ok(())
        }
    }

    #[cfg(not(target_os = "macos"))]
    {
        Ok(())
    }
}
