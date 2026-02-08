use tauri::State;

use crate::state::{AppState, Session, SessionStatus};
use crate::{Error, Result};

#[derive(serde::Serialize)]
pub struct SessionInfo {
    pub id: String,
    pub join_code: String,
    pub is_host: bool,
    pub status: String,
}

#[tauri::command]
pub async fn create_session(state: State<'_, AppState>) -> Result<SessionInfo> {
    let inner = state.inner.read().await;
    let user = inner
        .user
        .as_ref()
        .ok_or_else(|| Error::Auth("Not authenticated".to_string()))?;
    let user_id = user.id.clone();
    drop(inner);

    let join_code = generate_join_code();

    // Try to create session in Supabase if configured
    let session = if let Some(ref supabase) = state.supabase {
        match supabase.create_session(&user_id, &join_code).await {
            Ok(row) => {
                tracing::info!("Session created in Supabase: {}", row.id);
                Session {
                    id: row.id,
                    join_code: row.join_code,
                    is_host: true,
                    status: SessionStatus::Active,
                }
            }
            Err(e) => {
                tracing::warn!("Failed to create session in Supabase: {}, using local session", e);
                // Fallback to local session
                Session {
                    id: uuid::Uuid::new_v4().to_string(),
                    join_code,
                    is_host: true,
                    status: SessionStatus::Active,
                }
            }
        }
    } else {
        // Mock mode - create local session
        Session {
            id: uuid::Uuid::new_v4().to_string(),
            join_code,
            is_host: true,
            status: SessionStatus::Active,
        }
    };

    let info = SessionInfo {
        id: session.id.clone(),
        join_code: session.join_code.clone(),
        is_host: session.is_host,
        status: "active".to_string(),
    };

    let mut inner = state.inner.write().await;
    inner.session = Some(session);

    tracing::info!("Session created: {}", info.id);
    Ok(info)
}

#[tauri::command]
pub async fn join_session(join_code: String, state: State<'_, AppState>) -> Result<SessionInfo> {
    let inner = state.inner.read().await;
    if inner.user.is_none() {
        return Err(Error::Auth("Not authenticated".to_string()));
    }
    drop(inner);

    // Try to find session in Supabase if configured
    let session = if let Some(ref supabase) = state.supabase {
        match supabase.get_session_by_code(&join_code).await {
            Ok(Some(row)) => {
                tracing::info!("Found session in Supabase: {}", row.id);
                Session {
                    id: row.id,
                    join_code: row.join_code,
                    is_host: false,
                    status: SessionStatus::Active,
                }
            }
            Ok(None) => {
                return Err(Error::Session(format!(
                    "Session with code '{}' not found or inactive",
                    join_code
                )));
            }
            Err(e) => {
                tracing::warn!("Failed to find session in Supabase: {}, using local session", e);
                // Fallback to local session (for development)
                Session {
                    id: uuid::Uuid::new_v4().to_string(),
                    join_code,
                    is_host: false,
                    status: SessionStatus::Active,
                }
            }
        }
    } else {
        // Mock mode - create local session as viewer
        Session {
            id: uuid::Uuid::new_v4().to_string(),
            join_code,
            is_host: false,
            status: SessionStatus::Active,
        }
    };

    let info = SessionInfo {
        id: session.id.clone(),
        join_code: session.join_code.clone(),
        is_host: session.is_host,
        status: "active".to_string(),
    };

    let mut inner = state.inner.write().await;
    inner.session = Some(session);

    tracing::info!("Joined session: {}", info.id);
    Ok(info)
}

#[tauri::command]
pub async fn end_session(state: State<'_, AppState>) -> Result<()> {
    let mut inner = state.inner.write().await;

    if let Some(session) = &inner.session {
        tracing::info!("Ending session: {}", session.id);

        // Update session status in Supabase if configured and is host
        if session.is_host {
            if let Some(ref supabase) = state.supabase {
                if let Err(e) = supabase.end_session(&session.id).await {
                    tracing::warn!("Failed to end session in Supabase: {}", e);
                }
            }
        }
    }

    inner.session = None;
    inner.is_capturing = false;
    inner.is_input_enabled = false;

    Ok(())
}

#[tauri::command]
pub async fn get_session_status(state: State<'_, AppState>) -> Result<Option<SessionInfo>> {
    let inner = state.inner.read().await;

    Ok(inner.session.as_ref().map(|s| SessionInfo {
        id: s.id.clone(),
        join_code: s.join_code.clone(),
        is_host: s.is_host,
        status: match s.status {
            SessionStatus::Active => "active",
            SessionStatus::Paused => "paused",
            SessionStatus::Ended => "ended",
        }
        .to_string(),
    }))
}

fn generate_join_code() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};

    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_millis();

    // Generate a 6-character alphanumeric code
    let chars: Vec<char> = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789".chars().collect();
    let mut code = String::new();
    let mut n = timestamp;

    for _ in 0..6 {
        code.push(chars[(n % chars.len() as u128) as usize]);
        n /= chars.len() as u128;
    }

    code
}
