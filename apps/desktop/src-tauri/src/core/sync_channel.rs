//! The channel from the write path to the background sync loop: services hold a
//! [`SyncSignalSender`] and `send()` on it when local data changes (or after setup/unlock);
//! the loop holds the [`SyncSignalReceiver`] and syncs soon. Just `std::sync::mpsc`.

use std::sync::mpsc::{self, Receiver, Sender};

/// The receiving half — held by the sync loop, used with its native `recv_timeout`.
pub type SyncSignalReceiver = Receiver<()>;

/// The sending half — cloned into every service that can ask for a sync.
#[derive(Clone)]
pub struct SyncSignalSender(Sender<()>);

impl SyncSignalSender {
    /// Ask the sync loop to run soon. Lossy: a failed send just means the loop is gone.
    pub fn send(&self) {
        let _ = self.0.send(());
    }
}

/// The sender/receiver pair (like `mpsc::channel`): sender → services, receiver → loop.
pub fn channel() -> (SyncSignalSender, SyncSignalReceiver) {
    let (tx, rx) = mpsc::channel();
    (SyncSignalSender(tx), rx)
}
