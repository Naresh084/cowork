// Copyright (c) 2026 Naresh. All rights reserved.
// Licensed under the MIT License. See LICENSE file for details.

use crate::sidecar::resolve_sidecar_dir;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::process::{Command, Output};

#[cfg(unix)]
use std::os::unix::fs::PermissionsExt;

const MODE_STATE_DIR: &str = "service";
const MODE_STATE_FILE: &str = "mode.json";

#[cfg(target_os = "macos")]
const MAC_USER_LABEL: &str = "com.cowork.agentd.user";
#[cfg(target_os = "macos")]
const MAC_SYSTEM_LABEL: &str = "com.cowork.agentd.system";

#[cfg(any(target_os = "linux", target_os = "windows"))]
const SERVICE_UNIT_NAME: &str = "cowork-agentd";
#[cfg(any(target_os = "linux", target_os = "windows"))]
const SERVICE_DISPLAY_NAME: &str = "Cowork Agent Daemon";

#[cfg(target_os = "windows")]
const WINDOWS_USER_TASK_NAME: &str = "\\Cowork\\AgentDUser";
#[cfg(target_os = "windows")]
const WINDOWS_SYSTEM_SERVICE_NAME: &str = "CoworkAgentD";

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
enum ServiceMode {
    User,
    System,
}

impl ServiceMode {
    fn parse(value: &str) -> Result<Self, String> {
        match value.trim().to_lowercase().as_str() {
            "user" => Ok(Self::User),
            "system" | "system-wide" | "system_wide" => Ok(Self::System),
            _ => Err(format!("Invalid service mode '{}'. Expected 'user' or 'system'.", value)),
        }
    }

