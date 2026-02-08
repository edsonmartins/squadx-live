use serde::{Deserialize, Serialize};
use tauri::State;

use crate::state::AppState;
use crate::{Error, Result};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GoogleCalendarStatus {
    pub connected: bool,
    pub email: Option<String>,
    pub sync_enabled: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GoogleEvent {
    pub id: String,
    pub summary: String,
    pub description: Option<String>,
    pub start: GoogleEventDateTime,
    pub end: GoogleEventDateTime,
    pub attendees: Option<Vec<GoogleEventAttendee>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GoogleEventDateTime {
    #[serde(rename = "dateTime")]
    pub date_time: Option<String>,
    pub date: Option<String>,
    #[serde(rename = "timeZone")]
    pub time_zone: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GoogleEventAttendee {
    pub email: String,
    #[serde(rename = "displayName")]
    pub display_name: Option<String>,
    #[serde(rename = "responseStatus")]
    pub response_status: Option<String>,
}

// Helper to get current user ID
async fn get_current_user_id(app_state: &AppState) -> Result<String> {
    let inner = app_state.inner.read().await;
    let user = inner
        .user
        .as_ref()
        .ok_or_else(|| Error::Auth("Not authenticated".to_string()))?;
    Ok(user.id.clone())
}

// Helper to get supabase client
fn get_supabase(app_state: &AppState) -> Result<&crate::supabase::SupabaseClient> {
    app_state
        .supabase
        .as_ref()
        .ok_or_else(|| Error::Config("Supabase not configured".to_string()))
}

/// Get OAuth URL to start Google Calendar authorization
#[tauri::command]
pub async fn start_google_auth(
    app_state: State<'_, AppState>,
) -> Result<String> {
    let user_id = get_current_user_id(&app_state).await?;

    // Google OAuth URL
    let client_id = std::env::var("GOOGLE_CLIENT_ID")
        .map_err(|_| Error::Config("GOOGLE_CLIENT_ID not configured".to_string()))?;

    let redirect_uri = "http://localhost:3000/auth/google/callback";
    let scope = "https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/userinfo.email";

    let auth_url = format!(
        "https://accounts.google.com/o/oauth2/v2/auth?client_id={}&redirect_uri={}&response_type=code&scope={}&access_type=offline&prompt=consent&state={}",
        urlencoding::encode(&client_id),
        urlencoding::encode(redirect_uri),
        urlencoding::encode(scope),
        user_id
    );

    Ok(auth_url)
}

/// Complete OAuth flow with authorization code
#[tauri::command]
pub async fn complete_google_auth(
    code: String,
    app_state: State<'_, AppState>,
) -> Result<()> {
    let user_id = get_current_user_id(&app_state).await?;
    let supabase = get_supabase(&app_state)?;

    let client_id = std::env::var("GOOGLE_CLIENT_ID")
        .map_err(|_| Error::Config("GOOGLE_CLIENT_ID not configured".to_string()))?;
    let client_secret = std::env::var("GOOGLE_CLIENT_SECRET")
        .map_err(|_| Error::Config("GOOGLE_CLIENT_SECRET not configured".to_string()))?;

    let redirect_uri = "http://localhost:3000/auth/google/callback";

    // Exchange code for tokens
    let client = reqwest::Client::new();
    let token_response = client
        .post("https://oauth2.googleapis.com/token")
        .form(&[
            ("code", code.as_str()),
            ("client_id", client_id.as_str()),
            ("client_secret", client_secret.as_str()),
            ("redirect_uri", redirect_uri),
            ("grant_type", "authorization_code"),
        ])
        .send()
        .await
        .map_err(|e| Error::Network(format!("Failed to exchange code: {}", e)))?;

    if !token_response.status().is_success() {
        let error_text = token_response.text().await.unwrap_or_default();
        return Err(Error::External(format!("Google OAuth error: {}", error_text)));
    }

    #[derive(Deserialize)]
    struct TokenResponse {
        access_token: String,
        refresh_token: Option<String>,
        expires_in: i64,
    }

    let tokens: TokenResponse = token_response.json().await
        .map_err(|e| Error::Parse(format!("Failed to parse token response: {}", e)))?;

    let refresh_token = tokens.refresh_token
        .ok_or_else(|| Error::External("No refresh token received - try revoking access and re-authorizing".to_string()))?;

    // Get user email from Google
    let email = get_google_email(&tokens.access_token).await.ok();

    // Calculate expiration time
    let expires_at = chrono::Utc::now() + chrono::Duration::seconds(tokens.expires_in);

    // Save tokens to database
    supabase.save_google_tokens(
        &user_id,
        &tokens.access_token,
        &refresh_token,
        &expires_at.to_rfc3339(),
        email.as_deref(),
    ).await?;

    Ok(())
}

/// Disconnect Google Calendar
#[tauri::command]
pub async fn disconnect_google(
    app_state: State<'_, AppState>,
) -> Result<()> {
    let user_id = get_current_user_id(&app_state).await?;
    let supabase = get_supabase(&app_state)?;

    // Revoke tokens with Google
    if let Ok(Some(tokens)) = supabase.get_google_tokens(&user_id).await {
        let client = reqwest::Client::new();
        let _ = client
            .post("https://oauth2.googleapis.com/revoke")
            .form(&[("token", tokens.access_token.as_str())])
            .send()
            .await;
    }

    // Delete from database
    supabase.delete_google_tokens(&user_id).await?;

    Ok(())
}

/// Get Google Calendar connection status
#[tauri::command]
pub async fn get_google_status(
    app_state: State<'_, AppState>,
) -> Result<GoogleCalendarStatus> {
    let user_id = get_current_user_id(&app_state).await?;
    let supabase = get_supabase(&app_state)?;

    match supabase.get_google_tokens(&user_id).await {
        Ok(Some(tokens)) => {
            Ok(GoogleCalendarStatus {
                connected: true,
                email: tokens.email,
                sync_enabled: tokens.sync_enabled.unwrap_or(true),
            })
        }
        _ => Ok(GoogleCalendarStatus {
            connected: false,
            email: None,
            sync_enabled: false,
        }),
    }
}

/// Sync a meeting to Google Calendar
#[tauri::command]
pub async fn sync_meeting_to_google(
    meeting_id: String,
    app_state: State<'_, AppState>,
) -> Result<String> {
    let user_id = get_current_user_id(&app_state).await?;
    let supabase = get_supabase(&app_state)?;

    // Get tokens
    let tokens = supabase.get_google_tokens(&user_id).await?
        .ok_or_else(|| Error::External("Google Calendar not connected".to_string()))?;

    // Refresh token if expired
    let access_token = refresh_token_if_needed(supabase, &user_id, &tokens).await?;

    // Get meeting details
    let meeting = supabase.get_meeting(&meeting_id).await?
        .ok_or_else(|| Error::NotFound("Meeting not found".to_string()))?;

    let attendees = supabase.get_meeting_attendees(&meeting_id).await?;

    // Build Google event
    let scheduled_at = chrono::DateTime::parse_from_rfc3339(&meeting.scheduled_at)
        .map_err(|e| Error::Parse(format!("Invalid date: {}", e)))?;

    let end_time = scheduled_at + chrono::Duration::minutes(meeting.duration_minutes as i64);

    // Build event body - attendees will be notified through SquadX Live system
    // Note: Google Calendar attendees require email, which we don't always have
    let event_body = serde_json::json!({
        "summary": meeting.title,
        "description": format!(
            "{}\n\nParticipantes: {}",
            meeting.description.clone().unwrap_or_default(),
            attendees.iter().map(|a| a.display_name.clone()).collect::<Vec<_>>().join(", ")
        ),
        "start": {
            "dateTime": scheduled_at.to_rfc3339(),
            "timeZone": "America/Sao_Paulo"
        },
        "end": {
            "dateTime": end_time.to_rfc3339(),
            "timeZone": "America/Sao_Paulo"
        }
    });

    let client = reqwest::Client::new();

    // Check if event already exists
    let google_event_id = if let Some(existing_id) = meeting.google_event_id {
        // Update existing event
        let response = client
            .put(format!("https://www.googleapis.com/calendar/v3/calendars/primary/events/{}", existing_id))
            .bearer_auth(&access_token)
            .json(&event_body)
            .send()
            .await
            .map_err(|e| Error::Network(format!("Failed to update event: {}", e)))?;

        if !response.status().is_success() {
            let error = response.text().await.unwrap_or_default();
            return Err(Error::External(format!("Google Calendar error: {}", error)));
        }

        existing_id
    } else {
        // Create new event
        let response = client
            .post("https://www.googleapis.com/calendar/v3/calendars/primary/events")
            .bearer_auth(&access_token)
            .json(&event_body)
            .send()
            .await
            .map_err(|e| Error::Network(format!("Failed to create event: {}", e)))?;

        if !response.status().is_success() {
            let error = response.text().await.unwrap_or_default();
            return Err(Error::External(format!("Google Calendar error: {}", error)));
        }

        #[derive(Deserialize)]
        struct EventResponse {
            id: String,
        }

        let event: EventResponse = response.json().await
            .map_err(|e| Error::Parse(format!("Failed to parse response: {}", e)))?;

        // Save google_event_id to meeting
        supabase.update_meeting_google_id(&meeting_id, &event.id, "primary").await?;

        event.id
    };

    Ok(google_event_id)
}

/// Import events from Google Calendar
#[tauri::command]
pub async fn import_from_google(
    start_date: String,
    end_date: String,
    app_state: State<'_, AppState>,
) -> Result<Vec<GoogleEvent>> {
    let user_id = get_current_user_id(&app_state).await?;
    let supabase = get_supabase(&app_state)?;

    // Get tokens
    let tokens = supabase.get_google_tokens(&user_id).await?
        .ok_or_else(|| Error::External("Google Calendar not connected".to_string()))?;

    // Refresh token if needed
    let access_token = refresh_token_if_needed(supabase, &user_id, &tokens).await?;

    // Fetch events from Google Calendar
    let client = reqwest::Client::new();
    let response = client
        .get("https://www.googleapis.com/calendar/v3/calendars/primary/events")
        .bearer_auth(&access_token)
        .query(&[
            ("timeMin", start_date.as_str()),
            ("timeMax", end_date.as_str()),
            ("singleEvents", "true"),
            ("orderBy", "startTime"),
        ])
        .send()
        .await
        .map_err(|e| Error::Network(format!("Failed to fetch events: {}", e)))?;

    if !response.status().is_success() {
        let error = response.text().await.unwrap_or_default();
        return Err(Error::External(format!("Google Calendar error: {}", error)));
    }

    #[derive(Deserialize)]
    struct EventsResponse {
        items: Option<Vec<GoogleEvent>>,
    }

    let events: EventsResponse = response.json().await
        .map_err(|e| Error::Parse(format!("Failed to parse events: {}", e)))?;

    Ok(events.items.unwrap_or_default())
}

/// Toggle sync with Google Calendar
#[tauri::command]
pub async fn toggle_google_sync(
    enabled: bool,
    app_state: State<'_, AppState>,
) -> Result<()> {
    let user_id = get_current_user_id(&app_state).await?;
    let supabase = get_supabase(&app_state)?;

    // Update sync_enabled in database
    supabase.update_google_sync_enabled(&user_id, enabled).await?;

    Ok(())
}

// Helper function to get user email from Google
async fn get_google_email(access_token: &str) -> Result<String> {
    let client = reqwest::Client::new();
    let response = client
        .get("https://www.googleapis.com/oauth2/v2/userinfo")
        .bearer_auth(access_token)
        .send()
        .await
        .map_err(|e| Error::Network(format!("Failed to get user info: {}", e)))?;

    #[derive(Deserialize)]
    struct UserInfo {
        email: String,
    }

    let user_info: UserInfo = response.json().await
        .map_err(|e| Error::Parse(format!("Failed to parse user info: {}", e)))?;

    Ok(user_info.email)
}

// Helper function to refresh token if expired
async fn refresh_token_if_needed(
    supabase: &crate::supabase::SupabaseClient,
    user_id: &str,
    tokens: &crate::supabase::GoogleTokensRow,
) -> Result<String> {
    let expires_at = chrono::DateTime::parse_from_rfc3339(&tokens.expires_at)
        .map_err(|e| Error::Parse(format!("Invalid expiration: {}", e)))?;

    // If token expires in less than 5 minutes, refresh it
    if expires_at < chrono::Utc::now() + chrono::Duration::minutes(5) {
        let client_id = std::env::var("GOOGLE_CLIENT_ID")
            .map_err(|_| Error::Config("GOOGLE_CLIENT_ID not configured".to_string()))?;
        let client_secret = std::env::var("GOOGLE_CLIENT_SECRET")
            .map_err(|_| Error::Config("GOOGLE_CLIENT_SECRET not configured".to_string()))?;

        let client = reqwest::Client::new();
        let response = client
            .post("https://oauth2.googleapis.com/token")
            .form(&[
                ("refresh_token", tokens.refresh_token.as_str()),
                ("client_id", client_id.as_str()),
                ("client_secret", client_secret.as_str()),
                ("grant_type", "refresh_token"),
            ])
            .send()
            .await
            .map_err(|e| Error::Network(format!("Failed to refresh token: {}", e)))?;

        if !response.status().is_success() {
            return Err(Error::External("Failed to refresh Google token - please reconnect".to_string()));
        }

        #[derive(Deserialize)]
        struct RefreshResponse {
            access_token: String,
            expires_in: i64,
        }

        let refresh: RefreshResponse = response.json().await
            .map_err(|e| Error::Parse(format!("Failed to parse refresh response: {}", e)))?;

        let new_expires_at = chrono::Utc::now() + chrono::Duration::seconds(refresh.expires_in);

        // Update tokens in database
        supabase.save_google_tokens(
            user_id,
            &refresh.access_token,
            &tokens.refresh_token,
            &new_expires_at.to_rfc3339(),
            tokens.email.as_deref(),
        ).await?;

        Ok(refresh.access_token)
    } else {
        Ok(tokens.access_token.clone())
    }
}
