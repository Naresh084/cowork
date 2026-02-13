use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::io::{BufRead, BufReader, Read, Write};
use std::net::TcpStream;
#[cfg(unix)]
use std::os::unix::net::UnixStream;
#[cfg(unix)]
use std::os::unix::fs::PermissionsExt;
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::Arc;
use tauri::async_runtime::Mutex;
use tokio::sync::{mpsc, oneshot};

/// Default timeout for sidecar requests in seconds.
/// This is set high (5 minutes) to accommodate large context operations.
const DEFAULT_REQUEST_TIMEOUT_SECS: u64 = 300;
const DEFAULT_RETRY_ATTEMPTS: u32 = 3;
const DEFAULT_RETRY_BACKOFF_MS: u64 = 250;
const CONNECTOR_SECRET_ENV_VAR: &str = "COWORK_CONNECTOR_SECRET_KEY";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum TransportMode {
    Disconnected,
    EmbeddedSidecar,
    Daemon,
}

/// IPC Message sent to sidecar/daemon
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IpcRequest {
    pub id: String,
    pub command: String,
    pub params: serde_json::Value,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub auth_token: Option<String>,
}

/// IPC Response from sidecar/daemon
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IpcResponse {
    pub id: String,
    pub success: bool,
    pub result: Option<serde_json::Value>,
    pub error: Option<String>,
}

/// Event from sidecar/daemon
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SidecarEvent {
    #[serde(rename = "type")]
    pub event_type: String,
    pub session_id: Option<String>,
    pub data: serde_json::Value,
}

/// Message types from sidecar/daemon (can be response or event)
#[derive(Debug, Clone, Deserialize)]
#[serde(untagged)]
pub enum SidecarMessage {
    Response(IpcResponse),
    Event(SidecarEvent),
}

type PendingRequests = Arc<Mutex<HashMap<String, oneshot::Sender<IpcResponse>>>>;

pub struct SidecarManager {
    /// Embedded sidecar process handle (only used in legacy fallback mode).
    process: Arc<Mutex<Option<Child>>>,
    /// Daemon process handle if spawned by this app for bootstrap.
    daemon_process: Arc<Mutex<Option<Child>>>,
    tx: Arc<Mutex<Option<mpsc::Sender<String>>>>,
    pending_requests: PendingRequests,
    event_handler: Arc<Mutex<Option<Box<dyn Fn(SidecarEvent) + Send + 'static>>>>,
    request_counter: Arc<Mutex<u64>>,
    /// Track if writer is healthy (false if write failed)
    stdin_healthy: Arc<Mutex<bool>>,
    mode: Arc<Mutex<TransportMode>>,
    daemon_auth_token: Arc<Mutex<Option<String>>>,
    start_lock: Arc<Mutex<()>>,
}

impl SidecarManager {
    pub fn new() -> Self {
        Self {
            process: Arc::new(Mutex::new(None)),
            daemon_process: Arc::new(Mutex::new(None)),
            tx: Arc::new(Mutex::new(None)),
            pending_requests: Arc::new(Mutex::new(HashMap::new())),
            event_handler: Arc::new(Mutex::new(None)),
            request_counter: Arc::new(Mutex::new(0)),
            stdin_healthy: Arc::new(Mutex::new(true)),
            mode: Arc::new(Mutex::new(TransportMode::Disconnected)),
            daemon_auth_token: Arc::new(Mutex::new(None)),
            start_lock: Arc::new(Mutex::new(())),
        }
    }

    pub async fn set_event_handler<F>(&self, handler: F)
    where
        F: Fn(SidecarEvent) + Send + 'static,
    {
        let mut event_handler = self.event_handler.lock().await;
        *event_handler = Some(Box::new(handler));
    }

    pub async fn start(&self, app_data_dir: &str) -> Result<(), String> {
        let _start_guard = self.start_lock.lock().await;
        if self.is_running().await {
            return Ok(());
        }

        *self.stdin_healthy.lock().await = true;

        if daemon_transport_enabled() {
            match self.start_daemon_transport(app_data_dir).await {
                Ok(()) => return Ok(()),
                Err(err) => {
                    if !daemon_fallback_enabled() {
                        return Err(err);
                    }
                    eprintln!(
                        "[transport] Daemon transport unavailable, falling back to embedded sidecar: {}",
                        err
                    );
                }
            }
        }

        self.start_embedded_sidecar(app_data_dir).await
    }

