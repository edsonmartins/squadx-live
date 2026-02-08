//! Authentication commands
//!
//! Handles all authentication operations securely in the backend.
//! Tokens are stored in the OS keychain and never exposed to the frontend.

use serde::{Deserialize, Serialize};
use tauri::State;

use crate::secure_storage::{
    self, clear_session, is_session_expired,
    store_session, SafeUserInfo, StoredSession,
};
use crate::state::{AppState, User};
use crate::{Error, Result};

// ==========================================
// Supabase Auth API Types
// ==========================================

#[derive(Debug, Serialize)]
struct SignInRequest {
    email: String,
    password: String,
}

#[derive(Debug, Deserialize)]
struct AuthResponse {
    access_token: String,
    refresh_token: String,
    expires_in: i64,
    token_type: String,
    user: SupabaseUser,
}

#[derive(Debug, Deserialize)]
struct SupabaseUser {
    id: String,
    email: Option<String>,
    #[serde(default)]
    email_confirmed_at: Option<String>,
}

#[derive(Debug, Deserialize)]
struct RefreshResponse {
    access_token: String,
    refresh_token: String,
    expires_in: i64,
    token_type: String,
    user: SupabaseUser,
}

#[derive(Debug, Deserialize)]
struct AuthError {
    error: Option<String>,
    error_description: Option<String>,
    msg: Option<String>,
    message: Option<String>,
}

// ==========================================
// Helper Functions
// ==========================================

fn get_supabase_url() -> Result<String> {
    std::env::var("VITE_SUPABASE_URL")
        .or_else(|_| std::env::var("NEXT_PUBLIC_SUPABASE_URL"))
        .or_else(|_| std::env::var("SUPABASE_URL"))
        .map_err(|_| Error::Config("SUPABASE_URL not configured".to_string()))
}

fn get_supabase_anon_key() -> Result<String> {
    std::env::var("VITE_SUPABASE_ANON_KEY")
        .or_else(|_| std::env::var("NEXT_PUBLIC_SUPABASE_ANON_KEY"))
        .or_else(|_| std::env::var("SUPABASE_ANON_KEY"))
        .map_err(|_| Error::Config("SUPABASE_ANON_KEY not configured".to_string()))
}

async fn update_app_state(state: &AppState, session: &StoredSession) {
    // Update internal state
    let mut inner = state.inner.write().await;
    inner.user = Some(User {
        id: session.user_id.clone(),
        email: session.email.clone(),
        access_token: session.access_token.clone(),
        refresh_token: session.refresh_token.clone(),
    });

    // Update Supabase client
    if let Some(ref supabase) = state.supabase {
        supabase
            .set_access_token(Some(session.access_token.clone()))
            .await;
    }
}

async fn clear_app_state(state: &AppState) {
    let mut inner = state.inner.write().await;
    inner.user = None;
    inner.session = None;

    if let Some(ref supabase) = state.supabase {
        supabase.set_access_token(None).await;
    }
}

// ==========================================
// Commands
// ==========================================

/// Sign in with email and password
/// Returns only safe user info (no tokens exposed to frontend)
#[tauri::command]
pub async fn login(
    email: String,
    password: String,
    state: State<'_, AppState>,
) -> Result<SafeUserInfo> {
    let supabase_url = get_supabase_url()?;
    let anon_key = get_supabase_anon_key()?;

    let client = reqwest::Client::new();
    let response = client
        .post(format!("{}/auth/v1/token?grant_type=password", supabase_url))
        .header("apikey", &anon_key)
        .header("Content-Type", "application/json")
        .json(&SignInRequest {
            email: email.clone(),
            password,
        })
        .send()
        .await
        .map_err(|e| Error::Network(format!("Failed to connect to auth server: {}", e)))?;

    if !response.status().is_success() {
        let status = response.status();
        let error_body: AuthError = response
            .json()
            .await
            .unwrap_or(AuthError {
                error: Some("Unknown error".to_string()),
                error_description: None,
                msg: None,
                message: None,
            });

        let error_msg = error_body
            .error_description
            .or(error_body.msg)
            .or(error_body.message)
            .or(error_body.error)
            .unwrap_or_else(|| format!("Authentication failed with status {}", status));

        return Err(Error::Auth(error_msg));
    }

    let auth_response: AuthResponse = response
        .json()
        .await
        .map_err(|e| Error::Parse(format!("Failed to parse auth response: {}", e)))?;

    // Calculate expiry timestamp
    let expires_at = chrono::Utc::now().timestamp() + auth_response.expires_in;

    // Store session securely
    let session = StoredSession {
        user_id: auth_response.user.id.clone(),
        email: auth_response.user.email.clone().unwrap_or(email),
        access_token: auth_response.access_token,
        refresh_token: auth_response.refresh_token,
        expires_at: Some(expires_at),
    };

    store_session(&session)?;
    update_app_state(&state, &session).await;

    tracing::info!("User {} logged in successfully", session.user_id);

    Ok(SafeUserInfo {
        id: session.user_id,
        email: session.email,
        is_authenticated: true,
    })
}

