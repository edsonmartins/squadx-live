//! Secure storage for sensitive data using OS keychain
//!
//! This module provides secure storage for authentication tokens
//! and other sensitive data using the OS-native keychain/credential store.

use keyring::Entry;
use serde::{Deserialize, Serialize};

use crate::{Error, Result};

const SERVICE_NAME: &str = "com.pairux.desktop";

/// Keys for stored credentials
#[derive(Debug, Clone, Copy)]
pub enum CredentialKey {
    AccessToken,
    RefreshToken,
    UserId,
    Email,
    TokenExpiry,
}

impl CredentialKey {
    fn as_str(&self) -> &'static str {
        match self {
            CredentialKey::AccessToken => "access_token",
            CredentialKey::RefreshToken => "refresh_token",
            CredentialKey::UserId => "user_id",
            CredentialKey::Email => "email",
            CredentialKey::TokenExpiry => "token_expiry",
        }
    }
}

/// Stored session data (for internal use only)
#[derive(Debug, Clone)]
pub struct StoredSession {
    pub user_id: String,
    pub email: String,
    pub access_token: String,
    pub refresh_token: String,
    pub expires_at: Option<i64>,
}

/// Public user info (safe to return to frontend)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SafeUserInfo {
    pub id: String,
    pub email: String,
    pub is_authenticated: bool,
}

/// Store a credential securely in the keychain
pub fn store_credential(key: CredentialKey, value: &str) -> Result<()> {
    let entry = Entry::new(SERVICE_NAME, key.as_str())
        .map_err(|e| Error::Storage(format!("Failed to create keyring entry: {}", e)))?;

    entry
        .set_password(value)
        .map_err(|e| Error::Storage(format!("Failed to store credential: {}", e)))?;

    Ok(())
}

/// Retrieve a credential from the keychain
pub fn get_credential(key: CredentialKey) -> Option<String> {
    Entry::new(SERVICE_NAME, key.as_str())
        .ok()
        .and_then(|e| e.get_password().ok())
}

/// Delete a credential from the keychain
pub fn delete_credential(key: CredentialKey) -> Result<()> {
    if let Ok(entry) = Entry::new(SERVICE_NAME, key.as_str()) {
        // Ignore errors if credential doesn't exist
        let _ = entry.delete_credential();
    }
    Ok(())
}

/// Store a complete session
pub fn store_session(session: &StoredSession) -> Result<()> {
    store_credential(CredentialKey::AccessToken, &session.access_token)?;
    store_credential(CredentialKey::RefreshToken, &session.refresh_token)?;
    store_credential(CredentialKey::UserId, &session.user_id)?;
    store_credential(CredentialKey::Email, &session.email)?;

    if let Some(expires_at) = session.expires_at {
        store_credential(CredentialKey::TokenExpiry, &expires_at.to_string())?;
    }

    tracing::debug!("Session stored securely in keychain");
    Ok(())
}

/// Retrieve a complete session
pub fn get_session() -> Option<StoredSession> {
    let access_token = get_credential(CredentialKey::AccessToken)?;
    let refresh_token = get_credential(CredentialKey::RefreshToken)?;
    let user_id = get_credential(CredentialKey::UserId)?;
    let email = get_credential(CredentialKey::Email)?;
    let expires_at = get_credential(CredentialKey::TokenExpiry)
        .and_then(|s| s.parse::<i64>().ok());

    Some(StoredSession {
        user_id,
        email,
        access_token,
        refresh_token,
        expires_at,
    })
}

/// Clear all stored session data
pub fn clear_session() -> Result<()> {
    delete_credential(CredentialKey::AccessToken)?;
    delete_credential(CredentialKey::RefreshToken)?;
    delete_credential(CredentialKey::UserId)?;
    delete_credential(CredentialKey::Email)?;
    delete_credential(CredentialKey::TokenExpiry)?;

    tracing::debug!("Session cleared from keychain");
    Ok(())
}

/// Get safe user info (without tokens)
pub fn get_safe_user_info() -> Option<SafeUserInfo> {
    let user_id = get_credential(CredentialKey::UserId)?;
    let email = get_credential(CredentialKey::Email)?;

    Some(SafeUserInfo {
        id: user_id,
        email,
        is_authenticated: true,
    })
}

/// Check if session is expired
pub fn is_session_expired() -> bool {
    if let Some(expires_at) = get_credential(CredentialKey::TokenExpiry) {
        if let Ok(expiry) = expires_at.parse::<i64>() {
            let now = chrono::Utc::now().timestamp();
            // Consider expired if less than 5 minutes remaining
            return now >= (expiry - 300);
        }
    }
    // If no expiry stored, assume not expired
    false
}

/// Check if we have stored credentials
pub fn has_stored_credentials() -> bool {
    get_credential(CredentialKey::AccessToken).is_some()
        && get_credential(CredentialKey::RefreshToken).is_some()
}

#[cfg(test)]
mod tests {
    use super::*;

    // Note: These tests require access to the OS keychain
    // They may fail in CI environments without proper setup

    #[test]
    #[ignore] // Requires keychain access
    fn test_store_and_retrieve() {
        let key = CredentialKey::AccessToken;
        let value = "test_token_12345";

        store_credential(key, value).unwrap();
        let retrieved = get_credential(key);

        assert_eq!(retrieved, Some(value.to_string()));

        delete_credential(key).unwrap();
        assert!(get_credential(key).is_none());
    }
}
