//! The interface every Incoming source implements (GitHub, Linear, Slack, Better Stack). A
//! provider reads its source and maps what's there into [`IncomingItem`]s, and says
//! how it's connected and as whom; the
//! [`crate::services::incoming_service::IncomingService`] merges every provider's items,
//! applies the archive, and owns the feed. Adding a source = a provider that implements this,
//! registered in `lib.rs` — nothing else in Incoming or Settings changes.

use std::future::Future;
use std::pin::Pin;
use std::task::{Context, Poll};

use chrono::{DateTime, Utc};

use crate::core::error::{AppError, AppResult};
use crate::core::models::{IncomingItem, IncomingSource, SourceConnection};

/// A boxed future, so the trait stays usable as `dyn IncomingProvider` while HTTP-based
/// sources can `await`.
pub type BoxFuture<'a, T> = Pin<Box<dyn Future<Output = T> + Send + 'a>>;

pub trait IncomingProvider: Send + Sync {
    fn source(&self) -> IncomingSource;

    /// The items that want something from you and changed at or after `since`. Read-only:
    /// a provider never marks anything read or done at its source. A source you haven't
    /// connected returns no items rather than an error.
    fn fetch(&self, since: DateTime<Utc>) -> BoxFuture<'_, AppResult<Vec<IncomingItem>>>;

    /// How it's connected and as whom, checked live against the source (so a revoked key
    /// shows as a problem, not as "connected").
    fn connection(&self) -> BoxFuture<'_, SourceConnection>;

    /// Connect (or replace the credential) with a pasted key, checked before it's kept.
    /// Sources signed in outside Blink (GitHub via `gh`) refuse.
    fn connect_with_key(&self, _key: String) -> BoxFuture<'_, AppResult<()>> {
        let source = self.source().display_name();
        Box::pin(async move {
            Err(AppError::Incoming(format!(
                "{source} is signed in outside Blink"
            )))
        })
    }

    /// Forget the credential Blink keeps for this source.
    fn disconnect(&self) -> AppResult<()> {
        Err(AppError::Incoming(format!(
            "{} is signed in outside Blink",
            self.source().display_name()
        )))
    }
}

/// Run every future at once and return their outputs in order — a minimal `join_all` (the
/// tree has no futures crate). A source that blocks (the `gh` CLI) still holds the others up
/// while it runs, but the HTTP sources wait on their requests side by side instead of one
/// after another.
pub fn join_all<'a, T>(futures: Vec<BoxFuture<'a, T>>) -> JoinAll<'a, T> {
    let done = futures.iter().map(|_| None).collect();
    JoinAll { pending: futures.into_iter().map(Some).collect(), done }
}

pub struct JoinAll<'a, T> {
    pending: Vec<Option<BoxFuture<'a, T>>>,
    done: Vec<Option<T>>,
}

impl<T> Future for JoinAll<'_, T> {
    type Output = Vec<T>;

    fn poll(self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Vec<T>> {
        let this = self.get_mut();
        for (slot, out) in this.pending.iter_mut().zip(this.done.iter_mut()) {
            if let Some(future) = slot {
                if let Poll::Ready(value) = future.as_mut().poll(cx) {
                    *out = Some(value);
                    *slot = None;
                }
            }
        }
        if this.pending.iter().all(Option::is_none) {
            Poll::Ready(this.done.iter_mut().filter_map(Option::take).collect())
        } else {
            Poll::Pending
        }
    }
}
