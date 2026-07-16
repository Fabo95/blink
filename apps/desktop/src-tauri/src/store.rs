//! Local task store — step 4 of the capture data flow.
//!
//! The architecture calls for a SQLCipher (AES-256) database so data at rest is
//! useless if the laptop is stolen. Wiring the encrypted DB pulls in native
//! SQLCipher libs, so Phase-1 ships an in-memory store behind the same API. The
//! `Store` surface is what the SQLCipher implementation will implement verbatim.
//!
//! TODO(phase-1-hardening): back this with `rusqlite` + the `sqlcipher` feature,
//! keying the DB from the OS keychain. Keep this signature stable.

use std::sync::Mutex;

use crate::models::{NewTask, Task};

#[derive(Default)]
pub struct Store {
    tasks: Mutex<Vec<Task>>,
}

impl Store {
    pub fn list(&self) -> Vec<Task> {
        self.tasks.lock().expect("store poisoned").clone()
    }

    pub fn insert(&self, new: NewTask, id: String, now: String) -> Task {
        let task = Task {
            id,
            title: new.title,
            body: new.body,
            status: "inbox".to_string(),
            source: new.source,
            created_at: now.clone(),
            updated_at: now,
        };
        self.tasks
            .lock()
            .expect("store poisoned")
            .insert(0, task.clone());
        task
    }

    pub fn delete(&self, id: &str) {
        self.tasks
            .lock()
            .expect("store poisoned")
            .retain(|task| task.id != id);
    }
}
