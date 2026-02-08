use std::sync::Arc;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, State};
use tokio::sync::RwLock;

use crate::chat_realtime::ChatRealtimeClient;
use crate::state::AppState;
use crate::{Error, Result};

// ==========================================
// Chat State
// ==========================================

pub struct ChatState {
    pub inner: Arc<RwLock<ChatStateInner>>,
}

#[derive(Default)]
pub struct ChatStateInner {
    pub realtime: Option<ChatRealtimeClient>,
    pub is_connected: bool,
}

impl Default for ChatState {
    fn default() -> Self {
        Self {
            inner: Arc::new(RwLock::new(ChatStateInner::default())),
        }
    }
}

// ==========================================
// Response Types
// ==========================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Conversation {
    pub id: String,
    #[serde(rename = "type")]
    pub conversation_type: String,
    pub name: Option<String>,
    pub avatar_url: Option<String>,
    pub created_by: Option<String>,
    pub created_at: Option<String>,
    pub updated_at: Option<String>,
    pub participants: Vec<Participant>,
    pub last_message: Option<Message>,
    pub unread_count: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Participant {
    pub user_id: String,
    pub display_name: String,
    pub avatar_url: Option<String>,
    pub role: String,
    pub is_online: bool,
    pub last_seen_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Message {
    pub id: String,
    pub conversation_id: String,
    pub sender_id: Option<String>,
    pub sender_name: String,
    pub content: String,
    pub message_type: String,
    pub created_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TeamMember {
    pub user_id: String,
    pub display_name: String,
    pub avatar_url: Option<String>,
    pub is_online: bool,
}

// ==========================================
// Commands
// ==========================================

/// Get all conversations for the current user
#[tauri::command]
pub async fn get_conversations(
    app_state: State<'_, AppState>,
) -> Result<Vec<Conversation>> {
    let inner = app_state.inner.read().await;
    let user = inner
        .user
        .as_ref()
        .ok_or_else(|| Error::Auth("Not authenticated".to_string()))?;
    let user_id = user.id.clone();

    let supabase = app_state
        .supabase
        .as_ref()
        .ok_or_else(|| Error::Config("Supabase not configured".to_string()))?;

    drop(inner);

    let conversation_rows = supabase.get_user_conversations(&user_id).await?;

    // Build full conversation objects with participants and last message
    let mut conversations = Vec::new();
    for row in conversation_rows {
        let participants_raw = supabase.get_conversation_participants(&row.id).await?;
        let participants: Vec<Participant> = participants_raw
            .into_iter()
            .map(|p| Participant {
                user_id: p.user_id,
                display_name: p.display_name,
                avatar_url: p.avatar_url,
                role: p.role,
                is_online: p.is_online,
                last_seen_at: p.last_seen_at,
            })
            .collect();

        // Get last message
        let messages = supabase.get_messages(&row.id, 1, None).await?;
        let last_message = messages.into_iter().next().map(|m| Message {
            id: m.id,
            conversation_id: m.conversation_id,
            sender_id: m.sender_id.clone(),
            sender_name: m.sender_id.unwrap_or_else(|| "Unknown".to_string()),
            content: m.content,
            message_type: m.message_type,
            created_at: m.created_at,
        });

        conversations.push(Conversation {
            id: row.id,
            conversation_type: row.conversation_type,
            name: row.name,
            avatar_url: row.avatar_url,
            created_by: row.created_by,
            created_at: row.created_at,
            updated_at: row.updated_at,
            participants,
            last_message,
            unread_count: 0, // TODO: Calculate from last_read_at
        });
    }

    // Sort by updated_at descending
    conversations.sort_by(|a, b| {
        b.updated_at
            .as_ref()
            .unwrap_or(&String::new())
            .cmp(a.updated_at.as_ref().unwrap_or(&String::new()))
    });

    Ok(conversations)
}

/// Get a single conversation by ID
#[tauri::command]
pub async fn get_conversation(
    conversation_id: String,
    app_state: State<'_, AppState>,
) -> Result<Conversation> {
    let inner = app_state.inner.read().await;
    let _user = inner
        .user
        .as_ref()
        .ok_or_else(|| Error::Auth("Not authenticated".to_string()))?;

    let supabase = app_state
        .supabase
        .as_ref()
        .ok_or_else(|| Error::Config("Supabase not configured".to_string()))?;

    drop(inner);

    // Get conversation details
    let conversations = supabase.get_user_conversations("").await?; // Will be filtered by RLS
    let row = conversations
        .into_iter()
        .find(|c| c.id == conversation_id)
        .ok_or_else(|| Error::Database("Conversation not found".to_string()))?;

    let participants_raw = supabase.get_conversation_participants(&row.id).await?;
    let participants: Vec<Participant> = participants_raw
        .into_iter()
        .map(|p| Participant {
            user_id: p.user_id,
            display_name: p.display_name,
            avatar_url: p.avatar_url,
            role: p.role,
            is_online: p.is_online,
            last_seen_at: p.last_seen_at,
        })
        .collect();

    // Get last message
    let messages = supabase.get_messages(&row.id, 1, None).await?;
    let last_message = messages.into_iter().next().map(|m| Message {
        id: m.id,
        conversation_id: m.conversation_id,
        sender_id: m.sender_id.clone(),
        sender_name: m.sender_id.unwrap_or_else(|| "Unknown".to_string()),
        content: m.content,
        message_type: m.message_type,
        created_at: m.created_at,
    });

    Ok(Conversation {
        id: row.id,
        conversation_type: row.conversation_type,
        name: row.name,
        avatar_url: row.avatar_url,
        created_by: row.created_by,
        created_at: row.created_at,
        updated_at: row.updated_at,
        participants,
        last_message,
        unread_count: 0,
    })
}

/// Create a direct (1:1) conversation
#[tauri::command]
pub async fn create_direct_conversation(
    other_user_id: String,
    app_state: State<'_, AppState>,
) -> Result<Conversation> {
    let inner = app_state.inner.read().await;
    let user = inner
        .user
        .as_ref()
        .ok_or_else(|| Error::Auth("Not authenticated".to_string()))?;
    let user_id = user.id.clone();

    let supabase = app_state
        .supabase
        .as_ref()
        .ok_or_else(|| Error::Config("Supabase not configured".to_string()))?;

    drop(inner);

    // Use the database function to find or create
    let row = supabase
        .find_or_create_direct_conversation(&user_id, &other_user_id)
        .await?;

    let participants_raw = supabase.get_conversation_participants(&row.id).await?;
    let participants: Vec<Participant> = participants_raw
        .into_iter()
        .map(|p| Participant {
            user_id: p.user_id,
            display_name: p.display_name,
            avatar_url: p.avatar_url,
            role: p.role,
            is_online: p.is_online,
            last_seen_at: p.last_seen_at,
        })
        .collect();

    Ok(Conversation {
        id: row.id,
        conversation_type: row.conversation_type,
        name: row.name,
        avatar_url: row.avatar_url,
        created_by: row.created_by,
        created_at: row.created_at,
        updated_at: row.updated_at,
        participants,
        last_message: None,
        unread_count: 0,
    })
}

/// Create a group conversation
#[tauri::command]
pub async fn create_group_conversation(
    name: String,
    member_ids: Vec<String>,
    app_state: State<'_, AppState>,
) -> Result<Conversation> {
    let inner = app_state.inner.read().await;
    let user = inner
        .user
        .as_ref()
        .ok_or_else(|| Error::Auth("Not authenticated".to_string()))?;
    let user_id = user.id.clone();

    let supabase = app_state
        .supabase
        .as_ref()
        .ok_or_else(|| Error::Config("Supabase not configured".to_string()))?;

    drop(inner);

    // Create the conversation
    let row = supabase
        .create_conversation("group", Some(&name), &user_id)
        .await?;

    // Add creator as admin
    supabase.add_participant(&row.id, &user_id, "admin").await?;

    // Add other members
    for member_id in &member_ids {
        if member_id != &user_id {
            supabase.add_participant(&row.id, member_id, "member").await?;
        }
    }

    let participants_raw = supabase.get_conversation_participants(&row.id).await?;
    let participants: Vec<Participant> = participants_raw
        .into_iter()
        .map(|p| Participant {
            user_id: p.user_id,
            display_name: p.display_name,
            avatar_url: p.avatar_url,
            role: p.role,
            is_online: p.is_online,
            last_seen_at: p.last_seen_at,
        })
        .collect();

    Ok(Conversation {
        id: row.id,
        conversation_type: row.conversation_type,
        name: row.name,
        avatar_url: row.avatar_url,
        created_by: row.created_by,
        created_at: row.created_at,
        updated_at: row.updated_at,
        participants,
        last_message: None,
        unread_count: 0,
    })
}

/// Update a group's name or avatar
#[tauri::command]
pub async fn update_group(
    conversation_id: String,
    name: Option<String>,
    avatar_url: Option<String>,
    app_state: State<'_, AppState>,
) -> Result<()> {
    let inner = app_state.inner.read().await;
    let _user = inner
        .user
        .as_ref()
        .ok_or_else(|| Error::Auth("Not authenticated".to_string()))?;

    let supabase = app_state
        .supabase
        .as_ref()
        .ok_or_else(|| Error::Config("Supabase not configured".to_string()))?;

    drop(inner);

    supabase
        .update_group(&conversation_id, name.as_deref(), avatar_url.as_deref())
        .await?;

    Ok(())
}

/// Add a member to a group
#[tauri::command]
pub async fn add_group_member(
    conversation_id: String,
    user_id: String,
    app_state: State<'_, AppState>,
) -> Result<()> {
    let inner = app_state.inner.read().await;
    let _current_user = inner
        .user
        .as_ref()
        .ok_or_else(|| Error::Auth("Not authenticated".to_string()))?;

    let supabase = app_state
        .supabase
        .as_ref()
        .ok_or_else(|| Error::Config("Supabase not configured".to_string()))?;

    drop(inner);

    supabase
        .add_participant(&conversation_id, &user_id, "member")
        .await?;

    Ok(())
}

/// Remove a member from a group
#[tauri::command]
pub async fn remove_group_member(
    conversation_id: String,
    user_id: String,
    app_state: State<'_, AppState>,
) -> Result<()> {
    let inner = app_state.inner.read().await;
    let _current_user = inner
        .user
        .as_ref()
        .ok_or_else(|| Error::Auth("Not authenticated".to_string()))?;

    let supabase = app_state
        .supabase
        .as_ref()
        .ok_or_else(|| Error::Config("Supabase not configured".to_string()))?;

    drop(inner);

    supabase
        .remove_participant(&conversation_id, &user_id)
        .await?;

    Ok(())
}

/// Leave a group
#[tauri::command]
pub async fn leave_group(
    conversation_id: String,
    app_state: State<'_, AppState>,
) -> Result<()> {
    let inner = app_state.inner.read().await;
    let user = inner
        .user
        .as_ref()
        .ok_or_else(|| Error::Auth("Not authenticated".to_string()))?;
    let user_id = user.id.clone();

    let supabase = app_state
        .supabase
        .as_ref()
        .ok_or_else(|| Error::Config("Supabase not configured".to_string()))?;

    drop(inner);

    supabase
        .remove_participant(&conversation_id, &user_id)
        .await?;

    Ok(())
}

/// Get messages for a conversation
#[tauri::command]
pub async fn get_messages(
    conversation_id: String,
    limit: Option<u32>,
    before: Option<String>,
    app_state: State<'_, AppState>,
) -> Result<Vec<Message>> {
    let inner = app_state.inner.read().await;
    let _user = inner
        .user
        .as_ref()
        .ok_or_else(|| Error::Auth("Not authenticated".to_string()))?;

    let supabase = app_state
        .supabase
        .as_ref()
        .ok_or_else(|| Error::Config("Supabase not configured".to_string()))?;

    drop(inner);

    let limit = limit.unwrap_or(50);

    // Check cache first (only for initial load without pagination)
    if before.is_none() {
        let cache = app_state.cache.messages.read().await;
        if let Some(cached) = cache.get_messages(&conversation_id) {
            tracing::debug!("Cache hit for messages in conversation {}", conversation_id);
            // Return up to limit messages
            let result: Vec<Message> = cached
                .iter()
                .take(limit as usize)
                .map(|m| Message {
                    id: m.id.clone(),
                    conversation_id: m.conversation_id.clone(),
                    sender_id: m.sender_id.clone(),
                    sender_name: m.sender_id.clone().unwrap_or_else(|| "Unknown".to_string()),
                    content: m.content.clone(),
                    message_type: m.message_type.clone(),
                    created_at: m.created_at.clone(),
                })
                .collect();
            return Ok(result);
        }
        drop(cache);
    }

    // Cache miss - fetch from API
    let message_rows = supabase
        .get_messages(&conversation_id, limit, before.as_deref())
        .await?;

    // Get sender profiles
    let sender_ids: Vec<String> = message_rows
        .iter()
        .filter_map(|m| m.sender_id.clone())
        .collect();

    let profiles = if !sender_ids.is_empty() {
        supabase.get_user_profiles(&sender_ids).await?
    } else {
        vec![]
    };

    let messages: Vec<Message> = message_rows
        .iter()
        .map(|m| {
            let sender_name = m
                .sender_id
                .as_ref()
                .and_then(|sid| {
                    profiles
                        .iter()
                        .find(|p| &p.user_id == sid)
                        .and_then(|p| p.display_name.clone())
                })
                .unwrap_or_else(|| "Unknown".to_string());

            Message {
                id: m.id.clone(),
                conversation_id: m.conversation_id.clone(),
                sender_id: m.sender_id.clone(),
                sender_name,
                content: m.content.clone(),
                message_type: m.message_type.clone(),
                created_at: m.created_at.clone(),
            }
        })
        .collect();

    // Cache the result (only for initial load)
    if before.is_none() {
        let mut cache = app_state.cache.messages.write().await;
        cache.set_messages(&conversation_id, message_rows);
        tracing::debug!("Cached messages for conversation {}", conversation_id);
    }

    Ok(messages)
}

/// Send a message to a conversation
#[tauri::command]
pub async fn chat_send_message(
    conversation_id: String,
    content: String,
    app_state: State<'_, AppState>,
    chat_state: State<'_, ChatState>,
    app_handle: AppHandle,
) -> Result<Message> {
    let inner = app_state.inner.read().await;
    let user = inner
        .user
        .as_ref()
        .ok_or_else(|| Error::Auth("Not authenticated".to_string()))?;
    let user_id = user.id.clone();
    let user_email = user.email.clone();

    let supabase = app_state
        .supabase
        .as_ref()
        .ok_or_else(|| Error::Config("Supabase not configured".to_string()))?;

    drop(inner);

    // Save message to database
    let message_row = supabase
        .create_message(&conversation_id, &user_id, &content, "text")
        .await?;

    let message = Message {
        id: message_row.id.clone(),
        conversation_id: message_row.conversation_id.clone(),
        sender_id: message_row.sender_id.clone(),
        sender_name: user_email,
        content: message_row.content.clone(),
        message_type: message_row.message_type.clone(),
        created_at: message_row.created_at.clone(),
    };

    // Update cache with the new message
    {
        let mut cache = app_state.cache.messages.write().await;
        cache.append_messages(&conversation_id, vec![message_row]);
        tracing::debug!("Cache updated with new message in {}", conversation_id);
    }

    // Broadcast via realtime if connected
    let chat_inner = chat_state.inner.read().await;
    if let Some(ref realtime) = chat_inner.realtime {
        let _ = realtime
            .broadcast_message(&conversation_id, &message)
            .await;
    }

    // Also emit locally for UI update
    let _ = app_handle.emit("chat:new-message", &message);

    Ok(message)
}

/// Mark a conversation as read
#[tauri::command]
pub async fn mark_as_read(
    conversation_id: String,
    app_state: State<'_, AppState>,
) -> Result<()> {
    let inner = app_state.inner.read().await;
    let user = inner
        .user
        .as_ref()
        .ok_or_else(|| Error::Auth("Not authenticated".to_string()))?;
    let user_id = user.id.clone();

    let supabase = app_state
        .supabase
        .as_ref()
        .ok_or_else(|| Error::Config("Supabase not configured".to_string()))?;

    drop(inner);

    supabase.update_last_read(&conversation_id, &user_id).await?;

    Ok(())
}

/// Update presence status
#[tauri::command]
pub async fn update_presence(
    status: String,
    app_state: State<'_, AppState>,
) -> Result<()> {
    let inner = app_state.inner.read().await;
    let user = inner
        .user
        .as_ref()
        .ok_or_else(|| Error::Auth("Not authenticated".to_string()))?;
    let user_id = user.id.clone();

    let supabase = app_state
        .supabase
        .as_ref()
        .ok_or_else(|| Error::Config("Supabase not configured".to_string()))?;

    drop(inner);

    supabase.update_presence(&user_id, &status).await?;

    Ok(())
}

/// Get team members (all users)
#[tauri::command]
pub async fn get_team_members(
    app_state: State<'_, AppState>,
) -> Result<Vec<TeamMember>> {
    use crate::cache::PresenceInfo;

    let inner = app_state.inner.read().await;
    let user = inner
        .user
        .as_ref()
        .ok_or_else(|| Error::Auth("Not authenticated".to_string()))?;
    let current_user_id = user.id.clone();

    let supabase = app_state
        .supabase
        .as_ref()
        .ok_or_else(|| Error::Config("Supabase not configured".to_string()))?;

    drop(inner);

    // Check presence cache first
    {
        let cache = app_state.cache.presence.read().await;
        if let Some(cached) = cache.get_team_members() {
            tracing::debug!("Cache hit for team members");
            let members: Vec<TeamMember> = cached
                .iter()
                .filter(|p| p.user_id != current_user_id)
                .map(|p| TeamMember {
                    user_id: p.user_id.clone(),
                    display_name: p.status.clone().unwrap_or_else(|| "Unknown".to_string()),
                    avatar_url: None,
                    is_online: p.is_online,
                })
                .collect();
            return Ok(members);
        }
    }

    // Cache miss - fetch from API
    let profiles = supabase.get_team_members().await?;
    let user_ids: Vec<String> = profiles.iter().map(|p| p.user_id.clone()).collect();
    let presence = supabase.get_users_presence(&user_ids).await?;

    let members: Vec<TeamMember> = profiles
        .iter()
        .filter(|p| p.user_id != current_user_id)
        .map(|p| {
            let is_online = presence
                .iter()
                .find(|pr| pr.user_id == p.user_id)
                .map(|pr| pr.status == "online")
                .unwrap_or(false);

            TeamMember {
                user_id: p.user_id.clone(),
                display_name: p.display_name.clone().unwrap_or_else(|| "Unknown".to_string()),
                avatar_url: p.avatar_url.clone(),
                is_online,
            }
        })
        .collect();

    // Cache the presence information
    {
        let mut cache = app_state.cache.presence.write().await;
        let presence_infos: Vec<PresenceInfo> = profiles
            .iter()
            .map(|p| {
                let is_online = presence
                    .iter()
                    .find(|pr| pr.user_id == p.user_id)
                    .map(|pr| pr.status == "online")
                    .unwrap_or(false);

                PresenceInfo {
                    user_id: p.user_id.clone(),
                    is_online,
                    last_seen: None,
                    status: p.display_name.clone(),
                }
            })
            .collect();
        cache.set_team_members(presence_infos);
        tracing::debug!("Cached team members presence");
    }

    Ok(members)
}

/// Connect to chat realtime
#[tauri::command]
pub async fn connect_chat(
    app_state: State<'_, AppState>,
    chat_state: State<'_, ChatState>,
    app_handle: AppHandle,
) -> Result<()> {
    let inner = app_state.inner.read().await;
    let user = inner
        .user
        .as_ref()
        .ok_or_else(|| Error::Auth("Not authenticated".to_string()))?;
    let user_id = user.id.clone();
    let access_token = user.access_token.clone();
    drop(inner);

    // Create realtime client
    let realtime = ChatRealtimeClient::from_env()?;
    realtime.set_access_token(Some(access_token)).await;

    // Connect and subscribe to conversations, passing the cache for presence updates
    let cache = Some(app_state.cache.clone());
    realtime.connect(&user_id, app_handle, cache).await?;

    // Update state
    {
        let mut state = chat_state.inner.write().await;
        state.realtime = Some(realtime);
        state.is_connected = true;
    }

    // Update presence to online
    if let Some(ref supabase) = app_state.supabase {
        let _ = supabase.update_presence(&user_id, "online").await;
    }

    tracing::info!("Connected to chat realtime");
    Ok(())
}

/// Disconnect from chat realtime
#[tauri::command]
pub async fn disconnect_chat(
    app_state: State<'_, AppState>,
    chat_state: State<'_, ChatState>,
) -> Result<()> {
    let mut state = chat_state.inner.write().await;

    if let Some(ref realtime) = state.realtime {
        realtime.disconnect().await;
    }

    state.realtime = None;
    state.is_connected = false;

    // Update presence to offline
    let inner = app_state.inner.read().await;
    if let Some(ref user) = inner.user {
        if let Some(ref supabase) = app_state.supabase {
            let _ = supabase.update_presence(&user.id, "offline").await;
        }
    }

    tracing::info!("Disconnected from chat realtime");
    Ok(())
}

/// Get chat connection status
#[tauri::command]
pub async fn get_chat_status(
    chat_state: State<'_, ChatState>,
) -> Result<bool> {
    let state = chat_state.inner.read().await;
    Ok(state.is_connected)
}

// ==========================================
// Search & Filter Commands
// ==========================================

/// Search conversations by name or participant
#[tauri::command]
pub async fn search_conversations(
    query: String,
    app_state: State<'_, AppState>,
) -> Result<Vec<Conversation>> {
    let inner = app_state.inner.read().await;
    let user = inner
        .user
        .as_ref()
        .ok_or_else(|| Error::Auth("Not authenticated".to_string()))?;
    let user_id = user.id.clone();

    let supabase = app_state
        .supabase
        .as_ref()
        .ok_or_else(|| Error::Config("Supabase not configured".to_string()))?;

    drop(inner);

    let query_lower = query.to_lowercase();

    // Get all conversations and filter locally
    let conversation_rows = supabase.get_user_conversations(&user_id).await?;

    let mut results = Vec::new();

    for row in conversation_rows {
        let participants_raw = supabase.get_conversation_participants(&row.id).await?;
        let participants: Vec<Participant> = participants_raw
            .into_iter()
            .map(|p| Participant {
                user_id: p.user_id,
                display_name: p.display_name,
                avatar_url: p.avatar_url,
                role: p.role,
                is_online: p.is_online,
                last_seen_at: p.last_seen_at,
            })
            .collect();

        // Check if query matches conversation name or any participant name
        let name_matches = row
            .name
            .as_ref()
            .map(|n| n.to_lowercase().contains(&query_lower))
            .unwrap_or(false);

        let participant_matches = participants
            .iter()
            .any(|p| p.display_name.to_lowercase().contains(&query_lower));

        if name_matches || participant_matches {
            // Get last message
            let messages = supabase.get_messages(&row.id, 1, None).await?;
            let last_message = messages.into_iter().next().map(|m| Message {
                id: m.id,
                conversation_id: m.conversation_id,
                sender_id: m.sender_id.clone(),
                sender_name: m.sender_id.unwrap_or_else(|| "Unknown".to_string()),
                content: m.content,
                message_type: m.message_type,
                created_at: m.created_at,
            });

            results.push(Conversation {
                id: row.id,
                conversation_type: row.conversation_type,
                name: row.name,
                avatar_url: row.avatar_url,
                created_by: row.created_by,
                created_at: row.created_at,
                updated_at: row.updated_at,
                participants,
                last_message,
                unread_count: 0,
            });
        }
    }

    // Sort by updated_at descending
    results.sort_by(|a, b| {
        b.updated_at
            .as_ref()
            .unwrap_or(&String::new())
            .cmp(a.updated_at.as_ref().unwrap_or(&String::new()))
    });

    tracing::debug!("Found {} conversations matching '{}'", results.len(), query);
    Ok(results)
}

/// Search messages in a conversation by content
#[tauri::command]
pub async fn search_messages(
    conversation_id: String,
    query: String,
    limit: Option<u32>,
    app_state: State<'_, AppState>,
) -> Result<Vec<Message>> {
    let inner = app_state.inner.read().await;
    let _user = inner
        .user
        .as_ref()
        .ok_or_else(|| Error::Auth("Not authenticated".to_string()))?;

    let supabase = app_state
        .supabase
        .as_ref()
        .ok_or_else(|| Error::Config("Supabase not configured".to_string()))?;

    drop(inner);

    let query_lower = query.to_lowercase();
    let limit = limit.unwrap_or(50);

    // Get messages and filter by content
    // Note: In production, you'd want full-text search at the DB level
    let message_rows = supabase
        .get_messages(&conversation_id, 500, None) // Fetch more to search
        .await?;

    // Get sender profiles for matching messages
    let sender_ids: Vec<String> = message_rows
        .iter()
        .filter_map(|m| m.sender_id.clone())
        .collect();

    let profiles = if !sender_ids.is_empty() {
        supabase.get_user_profiles(&sender_ids).await?
    } else {
        vec![]
    };

    let results: Vec<Message> = message_rows
        .iter()
        .filter(|m| m.content.to_lowercase().contains(&query_lower))
        .take(limit as usize)
        .map(|m| {
            let sender_name = m
                .sender_id
                .as_ref()
                .and_then(|sid| {
                    profiles
                        .iter()
                        .find(|p| &p.user_id == sid)
                        .and_then(|p| p.display_name.clone())
                })
                .unwrap_or_else(|| "Unknown".to_string());

            Message {
                id: m.id.clone(),
                conversation_id: m.conversation_id.clone(),
                sender_id: m.sender_id.clone(),
                sender_name,
                content: m.content.clone(),
                message_type: m.message_type.clone(),
                created_at: m.created_at.clone(),
            }
        })
        .collect();

    tracing::debug!(
        "Found {} messages matching '{}' in conversation {}",
        results.len(),
        query,
        conversation_id
    );

    Ok(results)
}

/// Search team members by name
#[tauri::command]
pub async fn search_team_members(
    query: String,
    app_state: State<'_, AppState>,
) -> Result<Vec<TeamMember>> {
    let inner = app_state.inner.read().await;
    let user = inner
        .user
        .as_ref()
        .ok_or_else(|| Error::Auth("Not authenticated".to_string()))?;
    let current_user_id = user.id.clone();

    let supabase = app_state
        .supabase
        .as_ref()
        .ok_or_else(|| Error::Config("Supabase not configured".to_string()))?;

    drop(inner);

    let query_lower = query.to_lowercase();

    let profiles = supabase.get_team_members().await?;
    let user_ids: Vec<String> = profiles.iter().map(|p| p.user_id.clone()).collect();
    let presence = supabase.get_users_presence(&user_ids).await?;

    let results: Vec<TeamMember> = profiles
        .iter()
        .filter(|p| p.user_id != current_user_id)
        .filter(|p| {
            p.display_name
                .as_ref()
                .map(|n| n.to_lowercase().contains(&query_lower))
                .unwrap_or(false)
        })
        .map(|p| {
            let is_online = presence
                .iter()
                .find(|pr| pr.user_id == p.user_id)
                .map(|pr| pr.status == "online")
                .unwrap_or(false);

            TeamMember {
                user_id: p.user_id.clone(),
                display_name: p.display_name.clone().unwrap_or_else(|| "Unknown".to_string()),
                avatar_url: p.avatar_url.clone(),
                is_online,
            }
        })
        .collect();

    tracing::debug!("Found {} team members matching '{}'", results.len(), query);
    Ok(results)
}
