use futures_util::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tauri::{AppHandle, Emitter};
use tokio::sync::RwLock;
use tokio_tungstenite::{connect_async, tungstenite::Message as WsMessage};

use crate::cache::SharedCache;
use crate::commands::chat::Message;
use crate::{Error, Result};

const REALTIME_VERSION: &str = "1.0.0";
const HEARTBEAT_INTERVAL_MS: u64 = 30000;

/// Supabase Realtime message format
#[derive(Debug, Serialize, Deserialize)]
struct RealtimeMessage {
    topic: String,
    event: String,
    payload: serde_json::Value,
    #[serde(rename = "ref")]
    reference: Option<String>,
}

/// Chat Realtime Client
#[derive(Debug)]
pub struct ChatRealtimeClient {
    inner: Arc<RwLock<ChatRealtimeClientInner>>,
}

#[derive(Debug)]
struct ChatRealtimeClientInner {
    supabase_url: String,
    anon_key: String,
    access_token: Option<String>,
    is_connected: bool,
    message_tx: Option<tokio::sync::mpsc::Sender<RealtimeMessage>>,
}

impl ChatRealtimeClient {
    pub fn new(supabase_url: &str, anon_key: &str) -> Self {
        Self {
            inner: Arc::new(RwLock::new(ChatRealtimeClientInner {
                supabase_url: supabase_url.to_string(),
                anon_key: anon_key.to_string(),
                access_token: None,
                is_connected: false,
                message_tx: None,
            })),
        }
    }

    pub fn from_env() -> Result<Self> {
        let supabase_url = std::env::var("VITE_SUPABASE_URL")
            .or_else(|_| std::env::var("NEXT_PUBLIC_SUPABASE_URL"))
            .map_err(|_| Error::Config("SUPABASE_URL not set".to_string()))?;

        let anon_key = std::env::var("VITE_SUPABASE_ANON_KEY")
            .or_else(|_| std::env::var("NEXT_PUBLIC_SUPABASE_ANON_KEY"))
            .map_err(|_| Error::Config("SUPABASE_ANON_KEY not set".to_string()))?;

        Ok(Self::new(&supabase_url, &anon_key))
    }

    pub async fn set_access_token(&self, token: Option<String>) {
        let mut inner = self.inner.write().await;
        inner.access_token = token;
    }

