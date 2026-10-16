//! Better Stack as an Incoming source: every open (unresolved) incident, **urgent** until
//! someone acknowledges it — a native notification fires when a new one starts. A resolved
//! incident leaves the feed on the next poll. Not connected = no items, not an error.

use std::sync::Arc;

use chrono::{DateTime, Utc};

use crate::core::error::AppResult;
use crate::core::incoming_provider::{BoxFuture, IncomingProvider};
use crate::core::models::{IncomingItem, IncomingSource, SourceConnection};
use crate::services::better_stack_account_service::{BetterStackAccountService, Incident};

/// Where an incident opens in the browser.
const INCIDENT_URL: &str = "https://uptime.betterstack.com/incidents";

#[derive(Clone)]
pub struct BetterStackIncomingProvider {
    better_stack_account_service: Arc<BetterStackAccountService>,
}

impl BetterStackIncomingProvider {
    pub fn new(better_stack_account_service: Arc<BetterStackAccountService>) -> Self {
        Self {
            better_stack_account_service,
        }
    }
}

impl IncomingProvider for BetterStackIncomingProvider {
    fn source(&self) -> IncomingSource {
        IncomingSource::BetterStack
    }

    // Open incidents are always current, however old: no `since` filter.
    fn fetch(&self, _since: DateTime<Utc>) -> BoxFuture<'_, AppResult<Vec<IncomingItem>>> {
        Box::pin(async move {
            let Some(token) = self.better_stack_account_service.token()? else {
                return Ok(Vec::new());
            };
            let open = self
                .better_stack_account_service
                .incidents(&token, &[("resolved", "false"), ("per_page", "50")])
                .await?;
            Ok(open.into_iter().filter_map(incident_item).collect())
        })
    }

    fn connection(&self) -> BoxFuture<'_, SourceConnection> {
        Box::pin(self.better_stack_account_service.connection())
    }

    fn connect_with_key(&self, key: String) -> BoxFuture<'_, AppResult<()>> {
        Box::pin(async move { self.better_stack_account_service.connect(&key).await })
    }

    fn disconnect(&self) -> AppResult<()> {
        self.better_stack_account_service.disconnect()
    }
}

/// An open incident as an item: urgent until acknowledged; its last change is the
/// acknowledgement (so archiving it brings it back if it's acknowledged later, and vice versa).
fn incident_item(incident: Incident) -> Option<IncomingItem> {
    let attributes = incident.attributes;
    if attributes.resolved_at.is_some() {
        return None;
    }
    let acknowledged = attributes.acknowledged_at.is_some();
    let title = attributes
        .name
        .clone()
        .filter(|name| !name.trim().is_empty())
        .or_else(|| attributes.cause.clone())
        .unwrap_or_else(|| format!("Incident {}", incident.id));
    let context = [attributes.cause.clone(), attributes.team_name.clone()]
        .into_iter()
        .flatten()
        .filter(|part| part != &title)
        .collect::<Vec<_>>()
        .join(" · ");
    Some(IncomingItem {
        id: IncomingSource::BetterStack.item_id(&incident.id),
        source: IncomingSource::BetterStack,
        reason: if acknowledged {
            "acknowledged".into()
        } else {
            "incident".into()
        },
        title,
        context,
        url: format!("{INCIDENT_URL}/{}", incident.id),
        updated_at: normalize_time(
            attributes
                .acknowledged_at
                .as_deref()
                .unwrap_or(&attributes.started_at),
        ),
        urgent: !acknowledged,
    })
}

/// Better Stack sends milliseconds; one format keeps sorting and archiving exact across sources.
fn normalize_time(time: &str) -> String {
    DateTime::parse_from_rfc3339(time)
        .map(|t| {
            t.with_timezone(&Utc)
                .to_rfc3339_opts(chrono::SecondsFormat::Secs, true)
        })
        .unwrap_or_else(|_| time.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::services::better_stack_account_service::IncidentAttributes;

    fn incident(id: &str, acknowledged: bool, resolved: bool) -> Incident {
        Incident {
            id: id.into(),
            attributes: IncidentAttributes {
                name: Some("user-api down".into()),
                cause: Some("Status 500".into()),
                started_at: "2026-10-14T10:00:00.123Z".into(),
                acknowledged_at: acknowledged.then(|| "2026-10-14T10:05:00.000Z".into()),
                resolved_at: resolved.then(|| "2026-10-14T10:30:00.000Z".into()),
                team_name: Some("NeoTaste".into()),
            },
        }
    }

    #[test]
    fn open_incidents_are_urgent_until_acknowledged() {
        let fresh = incident_item(incident("1", false, false)).expect("item");
        assert_eq!(fresh.id, "betterStack:1");
        assert!(fresh.urgent);
        assert_eq!(fresh.reason, "incident");
        assert_eq!(fresh.context, "Status 500 · NeoTaste");
        assert_eq!(fresh.updated_at, "2026-10-14T10:00:00Z");

        let acked = incident_item(incident("2", true, false)).expect("item");
        assert!(!acked.urgent);
        assert_eq!(acked.updated_at, "2026-10-14T10:05:00Z");

        assert!(incident_item(incident("3", false, true)).is_none());
    }
}
