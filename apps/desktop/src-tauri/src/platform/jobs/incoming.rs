//! The Incoming poll loop: on a fixed cadence it refreshes the feed from every source, pushes
//! it to the webview as an `incoming` event (the Incoming list + its nav badge), and fires a
//! **native notification** for an urgent item (an incident, a DM) the first time it shows up.
//!
//! Started once from [`super::start`]; runs for the app's lifetime. Shows OS notifications —
//! the reason background jobs live in `platform`, not `services`.

use std::collections::HashSet;
use std::sync::Arc;
use std::thread;
use std::time::Duration;

use tauri::{AppHandle, Emitter};
use tauri_plugin_notification::NotificationExt;

use crate::core::models::IncomingItem;
use crate::services::incoming_service::IncomingService;

/// GitHub asks clients not to poll notifications more than once a minute.
const POLL_INTERVAL: Duration = Duration::from_secs(60);

/// Start the Incoming poll loop. Fire-and-forget for the app's lifetime.
pub(super) fn start(app: AppHandle, incoming_service: Arc<IncomingService>) {
    thread::spawn(move || {
        // Ids already shown, so an urgent item notifies once. `None` until the first good poll,
        // which seeds silently — what was already waiting at launch doesn't fire a burst.
        let mut seen: Option<HashSet<String>> = None;
        loop {
            match tauri::async_runtime::block_on(incoming_service.refresh()) {
                Ok(feed) => {
                    if let Some(seen) = &seen {
                        let fresh = feed
                            .items
                            .iter()
                            .filter(|i| i.urgent && !seen.contains(&i.id));
                        for item in fresh {
                            notify(&app, item);
                        }
                    }
                    let ids = feed.items.iter().map(|item| item.id.clone());
                    seen.get_or_insert_with(HashSet::new).extend(ids);
                    let _ = app.emit("incoming", &feed);
                }
                Err(err) => eprintln!("[incoming] refresh failed: {err}"),
            }
            thread::sleep(POLL_INTERVAL);
        }
    });
}

fn notify(app: &AppHandle, item: &IncomingItem) {
    let _ = app
        .notification()
        .builder()
        .title(format!("{} · {}", item.source.display_name(), item.reason))
        .body(&item.title)
        .show();
}
