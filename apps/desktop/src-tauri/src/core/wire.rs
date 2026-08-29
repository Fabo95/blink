//! The Rust mirror of the client↔server sync wire format (`@blink/contract`). Shared
//! by the transport ([`ServerClient`](crate::clients::server_client::ServerClient),
//! which serializes requests) and the sync service (which deserializes responses), so
//! it lives in `core` rather than either layer. The record payload is an opaque
//! [`Envelope`](super::crypto::Envelope) — the server never sees plaintext.

use serde::{Deserialize, Serialize};

use super::crypto::Envelope;

/// A Hybrid Logical Clock as it crosses the wire (camelCase `nodeId`).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Clock {
    pub physical: i64,
    pub counter: i64,
    pub node_id: String,
}

/// Client → server push unit: the whole local row, encrypted into `cipher`. `id` is
/// the client-owned UUID (stable across devices), the LWW conflict key.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SyncPacket {
    pub id: String,
    pub clock: Clock,
    pub cipher: Envelope,
}

/// Server → client pull unit: a packet plus the server-assigned `seq` cursor (the
/// client advances its pull cursor to the max `seq` it receives).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SyncRecord {
    pub id: String,
    pub clock: Clock,
    pub cipher: Envelope,
    pub seq: i64,
}

/// The decrypted payload of a record — the whole local row, tagged by table so a
/// pulled record routes back to the right repository. This is what's serialized to
/// JSON and encrypted into a packet's `cipher`; the server never sees it. Field names
/// match the DB columns. `deleted` rides inside so a tombstone carries its own flag.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum RecordBody {
    Task(TaskBody),
    Group(GroupBody),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskBody {
    pub text: String,
    pub raw_text: String,
    pub status: String,
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
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GroupBody {
    pub name: String,
    pub context: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    pub deleted: bool,
}

/// A local row that needs pushing (or a decrypted one being merged): its wire id,
/// clock, and decrypted body. `list_dirty` builds these; the sync service encrypts the
/// `body` into a packet, and `clear_dirty` uses the `clock` to clear the flag only if
/// the row wasn't re-edited meanwhile.
#[derive(Debug, Clone)]
pub struct LocalChange {
    pub id: String,
    pub clock: Clock,
    pub body: RecordBody,
}
