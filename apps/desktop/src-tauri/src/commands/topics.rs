use tauri::State;

use crate::core::error::AppResult;
use crate::core::models::{NewTopic, Sensitivity, Topic, TopicStatus};
use crate::services::topic_service::{TopicPatch, TopicService};

#[tauri::command]
pub fn list_topics(topic_service: State<'_, TopicService>) -> AppResult<Vec<Topic>> {
    topic_service.list()
}

#[tauri::command]
pub fn create_topic(topic_service: State<'_, TopicService>, topic: NewTopic) -> AppResult<Topic> {
    topic_service.create(topic)
}

/// Patch a topic's mutable fields. Any omitted field is left untouched; an empty
/// `question` clears it.
#[tauri::command]
pub fn update_topic(
    topic_service: State<'_, TopicService>,
    id: String,
    name: Option<String>,
    question: Option<String>,
    status: Option<TopicStatus>,
    sensitivity: Option<Sensitivity>,
) -> AppResult<Topic> {
    topic_service.update(
        &id,
        TopicPatch {
            name,
            question,
            status,
            sensitivity,
        },
    )
}

/// Delete a topic. `delete_notes` deletes its notes too; otherwise they become unfiled.
#[tauri::command]
pub fn delete_topic(
    topic_service: State<'_, TopicService>,
    id: String,
    delete_notes: bool,
) -> AppResult<()> {
    topic_service.delete(&id, delete_notes)
}

#[tauri::command]
pub fn get_active_topic(topic_service: State<'_, TopicService>) -> AppResult<Option<String>> {
    topic_service.active_topic()
}

#[tauri::command]
pub fn set_active_topic(
    topic_service: State<'_, TopicService>,
    topic_id: Option<String>,
) -> AppResult<()> {
    topic_service.set_active_topic(topic_id)
}
