mod clients;
mod commands;
mod core;
mod platform;
mod repository;
mod services;

use tauri::Manager;

use crate::clients::openai_client::OpenAiClient;
use crate::clients::server_client::ServerClient;
use crate::core::config::config;
use crate::core::state::{PendingCapture, PendingSource};
use crate::repository::Repository;
use crate::services::ai_service::AiService;
use crate::services::auth_service::AuthService;
use crate::services::capture_service::CaptureService;
use crate::services::security_service::SecurityService;
use crate::services::session_token_service::SessionTokenService;
use crate::services::shortcut_service::ShortcutService;
use crate::services::task_group_service::TaskGroupService;
use crate::services::task_service::TaskService;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Load a `.env` (e.g. OPENAI_API_KEY) — dev convenience so the key doesn't have
    // to be exported in every shell. In dev, load the one next to the crate
    // regardless of the working directory. Real env vars still win.
    #[cfg(all(desktop, debug_assertions))]
    let _ = dotenvy::from_filename(concat!(env!("CARGO_MANIFEST_DIR"), "/.env"));
    #[cfg(desktop)]
    let _ = dotenvy::dotenv();

    tauri::Builder::default()
        .plugin(tauri_plugin_clipboard_manager::init())
        .manage(CaptureService::new(SecurityService::with_defaults()))
        .manage(AiService::new(
            config().openai_api_key.clone().map(OpenAiClient::new),
        ))
        .manage(PendingSource::default())
        .manage(PendingCapture::default())
        .setup(|app| {
            // The encrypted DB lives in the per-user app data dir; create it on
            // first run. The Repository opens the shared connection and its entity
            // repositories, so future tables (settings, …) reuse the same `Db`.
            let data_dir = app
                .path()
                .app_data_dir()
                .map_err(|e| format!("no app data dir: {e}"))?;
            std::fs::create_dir_all(&data_dir)
                .map_err(|e| format!("could not create data dir: {e}"))?;

            let repository = Repository::open(&data_dir.join("blink.db"))?;

            // The DB-backed services are built here (not up top with the others)
            // because their repositories only exist once the Repository is open.
            app.manage(AuthService::new(
                ServerClient::new(),
                SessionTokenService::new(),
                repository.settings.clone(),
            ));
            app.manage(TaskService::new(repository.tasks.clone()));
            app.manage(TaskGroupService::new(
                repository.task_groups.clone(),
                repository.settings.clone(),
            ));
            app.manage(ShortcutService::new(repository.settings.clone()));

            platform::init(app)?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::auth::sign_in,
            commands::auth::sign_up,
            commands::auth::verify_email,
            commands::auth::resend_verification,
            commands::auth::request_password_reset,
            commands::auth::reset_password,
            commands::auth::sign_out,
            commands::auth::current_session,
            commands::copy_capture::read_copy_capture,
            commands::copy_capture::dismiss_copy_capture,
            commands::manual_capture::dismiss_manual_capture,
            commands::ai::improve_text,
            commands::ai::generate_task_prompt,
            commands::tasks::list_tasks,
            commands::tasks::save_task,
            commands::tasks::delete_task,
            commands::tasks::reorder_task,
            commands::tasks::update_task,
            commands::task_groups::list_task_groups,
            commands::task_groups::create_task_group,
            commands::task_groups::rename_task_group,
            commands::task_groups::delete_task_group,
            commands::task_groups::get_active_task_group,
            commands::task_groups::set_active_task_group,
            commands::link::open_link,
            commands::shortcut::get_capture_shortcut,
            commands::shortcut::set_capture_shortcut,
        ])
        .build(tauri::generate_context!())
        .expect("error while building Blink")
        .run(|app, event| platform::os::on_run_event(app, &event));
}
