use chrono::{Datelike, NaiveDateTime};
use serde::{Deserialize, Serialize};
use tauri::State;

use crate::state::AppState;
use crate::supabase::MeetingRow;
use crate::{Error, Result};

/// Extract year and month from a datetime string (ISO 8601)
fn extract_year_month(date_str: &str) -> Option<(i32, u32)> {
    // Try to parse ISO 8601 datetime
    let dt = NaiveDateTime::parse_from_str(date_str, "%Y-%m-%dT%H:%M:%S%.fZ")
        .or_else(|_| NaiveDateTime::parse_from_str(date_str, "%Y-%m-%dT%H:%M:%S"))
        .or_else(|_| NaiveDateTime::parse_from_str(date_str, "%Y-%m-%d %H:%M:%S"))
        .ok()?;
    Some((dt.year(), dt.month()))
}

// ==========================================
// Response Types
// ==========================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Meeting {
    pub id: String,
    pub organizer_id: String,
    pub organizer_name: String,
    pub title: String,
    pub description: Option<String>,
    pub scheduled_at: String,
    pub duration_minutes: i32,
    pub status: String,
    pub session_id: Option<String>,
    pub recurrence_rule: Option<String>,
    pub google_event_id: Option<String>,
    pub attendees: Vec<MeetingAttendee>,
    pub created_at: Option<String>,
    pub updated_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MeetingAttendee {
    pub user_id: String,
    pub display_name: String,
    pub avatar_url: Option<String>,
    pub response_status: String,
    pub responded_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateMeetingParams {
    pub title: String,
    pub description: Option<String>,
    pub scheduled_at: String,
    pub duration_minutes: i32,
    pub attendee_ids: Vec<String>,
    pub recurrence_rule: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateMeetingParams {
    pub title: Option<String>,
    pub description: Option<String>,
    pub scheduled_at: Option<String>,
    pub duration_minutes: Option<i32>,
}

// ==========================================
// Helper Functions
// ==========================================

async fn meeting_row_to_meeting(
    row: MeetingRow,
    app_state: &AppState,
) -> Result<Meeting> {
    let supabase = app_state
        .supabase
        .as_ref()
        .ok_or_else(|| Error::Config("Supabase not configured".to_string()))?;

    // Get attendees
    let attendees_raw = supabase.get_meeting_attendees(&row.id).await?;
    let attendees: Vec<MeetingAttendee> = attendees_raw
        .into_iter()
        .map(|a| MeetingAttendee {
            user_id: a.user_id,
            display_name: a.display_name,
            avatar_url: a.avatar_url,
            response_status: a.response_status,
            responded_at: a.responded_at,
        })
        .collect();

    // Get organizer name
    let organizer_profiles = supabase.get_user_profiles(&[row.organizer_id.clone()]).await?;
    let organizer_name = organizer_profiles
        .first()
        .and_then(|p| p.display_name.clone())
        .unwrap_or_else(|| row.organizer_id.clone());

    Ok(Meeting {
        id: row.id,
        organizer_id: row.organizer_id,
        organizer_name,
        title: row.title,
        description: row.description,
        scheduled_at: row.scheduled_at,
        duration_minutes: row.duration_minutes,
        status: row.status,
        session_id: row.session_id,
        recurrence_rule: row.recurrence_rule,
        google_event_id: row.google_event_id,
        attendees,
        created_at: row.created_at,
        updated_at: row.updated_at,
    })
}

// ==========================================
// Commands
// ==========================================

/// Get meetings in a date range
#[tauri::command]
pub async fn get_meetings(
    start_date: String,
    end_date: String,
    app_state: State<'_, AppState>,
) -> Result<Vec<Meeting>> {
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

    // Check cache first if querying a single month
    if let (Some((start_year, start_month)), Some((end_year, end_month))) = (
        extract_year_month(&start_date),
        extract_year_month(&end_date),
    ) {
        // If same month, try cache
        if start_year == end_year && start_month == end_month {
            let cache = app_state.cache.meetings.read().await;
            if let Some(cached) = cache.get_month(start_year, start_month) {
                tracing::debug!("Cache hit for meetings {}-{:02}", start_year, start_month);
                return Ok(cached.clone());
            }
            drop(cache);
        }
    }

    // Cache miss - fetch from API
    let meeting_rows = supabase
        .get_meetings_in_range(&user_id, &start_date, &end_date)
        .await?;

    let mut meetings = Vec::new();
    for row in meeting_rows {
        let meeting = meeting_row_to_meeting(row, &app_state).await?;
        meetings.push(meeting);
    }

    // Cache the result if single month query
    if let (Some((start_year, start_month)), Some((end_year, end_month))) = (
        extract_year_month(&start_date),
        extract_year_month(&end_date),
    ) {
        if start_year == end_year && start_month == end_month {
            let mut cache = app_state.cache.meetings.write().await;
            cache.set_month(start_year, start_month, meetings.clone());
            tracing::debug!("Cached meetings for {}-{:02}", start_year, start_month);
        }
    }

    Ok(meetings)
}

/// Get a single meeting by ID
#[tauri::command]
pub async fn get_meeting(
    meeting_id: String,
    app_state: State<'_, AppState>,
) -> Result<Option<Meeting>> {
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

    // Check cache first
    {
        let cache = app_state.cache.meetings.read().await;
        if let Some(cached) = cache.get_by_id(&meeting_id) {
            tracing::debug!("Cache hit for meeting {}", meeting_id);
            return Ok(Some(cached.clone()));
        }
    }

    // Cache miss - fetch from API
    let row = supabase.get_meeting(&meeting_id).await?;

    match row {
        Some(r) => {
            let meeting = meeting_row_to_meeting(r, &app_state).await?;
            // Cache the meeting
            let mut cache = app_state.cache.meetings.write().await;
            cache.set_by_id(meeting.clone());
            tracing::debug!("Cached meeting {}", meeting_id);
            Ok(Some(meeting))
        }
        None => Ok(None),
    }
}

/// Get upcoming meetings
#[tauri::command]
pub async fn get_upcoming_meetings(
    limit: Option<u32>,
    app_state: State<'_, AppState>,
) -> Result<Vec<Meeting>> {
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

    // Check cache first
    {
        let cache = app_state.cache.meetings.read().await;
        if let Some(cached) = cache.get_upcoming() {
            tracing::debug!("Cache hit for upcoming meetings");
            // Apply limit if different from cached
            let limit = limit.unwrap_or(10) as usize;
            let result: Vec<Meeting> = cached.iter().take(limit).cloned().collect();
            return Ok(result);
        }
    }

    // Cache miss - fetch from API
    let limit = limit.unwrap_or(10);
    let meeting_rows = supabase.get_upcoming_meetings(&user_id, limit).await?;

    let mut meetings = Vec::new();
    for row in meeting_rows {
        let meeting = meeting_row_to_meeting(row, &app_state).await?;
        meetings.push(meeting);
    }

    // Cache the result
    {
        let mut cache = app_state.cache.meetings.write().await;
        cache.set_upcoming(meetings.clone());
        tracing::debug!("Cached upcoming meetings");
    }

    Ok(meetings)
}

/// Create a new meeting
#[tauri::command]
pub async fn create_meeting(
    params: CreateMeetingParams,
    app_state: State<'_, AppState>,
) -> Result<Meeting> {
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

    // Create the meeting
    let row = supabase
        .create_meeting(
            &user_id,
            &params.title,
            params.description.as_deref(),
            &params.scheduled_at,
            params.duration_minutes,
            params.recurrence_rule.as_deref(),
        )
        .await?;

    // Add attendees (organizer is auto-added by trigger)
    for attendee_id in &params.attendee_ids {
        if attendee_id != &user_id {
            supabase.add_meeting_attendee(&row.id, attendee_id).await?;
        }
    }

    let meeting = meeting_row_to_meeting(row, &app_state).await?;

    // Invalidate relevant caches
    {
        let mut cache = app_state.cache.meetings.write().await;
        // Invalidate the month where the meeting is scheduled
        if let Some((year, month)) = extract_year_month(&meeting.scheduled_at) {
            cache.invalidate_month(year, month);
        }
        // Cache the new meeting by ID and invalidate upcoming
        cache.set_by_id(meeting.clone());
        cache.set_upcoming(Vec::new()); // Force refresh on next request
        tracing::debug!("Cache invalidated after create_meeting");
    }

    Ok(meeting)
}

/// Update a meeting
#[tauri::command]
pub async fn update_meeting(
    meeting_id: String,
    params: UpdateMeetingParams,
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

    // Get old meeting to know which month to invalidate
    let old_meeting = supabase.get_meeting(&meeting_id).await?;

    supabase
        .update_meeting(
            &meeting_id,
            params.title.as_deref(),
            params.description.as_deref(),
            params.scheduled_at.as_deref(),
            params.duration_minutes,
            None,
        )
        .await?;

    // Invalidate caches
    {
        let mut cache = app_state.cache.meetings.write().await;
        cache.invalidate_meeting(&meeting_id);

        // Invalidate old month
        if let Some(old) = &old_meeting {
            if let Some((year, month)) = extract_year_month(&old.scheduled_at) {
                cache.invalidate_month(year, month);
            }
        }

        // Invalidate new month if date changed
        if let Some(ref new_scheduled_at) = params.scheduled_at {
            if let Some((year, month)) = extract_year_month(new_scheduled_at) {
                cache.invalidate_month(year, month);
            }
        }

        tracing::debug!("Cache invalidated after update_meeting");
    }

    Ok(())
}

/// Cancel a meeting
#[tauri::command]
pub async fn cancel_meeting(
    meeting_id: String,
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

    // Get meeting to know which month to invalidate
    let meeting = supabase.get_meeting(&meeting_id).await?;

    supabase
        .update_meeting(&meeting_id, None, None, None, None, Some("cancelled"))
        .await?;

    // Invalidate caches
    {
        let mut cache = app_state.cache.meetings.write().await;
        cache.invalidate_meeting(&meeting_id);

        if let Some(m) = meeting {
            if let Some((year, month)) = extract_year_month(&m.scheduled_at) {
                cache.invalidate_month(year, month);
            }
        }

        tracing::debug!("Cache invalidated after cancel_meeting");
    }

    Ok(())
}

/// Delete a meeting
#[tauri::command]
pub async fn delete_meeting(
    meeting_id: String,
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

    // Get meeting before deleting to know which month to invalidate
    let meeting = supabase.get_meeting(&meeting_id).await?;

    supabase.delete_meeting(&meeting_id).await?;

    // Invalidate caches
    {
        let mut cache = app_state.cache.meetings.write().await;
        cache.invalidate_meeting(&meeting_id);

        if let Some(m) = meeting {
            if let Some((year, month)) = extract_year_month(&m.scheduled_at) {
                cache.invalidate_month(year, month);
            }
        }

        tracing::debug!("Cache invalidated after delete_meeting");
    }

    Ok(())
}

/// Respond to a meeting invitation
#[tauri::command]
pub async fn respond_to_meeting(
    meeting_id: String,
    response: String,
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

    // Validate response
    if !["accepted", "declined", "tentative"].contains(&response.as_str()) {
        return Err(Error::Parse("Invalid response status".to_string()));
    }

    supabase
        .update_attendee_response(&meeting_id, &user_id, &response)
        .await?;

    Ok(())
}

/// Add an attendee to a meeting
#[tauri::command]
pub async fn add_meeting_attendee(
    meeting_id: String,
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

    supabase.add_meeting_attendee(&meeting_id, &user_id).await?;

    Ok(())
}

/// Remove an attendee from a meeting
#[tauri::command]
pub async fn remove_meeting_attendee(
    meeting_id: String,
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
        .remove_meeting_attendee(&meeting_id, &user_id)
        .await?;

    Ok(())
}

/// Start a meeting (create session and link)
#[tauri::command]
pub async fn start_meeting(
    meeting_id: String,
    app_state: State<'_, AppState>,
) -> Result<String> {
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

    // Generate join code
    let join_code: String = (0..6)
        .map(|_| {
            let idx = rand::random::<usize>() % 36;
            if idx < 10 {
                (b'0' + idx as u8) as char
            } else {
                (b'A' + (idx - 10) as u8) as char
            }
        })
        .collect();

    // Create session
    let session = supabase.create_session(&user_id, &join_code).await?;

    // Link meeting to session
    supabase
        .link_meeting_to_session(&meeting_id, &session.id)
        .await?;

    Ok(session.id)
}

// ==========================================
// Search & Filter Commands
// ==========================================

/// Filter parameters for meetings
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MeetingFilter {
    /// Filter by status (scheduled, ongoing, completed, cancelled)
    pub status: Option<String>,
    /// Filter by participant user ID
    pub participant_id: Option<String>,
    /// Filter by organizer user ID
    pub organizer_id: Option<String>,
    /// Filter by title (case-insensitive search)
    pub title_search: Option<String>,
    /// Only show meetings where I haven't responded yet
    pub pending_response: Option<bool>,
}

/// Filter meetings based on criteria
#[tauri::command]
pub async fn filter_meetings(
    start_date: String,
    end_date: String,
    filter: MeetingFilter,
    app_state: State<'_, AppState>,
) -> Result<Vec<Meeting>> {
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

    // Get all meetings in range first
    let meeting_rows = supabase
        .get_meetings_in_range(&user_id, &start_date, &end_date)
        .await?;

    let mut meetings = Vec::new();
    for row in meeting_rows {
        let meeting = meeting_row_to_meeting(row, &app_state).await?;
        meetings.push(meeting);
    }

    // Apply filters
    let results: Vec<Meeting> = meetings
        .into_iter()
        .filter(|m| {
            // Status filter
            if let Some(ref status) = filter.status {
                if &m.status != status {
                    return false;
                }
            }

            // Organizer filter
            if let Some(ref organizer_id) = filter.organizer_id {
                if &m.organizer_id != organizer_id {
                    return false;
                }
            }

            // Participant filter
            if let Some(ref participant_id) = filter.participant_id {
                if !m.attendees.iter().any(|a| &a.user_id == participant_id) {
                    return false;
                }
            }

            // Title search
            if let Some(ref search) = filter.title_search {
                if !m.title.to_lowercase().contains(&search.to_lowercase()) {
                    return false;
                }
            }

            // Pending response filter
            if filter.pending_response == Some(true) {
                let my_response = m.attendees.iter().find(|a| a.user_id == user_id);
                if let Some(attendee) = my_response {
                    if attendee.response_status != "invited" {
                        return false;
                    }
                } else {
                    return false;
                }
            }

            true
        })
        .collect();

    tracing::debug!("Filtered meetings: {} results", results.len());
    Ok(results)
}

/// Get meetings for a specific date (optimized for single day)
#[tauri::command]
pub async fn get_meetings_for_date(
    date: String, // YYYY-MM-DD format
    app_state: State<'_, AppState>,
) -> Result<Vec<Meeting>> {
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

    // Parse the date and create start/end of day
    let start_date = format!("{}T00:00:00Z", date);
    let end_date = format!("{}T23:59:59Z", date);

    // Try to get from month cache first
    if let Some((year, month)) = extract_year_month(&start_date) {
        let cache = app_state.cache.meetings.read().await;
        if let Some(cached) = cache.get_month(year, month) {
            // Filter cached meetings for this specific date
            let date_prefix = format!("{}T", date);
            let results: Vec<Meeting> = cached
                .iter()
                .filter(|m| m.scheduled_at.starts_with(&date_prefix) && m.status != "cancelled")
                .cloned()
                .collect();
            tracing::debug!("Cache hit for date {} - {} meetings", date, results.len());
            return Ok(results);
        }
        drop(cache);
    }

    // Cache miss - fetch from API
    let meeting_rows = supabase
        .get_meetings_in_range(&user_id, &start_date, &end_date)
        .await?;

    let mut meetings = Vec::new();
    for row in meeting_rows {
        let meeting = meeting_row_to_meeting(row, &app_state).await?;
        if meeting.status != "cancelled" {
            meetings.push(meeting);
        }
    }

    tracing::debug!("Fetched {} meetings for date {}", meetings.len(), date);
    Ok(meetings)
}

/// Search meetings by title
#[tauri::command]
pub async fn search_meetings(
    query: String,
    limit: Option<u32>,
    app_state: State<'_, AppState>,
) -> Result<Vec<Meeting>> {
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

    let limit = limit.unwrap_or(20);
    let query_lower = query.to_lowercase();

    // Search in upcoming meetings (next 6 months)
    use chrono::{Duration, Utc};
    let now = Utc::now();
    let start_date = now.format("%Y-%m-%dT%H:%M:%SZ").to_string();
    let end_date = (now + Duration::days(180))
        .format("%Y-%m-%dT%H:%M:%SZ")
        .to_string();

    let meeting_rows = supabase
        .get_meetings_in_range(&user_id, &start_date, &end_date)
        .await?;

    let mut results = Vec::new();
    for row in meeting_rows {
        if row.title.to_lowercase().contains(&query_lower)
            || row
                .description
                .as_ref()
                .map(|d| d.to_lowercase().contains(&query_lower))
                .unwrap_or(false)
        {
            let meeting = meeting_row_to_meeting(row, &app_state).await?;
            results.push(meeting);

            if results.len() >= limit as usize {
                break;
            }
        }
    }

    tracing::debug!("Found {} meetings matching '{}'", results.len(), query);
    Ok(results)
}

/// Get meeting by session ID
#[tauri::command]
pub async fn get_meeting_by_session(
    session_id: String,
    app_state: State<'_, AppState>,
) -> Result<Option<Meeting>> {
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

    // Query meetings with this session_id
    let token = supabase
        .get_access_token()
        .await
        .ok_or_else(|| Error::Auth("Not authenticated".to_string()))?;

    let url = format!(
        "{}/rest/v1/meetings?session_id=eq.{}&limit=1",
        std::env::var("VITE_SUPABASE_URL")
            .or_else(|_| std::env::var("NEXT_PUBLIC_SUPABASE_URL"))
            .map_err(|_| Error::Config("SUPABASE_URL not set".to_string()))?,
        session_id
    );

    let client = reqwest::Client::new();
    let response = client
        .get(&url)
        .header(
            "apikey",
            std::env::var("VITE_SUPABASE_ANON_KEY")
                .or_else(|_| std::env::var("NEXT_PUBLIC_SUPABASE_ANON_KEY"))
                .map_err(|_| Error::Config("SUPABASE_ANON_KEY not set".to_string()))?,
        )
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

    match meetings.into_iter().next() {
        Some(row) => Ok(Some(meeting_row_to_meeting(row, &app_state).await?)),
        None => Ok(None),
    }
}
