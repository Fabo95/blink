//! "What left this Mac": [`EgressService`] records every AI call and page fetch (kind,
//! destination host, size; never the content) and lists them for the Home page. The first
//! question every security review asks, answered from the device itself.

use crate::core::error::AppResult;
use crate::core::models::{EgressEvent, EgressKind};
use crate::repository::EgressEventsRepository;

/// Where AI calls go. One provider today (bring-your-own OpenAI key).
pub const AI_DESTINATION: &str = "api.openai.com";

/// The Home card shows a recent window, not the whole history.
const RECENT_LIMIT: i64 = 50;

pub struct EgressService {
    egress_events_repository: EgressEventsRepository,
}

impl EgressService {
    pub fn new(egress_events_repository: EgressEventsRepository) -> Self {
        Self { egress_events_repository }
    }

    pub fn record(
        &self,
        kind: EgressKind,
        destination: &str,
        note_id: Option<&str>,
        bytes: usize,
    ) -> AppResult<()> {
        self.egress_events_repository.insert(
            kind,
            destination,
            note_id,
            i64::try_from(bytes).unwrap_or(i64::MAX),
        )
    }

    pub fn recent(&self) -> AppResult<Vec<EgressEvent>> {
        self.egress_events_repository.list_recent(RECENT_LIMIT)
    }
}