    async fn start_embedded_sidecar(&self, app_data_dir: &str) -> Result<(), String> {
        let mut process_guard = self.process.lock().await;
        if process_guard.is_some() {
            return Ok(());
        }

        let sidecar_path = resolve_sidecar_dir(app_data_dir)?;

        if !sidecar_path.exists() {
            return Err(format!(
                "Sidecar not found at: {:?}. App data dir: {}",
                sidecar_path, app_data_dir
            ));
        }

        let mut child = if cfg!(debug_assertions) {
            let pnpm_cmd = if cfg!(windows) { "pnpm.cmd" } else { "pnpm" };
            let mut command = Command::new(pnpm_cmd);
            command
                .args(["exec", "tsx", "src/index.ts"])
                .current_dir(&sidecar_path)
                .stdin(Stdio::piped())
                .stdout(Stdio::piped())
                .stderr(Stdio::inherit());
            apply_connector_secret_seed_env(&mut command);
            command
                .spawn()
                .map_err(|e| format!("Failed to spawn sidecar (dev mode): {}", e))?
        } else {
            let binary_name = if cfg!(windows) { "sidecar.exe" } else { "sidecar" };
            let binary_path = sidecar_path.join(binary_name);

            if !binary_path.exists() {
                return Err(format!(
                    "Sidecar binary not found at: {:?}. Please reinstall the application.",
                    binary_path
                ));
            }

            let mut command = Command::new(&binary_path);
            command
                .current_dir(&sidecar_path)
                .stdin(Stdio::piped())
                .stdout(Stdio::piped())
                .stderr(Stdio::inherit());
            apply_connector_secret_seed_env(&mut command);
            command
                .spawn()
                .map_err(|e| format!("Failed to spawn sidecar binary: {}", e))?
        };

        let stdin = child.stdin.take().ok_or("Failed to get sidecar stdin")?;
        let stdout = child.stdout.take().ok_or("Failed to get sidecar stdout")?;

        self.attach_io(
            Box::new(stdin),
            Box::new(stdout),
            TransportMode::EmbeddedSidecar,
            None,
        )
        .await;

        *process_guard = Some(child);
        *self.mode.lock().await = TransportMode::EmbeddedSidecar;
        Ok(())
    }

    async fn start_daemon_transport(&self, app_data_dir: &str) -> Result<(), String> {
        let endpoint = resolve_daemon_endpoint(app_data_dir);
        let token_path = resolve_daemon_token_path(app_data_dir);
        let lock_path = resolve_daemon_lock_path(app_data_dir);

        // First try to connect to an already-running daemon.
        if let Some((reader, writer)) = try_connect_daemon(&endpoint)? {
            let token = read_daemon_token(&token_path)?;
            self.attach_io(writer, reader, TransportMode::Daemon, Some(token))
                .await;
            return Ok(());
        }

        // Spawn daemon process if not already running.
        let daemon_path = resolve_sidecar_dir(app_data_dir)?;
        let child = spawn_daemon_process(
            &daemon_path,
            app_data_dir,
            &endpoint,
            &token_path,
            &lock_path,
        )?;
        *self.daemon_process.lock().await = Some(child);

        // Wait for daemon to become reachable.
        let mut last_error = String::from("daemon did not become reachable");
        for _ in 0..80 {
            match try_connect_daemon(&endpoint) {
                Ok(Some((reader, writer))) => {
                    match read_daemon_token(&token_path) {
                        Ok(token) => {
                            self.attach_io(writer, reader, TransportMode::Daemon, Some(token))
                                .await;
                            return Ok(());
                        }
                        Err(err) => {
                            last_error = err;
                        }
                    }
                }
                Ok(None) => {
                    // not ready yet
                }
                Err(err) => {
                    last_error = err;
                }
            }
            tokio::time::sleep(std::time::Duration::from_millis(100)).await;
        }

        Err(format!(
            "Failed to connect to daemon endpoint {}: {}",
            endpoint, last_error
        ))
    }

