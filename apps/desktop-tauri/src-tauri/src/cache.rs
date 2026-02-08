//! Cache module for meetings, messages, and other frequently accessed data
//!
//! Provides in-memory caching with TTL support to reduce API calls
//! and improve application performance.

use std::collections::HashMap;
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::sync::RwLock;

use crate::commands::calendar::Meeting;
use crate::supabase::MessageRow;

// ==========================================
// Generic Cache Entry
// ==========================================

#[derive(Debug, Clone)]
pub struct CacheEntry<T> {
    pub data: T,
    pub created_at: Instant,
    pub ttl: Duration,
}

impl<T> CacheEntry<T> {
    pub fn new(data: T, ttl: Duration) -> Self {
        Self {
            data,
            created_at: Instant::now(),
            ttl,
        }
    }

    pub fn is_expired(&self) -> bool {
        self.created_at.elapsed() > self.ttl
    }

    pub fn remaining_ttl(&self) -> Duration {
        let elapsed = self.created_at.elapsed();
        if elapsed > self.ttl {
            Duration::ZERO
        } else {
            self.ttl - elapsed
        }
    }
}

// ==========================================
// Meeting Cache
// ==========================================

/// Cache key for monthly meetings: "YYYY-MM"
pub type MonthKey = String;

#[derive(Debug, Default)]
pub struct MeetingCache {
    /// Meetings by month (key: "YYYY-MM")
    by_month: HashMap<MonthKey, CacheEntry<Vec<Meeting>>>,
    /// Individual meetings by ID
    by_id: HashMap<String, CacheEntry<Meeting>>,
    /// Upcoming meetings for a user
    upcoming: Option<CacheEntry<Vec<Meeting>>>,
    /// Default TTL for cached data
    default_ttl: Duration,
}

impl MeetingCache {
    pub fn new() -> Self {
        Self {
            by_month: HashMap::new(),
            by_id: HashMap::new(),
            upcoming: None,
            default_ttl: Duration::from_secs(300), // 5 minutes
        }
    }

    pub fn with_ttl(mut self, ttl: Duration) -> Self {
        self.default_ttl = ttl;
        self
    }

    /// Get meetings for a specific month
    pub fn get_month(&self, year: i32, month: u32) -> Option<&Vec<Meeting>> {
        let key = format!("{}-{:02}", year, month);
        self.by_month
            .get(&key)
            .filter(|entry| !entry.is_expired())
            .map(|entry| &entry.data)
    }

    /// Store meetings for a specific month
    pub fn set_month(&mut self, year: i32, month: u32, meetings: Vec<Meeting>) {
        let key = format!("{}-{:02}", year, month);
        self.by_month
            .insert(key, CacheEntry::new(meetings, self.default_ttl));
    }

    /// Get a single meeting by ID
    pub fn get_by_id(&self, id: &str) -> Option<&Meeting> {
        self.by_id
            .get(id)
            .filter(|entry| !entry.is_expired())
            .map(|entry| &entry.data)
    }

    /// Store a single meeting
    pub fn set_by_id(&mut self, meeting: Meeting) {
        let id = meeting.id.clone();
        self.by_id
            .insert(id, CacheEntry::new(meeting, self.default_ttl));
    }

    /// Get upcoming meetings
    pub fn get_upcoming(&self) -> Option<&Vec<Meeting>> {
        self.upcoming
            .as_ref()
            .filter(|entry| !entry.is_expired())
            .map(|entry| &entry.data)
    }

    /// Store upcoming meetings
    pub fn set_upcoming(&mut self, meetings: Vec<Meeting>) {
        self.upcoming = Some(CacheEntry::new(meetings, Duration::from_secs(60))); // 1 minute TTL
    }

    /// Invalidate a specific month
    pub fn invalidate_month(&mut self, year: i32, month: u32) {
        let key = format!("{}-{:02}", year, month);
        self.by_month.remove(&key);
    }

    /// Invalidate a specific meeting (and related month caches)
    pub fn invalidate_meeting(&mut self, meeting_id: &str) {
        self.by_id.remove(meeting_id);
        // Also invalidate upcoming since it might contain this meeting
        self.upcoming = None;
    }

    /// Invalidate all cached data
    pub fn invalidate_all(&mut self) {
        self.by_month.clear();
        self.by_id.clear();
        self.upcoming = None;
    }

