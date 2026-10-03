//! The review ritual. Ideas and thoughts come back on a schedule; each review records a
//! conviction (1 to 5), and the conviction decides when the note comes back. The rules are
//! pure functions ([`first_revisit`], [`next_revisit`], [`nudge`]) so they're testable and
//! shared with [`NoteService`](crate::services::note_service::NoteService), which schedules
//! a note's first review at capture.

use std::sync::Arc;

use chrono::{DateTime, Duration, Utc};

use crate::core::error::{AppError, AppResult};
use crate::core::models::{
    CaptureSource, NewTask, Note, NoteReview, NoteStatus, NoteType, ReviewDecision, ReviewNudge,
    ReviewOutcome,
};
use crate::core::sync_channel::SyncSignalSender;
use crate::repository::{NoteLinkRepository, NoteRepository, NoteReviewRepository, TaskRepository};
use crate::services::hlc_service::HlcService;
use crate::services::note_service::decorate;

/// A new idea or thought first comes back after this many days.
const FIRST_REVISIT_DAYS: i64 = 14;

pub struct ReviewService {
    note_repository: NoteRepository,
    note_review_repository: NoteReviewRepository,
    // Read-only: due notes show their evidence like every other list.
    note_link_repository: NoteLinkRepository,
    // Promoting a note creates a task, so the review service reaches the task repository
    // (like TaskGroupService reaching tasks when it un-groups them).
    task_repository: TaskRepository,
    hlc_service: Arc<HlcService>,
    sync_signal: SyncSignalSender,
}

impl ReviewService {
    pub fn new(
        note_repository: NoteRepository,
        note_review_repository: NoteReviewRepository,
        note_link_repository: NoteLinkRepository,
        task_repository: TaskRepository,
        hlc_service: Arc<HlcService>,
        sync_signal: SyncSignalSender,
    ) -> Self {
        Self {
            note_repository,
            note_review_repository,
            note_link_repository,
            task_repository,
            hlc_service,
            sync_signal,
        }
    }

    /// Notes due for review now, most overdue first, with their conviction history.
    pub fn due(&self) -> AppResult<Vec<Note>> {
        let due = self.note_repository.list_due(&Utc::now().to_rfc3339())?;
        Ok(decorate(
            due,
            self.note_review_repository.convictions_by_note()?,
            &self.note_link_repository.evidence_by_note()?,
        ))
    }

    pub fn reviews(&self, note_id: &str) -> AppResult<Vec<NoteReview>> {
        self.note_review_repository.list_for_note(note_id)
    }

    /// Record a review and apply its decision: schedule the next review from the conviction,
    /// drop the note, or promote it into a validation task.
    pub fn review(
        &self,
        note_id: &str,
        conviction: i64,
        comment: Option<&str>,
        decision: ReviewDecision,
    ) -> AppResult<ReviewOutcome> {
        if !(1..=5).contains(&conviction) {
            return Err(AppError::Store(
                "conviction must be between 1 and 5".to_string(),
            ));
        }
        let note = self.note_repository.get(note_id)?;
        let comment = comment.map(str::trim).filter(|c| !c.is_empty());

        let review = self
            .note_review_repository
            .insert(note_id, conviction, comment)?;
        let hlc = self.hlc_service.next()?;
        self.note_review_repository.record_change(
            &review.id,
            hlc.physical,
            hlc.counter,
            &hlc.node_id,
        )?;

        let now = Utc::now();
        let next = next_revisit(conviction, now).map(|at| at.to_rfc3339());
        let (status, revisit_at) = match decision {
            ReviewDecision::Keep => (keep_status(note.status), next),
            ReviewDecision::Drop => (NoteStatus::Dropped, None),
            ReviewDecision::Promote => (NoteStatus::Promoted, next),
        };
        let updated =
            self.note_repository
                .set_review_state(note_id, status, revisit_at.as_deref())?;
        let hlc = self.hlc_service.next()?;
        self.note_repository
            .record_change(note_id, hlc.physical, hlc.counter, &hlc.node_id)?;

        let task = match decision {
            ReviewDecision::Promote => {
                let task = self.task_repository.insert(promoted_task(&note, now))?;
                let hlc = self.hlc_service.next()?;
                self.task_repository.record_change(
                    &task.id,
                    hlc.physical,
                    hlc.counter,
                    &hlc.node_id,
                )?;
                Some(task)
            }
            _ => None,
        };

        self.sync_signal.send();
        let note = decorate(
            vec![updated],
            self.note_review_repository.convictions_by_note()?,
            &self.note_link_repository.evidence_by_note()?,
        )
        .remove(0);
        Ok(ReviewOutcome { note, task })
    }
}

