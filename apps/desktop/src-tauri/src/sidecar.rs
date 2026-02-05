use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::io::{BufRead, BufReader, Write};
use std::process::{Child, Command, Stdio};
use std::sync::Arc;
use tauri::async_runtime::Mutex;
use tokio::sync::{mpsc, oneshot};

/// Default timeout for sidecar requests in seconds.
/// This is set high (5 minutes) to accommodate:
/// - Large context processing (up to 1M+ tokens)
/// - Complex agent tasks with multiple tool calls
/// - Network latency for Gemini API calls
/// Can be overridden per-request if needed.
const DEFAULT_REQUEST_TIMEOUT_SECS: u64 = 300;

/// IPC Message sent to sidecar
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IpcRequest {
    pub id: String,
    pub command: String,
    pub params: serde_json::Value,
}

/// IPC Response from sidecar
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IpcResponse {
    pub id: String,
    pub success: bool,
    pub result: Option<serde_json::Value>,
    pub error: Option<String>,
}

/// Event from sidecar
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SidecarEvent {
    #[serde(rename = "type")]
    pub event_type: String,
    pub session_id: Option<String>,
    pub data: serde_json::Value,
}

/// Message types from sidecar (can be response or event)
#[derive(Debug, Clone, Deserialize)]
#[serde(untagged)]
pub enum SidecarMessage {
    Response(IpcResponse),
    Event(SidecarEvent),
}

type PendingRequests = Arc<Mutex<HashMap<String, oneshot::Sender<IpcResponse>>>>;

pub struct SidecarManager {
    process: Arc<Mutex<Option<Child>>>,
    tx: Arc<Mutex<Option<mpsc::Sender<String>>>>,
    pending_requests: PendingRequests,
    event_handler: Arc<Mutex<Option<Box<dyn Fn(SidecarEvent) + Send + 'static>>>>,
    request_counter: Arc<Mutex<u64>>,
    /// Track if stdin writer is healthy (false if write failed)
    stdin_healthy: Arc<Mutex<bool>>,
}

impl SidecarManager {
    pub fn new() -> Self {
        Self {
            process: Arc::new(Mutex::new(None)),
            tx: Arc::new(Mutex::new(None)),
            pending_requests: Arc::new(Mutex::new(HashMap::new())),
            event_handler: Arc::new(Mutex::new(None)),
            request_counter: Arc::new(Mutex::new(0)),
            stdin_healthy: Arc::new(Mutex::new(true)),
        }
    }

    /// Set event handler for sidecar events
    pub async fn set_event_handler<F>(&self, handler: F)
    where
        F: Fn(SidecarEvent) + Send + 'static,
    {
        let mut event_handler = self.event_handler.lock().await;
        *event_handler = Some(Box::new(handler));
    }

