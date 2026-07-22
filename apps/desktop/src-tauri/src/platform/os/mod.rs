//! The OS-abstraction layer: one `os` interface whose implementation is picked at
//! compile time — `macos/` on macOS, `fallback.rs` everywhere else. Both files expose
//! the same functions (`record_source`, `copy_selection`, `open_url`, `on_run_event`),
//! so the rest of `platform` builds on `os::…` and never sees the `cfg`.

#[cfg(target_os = "macos")]
mod macos;
#[cfg(target_os = "macos")]
pub use macos::*;

#[cfg(not(target_os = "macos"))]
mod fallback;
#[cfg(not(target_os = "macos"))]
pub use fallback::*;
