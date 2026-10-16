//! Claude Code usage on this Mac, read from Claude's own transcripts (`~/.claude/projects`):
//! every reply carries its token usage. Claude writes one reply's usage on several lines (one
//! per content block), so replies are counted once by message id. Parsed files are cached by
//! size + mtime, so a refresh only re-reads the transcripts that grew. The repo of a session
//! is its working directory's git repository — worktrees count toward their main repo.

use std::collections::{HashMap, HashSet};
use std::fs::File;
use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::SystemTime;

use chrono::{DateTime, Duration, Local, TimeZone, Utc};
use serde::Deserialize;
use serde_json::Value;

use crate::clients::claude_store::ClaudeStore;
use crate::clients::git_cli::GitCli;
use crate::core::error::{AppError, AppResult};
use crate::core::model_prices::{rates_for, FAST_MULTIPLIER};
use crate::core::models::{UsageGroup, UsageRange, UsageReport, UsageSession, UsageTotals};

/// Longest first prompt kept as a session's title.
const TITLE_CHARS: usize = 140;
const TOP_SESSIONS: usize = 10;
const TOP_REPOS: usize = 15;

pub struct UsageService {
    claude_store: ClaudeStore,
    git_cli: GitCli,
    files: Mutex<HashMap<PathBuf, ParsedFile>>,
    /// cwd → repo name (git calls are the slow part of a refresh).
    repos: Mutex<HashMap<String, String>>,
}

/// One reply's usage, as read from a transcript.
#[derive(Clone)]
struct Reply {
    id: String,
    time: DateTime<Utc>,
    model: String,
    fast: bool,
    session_id: String,
    cwd: String,
    branch: Option<String>,
    input: i64,
    output: i64,
    thinking: i64,
    cache_write_5m: i64,
    cache_write_1h: i64,
    cache_read: i64,
    web_searches: u32,
    web_fetches: u32,
}

struct ParsedFile {
    modified: SystemTime,
    len: u64,
    replies: Vec<Reply>,
    /// session id → its first prompt.
    titles: HashMap<String, String>,
}

impl UsageService {
    pub fn new(claude_store: ClaudeStore, git_cli: GitCli) -> Self {
        Self {
            claude_store,
            git_cli,
            files: Mutex::new(HashMap::new()),
            repos: Mutex::new(HashMap::new()),
        }
    }

    /// Usage for `range`, ending now. Blocking: reads (changed) transcripts from disk.
    pub fn report(&self, range: UsageRange) -> AppResult<UsageReport> {
        self.refresh()?;
        let files = self.files.lock().map_err(|_| poisoned())?;
        let mut seen = HashSet::new();
        let mut replies: Vec<&Reply> = Vec::new();
        let mut titles: HashMap<&str, &str> = HashMap::new();
        for file in files.values() {
            for reply in &file.replies {
                if seen.insert(reply.id.as_str()) {
                    replies.push(reply);
                }
            }
            for (session, title) in &file.titles {
                titles.entry(session.as_str()).or_insert(title.as_str());
            }
        }
        let first_seen = replies.iter().map(|r| r.time).min();
        let cutoff = cutoff(range, Local::now());
        replies.retain(|reply| cutoff.is_none_or(|cutoff| reply.time >= cutoff));
        let repo_of = |cwd: &str| self.repo_name(cwd);
        Ok(build_report(range, &replies, &titles, first_seen, repo_of))
    }