    async fn attach_io(
        &self,
        writer: Box<dyn Write + Send>,
        reader: Box<dyn Read + Send>,
        mode: TransportMode,
        daemon_auth_token: Option<String>,
    ) {
        let (tx, mut rx) = mpsc::channel::<String>(100);

        {
            let mut tx_guard = self.tx.lock().await;
            *tx_guard = Some(tx);
        }

        {
            let mut mode_guard = self.mode.lock().await;
            *mode_guard = mode;
        }

        {
            let mut token_guard = self.daemon_auth_token.lock().await;
            *token_guard = daemon_auth_token;
        }

        let stdin_healthy_clone = self.stdin_healthy.clone();
        tauri::async_runtime::spawn(async move {
            let mut writer = writer;
            while let Some(msg) = rx.recv().await {
                let write_result = writer.write_all(msg.as_bytes());
                let newline_result = if write_result.is_ok() {
                    writer.write_all(b"\n")
                } else {
                    Ok(())
                };
                let flush_result = if write_result.is_ok() && newline_result.is_ok() {
                    writer.flush()
                } else {
                    Ok(())
                };

                if let Err(e) = write_result {
                    eprintln!("Failed to write to transport: {}", e);
                    *stdin_healthy_clone.lock().await = false;
                    break;
                }

                if let Err(e) = newline_result {
                    eprintln!("Failed to write newline to transport: {}", e);
                    *stdin_healthy_clone.lock().await = false;
                    break;
                }

                if let Err(e) = flush_result {
                    eprintln!("Failed to flush transport writer: {}", e);
                    *stdin_healthy_clone.lock().await = false;
                    break;
                }
            }
        });

        let pending_requests = self.pending_requests.clone();
        let event_handler = self.event_handler.clone();

        std::thread::spawn(move || {
            let mut reader = BufReader::new(reader);
            let mut line = String::new();

            loop {
                line.clear();
                let bytes_read = match reader.read_line(&mut line) {
                    Ok(n) => n,
                    Err(_) => break,
                };

                if bytes_read == 0 {
                    break;
                }

                let trimmed = line.trim();
                if trimmed.is_empty() {
                    continue;
                }

                match serde_json::from_str::<SidecarMessage>(trimmed) {
                    Ok(SidecarMessage::Response(response)) => {
                        let mut pending = pending_requests.blocking_lock();
                        if let Some(sender) = pending.remove(&response.id) {
                            let _ = sender.send(response);
                        }
                    }
                    Ok(SidecarMessage::Event(event)) => {
                        let handler = event_handler.blocking_lock();
                        if let Some(ref handler) = *handler {
                            handler(event);
                        }
                    }
                    Err(_) => {
                        // Ignore non-JSON output from sidecar/daemon logs.
                    }
                }
            }
        });
    }

    #[allow(dead_code)]
    pub async fn stop(&self) -> Result<(), String> {
        let mode = *self.mode.lock().await;

        if mode == TransportMode::EmbeddedSidecar {
            let mut process_guard = self.process.lock().await;
            if let Some(mut child) = process_guard.take() {
                child
                    .kill()
                    .map_err(|e| format!("Failed to kill sidecar: {}", e))?;
            }
        }

        {
            let mut tx_guard = self.tx.lock().await;
            *tx_guard = None;
        }

        *self.stdin_healthy.lock().await = true;
        *self.mode.lock().await = TransportMode::Disconnected;
        *self.daemon_auth_token.lock().await = None;

        let mut pending = self.pending_requests.lock().await;
        for (_, sender) in pending.drain() {
            let _ = sender.send(IpcResponse {
                id: String::new(),
                success: false,
                result: None,
                error: Some("Transport stopped".to_string()),
            });
        }

        Ok(())
    }

    pub async fn send_command(
        &self,
        command: &str,
        params: serde_json::Value,
    ) -> Result<serde_json::Value, String> {
        let idempotency_key = format!(
            "{}-{}",
            command,
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|duration| duration.as_micros())
                .unwrap_or(0)
        );

