//! Thin read-only access to Claude Code's on-disk session store
//! (`~/.claude/projects/<project>/<session-id>.jsonl`). Lists a directory's transcripts and
//! reads one; deciding which to continue or fork, and what to show for it, lives in
//! [`crate::services::terminal_service`]. Blink never writes here.

use std::fs::File;
use std::io::{BufRead, BufReader, Lines};
use std::path::{Path, PathBuf};
use std::time::SystemTime;

/// One top-level transcript file of a project.
pub struct SessionFile {
    pub id: String,
    pub path: PathBuf,
    pub modified: SystemTime,
}

/// Any transcript file in the store, top-level or nested.
pub struct TranscriptFile {
    pub path: PathBuf,
    pub modified: SystemTime,
    pub len: u64,
}

/// `projects/<project>/<session>.jsonl` plus `<session>/subagents/*.jsonl` — a few levels
/// deep, never more.
fn collect_transcripts(dir: &Path, depth: usize, found: &mut Vec<TranscriptFile>) {
    if depth > 3 {
        return;
    }
    let Ok(entries) = std::fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        let Ok(metadata) = entry.metadata() else { continue };
        if metadata.is_dir() {
            collect_transcripts(&path, depth + 1, found);
        } else if path.extension().is_some_and(|ext| ext == "jsonl") {
            let Ok(modified) = metadata.modified() else { continue };
            found.push(TranscriptFile { path, modified, len: metadata.len() });
        }
    }
}

#[derive(Clone)]
pub struct ClaudeStore {
    projects_dir: Option<PathBuf>,
}

impl ClaudeStore {
    pub fn new() -> Self {
        Self {
            projects_dir: std::env::var("HOME")
                .ok()
                .map(|home| Path::new(&home).join(".claude/projects")),
        }
    }

    /// The transcripts Claude recorded for sessions started in `cwd`, in no particular order.
    /// Empty when Claude has never run there (or `HOME` is unset).
    pub fn sessions(&self, cwd: &Path) -> Vec<SessionFile> {
        let Some(dir) = self.project_dir(cwd) else {
            return Vec::new();
        };
        let Ok(entries) = std::fs::read_dir(dir) else {
            return Vec::new();
        };
        entries
            .flatten()
            .filter_map(|entry| {
                let path = entry.path();
                if path.extension()? != "jsonl" {
                    return None;
                }
                let id = path.file_stem()?.to_str()?.to_string();
                let modified = entry.metadata().ok()?.modified().ok()?;
                Some(SessionFile { id, path, modified })
            })
            .collect()
    }

    /// Every transcript in the store — each project's sessions and the sub-agent transcripts
    /// nested under them — with its size, so a reader can tell which ones changed.
    pub fn all_transcripts(&self) -> Vec<TranscriptFile> {
        let mut found = Vec::new();
        if let Some(projects) = &self.projects_dir {
            collect_transcripts(projects, 0, &mut found);
        }
        found
    }

    /// The transcript's lines, read lazily (transcripts can run to megabytes).
    pub fn read_lines(&self, file: &SessionFile) -> Option<Lines<BufReader<File>>> {
        File::open(&file.path)
            .ok()
            .map(|f| BufReader::new(f).lines())
    }

    /// Claude names a project dir after the cwd with separators turned into `-`. Older
    /// versions replaced only `/`, newer ones every non-alphanumeric character, so both
    /// spellings are tried.
    fn project_dir(&self, cwd: &Path) -> Option<PathBuf> {
        let projects = self.projects_dir.as_ref()?;
        let cwd = cwd.to_string_lossy();
        let strict: String = cwd
            .chars()
            .map(|c| if c.is_ascii_alphanumeric() { c } else { '-' })
            .collect();
        let legacy = cwd.replace('/', "-");
        [strict, legacy]
            .into_iter()
            .map(|name| projects.join(name))
            .find(|dir| dir.is_dir())
    }
}
