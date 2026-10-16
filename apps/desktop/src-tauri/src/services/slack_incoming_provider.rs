//! Slack as an Incoming source, deliberately quiet — only two things get through:
//! - messages that mention you, read or not: `<@you>`, or `@here` / `@channel` / `@everyone`
//!   in a conversation you're a member of;
//! - direct / group messages you **haven't read** once the oldest unread one is over
//!   [`UNREAD_GRACE_MINUTES`] old — one **urgent** item per conversation. Reading it in Slack
//!   makes it go away; answering within the grace period means it never shows up.
//!
//! Channel messages only ever arrive as mentions. Read via `search.messages` (DMs to you,
//! mentions of you, broadcasts), `users.conversations` (which channels you're in — search also
//! covers public channels you never joined) and `conversations.info` (your read position per
//! DM) with the user token from [`SlackAccountService`]. Not connected = no items, not an error.

use std::collections::{HashMap, HashSet};
use std::sync::Arc;

use chrono::{DateTime, Duration, SecondsFormat, Utc};
use serde::Deserialize;

use crate::clients::slack_client::SlackClient;
use crate::core::error::AppResult;
use crate::core::incoming_provider::{BoxFuture, IncomingProvider};
use crate::core::models::{IncomingItem, IncomingSource, SourceConnection};
use crate::services::slack_account_service::{call, SlackAccountService};

/// How long an unread DM may wait before it lands in Incoming — time to answer it in Slack.
const UNREAD_GRACE_MINUTES: i64 = 30;

/// Longest message text kept as an item's title.
const TITLE_CHARS: usize = 200;

/// The broadcast mentions that count, as searched for and as they appear in message markup.
const BROADCASTS: [(&str, &str); 3] = [
    ("@here", "<!here"),
    ("@channel", "<!channel"),
    ("@everyone", "<!everyone"),
];

#[derive(Clone)]
pub struct SlackIncomingProvider {
    slack_client: SlackClient,
    slack_account_service: Arc<SlackAccountService>,
}

impl SlackIncomingProvider {
    pub fn new(slack_client: SlackClient, slack_account_service: Arc<SlackAccountService>) -> Self {
        Self {
            slack_client,
            slack_account_service,
        }
    }

    async fn search(&self, token: &str, query: &str) -> AppResult<Vec<Match>> {
        let found: SearchResponse = call(
            &self.slack_client,
            token,
            "search.messages",
            &[
                ("query", query),
                ("sort", "timestamp"),
                ("sort_dir", "desc"),
                ("count", "50"),
            ],
        )
        .await?;
        Ok(found.messages.matches)
    }

    /// Every channel, private channel, and group DM you're a member of.
    async fn member_channels(&self, token: &str) -> AppResult<HashSet<String>> {
        let mut ids = HashSet::new();
        let mut cursor = String::new();
        loop {
            let page: ConversationsPage = call(
                &self.slack_client,
                token,
                "users.conversations",
                &[
                    ("types", "public_channel,private_channel,mpim"),
                    ("exclude_archived", "true"),
                    ("limit", "200"),
                    ("cursor", &cursor),
                ],
            )
            .await?;
            ids.extend(page.channels.into_iter().map(|channel| channel.id));
            match page.response_metadata.and_then(|meta| meta.next_cursor) {
                Some(next) if !next.is_empty() => cursor = next,
                _ => return Ok(ids),
            }
        }
    }

    /// Your read position in each DM conversation (`None` when Slack doesn't say).
    async fn last_read(
        &self,
        token: &str,
        channels: &HashSet<String>,
    ) -> AppResult<HashMap<String, String>> {
        let mut positions = HashMap::new();
        for channel in channels {
            let info: InfoResponse = call(
                &self.slack_client,
                token,
                "conversations.info",
                &[("channel", channel)],
            )
            .await?;
            if let Some(last_read) = info.channel.last_read {
                positions.insert(channel.clone(), last_read);
            }
        }
        Ok(positions)
    }
}