    /// Re-read the transcripts that are new or changed since the last report; forget deleted
    /// ones.
    fn refresh(&self) -> AppResult<()> {
        let transcripts = self.claude_store.all_transcripts();
        let stale: Vec<PathBuf> = {
            let files = self.files.lock().map_err(|_| poisoned())?;
            transcripts
                .iter()
                .filter(|t| {
                    files.get(&t.path).is_none_or(|f| f.modified != t.modified || f.len != t.len)
                })
                .map(|t| t.path.clone())
                .collect()
        };
        let mut parsed = Vec::new();
        for path in stale {
            let Some(transcript) = transcripts.iter().find(|t| t.path == path) else { continue };
            let (replies, titles) = match parse(&path) {
                Ok(parsed) => parsed,
                // Removed between listing and reading (Claude cleans up old sessions).
                Err(e) if e.kind() == std::io::ErrorKind::NotFound => continue,
                Err(e) => {
                    return Err(AppError::Usage(format!(
                        "could not read transcript {}: {e}",
                        path.display()
                    )))
                }
            };
            parsed.push((
                path,
                ParsedFile { modified: transcript.modified, len: transcript.len, replies, titles },
            ));
        }
        let present: HashSet<&PathBuf> = transcripts.iter().map(|t| &t.path).collect();
        let mut files = self.files.lock().map_err(|_| poisoned())?;
        files.retain(|path, _| present.contains(path));
        files.extend(parsed);
        Ok(())
    }

    fn repo_name(&self, cwd: &str) -> String {
        if let Some(name) = self.repos.lock().ok().and_then(|repos| repos.get(cwd).cloned()) {
            return name;
        }
        let path = Path::new(cwd);
        // `<repo>/.git` is shared by the checkout and every worktree, so its parent names the
        // repo; a deleted worktree or a non-repo dir falls back to the folder name.
        let name = self
            .git_cli
            .common_dir(path)
            .and_then(|dir| {
                Path::new(&dir).parent()?.file_name().map(|n| n.to_string_lossy().into_owned())
            })
            .or_else(|| path.file_name().map(|n| n.to_string_lossy().into_owned()))
            .unwrap_or_else(|| cwd.to_string());
        if let Ok(mut repos) = self.repos.lock() {
            repos.insert(cwd.to_string(), name.clone());
        }
        name
    }
}

fn poisoned() -> AppError {
    AppError::Usage("usage cache lock poisoned".into())
}

/// Where a range starts: local midnight for today, else a rolling window; `None` = all.
fn cutoff(range: UsageRange, now: DateTime<Local>) -> Option<DateTime<Utc>> {
    match range {
        UsageRange::Today => {
            let midnight = now.date_naive().and_hms_opt(0, 0, 0)?;
            Local.from_local_datetime(&midnight).earliest().map(|t| t.with_timezone(&Utc))
        }
        UsageRange::Week => Some((now - Duration::days(7)).with_timezone(&Utc)),
        UsageRange::Month => Some((now - Duration::days(30)).with_timezone(&Utc)),
        UsageRange::All => None,
    }
}

#[derive(Deserialize)]
struct UsageLine {
    timestamp: Option<String>,
    #[serde(rename = "sessionId")]
    session_id: Option<String>,
    cwd: Option<String>,
    #[serde(rename = "gitBranch")]
    git_branch: Option<String>,
    message: Option<UsageMessage>,
}

#[derive(Deserialize)]
struct UsageMessage {
    id: Option<String>,
    model: Option<String>,
    usage: Option<Usage>,
}

#[derive(Deserialize, Default)]
struct Usage {
    #[serde(default)]
    input_tokens: i64,
    #[serde(default)]
    output_tokens: i64,
    #[serde(default)]
    cache_creation_input_tokens: i64,
    #[serde(default)]
    cache_read_input_tokens: i64,
    cache_creation: Option<CacheCreation>,
    output_tokens_details: Option<OutputDetails>,
    server_tool_use: Option<ServerToolUse>,
    speed: Option<String>,
}

#[derive(Deserialize)]
struct CacheCreation {
    #[serde(default)]
    ephemeral_5m_input_tokens: i64,
    #[serde(default)]
    ephemeral_1h_input_tokens: i64,
}

#[derive(Deserialize)]
struct OutputDetails {
    #[serde(default)]
    thinking_tokens: i64,
}

#[derive(Deserialize)]
struct ServerToolUse {
    #[serde(default)]
    web_search_requests: u32,
    #[serde(default)]
    web_fetch_requests: u32,
}

#[derive(Deserialize)]
struct PromptLine {
    #[serde(rename = "sessionId")]
    session_id: Option<String>,
    #[serde(rename = "isMeta", default)]
    is_meta: bool,
    message: Option<PromptMessage>,
}

