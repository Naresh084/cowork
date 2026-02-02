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
            commands::agent::agent_stop_generation,
            commands::agent::agent_list_sessions,
            commands::agent::agent_get_session,
            commands::agent::agent_delete_session,
            commands::agent::agent_load_memory,
            commands::agent::agent_save_memory,
            commands::agent::agent_get_context_usage,
        ])
        .setup(|_app| {
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