/// Sign up with email and password
#[tauri::command]
pub async fn signup(
    email: String,
    password: String,
    state: State<'_, AppState>,
) -> Result<SafeUserInfo> {
    let supabase_url = get_supabase_url()?;
    let anon_key = get_supabase_anon_key()?;

    let client = reqwest::Client::new();
    let response = client
        .post(format!("{}/auth/v1/signup", supabase_url))
        .header("apikey", &anon_key)
        .header("Content-Type", "application/json")
        .json(&SignInRequest {
            email: email.clone(),
            password,
        })
        .send()
        .await
        .map_err(|e| Error::Network(format!("Failed to connect to auth server: {}", e)))?;

    if !response.status().is_success() {
        let error_body: AuthError = response
            .json()
            .await
            .unwrap_or(AuthError {
                error: Some("Unknown error".to_string()),
                error_description: None,
                msg: None,
                message: None,
            });

        let error_msg = error_body
            .error_description
            .or(error_body.msg)
            .or(error_body.message)
            .or(error_body.error)
            .unwrap_or_else(|| "Sign up failed".to_string());

        return Err(Error::Auth(error_msg));
    }

    let auth_response: AuthResponse = response
        .json()
        .await
        .map_err(|e| Error::Parse(format!("Failed to parse auth response: {}", e)))?;

    // Calculate expiry timestamp
    let expires_at = chrono::Utc::now().timestamp() + auth_response.expires_in;

    // Store session securely
    let session = StoredSession {
        user_id: auth_response.user.id.clone(),
        email: auth_response.user.email.clone().unwrap_or(email),
        access_token: auth_response.access_token,
        refresh_token: auth_response.refresh_token,
        expires_at: Some(expires_at),
    };

    store_session(&session)?;
    update_app_state(&state, &session).await;

    tracing::info!("User {} signed up successfully", session.user_id);

    Ok(SafeUserInfo {
        id: session.user_id,
        email: session.email,
        is_authenticated: true,
    })
}

/// Logout and clear all stored credentials
#[tauri::command]
pub async fn logout(state: State<'_, AppState>) -> Result<()> {
    // Try to invalidate token on server (best effort)
    if let Some(session) = secure_storage::get_session() {
        if let (Ok(url), Ok(key)) = (get_supabase_url(), get_supabase_anon_key()) {
            let client = reqwest::Client::new();
            let _ = client
                .post(format!("{}/auth/v1/logout", url))
                .header("apikey", &key)
                .header("Authorization", format!("Bearer {}", session.access_token))
                .send()
                .await;
        }
    }

    // Clear local storage
    clear_session()?;
    clear_app_state(&state).await;

    tracing::info!("User logged out");
    Ok(())
}

