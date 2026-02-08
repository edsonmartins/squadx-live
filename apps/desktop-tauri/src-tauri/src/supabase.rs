use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tokio::sync::RwLock;

use crate::{Error, Result};

const SUPABASE_URL_ENV: &str = "VITE_SUPABASE_URL";
const SUPABASE_ANON_KEY_ENV: &str = "VITE_SUPABASE_ANON_KEY";

#[derive(Debug, Clone)]
pub struct SupabaseClient {
    inner: Arc<SupabaseClientInner>,
}

#[derive(Debug)]
struct SupabaseClientInner {
    client: Client,
    base_url: String,
    anon_key: String,
    access_token: RwLock<Option<String>>,
}

#[derive(Debug, Deserialize)]
pub struct SupabaseUser {
    pub id: String,
    pub email: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SessionRow {
    pub id: String,
    pub host_id: String,
    pub join_code: String,
    pub status: String,
    pub created_at: Option<String>,
}

#[derive(Debug, Serialize)]
struct CreateSessionPayload {
    host_id: String,
    join_code: String,
    status: String,
}

// ==========================================
// Chat-related types
// ==========================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConversationRow {
    pub id: String,
    #[serde(rename = "type")]
    pub conversation_type: String,
    pub name: Option<String>,
    pub avatar_url: Option<String>,
    pub created_by: Option<String>,
    pub created_at: Option<String>,
    pub updated_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConversationParticipantRow {
    pub id: String,
    pub conversation_id: String,
    pub user_id: String,
    pub role: String,
    pub joined_at: Option<String>,
    pub last_read_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MessageRow {
    pub id: String,
    pub conversation_id: String,
    pub sender_id: Option<String>,
    pub content: String,
    pub message_type: String,
    pub created_at: Option<String>,
    pub updated_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserProfileRow {
    pub user_id: String,
    pub display_name: Option<String>,
    pub avatar_url: Option<String>,
    pub created_at: Option<String>,
    pub updated_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserPresenceRow {
    pub user_id: String,
    pub status: String,
    pub last_seen_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ParticipantWithProfile {
    pub user_id: String,
    pub display_name: String,
    pub avatar_url: Option<String>,
    pub role: String,
    pub is_online: bool,
    pub last_seen_at: Option<String>,
}

#[derive(Debug, Serialize)]
struct CreateConversationPayload {
    #[serde(rename = "type")]
    conversation_type: String,
    name: Option<String>,
    created_by: String,
}

#[derive(Debug, Serialize)]
struct AddParticipantPayload {
    conversation_id: String,
    user_id: String,
    role: String,
}

#[derive(Debug, Serialize)]
struct CreateMessagePayload {
    conversation_id: String,
    sender_id: String,
    content: String,
    message_type: String,
}

// ==========================================
// Calendar-related types
// ==========================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MeetingRow {
    pub id: String,
    pub organizer_id: String,
    pub title: String,
    pub description: Option<String>,
    pub scheduled_at: String,
    pub duration_minutes: i32,
    pub status: String,
    pub session_id: Option<String>,
    pub recurrence_rule: Option<String>,
    pub recurrence_parent_id: Option<String>,
    pub google_event_id: Option<String>,
    pub google_calendar_id: Option<String>,
    pub reminder_sent: Option<bool>,
    pub created_at: Option<String>,
    pub updated_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MeetingAttendeeRow {
    pub id: String,
    pub meeting_id: String,
    pub user_id: String,
    pub response_status: String,
    pub responded_at: Option<String>,
    pub notification_sent: Option<bool>,
    pub created_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AttendeeWithProfile {
    pub user_id: String,
    pub display_name: String,
    pub avatar_url: Option<String>,
    pub response_status: String,
    pub responded_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GoogleTokensRow {
    pub user_id: String,
    pub access_token: String,
    pub refresh_token: String,
    pub expires_at: String,
    pub calendar_id: Option<String>,
    pub email: Option<String>,
    pub sync_enabled: Option<bool>,
}

#[derive(Debug, Serialize)]
struct CreateMeetingPayload {
    organizer_id: String,
    title: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    description: Option<String>,
    scheduled_at: String,
    duration_minutes: i32,
    #[serde(skip_serializing_if = "Option::is_none")]
    recurrence_rule: Option<String>,
}

#[derive(Debug, Serialize)]
struct AddMeetingAttendeePayload {
    meeting_id: String,
    user_id: String,
    response_status: String,
}

impl SupabaseClient {
    pub fn new() -> Result<Self> {
        let base_url = std::env::var(SUPABASE_URL_ENV)
            .or_else(|_| std::env::var("NEXT_PUBLIC_SUPABASE_URL"))
            .map_err(|_| Error::Config("SUPABASE_URL not set".to_string()))?;

        let anon_key = std::env::var(SUPABASE_ANON_KEY_ENV)
            .or_else(|_| std::env::var("NEXT_PUBLIC_SUPABASE_ANON_KEY"))
            .map_err(|_| Error::Config("SUPABASE_ANON_KEY not set".to_string()))?;

        let client = Client::builder()
            .build()
            .map_err(|e| Error::Network(e.to_string()))?;

        Ok(Self {
            inner: Arc::new(SupabaseClientInner {
                client,
                base_url,
                anon_key,
                access_token: RwLock::new(None),
            }),
        })
    }

    pub fn from_env_optional() -> Option<Self> {
        Self::new().ok()
    }

    pub async fn set_access_token(&self, token: Option<String>) {
        let mut access_token = self.inner.access_token.write().await;
        *access_token = token;
    }

    pub async fn get_access_token(&self) -> Option<String> {
        let access_token = self.inner.access_token.read().await;
        access_token.clone()
    }

    /// Validate the access token by calling /auth/v1/user
    pub async fn validate_token(&self, token: &str) -> Result<SupabaseUser> {
        let url = format!("{}/auth/v1/user", self.inner.base_url);

        let response = self
            .inner
            .client
            .get(&url)
            .header("apikey", &self.inner.anon_key)
            .header("Authorization", format!("Bearer {}", token))
            .send()
            .await
            .map_err(|e| Error::Network(e.to_string()))?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            return Err(Error::Auth(format!(
                "Token validation failed: {} - {}",
                status, body
            )));
        }

        let user: SupabaseUser = response
            .json()
            .await
            .map_err(|e| Error::Parse(e.to_string()))?;

        Ok(user)
    }

    /// Create a new session in the database
    pub async fn create_session(&self, host_id: &str, join_code: &str) -> Result<SessionRow> {
        let token = self
            .get_access_token()
            .await
            .ok_or_else(|| Error::Auth("Not authenticated".to_string()))?;

        let url = format!("{}/rest/v1/sessions", self.inner.base_url);

        let payload = CreateSessionPayload {
            host_id: host_id.to_string(),
            join_code: join_code.to_string(),
            status: "active".to_string(),
        };

        let response = self
            .inner
            .client
            .post(&url)
            .header("apikey", &self.inner.anon_key)
            .header("Authorization", format!("Bearer {}", token))
            .header("Content-Type", "application/json")
            .header("Prefer", "return=representation")
            .json(&payload)
            .send()
            .await
            .map_err(|e| Error::Network(e.to_string()))?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            return Err(Error::Database(format!(
                "Failed to create session: {} - {}",
                status, body
            )));
        }

        let sessions: Vec<SessionRow> = response
            .json()
            .await
            .map_err(|e| Error::Parse(e.to_string()))?;

        sessions
            .into_iter()
            .next()
            .ok_or_else(|| Error::Database("No session returned".to_string()))
    }

    /// Get a session by join code
    pub async fn get_session_by_code(&self, join_code: &str) -> Result<Option<SessionRow>> {
        let token = self
            .get_access_token()
            .await
            .ok_or_else(|| Error::Auth("Not authenticated".to_string()))?;

        let url = format!(
            "{}/rest/v1/sessions?join_code=eq.{}&status=eq.active&limit=1",
            self.inner.base_url, join_code
        );

        let response = self
            .inner
            .client
            .get(&url)
            .header("apikey", &self.inner.anon_key)
            .header("Authorization", format!("Bearer {}", token))
            .send()
            .await
            .map_err(|e| Error::Network(e.to_string()))?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            return Err(Error::Database(format!(
                "Failed to get session: {} - {}",
                status, body
            )));
        }

        let sessions: Vec<SessionRow> = response
            .json()
            .await
            .map_err(|e| Error::Parse(e.to_string()))?;

        Ok(sessions.into_iter().next())
    }

    /// Update session status
    pub async fn update_session_status(&self, session_id: &str, status: &str) -> Result<()> {
        let token = self
            .get_access_token()
            .await
            .ok_or_else(|| Error::Auth("Not authenticated".to_string()))?;

        let url = format!(
            "{}/rest/v1/sessions?id=eq.{}",
            self.inner.base_url, session_id
        );

        #[derive(Serialize)]
        struct StatusUpdate {
            status: String,
        }

        let response = self
            .inner
            .client
            .patch(&url)
            .header("apikey", &self.inner.anon_key)
            .header("Authorization", format!("Bearer {}", token))
            .header("Content-Type", "application/json")
            .json(&StatusUpdate {
                status: status.to_string(),
            })
            .send()
            .await
            .map_err(|e| Error::Network(e.to_string()))?;

        if !response.status().is_success() {
            let status_code = response.status();
            let body = response.text().await.unwrap_or_default();
            return Err(Error::Database(format!(
                "Failed to update session: {} - {}",
                status_code, body
            )));
        }

        Ok(())
    }

    /// End a session
    pub async fn end_session(&self, session_id: &str) -> Result<()> {
        self.update_session_status(session_id, "ended").await
    }

    // ==========================================
    // Chat-related methods
    // ==========================================

    /// Get all conversations for the current user
    pub async fn get_user_conversations(&self, user_id: &str) -> Result<Vec<ConversationRow>> {
        let token = self
            .get_access_token()
            .await
            .ok_or_else(|| Error::Auth("Not authenticated".to_string()))?;

        // Get conversation IDs where user is a participant
        let url = format!(
            "{}/rest/v1/conversation_participants?user_id=eq.{}&select=conversation_id",
            self.inner.base_url, user_id
        );

        let response = self
            .inner
            .client
            .get(&url)
            .header("apikey", &self.inner.anon_key)
            .header("Authorization", format!("Bearer {}", token))
            .send()
            .await
            .map_err(|e| Error::Network(e.to_string()))?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            return Err(Error::Database(format!(
                "Failed to get conversations: {} - {}",
                status, body
            )));
        }

        #[derive(Deserialize)]
        struct ParticipantRow {
            conversation_id: String,
        }

        let participants: Vec<ParticipantRow> = response
            .json()
            .await
            .map_err(|e| Error::Parse(e.to_string()))?;

        if participants.is_empty() {
            return Ok(vec![]);
        }

        // Get full conversation details
        let conv_ids: Vec<String> = participants.iter().map(|p| p.conversation_id.clone()).collect();
        let ids_param = conv_ids.join(",");

        let url = format!(
            "{}/rest/v1/conversations?id=in.({})",
            self.inner.base_url, ids_param
        );

        let response = self
            .inner
            .client
            .get(&url)
            .header("apikey", &self.inner.anon_key)
            .header("Authorization", format!("Bearer {}", token))
            .send()
            .await
            .map_err(|e| Error::Network(e.to_string()))?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            return Err(Error::Database(format!(
                "Failed to get conversation details: {} - {}",
                status, body
            )));
        }

        let conversations: Vec<ConversationRow> = response
            .json()
            .await
            .map_err(|e| Error::Parse(e.to_string()))?;

        Ok(conversations)
    }

    /// Create a new conversation
    pub async fn create_conversation(
        &self,
        conversation_type: &str,
        name: Option<&str>,
        created_by: &str,
    ) -> Result<ConversationRow> {
        let token = self
            .get_access_token()
            .await
            .ok_or_else(|| Error::Auth("Not authenticated".to_string()))?;

        let url = format!("{}/rest/v1/conversations", self.inner.base_url);

        let payload = CreateConversationPayload {
            conversation_type: conversation_type.to_string(),
            name: name.map(|s| s.to_string()),
            created_by: created_by.to_string(),
        };

        let response = self
            .inner
            .client
            .post(&url)
            .header("apikey", &self.inner.anon_key)
            .header("Authorization", format!("Bearer {}", token))
            .header("Content-Type", "application/json")
            .header("Prefer", "return=representation")
            .json(&payload)
            .send()
            .await
            .map_err(|e| Error::Network(e.to_string()))?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            return Err(Error::Database(format!(
                "Failed to create conversation: {} - {}",
                status, body
            )));
        }

        let conversations: Vec<ConversationRow> = response
            .json()
            .await
            .map_err(|e| Error::Parse(e.to_string()))?;

        conversations
            .into_iter()
            .next()
            .ok_or_else(|| Error::Database("No conversation returned".to_string()))
    }

    /// Add a participant to a conversation
    pub async fn add_participant(
        &self,
        conversation_id: &str,
        user_id: &str,
        role: &str,
    ) -> Result<()> {
        let token = self
            .get_access_token()
            .await
            .ok_or_else(|| Error::Auth("Not authenticated".to_string()))?;

        let url = format!("{}/rest/v1/conversation_participants", self.inner.base_url);

        let payload = AddParticipantPayload {
            conversation_id: conversation_id.to_string(),
            user_id: user_id.to_string(),
            role: role.to_string(),
        };

        let response = self
            .inner
            .client
            .post(&url)
            .header("apikey", &self.inner.anon_key)
            .header("Authorization", format!("Bearer {}", token))
            .header("Content-Type", "application/json")
            .json(&payload)
            .send()
            .await
            .map_err(|e| Error::Network(e.to_string()))?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            return Err(Error::Database(format!(
                "Failed to add participant: {} - {}",
                status, body
            )));
        }

        Ok(())
    }