/// Attach a note's conviction history (oldest first) and the nudge derived from it.
pub fn with_reviews(mut note: Note, history: Vec<i64>) -> Note {
    note.review_nudge = nudge(&history, note.status);
    note.conviction_history = history;
    note
}

/// Keeping a dropped note revives it; a promoted note stays promoted.
fn keep_status(current: NoteStatus) -> NoteStatus {
    match current {
        NoteStatus::Dropped => NoteStatus::Open,
        other => other,
    }
}

/// The inbox task a promoted idea becomes: a validation step, linked back to the note.
fn promoted_task(note: &Note, now: DateTime<Utc>) -> NewTask {
    let first_line = note.text.lines().next().unwrap_or(&note.text).trim();
    NewTask {
        text: format!("Validate: {first_line}"),
        raw_text: note.text.clone(),
        improved: false,
        link: note.link.clone(),
        task_group_id: None,
        source: CaptureSource {
            app_id: "app.blink.ideas".to_string(),
            app_name: "Ideas".to_string(),
            window_title: String::new(),
            captured_at: now.to_rfc3339(),
        },
        origin_note_id: Some(note.id.clone()),
    }
}

/// When a newly captured note first comes back. Sources aren't reviewed on their own: they
/// are judged through the ideas they support.
pub fn first_revisit(note_type: NoteType, now: DateTime<Utc>) -> Option<DateTime<Utc>> {
    match note_type {
        NoteType::Idea | NoteType::Thought => Some(now + Duration::days(FIRST_REVISIT_DAYS)),
        NoteType::Source => None,
    }
}

/// When a note comes back after a review. High conviction comes back sooner: if you're
/// excited, look again soon and act. A 1 isn't scheduled at all (the nudge suggests
/// dropping it).
pub fn next_revisit(conviction: i64, now: DateTime<Utc>) -> Option<DateTime<Utc>> {
    let days = match conviction {
        5 => 7,
        4 => 14,
        3 => 30,
        2 => 60,
        _ => return None,
    };
    Some(now + Duration::days(days))
}

/// A hint from the conviction history (oldest first): three 4+ in a row suggests promoting,
/// a 1 or two 2-or-lower in a row suggests dropping.
pub fn nudge(history: &[i64], status: NoteStatus) -> Option<ReviewNudge> {
    let last = *history.last()?;
    let tail = |n: usize| (history.len() >= n).then(|| &history[history.len() - n..]);
    if status != NoteStatus::Promoted && tail(3).is_some_and(|t| t.iter().all(|&c| c >= 4)) {
        return Some(ReviewNudge::Promote);
    }
    if last <= 1 || tail(2).is_some_and(|t| t.iter().all(|&c| c <= 2)) {
        return Some(ReviewNudge::Drop);
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    fn at(day: i64) -> DateTime<Utc> {
        DateTime::from_timestamp(0, 0).unwrap() + Duration::days(day)
    }

    #[test]
    fn ideas_and_thoughts_come_back_after_two_weeks_sources_never() {
        assert_eq!(first_revisit(NoteType::Idea, at(0)), Some(at(14)));
        assert_eq!(first_revisit(NoteType::Thought, at(0)), Some(at(14)));
        assert_eq!(first_revisit(NoteType::Source, at(0)), None);
    }

    #[test]
    fn higher_conviction_comes_back_sooner() {
        assert_eq!(next_revisit(5, at(0)), Some(at(7)));
        assert_eq!(next_revisit(4, at(0)), Some(at(14)));
        assert_eq!(next_revisit(3, at(0)), Some(at(30)));
        assert_eq!(next_revisit(2, at(0)), Some(at(60)));
        assert_eq!(next_revisit(1, at(0)), None);
    }

    #[test]
    fn three_strong_reviews_in_a_row_suggest_promoting() {
        assert_eq!(
            nudge(&[2, 4, 5, 4], NoteStatus::Open),
            Some(ReviewNudge::Promote)
        );
        assert_eq!(nudge(&[4, 5], NoteStatus::Open), None);
        assert_eq!(nudge(&[5, 5, 5], NoteStatus::Promoted), None);
    }

    #[test]
    fn weak_reviews_suggest_dropping() {
        assert_eq!(nudge(&[3, 1], NoteStatus::Open), Some(ReviewNudge::Drop));
        assert_eq!(nudge(&[4, 2, 2], NoteStatus::Open), Some(ReviewNudge::Drop));
        assert_eq!(nudge(&[2, 3], NoteStatus::Open), None);
        assert_eq!(nudge(&[], NoteStatus::Open), None);
    }

    #[test]
    fn keeping_a_dropped_note_revives_it() {
        assert_eq!(keep_status(NoteStatus::Dropped), NoteStatus::Open);
        assert_eq!(keep_status(NoteStatus::Promoted), NoteStatus::Promoted);
    }
}
