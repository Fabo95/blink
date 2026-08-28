//! Bidirectional sync orchestration. Push encrypts locally-changed rows and uploads
//! them; pull downloads remote changes, decrypts them, and merges last-write-wins. It
//! ties together the vault (encryption), the server client (transport), the entity
//! repos (dirty rows + merge), and `sync_state` (the pull cursor), and drives the
//! account keyset round-trip (setup / unlock). All record payloads are opaque to the
//! server — it only ever sees ciphertext + clocks.

use std::sync::Arc;

use serde::Deserialize;

use crate::clients::server_client::ServerClient;
use crate::core::crypto::Keyset;
use crate::core::error::{AppError, AppResult};
use crate::core::wire::{RecordBody, SyncPacket, SyncRecord};
use crate::repository::{SyncStateRepository, TaskGroupRepository, TaskRepository};
use crate::services::session_token_service::SessionTokenService;
use crate::services::vault_service::VaultService;

const LAST_PULLED_SEQ_KEY: &str = "last_pulled_seq";

pub struct SyncService {
    server_client: ServerClient,
    vault_service: Arc<VaultService>,
    session_token_service: SessionTokenService,
    task_repository: TaskRepository,
    task_group_repository: TaskGroupRepository,
    sync_state_repository: SyncStateRepository,
}

impl SyncService {
    pub fn new(
        server_client: ServerClient,
        vault_service: Arc<VaultService>,
        session_token_service: SessionTokenService,
        task_repository: TaskRepository,
        task_group_repository: TaskGroupRepository,
        sync_state_repository: SyncStateRepository,
    ) -> Self {
        Self {
            server_client,
            vault_service,
            session_token_service,
            task_repository,
            task_group_repository,
            sync_state_repository,
        }
    }

    /// One sync cycle: pull remote changes first (so a fresh device fills in), then
    /// push local ones.
    pub async fn sync(&self) -> AppResult<()> {
        self.pull().await?;
        self.push().await?;
        Ok(())
    }

    /// Encrypt and upload every locally-changed row, then clear their dirty flags.
    pub async fn push(&self) -> AppResult<usize> {
        let token = self.token()?;
        let task_changes = self.task_repository.list_dirty()?;
        let group_changes = self.task_group_repository.list_dirty()?;
        if task_changes.is_empty() && group_changes.is_empty() {
            return Ok(0);
        }

        let mut packets = Vec::with_capacity(task_changes.len() + group_changes.len());
        for change in task_changes.iter().chain(group_changes.iter()) {
            let plaintext = serde_json::to_vec(&change.body)
                .map_err(|e| AppError::Sync(format!("serialize record: {e}")))?;
            packets.push(SyncPacket {
                id: change.id.clone(),
                clock: change.clock.clone(),
                cipher: self.vault_service.encrypt(&plaintext)?,
            });
        }

        let resp = self.server_client.push_records(&token, &packets).await.map_err(net_err)?;
        ensure_ok(&resp)?;

        // Clear the flags only after the server confirms the writes landed.
        self.task_repository.clear_dirty(&task_changes)?;
        self.task_group_repository.clear_dirty(&group_changes)?;
        Ok(packets.len())
    }

    /// Pull remote changes since the cursor, decrypt, LWW-merge, and advance the cursor.
    /// Records arrive in `seq` order, so a referenced group always precedes its tasks.
    pub async fn pull(&self) -> AppResult<usize> {
        let token = self.token()?;
        let since = self.last_pulled_seq()?;

        let resp = self.server_client.pull_records(&token, since).await.map_err(net_err)?;
        ensure_ok(&resp)?;
        let records =
            resp.json::<ApiResponse<PullData>>().await.map_err(net_err)?.data.records;

        let mut max_seq = since;
        for record in &records {
            let plaintext = self.vault_service.decrypt(&record.cipher)?;
            let body: RecordBody = serde_json::from_slice(&plaintext)
                .map_err(|e| AppError::Sync(format!("deserialize record: {e}")))?;
            match body {
                RecordBody::Task(task) => {
                    self.task_repository.merge(&record.id, &record.clock, &task)?;
                }
                RecordBody::Group(group) => {
                    self.task_group_repository.merge(&record.id, &record.clock, &group)?;
                }
            }
            max_seq = max_seq.max(record.seq);
        }

        if max_seq > since {
            self.sync_state_repository.set(LAST_PULLED_SEQ_KEY, &max_seq.to_string())?;
        }
        Ok(records.len())
    }

    /// First-time vault setup: create the keyset locally and upload it. Returns the
    /// Secret Key to show the user **once**.
    pub async fn setup_vault(&self, master_password: &str) -> AppResult<String> {
        let token = self.token()?;
        let setup = self.vault_service.setup(master_password)?;
        let resp = self.server_client.put_keyset(&token, &setup.keyset).await.map_err(net_err)?;
        ensure_ok(&resp)?;
        Ok(setup.secret_key)
    }

    /// Unlock the vault on this device from the server-stored keyset. Errors if the
    /// account hasn't been set up, or the master password / Secret Key is wrong.
    pub async fn unlock_vault(&self, master_password: &str, secret_key: &str) -> AppResult<()> {
        let token = self.token()?;
        let resp = self.server_client.get_keyset(&token).await.map_err(net_err)?;
        ensure_ok(&resp)?;
        let keyset = resp.json::<ApiResponse<KeysetData>>().await.map_err(net_err)?.data.keyset;
        let keyset =
            keyset.ok_or_else(|| AppError::Sync("no keyset on server — run setup first".into()))?;
        self.vault_service.unlock(master_password, secret_key, &keyset)
    }

    fn token(&self) -> AppResult<String> {
        self.session_token_service.read()?.ok_or_else(|| AppError::Sync("not signed in".into()))
    }

    fn last_pulled_seq(&self) -> AppResult<i64> {
        Ok(self
            .sync_state_repository
            .get(LAST_PULLED_SEQ_KEY)?
            .and_then(|v| v.parse().ok())
            .unwrap_or(0))
    }
}

/// The server wraps every success as `{ data, reqId }`; we only need `data`.
#[derive(Deserialize)]
struct ApiResponse<T> {
    data: T,
}

#[derive(Deserialize)]
struct PullData {
    records: Vec<SyncRecord>,
}

#[derive(Deserialize)]
struct KeysetData {
    keyset: Option<Keyset>,
}

fn net_err(e: reqwest::Error) -> AppError {
    AppError::Sync(format!("sync request failed: {e}"))
}

fn ensure_ok(resp: &reqwest::Response) -> AppResult<()> {
    if resp.status().is_success() {
        Ok(())
    } else {
        Err(AppError::Sync(format!("server returned {}", resp.status())))
    }
}
