//! The interface every synced repository implements. Each synced row carries a Hybrid
//! Logical Clock (`hlc_physical` / `hlc_counter` / `hlc_node_id`) and a `dirty` flag; this
//! trait is how the sync loop and the services stamp, push, and acknowledge those rows
//! without knowing which table they live in. Each repository implements it against its own
//! table only.

use crate::core::error::AppResult;
use crate::core::wire::LocalChange;

pub trait SyncedRepository {
    /// Every row with unsynced local changes (tombstones included), ready to push.
    fn list_dirty(&self) -> AppResult<Vec<LocalChange>>;

    /// Clear the dirty flag on rows that were just pushed — only where the clock still
    /// matches, so a local edit made mid-push isn't lost.
    fn clear_dirty(&self, changes: &[LocalChange]) -> AppResult<()>;

    /// Record that a row changed locally: write its clock stamp and mark it dirty.
    fn record_change(&self, id: &str, physical: i64, counter: i64, node_id: &str) -> AppResult<()>;
}
