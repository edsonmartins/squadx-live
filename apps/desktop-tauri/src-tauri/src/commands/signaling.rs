use std::sync::Arc;
use tauri::{AppHandle, Emitter, State};
use tokio::sync::{mpsc, RwLock};

use crate::realtime::{RealtimeClient, SignalingMessage};
use crate::state::AppState;
use crate::{Error, Result};

/// Signaling state managed by Tauri
pub struct SignalingState {
    pub inner: Arc<RwLock<SignalingStateInner>>,
}

#[derive(Default)]
pub struct SignalingStateInner {
    pub realtime: Option<RealtimeClient>,
    pub signaling_tx: Option<mpsc::Sender<SignalingMessage>>,
    pub is_connected: bool,
}

impl Default for SignalingState {
    fn default() -> Self {
        Self {
            inner: Arc::new(RwLock::new(SignalingStateInner::default())),
        }
    }
}

/// Connect to signaling channel for a session
#[tauri::command]
pub async fn connect_signaling(
    session_id: String,
    app_state: State<'_, AppState>,
    signaling_state: State<'_, SignalingState>,
    app_handle: AppHandle,
) -> Result<()> {
    let inner = app_state.inner.read().await;
    let user = inner
        .user
        .as_ref()
        .ok_or_else(|| Error::Auth("Not authenticated".to_string()))?;
    let user_id = user.id.clone();
    let access_token = user.access_token.clone();

    let session = inner
        .session
        .as_ref()
        .ok_or_else(|| Error::Session("No active session".to_string()))?;
    let is_host = session.is_host;
    drop(inner);

    // Create realtime client
    let realtime = RealtimeClient::from_env()?;
    realtime.set_access_token(Some(access_token)).await;

    // Join the session channel
    let (mut signaling_rx, signaling_tx) = realtime
        .join_channel(&session_id, &user_id, is_host)
        .await?;

    // Update signaling state
    {
        let mut state = signaling_state.inner.write().await;
        state.realtime = Some(realtime);
        state.signaling_tx = Some(signaling_tx);
        state.is_connected = true;
    }

    // Spawn task to forward incoming signaling messages to frontend
    let app_handle_clone = app_handle.clone();
    tokio::spawn(async move {
        while let Ok(msg) = signaling_rx.recv().await {
            // Emit to frontend
            let event_name = match &msg {
                SignalingMessage::Offer { .. } => "signaling:offer",
                SignalingMessage::Answer { .. } => "signaling:answer",
                SignalingMessage::IceCandidate { .. } => "signaling:ice-candidate",
                SignalingMessage::ControlRequest { .. } => "signaling:control-request",
                SignalingMessage::ControlGrant { .. } => "signaling:control-grant",
                SignalingMessage::ControlRevoke { .. } => "signaling:control-revoke",
                SignalingMessage::UserJoined { .. } => "signaling:user-joined",
                SignalingMessage::UserLeft { .. } => "signaling:user-left",
                SignalingMessage::ChatMessage { .. } => "signaling:chat-message",
            };

            if let Err(e) = app_handle_clone.emit(event_name, &msg) {
                tracing::error!("Failed to emit signaling event: {}", e);
            }
        }
    });

    tracing::info!("Connected to signaling channel: {}", session_id);
    Ok(())
}

/// Disconnect from signaling channel
#[tauri::command]
pub async fn disconnect_signaling(
    app_state: State<'_, AppState>,
    signaling_state: State<'_, SignalingState>,
) -> Result<()> {
    let user_id = {
        let inner = app_state.inner.read().await;
        inner
            .user
            .as_ref()
            .map(|u| u.id.clone())
            .unwrap_or_default()
    };

    let mut state = signaling_state.inner.write().await;

    if let Some(ref realtime) = state.realtime {
        realtime.leave_channel(&user_id).await?;
    }

    state.realtime = None;
    state.signaling_tx = None;
    state.is_connected = false;

    tracing::info!("Disconnected from signaling channel");
    Ok(())
}

/// Send a WebRTC offer (host only)
#[tauri::command]
pub async fn send_offer(
    sdp: String,
    app_state: State<'_, AppState>,
    signaling_state: State<'_, SignalingState>,
) -> Result<()> {
    let user_id = {
        let inner = app_state.inner.read().await;
        inner
            .user
            .as_ref()
            .ok_or_else(|| Error::Auth("Not authenticated".to_string()))?
            .id
            .clone()
    };

    let state = signaling_state.inner.read().await;
    let tx = state
        .signaling_tx
        .as_ref()
        .ok_or_else(|| Error::Session("Not connected to signaling".to_string()))?;

    tx.send(SignalingMessage::Offer {
        sdp,
        from_user_id: user_id,
    })
    .await
    .map_err(|e| Error::Network(format!("Failed to send offer: {}", e)))?;

    Ok(())
}

