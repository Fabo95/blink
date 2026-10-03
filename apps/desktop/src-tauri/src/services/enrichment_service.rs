//! Source enrichment: for a source with a link, fetch the page in the background and keep
//! its title, a short excerpt, and an AI summary on the note. Best-effort by design: a
//! failed fetch retries with backoff and finally marks the note `failed`; it never blocks
//! a capture.
//!
//! Privacy rules, all enforced here: a confidential topic's sources are never fetched; a
//! page on a private or local host is fetched (it's reachable from this Mac anyway) but
//! never sent to the AI; everything stored or sent is DLP-filtered first; and every fetch
//! and AI call is written to the egress log.

use std::net::IpAddr;
use std::sync::{Arc, LazyLock};

use chrono::{Duration, Utc};
use regex::Regex;
use reqwest::{Response, Url};

use crate::clients::web_client::WebClient;
use crate::core::error::{AppError, AppResult};
use crate::core::models::{EgressKind, Enrichment, Note, NoteType, Sensitivity};
use crate::core::sync_channel::SyncSignalSender;
use crate::repository::{Job, JobRepository, NoteRepository};
use crate::services::ai_service::AiService;
use crate::services::egress_service::{EgressService, AI_DESTINATION};
use crate::services::hlc_service::HlcService;
use crate::services::note_service::ENRICH_JOB;
use crate::services::policy_service::PolicyService;
use crate::services::security_service::SecurityService;

/// Stop reading a page after this much; the excerpt only needs the start.
const MAX_PAGE_BYTES: usize = 2 * 1024 * 1024;
/// The stored (and summarized) excerpt, cut at a word boundary.
const EXCERPT_CHARS: usize = 2000;
/// After this many failed attempts the note is marked `failed`.
const MAX_ATTEMPTS: i64 = 5;
/// Jobs handled per run; the loop comes back for the rest.
const BATCH: i64 = 5;

pub struct EnrichmentService {
    job_repository: JobRepository,
    note_repository: NoteRepository,
    policy_service: PolicyService,
    web_client: WebClient,
    ai_service: AiService,
    security_service: SecurityService,
    egress_service: EgressService,
    hlc_service: Arc<HlcService>,
    sync_signal: SyncSignalSender,
}

impl EnrichmentService {
    #[allow(clippy::too_many_arguments)]
    pub fn new(
        job_repository: JobRepository,
        note_repository: NoteRepository,
        policy_service: PolicyService,
        web_client: WebClient,
        ai_service: AiService,
        security_service: SecurityService,
        egress_service: EgressService,
        hlc_service: Arc<HlcService>,
        sync_signal: SyncSignalSender,
    ) -> Self {
        Self {
            job_repository,
            note_repository,
            policy_service,
            web_client,
            ai_service,
            security_service,
            egress_service,
            hlc_service,
            sync_signal,
        }
    }

    /// Work the due jobs. Returns how many notes changed, so the caller can tell the
    /// webview to re-read.
    pub async fn run_due(&self) -> AppResult<usize> {
        let jobs = self
            .job_repository
            .due(ENRICH_JOB, &Utc::now().to_rfc3339(), BATCH)?;
        let mut changed = 0;
        for job in jobs {
            if self.run(&job).await? {
                changed += 1;
            }
        }
        Ok(changed)
    }

    /// One job. Returns whether the note changed.
    async fn run(&self, job: &Job) -> AppResult<bool> {
        // The note was deleted (or never synced here): nothing to do.
        let Ok(note) = self.note_repository.get(&job.note_id) else {
            self.job_repository.delete(&job.id)?;
            return Ok(false);
        };
        let Some(link) = note
            .link
            .clone()
            .filter(|_| note.note_type == NoteType::Source)
        else {
            self.job_repository.delete(&job.id)?;
            return Ok(false);
        };
        // Re-checked at run time: the topic may have turned confidential since queuing.
        if self.policy_service.sensitivity(note.topic_id.as_deref())? == Sensitivity::Confidential {
            self.finish(&note.id, Enrichment::Skipped, None, None, None)?;
            self.job_repository.delete(&job.id)?;
            return Ok(true);
        }

        match self.enrich(&note, &link).await {
            Ok(()) => {
                self.job_repository.delete(&job.id)?;
                Ok(true)
            }
            Err(err) => {
                let attempts = job.attempts + 1;
                if attempts >= MAX_ATTEMPTS {
                    eprintln!("[enrich] giving up on {}: {err}", note.id);
                    self.finish(&note.id, Enrichment::Failed, None, None, None)?;
                    self.job_repository.delete(&job.id)?;
                    return Ok(true);
                }
                let next = Utc::now() + retry_delay(attempts);
                self.job_repository.retry_later(
                    &job.id,
                    attempts,
                    &next.to_rfc3339(),
                    &err.to_string(),
                )?;
                Ok(false)
            }
        }
    }

