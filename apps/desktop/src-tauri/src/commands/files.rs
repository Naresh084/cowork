use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

#[derive(Serialize, Deserialize)]
pub struct FileInfo {
    name: String,
    path: String,
    is_dir: bool,
    size: u64,
}

/// Blocked system paths that should never be accessed
const BLOCKED_PATHS: &[&str] = &[
    "/etc",
    "/System",
    "/usr",
    "/var",
    "/bin",
    "/sbin",
    "/private",
    "/Library",
];

/// Validate that a path is safe to access
fn validate_path(path: &str) -> Result<PathBuf, String> {
    let path_buf = PathBuf::from(path);

    // Canonicalize to resolve symlinks and '..' components
    let canonical = path_buf
        .canonicalize()
        .unwrap_or_else(|_| path_buf.clone());

    let canonical_str = canonical.to_string_lossy();

    // Check against blocked paths
    for blocked in BLOCKED_PATHS {
        if canonical_str.starts_with(blocked) {
            return Err(format!("Access denied: cannot access system directory ({})", blocked));
        }
    }

    // Check for path traversal in the original path
    if path.contains("..") {
        // After canonicalization, check if we're still in a safe location
        if let Some(home) = dirs::home_dir() {
            let home_str = home.to_string_lossy();
            if !canonical_str.starts_with(home_str.as_ref()) {
                return Err("Access denied: path traversal outside home directory detected".to_string());
            }
        }
    }

    Ok(canonical)
}

/// Validate path for write operations (path may not exist yet)
fn validate_path_for_write(path: &str) -> Result<PathBuf, String> {
    let path_buf = PathBuf::from(path);

    // For write operations, check the parent directory
    if let Some(parent) = path_buf.parent() {
        if parent.exists() {
            let canonical_parent = parent
                .canonicalize()
                .map_err(|e| format!("Failed to resolve path: {}", e))?;

            let parent_str = canonical_parent.to_string_lossy();

            // Check against blocked paths
            for blocked in BLOCKED_PATHS {
                if parent_str.starts_with(blocked) {
                    return Err(format!("Access denied: cannot write to system directory ({})", blocked));
                }
            }
        }
    }

    // Check for path traversal
    if path.contains("..") {
        return Err("Access denied: path traversal not allowed for write operations".to_string());
    }

    Ok(path_buf)
}

#[tauri::command]
pub async fn read_file(path: String) -> Result<String, String> {
    let validated_path = validate_path(&path)?;
    fs::read_to_string(&validated_path).map_err(|e| format!("Failed to read file: {}", e))
}

#[tauri::command]
pub async fn write_file(path: String, content: String) -> Result<(), String> {
    let validated_path = validate_path_for_write(&path)?;

    // Ensure parent directory exists
    if let Some(parent) = validated_path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("Failed to create directory: {}", e))?;
    }

    fs::write(&validated_path, content).map_err(|e| format!("Failed to write file: {}", e))
}

#[tauri::command]
pub async fn list_directory(path: String) -> Result<Vec<FileInfo>, String> {
    let validated_path = validate_path(&path)?;
    let entries = fs::read_dir(&validated_path).map_err(|e| format!("Failed to read directory: {}", e))?;

    let mut files = Vec::new();

    for entry in entries {
        let entry = entry.map_err(|e| e.to_string())?;
        let metadata = entry.metadata().map_err(|e| e.to_string())?;

        files.push(FileInfo {
            name: entry.file_name().to_string_lossy().to_string(),
            path: entry.path().to_string_lossy().to_string(),
            is_dir: metadata.is_dir(),
            size: metadata.len(),
        });
    }

    files.sort_by(|a, b| {
        // Directories first, then alphabetically
        match (a.is_dir, b.is_dir) {
            (true, false) => std::cmp::Ordering::Less,
            (false, true) => std::cmp::Ordering::Greater,
            _ => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
        }
    });

    Ok(files)
}
