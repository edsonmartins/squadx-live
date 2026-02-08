use futures_util::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tokio::sync::{broadcast, mpsc, RwLock};
use tokio_tungstenite::{connect_async, tungstenite::Message};

use crate::{Error, Result};

const REALTIME_VERSION: &str = "1.0.0";
const HEARTBEAT_INTERVAL_MS: u64 = 30000;

/// Signaling message types for WebRTC
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum SignalingMessage {
    /// WebRTC offer from host
    Offer {
        sdp: String,
        from_user_id: String,
    },
    /// WebRTC answer from viewer
    Answer {
        sdp: String,
        from_user_id: String,
    },
    /// ICE candidate
    IceCandidate {
        candidate: String,
        sdp_mid: Option<String>,
        sdp_m_line_index: Option<u32>,
        from_user_id: String,
    },
    /// Control request from viewer
    ControlRequest {
        from_user_id: String,
    },
    /// Control grant from host
    ControlGrant {
        to_user_id: String,
    },
    /// Control revoke from host
    ControlRevoke {
        to_user_id: String,
    },
    /// User joined the session
    UserJoined {
        user_id: String,
        is_host: bool,
    },
    /// User left the session
    UserLeft {
        user_id: String,
    },
    /// Chat message
    ChatMessage {
        id: String,
        from_user_id: String,
        from_username: String,
        content: String,
        timestamp: u64,
    },
}

/// Supabase Realtime message format
#[derive(Debug, Serialize, Deserialize)]
struct RealtimeMessage {
    topic: String,
    event: String,
    payload: serde_json::Value,
    #[serde(rename = "ref")]
    reference: Option<String>,
}

/// Channel state
#[derive(Debug, Clone, PartialEq)]
pub enum ChannelState {
    Disconnected,
    Connecting,
    Connected,
    Joined,
    Error(String),
}

/// Realtime client for Supabase
#[derive(Debug)]
pub struct RealtimeClient {
    inner: Arc<RwLock<RealtimeClientInner>>,
}

#[derive(Debug)]
struct RealtimeClientInner {
    supabase_url: String,
    anon_key: String,
    access_token: Option<String>,
    state: ChannelState,
    current_channel: Option<String>,
    message_tx: Option<mpsc::Sender<RealtimeMessage>>,
}

