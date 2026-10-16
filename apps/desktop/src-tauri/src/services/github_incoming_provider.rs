//! GitHub as an Incoming source: your notifications (read and unread) via [`GitHubCli`],
//! keeping only the reasons that ask something of you. Uses `gh`'s own login, so there's
//! nothing to configure in Blink.

use chrono::{DateTime, Utc};

use crate::clients::github_cli::{GitHubCli, NotificationRow};
use crate::core::error::AppResult;
use crate::core::incoming_provider::{BoxFuture, IncomingProvider};
use crate::core::models::{
    IncomingItem, IncomingSource, SourceAccount, SourceAuth, SourceConnection,
};

#[derive(Clone)]
pub struct GitHubIncomingProvider {
    github_cli: GitHubCli,
}

impl GitHubIncomingProvider {
    pub fn new(github_cli: GitHubCli) -> Self {
        Self { github_cli }
    }
}

impl IncomingProvider for GitHubIncomingProvider {
    fn source(&self) -> IncomingSource {
        IncomingSource::Github
    }

    fn fetch(&self, since: DateTime<Utc>) -> BoxFuture<'_, AppResult<Vec<IncomingItem>>> {
        // `Z` form, not `+00:00`: a `+` in the query string would decode to a space.
        let since = since.format("%Y-%m-%dT%H:%M:%SZ").to_string();
        Box::pin(async move {
            let rows = self.github_cli.notifications(&since)?;
            Ok(rows.into_iter().filter_map(github_item).collect())
        })
    }

    fn connection(&self) -> BoxFuture<'_, SourceConnection> {
        Box::pin(async move {
            let (account, problem) = match self.github_cli.user() {
                Ok(user) => (
                    Some(SourceAccount {
                        name: user
                            .name
                            .filter(|n| !n.trim().is_empty())
                            .unwrap_or(user.login.clone()),
                        handle: Some(format!("@{}", user.login)),
                        organization: user.company.map(|c| c.trim().to_string()),
                        avatar_url: user.avatar_url,
                    }),
                    None,
                ),
                Err(err) => (None, Some(format!("{err} — sign in with `gh auth login`"))),
            };
            SourceConnection {
                source: IncomingSource::Github,
                auth: SourceAuth::GhCli,
                connected: account.is_some(),
                account,
                credential_hint: Some("gh CLI · github.com".into()),
                problem,
            }
        })
    }
}

/// A GitHub notification as an Incoming item, or `None` when its reason doesn't ask anything
/// of you (a merge/close you were only watching, a subscription).
fn github_item(row: NotificationRow) -> Option<IncomingItem> {
    let reason = match row.reason.as_str() {
        "review_requested" => "review requested",
        "mention" | "team_mention" => "mentioned",
        "assign" => "assigned",
        "author" => "on your PR",
        "comment" => "new comment",
        "ci_activity" => "CI",
        _ => return None,
    };
    let url = row
        .subject
        .url
        .as_deref()
        .and_then(html_url)
        .unwrap_or_else(|| row.repository.html_url.clone());
    Some(IncomingItem {
        id: IncomingSource::Github.item_id(&row.id),
        source: IncomingSource::Github,
        reason: reason.to_string(),
        title: row.subject.title,
        context: row.repository.full_name,
        url,
        updated_at: row.updated_at,
        urgent: false,
    })
}

/// The browser URL for a GitHub API URL of a PR or issue
/// (`api.github.com/repos/o/r/pulls/1` → `github.com/o/r/pull/1`).
fn html_url(api_url: &str) -> Option<String> {
    let path = api_url.strip_prefix("https://api.github.com/repos/")?;
    let path = match path.split_once("/pulls/") {
        Some((repo, number)) => format!("{repo}/pull/{number}"),
        None => path.to_string(),
    };
    Some(format!("https://github.com/{path}"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::clients::github_cli::{NotificationRepository, NotificationSubject};

    fn row(reason: &str, url: Option<&str>) -> NotificationRow {
        NotificationRow {
            id: "42".into(),
            reason: reason.into(),
            updated_at: "2026-10-01T10:00:00Z".into(),
            subject: NotificationSubject {
                title: "Fix login".into(),
                url: url.map(str::to_string),
            },
            repository: NotificationRepository {
                full_name: "acme/app".into(),
                html_url: "https://github.com/acme/app".into(),
            },
        }
    }

    #[test]
    fn keeps_actionable_reasons_and_links_to_the_browser_page() {
        let item = github_item(row(
            "review_requested",
            Some("https://api.github.com/repos/acme/app/pulls/7"),
        ))
        .expect("kept");
        assert_eq!(item.id, "github:42");
        assert_eq!(item.reason, "review requested");
        assert_eq!(item.url, "https://github.com/acme/app/pull/7");

        let issue = github_item(row(
            "mention",
            Some("https://api.github.com/repos/acme/app/issues/3"),
        ))
        .expect("kept");
        assert_eq!(issue.url, "https://github.com/acme/app/issues/3");

        let ci = github_item(row("ci_activity", None)).expect("kept");
        assert_eq!(ci.url, "https://github.com/acme/app");
    }

    #[test]
    fn drops_reasons_that_ask_nothing_of_you() {
        assert!(github_item(row("state_change", None)).is_none());
        assert!(github_item(row("subscribed", None)).is_none());
    }
}