        let mut last_error = String::new();
        for attempt in 1..=DEFAULT_RETRY_ATTEMPTS {
            let mut params_with_envelope = params.clone();
            match &mut params_with_envelope {
                serde_json::Value::Object(map) => {
                    map.insert(
                        "_idempotencyKey".to_string(),
                        serde_json::Value::String(idempotency_key.clone()),
                    );
                    map.insert(
                        "_retryAttempt".to_string(),
                        serde_json::Value::Number(serde_json::Number::from(attempt)),
                    );
                }
                _ => {
                    params_with_envelope = serde_json::json!({
                        "_idempotencyKey": idempotency_key.clone(),
                        "_retryAttempt": attempt,
                        "payload": params_with_envelope,
                    });
                }
            }

            match self.send_command_once(command, params_with_envelope).await {
                Ok(result) => return Ok(result),
                Err(err) => {
                    let retryable = Self::is_retryable_transport_error(&err);
                    if !retryable || attempt >= DEFAULT_RETRY_ATTEMPTS {
                        return Err(err);
                    }
                    last_error = err;
                    tokio::time::sleep(std::time::Duration::from_millis(
                        DEFAULT_RETRY_BACKOFF_MS * u64::from(attempt),
                    ))
                    .await;
                }
            }
        }

        Err(last_error)
    }

    async fn send_command_once(
        &self,
        command: &str,
        params: serde_json::Value,
    ) -> Result<serde_json::Value, String> {
        if !*self.stdin_healthy.lock().await {
            return Err("Transport writer is not healthy - please restart the application".to_string());
        }

        let id = {
            let mut counter = self.request_counter.lock().await;
            *counter += 1;
            format!("req_{}", *counter)
        };

        let (response_tx, response_rx) = oneshot::channel();
        {
            let mut pending = self.pending_requests.lock().await;
            pending.insert(id.clone(), response_tx);
        }

        let mode = *self.mode.lock().await;
        let auth_token = if mode == TransportMode::Daemon {
            self.daemon_auth_token.lock().await.clone()
        } else {
            None
        };

        let request = IpcRequest {
            id: id.clone(),
            command: command.to_string(),
            params,
            auth_token,
        };

        let msg = serde_json::to_string(&request)
            .map_err(|e| format!("Failed to serialize request: {}", e))?;

        {
            let tx_guard = self.tx.lock().await;
            if let Some(ref tx) = *tx_guard {
                tx.send(msg)
                    .await
                    .map_err(|e| format!("Failed to send to transport: {}", e))?;
            } else {
                return Err("Transport is not running".to_string());
            }
        }

        match tokio::time::timeout(
            std::time::Duration::from_secs(DEFAULT_REQUEST_TIMEOUT_SECS),
            response_rx,
        )
        .await
        {
            Err(_) => {
                self.pending_requests.lock().await.remove(&id);
                Err(format!(
                    "Request timed out after {}s",
                    DEFAULT_REQUEST_TIMEOUT_SECS
                ))
            }
            Ok(Ok(response)) => {
                if response.success {
                    Ok(response.result.unwrap_or(serde_json::Value::Null))
                } else {
                    Err(response
                        .error
                        .unwrap_or_else(|| "Unknown error".to_string()))
                }
            }
            Ok(Err(_)) => Err("Response channel closed".to_string()),
        }
    }

    fn is_retryable_transport_error(error: &str) -> bool {
        let normalized = error.to_lowercase();
        normalized.contains("timed out")
            || normalized.contains("failed to send to transport")
            || normalized.contains("transport is not running")
            || normalized.contains("response channel closed")
    }

    pub async fn is_running(&self) -> bool {
        let mode = *self.mode.lock().await;
        match mode {
            TransportMode::EmbeddedSidecar => {
                let mut guard = self.process.lock().await;
                if let Some(ref mut child) = *guard {
                    match child.try_wait() {
                        Ok(None) => true,
                        Ok(Some(_)) => {
                            *guard = None;
                            *self.mode.lock().await = TransportMode::Disconnected;
                            false
                        }
                        Err(_) => false,
                    }
                } else {
                    false
                }
            }
            TransportMode::Daemon => {
                let tx_ready = self.tx.lock().await.is_some();
                tx_ready && *self.stdin_healthy.lock().await
            }
            TransportMode::Disconnected => false,
        }
    }
}

impl Drop for SidecarManager {
    fn drop(&mut self) {
        if let Ok(mut guard) = self.process.try_lock() {
            if let Some(mut child) = guard.take() {
                let _ = child.kill();
            }
        }
    }
}

impl Default for SidecarManager {
    fn default() -> Self {
        Self::new()
    }
}

fn daemon_transport_enabled() -> bool {
    env_bool("COWORK_DAEMON_TRANSPORT_ENABLED", true)
}