/// Send a WebRTC answer (viewer only)
#[tauri::command]
pub async fn send_answer(
    sdp: String,
    app_state: State<'_, AppState>,
    signaling_state: State<'_, SignalingState>,
) -> Result<()> {
    let user_id = {
        let inner = app_state.inner.read().await;
        inner
            .user
            .as_ref()
            .ok_or_else(|| Error::Auth("Not authenticated".to_string()))?
            .id
            .clone()
    };

    let state = signaling_state.inner.read().await;
    let tx = state
        .signaling_tx
        .as_ref()
        .ok_or_else(|| Error::Session("Not connected to signaling".to_string()))?;

    tx.send(SignalingMessage::Answer {
        sdp,
        from_user_id: user_id,
    })
    .await
    .map_err(|e| Error::Network(format!("Failed to send answer: {}", e)))?;

    Ok(())
}

/// Send an ICE candidate
#[tauri::command]
pub async fn send_ice_candidate(
    candidate: String,
    sdp_mid: Option<String>,
    sdp_m_line_index: Option<u32>,
    app_state: State<'_, AppState>,
    signaling_state: State<'_, SignalingState>,
) -> Result<()> {
    let user_id = {
        let inner = app_state.inner.read().await;
        inner
            .user
            .as_ref()
            .ok_or_else(|| Error::Auth("Not authenticated".to_string()))?
            .id
            .clone()
    };

    let state = signaling_state.inner.read().await;
    let tx = state
        .signaling_tx
        .as_ref()
        .ok_or_else(|| Error::Session("Not connected to signaling".to_string()))?;

    tx.send(SignalingMessage::IceCandidate {
        candidate,
        sdp_mid,
        sdp_m_line_index,
        from_user_id: user_id,
    })
    .await
    .map_err(|e| Error::Network(format!("Failed to send ICE candidate: {}", e)))?;

    Ok(())
}

/// Request control (viewer only)
#[tauri::command]
pub async fn request_control(
    app_state: State<'_, AppState>,
    signaling_state: State<'_, SignalingState>,
) -> Result<()> {
    let user_id = {
        let inner = app_state.inner.read().await;
        inner
            .user
            .as_ref()
            .ok_or_else(|| Error::Auth("Not authenticated".to_string()))?
            .id
            .clone()
    };

    let state = signaling_state.inner.read().await;
    let tx = state
        .signaling_tx
        .as_ref()
        .ok_or_else(|| Error::Session("Not connected to signaling".to_string()))?;

    tx.send(SignalingMessage::ControlRequest {
        from_user_id: user_id,
    })
    .await
    .map_err(|e| Error::Network(format!("Failed to send control request: {}", e)))?;

    Ok(())
}

/// Grant control to a viewer (host only)
#[tauri::command]
pub async fn grant_control(
    to_user_id: String,
    signaling_state: State<'_, SignalingState>,
) -> Result<()> {
    let state = signaling_state.inner.read().await;
    let tx = state
        .signaling_tx
        .as_ref()
        .ok_or_else(|| Error::Session("Not connected to signaling".to_string()))?;

    tx.send(SignalingMessage::ControlGrant { to_user_id })
        .await
        .map_err(|e| Error::Network(format!("Failed to send control grant: {}", e)))?;

    Ok(())
}

/// Revoke control from a viewer (host only)
#[tauri::command]
pub async fn revoke_control(
    to_user_id: String,
    signaling_state: State<'_, SignalingState>,
) -> Result<()> {
    let state = signaling_state.inner.read().await;
    let tx = state
        .signaling_tx
        .as_ref()
        .ok_or_else(|| Error::Session("Not connected to signaling".to_string()))?;

    tx.send(SignalingMessage::ControlRevoke { to_user_id })
        .await
        .map_err(|e| Error::Network(format!("Failed to send control revoke: {}", e)))?;

    Ok(())
}

/// Get signaling connection status
#[tauri::command]
pub async fn get_signaling_status(
    signaling_state: State<'_, SignalingState>,
) -> Result<bool> {
    let state = signaling_state.inner.read().await;
    Ok(state.is_connected)
}

/// Send a chat message
#[tauri::command]
pub async fn send_chat_message(
    content: String,
    app_state: State<'_, AppState>,
    signaling_state: State<'_, SignalingState>,
) -> Result<String> {
    let (user_id, username) = {
        let inner = app_state.inner.read().await;
        let user = inner
            .user
            .as_ref()
            .ok_or_else(|| Error::Auth("Not authenticated".to_string()))?;
        (user.id.clone(), user.email.clone())
    };

    let state = signaling_state.inner.read().await;
    let tx = state
        .signaling_tx
        .as_ref()
        .ok_or_else(|| Error::Session("Not connected to signaling".to_string()))?;

    // Generate unique message ID
    let message_id = uuid::Uuid::new_v4().to_string();

    // Get current timestamp in milliseconds
    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64;

    tx.send(SignalingMessage::ChatMessage {
        id: message_id.clone(),
        from_user_id: user_id,
        from_username: username,
        content,
        timestamp,
    })
    .await
    .map_err(|e| Error::Network(format!("Failed to send chat message: {}", e)))?;

    Ok(message_id)
}
