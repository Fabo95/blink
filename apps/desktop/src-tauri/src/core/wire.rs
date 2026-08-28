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
