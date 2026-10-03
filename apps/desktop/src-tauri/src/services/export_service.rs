//! Export of notes to Markdown (for reading) or JSON (complete, for portability). One
//! topic exports when asked for explicitly, whatever its sensitivity; "everything" leaves
//! confidential topics out.

use std::path::Path;

use chrono::Utc;
use serde::Serialize;

use crate::core::error::{AppError, AppResult};
use crate::core::models::{ExportFormat, Note, NoteStatus, NoteType, Topic};
use crate::repository::{NoteLinksRepository, NotesRepository, NoteReviewsRepository, TopicsRepository};
use crate::services::policy_service::allows_bulk_export;
use crate::services::note_service::decorate;

/// A rendered export, ready to be written wherever the user picks.
pub struct Export {
    pub file_name: String,
    pub content: String,
}

pub struct ExportService {
    notes_repository: NotesRepository,
    note_reviews_repository: NoteReviewsRepository,
    note_links_repository: NoteLinksRepository,
    topics_repository: TopicsRepository,
}

impl ExportService {
    pub fn new(
        notes_repository: NotesRepository,
        note_reviews_repository: NoteReviewsRepository,
        note_links_repository: NoteLinksRepository,
        topics_repository: TopicsRepository,
    ) -> Self {
        Self {
            notes_repository,
            note_reviews_repository,
            note_links_repository,
            topics_repository,
        }
    }

    /// Render one topic (`topic_id`) or everything exportable (`None`).
    pub fn render(&self, topic_id: Option<&str>, format: ExportFormat) -> AppResult<Export> {
        let topics = self.topics_repository.list()?;
        let notes: Vec<Note> = decorate(
            self.notes_repository.list()?,
            self.note_reviews_repository.convictions_by_note()?,
            &self.note_links_repository.evidence_by_note()?,
        );
        let document = build_document(&topics, notes, topic_id)?;

        let scope = match topic_id {
            Some(_) => document
                .topics
                .first()
                .map_or("topic".to_string(), |t| slug(&t.topic.name)),
            None => "all".to_string(),
        };
        let date = Utc::now().format("%Y-%m-%d");
        Ok(match format {
            ExportFormat::Markdown => Export {
                file_name: format!("blink-ideas-{scope}-{date}.md"),
                content: render_markdown(&document),
            },
            ExportFormat::Json => Export {
                file_name: format!("blink-ideas-{scope}-{date}.json"),
                content: serde_json::to_string_pretty(&document)
                    .map_err(|e| AppError::Export(e.to_string()))?,
            },
        })
    }