#[derive(Deserialize)]
struct PromptMessage {
    content: Option<Value>,
}

/// A transcript's replies and the first prompt of each session in it. Lines are checked by a
/// cheap substring test before parsing — transcripts are mostly tool output.
fn parse(path: &Path) -> std::io::Result<(Vec<Reply>, HashMap<String, String>)> {
    let file = File::open(path)?;
    let mut replies = Vec::new();
    let mut titles = HashMap::new();
    for line in BufReader::new(file).lines() {
        let Ok(line) = line else { continue };
        if line.contains("\"usage\"") {
            if let Some(reply) = serde_json::from_str::<UsageLine>(&line).ok().and_then(reply) {
                replies.push(reply);
            }
        } else if line.contains("\"type\":\"user\"") {
            let Ok(prompt) = serde_json::from_str::<PromptLine>(&line) else { continue };
            let Some(session) = prompt.session_id else { continue };
            if prompt.is_meta || titles.contains_key(&session) {
                continue;
            }
            if let Some(title) = prompt.message.and_then(|m| m.content).and_then(prompt_text) {
                titles.insert(session, title);
            }
        }
    }
    Ok((replies, titles))
}

fn reply(line: UsageLine) -> Option<Reply> {
    let message = line.message?;
    let usage = message.usage?;
    let (cache_write_5m, cache_write_1h) = match &usage.cache_creation {
        Some(split) => (split.ephemeral_5m_input_tokens, split.ephemeral_1h_input_tokens),
        None => (usage.cache_creation_input_tokens, 0),
    };
    Some(Reply {
        id: message.id?,
        time: DateTime::parse_from_rfc3339(line.timestamp.as_deref()?).ok()?.with_timezone(&Utc),
        model: message.model.unwrap_or_default(),
        fast: usage.speed.as_deref() == Some("fast"),
        session_id: line.session_id.unwrap_or_default(),
        cwd: line.cwd.unwrap_or_default(),
        branch: line.git_branch.filter(|b| !b.is_empty() && b != "HEAD"),
        input: usage.input_tokens,
        output: usage.output_tokens,
        thinking: usage.output_tokens_details.map_or(0, |d| d.thinking_tokens),
        cache_write_5m,
        cache_write_1h,
        cache_read: usage.cache_read_input_tokens,
        web_searches: usage.server_tool_use.as_ref().map_or(0, |s| s.web_search_requests),
        web_fetches: usage.server_tool_use.as_ref().map_or(0, |s| s.web_fetch_requests),
    })
}

/// What the user typed: the text of a prompt, skipping Claude Code's own injected lines
/// (`<command-name>`, `<local-command-stdout>`, tool results, …).
fn prompt_text(content: Value) -> Option<String> {
    let text = match content {
        Value::String(text) => text,
        Value::Array(parts) => parts
            .iter()
            .filter(|part| part.get("type").and_then(Value::as_str) == Some("text"))
            .filter_map(|part| part.get("text").and_then(Value::as_str))
            .collect::<Vec<_>>()
            .join(" "),
        _ => return None,
    };
    let flat = text.split_whitespace().collect::<Vec<_>>().join(" ");
    if flat.is_empty() || flat.starts_with('<') {
        return None;
    }
    if flat.chars().count() <= TITLE_CHARS {
        return Some(flat);
    }
    let cut: String = flat.chars().take(TITLE_CHARS).collect();
    Some(format!("{}…", cut.trim_end()))
}