    /// Start the sidecar process
    pub async fn start(&self, app_data_dir: &str) -> Result<(), String> {
        let mut process_guard = self.process.lock().await;

        if process_guard.is_some() {
            return Ok(()); // Already running
        }

        // Reset stdin health for new process
        *self.stdin_healthy.lock().await = true;

        // Find the sidecar directory
        // In development: relative to the desktop package (CARGO_MANIFEST_DIR points to src-tauri)
        // In production: sidecar bundled with app
        let sidecar_path = if cfg!(debug_assertions) {
            // Development: CARGO_MANIFEST_DIR is src-tauri, go up one level to desktop, then into src-sidecar
            std::env::var("CARGO_MANIFEST_DIR")
                .map(|dir| std::path::PathBuf::from(dir).join("../src-sidecar"))
                .unwrap_or_else(|_| {
                    // Fallback: try to find it relative to executable
                    std::env::current_exe()
                        .ok()
                        .and_then(|p| p.parent().map(|p| p.to_path_buf()))
                        .map(|p| p.join("../../../src-sidecar"))
                        .unwrap_or_else(|| std::path::PathBuf::from("src-sidecar"))
                })
        } else {
            // Production: sidecar bundled alongside the app
            std::path::PathBuf::from(app_data_dir).join("sidecar")
        };

        // Canonicalize path if it exists
        let sidecar_path = sidecar_path.canonicalize().unwrap_or(sidecar_path);

        // Verify path exists
        if !sidecar_path.exists() {
            return Err(format!(
                "Sidecar not found at: {:?}. App data dir: {}",
                sidecar_path, app_data_dir
            ));
        }

        // Determine how to run the sidecar based on build mode
        let mut child = if cfg!(debug_assertions) {
            // Development: Use npx tsx for hot reloading
            let npx_cmd = if cfg!(windows) { "npx.cmd" } else { "npx" };
            Command::new(npx_cmd)
                .args(["tsx", "src/index.ts"])
                .current_dir(&sidecar_path)
                .stdin(Stdio::piped())
                .stdout(Stdio::piped())
                .stderr(Stdio::inherit())
                .spawn()
                .map_err(|e| format!("Failed to spawn sidecar (dev mode): {}", e))?
        } else {
            // Production: Use bundled binary
            let binary_name = if cfg!(windows) { "sidecar.exe" } else { "sidecar" };
            let binary_path = sidecar_path.join(binary_name);

            if !binary_path.exists() {
                return Err(format!(
                    "Sidecar binary not found at: {:?}. Please reinstall the application.",
                    binary_path
                ));
            }

            Command::new(&binary_path)
                .current_dir(&sidecar_path)
                .stdin(Stdio::piped())
                .stdout(Stdio::piped())
                .stderr(Stdio::inherit())
                .spawn()
                .map_err(|e| format!("Failed to spawn sidecar binary: {}", e))?
        };

        let stdin = child.stdin.take();
        let stdout = child.stdout.take();

        // Set up stdin writer channel
        let (tx, mut rx) = mpsc::channel::<String>(100);

        // Store the channel sender
        {
            let mut tx_guard = self.tx.lock().await;
            *tx_guard = Some(tx);
        }

        // Spawn stdin writer task
        let stdin = stdin.ok_or("Failed to get stdin")?;
        let stdin_healthy_clone = self.stdin_healthy.clone();
        tauri::async_runtime::spawn(async move {
            let mut stdin = stdin;
            while let Some(msg) = rx.recv().await {
                // Perform write operations synchronously to avoid Send issues
                let write_result = writeln!(stdin, "{}", msg);
                let flush_result = if write_result.is_ok() {
                    stdin.flush()
                } else {
                    Ok(()) // Skip flush if write failed
                };

                // Handle errors after synchronous operations
                if let Err(e) = write_result {
                    eprintln!("Failed to write to sidecar stdin: {}", e);
                    // Mark stdin as unhealthy so send_command knows to fail
                    *stdin_healthy_clone.lock().await = false;
                    break;
                }
                if let Err(e) = flush_result {
                    eprintln!("Failed to flush sidecar stdin: {}", e);
                    // Mark stdin as unhealthy so send_command knows to fail
                    *stdin_healthy_clone.lock().await = false;
                    break;
                }
            }
        });

        // Spawn stdout reader task
        let stdout = stdout.ok_or("Failed to get stdout")?;
        let pending_requests = self.pending_requests.clone();
        let event_handler = self.event_handler.clone();

        // Spawn stdout reader in a blocking thread to avoid blocking the async runtime
        std::thread::spawn(move || {
            eprintln!("[sidecar-reader] Starting stdout reader thread...");
            let reader = BufReader::new(stdout);
            for line in reader.lines() {
                match line {
                    Ok(line) if !line.is_empty() => {
                        eprintln!("[sidecar-reader] Received line: {}", &line[..line.len().min(200)]);
                        // Try to parse as JSON
                        match serde_json::from_str::<SidecarMessage>(&line) {
                            Ok(SidecarMessage::Response(response)) => {
                                eprintln!("[sidecar-reader] Parsed as Response: id={}, success={}", response.id, response.success);
                                // Handle response - find pending request
                                // Use blocking lock since we're in a sync thread
                                let mut pending = pending_requests.blocking_lock();
                                if let Some(sender) = pending.remove(&response.id) {
                                    eprintln!("[sidecar-reader] Found pending request, sending response");
                                    let _ = sender.send(response);
                                    eprintln!("[sidecar-reader] Response sent via oneshot channel");
                                } else {
                                    eprintln!("[sidecar-reader] No pending request found for id={}", response.id);
                                }
                            }
                            Ok(SidecarMessage::Event(event)) => {
                                eprintln!("[sidecar-reader] Parsed as Event: type={}", event.event_type);
                                // Handle event - use blocking lock
                                let handler = event_handler.blocking_lock();
                                if let Some(ref handler) = *handler {
                                    handler(event);
                                }
                            }
                            Err(e) => {
                                eprintln!("[sidecar-reader] Failed to parse message: {} - {}", e, line);
                            }
                        }
                    }
                    Ok(_) => {} // Empty line
                    Err(e) => {
                        eprintln!("[sidecar-reader] Failed to read from sidecar: {}", e);
                        break;
                    }
                }
            }
            eprintln!("[sidecar-reader] stdout reader thread ended");
        });

        *process_guard = Some(child);
        Ok(())
    }