fn daemon_fallback_enabled() -> bool {
    env_bool("COWORK_DAEMON_FALLBACK_EMBEDDED_SIDECAR", true)
}

fn env_bool(key: &str, default_value: bool) -> bool {
    match std::env::var(key) {
        Ok(value) => {
            let normalized = value.trim().to_lowercase();
            match normalized.as_str() {
                "1" | "true" | "yes" | "on" | "enabled" => true,
                "0" | "false" | "no" | "off" | "disabled" => false,
                _ => default_value,
            }
        }
        Err(_) => default_value,
    }
}

fn runtime_binary_name(base: &str) -> String {
    if cfg!(windows) {
        format!("{}.exe", base)
    } else {
        base.to_string()
    }
}

fn platform_target_triple() -> &'static str {
    #[cfg(all(target_os = "macos", target_arch = "aarch64"))]
    {
        "aarch64-apple-darwin"
    }
    #[cfg(all(target_os = "macos", target_arch = "x86_64"))]
    {
        "x86_64-apple-darwin"
    }
    #[cfg(all(target_os = "windows", target_arch = "x86_64"))]
    {
        "x86_64-pc-windows-msvc"
    }
    #[cfg(all(target_os = "windows", target_arch = "aarch64"))]
    {
        "aarch64-pc-windows-msvc"
    }
    #[cfg(all(target_os = "linux", target_arch = "x86_64"))]
    {
        "x86_64-unknown-linux-gnu"
    }
    #[cfg(all(target_os = "linux", target_arch = "aarch64"))]
    {
        "aarch64-unknown-linux-gnu"
    }
    #[cfg(not(any(
        all(target_os = "macos", target_arch = "aarch64"),
        all(target_os = "macos", target_arch = "x86_64"),
        all(target_os = "windows", target_arch = "x86_64"),
        all(target_os = "windows", target_arch = "aarch64"),
        all(target_os = "linux", target_arch = "x86_64"),
        all(target_os = "linux", target_arch = "aarch64")
    )))]
    {
        ""
    }
}

fn packaged_binary_names(base: &str) -> Vec<String> {
    let mut names = Vec::new();
    let runtime = runtime_binary_name(base);
    names.push(runtime.clone());

    let triple = platform_target_triple();
    if !triple.is_empty() {
        if cfg!(windows) {
            names.push(format!("{}-{}.exe", base, triple));
        } else {
            names.push(format!("{}-{}", base, triple));
        }
    }

    names.sort();
    names.dedup();
    names
}

fn sidecar_binary_search_roots(app_data_dir: &str) -> Vec<PathBuf> {
    let mut roots = Vec::new();

    if let Ok(exe) = std::env::current_exe() {
        if let Some(parent) = exe.parent() {
            roots.push(parent.to_path_buf());
            roots.push(parent.join("binaries"));
            roots.push(parent.join("../Resources"));
            roots.push(parent.join("../Resources/binaries"));
            roots.push(parent.join("../../Resources"));
            roots.push(parent.join("../../Resources/binaries"));
        }
    }

    let app_data = PathBuf::from(app_data_dir);
    roots.push(app_data.clone());
    roots.push(app_data.join("binaries"));

    if let Ok(manifest_dir) = std::env::var("CARGO_MANIFEST_DIR") {
        roots.push(PathBuf::from(manifest_dir).join("binaries"));
    }

    roots
}

fn is_non_empty_file(path: &Path) -> bool {
    std::fs::metadata(path)
        .map(|meta| meta.is_file() && meta.len() > 0)
        .unwrap_or(false)
}

fn find_packaged_binary(app_data_dir: &str, base: &str) -> Option<PathBuf> {
    let names = packaged_binary_names(base);
    for root in sidecar_binary_search_roots(app_data_dir) {
        for name in &names {
            let candidate = root.join(name);
            if is_non_empty_file(&candidate) {
                return Some(candidate);
            }
        }
    }
    None
}

