use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::io::{BufRead, BufReader, Write};
use std::process::{Child, Command, Stdio};
use std::sync::Arc;
use tauri::async_runtime::Mutex;
use tokio::sync::{mpsc, oneshot};

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
}

impl SidecarManager {
    pub fn new() -> Self {
        Self {
            process: Arc::new(Mutex::new(None)),
            tx: Arc::new(Mutex::new(None)),
            pending_requests: Arc::new(Mutex::new(HashMap::new())),
            event_handler: Arc::new(Mutex::new(None)),
            request_counter: Arc::new(Mutex::new(0)),
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

        // Find the sidecar executable
        // In development, we use npx tsx to run the TypeScript directly
        // In production, we'd bundle a compiled JS file
        let sidecar_path = std::path::Path::new(app_data_dir)
            .parent()
            .and_then(|p| p.parent())
            .map(|p| p.join("src-sidecar"))
            .ok_or("Failed to determine sidecar path")?;

        let mut child = Command::new("npx")
            .args(["tsx", "src/index.ts"])
            .current_dir(&sidecar_path)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::inherit())
            .spawn()
            .map_err(|e| format!("Failed to spawn sidecar: {}", e))?;

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
        tauri::async_runtime::spawn(async move {
            let mut stdin = stdin;
            while let Some(msg) = rx.recv().await {
                if let Err(e) = writeln!(stdin, "{}", msg) {
                    eprintln!("Failed to write to sidecar stdin: {}", e);
                    break;
                }
                if let Err(e) = stdin.flush() {
                    eprintln!("Failed to flush sidecar stdin: {}", e);
                    break;
                }
            }
        });

        // Spawn stdout reader task
        let stdout = stdout.ok_or("Failed to get stdout")?;
        let pending_requests = self.pending_requests.clone();
        let event_handler = self.event_handler.clone();

        tauri::async_runtime::spawn(async move {
            let reader = BufReader::new(stdout);
            for line in reader.lines() {
                match line {
                    Ok(line) if !line.is_empty() => {
                        // Try to parse as JSON
                        match serde_json::from_str::<SidecarMessage>(&line) {
                            Ok(SidecarMessage::Response(response)) => {
                                // Handle response - find pending request
                                let mut pending = pending_requests.lock().await;
                                if let Some(sender) = pending.remove(&response.id) {
                                    let _ = sender.send(response);
                                }
                            }
                            Ok(SidecarMessage::Event(event)) => {
                                // Handle event
                                let handler = event_handler.lock().await;
                                if let Some(ref handler) = *handler {
                                    handler(event);
                                }
                            }
                            Err(e) => {
                                eprintln!("Failed to parse sidecar message: {} - {}", e, line);
                            }
                        }
                    }
                    Ok(_) => {} // Empty line
                    Err(e) => {
                        eprintln!("Failed to read from sidecar: {}", e);
                        break;
                    }
                }
            }
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

        Ok(())
    }

    /// Send a command to the sidecar and wait for response
    pub async fn send_command(
        &self,
        command: &str,
        params: serde_json::Value,
    ) -> Result<serde_json::Value, String> {
        // Generate unique request ID
        let id = {
            let mut counter = self.request_counter.lock().await;
            *counter += 1;
            format!("req_{}", *counter)
        };

        // Create response channel
        let (response_tx, response_rx) = oneshot::channel();

        // Register pending request
        {
            let mut pending = self.pending_requests.lock().await;
            pending.insert(id.clone(), response_tx);
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
                tx.send(msg)
                    .await
                    .map_err(|e| format!("Failed to send to sidecar: {}", e))?;
            } else {
                return Err("Sidecar not running".to_string());
            }
        }

        // Wait for response with timeout
        let response = tokio::time::timeout(std::time::Duration::from_secs(300), response_rx)
            .await
            .map_err(|_| "Request timed out")?
            .map_err(|_| "Response channel closed")?;

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
