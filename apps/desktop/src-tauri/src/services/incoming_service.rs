//! The Incoming feed: what external sources want from you right now, in one list. It knows no
//! source itself: each poll asks every [`IncomingProvider`] (GitHub, Slack, …) for its items,
//! merges them newest first, drops what you archived (unless it changed since), and caches the
//! result for the webview.
//!
//! Read-only at the source: nothing is ever marked read there, and reading something there
//! doesn't hide it here — Blink is where you work it off. An item leaves the feed when you
//! archive it (its `updated_at` goes into [`IncomingDismissalsRepository`]; a newer update
//! brings it back), turn it into a task, or it ages past [`MAX_AGE_DAYS`].

use std::sync::{Arc, Mutex, MutexGuard};

use chrono::{Duration, Utc};

use crate::core::error::{AppError, AppResult};
use crate::core::incoming_provider::{join_all, IncomingProvider};
use crate::core::models::{
    CaptureSource, IncomingFeed, IncomingItem, IncomingSource, NewTask, SourceConnection,
};
use crate::repository::IncomingDismissalsRepository;

/// Items not updated for this long drop out: anything older that still matters has long
/// been handled elsewhere.
const MAX_AGE_DAYS: i64 = 14;

#[derive(Clone)]
pub struct IncomingService {
    providers: Vec<Arc<dyn IncomingProvider>>,
    incoming_dismissals_repository: IncomingDismissalsRepository,
    /// The last poll's result, so the webview can read it without hitting the network.
    feed: Arc<Mutex<IncomingFeed>>,
}

impl IncomingService {
    pub fn new(
        providers: Vec<Arc<dyn IncomingProvider>>,
        incoming_dismissals_repository: IncomingDismissalsRepository,
    ) -> Self {
        Self {
            providers,
            incoming_dismissals_repository,
            feed: Arc::new(Mutex::new(IncomingFeed::default())),
        }
    }

    /// The feed as of the last poll.
    pub fn current(&self) -> AppResult<IncomingFeed> {
        Ok(self.lock()?.clone())
    }

    // ── sources ───────────────────────────────────────────────────────────────────────

    /// Every source's live connection (who, how, any problem), in registration order.
    pub async fn connections(&self) -> Vec<SourceConnection> {
        join_all(self.providers.iter().map(|provider| provider.connection()).collect()).await
    }

    /// Connect `source` with a pasted key (or replace its key).
    pub async fn connect_with_key(&self, source: IncomingSource, key: String) -> AppResult<()> {
        self.provider(source)?.connect_with_key(key).await
    }

    /// Forget the credential Blink keeps for `source`.
    pub fn disconnect(&self, source: IncomingSource) -> AppResult<()> {
        self.provider(source)?.disconnect()
    }

    fn provider(&self, source: IncomingSource) -> AppResult<&Arc<dyn IncomingProvider>> {
        self.providers
            .iter()
            .find(|provider| provider.source() == source)
            .ok_or_else(|| AppError::Incoming(format!("{} isn't set up", source.display_name())))
    }

    /// Ask every provider (all at once), apply the archive, and cache + return the feed
    /// (newest first). A provider that fails adds an error line; the others' items still show.
    pub async fn refresh(&self) -> AppResult<IncomingFeed> {
        let since = Utc::now() - Duration::days(MAX_AGE_DAYS);
        let mut items = Vec::new();
        let mut errors = Vec::new();
        let mut failed = Vec::new();
        let fetched =
            join_all(self.providers.iter().map(|provider| provider.fetch(since)).collect()).await;
        for (provider, result) in self.providers.iter().zip(fetched) {
            match result {
                Ok(fetched) => items.extend(fetched),
                Err(err) => {
                    errors.push(format!("{}: {err}", provider.source().display_name()));
                    failed.push(provider.source());
                }
            }
        }

        let dismissed = self.incoming_dismissals_repository.all()?;
        // Forget archives whose item left its source, but never for a source that failed to
        // answer — that would resurrect its archived items on the next good poll.
        let keep: Vec<String> = dismissed
            .keys()
            .filter(|id| {
                items.iter().any(|item| &item.id == *id)
                    || failed.iter().any(|source| is_from(id, *source))
            })
            .cloned()
            .collect();
        self.incoming_dismissals_repository.retain(&keep)?;

        items.retain(|item| {
            dismissed
                .get(&item.id)
                .map_or(true, |archived_at| item.updated_at > *archived_at)
        });
        items.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));

        let feed = IncomingFeed { items, errors };
        *self.lock()? = feed.clone();
        Ok(feed)
    }

    /// Hide an item until it changes at the source. Returns the updated feed.
    pub fn archive(&self, id: &str) -> AppResult<IncomingFeed> {
        let mut feed = self.lock()?;
        let updated_at = find(&feed, id)?.updated_at.clone();
        self.incoming_dismissals_repository
            .dismiss(id, &updated_at)?;
        feed.items.retain(|item| item.id != id);
        Ok(feed.clone())
    }

    /// The task an item becomes: its title, linked back to the source.
    pub fn task_for(&self, id: &str) -> AppResult<NewTask> {
        let feed = self.lock()?;
        let item = find(&feed, id)?;
        Ok(NewTask {
            text: item.title.clone(),
            raw_text: item.title.clone(),
            improved: false,
            link: Some(item.url.clone()),
            task_group_id: None,
            source: CaptureSource {
                app_id: item.source.as_str().to_string(),
                app_name: item.source.display_name().to_string(),
                window_title: item.context.clone(),
                captured_at: Utc::now().to_rfc3339(),
            },
            origin_note_id: None,
        })
    }

    fn lock(&self) -> AppResult<MutexGuard<'_, IncomingFeed>> {
        self.feed
            .lock()
            .map_err(|_| AppError::Incoming("incoming feed lock poisoned".into()))
    }
}

