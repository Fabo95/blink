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
    NoteReview(NoteReviewBody),
    NoteLink(NoteLinkBody),
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
    /// Added with note reviews; a body without them reads as an open, unscheduled note.
    #[serde(default = "default_note_status")]
    pub status: String,
    #[serde(default)]
    pub revisit_at: Option<String>,
    /// Added with source enrichment; older bodies have none.
    #[serde(default)]
    pub title: Option<String>,
    #[serde(default)]
    pub excerpt: Option<String>,
    #[serde(default)]
    pub summary: Option<String>,
    #[serde(default = "default_enrichment")]
    pub enrichment: String,
}

fn default_enrichment() -> String {
    "none".to_string()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NoteLinkBody {
    pub from_note_id: String,
    pub to_note_id: String,
    pub relation: String,
    pub created_at: String,
    pub deleted: bool,
}

fn default_note_status() -> String {
    "open".to_string()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NoteReviewBody {
    pub note_id: String,
    pub conviction: i64,
    pub comment: Option<String>,
    pub reviewed_at: String,
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