/// Get current session info (safe, no tokens)
#[tauri::command]
pub async fn get_current_user(state: State<'_, AppState>) -> Result<Option<SafeUserInfo>> {
    // Check if already in state
    {
        let inner = state.inner.read().await;
        if let Some(ref user) = inner.user {
            return Ok(Some(SafeUserInfo {
                id: user.id.clone(),
                email: user.email.clone(),
                is_authenticated: true,
            }));
        }
    }

    // Try to restore from secure storage
    if let Some(session) = secure_storage::get_session() {
        // Check if token is expired
        if is_session_expired() {
            tracing::info!("Stored token is expired, attempting refresh");
            // Try to refresh
            match refresh_token_internal(&state).await {
                Ok(user_info) => return Ok(Some(user_info)),
                Err(e) => {
                    tracing::warn!("Token refresh failed: {}", e);
                    clear_session()?;
                    clear_app_state(&state).await;
                    return Ok(None);
                }
            }
        }

        // Validate token with Supabase
        if let Some(ref supabase) = state.supabase {
            match supabase.validate_token(&session.access_token).await {
                Ok(supabase_user) => {
                    tracing::info!("Token validated successfully");

                    // Update stored session with validated info
                    let updated_session = StoredSession {
                        user_id: supabase_user.id.clone(),
                        email: supabase_user.email.unwrap_or(session.email),
                        access_token: session.access_token,
                        refresh_token: session.refresh_token,
                        expires_at: session.expires_at,
                    };

                    update_app_state(&state, &updated_session).await;

                    return Ok(Some(SafeUserInfo {
                        id: updated_session.user_id,
                        email: updated_session.email,
                        is_authenticated: true,
                    }));
                }
                Err(e) => {
                    tracing::warn!("Token validation failed: {}, attempting refresh", e);
                    // Try to refresh
                    match refresh_token_internal(&state).await {
                        Ok(user_info) => return Ok(Some(user_info)),
                        Err(e) => {
                            tracing::warn!("Token refresh failed: {}", e);
                            clear_session()?;
                            clear_app_state(&state).await;
                            return Ok(None);
                        }
                    }
                }
            }
        }

        // No Supabase client (mock mode), trust stored session
        update_app_state(&state, &session).await;
        return Ok(Some(SafeUserInfo {
            id: session.user_id,
            email: session.email,
            is_authenticated: true,
        }));
    }

    Ok(None)
}

/// Refresh the access token using the refresh token
#[tauri::command]
pub async fn refresh_token(state: State<'_, AppState>) -> Result<SafeUserInfo> {
    refresh_token_internal(&state).await
}

async fn refresh_token_internal(state: &AppState) -> Result<SafeUserInfo> {
    let session = secure_storage::get_session()
        .ok_or_else(|| Error::Auth("No session to refresh".to_string()))?;

    let supabase_url = get_supabase_url()?;
    let anon_key = get_supabase_anon_key()?;

    let client = reqwest::Client::new();
    let response = client
        .post(format!(
            "{}/auth/v1/token?grant_type=refresh_token",
            supabase_url
        ))
        .header("apikey", &anon_key)
        .header("Content-Type", "application/json")
        .json(&serde_json::json!({
            "refresh_token": session.refresh_token
        }))
        .send()
        .await
        .map_err(|e| Error::Network(format!("Failed to refresh token: {}", e)))?;

    if !response.status().is_success() {
        return Err(Error::Auth("Token refresh failed".to_string()));
    }

    let refresh_response: RefreshResponse = response
        .json()
        .await
        .map_err(|e| Error::Parse(format!("Failed to parse refresh response: {}", e)))?;

    // Calculate new expiry
    let expires_at = chrono::Utc::now().timestamp() + refresh_response.expires_in;

    // Store updated session
    let new_session = StoredSession {
        user_id: refresh_response.user.id.clone(),
        email: refresh_response
            .user
            .email
            .clone()
            .unwrap_or(session.email),
        access_token: refresh_response.access_token,
        refresh_token: refresh_response.refresh_token,
        expires_at: Some(expires_at),
    };

    store_session(&new_session)?;
    update_app_state(state, &new_session).await;

    tracing::info!("Token refreshed successfully");

    Ok(SafeUserInfo {
        id: new_session.user_id,
        email: new_session.email,
        is_authenticated: true,
    })
}

/// Check if user is authenticated (without validating token)
#[tauri::command]
pub async fn is_authenticated(state: State<'_, AppState>) -> Result<bool> {
    let inner = state.inner.read().await;
    if inner.user.is_some() {
        return Ok(true);
    }
    drop(inner);

    Ok(secure_storage::has_stored_credentials())
}

/// Validate the current token (triggers refresh if needed)
#[tauri::command]
pub async fn validate_token(state: State<'_, AppState>) -> Result<bool> {
    // This now just checks if we have a valid session
    match get_current_user(state).await? {
        Some(_) => Ok(true),
        None => Ok(false),
    }
}

/// Get the access token (for internal use by other commands)
/// This should NOT be called from frontend
pub async fn get_access_token_internal(state: &AppState) -> Option<String> {
    // First check state
    {
        let inner = state.inner.read().await;
        if let Some(ref user) = inner.user {
            return Some(user.access_token.clone());
        }
    }

    // Fall back to secure storage
    secure_storage::get_credential(secure_storage::CredentialKey::AccessToken)
}
