mod clients;
mod commands;
mod core;
mod platform;
mod repository;
mod services;

use std::sync::Arc;

use tauri::Manager;

use crate::clients::git_cli::GitCli;
use crate::clients::server_client::ServerClient;
use crate::clients::tmux_cli::TmuxCli;
use crate::core::state::{PendingCapture, PendingSource};
use crate::core::sync_channel;
use crate::repository::{Db, Repository};
use crate::services::ai_key_service::AiKeyService;
use crate::services::ai_service::AiService;
use crate::services::attention_service::AttentionService;
use crate::services::hook_service::HookService;
use crate::services::auth_service::AuthService;
use crate::services::capture_service::CaptureService;
use crate::services::hlc_service::HlcService;
use crate::services::security_service::SecurityService;
use crate::services::session_token_service::SessionTokenService;
use crate::services::shortcut_service::ShortcutService;
use crate::services::sync_service::SyncService;
use crate::services::task_group_service::TaskGroupService;
use crate::services::task_service::TaskService;
use crate::services::repo_service::RepoService;
use crate::services::vault_service::VaultService;
use crate::services::worktree_service::WorktreeService;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Load a `.env` (e.g. BLINK_SERVER_URL) — dev convenience so vars don't have to
    // be exported in every shell. In dev, load the one next to the crate regardless
    // of the working directory. Real env vars still win. (The AI key is not an env —
    // it's the user's own, stored in the keychain via AiKeyService.)
    #[cfg(all(desktop, debug_assertions))]
    let _ = dotenvy::from_filename(concat!(env!("CARGO_MANIFEST_DIR"), "/.env"));
    #[cfg(desktop)]
    let _ = dotenvy::dotenv();

    tauri::Builder::default()
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .manage(CaptureService::new(SecurityService::with_defaults()))
        .manage(AiService::new(AiKeyService::new()))
        .manage(PendingSource::default())
        .manage(PendingCapture::default())
        .setup(|app| {
            let data_dir = app
                .path()
                .app_data_dir()
                .map_err(|e| format!("no app data dir: {e}"))?;
            std::fs::create_dir_all(&data_dir)
                .map_err(|e| format!("could not create data dir: {e}"))?;

            let db = Arc::new(Db::open(&data_dir.join("blink.db"))?);
            let repository = Repository::new(db);

            let hlc_service = Arc::new(HlcService::new(repository.sync_state.clone())?);
            // Shared encryption vault (keychain-backed VMK); the sync service holds it too.
            let vault_service = Arc::new(VaultService::new());

            let (sync_sender, sync_receiver) = sync_channel::init();

            // The DB-backed services are built here (not up top with the others)
            // because their repositories only exist once the Repository is open.
            app.manage(AuthService::new(
                ServerClient::new(),
                SessionTokenService::new(),
                repository.settings.clone(),
            ));
            app.manage(TaskService::new(
                repository.tasks.clone(),
                hlc_service.clone(),
                sync_sender.clone(),
            ));
            app.manage(TaskGroupService::new(
                repository.task_groups.clone(),
                repository.settings.clone(),
                repository.tasks.clone(),
                hlc_service.clone(),
                sync_sender.clone(),
            ));
            app.manage(ShortcutService::new(repository.settings.clone()));
            let repo_service = RepoService::new(GitCli::new(), repository.settings.clone());

            let attention_dir = data_dir.join("attention");
            let hook_service = HookService::new(
                data_dir.join("hooks/blink-attention.sh"),
                data_dir.join("hooks/claude-settings.json"),
                attention_dir.clone(),
            );
            if let Err(err) = hook_service.install() {
                eprintln!("[hooks] could not install the attention hooks: {err}");
            }
            let claude_command = format!(
                "claude --settings {}",
                crate::core::paths::shell_quote(&hook_service.settings_path().to_string_lossy())
            );

            let worktree_service = WorktreeService::new(
                GitCli::new(),
                TmuxCli::new(),
                repository.settings.clone(),
                claude_command,
            );
            let attention_service = Arc::new(AttentionService::new(
                repo_service.clone(),
                worktree_service.clone(),
                attention_dir,
            ));
            app.manage(repo_service);
            app.manage(worktree_service);
            app.manage(attention_service);
            app.manage(vault_service.clone());
            let sync_service = Arc::new(SyncService::new(
                ServerClient::new(),
                vault_service,
                SessionTokenService::new(),
                repository.tasks.clone(),
                repository.task_groups.clone(),
                repository.sync_state.clone(),
                sync_sender,
            ));
            app.manage(sync_service.clone());

            platform::init(app, sync_receiver)?;
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
            commands::ai::ai_status,
            commands::ai::set_ai_api_key,
            commands::ai::clear_ai_api_key,
            commands::ai::improve_text,
            commands::ai::generate_task_prompt,
            commands::tasks::list_tasks,
            commands::tasks::save_task,
            commands::tasks::delete_task,
            commands::tasks::reorder_task,
            commands::tasks::update_task,
            commands::task_groups::list_task_groups,
            commands::task_groups::create_task_group,
            commands::task_groups::update_task_group,
            commands::task_groups::delete_task_group,
            commands::task_groups::get_active_task_group,
            commands::task_groups::set_active_task_group,
            commands::link::open_link,
            commands::shortcut::get_capture_shortcut,
            commands::shortcut::set_capture_shortcut,
            commands::sync::vault_status,
            commands::sync::setup_vault,
            commands::sync::unlock_vault,
            commands::sync::sync_now,
            commands::sync::is_vault_unlocked,
            commands::sync::lock_vault,
            commands::repo::list_managed_repos,
            commands::repo::remove_managed_repo,
            commands::repo::pick_managed_repo,
            commands::worktree::list_worktrees,
            commands::worktree::add_worktree,
            commands::worktree::remove_worktree,
            commands::worktree::delete_remote_branch,
            commands::worktree::prune_worktrees,
            commands::worktree::open_worktree,
            commands::worktree::get_worktree_attention,
            commands::worktree::get_worktree_base_dir,
            commands::worktree::set_worktree_base_dir,
            commands::worktree::pick_worktree_base_dir,
            commands::worktree::get_worktree_terminal,
            commands::worktree::set_worktree_terminal,
        ])
        .build(tauri::generate_context!())
        .expect("error while building Blink")
        .run(|app, event| platform::os::on_run_event(app, &event));
}
