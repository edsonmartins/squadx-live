//! Cache management commands for Tauri

use serde::{Deserialize, Serialize};
use tauri::State;

use crate::state::AppState;
use crate::Result;

// ==========================================
// Response Types
// ==========================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CacheStats {
    pub meetings_months_cached: usize,
    pub meetings_by_id_cached: usize,
    pub meetings_has_upcoming: bool,
    pub messages_conversations_cached: usize,
    pub presence_users_cached: usize,
    pub presence_has_team_members: bool,
}

// ==========================================
// Commands
// ==========================================

/// Get cache statistics
#[tauri::command]
pub async fn get_cache_stats(app_state: State<'_, AppState>) -> Result<CacheStats> {
    let meetings_cache = app_state.cache.meetings.read().await;
    let messages_cache = app_state.cache.messages.read().await;
    let presence_cache = app_state.cache.presence.read().await;

    let meeting_stats = meetings_cache.stats();

    Ok(CacheStats {
        meetings_months_cached: meeting_stats.months_cached,
        meetings_by_id_cached: meeting_stats.meetings_cached,
        meetings_has_upcoming: meeting_stats.has_upcoming,
        messages_conversations_cached: messages_cache.conversation_count(),
        presence_users_cached: presence_cache.user_count(),
        presence_has_team_members: presence_cache.has_team_members(),
    })
}

/// Invalidate all caches
#[tauri::command]
pub async fn invalidate_all_caches(app_state: State<'_, AppState>) -> Result<()> {
    app_state.cache.invalidate_all().await;
    tracing::info!("All caches invalidated");
    Ok(())
}

/// Cleanup expired cache entries
#[tauri::command]
pub async fn cleanup_caches(app_state: State<'_, AppState>) -> Result<()> {
    app_state.cache.cleanup().await;
    tracing::info!("Expired cache entries cleaned up");
    Ok(())
}

/// Invalidate meeting cache for a specific month
#[tauri::command]
pub async fn invalidate_meeting_month(
    year: i32,
    month: u32,
    app_state: State<'_, AppState>,
) -> Result<()> {
    let mut cache = app_state.cache.meetings.write().await;
    cache.invalidate_month(year, month);
    tracing::info!("Meeting cache invalidated for {}-{:02}", year, month);
    Ok(())
}

/// Invalidate message cache for a conversation
#[tauri::command]
pub async fn invalidate_conversation_messages(
    conversation_id: String,
    app_state: State<'_, AppState>,
) -> Result<()> {
    let mut cache = app_state.cache.messages.write().await;
    cache.invalidate_conversation(&conversation_id);
    tracing::info!("Message cache invalidated for conversation {}", conversation_id);
    Ok(())
}

/// Invalidate all presence cache
#[tauri::command]
pub async fn invalidate_presence_cache(app_state: State<'_, AppState>) -> Result<()> {
    let mut cache = app_state.cache.presence.write().await;
    cache.invalidate_all();
    tracing::info!("Presence cache invalidated");
    Ok(())
}