fn ensure_runtime_binary(runtime_dir: &Path, app_data_dir: &str, base: &str) -> Result<PathBuf, String> {
    let target = runtime_dir.join(runtime_binary_name(base));
    if is_non_empty_file(&target) {
        return Ok(target);
    }

    let source = find_packaged_binary(app_data_dir, base).ok_or_else(|| {
        let searched = sidecar_binary_search_roots(app_data_dir)
            .into_iter()
            .map(|p| p.to_string_lossy().to_string())
            .collect::<Vec<_>>()
            .join(", ");
        format!(
            "Unable to locate packaged binary `{}`. Looked in: {}",
            base, searched
        )
    })?;

    std::fs::copy(&source, &target).map_err(|e| {
        format!(
            "Failed to copy runtime binary from {:?} to {:?}: {}",
            source, target, e
        )
    })?;

    #[cfg(unix)]
    std::fs::set_permissions(&target, std::fs::Permissions::from_mode(0o755))
        .map_err(|e| format!("Failed to mark runtime binary executable {:?}: {}", target, e))?;

    Ok(target)
}

pub fn resolve_sidecar_dir(app_data_dir: &str) -> Result<PathBuf, String> {
    if cfg!(debug_assertions) {
        let path = std::env::var("CARGO_MANIFEST_DIR")
            .map(|dir| PathBuf::from(dir).join("../src-sidecar"))
            .unwrap_or_else(|_| {
                std::env::current_exe()
                    .ok()
                    .and_then(|p| p.parent().map(|p| p.to_path_buf()))
                    .map(|p| p.join("../../../src-sidecar"))
                    .unwrap_or_else(|| PathBuf::from("src-sidecar"))
            });
        return Ok(path.canonicalize().unwrap_or(path));
    }

    let runtime_dir = PathBuf::from(app_data_dir).join("sidecar");
    std::fs::create_dir_all(&runtime_dir).map_err(|e| {
        format!(
            "Failed to create sidecar runtime directory {:?}: {}",
            runtime_dir, e
        )
    })?;

    ensure_runtime_binary(&runtime_dir, app_data_dir, "sidecar")?;
    ensure_runtime_binary(&runtime_dir, app_data_dir, "cowork-agentd")?;

    Ok(runtime_dir.canonicalize().unwrap_or(runtime_dir))
}

fn sanitize_username(raw: &str) -> String {
    let lowered = raw.trim().to_lowercase();
    let mut result = String::with_capacity(lowered.len());
    for ch in lowered.chars() {
        if ch.is_ascii_alphanumeric() || ch == '_' || ch == '-' {
            result.push(ch);
        } else {
            result.push('-');
        }
    }
    if result.is_empty() {
        "user".to_string()
    } else {
        result
    }
}

fn daemon_tcp_port() -> u16 {
    let username = std::env::var("USER")
        .or_else(|_| std::env::var("USERNAME"))
        .unwrap_or_else(|_| "user".to_string());
    let user = sanitize_username(&username);

    let mut hash: i32 = 0;
    for byte in user.as_bytes() {
        hash = hash
            .wrapping_shl(5)
            .wrapping_sub(hash)
            .wrapping_add(*byte as i32);
    }

    let offset = (hash as i64).abs() % 1000;
    (39100 + offset as u16) as u16
}

fn resolve_daemon_endpoint(app_data_dir: &str) -> String {
    if cfg!(windows) {
        format!("tcp://127.0.0.1:{}", daemon_tcp_port())
    } else {
        PathBuf::from(app_data_dir)
            .join("daemon")
            .join("agentd.sock")
            .to_string_lossy()
            .to_string()
    }
}

fn resolve_daemon_token_path(app_data_dir: &str) -> PathBuf {
    PathBuf::from(app_data_dir).join("daemon").join("auth.token")
}

fn resolve_daemon_lock_path(app_data_dir: &str) -> PathBuf {
    PathBuf::from(app_data_dir).join("daemon").join("agentd.lock")
}

fn read_daemon_token(path: &PathBuf) -> Result<String, String> {
    let content = std::fs::read_to_string(path)
        .map_err(|e| format!("Failed to read daemon auth token: {}", e))?;
    let token = content.trim().to_string();
    if token.is_empty() {
        return Err("Daemon auth token is empty".to_string());
    }
    Ok(token)
}

