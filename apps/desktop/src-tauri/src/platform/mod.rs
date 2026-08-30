//! OS integration. Native primitives live in the `os` module (which selects its
//! implementation by target at compile time); `shortcut` (the capture hotkey) and
//! `window` (capture-panel placement) are the cross-platform glue built on top.
//! Callers reach OS ops as `platform::os::…`.

use std::sync::Arc;

use tauri::Manager;

use crate::core::sync_channel::SyncSignalReceiver;
use crate::services::sync_service::SyncService;

pub mod clipboard;
pub mod dialog;
pub mod jobs;
pub mod os;
pub mod shortcut;
pub mod window;

/// Wire the app's runtime hooks: bind the capture-shortcut listener + every method's
/// saved (or default) hotkey, and start the background sync loop (fed by `sync_receiver`,
/// the write-path sync signal). A bad saved shortcut is logged per method inside
/// `bind_all`, never fatal. Runs after the services are `manage`d, so it reads them from
/// state.
pub fn init(
    app: &mut tauri::App,
    sync_receiver: SyncSignalReceiver,
) -> Result<(), Box<dyn std::error::Error>> {
    shortcut::register_listener(app)?;
    shortcut::bind_all(app.handle());
    jobs::start(
        app.handle().clone(),
        app.state::<Arc<SyncService>>().inner().clone(),
        sync_receiver,
    );
    Ok(())
}