    fn as_str(self) -> &'static str {
        match self {
            Self::User => "user",
            Self::System => "system",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ServiceModeState {
    pub mode: String,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ServiceStatus {
    pub mode: String,
    pub manager: String,
    pub service_id: String,
    pub installed: bool,
    pub running: bool,
    pub enabled: bool,
    pub config_path: Option<String>,
    pub daemon_program: String,
    pub daemon_args: Vec<String>,
    pub app_data_dir: String,
    pub endpoint: String,
    pub token_file: String,
    pub lock_file: String,
    pub details: Option<String>,
}

#[derive(Debug, Clone)]
struct DaemonExecSpec {
    program: String,
    args: Vec<String>,
    app_data_dir: PathBuf,
    endpoint: String,
    token_file: PathBuf,
    lock_file: PathBuf,
}

fn now_ms() -> i64 {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

fn resolve_home_dir() -> Result<PathBuf, String> {
    dirs::home_dir().ok_or_else(|| "Failed to resolve home directory".to_string())
}

fn resolve_user_app_data_dir() -> Result<PathBuf, String> {
    let dir = resolve_home_dir()?.join(".cowork");
    fs::create_dir_all(&dir).map_err(|e| format!("Failed to create app data directory {:?}: {}", dir, e))?;
    Ok(dir)
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
    39100 + offset as u16
}

fn resolve_daemon_endpoint(app_data_dir: &Path) -> String {
    if cfg!(windows) {
        format!("tcp://127.0.0.1:{}", daemon_tcp_port())
    } else {
        app_data_dir
            .join("daemon")
            .join("agentd.sock")
            .to_string_lossy()
            .to_string()
    }
}

fn resolve_daemon_token_path(app_data_dir: &Path) -> PathBuf {
    app_data_dir.join("daemon").join("auth.token")
}

fn resolve_daemon_lock_path(app_data_dir: &Path) -> PathBuf {
    app_data_dir.join("daemon").join("agentd.lock")
}

#[cfg(target_os = "windows")]
fn resolve_node_binary() -> Result<String, String> {
    if let Ok(value) = std::env::var("NODE_BINARY") {
        if !value.trim().is_empty() {
            return Ok(value);
        }
    }

    let output = Command::new("where")
        .arg("node")
        .output()
        .map_err(|e| format!("Failed to locate node executable with `where`: {}", e))?;
    if !output.status.success() {
        return Err(format!(
            "Failed to locate node executable with `where`: {}",
            output_text(&output)
        ));
    }
    let first = String::from_utf8_lossy(&output.stdout)
        .lines()
        .find(|line| !line.trim().is_empty())
        .map(|line| line.trim().to_string());
    first.ok_or_else(|| "Failed to parse node executable path from `where node`".to_string())
}

#[cfg(not(target_os = "windows"))]
fn resolve_node_binary() -> Result<String, String> {
    if let Ok(value) = std::env::var("NODE_BINARY") {
        if !value.trim().is_empty() {
            return Ok(value);
        }
    }

    let output = Command::new("which")
        .arg("node")
        .output()
        .map_err(|e| format!("Failed to locate node executable with `which`: {}", e))?;
    if !output.status.success() {
        return Err(format!(
            "Failed to locate node executable with `which`: {}",
            output_text(&output)
        ));
    }
    let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if path.is_empty() {
        Err("Failed to parse node executable path from `which node`".to_string())
    } else {
        Ok(path)
    }
}

fn resolve_daemon_exec_spec() -> Result<DaemonExecSpec, String> {
    let app_data_dir = resolve_user_app_data_dir()?;
    let endpoint = resolve_daemon_endpoint(&app_data_dir);
    let token_file = resolve_daemon_token_path(&app_data_dir);
    let lock_file = resolve_daemon_lock_path(&app_data_dir);

    let mut args = vec![
        "--app-data-dir".to_string(),
        app_data_dir.to_string_lossy().to_string(),
        "--endpoint".to_string(),
        endpoint.clone(),
        "--token-file".to_string(),
        token_file.to_string_lossy().to_string(),
        "--lock-file".to_string(),
        lock_file.to_string_lossy().to_string(),
    ];

    if cfg!(debug_assertions) {
        let sidecar_dir = resolve_sidecar_dir(&app_data_dir.to_string_lossy())?;
        let daemon_script = sidecar_dir.join("dist").join("daemon.js");
        if !daemon_script.exists() {
            return Err(format!(
                "Daemon script not found at {:?}. Build sidecar first with `pnpm --filter @cowork/sidecar build`.",
                daemon_script
            ));
        }
        let program = resolve_node_binary()?;
        let mut daemon_args = vec![daemon_script.to_string_lossy().to_string()];
        daemon_args.append(&mut args);
        return Ok(DaemonExecSpec {
            program,
            args: daemon_args,
            app_data_dir,
            endpoint,
            token_file,
            lock_file,
        });
    }

    let sidecar_dir = resolve_sidecar_dir(&app_data_dir.to_string_lossy())?;
    let daemon_binary = if cfg!(windows) {
        sidecar_dir.join("cowork-agentd.exe")
    } else {
        sidecar_dir.join("cowork-agentd")
    };
    if !daemon_binary.exists() {
        return Err(format!(
            "Daemon binary not found at {:?}. Reinstall the app or run sidecar packaging.",
            daemon_binary
        ));
    }

    Ok(DaemonExecSpec {
        program: daemon_binary.to_string_lossy().to_string(),
        args,
        app_data_dir,
        endpoint,
        token_file,
        lock_file,
    })
}

fn mode_state_path() -> Result<PathBuf, String> {
    Ok(resolve_user_app_data_dir()?.join(MODE_STATE_DIR).join(MODE_STATE_FILE))
}

fn load_saved_mode() -> ServiceMode {
    let path = match mode_state_path() {
        Ok(path) => path,
        Err(_) => return ServiceMode::User,
    };

    if !path.exists() {
        return ServiceMode::User;
    }

    let raw = match fs::read_to_string(&path) {
        Ok(raw) => raw,
        Err(_) => return ServiceMode::User,
    };
    let parsed: ServiceModeState = match serde_json::from_str(&raw) {
        Ok(parsed) => parsed,
        Err(_) => return ServiceMode::User,
    };
    ServiceMode::parse(&parsed.mode).unwrap_or(ServiceMode::User)
}

fn save_mode(mode: ServiceMode) -> Result<ServiceModeState, String> {
    let path = mode_state_path()?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create service mode directory {:?}: {}", parent, e))?;
    }

    let state = ServiceModeState {
        mode: mode.as_str().to_string(),
        updated_at: now_ms(),
    };

    let serialized = serde_json::to_string_pretty(&state)
        .map_err(|e| format!("Failed to serialize service mode state: {}", e))?;
    fs::write(&path, serialized)
        .map_err(|e| format!("Failed to write service mode state {:?}: {}", path, e))?;

    Ok(state)
}

fn resolve_mode(mode: Option<String>) -> Result<ServiceMode, String> {
    if let Some(value) = mode {
        ServiceMode::parse(&value)
    } else {
        Ok(load_saved_mode())
    }
}

fn output_text(output: &Output) -> String {
    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    match (stdout.is_empty(), stderr.is_empty()) {
        (false, false) => format!("{}\n{}", stdout, stderr),
        (false, true) => stdout,
        (true, false) => stderr,
        (true, true) => String::new(),
    }
}

fn command_preview(program: &str, args: &[String]) -> String {
    if args.is_empty() {
        program.to_string()
    } else {
        format!("{} {}", program, args.join(" "))
    }
}

fn run_command(program: &str, args: &[String]) -> Result<Output, String> {
    Command::new(program)
        .args(args)
        .output()
        .map_err(|e| format!("Failed to run command `{}`: {}", command_preview(program, args), e))
}

fn run_command_expect_success(program: &str, args: &[String]) -> Result<String, String> {
    let output = run_command(program, args)?;
    if output.status.success() {
        Ok(output_text(&output))
    } else {
        Err(format!(
            "Command `{}` failed (code {:?}): {}",
            command_preview(program, args),
            output.status.code(),
            output_text(&output)
        ))
    }
}

#[cfg(target_os = "macos")]
fn mac_uid() -> Result<String, String> {
    let output = run_command("id", &["-u".to_string()])?;
    if !output.status.success() {
        return Err(format!("Failed to resolve current uid: {}", output_text(&output)));
    }
    let uid = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if uid.is_empty() {
        Err("Failed to parse current uid".to_string())
    } else {
        Ok(uid)
    }
}

#[cfg(target_os = "macos")]
fn mac_label(mode: ServiceMode) -> &'static str {
    match mode {
        ServiceMode::User => MAC_USER_LABEL,
        ServiceMode::System => MAC_SYSTEM_LABEL,
    }
}

#[cfg(target_os = "macos")]
fn mac_plist_path(mode: ServiceMode) -> Result<PathBuf, String> {
    match mode {
        ServiceMode::User => Ok(resolve_home_dir()?
            .join("Library")
            .join("LaunchAgents")
            .join(format!("{}.plist", MAC_USER_LABEL))),
        ServiceMode::System => Ok(PathBuf::from("/Library")
            .join("LaunchDaemons")
            .join(format!("{}.plist", MAC_SYSTEM_LABEL))),
    }
}

#[cfg(target_os = "macos")]
fn mac_domain(mode: ServiceMode) -> Result<String, String> {
    match mode {
        ServiceMode::User => Ok(format!("gui/{}", mac_uid()?)),
        ServiceMode::System => Ok("system".to_string()),
    }
}

#[cfg(target_os = "macos")]
fn xml_escape(raw: &str) -> String {
    raw.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&apos;")
}

#[cfg(target_os = "macos")]
fn build_mac_plist(label: &str, spec: &DaemonExecSpec, log_dir: &Path) -> String {
    let mut args = Vec::with_capacity(spec.args.len() + 1);
    args.push(spec.program.clone());
    args.extend(spec.args.clone());

    let argument_xml = args
        .iter()
        .map(|value| format!("    <string>{}</string>", xml_escape(value)))
        .collect::<Vec<_>>()
        .join("\n");

    let stdout_path = log_dir.join("agentd.stdout.log").to_string_lossy().to_string();
    let stderr_path = log_dir.join("agentd.stderr.log").to_string_lossy().to_string();
    let working_dir = spec.app_data_dir.to_string_lossy().to_string();

    format!(
        r#"<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>{label}</string>
  <key>ProgramArguments</key>
  <array>
{argument_xml}
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>WorkingDirectory</key>
  <string>{working_dir}</string>
  <key>StandardOutPath</key>
  <string>{stdout_path}</string>
  <key>StandardErrorPath</key>
  <string>{stderr_path}</string>
</dict>
</plist>
"#,
        label = xml_escape(label),
        argument_xml = argument_xml,
        working_dir = xml_escape(&working_dir),
        stdout_path = xml_escape(&stdout_path),
        stderr_path = xml_escape(&stderr_path),
    )
}

#[cfg(target_os = "macos")]
fn mac_load_or_bootstrap(domain: &str, plist_path: &Path) -> Result<(), String> {
    let plist_str = plist_path.to_string_lossy().to_string();
    let bootstrap_args = vec![
        "bootstrap".to_string(),
        domain.to_string(),
        plist_str.clone(),
    ];
    let bootstrap = run_command("launchctl", &bootstrap_args)?;
    if bootstrap.status.success() {
        return Ok(());
    }

    let load_args = vec!["load".to_string(), "-w".to_string(), plist_str];
    run_command_expect_success("launchctl", &load_args)?;
    Ok(())
}

#[cfg(target_os = "macos")]
fn install_service_impl(mode: ServiceMode, spec: &DaemonExecSpec) -> Result<(), String> {
    let plist_path = mac_plist_path(mode)?;
    let label = mac_label(mode);
    let domain = mac_domain(mode)?;

    if let Some(parent) = plist_path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create launchd directory {:?}: {}", parent, e))?;
    }

    let log_dir = spec.app_data_dir.join("logs");
    fs::create_dir_all(&log_dir)
        .map_err(|e| format!("Failed to create daemon log directory {:?}: {}", log_dir, e))?;

    let plist = build_mac_plist(label, spec, &log_dir);
    fs::write(&plist_path, plist)
        .map_err(|e| format!("Failed to write launchd plist {:?}: {}", plist_path, e))?;

    #[cfg(unix)]
    fs::set_permissions(&plist_path, fs::Permissions::from_mode(0o644))
        .map_err(|e| format!("Failed to set permissions on plist {:?}: {}", plist_path, e))?;

    let _ = run_command(
        "launchctl",
        &vec![
            "bootout".to_string(),
            domain.clone(),
            plist_path.to_string_lossy().to_string(),
        ],
    );

    mac_load_or_bootstrap(&domain, &plist_path)?;

    let target = format!("{}/{}", domain, label);
    let _ = run_command("launchctl", &vec!["enable".to_string(), target.clone()]);
    let _ = run_command(
        "launchctl",
        &vec!["kickstart".to_string(), "-k".to_string(), target],
    );

    Ok(())
}

#[cfg(target_os = "macos")]
fn uninstall_service_impl(mode: ServiceMode, _spec: &DaemonExecSpec) -> Result<(), String> {
    let plist_path = mac_plist_path(mode)?;
    let label = mac_label(mode);
    let domain = mac_domain(mode)?;
    let target = format!("{}/{}", domain, label);

    let _ = run_command("launchctl", &vec!["bootout".to_string(), target.clone()]);
    let _ = run_command("launchctl", &vec!["disable".to_string(), target]);

    if plist_path.exists() {
        fs::remove_file(&plist_path)
            .map_err(|e| format!("Failed to remove plist {:?}: {}", plist_path, e))?;
    }
    Ok(())
}

#[cfg(target_os = "macos")]
fn start_service_impl(mode: ServiceMode, _spec: &DaemonExecSpec) -> Result<(), String> {
    let plist_path = mac_plist_path(mode)?;
    if !plist_path.exists() {
        return Err(format!(
            "Service plist not found at {:?}. Install the service first.",
            plist_path
        ));
    }

    let domain = mac_domain(mode)?;
    mac_load_or_bootstrap(&domain, &plist_path)?;

    let target = format!("{}/{}", domain, mac_label(mode));
    run_command_expect_success(
        "launchctl",
        &vec!["kickstart".to_string(), "-k".to_string(), target],
    )?;
    Ok(())
}

#[cfg(target_os = "macos")]
fn stop_service_impl(mode: ServiceMode, _spec: &DaemonExecSpec) -> Result<(), String> {
    let domain = mac_domain(mode)?;
    let target = format!("{}/{}", domain, mac_label(mode));
    let output = run_command("launchctl", &vec!["bootout".to_string(), target.clone()])?;
    if output.status.success() {
        return Ok(());
    }

    // Fallback: try stopping without unloading.
    run_command_expect_success("launchctl", &vec!["stop".to_string(), mac_label(mode).to_string()])?;
    Ok(())
}

#[cfg(target_os = "macos")]
fn restart_service_impl(mode: ServiceMode, spec: &DaemonExecSpec) -> Result<(), String> {
    let _ = stop_service_impl(mode, spec);
    start_service_impl(mode, spec)
}

#[cfg(target_os = "macos")]
fn service_status_impl(mode: ServiceMode, spec: &DaemonExecSpec) -> Result<ServiceStatus, String> {
    let plist_path = mac_plist_path(mode)?;
    let domain = mac_domain(mode)?;
    let label = mac_label(mode);
    let target = format!("{}/{}", domain, label);
    let installed = plist_path.exists();

    let mut running = false;
    let mut enabled = installed;
    let mut details = None;

    let print_output = run_command("launchctl", &vec!["print".to_string(), target.clone()])?;
    if print_output.status.success() {
        let text = output_text(&print_output);
        let lower = text.to_lowercase();
        running = lower.contains("state = running") || lower.contains("pid = ");
        enabled = !lower.contains("disabled = true");
        details = Some(text);
    } else if installed {
        let list_output = run_command("launchctl", &vec!["list".to_string()])?;
        if list_output.status.success() {
            let text = output_text(&list_output);
            if let Some(line) = text.lines().find(|line| line.contains(label)) {
                let parts = line.split_whitespace().collect::<Vec<_>>();
                running = parts.first().map(|value| *value != "-").unwrap_or(false);
                details = Some(line.to_string());
            }
        }
    }

    Ok(ServiceStatus {
        mode: mode.as_str().to_string(),
        manager: "launchd".to_string(),
        service_id: label.to_string(),
        installed,
        running,
        enabled,
        config_path: Some(plist_path.to_string_lossy().to_string()),
        daemon_program: spec.program.clone(),
        daemon_args: spec.args.clone(),
        app_data_dir: spec.app_data_dir.to_string_lossy().to_string(),
        endpoint: spec.endpoint.clone(),
        token_file: spec.token_file.to_string_lossy().to_string(),
        lock_file: spec.lock_file.to_string_lossy().to_string(),
        details,
    })
}

#[cfg(target_os = "linux")]
fn linux_unit_path(mode: ServiceMode) -> Result<PathBuf, String> {
    match mode {
        ServiceMode::User => Ok(resolve_home_dir()?
            .join(".config")
            .join("systemd")
            .join("user")
            .join(format!("{}.service", SERVICE_UNIT_NAME))),
        ServiceMode::System => Ok(PathBuf::from("/etc")
            .join("systemd")
            .join("system")
            .join(format!("{}.service", SERVICE_UNIT_NAME))),
    }
}

#[cfg(target_os = "linux")]
fn linux_systemctl_base_args(mode: ServiceMode) -> Vec<String> {
    match mode {
        ServiceMode::User => vec!["--user".to_string()],
        ServiceMode::System => Vec::new(),
    }
}

#[cfg(target_os = "linux")]
fn systemd_quote(value: &str) -> String {
    format!("\"{}\"", value.replace('\\', "\\\\").replace('"', "\\\""))
}

#[cfg(target_os = "linux")]
fn build_linux_unit(spec: &DaemonExecSpec, mode: ServiceMode) -> String {
    let mut exec_parts = Vec::with_capacity(spec.args.len() + 1);
    exec_parts.push(systemd_quote(&spec.program));
    for arg in &spec.args {
        exec_parts.push(systemd_quote(arg));
    }
    let exec_start = exec_parts.join(" ");
    let wanted_by = match mode {
        ServiceMode::User => "default.target",
        ServiceMode::System => "multi-user.target",
    };
    let working_dir = spec.app_data_dir.to_string_lossy().to_string();
    let app_data_dir = spec.app_data_dir.to_string_lossy().to_string();

    format!(
        "[Unit]\nDescription={display}\nAfter=network.target\n\n[Service]\nType=simple\nExecStart={exec}\nWorkingDirectory={wd}\nRestart=always\nRestartSec=2\nEnvironment=COWORK_APP_DATA_DIR={app_data}\n\n[Install]\nWantedBy={wanted}\n",
        display = SERVICE_DISPLAY_NAME,
        exec = exec_start,
        wd = systemd_quote(&working_dir),
        app_data = systemd_quote(&app_data_dir),
        wanted = wanted_by
    )
}

#[cfg(target_os = "linux")]
fn linux_systemctl(mode: ServiceMode, extra_args: &[&str]) -> Result<Output, String> {
    let mut args = linux_systemctl_base_args(mode);
    args.extend(extra_args.iter().map(|value| value.to_string()));
    run_command("systemctl", &args)
}

#[cfg(target_os = "linux")]
fn install_service_impl(mode: ServiceMode, spec: &DaemonExecSpec) -> Result<(), String> {
    let unit_path = linux_unit_path(mode)?;
    if let Some(parent) = unit_path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create systemd unit directory {:?}: {}", parent, e))?;
    }
    let unit = build_linux_unit(spec, mode);
    fs::write(&unit_path, unit)
        .map_err(|e| format!("Failed to write systemd unit {:?}: {}", unit_path, e))?;