fn parse_tcp_endpoint(endpoint: &str) -> Result<(String, u16), String> {
    let trimmed = endpoint.trim();
    let value = trimmed
        .strip_prefix("tcp://")
        .ok_or_else(|| format!("Invalid TCP endpoint: {}", endpoint))?;
    let mut parts = value.rsplitn(2, ':');
    let port_str = parts
        .next()
        .ok_or_else(|| format!("Missing TCP port in endpoint: {}", endpoint))?;
    let host = parts
        .next()
        .ok_or_else(|| format!("Missing TCP host in endpoint: {}", endpoint))?;
    let port: u16 = port_str
        .parse()
        .map_err(|_| format!("Invalid TCP port in endpoint: {}", endpoint))?;
    Ok((host.to_string(), port))
}

fn try_connect_daemon(
    endpoint: &str,
) -> Result<Option<(Box<dyn Read + Send>, Box<dyn Write + Send>)>, String> {
    if endpoint.starts_with("tcp://") {
        let (host, port) = parse_tcp_endpoint(endpoint)?;
        match TcpStream::connect((host.as_str(), port)) {
            Ok(stream) => {
                let _ = stream.set_nodelay(true);
                let reader = stream
                    .try_clone()
                    .map_err(|e| format!("Failed to clone daemon TCP stream: {}", e))?;
                return Ok(Some((Box::new(reader), Box::new(stream))));
            }
            Err(_) => return Ok(None),
        }
    }

    #[cfg(unix)]
    {
        match UnixStream::connect(endpoint) {
            Ok(stream) => {
                let reader = stream
                    .try_clone()
                    .map_err(|e| format!("Failed to clone daemon UNIX stream: {}", e))?;
                Ok(Some((Box::new(reader), Box::new(stream))))
            }
            Err(_) => Ok(None),
        }
    }

    #[cfg(not(unix))]
    {
        let _ = endpoint;
        Ok(None)
    }
}

fn spawn_daemon_process(
    sidecar_dir: &PathBuf,
    app_data_dir: &str,
    endpoint: &str,
    token_path: &PathBuf,
    lock_path: &PathBuf,
) -> Result<Child, String> {
    if cfg!(debug_assertions) {
        let pnpm_cmd = if cfg!(windows) { "pnpm.cmd" } else { "pnpm" };
        let mut command = Command::new(pnpm_cmd);
        command
            .args([
                "exec",
                "tsx",
                "src/daemon.ts",
                "--app-data-dir",
                app_data_dir,
                "--endpoint",
                endpoint,
                "--token-file",
                token_path
                    .to_str()
                    .ok_or_else(|| "Invalid daemon token path".to_string())?,
                "--lock-file",
                lock_path
                    .to_str()
                    .ok_or_else(|| "Invalid daemon lock path".to_string())?,
            ])
            .current_dir(sidecar_dir)
            .stdin(Stdio::null())
            .stdout(Stdio::inherit())
            .stderr(Stdio::inherit());
        apply_connector_secret_seed_env(&mut command);
        command
            .spawn()
            .map_err(|e| format!("Failed to spawn daemon (dev mode): {}", e))
    } else {
        let binary_name = if cfg!(windows) {
            "cowork-agentd.exe"
        } else {
            "cowork-agentd"
        };
        let binary_path = sidecar_dir.join(binary_name);

        if !binary_path.exists() {
            return Err(format!(
                "Daemon binary not found at: {:?}. Please reinstall the application.",
                binary_path
            ));
        }

        let mut command = Command::new(binary_path);
        command
            .args([
                "--app-data-dir",
                app_data_dir,
                "--endpoint",
                endpoint,
                "--token-file",
                token_path
                    .to_str()
                    .ok_or_else(|| "Invalid daemon token path".to_string())?,
                "--lock-file",
                lock_path
                    .to_str()
                    .ok_or_else(|| "Invalid daemon lock path".to_string())?,
            ])
            .current_dir(sidecar_dir)
            .stdin(Stdio::null())
            .stdout(Stdio::inherit())
            .stderr(Stdio::inherit());
        apply_connector_secret_seed_env(&mut command);
        command
            .spawn()
            .map_err(|e| format!("Failed to spawn daemon binary: {}", e))
    }
}

fn apply_connector_secret_seed_env(command: &mut Command) {
    match crate::commands::credentials::get_or_create_sidecar_connector_seed() {
        Ok(seed) => {
            command.env(CONNECTOR_SECRET_ENV_VAR, seed);
        }
        Err(err) => {
            eprintln!(
                "[security] Unable to load connector secret seed from secure store; using fallback in sidecar: {}",
                err
            );
        }
    }
}