impl IncomingProvider for SlackIncomingProvider {
    fn source(&self) -> IncomingSource {
        IncomingSource::Slack
    }

    fn fetch(&self, since: DateTime<Utc>) -> BoxFuture<'_, AppResult<Vec<IncomingItem>>> {
        Box::pin(async move {
            let Some(token) = self.slack_account_service.token()? else {
                return Ok(Vec::new());
            };
            let me = self.slack_account_service.identity(&token).await?.user_id;
            // `after:` is exclusive of the day itself, so start a day earlier.
            let after = (since - Duration::days(1)).format("%Y-%m-%d");
            let dms = self.search(&token, &format!("to:me after:{after}")).await?;
            let mentions = self
                .search(&token, &format!("<@{me}> after:{after}"))
                .await?;
            let mut broadcasts = Vec::new();
            for (word, _) in BROADCASTS {
                broadcasts.extend(
                    self.search(&token, &format!("{word} after:{after}"))
                        .await?,
                );
            }
            let member_of = self.member_channels(&token).await?;
            let dm_channels: HashSet<String> = dms.iter().map(|m| m.channel.id.clone()).collect();
            let last_read = self.last_read(&token, &dm_channels).await?;
            let found = Found {
                dms,
                mentions,
                broadcasts,
            };
            Ok(items(&me, since, Utc::now(), found, &member_of, &last_read))
        })
    }

    fn connection(&self) -> BoxFuture<'_, SourceConnection> {
        Box::pin(self.slack_account_service.connection())
    }

    fn connect_with_key(&self, key: String) -> BoxFuture<'_, AppResult<()>> {
        Box::pin(async move { self.slack_account_service.connect(&key).await })
    }

    fn disconnect(&self) -> AppResult<()> {
        self.slack_account_service.disconnect()
    }
}

#[derive(Deserialize)]
struct SearchResponse {
    messages: Matches,
}

#[derive(Deserialize)]
struct Matches {
    matches: Vec<Match>,
}

#[derive(Deserialize, Clone)]
struct Match {
    ts: String,
    text: String,
    user: Option<String>,
    username: Option<String>,
    channel: Channel,
    permalink: String,
    #[serde(default)]
    attachments: Vec<Attachment>,
    #[serde(default)]
    blocks: Vec<serde_json::Value>,
}

impl Match {
    /// The message's words. Apps (Linear, GitHub, …) often post with an empty `text` and put
    /// everything in attachments or blocks, so fall back to those.
    fn body(&self) -> String {
        if !self.text.trim().is_empty() {
            return self.text.clone();
        }
        let from_attachments = self
            .attachments
            .iter()
            .flat_map(|a| [&a.pretext, &a.title, &a.text, &a.fallback])
            .flatten()
            .find(|text| !text.trim().is_empty());
        if let Some(text) = from_attachments {
            return text.clone();
        }
        let mut parts = Vec::new();
        for block in &self.blocks {
            block_text(block, &mut parts);
        }
        parts.join(" ")
    }
}

/// Every `"text": "<string>"` in a block tree — section / header text and rich-text runs.
fn block_text(value: &serde_json::Value, out: &mut Vec<String>) {
    match value {
        serde_json::Value::Object(map) => {
            for (key, child) in map {
                match child {
                    serde_json::Value::String(text) if key == "text" => out.push(text.clone()),
                    _ => block_text(child, out),
                }
            }
        }
        serde_json::Value::Array(children) => {
            for child in children {
                block_text(child, out);
            }
        }
        _ => {}
    }
}

#[derive(Deserialize, Clone)]
struct Attachment {
    pretext: Option<String>,
    title: Option<String>,
    text: Option<String>,
    fallback: Option<String>,
}

#[derive(Deserialize, Clone)]
struct Channel {
    id: String,
    name: Option<String>,
    #[serde(default)]
    is_im: bool,
    #[serde(default)]
    is_mpim: bool,
}

#[derive(Deserialize)]
struct ConversationsPage {
    channels: Vec<ConversationId>,
    response_metadata: Option<ResponseMetadata>,
}

