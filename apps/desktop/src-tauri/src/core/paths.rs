//! Small path helpers shared across services.

/// Expand a leading `~/` to the user's home directory. Non-tilde paths pass through
/// unchanged (as does `~/…` when `HOME` is unset).
pub fn expand_tilde(path: &str) -> String {
    if let Some(rest) = path.strip_prefix("~/") {
        if let Ok(home) = std::env::var("HOME") {
            return format!("{home}/{rest}");
        }
    }
    path.to_string()
}