    async fn enrich(&self, note: &Note, link: &str) -> AppResult<()> {
        let url = Url::parse(link).map_err(|e| AppError::Fetch(format!("bad link: {e}")))?;
        if !matches!(url.scheme(), "http" | "https") {
            return Err(AppError::Fetch(
                "only http(s) links can be fetched".to_string(),
            ));
        }
        let host = url.host_str().unwrap_or_default().to_string();
        let private = is_private_host(&url);

        self.egress_service
            .record(EgressKind::PageFetch, &host, Some(&note.id), 0)?;
        let response = self
            .web_client
            .get(url)
            .await
            .map_err(|e| AppError::Fetch(e.to_string()))?;
        if !response.status().is_success() {
            return Err(AppError::Fetch(format!(
                "{host} returned {}",
                response.status()
            )));
        }
        let is_text = response
            .headers()
            .get(reqwest::header::CONTENT_TYPE)
            .and_then(|v| v.to_str().ok())
            .is_none_or(|v| v.starts_with("text/html") || v.starts_with("text/plain"));
        if !is_text {
            // A PDF, image, or download: nothing to read, but the link itself is fine.
            self.finish(&note.id, Enrichment::Done, None, None, None)?;
            return Ok(());
        }
        let html = read_capped(response, MAX_PAGE_BYTES).await?;

        let clean = |text: &str| self.security_service.sanitize(text).clean;
        let title = extract_title(&html).map(|t| clean(&t));
        let text = extract_text(&html);
        let excerpt = Some(clean(&excerpt(&text, EXCERPT_CHARS))).filter(|e| !e.is_empty());

        let summary = match &excerpt {
            Some(excerpt) if !private && self.ai_service.key_hint()?.is_some() => {
                self.egress_service.record(
                    EgressKind::AiSummary,
                    AI_DESTINATION,
                    Some(&note.id),
                    excerpt.len() + title.as_deref().map_or(0, str::len),
                )?;
                // The page itself was fetched fine; a failed summary leaves title + excerpt
                // and is retried only if the user asks (`g`), not by the backoff loop.
                match self.ai_service.summarize(title.as_deref(), excerpt).await {
                    Ok(summary) => Some(clean(&summary)),
                    Err(err) => {
                        eprintln!("[enrich] summary failed for {}: {err}", note.id);
                        None
                    }
                }
            }
            _ => None,
        };

        self.finish(
            &note.id,
            Enrichment::Done,
            title.as_deref(),
            excerpt.as_deref(),
            summary.as_deref(),
        )
    }

    /// Store the outcome and stamp the note so it syncs (other devices then skip the fetch).
    fn finish(
        &self,
        note_id: &str,
        enrichment: Enrichment,
        title: Option<&str>,
        excerpt: Option<&str>,
        summary: Option<&str>,
    ) -> AppResult<()> {
        self.note_repository
            .set_enrichment(note_id, enrichment, title, excerpt, summary)?;
        let hlc = self.hlc_service.next()?;
        self.note_repository
            .record_change(note_id, hlc.physical, hlc.counter, &hlc.node_id)?;
        self.sync_signal.send();
        Ok(())
    }
}

/// Read at most `cap` bytes of the body: a huge page can't exhaust memory.
async fn read_capped(mut response: Response, cap: usize) -> AppResult<String> {
    let mut body = Vec::new();
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|e| AppError::Fetch(e.to_string()))?
    {
        let room = cap.saturating_sub(body.len());
        body.extend_from_slice(&chunk[..chunk.len().min(room)]);
        if body.len() >= cap {
            break;
        }
    }
    Ok(String::from_utf8_lossy(&body).into_owned())
}

/// 1 min, 5 min, 30 min, 2 h between attempts.
fn retry_delay(attempts: i64) -> Duration {
    match attempts {
        1 => Duration::minutes(1),
        2 => Duration::minutes(5),
        3 => Duration::minutes(30),
        _ => Duration::hours(2),
    }
}

static OG_TITLE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(
        r#"(?is)<meta[^>]+property\s*=\s*["']og:title["'][^>]*content\s*=\s*["']([^"']+)["']"#,
    )
    .expect("valid regex")
});
static TITLE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"(?is)<title[^>]*>(.*?)</title>").expect("valid regex"));
static NON_CONTENT: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"(?is)<(script|style|noscript|head|svg|nav|footer)\b.*?</(script|style|noscript|head|svg|nav|footer)>")
        .expect("valid regex")
});
static TAG: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"(?s)<[^>]*>").expect("valid regex"));
static WHITESPACE: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"\s+").expect("valid regex"));

