// Copyright (c) 2026 Naresh. All rights reserved.
// Licensed under the MIT License. See LICENSE file for details.

use aes_gcm::aead::{Aead, KeyInit};
use aes_gcm::{Aes256Gcm, Nonce};
use base64::{engine::general_purpose::STANDARD as BASE64_STANDARD, Engine as _};
use keyring::{Entry, Error as KeyringError};
use rand::rngs::OsRng;
use rand::RngCore;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;

const APP_DIR_NAME: &str = "cowork";
const LEGACY_APP_DIR_NAME: &str = "cowork";
const LEGACY_CREDENTIALS_FILE: &str = "credentials.json";
const ENCRYPTED_VAULT_FILE: &str = "credentials.vault.json";
const CONNECTOR_SECRET_SERVICE: &str = "cowork.connector-secrets";
const CONNECTOR_SECRET_ACCOUNT: &str = "sidecar-master-key";
const CREDENTIAL_BACKEND_ENV_VAR: &str = "COWORK_CREDENTIAL_BACKEND";

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum CredentialBackend {
    VaultOnly,
    KeychainWithFallback,
}

#[derive(Serialize, Deserialize, Default)]
struct PlaintextCredentialStore {
    credentials: HashMap<String, String>,
}

#[derive(Serialize, Deserialize, Default)]
struct EncryptedCredentialStore {
    credentials: HashMap<String, String>,
}

fn config_root() -> Result<PathBuf, String> {
    dirs::config_dir().ok_or("Could not determine config directory".to_string())
}

fn credential_backend() -> CredentialBackend {
    match std::env::var(CREDENTIAL_BACKEND_ENV_VAR) {
        Ok(value) => {
            let normalized = value.trim().to_lowercase();
            match normalized.as_str() {
                "keychain" | "keychain_with_encrypted_fallback" => {
                    CredentialBackend::KeychainWithFallback
                }
                _ => CredentialBackend::VaultOnly,
            }
        }
        Err(_) => CredentialBackend::VaultOnly,
    }
}

pub fn credential_backend_label() -> &'static str {
    match credential_backend() {
        CredentialBackend::VaultOnly => "encrypted_vault",
        CredentialBackend::KeychainWithFallback => "keychain_with_encrypted_fallback",
    }
}

fn app_dir_path() -> Result<PathBuf, String> {
    let config_dir = config_root()?;
    let app_dir = config_dir.join(APP_DIR_NAME);
    fs::create_dir_all(&app_dir)
        .map_err(|e| format!("Failed to create config directory: {}", e))?;
    Ok(app_dir)
}

fn get_encrypted_store_path() -> Result<PathBuf, String> {
    Ok(app_dir_path()?.join(ENCRYPTED_VAULT_FILE))
}

fn get_plaintext_store_path() -> Result<PathBuf, String> {
    Ok(app_dir_path()?.join(LEGACY_CREDENTIALS_FILE))
}

