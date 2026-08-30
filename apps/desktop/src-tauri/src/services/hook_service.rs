//! Writes the two Blink-owned files that power the worktree attention dashboard, so Blink
//! never has to touch the user's global `~/.claude/settings.json`:
//!
//!   1. a hook **script** (`blink-attention.sh`) that records a Claude session's state — keyed
//!      by `session_id`, carrying its `cwd` — into a state file under Blink's data dir;
//!   2. a **settings file** (`claude-settings.json`) wiring Claude's lifecycle events to that
//!      script, which Blink passes at launch via `claude --settings <file>` (see
//!      [`crate::services::worktree_service`]).
//!
//! [`crate::services::attention_service`] reads the state files and matches `cwd` to a
//! worktree path. Because the hooks ride on the `--settings` flag of the sessions Blink
//! itself launches, there's nothing to merge, preserve, or uninstall.

use std::path::{Path, PathBuf};

use serde_json::{json, Map, Value};

use crate::core::error::{AppError, AppResult};
use crate::core::paths::shell_quote;

/// The Claude Code hook events we wire, each mapped to the state the hook records, plus an
/// optional `matcher` (Claude's notification-type / tool filter; `None` = fires always).
const HOOKS: &[(&str, &str, Option<&str>)] = &[
    ("UserPromptSubmit", "working", None),
    ("PreToolUse", "working", None),
    ("Notification", "needs-input", Some("permission_prompt")),
    ("Stop", "done", None),
    ("StopFailure", "errored", None),
    ("SessionEnd", "gone", None),
];

/// The hook script. `{ATTENTION_DIR}` is replaced with the real absolute path at install
/// time (not guessed from `$HOME`). `$1` is the state the invoking event maps to; the Claude
/// hook JSON arrives on stdin.
const SCRIPT_TEMPLATE: &str = r#"#!/bin/bash
# Blink worktree-attention hook — managed by Blink, do not edit. Records a Claude Code
# session's state (arg $1) for the worktree dashboard; the hook JSON arrives on stdin.
state="$1"
dir="{ATTENTION_DIR}"
input="$(cat)"
sid="$(printf '%s' "$input" | sed -n 's/.*"session_id"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p')"
[ -z "$sid" ] && exit 0
if [ "$state" = "gone" ]; then rm -f "$dir/$sid.json"; exit 0; fi
cwd="$(printf '%s' "$input" | sed -n 's/.*"cwd"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p')"
mkdir -p "$dir"
ts="$(date +%s)"
tmp="$dir/.$sid.$$.tmp"
printf '{"session_id":"%s","cwd":"%s","state":"%s","ts":%s}\n' "$sid" "$cwd" "$state" "$ts" > "$tmp"
mv -f "$tmp" "$dir/$sid.json"
exit 0
"#;

pub struct HookService {
    /// `<data>/hooks/blink-attention.sh`.
    script_path: PathBuf,
    /// `<data>/hooks/claude-settings.json` — passed to `claude --settings`.
    settings_path: PathBuf,
    /// `<data>/attention` — where the script writes per-session state files.
    attention_dir: PathBuf,
}

impl HookService {
    pub fn new(script_path: PathBuf, settings_path: PathBuf, attention_dir: PathBuf) -> Self {
        Self {
            script_path,
            settings_path,
            attention_dir,
        }
    }

    /// The settings file to hand Claude at launch (`claude --settings <this>`).
    pub fn settings_path(&self) -> &Path {
        &self.settings_path
    }

    /// Write the script + settings file (and ensure the state dir exists). Idempotent — it
    /// just overwrites Blink's own files.
    pub fn install(&self) -> AppResult<()> {
        if let Some(parent) = self.script_path.parent() {
            std::fs::create_dir_all(parent).map_err(|e| AppError::Hook(e.to_string()))?;
        }
        std::fs::create_dir_all(&self.attention_dir).map_err(|e| AppError::Hook(e.to_string()))?;

        let script =
            SCRIPT_TEMPLATE.replace("{ATTENTION_DIR}", &self.attention_dir.to_string_lossy());
        std::fs::write(&self.script_path, script).map_err(|e| AppError::Hook(e.to_string()))?;
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            std::fs::set_permissions(&self.script_path, std::fs::Permissions::from_mode(0o755))
                .map_err(|e| AppError::Hook(e.to_string()))?;
        }

        let settings = build_settings(&self.script_path.to_string_lossy());
        let text = serde_json::to_string_pretty(&settings)
            .map_err(|e| AppError::Hook(e.to_string()))?;
        std::fs::write(&self.settings_path, text).map_err(|e| AppError::Hook(e.to_string()))?;
        Ok(())
    }
}

/// Build the `--settings` JSON wiring each event to `<script> <state>`. The script path is
/// shell-quoted because the hook `command` is parsed by a shell and the path contains a space
/// (`Application Support`).
fn build_settings(script_path: &str) -> Value {
    let script = shell_quote(script_path);
    let mut hooks = Map::new();
    for (event, state, matcher) in HOOKS {
        let hook = json!({
            "type": "command",
            "command": format!("{script} {state}"),
            "async": true,
        });
        let mut wrapper = json!({ "hooks": [hook] });
        if let Some(matcher) = matcher {
            wrapper["matcher"] = json!(matcher);
        }
        hooks.insert((*event).to_string(), json!([wrapper]));
    }
    json!({ "hooks": hooks })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn wires_every_event_with_state_and_matcher() {
        let settings = build_settings("/data/Application Support/blink/hooks/blink-attention.sh");
        let hooks = &settings["hooks"];

        for (event, state, _) in HOOKS {
            let command = hooks[event][0]["hooks"][0]["command"].as_str().unwrap();
            // The script path is single-quoted (it has a space) and carries the state arg.
            assert!(command.ends_with(&format!("blink-attention.sh' {state}")), "{command}");
            assert_eq!(hooks[event][0]["hooks"][0]["async"], json!(true));
        }
        // Only Notification is filtered to the permission prompt.
        assert_eq!(hooks["Notification"][0]["matcher"], json!("permission_prompt"));
        assert!(hooks["Stop"][0].get("matcher").is_none());
    }
}