    #[cfg(unix)]
    fs::set_permissions(&unit_path, fs::Permissions::from_mode(0o644))
        .map_err(|e| format!("Failed to set permissions on systemd unit {:?}: {}", unit_path, e))?;

    let daemon_reload = linux_systemctl(mode, &["daemon-reload"])?;
    if !daemon_reload.status.success() {
        return Err(format!("Failed to reload systemd daemon: {}", output_text(&daemon_reload)));
    }

    let enable = linux_systemctl(mode, &["enable", "--now", &format!("{}.service", SERVICE_UNIT_NAME)])?;
    if !enable.status.success() {
        return Err(format!(
            "Failed to enable/start systemd unit {}: {}",
            SERVICE_UNIT_NAME,
            output_text(&enable)
        ));
    }

    Ok(())
}

#[cfg(target_os = "linux")]
fn uninstall_service_impl(mode: ServiceMode, _spec: &DaemonExecSpec) -> Result<(), String> {
    let unit_name = format!("{}.service", SERVICE_UNIT_NAME);
    let _ = linux_systemctl(mode, &["disable", "--now", &unit_name]);

    let unit_path = linux_unit_path(mode)?;
    if unit_path.exists() {
        fs::remove_file(&unit_path)
            .map_err(|e| format!("Failed to remove systemd unit {:?}: {}", unit_path, e))?;
    }

    let reload = linux_systemctl(mode, &["daemon-reload"])?;
    if !reload.status.success() {
        return Err(format!("Failed to reload systemd daemon: {}", output_text(&reload)));
    }

    Ok(())
}