    /// Clean up expired entries
    pub fn cleanup(&mut self) {
        self.by_month.retain(|_, entry| !entry.is_expired());
        self.by_id.retain(|_, entry| !entry.is_expired());
        if let Some(ref entry) = self.upcoming {
            if entry.is_expired() {
                self.upcoming = None;
            }
        }
    }

    /// Get cache statistics
    pub fn stats(&self) -> CacheStats {
        CacheStats {
            months_cached: self.by_month.len(),
            meetings_cached: self.by_id.len(),
            has_upcoming: self.upcoming.is_some(),
        }
    }
}

// ==========================================
// Message Cache
// ==========================================

#[derive(Debug, Default)]
pub struct MessageCache {
    /// Messages by conversation ID
    by_conversation: HashMap<String, CacheEntry<Vec<MessageRow>>>,
    /// Last message timestamp per conversation (for incremental fetching)
    last_timestamp: HashMap<String, String>,
    /// Default TTL
    default_ttl: Duration,
}

impl MessageCache {
    pub fn new() -> Self {
        Self {
            by_conversation: HashMap::new(),
            last_timestamp: HashMap::new(),
            default_ttl: Duration::from_secs(120), // 2 minutes
        }
    }

    /// Get messages for a conversation
    pub fn get_messages(&self, conversation_id: &str) -> Option<&Vec<MessageRow>> {
        self.by_conversation
            .get(conversation_id)
            .filter(|entry| !entry.is_expired())
            .map(|entry| &entry.data)
    }

    /// Store messages for a conversation
    pub fn set_messages(&mut self, conversation_id: &str, messages: Vec<MessageRow>) {
        // Update last timestamp
        if let Some(last_msg) = messages.last() {
            if let Some(ref ts) = last_msg.created_at {
                self.last_timestamp
                    .insert(conversation_id.to_string(), ts.clone());
            }
        }

        self.by_conversation.insert(
            conversation_id.to_string(),
            CacheEntry::new(messages, self.default_ttl),
        );
    }

    /// Append new messages to existing cache
    pub fn append_messages(&mut self, conversation_id: &str, new_messages: Vec<MessageRow>) {
        if new_messages.is_empty() {
            return;
        }

        // Update last timestamp
        if let Some(last_msg) = new_messages.last() {
            if let Some(ref ts) = last_msg.created_at {
                self.last_timestamp
                    .insert(conversation_id.to_string(), ts.clone());
            }
        }

        if let Some(entry) = self.by_conversation.get_mut(conversation_id) {
            // Collect existing IDs as owned strings to avoid borrow conflict
            let existing_ids: std::collections::HashSet<String> =
                entry.data.iter().map(|m| m.id.clone()).collect();

            for msg in new_messages {
                if !existing_ids.contains(&msg.id) {
                    entry.data.push(msg);
                }
            }

            // Re-sort by timestamp
            entry.data.sort_by(|a, b| {
                a.created_at
                    .as_ref()
                    .cmp(&b.created_at.as_ref())
            });
        } else {
            // No existing cache, just set
            self.set_messages(conversation_id, new_messages);
        }
    }

    /// Get the last timestamp for incremental fetching
    pub fn get_last_timestamp(&self, conversation_id: &str) -> Option<&str> {
        self.last_timestamp.get(conversation_id).map(|s| s.as_str())
    }

    /// Invalidate a conversation's messages
    pub fn invalidate_conversation(&mut self, conversation_id: &str) {
        self.by_conversation.remove(conversation_id);
        self.last_timestamp.remove(conversation_id);
    }

    /// Invalidate all cached messages
    pub fn invalidate_all(&mut self) {
        self.by_conversation.clear();
        self.last_timestamp.clear();
    }

    /// Clean up expired entries
    pub fn cleanup(&mut self) {
        self.by_conversation.retain(|_, entry| !entry.is_expired());
    }

    /// Get number of cached conversations
    pub fn conversation_count(&self) -> usize {
        self.by_conversation.len()
    }
}

// ==========================================
// Presence Cache
// ==========================================

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct PresenceInfo {
    pub user_id: String,
    pub is_online: bool,
    pub last_seen: Option<String>,
    pub status: Option<String>,
}

#[derive(Debug, Default)]
pub struct PresenceCache {
    /// Presence by user ID
    by_user: HashMap<String, CacheEntry<PresenceInfo>>,
    /// Team members list
    team_members: Option<CacheEntry<Vec<PresenceInfo>>>,
    /// Default TTL (shorter for presence data)
    default_ttl: Duration,
}

