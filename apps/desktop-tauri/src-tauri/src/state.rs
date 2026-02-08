use std::sync::Arc;
use tokio::sync::RwLock;

use crate::cache::SharedCache;
use crate::supabase::SupabaseClient;

#[derive(Debug, Clone)]
pub struct AppState {
    pub inner: Arc<RwLock<AppStateInner>>,
    pub supabase: Option<SupabaseClient>,
    pub cache: SharedCache,
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            inner: Arc::new(RwLock::new(AppStateInner::default())),
            supabase: SupabaseClient::from_env_optional(),
            cache: crate::cache::create_shared_cache(),
        }
    }
}

#[derive(Debug, Default)]
pub struct AppStateInner {
    pub user: Option<User>,
    pub session: Option<Session>,
    pub is_capturing: bool,
    pub is_input_enabled: bool,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct User {
    pub id: String,
    pub email: String,
    pub access_token: String,
    pub refresh_token: String,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct Session {
    pub id: String,
    pub join_code: String,
    pub is_host: bool,
    pub status: SessionStatus,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SessionStatus {
    Active,
    Paused,
    Ended,
}

impl Default for SessionStatus {
    fn default() -> Self {
        Self::Active
    }
}