#[cfg(target_os = "linux")]
fn start_service_impl(mode: ServiceMode, _spec: &DaemonExecSpec) -> Result<(), String> {
    let output = linux_systemctl(mode, &["start", &format!("{}.service", SERVICE_UNIT_NAME)])?;
    if !output.status.success() {
        return Err(format!("Failed to start systemd unit: {}", output_text(&output)));
    }
    Ok(())
}

#[cfg(target_os = "linux")]
fn stop_service_impl(mode: ServiceMode, _spec: &DaemonExecSpec) -> Result<(), String> {
    let output = linux_systemctl(mode, &["stop", &format!("{}.service", SERVICE_UNIT_NAME)])?;
    if !output.status.success() {
        return Err(format!("Failed to stop systemd unit: {}", output_text(&output)));
    }
    Ok(())
}

#[cfg(target_os = "linux")]
fn restart_service_impl(mode: ServiceMode, _spec: &DaemonExecSpec) -> Result<(), String> {
    let output = linux_systemctl(mode, &["restart", &format!("{}.service", SERVICE_UNIT_NAME)])?;
    if !output.status.success() {
        return Err(format!("Failed to restart systemd unit: {}", output_text(&output)));
    }
    Ok(())
}

#[cfg(target_os = "linux")]
fn service_status_impl(mode: ServiceMode, spec: &DaemonExecSpec) -> Result<ServiceStatus, String> {
    let unit_path = linux_unit_path(mode)?;
    let unit_name = format!("{}.service", SERVICE_UNIT_NAME);
    let installed = unit_path.exists();

    let enabled_output = linux_systemctl(mode, &["is-enabled", &unit_name])?;
    let enabled = enabled_output.status.success()
        && !String::from_utf8_lossy(&enabled_output.stdout)
            .to_lowercase()
            .contains("disabled");

    let active_output = linux_systemctl(mode, &["is-active", &unit_name])?;
    let running = active_output.status.success()
        && String::from_utf8_lossy(&active_output.stdout)
            .trim()
            .eq_ignore_ascii_case("active");

    let status_output = linux_systemctl(mode, &["status", "--no-pager", "--full", &unit_name])?;
    let details = if status_output.status.success() {
        Some(output_text(&status_output))
    } else {
        None
    };

    Ok(ServiceStatus {
        mode: mode.as_str().to_string(),
        manager: "systemd".to_string(),
        service_id: unit_name,
        installed,
        running,
        enabled,
        config_path: Some(unit_path.to_string_lossy().to_string()),
        daemon_program: spec.program.clone(),
        daemon_args: spec.args.clone(),
        app_data_dir: spec.app_data_dir.to_string_lossy().to_string(),
        endpoint: spec.endpoint.clone(),
        token_file: spec.token_file.to_string_lossy().to_string(),
        lock_file: spec.lock_file.to_string_lossy().to_string(),
        details,
    })
}

