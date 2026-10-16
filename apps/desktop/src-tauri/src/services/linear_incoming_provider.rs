//! Linear as an Incoming source: your Linear inbox notifications (mentions, assignments,
//! comments, reviews, triage, reminders), read through the GraphQL API with
//! the personal API key from [`LinearAccountService`]. Not connected = no items, not an error.

use std::sync::Arc;

use chrono::{DateTime, SecondsFormat, Utc};
use serde::Deserialize;
use serde_json::json;

use crate::clients::linear_client::LinearClient;
use crate::core::error::{AppError, AppResult};
use crate::core::incoming_provider::{BoxFuture, IncomingProvider};
use crate::core::models::{IncomingItem, IncomingSource, SourceConnection};
use crate::services::linear_account_service::LinearAccountService;

/// Only `Notification` interface fields, so every notification kind (issue, project, …) maps.
const NOTIFICATIONS_QUERY: &str = "query Notifications($since: DateTimeOrDuration!) {
  notifications(first: 50, orderBy: updatedAt, filter: { updatedAt: { gte: $since } }) {
    nodes { id category title subtitle url updatedAt }
  }
}";

#[derive(Clone)]
pub struct LinearIncomingProvider {
    linear_client: LinearClient,
    linear_account_service: Arc<LinearAccountService>,
}

impl LinearIncomingProvider {
    pub fn new(
        linear_client: LinearClient,
        linear_account_service: Arc<LinearAccountService>,
    ) -> Self {
        Self {
            linear_client,
            linear_account_service,
        }
    }
}

impl IncomingProvider for LinearIncomingProvider {
    fn source(&self) -> IncomingSource {
        IncomingSource::Linear
    }

    fn connection(&self) -> BoxFuture<'_, SourceConnection> {
        Box::pin(self.linear_account_service.connection())
    }

    fn connect_with_key(&self, key: String) -> BoxFuture<'_, AppResult<()>> {
        Box::pin(async move { self.linear_account_service.connect(&key).await })
    }

    fn disconnect(&self) -> AppResult<()> {
        self.linear_account_service.disconnect()
    }

    fn fetch(&self, since: DateTime<Utc>) -> BoxFuture<'_, AppResult<Vec<IncomingItem>>> {
        Box::pin(async move {
            let Some(api_key) = self.linear_account_service.api_key()? else {
                return Ok(Vec::new());
            };
            let since = since.to_rfc3339_opts(SecondsFormat::Secs, true);
            let response = self
                .linear_client
                .graphql(&api_key, NOTIFICATIONS_QUERY, json!({ "since": since }))
                .await
                .map_err(|e| AppError::Incoming(format!("could not reach Linear: {e}")))?;
            let status = response.status();
            if status == reqwest::StatusCode::UNAUTHORIZED {
                return Err(AppError::Incoming(
                    "Linear refused the API key — connect it again in Settings".into(),
                ));
            }
            if !status.is_success() {
                let body = response.text().await.unwrap_or_default();
                return Err(AppError::Incoming(format!(
                    "Linear answered {status}: {body}"
                )));
            }
            let body: GraphQlResponse = response
                .json()
                .await
                .map_err(|e| AppError::Incoming(format!("unexpected Linear response: {e}")))?;
            notification_items(body)
        })
    }
}

#[derive(Deserialize)]
struct GraphQlResponse {
    data: Option<Data>,
    errors: Option<Vec<GraphQlError>>,
}

#[derive(Deserialize)]
struct GraphQlError {
    message: String,
}

#[derive(Deserialize)]
struct Data {
    notifications: Connection,
}

#[derive(Deserialize)]
struct Connection {
    nodes: Vec<Notification>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Notification {
    id: String,
    category: String,
    title: String,
    subtitle: String,
    url: String,
    updated_at: String,
}

fn notification_items(body: GraphQlResponse) -> AppResult<Vec<IncomingItem>> {
    if let Some(errors) = body.errors.filter(|errors| !errors.is_empty()) {
        let messages: Vec<String> = errors.into_iter().map(|e| e.message).collect();
        return Err(AppError::Incoming(format!(
            "Linear: {}",
            messages.join("; ")
        )));
    }
    let nodes = body
        .data
        .map(|data| data.notifications.nodes)
        .unwrap_or_default();
    Ok(nodes.into_iter().filter_map(linear_item).collect())
}

/// A Linear notification as an Incoming item, or `None` for categories that ask nothing of
/// you (status changes, reactions, feed, billing, …).
fn linear_item(notification: Notification) -> Option<IncomingItem> {
    let reason = match notification.category.as_str() {
        "mentions" => "mentioned",
        "assignments" => "assigned",
        "commentsAndReplies" => "new comment",
        "reviews" => "review requested",
        "triage" => "triage",
        "reminders" => "reminder",
        _ => return None,
    };
    Some(IncomingItem {
        id: IncomingSource::Linear.item_id(&notification.id),
        source: IncomingSource::Linear,
        reason: reason.to_string(),
        title: notification.title,
        context: notification.subtitle,
        url: notification.url,
        updated_at: normalize_time(&notification.updated_at),
        urgent: false,
    })
}

/// Linear sends milliseconds (`…:00.000Z`); other sources don't. One format keeps the
/// newest-first sort and the archive's "changed since" comparison exact across sources.
fn normalize_time(time: &str) -> String {
    DateTime::parse_from_rfc3339(time)
        .map(|t| {
            t.with_timezone(&Utc)
                .to_rfc3339_opts(SecondsFormat::Secs, true)
        })
        .unwrap_or_else(|_| time.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn body(json: &str) -> GraphQlResponse {
        serde_json::from_str(json).expect("json")
    }

    #[test]
    fn maps_actionable_categories_and_skips_the_rest() {
        let items = notification_items(body(
            r#"{"data":{"notifications":{"nodes":[
              {"id":"n1","category":"mentions","title":"ENG-12 Fix login",
               "subtitle":"Ada mentioned you","url":"https://linear.app/x/issue/ENG-12",
               "updatedAt":"2026-10-13T10:00:00.000Z"},
              {"id":"n2","category":"statusChanges","title":"ENG-13","subtitle":"Done",
               "url":"https://linear.app/x/issue/ENG-13","updatedAt":"2026-10-13T09:00:00.000Z"}
            ]}}}"#,
        ))
        .expect("items");
        assert_eq!(items.len(), 1);
        assert_eq!(items[0].id, "linear:n1");
        assert_eq!(items[0].reason, "mentioned");
        assert_eq!(items[0].context, "Ada mentioned you");
        assert_eq!(items[0].updated_at, "2026-10-13T10:00:00Z");
    }

    #[test]
    fn graphql_errors_surface() {
        let err = notification_items(body(r#"{"errors":[{"message":"Field missing"}]}"#))
            .expect_err("error");
        assert!(err.to_string().contains("Field missing"));
    }
}
