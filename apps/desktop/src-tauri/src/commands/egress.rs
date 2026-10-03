use tauri::State;

use crate::core::error::AppResult;
use crate::core::models::EgressEvent;
use crate::services::egress_service::EgressService;

/// What left this Mac recently: AI calls and page fetches, newest first. Never content.
#[tauri::command]
pub fn list_egress_events(egress_service: State<'_, EgressService>) -> AppResult<Vec<EgressEvent>> {
    egress_service.recent()
}