    /// Remove a participant from a conversation
    pub async fn remove_participant(
        &self,
        conversation_id: &str,
        user_id: &str,
    ) -> Result<()> {
        let token = self
            .get_access_token()
            .await
            .ok_or_else(|| Error::Auth("Not authenticated".to_string()))?;

        let url = format!(
            "{}/rest/v1/conversation_participants?conversation_id=eq.{}&user_id=eq.{}",
            self.inner.base_url, conversation_id, user_id
        );

        let response = self
            .inner
            .client
            .delete(&url)
            .header("apikey", &self.inner.anon_key)
            .header("Authorization", format!("Bearer {}", token))
            .send()
            .await
            .map_err(|e| Error::Network(e.to_string()))?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            return Err(Error::Database(format!(
                "Failed to remove participant: {} - {}",
                status, body
            )));
        }

        Ok(())
    }

    /// Get participants of a conversation
    pub async fn get_conversation_participants(
        &self,
        conversation_id: &str,
    ) -> Result<Vec<ParticipantWithProfile>> {
        let token = self
            .get_access_token()
            .await
            .ok_or_else(|| Error::Auth("Not authenticated".to_string()))?;

        // Get participants
        let url = format!(
            "{}/rest/v1/conversation_participants?conversation_id=eq.{}",
            self.inner.base_url, conversation_id
        );

        let response = self
            .inner
            .client
            .get(&url)
            .header("apikey", &self.inner.anon_key)
            .header("Authorization", format!("Bearer {}", token))
            .send()
            .await
            .map_err(|e| Error::Network(e.to_string()))?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            return Err(Error::Database(format!(
                "Failed to get participants: {} - {}",
                status, body
            )));
        }

        let participants: Vec<ConversationParticipantRow> = response
            .json()
            .await
            .map_err(|e| Error::Parse(e.to_string()))?;

        // Get user profiles for participants
        let user_ids: Vec<String> = participants.iter().map(|p| p.user_id.clone()).collect();
        if user_ids.is_empty() {
            return Ok(vec![]);
        }

        let profiles = self.get_user_profiles(&user_ids).await?;
        let presence = self.get_users_presence(&user_ids).await?;

        // Combine participants with profiles
        let result: Vec<ParticipantWithProfile> = participants
            .into_iter()
            .map(|p| {
                let profile = profiles.iter().find(|pr| pr.user_id == p.user_id);
                let pres = presence.iter().find(|pr| pr.user_id == p.user_id);
                ParticipantWithProfile {
                    user_id: p.user_id.clone(),
                    display_name: profile
                        .and_then(|pr| pr.display_name.clone())
                        .unwrap_or_else(|| p.user_id.clone()),
                    avatar_url: profile.and_then(|pr| pr.avatar_url.clone()),
                    role: p.role,
                    is_online: pres.map(|pr| pr.status == "online").unwrap_or(false),
                    last_seen_at: pres.and_then(|pr| pr.last_seen_at.clone()),
                }
            })
            .collect();

        Ok(result)
    }

    /// Get user profiles by IDs
    pub async fn get_user_profiles(&self, user_ids: &[String]) -> Result<Vec<UserProfileRow>> {
        let token = self
            .get_access_token()
            .await
            .ok_or_else(|| Error::Auth("Not authenticated".to_string()))?;

        let ids_param = user_ids.join(",");
        let url = format!(
            "{}/rest/v1/user_profiles?user_id=in.({})",
            self.inner.base_url, ids_param
        );

        let response = self
            .inner
            .client
            .get(&url)
            .header("apikey", &self.inner.anon_key)
            .header("Authorization", format!("Bearer {}", token))
            .send()
            .await
            .map_err(|e| Error::Network(e.to_string()))?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            return Err(Error::Database(format!(
                "Failed to get user profiles: {} - {}",
                status, body
            )));
        }

        let profiles: Vec<UserProfileRow> = response
            .json()
            .await
            .map_err(|e| Error::Parse(e.to_string()))?;

        Ok(profiles)
    }

    /// Get presence status for users
    pub async fn get_users_presence(&self, user_ids: &[String]) -> Result<Vec<UserPresenceRow>> {
        let token = self
            .get_access_token()
            .await
            .ok_or_else(|| Error::Auth("Not authenticated".to_string()))?;

        let ids_param = user_ids.join(",");
        let url = format!(
            "{}/rest/v1/user_presence?user_id=in.({})",
            self.inner.base_url, ids_param
        );

        let response = self
            .inner
            .client
            .get(&url)
            .header("apikey", &self.inner.anon_key)
            .header("Authorization", format!("Bearer {}", token))
            .send()
            .await
            .map_err(|e| Error::Network(e.to_string()))?;

        if !response.status().is_success() {
            // Return empty if presence table doesn't exist yet
            return Ok(vec![]);
        }

        let presence: Vec<UserPresenceRow> = response
            .json()
            .await
            .map_err(|e| Error::Parse(e.to_string()))?;

        Ok(presence)
    }

    /// Get messages for a conversation
    pub async fn get_messages(
        &self,
        conversation_id: &str,
        limit: u32,
        before: Option<&str>,
    ) -> Result<Vec<MessageRow>> {
        let token = self
            .get_access_token()
            .await
            .ok_or_else(|| Error::Auth("Not authenticated".to_string()))?;

        let mut url = format!(
            "{}/rest/v1/messages?conversation_id=eq.{}&order=created_at.desc&limit={}",
            self.inner.base_url, conversation_id, limit
        );

        if let Some(before_id) = before {
            url.push_str(&format!("&created_at=lt.{}", before_id));
        }

        let response = self
            .inner
            .client
            .get(&url)
            .header("apikey", &self.inner.anon_key)
            .header("Authorization", format!("Bearer {}", token))
            .send()
            .await
            .map_err(|e| Error::Network(e.to_string()))?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            return Err(Error::Database(format!(
                "Failed to get messages: {} - {}",
                status, body
            )));
        }

        let messages: Vec<MessageRow> = response
            .json()
            .await
            .map_err(|e| Error::Parse(e.to_string()))?;

        Ok(messages)
    }

    /// Create a new message
    pub async fn create_message(
        &self,
        conversation_id: &str,
        sender_id: &str,
        content: &str,
        message_type: &str,
    ) -> Result<MessageRow> {
        let token = self
            .get_access_token()
            .await
            .ok_or_else(|| Error::Auth("Not authenticated".to_string()))?;

        let url = format!("{}/rest/v1/messages", self.inner.base_url);

        let payload = CreateMessagePayload {
            conversation_id: conversation_id.to_string(),
            sender_id: sender_id.to_string(),
            content: content.to_string(),
            message_type: message_type.to_string(),
        };

        let response = self
            .inner
            .client
            .post(&url)
            .header("apikey", &self.inner.anon_key)
            .header("Authorization", format!("Bearer {}", token))
            .header("Content-Type", "application/json")
            .header("Prefer", "return=representation")
            .json(&payload)
            .send()
            .await
            .map_err(|e| Error::Network(e.to_string()))?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            return Err(Error::Database(format!(
                "Failed to create message: {} - {}",
                status, body
            )));
        }

        let messages: Vec<MessageRow> = response
            .json()
            .await
            .map_err(|e| Error::Parse(e.to_string()))?;

        messages
            .into_iter()
            .next()
            .ok_or_else(|| Error::Database("No message returned".to_string()))
    }

    /// Update user presence status
    pub async fn update_presence(&self, user_id: &str, status: &str) -> Result<()> {
        let token = self
            .get_access_token()
            .await
            .ok_or_else(|| Error::Auth("Not authenticated".to_string()))?;

        let url = format!("{}/rest/v1/user_presence", self.inner.base_url);

        #[derive(Serialize)]
        struct PresencePayload {
            user_id: String,
            status: String,
            last_seen_at: String,
        }

        let payload = PresencePayload {
            user_id: user_id.to_string(),
            status: status.to_string(),
            last_seen_at: chrono::Utc::now().to_rfc3339(),
        };

        // Use upsert
        let response = self
            .inner
            .client
            .post(&url)
            .header("apikey", &self.inner.anon_key)
            .header("Authorization", format!("Bearer {}", token))
            .header("Content-Type", "application/json")
            .header("Prefer", "resolution=merge-duplicates")
            .json(&payload)
            .send()
            .await
            .map_err(|e| Error::Network(e.to_string()))?;

        if !response.status().is_success() {
            let status_code = response.status();
            let body = response.text().await.unwrap_or_default();
            return Err(Error::Database(format!(
                "Failed to update presence: {} - {}",
                status_code, body
            )));
        }

        Ok(())
    }

    /// Update last_read_at for a participant
    pub async fn update_last_read(
        &self,
        conversation_id: &str,
        user_id: &str,
    ) -> Result<()> {
        let token = self
            .get_access_token()
            .await
            .ok_or_else(|| Error::Auth("Not authenticated".to_string()))?;

        let url = format!(
            "{}/rest/v1/conversation_participants?conversation_id=eq.{}&user_id=eq.{}",
            self.inner.base_url, conversation_id, user_id
        );

        #[derive(Serialize)]
        struct LastReadUpdate {
            last_read_at: String,
        }

        let response = self
            .inner
            .client
            .patch(&url)
            .header("apikey", &self.inner.anon_key)
            .header("Authorization", format!("Bearer {}", token))
            .header("Content-Type", "application/json")
            .json(&LastReadUpdate {
                last_read_at: chrono::Utc::now().to_rfc3339(),
            })
            .send()
            .await
            .map_err(|e| Error::Network(e.to_string()))?;

        if !response.status().is_success() {
            let status_code = response.status();
            let body = response.text().await.unwrap_or_default();
            return Err(Error::Database(format!(
                "Failed to update last read: {} - {}",
                status_code, body
            )));
        }

        Ok(())
    }

    /// Get all team members (users)
    pub async fn get_team_members(&self) -> Result<Vec<UserProfileRow>> {
        let token = self
            .get_access_token()
            .await
            .ok_or_else(|| Error::Auth("Not authenticated".to_string()))?;

        let url = format!("{}/rest/v1/user_profiles?select=*", self.inner.base_url);

        let response = self
            .inner
            .client
            .get(&url)
            .header("apikey", &self.inner.anon_key)
            .header("Authorization", format!("Bearer {}", token))
            .send()
            .await
            .map_err(|e| Error::Network(e.to_string()))?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            return Err(Error::Database(format!(
                "Failed to get team members: {} - {}",
                status, body
            )));
        }

        let profiles: Vec<UserProfileRow> = response
            .json()
            .await
            .map_err(|e| Error::Parse(e.to_string()))?;

        Ok(profiles)
    }

    /// Find or create a direct conversation between two users
    pub async fn find_or_create_direct_conversation(
        &self,
        user1_id: &str,
        user2_id: &str,
    ) -> Result<ConversationRow> {
        let token = self
            .get_access_token()
            .await
            .ok_or_else(|| Error::Auth("Not authenticated".to_string()))?;

        // Call the database function
        let url = format!("{}/rest/v1/rpc/find_or_create_direct_conversation", self.inner.base_url);

        #[derive(Serialize)]
        struct FunctionParams {
            user1_id: String,
            user2_id: String,
        }

        let response = self
            .inner
            .client
            .post(&url)
            .header("apikey", &self.inner.anon_key)
            .header("Authorization", format!("Bearer {}", token))
            .header("Content-Type", "application/json")
            .json(&FunctionParams {
                user1_id: user1_id.to_string(),
                user2_id: user2_id.to_string(),
            })
            .send()
            .await
            .map_err(|e| Error::Network(e.to_string()))?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            return Err(Error::Database(format!(
                "Failed to find/create conversation: {} - {}",
                status, body
            )));
        }

        let conv_id: String = response
            .json()
            .await
            .map_err(|e| Error::Parse(e.to_string()))?;

        // Get the full conversation details
        let url = format!(
            "{}/rest/v1/conversations?id=eq.{}",
            self.inner.base_url, conv_id
        );

        let response = self
            .inner
            .client
            .get(&url)
            .header("apikey", &self.inner.anon_key)
            .header("Authorization", format!("Bearer {}", token))
            .send()
            .await
            .map_err(|e| Error::Network(e.to_string()))?;

        let conversations: Vec<ConversationRow> = response
            .json()
            .await
            .map_err(|e| Error::Parse(e.to_string()))?;

        conversations
            .into_iter()
            .next()
            .ok_or_else(|| Error::Database("Conversation not found".to_string()))
    }

    /// Update a group conversation
    pub async fn update_group(
        &self,
        conversation_id: &str,
        name: Option<&str>,
        avatar_url: Option<&str>,
    ) -> Result<()> {
        let token = self
            .get_access_token()
            .await
            .ok_or_else(|| Error::Auth("Not authenticated".to_string()))?;

        let url = format!(
            "{}/rest/v1/conversations?id=eq.{}",
            self.inner.base_url, conversation_id
        );

        #[derive(Serialize)]
        struct GroupUpdate {
            #[serde(skip_serializing_if = "Option::is_none")]
            name: Option<String>,
            #[serde(skip_serializing_if = "Option::is_none")]
            avatar_url: Option<String>,
        }

        let response = self
            .inner
            .client
            .patch(&url)
            .header("apikey", &self.inner.anon_key)
            .header("Authorization", format!("Bearer {}", token))
            .header("Content-Type", "application/json")
            .json(&GroupUpdate {
                name: name.map(|s| s.to_string()),
                avatar_url: avatar_url.map(|s| s.to_string()),
            })
            .send()
            .await
            .map_err(|e| Error::Network(e.to_string()))?;

        if !response.status().is_success() {
            let status_code = response.status();
            let body = response.text().await.unwrap_or_default();
            return Err(Error::Database(format!(
                "Failed to update group: {} - {}",
                status_code, body
            )));
        }

        Ok(())
    }

    // ==========================================
    // Calendar-related methods
    // ==========================================

    /// Get meetings in a date range for a user
    pub async fn get_meetings_in_range(
        &self,
        user_id: &str,
        start_date: &str,
        end_date: &str,
    ) -> Result<Vec<MeetingRow>> {
        let token = self
            .get_access_token()
            .await
            .ok_or_else(|| Error::Auth("Not authenticated".to_string()))?;

        // Get meeting IDs where user is organizer or attendee
        let attendee_url = format!(
            "{}/rest/v1/meeting_attendees?user_id=eq.{}&select=meeting_id",
            self.inner.base_url, user_id
        );

        let response = self
            .inner
            .client
            .get(&attendee_url)
            .header("apikey", &self.inner.anon_key)
            .header("Authorization", format!("Bearer {}", token))
            .send()
            .await
            .map_err(|e| Error::Network(e.to_string()))?;

        #[derive(Deserialize)]
        struct AttendeeRow {
            meeting_id: String,
        }

        let attendees: Vec<AttendeeRow> = if response.status().is_success() {
            response.json().await.unwrap_or_default()
        } else {
            vec![]
        };

        let meeting_ids: Vec<String> = attendees.iter().map(|a| a.meeting_id.clone()).collect();

        // Build query for meetings
        let mut url = format!(
            "{}/rest/v1/meetings?scheduled_at=gte.{}&scheduled_at=lte.{}&status=neq.cancelled&order=scheduled_at.asc",
            self.inner.base_url, start_date, end_date
        );

        if !meeting_ids.is_empty() {
            let ids_param = meeting_ids.join(",");
            url.push_str(&format!("&or=(organizer_id.eq.{},id.in.({}))", user_id, ids_param));
        } else {
            url.push_str(&format!("&organizer_id=eq.{}", user_id));
        }

        let response = self
            .inner
            .client
            .get(&url)
            .header("apikey", &self.inner.anon_key)
            .header("Authorization", format!("Bearer {}", token))
            .send()
            .await
            .map_err(|e| Error::Network(e.to_string()))?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            return Err(Error::Database(format!(
                "Failed to get meetings: {} - {}",
                status, body
            )));
        }

        let meetings: Vec<MeetingRow> = response
            .json()
            .await
            .map_err(|e| Error::Parse(e.to_string()))?;

        Ok(meetings)
    }

    /// Get a single meeting by ID
    pub async fn get_meeting(&self, meeting_id: &str) -> Result<Option<MeetingRow>> {
        let token = self
            .get_access_token()
            .await
            .ok_or_else(|| Error::Auth("Not authenticated".to_string()))?;

        let url = format!(
            "{}/rest/v1/meetings?id=eq.{}&limit=1",
            self.inner.base_url, meeting_id
        );

        let response = self
            .inner
            .client
            .get(&url)
            .header("apikey", &self.inner.anon_key)
            .header("Authorization", format!("Bearer {}", token))
            .send()
            .await
            .map_err(|e| Error::Network(e.to_string()))?;

        if !response.status().is_success() {
            return Ok(None);
        }

        let meetings: Vec<MeetingRow> = response
            .json()
            .await
            .map_err(|e| Error::Parse(e.to_string()))?;

        Ok(meetings.into_iter().next())
    }

    /// Create a new meeting
    pub async fn create_meeting(
        &self,
        organizer_id: &str,
        title: &str,
        description: Option<&str>,
        scheduled_at: &str,
        duration_minutes: i32,
        recurrence_rule: Option<&str>,
    ) -> Result<MeetingRow> {
        let token = self
            .get_access_token()
            .await
            .ok_or_else(|| Error::Auth("Not authenticated".to_string()))?;

        let url = format!("{}/rest/v1/meetings", self.inner.base_url);

        let payload = CreateMeetingPayload {
            organizer_id: organizer_id.to_string(),
            title: title.to_string(),
            description: description.map(|s| s.to_string()),
            scheduled_at: scheduled_at.to_string(),
            duration_minutes,
            recurrence_rule: recurrence_rule.map(|s| s.to_string()),
        };

        let response = self
            .inner
            .client
            .post(&url)
            .header("apikey", &self.inner.anon_key)
            .header("Authorization", format!("Bearer {}", token))
            .header("Content-Type", "application/json")
            .header("Prefer", "return=representation")
            .json(&payload)
            .send()
            .await
            .map_err(|e| Error::Network(e.to_string()))?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            return Err(Error::Database(format!(
                "Failed to create meeting: {} - {}",
                status, body
            )));
        }

        let meetings: Vec<MeetingRow> = response
            .json()
            .await
            .map_err(|e| Error::Parse(e.to_string()))?;

        meetings
            .into_iter()
            .next()
            .ok_or_else(|| Error::Database("No meeting returned".to_string()))
    }

    /// Update a meeting
    pub async fn update_meeting(
        &self,
        meeting_id: &str,
        title: Option<&str>,
        description: Option<&str>,
        scheduled_at: Option<&str>,
        duration_minutes: Option<i32>,
        status: Option<&str>,
    ) -> Result<()> {
        let token = self
            .get_access_token()
            .await
            .ok_or_else(|| Error::Auth("Not authenticated".to_string()))?;

        let url = format!(
            "{}/rest/v1/meetings?id=eq.{}",
            self.inner.base_url, meeting_id
        );

        #[derive(Serialize)]
        struct MeetingUpdate {
            #[serde(skip_serializing_if = "Option::is_none")]
            title: Option<String>,
            #[serde(skip_serializing_if = "Option::is_none")]
            description: Option<String>,
            #[serde(skip_serializing_if = "Option::is_none")]
            scheduled_at: Option<String>,
            #[serde(skip_serializing_if = "Option::is_none")]
            duration_minutes: Option<i32>,
            #[serde(skip_serializing_if = "Option::is_none")]
            status: Option<String>,
        }

        let response = self
            .inner
            .client
            .patch(&url)
            .header("apikey", &self.inner.anon_key)
            .header("Authorization", format!("Bearer {}", token))
            .header("Content-Type", "application/json")
            .json(&MeetingUpdate {
                title: title.map(|s| s.to_string()),
                description: description.map(|s| s.to_string()),
                scheduled_at: scheduled_at.map(|s| s.to_string()),
                duration_minutes,
                status: status.map(|s| s.to_string()),
            })
            .send()
            .await
            .map_err(|e| Error::Network(e.to_string()))?;

        if !response.status().is_success() {
            let status_code = response.status();
            let body = response.text().await.unwrap_or_default();
            return Err(Error::Database(format!(
                "Failed to update meeting: {} - {}",
                status_code, body
            )));
        }

        Ok(())
    }

    /// Delete a meeting
    pub async fn delete_meeting(&self, meeting_id: &str) -> Result<()> {
        let token = self
            .get_access_token()
            .await
            .ok_or_else(|| Error::Auth("Not authenticated".to_string()))?;

        let url = format!(
            "{}/rest/v1/meetings?id=eq.{}",
            self.inner.base_url, meeting_id
        );

        let response = self
            .inner
            .client
            .delete(&url)
            .header("apikey", &self.inner.anon_key)
            .header("Authorization", format!("Bearer {}", token))
            .send()
            .await
            .map_err(|e| Error::Network(e.to_string()))?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            return Err(Error::Database(format!(
                "Failed to delete meeting: {} - {}",
                status, body
            )));
        }

        Ok(())
    }

    /// Add an attendee to a meeting
    pub async fn add_meeting_attendee(
        &self,
        meeting_id: &str,
        user_id: &str,
    ) -> Result<()> {
        let token = self
            .get_access_token()
            .await
            .ok_or_else(|| Error::Auth("Not authenticated".to_string()))?;

        let url = format!("{}/rest/v1/meeting_attendees", self.inner.base_url);

        let payload = AddMeetingAttendeePayload {
            meeting_id: meeting_id.to_string(),
            user_id: user_id.to_string(),
            response_status: "invited".to_string(),
        };

        let response = self
            .inner
            .client
            .post(&url)
            .header("apikey", &self.inner.anon_key)
            .header("Authorization", format!("Bearer {}", token))
            .header("Content-Type", "application/json")
            .json(&payload)
            .send()
            .await
            .map_err(|e| Error::Network(e.to_string()))?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            return Err(Error::Database(format!(
                "Failed to add attendee: {} - {}",
                status, body
            )));
        }

        Ok(())
    }

    /// Remove an attendee from a meeting
    pub async fn remove_meeting_attendee(
        &self,
        meeting_id: &str,
        user_id: &str,
    ) -> Result<()> {
        let token = self
            .get_access_token()
            .await
            .ok_or_else(|| Error::Auth("Not authenticated".to_string()))?;

        let url = format!(
            "{}/rest/v1/meeting_attendees?meeting_id=eq.{}&user_id=eq.{}",
            self.inner.base_url, meeting_id, user_id
        );

        let response = self
            .inner
            .client
            .delete(&url)
            .header("apikey", &self.inner.anon_key)
            .header("Authorization", format!("Bearer {}", token))
            .send()
            .await
            .map_err(|e| Error::Network(e.to_string()))?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            return Err(Error::Database(format!(
                "Failed to remove attendee: {} - {}",
                status, body
            )));
        }

        Ok(())
    }

    /// Update attendee response status
    pub async fn update_attendee_response(
        &self,
        meeting_id: &str,
        user_id: &str,
        response_status: &str,
    ) -> Result<()> {
        let token = self
            .get_access_token()
            .await
            .ok_or_else(|| Error::Auth("Not authenticated".to_string()))?;

        let url = format!(
            "{}/rest/v1/meeting_attendees?meeting_id=eq.{}&user_id=eq.{}",
            self.inner.base_url, meeting_id, user_id
        );

        #[derive(Serialize)]
        struct ResponseUpdate {
            response_status: String,
            responded_at: String,
        }

        let response = self
            .inner
            .client
            .patch(&url)
            .header("apikey", &self.inner.anon_key)
            .header("Authorization", format!("Bearer {}", token))
            .header("Content-Type", "application/json")
            .json(&ResponseUpdate {
                response_status: response_status.to_string(),
                responded_at: chrono::Utc::now().to_rfc3339(),
            })
            .send()
            .await
            .map_err(|e| Error::Network(e.to_string()))?;

        if !response.status().is_success() {
            let status_code = response.status();
            let body = response.text().await.unwrap_or_default();
            return Err(Error::Database(format!(
                "Failed to update response: {} - {}",
                status_code, body
            )));
        }

        Ok(())
    }

    /// Get meeting attendees with profiles
    pub async fn get_meeting_attendees(
        &self,
        meeting_id: &str,
    ) -> Result<Vec<AttendeeWithProfile>> {
        let token = self
            .get_access_token()
            .await
            .ok_or_else(|| Error::Auth("Not authenticated".to_string()))?;

        let url = format!(
            "{}/rest/v1/meeting_attendees?meeting_id=eq.{}",
            self.inner.base_url, meeting_id
        );

        let response = self
            .inner
            .client
            .get(&url)
            .header("apikey", &self.inner.anon_key)
            .header("Authorization", format!("Bearer {}", token))
            .send()
            .await
            .map_err(|e| Error::Network(e.to_string()))?;

        if !response.status().is_success() {
            return Ok(vec![]);
        }

        let attendees: Vec<MeetingAttendeeRow> = response
            .json()
            .await
            .map_err(|e| Error::Parse(e.to_string()))?;

        // Get user profiles
        let user_ids: Vec<String> = attendees.iter().map(|a| a.user_id.clone()).collect();
        if user_ids.is_empty() {
            return Ok(vec![]);
        }

        let profiles = self.get_user_profiles(&user_ids).await?;

        let result: Vec<AttendeeWithProfile> = attendees
            .into_iter()
            .map(|a| {
                let profile = profiles.iter().find(|p| p.user_id == a.user_id);
                AttendeeWithProfile {
                    user_id: a.user_id.clone(),
                    display_name: profile
                        .and_then(|p| p.display_name.clone())
                        .unwrap_or_else(|| a.user_id.clone()),
                    avatar_url: profile.and_then(|p| p.avatar_url.clone()),
                    response_status: a.response_status,
                    responded_at: a.responded_at,
                }
            })
            .collect();

        Ok(result)
    }

    /// Get upcoming meetings for a user
    pub async fn get_upcoming_meetings(
        &self,
        user_id: &str,
        limit: u32,
    ) -> Result<Vec<MeetingRow>> {
        let token = self
            .get_access_token()
            .await
            .ok_or_else(|| Error::Auth("Not authenticated".to_string()))?;

        let now = chrono::Utc::now().to_rfc3339();

        // Get meeting IDs where user is attendee
        let attendee_url = format!(
            "{}/rest/v1/meeting_attendees?user_id=eq.{}&select=meeting_id",
            self.inner.base_url, user_id
        );

        let response = self
            .inner
            .client
            .get(&attendee_url)
            .header("apikey", &self.inner.anon_key)
            .header("Authorization", format!("Bearer {}", token))
            .send()
            .await
            .map_err(|e| Error::Network(e.to_string()))?;

        #[derive(Deserialize)]
        struct AttendeeRow {
            meeting_id: String,
        }

        let attendees: Vec<AttendeeRow> = if response.status().is_success() {
            response.json().await.unwrap_or_default()
        } else {
            vec![]
        };

        let meeting_ids: Vec<String> = attendees.iter().map(|a| a.meeting_id.clone()).collect();

        let mut url = format!(
            "{}/rest/v1/meetings?scheduled_at=gte.{}&status=eq.scheduled&order=scheduled_at.asc&limit={}",
            self.inner.base_url, now, limit
        );

        if !meeting_ids.is_empty() {
            let ids_param = meeting_ids.join(",");
            url.push_str(&format!("&or=(organizer_id.eq.{},id.in.({}))", user_id, ids_param));
        } else {
            url.push_str(&format!("&organizer_id=eq.{}", user_id));
        }

        let response = self
            .inner
            .client
            .get(&url)
            .header("apikey", &self.inner.anon_key)
            .header("Authorization", format!("Bearer {}", token))
            .send()
            .await
            .map_err(|e| Error::Network(e.to_string()))?;

        if !response.status().is_success() {
            return Ok(vec![]);
        }

        let meetings: Vec<MeetingRow> = response
            .json()
            .await
            .map_err(|e| Error::Parse(e.to_string()))?;

        Ok(meetings)
    }

    /// Link a meeting to a session
    pub async fn link_meeting_to_session(
        &self,
        meeting_id: &str,
        session_id: &str,
    ) -> Result<()> {
        let token = self
            .get_access_token()
            .await
            .ok_or_else(|| Error::Auth("Not authenticated".to_string()))?;

        let url = format!(
            "{}/rest/v1/meetings?id=eq.{}",
            self.inner.base_url, meeting_id
        );

        #[derive(Serialize)]
        struct SessionLink {
            session_id: String,
            status: String,
        }

        let response = self
            .inner
            .client
            .patch(&url)
            .header("apikey", &self.inner.anon_key)
            .header("Authorization", format!("Bearer {}", token))
            .header("Content-Type", "application/json")
            .json(&SessionLink {
                session_id: session_id.to_string(),
                status: "ongoing".to_string(),
            })
            .send()
            .await
            .map_err(|e| Error::Network(e.to_string()))?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            return Err(Error::Database(format!(
                "Failed to link session: {} - {}",
                status, body
            )));
        }

        Ok(())
    }

    /// Save Google OAuth tokens
    pub async fn save_google_tokens(
        &self,
        user_id: &str,
        access_token: &str,
        refresh_token: &str,
        expires_at: &str,
        email: Option<&str>,
    ) -> Result<()> {
        let token = self
            .get_access_token()
            .await
            .ok_or_else(|| Error::Auth("Not authenticated".to_string()))?;

        let url = format!("{}/rest/v1/user_google_tokens", self.inner.base_url);

        #[derive(Serialize)]
        struct GoogleTokensPayload {
            user_id: String,
            access_token: String,
            refresh_token: String,
            expires_at: String,
            #[serde(skip_serializing_if = "Option::is_none")]
            email: Option<String>,
        }

        let response = self
            .inner
            .client
            .post(&url)
            .header("apikey", &self.inner.anon_key)
            .header("Authorization", format!("Bearer {}", token))
            .header("Content-Type", "application/json")
            .header("Prefer", "resolution=merge-duplicates")
            .json(&GoogleTokensPayload {
                user_id: user_id.to_string(),
                access_token: access_token.to_string(),
                refresh_token: refresh_token.to_string(),
                expires_at: expires_at.to_string(),
                email: email.map(|s| s.to_string()),
            })
            .send()
            .await
            .map_err(|e| Error::Network(e.to_string()))?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            return Err(Error::Database(format!(
                "Failed to save Google tokens: {} - {}",
                status, body
            )));
        }

        Ok(())
    }

    /// Get Google OAuth tokens for a user
    pub async fn get_google_tokens(&self, user_id: &str) -> Result<Option<GoogleTokensRow>> {
        let token = self
            .get_access_token()
            .await
            .ok_or_else(|| Error::Auth("Not authenticated".to_string()))?;

        let url = format!(
            "{}/rest/v1/user_google_tokens?user_id=eq.{}&limit=1",
            self.inner.base_url, user_id
        );

        let response = self
            .inner
            .client
            .get(&url)
            .header("apikey", &self.inner.anon_key)
            .header("Authorization", format!("Bearer {}", token))
            .send()
            .await
            .map_err(|e| Error::Network(e.to_string()))?;

        if !response.status().is_success() {
            return Ok(None);
        }

        let tokens: Vec<GoogleTokensRow> = response
            .json()
            .await
            .map_err(|e| Error::Parse(e.to_string()))?;

        Ok(tokens.into_iter().next())
    }

    /// Delete Google OAuth tokens for a user
    pub async fn delete_google_tokens(&self, user_id: &str) -> Result<()> {
        let token = self
            .get_access_token()
            .await
            .ok_or_else(|| Error::Auth("Not authenticated".to_string()))?;

        let url = format!(
            "{}/rest/v1/user_google_tokens?user_id=eq.{}",
            self.inner.base_url, user_id
        );

        let response = self
            .inner
            .client
            .delete(&url)
            .header("apikey", &self.inner.anon_key)
            .header("Authorization", format!("Bearer {}", token))
            .send()
            .await
            .map_err(|e| Error::Network(e.to_string()))?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            return Err(Error::Database(format!(
                "Failed to delete Google tokens: {} - {}",
                status, body
            )));
        }

        Ok(())
    }

    /// Update Google sync enabled status
    pub async fn update_google_sync_enabled(&self, user_id: &str, enabled: bool) -> Result<()> {
        let token = self
            .get_access_token()
            .await
            .ok_or_else(|| Error::Auth("Not authenticated".to_string()))?;

        let url = format!(
            "{}/rest/v1/user_google_tokens?user_id=eq.{}",
            self.inner.base_url, user_id
        );

        #[derive(Serialize)]
        struct SyncUpdate {
            sync_enabled: bool,
            updated_at: String,
        }

        let response = self
            .inner
            .client
            .patch(&url)
            .header("apikey", &self.inner.anon_key)
            .header("Authorization", format!("Bearer {}", token))
            .header("Content-Type", "application/json")
            .json(&SyncUpdate {
                sync_enabled: enabled,
                updated_at: chrono::Utc::now().to_rfc3339(),
            })
            .send()
            .await
            .map_err(|e| Error::Network(e.to_string()))?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            return Err(Error::Database(format!(
                "Failed to update sync status: {} - {}",
                status, body
            )));
        }

        Ok(())
    }

    /// Update meeting's Google event ID
    pub async fn update_meeting_google_id(
        &self,
        meeting_id: &str,
        google_event_id: &str,
        google_calendar_id: &str,
    ) -> Result<()> {
        let token = self
            .get_access_token()
            .await
            .ok_or_else(|| Error::Auth("Not authenticated".to_string()))?;

        let url = format!(
            "{}/rest/v1/meetings?id=eq.{}",
            self.inner.base_url, meeting_id
        );

        #[derive(Serialize)]
        struct GoogleEventUpdate {
            google_event_id: String,
            google_calendar_id: String,
        }

        let response = self
            .inner
            .client
            .patch(&url)
            .header("apikey", &self.inner.anon_key)
            .header("Authorization", format!("Bearer {}", token))
            .header("Content-Type", "application/json")
            .json(&GoogleEventUpdate {
                google_event_id: google_event_id.to_string(),
                google_calendar_id: google_calendar_id.to_string(),
            })
            .send()
            .await
            .map_err(|e| Error::Network(e.to_string()))?;

        if !response.status().is_success() {
            let status_code = response.status();
            let body = response.text().await.unwrap_or_default();
            return Err(Error::Database(format!(
                "Failed to update Google event ID: {} - {}",
                status_code, body
            )));
        }

        Ok(())
    }
}

impl Default for SupabaseClient {
    fn default() -> Self {
        Self::new().expect("Failed to create SupabaseClient")
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_client_creation_fails_without_env() {
        // Clear env vars for test
        std::env::remove_var(SUPABASE_URL_ENV);
        std::env::remove_var(SUPABASE_ANON_KEY_ENV);
        std::env::remove_var("NEXT_PUBLIC_SUPABASE_URL");
        std::env::remove_var("NEXT_PUBLIC_SUPABASE_ANON_KEY");

        let result = SupabaseClient::new();
        assert!(result.is_err());
    }
}
