//! The Rust mirror of the client↔server sync wire format (`@blink/contract`). Shared
//! by the transport ([`ServerClient`](crate::clients::server_client::ServerClient),
//! which serializes requests) and the sync service (which deserializes responses), so
//! it lives in `core` rather than either layer. The record payload is the local row
//! itself as JSON — the server stores a readable replica.

use serde::{Deserialize, Serialize};

use super::models::TaskEffort;

/// A Hybrid Logical Clock as it crosses the wire (camelCase `nodeId`).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Clock {
    pub physical: i64,
    pub counter: i64,
    pub node_id: String,
}

/// Client → server push unit: the whole local row as `body`. `id` is the
/// client-owned UUID (stable across devices), the LWW conflict key.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SyncPacket {
    pub id: String,
    pub clock: Clock,
    pub body: RecordBody,
}

/// Server → client pull unit: a packet plus the server-assigned `seq` cursor (the
/// client advances its pull cursor to the max `seq` it receives).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SyncRecord {
    pub id: String,
    pub clock: Clock,
    pub body: RecordBody,
    pub seq: i64,
}

/// The payload of a record — the whole local row, tagged by table so a pulled record
/// routes back to the right repository. This is what's serialized to JSON into a
/// packet's `body`. Field names match the DB columns (and, on the server, the
/// `kind`/`status` generated columns read straight out of this JSON). `deleted` rides
/// inside so a tombstone carries its own flag.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum RecordBody {
    Task(TaskBody),
    Group(GroupBody),
    Topic(TopicBody),
    Note(NoteBody),
    NoteRevision(NoteRevisionBody),
    /// Any kind this build doesn't know: retired ones (`note_review`, `note_link` still sit
    /// on the server) or ones from a newer device. Pull decodes whole pages, so one
    /// unknown record must not fail the page and wedge sync; merging skips it.
    #[serde(other)]
    Unknown,
}

/// Enum columns ride as their stored strings (`NoteType::as_str` etc.), the same as the
/// DB, so the server's generated `status` column reads a plain value.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TopicBody {
    pub name: String,
    pub question: Option<String>,
    pub status: String,
    pub sensitivity: String,
    pub created_at: String,
    pub updated_at: String,
    pub deleted: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NoteBody {
    pub note_type: String,
    pub text: String,
    pub raw_text: String,
    pub link: Option<String>,
    pub topic_id: Option<String>,
    pub improved: bool,
    pub app_id: String,
    pub app_name: String,
    pub window_title: String,
    pub captured_at: String,
    pub created_at: String,
    pub updated_at: String,
    pub deleted: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NoteRevisionBody {
    pub note_id: String,
    pub text: String,
    pub reason: String,
    pub created_at: String,
    pub deleted: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskBody {
    pub text: String,
    pub raw_text: String,
    pub status: String,
    /// Added after the first sync release — a body pulled from a device that predates it
    /// carries no `effort`, so it reads as the default.
    #[serde(default)]
    pub effort: TaskEffort,
    pub app_id: String,
    pub app_name: String,
    pub window_title: String,
    pub captured_at: String,
    pub created_at: String,
    pub updated_at: String,
    pub improved: bool,
    pub link: Option<String>,
    pub completed_at: Option<String>,
    pub task_group_id: Option<String>,
    pub position: i64,
    pub deleted: bool,
    /// Added with note reviews; older bodies (and server-synthesized captures) omit it.
    #[serde(default)]
    pub origin_note_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GroupBody {
    pub name: String,
    pub context: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    pub deleted: bool,
}

/// A local row that needs pushing (or a pulled one being merged): its wire id, clock,
/// and body. `list_dirty` builds these; the sync service wraps the `body` in a packet,
/// and `clear_dirty` uses the `clock` to clear the flag only if the row wasn't
/// re-edited meanwhile.
#[derive(Debug, Clone)]
pub struct LocalChange {
    pub id: String,
    pub clock: Clock,
    pub body: RecordBody,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_pull_page_with_retired_kinds_still_decodes() {
        let page = r#"[
            {"kind": "note_review", "note_id": "n1", "conviction": 4, "comment": null,
             "reviewed_at": "2026-10-01T00:00:00Z", "deleted": false},
            {"kind": "note_link", "from_note_id": "n1", "to_note_id": "n2",
             "relation": "supports", "created_at": "2026-10-01T00:00:00Z", "deleted": false},
            {"kind": "group", "name": "Work", "context": null,
             "created_at": "2026-10-01T00:00:00Z", "updated_at": "2026-10-01T00:00:00Z",
             "deleted": false}
        ]"#;
        let bodies: Vec<RecordBody> = serde_json::from_str(page).unwrap();
        assert!(matches!(bodies[0], RecordBody::Unknown));
        assert!(matches!(bodies[1], RecordBody::Unknown));
        assert!(matches!(bodies[2], RecordBody::Group(_)));
    }
}