impl UsageTotals {
    fn add(&mut self, reply: &Reply, unpriced: &mut HashSet<String>) {
        self.input_tokens += reply.input;
        self.output_tokens += reply.output;
        self.thinking_tokens += reply.thinking;
        self.cache_write_tokens += reply.cache_write_5m + reply.cache_write_1h;
        self.cache_read_tokens += reply.cache_read;
        self.replies += 1;
        self.web_searches += reply.web_searches;
        self.web_fetches += reply.web_fetches;
        match rates_for(&reply.model) {
            Some(rates) => {
                let per_million = |tokens: i64, rate: f64| tokens as f64 * rate / 1_000_000.0;
                let cost = per_million(reply.input, rates.input)
                    + per_million(reply.output, rates.output)
                    + per_million(reply.cache_write_5m, rates.cache_write_5m())
                    + per_million(reply.cache_write_1h, rates.cache_write_1h())
                    + per_million(reply.cache_read, rates.cache_read);
                self.cost_usd += if reply.fast { cost * FAST_MULTIPLIER } else { cost };
            }
            None => {
                let tokens = reply.input + reply.output + reply.cache_read;
                if tokens + reply.cache_write_5m + reply.cache_write_1h > 0 {
                    unpriced.insert(reply.model.clone());
                }
            }
        }
        let all_input = self.input_tokens + self.cache_write_tokens + self.cache_read_tokens;
        self.cache_hit_rate =
            if all_input > 0 { self.cache_read_tokens as f64 / all_input as f64 } else { 0.0 };
    }
}