fn get_legacy_store_path() -> Result<PathBuf, String> {
    let config_dir = config_root()?;
    Ok(config_dir
        .join(LEGACY_APP_DIR_NAME)
        .join(LEGACY_CREDENTIALS_FILE))
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

fn fallback_cipher_key() -> [u8; 32] {
    let mut hasher = Sha256::new();
    hasher.update(APP_DIR_NAME.as_bytes());

    if let Ok(hostname) = std::env::var("HOSTNAME") {
        hasher.update(hostname.as_bytes());
    }
    if let Ok(computer_name) = std::env::var("COMPUTERNAME") {
        hasher.update(computer_name.as_bytes());
    }
    if let Ok(username) = std::env::var("USER").or_else(|_| std::env::var("USERNAME")) {
        hasher.update(username.as_bytes());
    }
    if let Some(home_dir) = dirs::home_dir() {
        hasher.update(home_dir.to_string_lossy().as_bytes());
    }

    let digest = hasher.finalize();
    let mut key = [0_u8; 32];
    key.copy_from_slice(&digest[..32]);
    key
}

fn encrypt_secret(plain_text: &str) -> Result<String, String> {
    let key = fallback_cipher_key();
    let cipher = Aes256Gcm::new_from_slice(&key)
        .map_err(|e| format!("Failed to create fallback cipher: {}", e))?;
    let mut nonce_bytes = [0_u8; 12];
    OsRng.fill_bytes(&mut nonce_bytes);
    let nonce = Nonce::from_slice(&nonce_bytes);
    let ciphertext = cipher
        .encrypt(nonce, plain_text.as_bytes())
        .map_err(|e| format!("Failed to encrypt fallback credential: {}", e))?;

    let mut payload = nonce_bytes.to_vec();
    payload.extend_from_slice(&ciphertext);
    Ok(BASE64_STANDARD.encode(payload))
}

fn decrypt_secret(cipher_text: &str) -> Result<String, String> {
    let payload = BASE64_STANDARD
        .decode(cipher_text.as_bytes())
        .map_err(|e| format!("Failed to decode fallback credential: {}", e))?;
    if payload.len() <= 12 {
        return Err("Fallback credential payload is malformed".to_string());
    }

    let (nonce_bytes, encrypted_bytes) = payload.split_at(12);
    let key = fallback_cipher_key();
    let cipher = Aes256Gcm::new_from_slice(&key)
        .map_err(|e| format!("Failed to create fallback cipher: {}", e))?;
    let nonce = Nonce::from_slice(nonce_bytes);
    let plain_bytes = cipher
        .decrypt(nonce, encrypted_bytes)
        .map_err(|e| format!("Failed to decrypt fallback credential: {}", e))?;

    String::from_utf8(plain_bytes).map_err(|e| format!("Fallback credential is not valid UTF-8: {}", e))
}

fn read_encrypted_store() -> Result<EncryptedCredentialStore, String> {
    let path = get_encrypted_store_path()?;
    if !path.exists() {
        return Ok(EncryptedCredentialStore::default());
    }

    let data = fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read encrypted credential vault: {}", e))?;
    serde_json::from_str(&data)
        .map_err(|e| format!("Failed to parse encrypted credential vault: {}", e))
}

fn write_encrypted_store(store: &EncryptedCredentialStore) -> Result<(), String> {
    let path = get_encrypted_store_path()?;
    let data = serde_json::to_string_pretty(store)
        .map_err(|e| format!("Failed to serialize encrypted credential vault: {}", e))?;
    fs::write(&path, data)
        .map_err(|e| format!("Failed to write encrypted credential vault: {}", e))?;
    ensure_secure_permissions(&path)
}

fn fallback_key(service: &str, account: &str) -> String {
    format!("{}.{}", service, account)
}

fn fallback_get_secret(service: &str, account: &str) -> Result<Option<String>, String> {
    let key = fallback_key(service, account);
    let store = read_encrypted_store()?;
    match store.credentials.get(&key) {
        Some(encrypted) => Ok(Some(decrypt_secret(encrypted)?)),
        None => Ok(None),
    }
}

fn fallback_set_secret(service: &str, account: &str, value: &str) -> Result<(), String> {
    let key = fallback_key(service, account);
    let mut store = read_encrypted_store()?;
    store.credentials.insert(key, encrypt_secret(value)?);
    write_encrypted_store(&store)
}

fn fallback_delete_secret(service: &str, account: &str) -> Result<(), String> {
    let key = fallback_key(service, account);
    let mut store = read_encrypted_store()?;
    if store.credentials.remove(&key).is_some() {
        write_encrypted_store(&store)?;
    }
    Ok(())
}

fn keyring_entry(service: &str, account: &str) -> Result<Entry, String> {
    Entry::new(service, account)
        .map_err(|e| format!("Failed to create keychain entry: {}", e))
}

fn keychain_get(service: &str, account: &str) -> Result<Option<String>, String> {
    let entry = keyring_entry(service, account)?;
    match entry.get_password() {
        Ok(value) => Ok(Some(value)),
        Err(KeyringError::NoEntry) => Ok(None),
        Err(error) => Err(format!("Keychain read failed: {}", error)),
    }
}

fn keychain_set(service: &str, account: &str, value: &str) -> Result<(), String> {
    let entry = keyring_entry(service, account)?;
    entry
        .set_password(value)
        .map_err(|e| format!("Keychain write failed: {}", e))
}

fn keychain_delete(service: &str, account: &str) -> Result<(), String> {
    let entry = keyring_entry(service, account)?;
    match entry.delete_password() {
        Ok(_) | Err(KeyringError::NoEntry) => Ok(()),
        Err(error) => Err(format!("Keychain delete failed: {}", error)),
    }
}

fn parse_plaintext_store(path: &PathBuf) -> Result<PlaintextCredentialStore, String> {
    let data = fs::read_to_string(path)
        .map_err(|e| format!("Failed to read legacy credentials {}: {}", path.display(), e))?;
    serde_json::from_str(&data)
        .map_err(|e| format!("Failed to parse legacy credentials {}: {}", path.display(), e))
}

fn split_legacy_key(key: &str) -> Option<(String, String)> {
    let mut parts = key.splitn(2, '.');
    let service = parts.next()?.trim();
    let account = parts.next()?.trim();
    if service.is_empty() || account.is_empty() {
        return None;
    }
    Some((service.to_string(), account.to_string()))
}

fn migrate_plaintext_store(path: &PathBuf) -> Result<(), String> {
    if !path.exists() {
        return Ok(());
    }

    let store = parse_plaintext_store(path)?;
    let backend = credential_backend();
    for (key, value) in store.credentials {
        if let Some((service, account)) = split_legacy_key(&key) {
            match backend {
                CredentialBackend::VaultOnly => {
                    fallback_set_secret(&service, &account, &value)?;
                }
                CredentialBackend::KeychainWithFallback => {
                    if keychain_set(&service, &account, &value).is_err() {
                        fallback_set_secret(&service, &account, &value)?;
                    }
                }
            }
        }
    }

    fs::remove_file(path).map_err(|e| {
        format!(
            "Failed to remove migrated plaintext credential store {}: {}",
            path.display(),
            e
        )
    })?;
    Ok(())
}

fn migrate_plaintext_stores_if_needed() -> Result<(), String> {
    let current_plaintext = get_plaintext_store_path()?;
    let legacy_plaintext = get_legacy_store_path()?;
    migrate_plaintext_store(&current_plaintext)?;
    migrate_plaintext_store(&legacy_plaintext)?;
    Ok(())
}

pub fn credentials_migrate_on_startup() -> Result<(), String> {
    migrate_plaintext_stores_if_needed()
}

pub fn get_or_create_sidecar_connector_seed() -> Result<String, String> {
    migrate_plaintext_stores_if_needed()?;
    let backend = credential_backend();

    match backend {
        CredentialBackend::VaultOnly => {
            if let Ok(Some(seed)) = fallback_get_secret(CONNECTOR_SECRET_SERVICE, CONNECTOR_SECRET_ACCOUNT)
            {
                return Ok(seed);
            }

            let mut seed_bytes = [0_u8; 32];
            OsRng.fill_bytes(&mut seed_bytes);
            let seed = BASE64_STANDARD.encode(seed_bytes);
            fallback_set_secret(CONNECTOR_SECRET_SERVICE, CONNECTOR_SECRET_ACCOUNT, &seed)?;
            Ok(seed)
        }
        CredentialBackend::KeychainWithFallback => {
            match keychain_get(CONNECTOR_SECRET_SERVICE, CONNECTOR_SECRET_ACCOUNT) {
                Ok(Some(seed)) => return Ok(seed),
                Ok(None) | Err(_) => {}
            }

            match fallback_get_secret(CONNECTOR_SECRET_SERVICE, CONNECTOR_SECRET_ACCOUNT) {
                Ok(Some(seed)) => return Ok(seed),
                Ok(None) | Err(_) => {}
            }

            let mut seed_bytes = [0_u8; 32];
            OsRng.fill_bytes(&mut seed_bytes);
            let seed = BASE64_STANDARD.encode(seed_bytes);

            match keychain_set(CONNECTOR_SECRET_SERVICE, CONNECTOR_SECRET_ACCOUNT, &seed) {
                Ok(_) => {
                    let _ = fallback_delete_secret(CONNECTOR_SECRET_SERVICE, CONNECTOR_SECRET_ACCOUNT);
                    Ok(seed)
                }
                Err(_) => {
                    fallback_set_secret(CONNECTOR_SECRET_SERVICE, CONNECTOR_SECRET_ACCOUNT, &seed)?;
                    Ok(seed)
                }
            }
        }
    }
}

pub async fn credentials_get(service: String, account: String) -> Result<Option<String>, String> {
    migrate_plaintext_stores_if_needed()?;
    match credential_backend() {
        CredentialBackend::VaultOnly => fallback_get_secret(&service, &account),
        CredentialBackend::KeychainWithFallback => match keychain_get(&service, &account) {
            Ok(Some(value)) => Ok(Some(value)),
            Ok(None) => fallback_get_secret(&service, &account),
            Err(_) => fallback_get_secret(&service, &account),
        },
    }
}

pub async fn credentials_set(
    service: String,
    account: String,
    value: String,
) -> Result<(), String> {
    migrate_plaintext_stores_if_needed()?;
    match credential_backend() {
        CredentialBackend::VaultOnly => fallback_set_secret(&service, &account, &value),
        CredentialBackend::KeychainWithFallback => match keychain_set(&service, &account, &value) {
            Ok(_) => {
                let _ = fallback_delete_secret(&service, &account);
                Ok(())
            }
            Err(_) => fallback_set_secret(&service, &account, &value),
        },
    }
}

pub async fn credentials_delete(service: String, account: String) -> Result<(), String> {
    migrate_plaintext_stores_if_needed()?;
    match credential_backend() {
        CredentialBackend::VaultOnly => fallback_delete_secret(&service, &account),
        CredentialBackend::KeychainWithFallback => {
            let keychain_result = keychain_delete(&service, &account);
            let fallback_result = fallback_delete_secret(&service, &account);

            match (keychain_result, fallback_result) {
                (Ok(_), Ok(_)) => Ok(()),
                (Ok(_), Err(_)) => Ok(()),
                (Err(_), Ok(_)) => Ok(()),
                (Err(keychain_error), Err(fallback_error)) => Err(format!(
                    "Failed to delete credential from keychain and fallback vault: {}; {}",
                    keychain_error, fallback_error
                )),
            }
        }
    }
}