#[cfg(target_os = "windows")]
fn windows_quote_arg(value: &str) -> String {
    if value.is_empty() {
        return "\"\"".to_string();
    }

    let needs_quotes = value
        .chars()
        .any(|ch| ch.is_ascii_whitespace() || ch == '"');
    if !needs_quotes {
        return value.to_string();
    }

    let mut escaped = String::new();
    let mut backslashes = 0;
    for ch in value.chars() {
        if ch == '\\' {
            backslashes += 1;
            continue;
        }

        if ch == '"' {
            escaped.push_str(&"\\".repeat(backslashes * 2 + 1));
            escaped.push('"');
            backslashes = 0;
            continue;
        }

        if backslashes > 0 {
            escaped.push_str(&"\\".repeat(backslashes));
            backslashes = 0;
        }
        escaped.push(ch);
    }

    if backslashes > 0 {
        escaped.push_str(&"\\".repeat(backslashes * 2));
    }

    format!("\"{}\"", escaped)
}

#[cfg(target_os = "windows")]
fn windows_command_line(program: &str, args: &[String]) -> String {
    let mut parts = Vec::with_capacity(args.len() + 1);
    parts.push(windows_quote_arg(program));
    for arg in args {
        parts.push(windows_quote_arg(arg));
    }
    parts.join(" ")
}

