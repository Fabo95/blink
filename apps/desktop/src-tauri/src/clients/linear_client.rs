//! Client for Linear's GraphQL API — the only thing that talks to it. Authenticated with the
//! user's personal API key (passed in by the service, which owns where it's stored). Returns
//! the raw response for the service to parse.

use reqwest::Response;
use serde_json::json;

const GRAPHQL_URL: &str = "https://api.linear.app/graphql";

#[derive(Clone)]
pub struct LinearClient {
    http: reqwest::Client,
}

impl LinearClient {
    pub fn new() -> Self {
        Self {
            http: reqwest::Client::new(),
        }
    }

    /// Run a GraphQL query as the key's owner. Personal keys go in `Authorization` as-is —
    /// no `Bearer` prefix (that's only for OAuth tokens).
    pub async fn graphql(
        &self,
        api_key: &str,
        query: &str,
        variables: serde_json::Value,
    ) -> reqwest::Result<Response> {
        self.http
            .post(GRAPHQL_URL)
            .header(reqwest::header::AUTHORIZATION, api_key)
            .json(&json!({ "query": query, "variables": variables }))
            .send()
            .await
    }
}
