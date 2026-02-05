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
            // Connector commands
            commands::connectors::discover_connectors,
            commands::connectors::install_connector,
            commands::connectors::uninstall_connector,
            commands::connectors::connect_connector,
            commands::connectors::disconnect_connector,
            commands::connectors::reconnect_connector,
            commands::connectors::configure_connector_secrets,
            commands::connectors::get_connector_secrets_status,
            commands::connectors::get_connector_status,
            commands::connectors::create_connector,
            commands::connectors::connector_call_tool,
            commands::connectors::get_all_connector_tools,
            commands::connectors::get_all_connector_states,
            commands::connectors::connect_all_connectors,
            commands::connectors::disconnect_all_connectors,
            // OAuth commands
            commands::connectors::start_connector_oauth_flow,
            commands::connectors::poll_oauth_device_code,
            commands::connectors::get_oauth_status,
            commands::connectors::refresh_oauth_tokens,
            commands::connectors::revoke_oauth_tokens,
            // MCP Apps commands
            commands::connectors::get_connector_apps,
            commands::connectors::get_connector_app_content,
            commands::connectors::call_connector_app_tool,
            // Integration commands
            commands::integrations::agent_integration_list_statuses,
            commands::integrations::agent_integration_connect,
            commands::integrations::agent_integration_disconnect,
            commands::integrations::agent_integration_get_qr,
            commands::integrations::agent_integration_configure,
            commands::integrations::agent_integration_send_test,
        ])
        .setup(|app| {
            // Auto-update disabled until a proper signing key pair is configured
            let _ = app;

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