#[cfg(target_os = "windows")]
fn windows_task_install(spec: &DaemonExecSpec) -> Result<(), String> {
    let command_line = windows_command_line(&spec.program, &spec.args);
    let args = vec![
        "/Create".to_string(),
        "/F".to_string(),
        "/SC".to_string(),
        "ONLOGON".to_string(),
        "/TN".to_string(),
        WINDOWS_USER_TASK_NAME.to_string(),
        "/TR".to_string(),
        command_line,
    ];
    let create = run_command("schtasks", &args)?;
    if !create.status.success() {
        return Err(format!(
            "Failed to create Scheduled Task {}: {}",
            WINDOWS_USER_TASK_NAME,
            output_text(&create)
        ));
    }

    let _ = run_command(
        "schtasks",
        &vec![
            "/Run".to_string(),
            "/TN".to_string(),
            WINDOWS_USER_TASK_NAME.to_string(),
        ],
    );

    Ok(())
}

#[cfg(target_os = "windows")]
fn windows_task_uninstall() -> Result<(), String> {
    let _ = run_command(
        "schtasks",
        &vec![
            "/End".to_string(),
            "/TN".to_string(),
            WINDOWS_USER_TASK_NAME.to_string(),
        ],
    );
    let output = run_command(
        "schtasks",
        &vec![
            "/Delete".to_string(),
            "/F".to_string(),
            "/TN".to_string(),
            WINDOWS_USER_TASK_NAME.to_string(),
        ],
    )?;
    if !output.status.success() {
        let text = output_text(&output).to_lowercase();
        if !text.contains("cannot find") {
            return Err(format!(
                "Failed to delete Scheduled Task {}: {}",
                WINDOWS_USER_TASK_NAME,
                output_text(&output)
            ));
        }
    }
    Ok(())
}

#[cfg(target_os = "windows")]
fn windows_task_start() -> Result<(), String> {
    run_command_expect_success(
        "schtasks",
        &vec![
            "/Run".to_string(),
            "/TN".to_string(),
            WINDOWS_USER_TASK_NAME.to_string(),
        ],
    )?;
    Ok(())
}

#[cfg(target_os = "windows")]
fn windows_task_stop() -> Result<(), String> {
    run_command_expect_success(
        "schtasks",
        &vec![
            "/End".to_string(),
            "/TN".to_string(),
            WINDOWS_USER_TASK_NAME.to_string(),
        ],
    )?;
    Ok(())
}

#[cfg(target_os = "windows")]
fn windows_task_status(spec: &DaemonExecSpec) -> Result<ServiceStatus, String> {
    let query = run_command(
        "schtasks",
        &vec![
            "/Query".to_string(),
            "/TN".to_string(),
            WINDOWS_USER_TASK_NAME.to_string(),
            "/FO".to_string(),
            "LIST".to_string(),
            "/V".to_string(),
        ],
    )?;
    let installed = query.status.success();
    let text = output_text(&query);
    let lower = text.to_lowercase();
    let running = installed && lower.contains("status: running");
    let enabled = installed && !lower.contains("scheduled task state: disabled");

    Ok(ServiceStatus {
        mode: ServiceMode::User.as_str().to_string(),
        manager: "task-scheduler".to_string(),
        service_id: WINDOWS_USER_TASK_NAME.to_string(),
        installed,
        running,
        enabled,
        config_path: None,
        daemon_program: spec.program.clone(),
        daemon_args: spec.args.clone(),
        app_data_dir: spec.app_data_dir.to_string_lossy().to_string(),
        endpoint: spec.endpoint.clone(),
        token_file: spec.token_file.to_string_lossy().to_string(),
        lock_file: spec.lock_file.to_string_lossy().to_string(),
        details: if text.is_empty() { None } else { Some(text) },
    })
}