    pub fn write(&self, path: &Path, content: &str) -> AppResult<()> {
        std::fs::write(path, content).map_err(|e| AppError::Export(e.to_string()))
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ExportDocument {
    exported_at: String,
    topics: Vec<ExportTopic>,
    /// Notes filed under no topic. Empty for a single-topic export.
    unfiled: Vec<Note>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ExportTopic {
    topic: Topic,
    notes: Vec<Note>,
}

/// Pick what goes into the export. A note whose topic doesn't resolve (not pulled yet, or
/// deleted) is left out of a bulk export: its sensitivity is unknown, so fail closed.
fn build_document(
    topics: &[Topic],
    notes: Vec<Note>,
    topic_id: Option<&str>,
) -> AppResult<ExportDocument> {
    let exported_at = Utc::now().to_rfc3339();
    if let Some(topic_id) = topic_id {
        let topic = topics
            .iter()
            .find(|t| t.id == topic_id)
            .cloned()
            .ok_or_else(|| AppError::Export(format!("topic {topic_id} not found")))?;
        let notes = notes
            .into_iter()
            .filter(|n| n.topic_id.as_deref() == Some(topic_id))
            .collect();
        return Ok(ExportDocument {
            exported_at,
            topics: vec![ExportTopic { topic, notes }],
            unfiled: Vec::new(),
        });
    }

    let mut exported: Vec<ExportTopic> = topics
        .iter()
        .filter(|t| allows_bulk_export(t.sensitivity))
        .map(|t| ExportTopic {
            topic: t.clone(),
            notes: Vec::new(),
        })
        .collect();
    let mut unfiled = Vec::new();
    for note in notes {
        match note.topic_id.as_deref() {
            None => unfiled.push(note),
            Some(id) => {
                if let Some(entry) = exported.iter_mut().find(|t| t.topic.id == id) {
                    entry.notes.push(note);
                }
            }
        }
    }
    Ok(ExportDocument {
        exported_at,
        topics: exported,
        unfiled,
    })
}

const SECTIONS: [(NoteType, &str); 3] = [
    (NoteType::Idea, "Ideas"),
    (NoteType::Thought, "Thoughts"),
    (NoteType::Source, "Sources"),
];

fn render_markdown(document: &ExportDocument) -> String {
    let mut out = format!("# Blink ideas\n\nExported {}\n", document.exported_at);
    for entry in &document.topics {
        out.push_str(&format!("\n## {}\n\n", entry.topic.name));
        if let Some(question) = &entry.topic.question {
            out.push_str(&format!("> {question}\n\n"));
        }
        out.push_str(&format!(
            "Status: {}, sensitivity: {}\n",
            entry.topic.status.as_str(),
            entry.topic.sensitivity.as_str()
        ));
        render_notes(&mut out, &entry.notes, "###");
    }
    if !document.unfiled.is_empty() {
        out.push_str("\n## Unfiled\n");
        render_notes(&mut out, &document.unfiled, "###");
    }
    out
}

fn render_notes(out: &mut String, notes: &[Note], heading: &str) {
    for (note_type, title) in SECTIONS {
        let section: Vec<&Note> = notes.iter().filter(|n| n.note_type == note_type).collect();
        if section.is_empty() {
            continue;
        }
        out.push_str(&format!("\n{heading} {title}\n\n"));
        for note in section {
            let date = note.created_at.get(..10).unwrap_or(&note.created_at);
            // Continuation lines are indented so a multi-line note stays one list item.
            let text = note.text.trim().replace('\n', "\n  ");
            let link = note.link.as_ref().map(|l| format!(" ({l})")).unwrap_or_default();
            let conviction = if note.conviction_history.is_empty() {
                String::new()
            } else {
                let scores: Vec<String> =
                    note.conviction_history.iter().map(i64::to_string).collect();
                format!(", conviction {}", scores.join(" > "))
            };
            let status = match note.status {
                NoteStatus::Open => "",
                NoteStatus::Promoted => ", promoted",
                NoteStatus::Dropped => ", dropped",
            };
            out.push_str(&format!("- {text}{link} _{date}{conviction}{status}_\n"));
        }
    }
}

/// A filesystem-safe slug for the default file name.
fn slug(name: &str) -> String {
    let slug: String = name
        .to_lowercase()
        .chars()
        .map(|c| if c.is_alphanumeric() { c } else { '-' })
        .collect();
    let trimmed = slug
        .split('-')
        .filter(|part| !part.is_empty())
        .collect::<Vec<_>>()
        .join("-");
    if trimmed.is_empty() {
        "topic".to_string()
    } else {
        trimmed
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::core::models::{CaptureSource, Enrichment, Evidence, Sensitivity, TopicStatus};

    fn topic(id: &str, name: &str, sensitivity: Sensitivity) -> Topic {
        Topic {
            id: id.to_string(),
            name: name.to_string(),
            question: Some("Is it real?".to_string()),
            status: TopicStatus::Exploring,
            sensitivity,
            created_at: "2026-10-01T00:00:00Z".to_string(),
            updated_at: "2026-10-01T00:00:00Z".to_string(),
        }
    }

    fn note(text: &str, note_type: NoteType, topic_id: Option<&str>) -> Note {
        Note {
            id: text.to_string(),
            note_type,
            text: text.to_string(),
            raw_text: text.to_string(),
            link: None,
            topic_id: topic_id.map(str::to_string),
            improved: false,
            conflict: false,
            status: NoteStatus::Open,
            revisit_at: None,
            conviction_history: Vec::new(),
            review_nudge: None,
            title: None,
            excerpt: None,
            summary: None,
            enrichment: Enrichment::None,
            evidence: Evidence::default(),
            source: CaptureSource {
                app_id: "manual".to_string(),
                app_name: "Manual".to_string(),
                window_title: String::new(),
                captured_at: "2026-10-01T00:00:00Z".to_string(),
            },
            created_at: "2026-10-02T09:00:00Z".to_string(),
            updated_at: "2026-10-02T09:00:00Z".to_string(),
        }
    }

    #[test]
    fn bulk_export_leaves_out_confidential_topics_and_unknown_topics() {
        let topics = [
            topic("a", "Open", Sensitivity::Personal),
            topic("b", "Secret", Sensitivity::Confidential),
        ];
        let notes = vec![
            note("open note", NoteType::Idea, Some("a")),
            note("secret note", NoteType::Idea, Some("b")),
            note("orphan note", NoteType::Idea, Some("gone")),
            note("loose note", NoteType::Thought, None),
        ];
        let document = build_document(&topics, notes, None).unwrap();
        let exported: Vec<&str> = document
            .topics
            .iter()
            .flat_map(|t| t.notes.iter().map(|n| n.text.as_str()))
            .chain(document.unfiled.iter().map(|n| n.text.as_str()))
            .collect();
        assert_eq!(exported, ["open note", "loose note"]);
        assert!(document
            .topics
            .iter()
            .all(|t| t.topic.sensitivity != Sensitivity::Confidential));
    }

    #[test]
    fn explicit_topic_export_includes_a_confidential_topic() {
        let topics = [topic("b", "Secret", Sensitivity::Confidential)];
        let notes = vec![
            note("secret note", NoteType::Idea, Some("b")),
            note("loose", NoteType::Idea, None),
        ];
        let document = build_document(&topics, notes, Some("b")).unwrap();
        assert_eq!(document.topics.len(), 1);
        assert_eq!(document.topics[0].notes.len(), 1);
        assert!(document.unfiled.is_empty());
    }

    #[test]
    fn markdown_groups_notes_by_type_under_their_topic() {
        let topics = [topic("a", "Agentic commerce", Sensitivity::Personal)];
        let notes = vec![
            note("Agents book tables", NoteType::Idea, Some("a")),
            note("Line one\nline two", NoteType::Thought, Some("a")),
        ];
        let markdown = render_markdown(&build_document(&topics, notes, None).unwrap());
        assert!(markdown.contains("## Agentic commerce\n\n> Is it real?"));
        assert!(markdown.contains("### Ideas\n\n- Agents book tables _2026-10-02_"));
        assert!(markdown.contains("- Line one\n  line two _2026-10-02_"));
    }

    #[test]
    fn markdown_shows_conviction_history_and_status() {
        let topics = [topic("a", "Agentic commerce", Sensitivity::Personal)];
        let mut promoted = note("Agents book tables", NoteType::Idea, Some("a"));
        promoted.conviction_history = vec![2, 4, 5];
        promoted.status = NoteStatus::Promoted;
        let markdown = render_markdown(&build_document(&topics, vec![promoted], None).unwrap());
        assert!(markdown.contains("- Agents book tables _2026-10-02, conviction 2 > 4 > 5, promoted_"));
    }

    #[test]
    fn slug_is_filesystem_safe() {
        assert_eq!(slug("Agentic commerce / EU!"), "agentic-commerce-eu");
        assert_eq!(slug("!!!"), "topic");
    }
}
