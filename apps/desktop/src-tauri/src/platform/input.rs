//! Keyboard input simulation for the capture flow.

/// Simulate ⌘C to copy the current selection in the frontmost app. Needs macOS
/// Accessibility permission; without it the key events are dropped (a no-op) and
/// capture falls back to whatever is already on the clipboard.
pub fn copy_selection() {
    use enigo::{Direction, Enigo, Key, Keyboard, Settings};

    let Ok(mut enigo) = Enigo::new(&Settings::default()) else {
        return;
    };
    let _ = enigo.key(Key::Meta, Direction::Press);
    let _ = enigo.key(Key::Unicode('c'), Direction::Click);
    let _ = enigo.key(Key::Meta, Direction::Release);
}
