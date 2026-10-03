//! The device's Hybrid Logical Clock.
//!
//! [`HlcService`] owns the clock (node id + last stamp) and mints stamps via
//! [`HlcService::next`]. It fronts the [`SyncStateRepository`] where the node id and
//! last stamp are persisted, so the stamp survives restarts and never regresses. Services
//! call [`HlcService::stamp`] after a write, which writes a fresh stamp onto the changed
//! rows (through their [`SyncedRepository`]) for the sync loop to push.

use std::sync::Mutex;

use chrono::Utc;
use uuid::Uuid;

use crate::core::error::{AppError, AppResult};
use crate::core::synced_repository::SyncedRepository;
use crate::repository::{SyncStateRepository};

const NODE_ID_KEY: &str = "node_id";
const LAST_PHYSICAL_KEY: &str = "hlc_last_physical";
const LAST_COUNTER_KEY: &str = "hlc_last_counter";

/// A Hybrid Logical Clock stamp for one edit: `(physical, counter)` compared
/// lexicographically, with `node_id` the final cross-device tiebreaker. The clock's
/// own type — repositories write its raw fields, they don't depend on it.
pub struct Hlc {
    pub physical: i64,
    pub counter: i64,
    pub node_id: String,
}

struct ClockState {
    last_physical: i64,
    last_counter: i64,
}

pub struct HlcService {
    sync_state_repository: SyncStateRepository,
    node_id: String,
    state: Mutex<ClockState>,
}

impl HlcService {
    /// Load the node id (generated once on first run) and the last stamp from
    /// `sync_state`. Requires the DB to be migrated (the `sync_state` table exists).
    pub fn new(sync_state_repository: SyncStateRepository) -> AppResult<Self> {
        let node_id = match sync_state_repository.get(NODE_ID_KEY)? {
            Some(id) => id,
            None => {
                let id = Uuid::new_v4().to_string();
                sync_state_repository.set(NODE_ID_KEY, &id)?;
                id
            }
        };
        let last_physical = sync_state_repository
            .get(LAST_PHYSICAL_KEY)?
            .and_then(|v| v.parse().ok())
            .unwrap_or(0);
        let last_counter = sync_state_repository
            .get(LAST_COUNTER_KEY)?
            .and_then(|v| v.parse().ok())
            .unwrap_or(0);
        Ok(Self {
            sync_state_repository,
            node_id,
            state: Mutex::new(ClockState {
                last_physical,
                last_counter,
            }),
        })
    }

    /// Mint the next stamp for a local edit and persist it. The stamp only ever moves
    /// forward: it takes the wall clock unless that would go backward, in which case
    /// the physical time holds and the counter bumps.
    pub fn next(&self) -> AppResult<Hlc> {
        let now = Utc::now().timestamp_millis();
        let mut state = self
            .state
            .lock()
            .map_err(|e| AppError::Store(format!("clock poisoned: {e}")))?;

        let physical = now.max(state.last_physical);
        let counter = if physical == state.last_physical {
            state.last_counter + 1
        } else {
            0
        };
        state.last_physical = physical;
        state.last_counter = counter;

        self.sync_state_repository
            .set(LAST_PHYSICAL_KEY, &physical.to_string())?;
        self.sync_state_repository
            .set(LAST_COUNTER_KEY, &counter.to_string())?;

        Ok(Hlc {
            physical,
            counter,
            node_id: self.node_id.clone(),
        })
    }

    /// Mark rows of one table as locally changed: write one fresh stamp onto each and flag
    /// them dirty, so the sync loop pushes them. Distinct rows may share a stamp.
    pub fn stamp<I, S>(&self, repository: &impl SyncedRepository, ids: I) -> AppResult<()>
    where
        I: IntoIterator<Item = S>,
        S: AsRef<str>,
    {
        let mut ids = ids.into_iter().peekable();
        if ids.peek().is_none() {
            return Ok(());
        }
        let hlc = self.next()?;
        for id in ids {
            repository.record_change(id.as_ref(), hlc.physical, hlc.counter, &hlc.node_id)?;
        }
        Ok(())
    }
}