    /// Connect to Supabase Realtime and subscribe to chat channels
    pub async fn connect(&self, user_id: &str, app_handle: AppHandle, cache: Option<SharedCache>) -> Result<()> {
        let inner = self.inner.read().await;
        let access_token = inner
            .access_token
            .clone()
            .ok_or_else(|| Error::Auth("Not authenticated".to_string()))?;

        // Build WebSocket URL
        let ws_url = inner
            .supabase_url
            .replace("https://", "wss://")
            .replace("http://", "ws://");
        let realtime_url = format!(
            "{}/realtime/v1/websocket?apikey={}&vsn={}",
            ws_url, inner.anon_key, REALTIME_VERSION
        );

        drop(inner);

        tracing::info!("Connecting to Chat Realtime: {}", realtime_url);

        // Connect to WebSocket
        let (ws_stream, _) = connect_async(&realtime_url)
            .await
            .map_err(|e| Error::Network(format!("WebSocket connection failed: {}", e)))?;

        let (mut write, mut read) = ws_stream.split();

        // Create channel for outgoing messages
        let (message_tx, mut message_rx) = tokio::sync::mpsc::channel::<RealtimeMessage>(100);

        // Update state
        {
            let mut inner = self.inner.write().await;
            inner.is_connected = true;
            inner.message_tx = Some(message_tx);
        }

        let inner_clone = self.inner.clone();
        let user_id_clone = user_id.to_string();
        let access_token_clone = access_token.clone();

        // Spawn task to handle incoming messages
        let app_handle_clone = app_handle.clone();
        let cache_clone = cache.clone();
        tokio::spawn(async move {
            while let Some(msg) = read.next().await {
                match msg {
                    Ok(WsMessage::Text(text)) => {
                        if let Ok(realtime_msg) = serde_json::from_str::<RealtimeMessage>(&text) {
                            tracing::debug!("Chat Realtime received: {:?}", realtime_msg);

                            // Handle different events
                            match realtime_msg.event.as_str() {
                                "phx_reply" => {
                                    // Connection/join confirmation
                                    if realtime_msg.payload.get("status")
                                        == Some(&serde_json::json!("ok"))
                                    {
                                        tracing::info!("Chat channel joined successfully");
                                    }
                                }
                                "broadcast" => {
                                    // Chat message
                                    if let Some(payload) = realtime_msg.payload.get("payload") {
                                        if let Some(event_type) = payload.get("type").and_then(|t| t.as_str()) {
                                            match event_type {
                                                "chat_message" => {
                                                    if let Ok(message) =
                                                        serde_json::from_value::<Message>(
                                                            payload.clone(),
                                                        )
                                                    {
                                                        let _ = app_handle_clone.emit("chat:new-message", &message);
                                                    }
                                                }
                                                "presence_change" => {
                                                    // Update cache when presence changes
                                                    if let Some(ref cache) = cache_clone {
                                                        if let (Some(user_id), Some(is_online)) = (
                                                            payload.get("user_id").and_then(|v| v.as_str()),
                                                            payload.get("is_online").and_then(|v| v.as_bool()),
                                                        ) {
                                                            let mut presence = cache.presence.write().await;
                                                            presence.update_from_realtime(user_id, is_online);
                                                            tracing::debug!("Cache updated: {} is now {}", user_id, if is_online { "online" } else { "offline" });
                                                        }
                                                    }
                                                    let _ = app_handle_clone.emit("chat:presence-change", payload);
                                                }
                                                _ => {}
                                            }
                                        }
                                    }
                                }
                                "presence_diff" | "presence_state" => {
                                    // Handle presence diff to update cache
                                    if let Some(ref cache) = cache_clone {
                                        // Parse joins and leaves from presence_diff
                                        if let Some(joins) = realtime_msg.payload.get("joins") {
                                            if let Some(joins_obj) = joins.as_object() {
                                                for user_id in joins_obj.keys() {
                                                    let mut presence = cache.presence.write().await;
                                                    presence.update_from_realtime(user_id, true);
                                                    tracing::debug!("Presence join: {}", user_id);
                                                }
                                            }
                                        }
                                        if let Some(leaves) = realtime_msg.payload.get("leaves") {
                                            if let Some(leaves_obj) = leaves.as_object() {
                                                for user_id in leaves_obj.keys() {
                                                    let mut presence = cache.presence.write().await;
                                                    presence.update_from_realtime(user_id, false);
                                                    tracing::debug!("Presence leave: {}", user_id);
                                                }
                                            }
                                        }
                                    }
                                    let _ = app_handle_clone.emit("chat:presence-update", &realtime_msg.payload);
                                }
                                _ => {}
                            }
                        }
                    }
                    Ok(WsMessage::Close(_)) => {
                        tracing::info!("Chat WebSocket closed");
                        let mut inner = inner_clone.write().await;
                        inner.is_connected = false;
                        break;
                    }
                    Err(e) => {
                        tracing::error!("Chat WebSocket error: {}", e);
                        let mut inner = inner_clone.write().await;
                        inner.is_connected = false;
                        break;
                    }
                    _ => {}
                }
            }
        });

        // Spawn task to handle outgoing messages and heartbeat
        let inner_clone2 = self.inner.clone();
        tokio::spawn(async move {
            // Subscribe to a general chat channel for this user
            let channel_topic = format!("realtime:chat:user:{}", user_id_clone);

            // Send join message
            let join_msg = RealtimeMessage {
                topic: channel_topic.clone(),
                event: "phx_join".to_string(),
                payload: serde_json::json!({
                    "config": {
                        "broadcast": {
                            "self": false
                        },
                        "presence": {
                            "key": user_id_clone
                        }
                    },
                    "access_token": access_token_clone
                }),
                reference: Some("1".to_string()),
            };

            if let Ok(json) = serde_json::to_string(&join_msg) {
                let _ = write.send(WsMessage::Text(json)).await;
            }

            // Handle outgoing messages and heartbeat
            loop {
                tokio::select! {
                    Some(msg) = message_rx.recv() => {
                        if let Ok(json) = serde_json::to_string(&msg) {
                            if write.send(WsMessage::Text(json)).await.is_err() {
                                break;
                            }
                        }
                    }
                    _ = tokio::time::sleep(tokio::time::Duration::from_millis(HEARTBEAT_INTERVAL_MS)) => {
                        // Send heartbeat
                        let heartbeat = RealtimeMessage {
                            topic: "phoenix".to_string(),
                            event: "heartbeat".to_string(),
                            payload: serde_json::json!({}),
                            reference: None,
                        };
                        if let Ok(json) = serde_json::to_string(&heartbeat) {
                            if write.send(WsMessage::Text(json)).await.is_err() {
                                break;
                            }
                        }
                    }
                }

                // Check if still connected
                let inner = inner_clone2.read().await;
                if !inner.is_connected {
                    break;
                }
            }
        });

        tracing::info!("Chat Realtime connected");
        Ok(())
    }

    /// Broadcast a message to a conversation channel
    pub async fn broadcast_message(&self, conversation_id: &str, message: &Message) -> Result<()> {
        let inner = self.inner.read().await;

        if let Some(ref tx) = inner.message_tx {
            let channel_topic = format!("realtime:chat:{}", conversation_id);
            let broadcast_msg = RealtimeMessage {
                topic: channel_topic,
                event: "broadcast".to_string(),
                payload: serde_json::json!({
                    "type": "broadcast",
                    "event": "chat_message",
                    "payload": {
                        "type": "chat_message",
                        "id": message.id,
                        "conversation_id": message.conversation_id,
                        "sender_id": message.sender_id,
                        "sender_name": message.sender_name,
                        "content": message.content,
                        "message_type": message.message_type,
                        "created_at": message.created_at
                    }
                }),
                reference: None,
            };

            tx.send(broadcast_msg)
                .await
                .map_err(|e| Error::Network(format!("Failed to send message: {}", e)))?;
        }

        Ok(())
    }

    /// Subscribe to a specific conversation channel
    pub async fn subscribe_to_conversation(&self, conversation_id: &str) -> Result<()> {
        let inner = self.inner.read().await;
        let access_token = inner
            .access_token
            .clone()
            .ok_or_else(|| Error::Auth("Not authenticated".to_string()))?;

        if let Some(ref tx) = inner.message_tx {
            let channel_topic = format!("realtime:chat:{}", conversation_id);
            let join_msg = RealtimeMessage {
                topic: channel_topic,
                event: "phx_join".to_string(),
                payload: serde_json::json!({
                    "config": {
                        "broadcast": {
                            "self": false
                        }
                    },
                    "access_token": access_token
                }),
                reference: Some(uuid::Uuid::new_v4().to_string()),
            };

            tx.send(join_msg)
                .await
                .map_err(|e| Error::Network(format!("Failed to subscribe: {}", e)))?;
        }

        Ok(())
    }

    /// Disconnect from realtime
    pub async fn disconnect(&self) {
        let mut inner = self.inner.write().await;
        inner.is_connected = false;
        inner.message_tx = None;
    }
}

impl Clone for ChatRealtimeClient {
    fn clone(&self) -> Self {
        Self {
            inner: self.inner.clone(),
        }
    }
}