#[derive(Deserialize)]
struct ConversationId {
    id: String,
}

#[derive(Deserialize)]
struct ResponseMetadata {
    next_cursor: Option<String>,
}

/// What one poll's searches found (each newest first).
struct Found {
    dms: Vec<Match>,
    mentions: Vec<Match>,
    broadcasts: Vec<Match>,
}

#[derive(Deserialize)]
struct InfoResponse {
    channel: ConversationInfo,
}

#[derive(Deserialize)]
struct ConversationInfo {
    last_read: Option<String>,
}

/// The Incoming items from Slack's answers (results are newest first):
/// - per DM conversation, one item when its unread messages (after your `last_read`, not your
///   own) include one older than the grace period — shown with the newest unread message;
/// - every mention of you since `since` — `<@you>`, or a broadcast whose markup really is
///   `<!here>` / `<!channel>` / `<!everyone>` (the search also hits the plain words) in a
///   conversation you're a member of — once each, except in a conversation that already has
///   an unread-DM item.
fn items(
    me: &str,
    since: DateTime<Utc>,
    now: DateTime<Utc>,
    found: Found,
    member_of: &HashSet<String>,
    last_read: &HashMap<String, String>,
) -> Vec<IncomingItem> {
    let grace_cutoff = now - Duration::minutes(UNREAD_GRACE_MINUTES);
    let mut items = Vec::new();
    let mut flagged = HashSet::new();

    let mut by_channel: Vec<(String, Vec<Match>)> = Vec::new();
    for m in found.dms {
        match by_channel.iter_mut().find(|(id, _)| *id == m.channel.id) {
            Some((_, messages)) => messages.push(m),
            None => by_channel.push((m.channel.id.clone(), vec![m])),
        }
    }
    for (channel, messages) in by_channel {
        // Unknown read position → can't tell what's unread, so stay quiet.
        let Some(read_up_to) = last_read.get(&channel).and_then(|ts| ts_seconds(ts)) else {
            continue;
        };
        let unread: Vec<&Match> = messages
            .iter()
            .filter(|m| m.user.as_deref() != Some(me))
            .filter(|m| ts_seconds(&m.ts).is_some_and(|ts| ts > read_up_to))
            .collect();
        let (Some(newest), Some(oldest)) = (unread.first(), unread.last()) else {
            continue;
        };
        // A time Slack didn't give counts as recent, so it never jumps the grace period.
        if ts_time(&oldest.ts).map_or(true, |t| t > grace_cutoff) {
            continue;
        }
        let who = newest.username.clone().unwrap_or_else(|| "someone".into());
        let reason = match unread.len() {
            1 => "unread".to_string(),
            count => format!("{count} unread"),
        };
        items.push(item(
            newest,
            me,
            format!("dm:{channel}"),
            &reason,
            who,
            true,
        ));
        flagged.insert(channel);
    }

    let direct = found
        .mentions
        .into_iter()
        .map(|m| ("mentioned".to_string(), m));
    let broadcasts = found.broadcasts.into_iter().filter_map(|m| {
        let (word, _) = BROADCASTS
            .iter()
            .find(|(_, markup)| m.body().contains(markup))?;
        member_of
            .contains(&m.channel.id)
            .then(|| (word.to_string(), m))
    });
    let mut seen = HashSet::new();
    for (reason, m) in direct.chain(broadcasts) {
        let fresh = ts_time(&m.ts).is_some_and(|t| t >= since);
        if !fresh || m.user.as_deref() == Some(me) || flagged.contains(&m.channel.id) {
            continue;
        }
        let id = format!("{}:{}", m.channel.id, m.ts);
        if !seen.insert(id.clone()) {
            continue;
        }
        let who = m.username.clone().unwrap_or_else(|| "someone".into());
        let context = match &m.channel.name {
            Some(name) if !m.channel.is_im && !m.channel.is_mpim => format!("#{name} · {who}"),
            _ => who,
        };
        items.push(item(&m, me, id, &reason, context, false));
    }
    items
}