#[cfg(target_os = "windows")]
fn windows_service_install(spec: &DaemonExecSpec) -> Result<(), String> {
    let command_line = windows_command_line(&spec.program, &spec.args);
    let create_args = vec![
        "create".to_string(),
        WINDOWS_SYSTEM_SERVICE_NAME.to_string(),
        "binPath=".to_string(),
        command_line.clone(),
        "start=".to_string(),
        "auto".to_string(),
        "DisplayName=".to_string(),
        SERVICE_DISPLAY_NAME.to_string(),
    ];
    let create = run_command("sc", &create_args)?;
    if !create.status.success() {
        let text = output_text(&create).to_lowercase();
        if text.contains("1073") || text.contains("already exists") {
            let config = run_command(
                "sc",
                &vec![
                    "config".to_string(),
                    WINDOWS_SYSTEM_SERVICE_NAME.to_string(),
                    "binPath=".to_string(),
                    command_line,
                    "start=".to_string(),
                    "auto".to_string(),
                ],
            )?;
            if !config.status.success() {
                return Err(format!(
                    "Failed to update existing service {}: {}",
                    WINDOWS_SYSTEM_SERVICE_NAME,
                    output_text(&config)
                ));
            }
        } else {
            return Err(format!(
                "Failed to create service {}: {}",
                WINDOWS_SYSTEM_SERVICE_NAME,
                output_text(&create)
            ));
        }
    }

    let _ = run_command(
        "sc",
        &vec![
            "description".to_string(),
            WINDOWS_SYSTEM_SERVICE_NAME.to_string(),
            "Cowork background agent service".to_string(),
        ],
    );

    let _ = run_command(
        "sc",
        &vec!["start".to_string(), WINDOWS_SYSTEM_SERVICE_NAME.to_string()],
    );
    Ok(())
}

#[cfg(target_os = "windows")]
fn windows_service_uninstall() -> Result<(), String> {
    let _ = run_command(
        "sc",
        &vec!["stop".to_string(), WINDOWS_SYSTEM_SERVICE_NAME.to_string()],
    );
    let output = run_command(
        "sc",
        &vec!["delete".to_string(), WINDOWS_SYSTEM_SERVICE_NAME.to_string()],
    )?;
    if !output.status.success() {
        let text = output_text(&output).to_lowercase();
        if !text.contains("does not exist") && !text.contains("1060") {
            return Err(format!(
                "Failed to delete service {}: {}",
                WINDOWS_SYSTEM_SERVICE_NAME,
                output_text(&output)
            ));
        }
    }
    Ok(())
}

#[cfg(target_os = "windows")]
fn windows_service_start() -> Result<(), String> {
    run_command_expect_success(
        "sc",
        &vec!["start".to_string(), WINDOWS_SYSTEM_SERVICE_NAME.to_string()],
    )?;
    Ok(())
}

#[cfg(target_os = "windows")]
fn windows_service_stop() -> Result<(), String> {
    run_command_expect_success(
        "sc",
        &vec!["stop".to_string(), WINDOWS_SYSTEM_SERVICE_NAME.to_string()],
    )?;
    Ok(())
}

#[cfg(target_os = "windows")]
fn windows_service_status(spec: &DaemonExecSpec) -> Result<ServiceStatus, String> {
    let query = run_command(
        "sc",
        &vec!["query".to_string(), WINDOWS_SYSTEM_SERVICE_NAME.to_string()],
    )?;
    let installed = query.status.success();
    let query_text = output_text(&query);
    let query_lower = query_text.to_lowercase();
    let running = installed && query_lower.contains("running");

    let qc = run_command(
        "sc",
        &vec!["qc".to_string(), WINDOWS_SYSTEM_SERVICE_NAME.to_string()],
    )?;
    let qc_text = output_text(&qc);
    let enabled = qc.status.success() && qc_text.to_lowercase().contains("auto_start");

    Ok(ServiceStatus {
        mode: ServiceMode::System.as_str().to_string(),
        manager: "service-control-manager".to_string(),
        service_id: WINDOWS_SYSTEM_SERVICE_NAME.to_string(),
        installed,
        running,
        enabled,
        config_path: None,
        daemon_program: spec.program.clone(),
        daemon_args: spec.args.clone(),
        app_data_dir: spec.app_data_dir.to_string_lossy().to_string(),
        endpoint: spec.endpoint.clone(),
        token_file: spec.token_file.to_string_lossy().to_string(),
        lock_file: spec.lock_file.to_string_lossy().to_string(),
        details: if query_text.is_empty() { None } else { Some(query_text) },
    })
}

#[cfg(target_os = "windows")]
fn install_service_impl(mode: ServiceMode, spec: &DaemonExecSpec) -> Result<(), String> {
    match mode {
        ServiceMode::User => windows_task_install(spec),
        ServiceMode::System => windows_service_install(spec),
    }
}

#[cfg(target_os = "windows")]
fn uninstall_service_impl(mode: ServiceMode, _spec: &DaemonExecSpec) -> Result<(), String> {
    match mode {
        ServiceMode::User => windows_task_uninstall(),
        ServiceMode::System => windows_service_uninstall(),
    }
}

#[cfg(target_os = "windows")]
fn start_service_impl(mode: ServiceMode, _spec: &DaemonExecSpec) -> Result<(), String> {
    match mode {
        ServiceMode::User => windows_task_start(),
        ServiceMode::System => windows_service_start(),
    }
}

#[cfg(target_os = "windows")]
fn stop_service_impl(mode: ServiceMode, _spec: &DaemonExecSpec) -> Result<(), String> {
    match mode {
        ServiceMode::User => windows_task_stop(),
        ServiceMode::System => windows_service_stop(),
    }
}