    /// Stop the sidecar process
    pub async fn stop(&self) -> Result<(), String> {
        let mut process_guard = self.process.lock().await;

        if let Some(mut child) = process_guard.take() {
            child.kill().map_err(|e| format!("Failed to kill sidecar: {}", e))?;
        }

        // Clear the channel
        let mut tx_guard = self.tx.lock().await;
        *tx_guard = None;

        // Reset stdin health
        *self.stdin_healthy.lock().await = true;

        Ok(())
    }

    /// Send a command to the sidecar and wait for response
    pub async fn send_command(
        &self,
        command: &str,
        params: serde_json::Value,
    ) -> Result<serde_json::Value, String> {
        eprintln!("[send_command] Starting command: {}", command);

        // Check if stdin is healthy before attempting to send
        if !*self.stdin_healthy.lock().await {
            return Err("Sidecar stdin is not healthy - please restart the application".to_string());
        }
        eprintln!("[send_command] stdin is healthy");

        // Generate unique request ID
        let id = {
            let mut counter = self.request_counter.lock().await;
            *counter += 1;
            format!("req_{}", *counter)
        };
        eprintln!("[send_command] Generated request id: {}", id);

        // Create response channel
        let (response_tx, response_rx) = oneshot::channel();

        // Register pending request
        {
            let mut pending = self.pending_requests.lock().await;
            pending.insert(id.clone(), response_tx);
            eprintln!("[send_command] Registered pending request, count: {}", pending.len());
        }

        // Build request
        let request = IpcRequest {
            id: id.clone(),
            command: command.to_string(),
            params,
        };

        let msg = serde_json::to_string(&request)
            .map_err(|e| format!("Failed to serialize request: {}", e))?;

        // Send to sidecar
        {
            let tx_guard = self.tx.lock().await;
            if let Some(ref tx) = *tx_guard {
                eprintln!("[send_command] Sending to sidecar channel...");
                tx.send(msg)
                    .await
                    .map_err(|e| format!("Failed to send to sidecar: {}", e))?;
                eprintln!("[send_command] Sent to channel successfully");
            } else {
                return Err("Sidecar not running".to_string());
            }
        }

        eprintln!("[send_command] Waiting for response...");
        // Wait for response with timeout
        // Uses DEFAULT_REQUEST_TIMEOUT_SECS (300s) to handle large context operations
        let response = tokio::time::timeout(
            std::time::Duration::from_secs(DEFAULT_REQUEST_TIMEOUT_SECS),
            response_rx
        )
            .await
            .map_err(|_| format!("Request timed out after {}s", DEFAULT_REQUEST_TIMEOUT_SECS))?
            .map_err(|_| "Response channel closed")?;

        eprintln!("[send_command] Got response: success={}", response.success);

        if response.success {
            Ok(response.result.unwrap_or(serde_json::Value::Null))
        } else {
            Err(response.error.unwrap_or_else(|| "Unknown error".to_string()))
        }
    }

    /// Check if sidecar is running
    pub async fn is_running(&self) -> bool {
        self.process.lock().await.is_some()
    }
}

impl Default for SidecarManager {
    fn default() -> Self {
        Self::new()
    }
}