fn item(
    m: &Match,
    me: &str,
    id: String,
    reason: &str,
    context: String,
    urgent: bool,
) -> IncomingItem {
    IncomingItem {
        id: IncomingSource::Slack.item_id(&id),
        source: IncomingSource::Slack,
        reason: reason.to_string(),
        title: clean_text(&m.body(), me),
        context,
        url: m.permalink.clone(),
        updated_at: ts_time(&m.ts)
            .map(|t| t.to_rfc3339_opts(SecondsFormat::Secs, true))
            .unwrap_or_default(),
        urgent,
    }
}

/// A Slack `ts` (`"1697040000.123456"`) as a number, for ordering against `last_read`.
fn ts_seconds(ts: &str) -> Option<f64> {
    ts.parse::<f64>().ok()
}

/// A Slack `ts` as a time (whole seconds).
fn ts_time(ts: &str) -> Option<DateTime<Utc>> {
    let seconds = ts.split('.').next()?.parse::<i64>().ok()?;
    DateTime::from_timestamp(seconds, 0)
}

/// Slack's message markup as plain text: `<@U1|ada>` → `@ada`, your own id → `@you`,
/// `<#C1|general>` → `#general`, `<https://x|label>` → `label`, `<!here>` → `@here`;
/// whitespace collapsed and the result cut to [`TITLE_CHARS`].
fn clean_text(text: &str, me: &str) -> String {
    let mut out = String::new();
    let mut rest = text;
    while let Some(start) = rest.find('<') {
        out.push_str(&rest[..start]);
        let Some(end) = rest[start..].find('>') else {
            out.push_str(&rest[start..]);
            rest = "";
            break;
        };
        let inner = &rest[start + 1..start + end];
        let (target, label) = match inner.split_once('|') {
            Some((target, label)) => (target, Some(label)),
            None => (inner, None),
        };
        let rendered = if let Some(user) = target.strip_prefix('@') {
            if user == me {
                "@you".to_string()
            } else {
                format!("@{}", label.unwrap_or("someone"))
            }
        } else if target.starts_with('#') {
            format!("#{}", label.unwrap_or("channel"))
        } else if let Some(special) = target.strip_prefix('!') {
            format!(
                "@{}",
                label.unwrap_or(special.split('^').next().unwrap_or(special))
            )
        } else {
            label.unwrap_or(target).to_string()
        };
        out.push_str(&rendered);
        rest = &rest[start + end + 1..];
    }
    out.push_str(rest);
    let flat = out
        .replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ");
    if flat.chars().count() <= TITLE_CHARS {
        return flat;
    }
    let cut: String = flat.chars().take(TITLE_CHARS).collect();
    format!("{}…", cut.trim_end())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn message(channel: &str, ts: &str, user: &str) -> Match {
        Match {
            ts: ts.into(),
            text: format!("hi from {user}"),
            user: Some(user.into()),
            username: Some(user.into()),
            channel: Channel {
                id: channel.into(),
                name: Some("general".into()),
                is_im: channel.starts_with('D'),
                is_mpim: false,
            },
            permalink: format!("https://acme.slack.com/archives/{channel}/p{ts}"),
            attachments: Vec::new(),
            blocks: Vec::new(),
        }
    }

    fn at(seconds: i64) -> DateTime<Utc> {
        DateTime::from_timestamp(seconds, 0).expect("time")
    }

    #[test]
    fn markup_becomes_plain_text() {
        let text =
            "Hey <@UME> and <@U2|ada>, see <#C1|general> &amp; <https://x.io|the doc> <!here>";
        assert_eq!(
            clean_text(text, "UME"),
            "Hey @you and @ada, see #general & the doc @here"
        );
    }

    #[test]
    fn app_messages_fall_back_to_attachments_then_blocks() {
        let empty = Match {
            text: " ".into(),
            ..message("D1", "1.1", "linear")
        };
        let attached = Match {
            attachments: vec![Attachment {
                pretext: None,
                title: Some("ENG-12 Cuisine tag rule".into()),
                text: Some("details".into()),
                fallback: Some("fallback".into()),
            }],
            ..empty.clone()
        };
        assert_eq!(attached.body(), "ENG-12 Cuisine tag rule");
        let blocks = Match {
            blocks: vec![serde_json::json!({
                "type": "rich_text",
                "elements": [{ "type": "rich_text_section", "elements": [
                    { "type": "text", "text": "Deploy" },
                    { "type": "user", "user_id": "UME" },
                    { "type": "text", "text": "failed" },
                ]}],
            })],
            ..empty
        };
        assert_eq!(blocks.body(), "Deploy failed");
    }

    #[test]
    fn unread_dms_wait_out_the_grace_period_and_read_ones_never_show() {
        let now = at(10_000);
        let last_read = HashMap::from([
            ("D1".to_string(), "5000.0".to_string()), // two unread, oldest 6000 → old enough
            ("D2".to_string(), "9500.0".to_string()), // unread 9800 → still within 30 min
            ("D3".to_string(), "9999.0".to_string()), // everything read
        ]);
        let dms = vec![
            message("D1", "7000.1", "ada"),
            message("D1", "6000.1", "ada"),
            message("D1", "4000.1", "ada"),
            message("D2", "9800.1", "bob"),
            message("D3", "8000.1", "cy"),
            message("D4", "3000.1", "dee"), // no read position → skipped
        ];
        let found = Found {
            dms,
            mentions: Vec::new(),
            broadcasts: Vec::new(),
        };
        let items = items("ME", at(0), now, found, &HashSet::new(), &last_read);
        let ids: Vec<&str> = items.iter().map(|i| i.id.as_str()).collect();
        assert_eq!(ids, ["slack:dm:D1"]);
        assert_eq!(items[0].reason, "2 unread");
        assert_eq!(items[0].title, "hi from ada");
        assert!(items[0].urgent);
    }

    #[test]
    fn mentions_always_show_except_own_old_or_already_flagged() {
        let now = at(10_000);
        let last_read = HashMap::from([("D1".to_string(), "0.0".to_string())]);
        let dms = vec![message("D1", "1000.1", "ada")];
        let mentions = vec![
            message("C1", "2800.1", "bob"),
            message("C2", "2900.1", "ME"),
            message("C3", "100.1", "cy"),
            message("D1", "1000.1", "ada"),
        ];
        let found = Found {
            dms,
            mentions,
            broadcasts: Vec::new(),
        };
        let items = items("ME", at(500), now, found, &HashSet::new(), &last_read);
        let ids: Vec<&str> = items.iter().map(|i| i.id.as_str()).collect();
        assert_eq!(ids, ["slack:dm:D1", "slack:C1:2800.1"]);
        assert_eq!(items[1].context, "#general · bob");
        assert!(!items[1].urgent);
    }

    #[test]
    fn broadcasts_count_only_as_real_markup_in_your_channels_and_once() {
        let with_text = |channel: &str, ts: &str, text: &str| Match {
            text: text.into(),
            ..message(channel, ts, "bob")
        };
        let found = Found {
            dms: Vec::new(),
            mentions: vec![with_text("C1", "2000.1", "<@ME> and <!here>")],
            broadcasts: vec![
                with_text("C1", "2000.1", "<@ME> and <!here>"), // already a direct mention
                with_text("C1", "2100.1", "<!channel> deploy freeze"),
                with_text("C2", "2200.1", "<!here|here> standup"), // not your channel
                with_text("C1", "2300.1", "I'm here now"),         // the plain word, no markup
            ],
        };
        let member_of = HashSet::from(["C1".to_string()]);
        let items = items("ME", at(0), at(10_000), found, &member_of, &HashMap::new());
        let reasons: Vec<(&str, &str)> = items
            .iter()
            .map(|i| (i.id.as_str(), i.reason.as_str()))
            .collect();
        assert_eq!(
            reasons,
            [
                ("slack:C1:2000.1", "mentioned"),
                ("slack:C1:2100.1", "@channel")
            ]
        );
    }
}