#[cfg(target_os = "windows")]
fn restart_service_impl(mode: ServiceMode, spec: &DaemonExecSpec) -> Result<(), String> {
    let _ = stop_service_impl(mode, spec);
    start_service_impl(mode, spec)
}

#[cfg(target_os = "windows")]
fn service_status_impl(mode: ServiceMode, spec: &DaemonExecSpec) -> Result<ServiceStatus, String> {
    match mode {
        ServiceMode::User => windows_task_status(spec),
        ServiceMode::System => windows_service_status(spec),
    }
}

#[cfg(not(any(target_os = "macos", target_os = "linux", target_os = "windows")))]
fn install_service_impl(_mode: ServiceMode, _spec: &DaemonExecSpec) -> Result<(), String> {
    Err("Service management is not supported on this platform".to_string())
}

#[cfg(not(any(target_os = "macos", target_os = "linux", target_os = "windows")))]
fn uninstall_service_impl(_mode: ServiceMode, _spec: &DaemonExecSpec) -> Result<(), String> {
    Err("Service management is not supported on this platform".to_string())
}

#[cfg(not(any(target_os = "macos", target_os = "linux", target_os = "windows")))]
fn start_service_impl(_mode: ServiceMode, _spec: &DaemonExecSpec) -> Result<(), String> {
    Err("Service management is not supported on this platform".to_string())
}

#[cfg(not(any(target_os = "macos", target_os = "linux", target_os = "windows")))]
fn stop_service_impl(_mode: ServiceMode, _spec: &DaemonExecSpec) -> Result<(), String> {
    Err("Service management is not supported on this platform".to_string())
}

#[cfg(not(any(target_os = "macos", target_os = "linux", target_os = "windows")))]
fn restart_service_impl(_mode: ServiceMode, _spec: &DaemonExecSpec) -> Result<(), String> {
    Err("Service management is not supported on this platform".to_string())
}

#[cfg(not(any(target_os = "macos", target_os = "linux", target_os = "windows")))]
fn service_status_impl(_mode: ServiceMode, spec: &DaemonExecSpec) -> Result<ServiceStatus, String> {
    Ok(ServiceStatus {
        mode: "user".to_string(),
        manager: "unsupported".to_string(),
        service_id: "unsupported".to_string(),
        installed: false,
        running: false,
        enabled: false,
        config_path: None,
        daemon_program: spec.program.clone(),
        daemon_args: spec.args.clone(),
        app_data_dir: spec.app_data_dir.to_string_lossy().to_string(),
        endpoint: spec.endpoint.clone(),
        token_file: spec.token_file.to_string_lossy().to_string(),
        lock_file: spec.lock_file.to_string_lossy().to_string(),
        details: Some("Service management is not supported on this platform".to_string()),
    })
}

#[tauri::command]
pub async fn service_get_mode() -> Result<ServiceModeState, String> {
    let mode = load_saved_mode();
    Ok(ServiceModeState {
        mode: mode.as_str().to_string(),
        updated_at: now_ms(),
    })
}

#[tauri::command]
pub async fn service_set_mode(mode: String) -> Result<ServiceModeState, String> {
    let parsed = ServiceMode::parse(&mode)?;
    save_mode(parsed)
}

#[tauri::command]
pub async fn service_status(mode: Option<String>) -> Result<ServiceStatus, String> {
    let parsed_mode = resolve_mode(mode)?;
    let spec = resolve_daemon_exec_spec()?;
    service_status_impl(parsed_mode, &spec)
}

#[tauri::command]
pub async fn service_install(mode: Option<String>) -> Result<ServiceStatus, String> {
    let parsed_mode = resolve_mode(mode)?;
    let spec = resolve_daemon_exec_spec()?;
    install_service_impl(parsed_mode, &spec)?;
    let _ = save_mode(parsed_mode);
    service_status_impl(parsed_mode, &spec)
}

#[tauri::command]
pub async fn service_uninstall(mode: Option<String>) -> Result<ServiceStatus, String> {
    let parsed_mode = resolve_mode(mode)?;
    let spec = resolve_daemon_exec_spec()?;
    uninstall_service_impl(parsed_mode, &spec)?;
    service_status_impl(parsed_mode, &spec)
}

#[tauri::command]
pub async fn service_start(mode: Option<String>) -> Result<ServiceStatus, String> {
    let parsed_mode = resolve_mode(mode)?;
    let spec = resolve_daemon_exec_spec()?;
    start_service_impl(parsed_mode, &spec)?;
    service_status_impl(parsed_mode, &spec)
}

#[tauri::command]
pub async fn service_stop(mode: Option<String>) -> Result<ServiceStatus, String> {
    let parsed_mode = resolve_mode(mode)?;
    let spec = resolve_daemon_exec_spec()?;
    stop_service_impl(parsed_mode, &spec)?;
    service_status_impl(parsed_mode, &spec)
}

#[tauri::command]
pub async fn service_restart(mode: Option<String>) -> Result<ServiceStatus, String> {
    let parsed_mode = resolve_mode(mode)?;
    let spec = resolve_daemon_exec_spec()?;
    restart_service_impl(parsed_mode, &spec)?;
    service_status_impl(parsed_mode, &spec)
}