fn build_report(
    range: UsageRange,
    replies: &[&Reply],
    titles: &HashMap<&str, &str>,
    first_seen: Option<DateTime<Utc>>,
    repo_of: impl Fn(&str) -> String,
) -> UsageReport {
    let mut unpriced = HashSet::new();
    let mut totals = UsageTotals::default();
    let mut by_day: HashMap<String, UsageTotals> = HashMap::new();
    let mut by_model: HashMap<String, UsageTotals> = HashMap::new();
    let mut by_repo: HashMap<(String, Option<String>), UsageTotals> = HashMap::new();
    let mut by_session: HashMap<&str, (UsageTotals, &Reply)> = HashMap::new();
    for &reply in replies {
        totals.add(reply, &mut unpriced);
        let day = reply.time.with_timezone(&Local).format("%Y-%m-%d").to_string();
        by_day.entry(day).or_default().add(reply, &mut unpriced);
        by_model.entry(reply.model.clone()).or_default().add(reply, &mut unpriced);
        let repo = (repo_of(&reply.cwd), reply.branch.clone());
        by_repo.entry(repo).or_default().add(reply, &mut unpriced);
        let session = by_session.entry(reply.session_id.as_str()).or_insert((UsageTotals::default(), reply));
        session.0.add(reply, &mut unpriced);
        if reply.time > session.1.time {
            session.1 = reply;
        }
    }

    let by_cost = |a: &UsageGroup, b: &UsageGroup| b.totals.cost_usd.total_cmp(&a.totals.cost_usd);
    let mut days: Vec<UsageGroup> = by_day
        .into_iter()
        .map(|(day, totals)| UsageGroup { label: day, detail: None, totals })
        .collect();
    days.sort_by(|a, b| b.label.cmp(&a.label));
    let mut models: Vec<UsageGroup> = by_model
        .into_iter()
        .filter(|(model, _)| !model.is_empty() && model != "<synthetic>")
        .map(|(model, totals)| UsageGroup { label: model, detail: None, totals })
        .collect();
    models.sort_by(by_cost);
    let mut repos: Vec<UsageGroup> = by_repo
        .into_iter()
        .map(|((repo, branch), totals)| UsageGroup { label: repo, detail: branch, totals })
        .collect();
    repos.sort_by(by_cost);
    repos.truncate(TOP_REPOS);
    let sessions = by_session.len() as u32;
    let mut top: Vec<UsageSession> = by_session
        .into_iter()
        .map(|(id, (totals, latest))| UsageSession {
            session_id: id.to_string(),
            title: titles.get(id).map_or_else(|| "Untitled session".into(), |t| t.to_string()),
            repo: repo_of(&latest.cwd),
            branch: latest.branch.clone(),
            last_active: latest.time.to_rfc3339_opts(chrono::SecondsFormat::Secs, true),
            totals,
        })
        .collect();
    top.sort_by(|a, b| b.totals.cost_usd.total_cmp(&a.totals.cost_usd));
    top.truncate(TOP_SESSIONS);
    let mut unpriced: Vec<String> = unpriced.into_iter().collect();
    unpriced.sort();

    UsageReport {
        range,
        totals,
        sessions,
        by_day: days,
        by_model: models,
        by_repo: repos,
        top_sessions: top,
        unpriced_models: unpriced,
        first_seen: first_seen.map(|t| t.to_rfc3339_opts(chrono::SecondsFormat::Secs, true)),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn reply_line(id: &str, ts: &str, model: &str, session: &str, speed: &str) -> String {
        serde_json::json!({
            "type": "assistant",
            "timestamp": ts,
            "sessionId": session,
            "cwd": "/repos/blink",
            "gitBranch": "master",
            "message": {
                "id": id,
                "model": model,
                "usage": {
                    "input_tokens": 1_000_000,
                    "output_tokens": 1_000_000,
                    "cache_creation_input_tokens": 2_000_000,
                    "cache_read_input_tokens": 1_000_000,
                    "cache_creation": {
                        "ephemeral_5m_input_tokens": 1_000_000,
                        "ephemeral_1h_input_tokens": 1_000_000
                    },
                    "output_tokens_details": { "thinking_tokens": 10 },
                    "server_tool_use": { "web_search_requests": 1, "web_fetch_requests": 0 },
                    "speed": speed
                }
            }
        })
        .to_string()
    }

    #[test]
    fn replies_are_counted_once_and_priced_per_model() {
        let dir = std::env::temp_dir().join(format!("blink-usage-{}", std::process::id()));
        std::fs::create_dir_all(&dir).expect("dir");
        let path = dir.join("s1.jsonl");
        let lines = [
            serde_json::json!({
                "type": "user", "sessionId": "s1",
                "message": { "role": "user", "content": "<command-name>/clear</command-name>" }
            })
            .to_string(),
            serde_json::json!({
                "type": "user", "sessionId": "s1",
                "message": { "role": "user", "content": [{ "type": "text", "text": "Fix   the sync bug" }] }
            })
            .to_string(),
            // The same reply written twice (one line per content block).
            reply_line("m1", "2026-10-14T10:00:00.000Z", "claude-opus-5-5", "s1", "standard"),
            reply_line("m1", "2026-10-14T10:00:00.000Z", "claude-opus-5-5", "s1", "standard"),
            reply_line("m2", "2026-10-14T11:00:00.000Z", "claude-opus-5", "s1", "fast"),
            reply_line("m3", "2026-10-14T12:00:00.000Z", "claude-mystery-9", "s1", "standard"),
        ];
        std::fs::write(&path, lines.join("\n")).expect("write");
        let (replies, titles) = parse(&path).expect("parse");
        std::fs::remove_dir_all(&dir).ok();

        assert_eq!(titles.get("s1").map(String::as_str), Some("Fix the sync bug"));
        let mut seen = HashSet::new();
        let unique: Vec<&Reply> = replies.iter().filter(|r| seen.insert(r.id.clone())).collect();
        let report = build_report(UsageRange::All, &unique, &HashMap::new(), None, |_| "blink".into());

        assert_eq!(report.totals.replies, 3);
        // Opus 5.5: 4 + 20 + 5 (5m write) + 8 (1h write) + 0.2 (read) = 37.2
        // Opus 5 fast: (5 + 25 + 6.25 + 10 + 0.5) × 2 = 93.5; the unknown model adds nothing.
        assert!((report.totals.cost_usd - 130.7).abs() < 1e-6, "{}", report.totals.cost_usd);
        assert_eq!(report.unpriced_models, ["claude-mystery-9"]);
        assert_eq!(report.totals.web_searches, 3);
        // 3M cache reads of 3M input + 6M writes + 3M reads.
        assert!((report.totals.cache_hit_rate - 0.25).abs() < 1e-9);
        assert_eq!(report.by_repo[0].label, "blink");
        assert_eq!(report.by_repo[0].detail.as_deref(), Some("master"));
        assert_eq!(report.sessions, 1);
    }
}