fn find<'a>(feed: &'a IncomingFeed, id: &str) -> AppResult<&'a IncomingItem> {
    feed.items
        .iter()
        .find(|item| item.id == id)
        .ok_or_else(|| AppError::Incoming(format!("no incoming item {id}")))
}

fn is_from(id: &str, source: IncomingSource) -> bool {
    id.strip_prefix(source.as_str())
        .is_some_and(|rest| rest.starts_with(':'))
}

#[cfg(test)]
mod tests {
    use std::future::Future;
    use std::task::{Context, Poll, RawWaker, RawWakerVTable, Waker};

    use chrono::DateTime;

    use super::*;
    use crate::core::incoming_provider::BoxFuture;
    use crate::core::models::SourceAuth;
    use crate::database::Db;
    use crate::repository::Repository;

    struct Fake {
        source: IncomingSource,
        items: Option<Vec<IncomingItem>>,
    }

    impl IncomingProvider for Fake {
        fn source(&self) -> IncomingSource {
            self.source
        }
        fn fetch(&self, _since: DateTime<Utc>) -> BoxFuture<'_, AppResult<Vec<IncomingItem>>> {
            let result = self
                .items
                .clone()
                .ok_or_else(|| AppError::Incoming("offline".into()));
            Box::pin(async move { result })
        }
        fn connection(&self) -> BoxFuture<'_, SourceConnection> {
            let connection = SourceConnection {
                source: self.source,
                auth: SourceAuth::ApiKey,
                connected: self.items.is_some(),
                account: None,
                credential_hint: None,
                problem: None,
            };
            Box::pin(async move { connection })
        }
    }

    fn item(source: IncomingSource, id: &str, updated_at: &str) -> IncomingItem {
        IncomingItem {
            id: source.item_id(id),
            source,
            reason: "mentioned".into(),
            title: format!("item {id}"),
            context: "ctx".into(),
            url: "https://example.com".into(),
            updated_at: updated_at.into(),
            urgent: false,
        }
    }

    fn fake(source: IncomingSource, items: Option<Vec<IncomingItem>>) -> Arc<dyn IncomingProvider> {
        Arc::new(Fake { source, items })
    }

    impl IncomingService {
        /// Drives `refresh` to completion. The fakes never actually wait, so polling with a
        /// no-op waker until ready is enough — no async runtime in unit tests.
        fn refresh_now(&self) -> IncomingFeed {
            let mut future = std::pin::pin!(self.refresh());
            // SAFETY: every vtable entry ignores the (null) data pointer.
            let waker = unsafe { Waker::from_raw(noop_raw_waker()) };
            let mut cx = Context::from_waker(&waker);
            loop {
                if let Poll::Ready(feed) = future.as_mut().poll(&mut cx) {
                    return feed.expect("refresh");
                }
            }
        }
    }

    fn noop_raw_waker() -> RawWaker {
        fn no_op(_: *const ()) {}
        fn clone(_: *const ()) -> RawWaker {
            noop_raw_waker()
        }
        static VTABLE: RawWakerVTable = RawWakerVTable::new(clone, no_op, no_op, no_op);
        RawWaker::new(std::ptr::null(), &VTABLE)
    }

    fn service(providers: Vec<Arc<dyn IncomingProvider>>) -> IncomingService {
        let repository = Repository::new(Arc::new(Db::open_in_memory().expect("db")));
        IncomingService::new(providers, repository.incoming_dismissals)
    }

    #[test]
    fn merges_sources_newest_first_and_reports_a_failing_one() {
        let github = IncomingSource::Github;
        let slack = IncomingSource::Slack;
        let incoming = service(vec![
            fake(
                github,
                Some(vec![item(github, "1", "2026-10-01T00:00:00Z")]),
            ),
            fake(slack, Some(vec![item(slack, "a", "2026-10-02T00:00:00Z")])),
            fake(IncomingSource::Linear, None),
        ]);
        let feed = incoming.refresh_now();
        let ids: Vec<&str> = feed.items.iter().map(|i| i.id.as_str()).collect();
        assert_eq!(ids, ["slack:a", "github:1"]);
        assert_eq!(feed.errors, ["Linear: incoming error: offline"]);
    }

    #[test]
    fn an_archived_item_stays_hidden_until_it_changes() {
        let github = IncomingSource::Github;
        let first = item(github, "1", "2026-10-01T00:00:00Z");
        let incoming = service(vec![fake(github, Some(vec![first]))]);
        incoming.refresh_now();
        assert!(incoming
            .archive("github:1")
            .expect("archive")
            .items
            .is_empty());
        assert!(incoming.refresh_now().items.is_empty());

        let updated = item(github, "1", "2026-10-03T00:00:00Z");
        let changed = service(vec![fake(github, Some(vec![updated]))]);
        changed
            .incoming_dismissals_repository
            .dismiss("github:1", "2026-10-01T00:00:00Z")
            .expect("dismiss");
        assert_eq!(changed.refresh_now().items.len(), 1);
    }

    #[test]
    fn a_failing_source_keeps_its_archive() {
        let incoming = service(vec![fake(IncomingSource::Slack, None)]);
        let dismissals = &incoming.incoming_dismissals_repository;
        dismissals
            .dismiss("slack:a", "2026-10-01T00:00:00Z")
            .expect("dismiss");
        incoming.refresh_now();
        assert!(dismissals.all().expect("all").contains_key("slack:a"));
    }
}
