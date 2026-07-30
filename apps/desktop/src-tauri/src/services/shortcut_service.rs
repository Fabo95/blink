//! Capture-hotkey policy: which hotkey each capture method is bound to. Owns the
//! persistence (one `settings` entry per method) and the out-of-the-box defaults;
//! the OS-side binding and dispatch mechanics live in [`crate::platform::shortcut`].

use crate::core::error::AppResult;
use crate::platform::shortcut::CaptureMethod;
use crate::repository::SettingsRepository;

pub struct ShortcutService {
    settings_repository: SettingsRepository,
}

impl ShortcutService {
    pub fn new(settings_repository: SettingsRepository) -> Self {
        Self {
            settings_repository,
        }
    }

    /// A method's current hotkey: the user's saved one, or the default.
    pub fn current(&self, method: CaptureMethod) -> AppResult<String> {
        Ok(self
            .settings_repository
            .get(setting_key(method))?
            .unwrap_or_else(|| default_shortcut(method).to_string()))
    }

    /// Persist a method's hotkey. The caller binds it with the OS *first*, so an
    /// invalid or already-taken combo never gets saved.
    pub fn save(&self, method: CaptureMethod, shortcut: &str) -> AppResult<()> {
        self.settings_repository.set(setting_key(method), shortcut)
    }
}

/// The `settings` key a method's hotkey is persisted under.
fn setting_key(method: CaptureMethod) -> &'static str {
    match method {
        CaptureMethod::Copy => "copy_capture_shortcut",
        CaptureMethod::Manual => "manual_capture_shortcut",
    }
}

/// The out-of-the-box hotkey, used until the user changes it.
fn default_shortcut(method: CaptureMethod) -> &'static str {
    match method {
        CaptureMethod::Copy => "CommandOrControl+Shift+B",
        CaptureMethod::Manual => "CommandOrControl+Shift+M",
    }
}
