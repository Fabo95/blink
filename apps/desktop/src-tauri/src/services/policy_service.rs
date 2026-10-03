//! The sensitivity gate. [`PolicyService`] decides whether note content may leave the
//! device (AI calls) or appear in a bulk export, based on the note's topic. Every path that
//! sends or exports note content asks it first, so the rule lives in one place in the core
//! and can't be skipped by a UI that forgets to hide a shortcut.

use crate::core::error::{AppError, AppResult};
use crate::core::models::Sensitivity;
use crate::repository::TopicRepository;

pub struct PolicyService {
    topic_repository: TopicRepository,
}

impl PolicyService {
    pub fn new(topic_repository: TopicRepository) -> Self {
        Self { topic_repository }
    }

    /// The sensitivity governing a note filed under `topic_id`. Unfiled notes are personal.
    /// A topic id that doesn't resolve (deleted, or not pulled yet from another device)
    /// reads as confidential: the label is unknown, so fail closed.
    pub fn sensitivity(&self, topic_id: Option<&str>) -> AppResult<Sensitivity> {
        let Some(topic_id) = topic_id.filter(|id| !id.is_empty()) else {
            return Ok(Sensitivity::Personal);
        };
        Ok(self
            .topic_repository
            .get(topic_id)?
            .map_or(Sensitivity::Confidential, |topic| topic.sensitivity))
    }

    /// Refuse an AI call on content filed under a topic that doesn't allow it.
    pub fn ensure_ai_allowed(&self, topic_id: Option<&str>) -> AppResult<()> {
        if allows_ai(self.sensitivity(topic_id)?) {
            Ok(())
        } else {
            Err(AppError::Policy(
                "AI is disabled for confidential topics".to_string(),
            ))
        }
    }
}

/// Whether content of this sensitivity may be sent to an AI provider.
pub fn allows_ai(sensitivity: Sensitivity) -> bool {
    sensitivity != Sensitivity::Confidential
}

/// Whether content of this sensitivity is included in an export of everything. A
/// confidential topic is only exported when the user exports that topic explicitly.
pub fn allows_bulk_export(sensitivity: Sensitivity) -> bool {
    sensitivity != Sensitivity::Confidential
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn confidential_blocks_ai_and_bulk_export() {
        assert!(!allows_ai(Sensitivity::Confidential));
        assert!(!allows_bulk_export(Sensitivity::Confidential));
    }

    #[test]
    fn personal_and_internal_allow_ai_and_bulk_export() {
        for sensitivity in [Sensitivity::Personal, Sensitivity::Internal] {
            assert!(allows_ai(sensitivity));
            assert!(allows_bulk_export(sensitivity));
        }
    }

    #[test]
    fn unknown_stored_sensitivity_fails_closed() {
        assert_eq!(
            Sensitivity::from_stored("secret-v2"),
            Sensitivity::Confidential
        );
        assert!(!allows_ai(Sensitivity::from_stored("")));
    }
}
