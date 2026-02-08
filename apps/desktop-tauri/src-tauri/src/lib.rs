use tauri::Manager;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

mod cache;
mod capture;
mod chat_realtime;
mod commands;
mod error;
mod input;
mod realtime;
mod secure_storage;
mod state;
mod supabase;
mod utils;

pub use error::{Error, Result};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Initialize tracing
    tracing_subscriber::registry()
        .with(tracing_subscriber::fmt::layer())
        .with(tracing_subscriber::EnvFilter::from_default_env())
        .init();

    tracing::info!("Starting PairUX Desktop...");

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(state::AppState::default())
        .manage(commands::signaling::SignalingState::default())
        .manage(commands::chat::ChatState::default())
        .setup(|app| {
            #[cfg(debug_assertions)]
            {
                let window = app.get_webview_window("main").unwrap();
                window.open_devtools();
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // Capture commands
            commands::capture::get_sources,
            commands::capture::start_capture,
            commands::capture::stop_capture,
            // Input commands
            commands::input::inject_mouse_event,
            commands::input::inject_keyboard_event,
            commands::input::set_input_enabled,
            // Auth commands
            commands::auth::login,
            commands::auth::signup,
            commands::auth::logout,
            commands::auth::get_current_user,
            commands::auth::refresh_token,
            commands::auth::is_authenticated,
            commands::auth::validate_token,
            // Session commands
            commands::session::create_session,
            commands::session::join_session,
            commands::session::end_session,
            commands::session::get_session_status,
            // Signaling commands
            commands::signaling::connect_signaling,
            commands::signaling::disconnect_signaling,
            commands::signaling::send_offer,
            commands::signaling::send_answer,
            commands::signaling::send_ice_candidate,
            commands::signaling::request_control,
            commands::signaling::grant_control,
            commands::signaling::revoke_control,
            commands::signaling::get_signaling_status,
            commands::signaling::send_chat_message,
            // Chat commands
            commands::chat::get_conversations,
            commands::chat::get_conversation,
            commands::chat::create_direct_conversation,
            commands::chat::create_group_conversation,
            commands::chat::update_group,
            commands::chat::add_group_member,
            commands::chat::remove_group_member,
            commands::chat::leave_group,
            commands::chat::get_messages,
            commands::chat::chat_send_message,
            commands::chat::mark_as_read,
            commands::chat::update_presence,
            commands::chat::get_team_members,
            commands::chat::connect_chat,
            commands::chat::disconnect_chat,
            commands::chat::get_chat_status,
            // Calendar commands
            commands::calendar::get_meetings,
            commands::calendar::get_meeting,
            commands::calendar::get_upcoming_meetings,
            commands::calendar::create_meeting,
            commands::calendar::update_meeting,
            commands::calendar::cancel_meeting,
            commands::calendar::delete_meeting,
            commands::calendar::respond_to_meeting,
            commands::calendar::add_meeting_attendee,
            commands::calendar::remove_meeting_attendee,
            commands::calendar::start_meeting,
            commands::calendar::get_meeting_by_session,
            // Google Calendar commands
            commands::google_calendar::start_google_auth,
            commands::google_calendar::complete_google_auth,
            commands::google_calendar::disconnect_google,
            commands::google_calendar::get_google_status,
            commands::google_calendar::sync_meeting_to_google,
            commands::google_calendar::import_from_google,
            commands::google_calendar::toggle_google_sync,
            // Utility commands - DateTime
            commands::utils::format_datetime,
            commands::utils::format_time_range,
            commands::utils::format_meeting_time,
            commands::utils::calculate_end_time,
            commands::utils::is_past,
            commands::utils::is_today,
            commands::utils::get_day_bounds,
            commands::utils::get_month_bounds,
            // Utility commands - RRULE
            commands::utils::build_rrule,
            commands::utils::parse_rrule,
            commands::utils::validate_rrule,
            commands::utils::expand_rrule,
            commands::utils::describe_rrule,
            commands::utils::get_next_occurrence,
            // Utility commands - Calendar Grid
            commands::utils::generate_calendar_grid,
            commands::utils::generate_month_days,
            commands::utils::get_weekday_headers,
            commands::utils::previous_month,
            commands::utils::next_month,
            commands::utils::current_month,
            commands::utils::is_in_month,
            commands::utils::get_week_number,
            // Cache commands
            commands::cache::get_cache_stats,
            commands::cache::invalidate_all_caches,
            commands::cache::cleanup_caches,
            commands::cache::invalidate_meeting_month,
            commands::cache::invalidate_conversation_messages,
            commands::cache::invalidate_presence_cache,
            // Validation commands
            commands::validation::validate_email,
            commands::validation::validate_password,
            commands::validation::validate_meeting_title,
            commands::validation::validate_username,
            commands::validation::validate_url,
            commands::validation::validate_session_code,
            // Search & Filter commands - Chat
            commands::chat::search_conversations,
            commands::chat::search_messages,
            commands::chat::search_team_members,
            // Search & Filter commands - Calendar
            commands::calendar::filter_meetings,
            commands::calendar::get_meetings_for_date,
            commands::calendar::search_meetings,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