/// The page title: `og:title` when present (usually the cleaner one), else `<title>`.
fn extract_title(html: &str) -> Option<String> {
    let raw = OG_TITLE
        .captures(html)
        .or_else(|| TITLE.captures(html))
        .and_then(|c| c.get(1))
        .map(|m| m.as_str())?;
    let title = collapse(&decode_entities(raw));
    (!title.is_empty()).then_some(title)
}

/// The readable text of a page: scripts, styles, navigation and markup removed, entities
/// decoded, whitespace collapsed. Rough by design; it only feeds an excerpt and a summary.
fn extract_text(html: &str) -> String {
    let without_blocks = NON_CONTENT.replace_all(html, " ");
    let without_tags = TAG.replace_all(&without_blocks, " ");
    collapse(&decode_entities(&without_tags))
}

/// The first `max` characters, cut back to the last word boundary.
fn excerpt(text: &str, max: usize) -> String {
    if text.chars().count() <= max {
        return text.to_string();
    }
    let cut: String = text.chars().take(max).collect();
    match cut.rfind(' ') {
        Some(space) => format!("{}…", &cut[..space]),
        None => cut,
    }
}

fn collapse(text: &str) -> String {
    WHITESPACE.replace_all(text, " ").trim().to_string()
}

fn decode_entities(text: &str) -> String {
    text.replace("&nbsp;", " ")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&#39;", "'")
        .replace("&#x27;", "'")
        .replace("&amp;", "&")
}

/// Hosts that only resolve inside a private network (or this machine). Their pages are
/// still fetched, but never sent to the AI provider: intranet content stays on the Mac.
fn is_private_host(url: &Url) -> bool {
    let Some(host) = url.host_str() else {
        return true;
    };
    // IPv6 hosts come bracketed (`[::1]`).
    let host = host.trim_start_matches('[').trim_end_matches(']');
    if let Ok(ip) = host.parse::<IpAddr>() {
        return is_private_ip(ip);
    }
    let domain = host.trim_end_matches('.').to_ascii_lowercase();
    domain == "localhost"
        || [".local", ".localhost", ".internal", ".lan", ".home.arpa", ".corp"]
            .iter()
            .any(|suffix| domain.ends_with(suffix))
        // A bare name ("wiki") only resolves through a local search domain.
        || !domain.contains('.')
}

fn is_private_ip(ip: IpAddr) -> bool {
    match ip {
        IpAddr::V4(v4) => {
            v4.is_private() || v4.is_loopback() || v4.is_link_local() || v4.is_unspecified()
        }
        IpAddr::V6(v6) => {
            // fc00::/7 unique-local and fe80::/10 link-local.
            let first = v6.segments()[0];
            v6.is_loopback()
                || v6.is_unspecified()
                || (first & 0xfe00) == 0xfc00
                || (first & 0xffc0) == 0xfe80
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn title_prefers_og_title_and_decodes_entities() {
        let html = r#"<head><title>Site | Page</title>
            <meta property="og:title" content="Agents &amp; payments"></head>"#;
        assert_eq!(extract_title(html).as_deref(), Some("Agents & payments"));
        assert_eq!(
            extract_title("<title>\n  Plain   title </title>").as_deref(),
            Some("Plain title")
        );
        assert_eq!(extract_title("<p>no title</p>"), None);
    }

    #[test]
    fn text_drops_scripts_styles_navigation_and_markup() {
        let html = "<html><head><title>T</title><style>p{}</style></head><body>\
            <nav>Menu</nav><script>track()</script><h1>Hello</h1><p>World &lt;3</p>\
            <footer>Imprint</footer></body></html>";
        assert_eq!(extract_text(html), "Hello World <3");
    }

    #[test]
    fn excerpt_cuts_at_a_word_boundary() {
        assert_eq!(excerpt("short text", 100), "short text");
        assert_eq!(excerpt("one two three four", 12), "one two…");
    }

    #[test]
    fn private_and_local_hosts_are_detected() {
        for private in [
            "http://localhost:3000/x",
            "http://127.0.0.1/",
            "http://10.1.2.3/",
            "http://192.168.0.10/",
            "http://172.20.0.1/",
            "http://wiki/page",
            "https://confluence.corp/x",
            "http://printer.local/",
            "http://[::1]/",
            "http://[fd00::1]/",
        ] {
            assert!(is_private_host(&Url::parse(private).unwrap()), "{private}");
        }
        for public in [
            "https://stripe.com/blog",
            "https://8.8.8.8/",
            "https://news.ycombinator.com",
        ] {
            assert!(!is_private_host(&Url::parse(public).unwrap()), "{public}");
        }
    }

    #[test]
    fn retries_back_off() {
        assert!(retry_delay(1) < retry_delay(2));
        assert!(retry_delay(3) < retry_delay(4));
    }
}
