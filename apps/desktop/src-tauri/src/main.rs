// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod sidecar;

use commands::agent::AgentState;
use tauri::Manager;

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_notification::init())
        .manage(AgentState::new())
        .invoke_handler(tauri::generate_handler![
            // Auth commands
            commands::auth::get_api_key,
            commands::auth::set_api_key,
            commands::auth::delete_api_key,
            commands::auth::validate_api_key,
            commands::auth::fetch_models,
            // Keychain commands
            commands::keychain::keychain_get,
            commands::keychain::keychain_set,
            commands::keychain::keychain_delete,
            // File commands
            commands::files::read_file,
            commands::files::write_file,
            commands::files::list_directory,
            // Agent commands
            commands::agent::agent_set_api_key,
            commands::agent::agent_create_session,
            commands::agent::agent_send_message,
            commands::agent::agent_respond_permission,
            commands::agent::agent_set_approval_mode,
            commands::agent::agent_set_models,
            commands::agent::agent_respond_question,
            commands::agent::agent_stop_generation,
            commands::agent::agent_list_sessions,
            commands::agent::agent_get_session,
            commands::agent::agent_delete_session,
            commands::agent::agent_update_session_title,
            commands::agent::agent_update_session_working_directory,
            commands::agent::agent_update_session_last_accessed,
            commands::agent::agent_load_memory,
            commands::agent::agent_save_memory,
            commands::agent::agent_get_context_usage,
            commands::agent::agent_set_mcp_servers,
            commands::agent::agent_set_skills,
            commands::agent::agent_set_specialized_models,
            commands::agent::agent_mcp_call_tool,
            commands::agent::agent_load_gemini_extensions,
            commands::agent::agent_get_initialization_status,
            commands::agent::agent_command,
            // Skill commands
            commands::skills::agent_discover_skills,
            commands::skills::agent_install_skill,
            commands::skills::agent_uninstall_skill,
            commands::skills::agent_check_skill_eligibility,
            commands::skills::agent_get_skill_content,
            commands::skills::agent_create_skill,
            // Cron commands
            commands::cron::cron_list_jobs,
            commands::cron::cron_get_job,
            commands::cron::cron_create_job,
            commands::cron::cron_update_job,
            commands::cron::cron_delete_job,
            commands::cron::cron_pause_job,
            commands::cron::cron_resume_job,
            commands::cron::cron_trigger_job,
            commands::cron::cron_get_runs,
            commands::cron::cron_get_status,
            // Heartbeat commands
            commands::heartbeat::heartbeat_get_status,
            commands::heartbeat::heartbeat_get_config,
            commands::heartbeat::heartbeat_set_config,
            commands::heartbeat::heartbeat_start,
            commands::heartbeat::heartbeat_stop,
            commands::heartbeat::heartbeat_wake,
            commands::heartbeat::heartbeat_queue_event,
            commands::heartbeat::heartbeat_get_events,
            commands::heartbeat::heartbeat_clear_events,
            // Policy commands
            commands::policy::policy_get,
            commands::policy::policy_update,
            commands::policy::policy_set_profile,
            commands::policy::policy_add_rule,
            commands::policy::policy_remove_rule,
            commands::policy::policy_evaluate,
            commands::policy::policy_reset,
            commands::policy::policy_get_profiles,
            commands::policy::policy_get_groups,
            // Deep Agents memory commands
            commands::deep::deep_memory_init,
            commands::deep::deep_memory_list,
            commands::deep::deep_memory_create,
            commands::deep::deep_memory_read,
            commands::deep::deep_memory_update,
            commands::deep::deep_memory_delete,
            commands::deep::deep_memory_search,
            commands::deep::deep_memory_list_groups,
            commands::deep::deep_memory_create_group,
            commands::deep::deep_memory_delete_group,
            // Command (Slash Commands) marketplace commands
            commands::deep::deep_command_list,
            commands::deep::deep_command_install,
            commands::deep::deep_command_uninstall,
            commands::deep::deep_command_get_content,
            commands::deep::deep_command_create,
            // Subagent commands
            commands::subagent::deep_subagent_list,
            commands::subagent::deep_subagent_install,
            commands::subagent::deep_subagent_uninstall,
            commands::subagent::deep_subagent_is_installed,
            commands::subagent::deep_subagent_get,
            commands::subagent::deep_subagent_create,
        ])
        .setup(|app| {
            // Spawn auto-update checker on startup (only in release mode)
            #[cfg(not(debug_assertions))]
            {
                let handle = app.handle().clone();
                tauri::async_runtime::spawn(async move {
                    // Wait a few seconds for app to fully initialize
                    tokio::time::sleep(std::time::Duration::from_secs(3)).await;
                    check_and_install_updates(handle).await;
                });
            }

            // Suppress unused variable warning in debug mode
            #[cfg(debug_assertions)]
            let _ = app;

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(not(debug_assertions))]
async fn check_and_install_updates(app: tauri::AppHandle) {
    use tauri_plugin_updater::UpdaterExt;

    loop {
        eprintln!("[updater] Checking for updates...");
        match app.updater().check().await {
            Ok(Some(update)) => {
                eprintln!("[updater] New version available: {}", update.version);

                // Emit event to frontend to show update notification
                let _ = app.emit("update:available", serde_json::json!({
                    "version": update.version,
                    "body": update.body
                }));

                // Download and install immediately
                let download_result = update.download_and_install(
                    |progress, total| {
                        let percent = if let Some(total) = total {
                            (progress as f64 / total as f64 * 100.0) as u32
                        } else {
                            0
                        };
                        eprintln!("[updater] Download progress: {}%", percent);
                        // Emit progress to frontend
                        let _ = app.emit("update:progress", serde_json::json!({
                            "progress": progress,
                            "total": total,
                            "percent": percent
                        }));
                    },
                    || {
                        eprintln!("[updater] Download complete, installing...");
                    },
                ).await;

                match download_result {
                    Ok(_) => {
                        eprintln!("[updater] Update installed, restarting...");
                        let _ = app.emit("update:installed", serde_json::json!({}));

                        // Small delay to let UI show "Restarting..." message
                        tokio::time::sleep(std::time::Duration::from_secs(2)).await;

                        // Restart the app
                        app.restart();
                    }
                    Err(e) => {
                        eprintln!("[updater] Failed to install update: {}", e);
                        let _ = app.emit("update:error", serde_json::json!({
                            "error": e.to_string()
                        }));
                    }
                }
            }
            Ok(None) => {
                eprintln!("[updater] No updates available");
            }
            Err(e) => {
                eprintln!("[updater] Failed to check for updates: {}", e);
            }
        }

        // Check for updates every 30 minutes
        tokio::time::sleep(std::time::Duration::from_secs(30 * 60)).await;
    }
}