impl RealtimeClient {
    pub fn new(supabase_url: &str, anon_key: &str) -> Self {
        Self {
            inner: Arc::new(RwLock::new(RealtimeClientInner {
                supabase_url: supabase_url.to_string(),
                anon_key: anon_key.to_string(),
                access_token: None,
                state: ChannelState::Disconnected,
                current_channel: None,
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

    #[allow(dead_code)]
    pub fn from_env_optional() -> Option<Self> {
        Self::from_env().ok()
    }

    pub async fn set_access_token(&self, token: Option<String>) {
        let mut inner = self.inner.write().await;
        inner.access_token = token;
    }

    #[allow(dead_code)]
    pub async fn get_state(&self) -> ChannelState {
        let inner = self.inner.read().await;
        inner.state.clone()
    }

    /// Connect to Supabase Realtime and join a session channel
    pub async fn join_channel(
        &self,
        session_id: &str,
        user_id: &str,
        is_host: bool,
    ) -> Result<(
        broadcast::Receiver<SignalingMessage>,
        mpsc::Sender<SignalingMessage>,
    )> {
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

        tracing::info!("Connecting to Realtime: {}", realtime_url);

        // Connect to WebSocket
        let (ws_stream, _) = connect_async(&realtime_url)
            .await
            .map_err(|e| Error::Network(format!("WebSocket connection failed: {}", e)))?;

        let (mut write, mut read) = ws_stream.split();

        // Create channels for communication
        let (signaling_tx, signaling_rx) = broadcast::channel::<SignalingMessage>(100);
        let (outgoing_tx, mut outgoing_rx) = mpsc::channel::<SignalingMessage>(100);
        let (internal_tx, mut internal_rx) = mpsc::channel::<RealtimeMessage>(100);

        // Update state
        {
            let mut inner = self.inner.write().await;
            inner.state = ChannelState::Connecting;
            inner.current_channel = Some(session_id.to_string());
            inner.message_tx = Some(internal_tx.clone());
        }

        let channel_topic = format!("realtime:session:{}", session_id);
        let user_id_clone = user_id.to_string();
        let signaling_tx_clone = signaling_tx.clone();
        let inner_clone = self.inner.clone();

        // Spawn task to handle incoming messages
        tokio::spawn(async move {
            while let Some(msg) = read.next().await {
                match msg {
                    Ok(Message::Text(text)) => {
                        if let Ok(realtime_msg) = serde_json::from_str::<RealtimeMessage>(&text) {
                            tracing::debug!("Received: {:?}", realtime_msg);

                            // Handle different events
                            match realtime_msg.event.as_str() {
                                "phx_reply" => {
                                    // Join confirmation
                                    if realtime_msg.payload.get("status")
                                        == Some(&serde_json::json!("ok"))
                                    {
                                        let mut inner = inner_clone.write().await;
                                        inner.state = ChannelState::Joined;
                                        tracing::info!("Joined channel successfully");
                                    }
                                }
                                "broadcast" => {
                                    // Signaling message
                                    if let Some(payload) = realtime_msg.payload.get("payload") {
                                        if let Ok(signaling) =
                                            serde_json::from_value::<SignalingMessage>(
                                                payload.clone(),
                                            )
                                        {
                                            let _ = signaling_tx_clone.send(signaling);
                                        }
                                    }
                                }
                                "presence_diff" | "presence_state" => {
                                    // Presence updates - could be used for user list
                                    tracing::debug!("Presence update: {:?}", realtime_msg.payload);
                                }
                                _ => {}
                            }
                        }
                    }
                    Ok(Message::Close(_)) => {
                        tracing::info!("WebSocket closed");
                        let mut inner = inner_clone.write().await;
                        inner.state = ChannelState::Disconnected;
                        break;
                    }
                    Err(e) => {
                        tracing::error!("WebSocket error: {}", e);
                        let mut inner = inner_clone.write().await;
                        inner.state = ChannelState::Error(e.to_string());
                        break;
                    }
                    _ => {}
                }
            }
        });

        let channel_topic_clone = channel_topic.clone();
        let access_token_clone = access_token.clone();

        // Spawn task to handle outgoing messages
        tokio::spawn(async move {
            // First, send join message
            let join_msg = RealtimeMessage {
                topic: channel_topic_clone.clone(),
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
                let _ = write.send(Message::Text(json)).await;
            }

            // Send user joined notification
            let joined_msg = SignalingMessage::UserJoined {
                user_id: user_id_clone.clone(),
                is_host,
            };
            let broadcast_msg = RealtimeMessage {
                topic: channel_topic_clone.clone(),
                event: "broadcast".to_string(),
                payload: serde_json::json!({
                    "type": "broadcast",
                    "event": "signaling",
                    "payload": joined_msg
                }),
                reference: None,
            };
            if let Ok(json) = serde_json::to_string(&broadcast_msg) {
                let _ = write.send(Message::Text(json)).await;
            }

            // Handle outgoing signaling messages
            loop {
                tokio::select! {
                    Some(signaling) = outgoing_rx.recv() => {
                        let broadcast_msg = RealtimeMessage {
                            topic: channel_topic_clone.clone(),
                            event: "broadcast".to_string(),
                            payload: serde_json::json!({
                                "type": "broadcast",
                                "event": "signaling",
                                "payload": signaling
                            }),
                            reference: None,
                        };
                        if let Ok(json) = serde_json::to_string(&broadcast_msg) {
                            if write.send(Message::Text(json)).await.is_err() {
                                break;
                            }
                        }
                    }
                    Some(internal_msg) = internal_rx.recv() => {
                        if let Ok(json) = serde_json::to_string(&internal_msg) {
                            if write.send(Message::Text(json)).await.is_err() {
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
                            if write.send(Message::Text(json)).await.is_err() {
                                break;
                            }
                        }
                    }
                }
            }
        });

        {
            let mut inner = self.inner.write().await;
            inner.state = ChannelState::Connected;
        }

        Ok((signaling_rx, outgoing_tx))
    }

    /// Leave the current channel
    pub async fn leave_channel(&self, user_id: &str) -> Result<()> {
        let mut inner = self.inner.write().await;

        if let Some(ref channel) = inner.current_channel {
            // Send user left notification
            if let Some(ref tx) = inner.message_tx {
                let leave_msg = RealtimeMessage {
                    topic: format!("realtime:session:{}", channel),
                    event: "broadcast".to_string(),
                    payload: serde_json::json!({
                        "type": "broadcast",
                        "event": "signaling",
                        "payload": SignalingMessage::UserLeft {
                            user_id: user_id.to_string()
                        }
                    }),
                    reference: None,
                };
                let _ = tx.send(leave_msg).await;
            }
        }

        inner.current_channel = None;
        inner.message_tx = None;
        inner.state = ChannelState::Disconnected;

        Ok(())
    }
}

impl Clone for RealtimeClient {
    fn clone(&self) -> Self {
        Self {
            inner: self.inner.clone(),
        }
    }
}
