//! The app's business logic: AI optimization, the DLP security filter, and auth
//! against the sync server. Transport to external systems lives in
//! [`crate::clients`]; persistence lives one level up in [`crate::repository`].

pub mod ai;
pub mod auth;
pub mod security;
pub mod session_token;