impl PresenceCache {
    pub fn new() -> Self {
        Self {
            by_user: HashMap::new(),
            team_members: None,
            default_ttl: Duration::from_secs(30), // 30 seconds
        }
    }

    /// Get presence for a user
    pub fn get_user(&self, user_id: &str) -> Option<&PresenceInfo> {
        self.by_user
            .get(user_id)
            .filter(|entry| !entry.is_expired())
            .map(|entry| &entry.data)
    }

    /// Update presence for a user
    pub fn set_user(&mut self, presence: PresenceInfo) {
        let user_id = presence.user_id.clone();
        self.by_user
            .insert(user_id, CacheEntry::new(presence, self.default_ttl));
    }

    /// Get team members
    pub fn get_team_members(&self) -> Option<&Vec<PresenceInfo>> {
        self.team_members
            .as_ref()
            .filter(|entry| !entry.is_expired())
            .map(|entry| &entry.data)
    }

    /// Set team members
    pub fn set_team_members(&mut self, members: Vec<PresenceInfo>) {
        // Also update individual user cache
        for member in &members {
            self.set_user(member.clone());
        }

        self.team_members = Some(CacheEntry::new(members, self.default_ttl));
    }

    /// Handle realtime presence update
    pub fn update_from_realtime(&mut self, user_id: &str, is_online: bool) {
        if let Some(entry) = self.by_user.get_mut(user_id) {
            entry.data.is_online = is_online;
            entry.created_at = Instant::now(); // Refresh TTL
        }

        // Also update team members if cached
        if let Some(ref mut entry) = self.team_members {
            if let Some(member) = entry.data.iter_mut().find(|m| m.user_id == user_id) {
                member.is_online = is_online;
            }
            entry.created_at = Instant::now(); // Refresh TTL
        }
    }

    /// Invalidate all
    pub fn invalidate_all(&mut self) {
        self.by_user.clear();
        self.team_members = None;
    }

    /// Cleanup expired
    pub fn cleanup(&mut self) {
        self.by_user.retain(|_, entry| !entry.is_expired());
        if let Some(ref entry) = self.team_members {
            if entry.is_expired() {
                self.team_members = None;
            }
        }
    }

    /// Get number of cached users
    pub fn user_count(&self) -> usize {
        self.by_user.len()
    }

    /// Check if team members are cached
    pub fn has_team_members(&self) -> bool {
        self.team_members.is_some()
    }
}

// ==========================================
// Cache Statistics
// ==========================================

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct CacheStats {
    pub months_cached: usize,
    pub meetings_cached: usize,
    pub has_upcoming: bool,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct FullCacheStats {
    pub meetings: CacheStats,
    pub conversations_cached: usize,
    pub users_presence_cached: usize,
}

// ==========================================
// App Cache Manager
// ==========================================

#[derive(Debug, Default)]
pub struct AppCache {
    pub meetings: RwLock<MeetingCache>,
    pub messages: RwLock<MessageCache>,
    pub presence: RwLock<PresenceCache>,
}

impl AppCache {
    pub fn new() -> Self {
        Self {
            meetings: RwLock::new(MeetingCache::new()),
            messages: RwLock::new(MessageCache::new()),
            presence: RwLock::new(PresenceCache::new()),
        }
    }

    /// Get full cache statistics
    pub async fn stats(&self) -> FullCacheStats {
        let meetings = self.meetings.read().await;
        let messages = self.messages.read().await;
        let presence = self.presence.read().await;

        FullCacheStats {
            meetings: meetings.stats(),
            conversations_cached: messages.by_conversation.len(),
            users_presence_cached: presence.by_user.len(),
        }
    }

    /// Cleanup all expired entries
    pub async fn cleanup(&self) {
        self.meetings.write().await.cleanup();
        self.messages.write().await.cleanup();
        self.presence.write().await.cleanup();
    }

    /// Invalidate all caches
    pub async fn invalidate_all(&self) {
        self.meetings.write().await.invalidate_all();
        self.messages.write().await.invalidate_all();
        self.presence.write().await.invalidate_all();
    }
}

// Create a shared cache instance
pub type SharedCache = Arc<AppCache>;

pub fn create_shared_cache() -> SharedCache {
    Arc::new(AppCache::new())
}
