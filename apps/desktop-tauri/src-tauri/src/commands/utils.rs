//! Utility commands for date/time, RRULE, and calendar operations
//!
//! These commands expose Rust utility functions to the frontend,
//! providing better performance and consistency for common operations.

use crate::utils::{
    calendar_grid::{
        self, CalendarDay, CalendarGrid, WeekdayHeader,
    },
    datetime::{self, DateTimeFormat, FormattedDateTime},
    rrule::{self, ParsedRRule, RecurrenceOccurrence, RecurrenceRule},
};
use crate::Result;

// ==========================================
// DateTime Commands
// ==========================================

/// Format a datetime string according to the specified format
#[tauri::command]
pub fn format_datetime(datetime: String, format: DateTimeFormat) -> Result<FormattedDateTime> {
    datetime::format_datetime(&datetime, format)
}

/// Format a time range (start - end)
#[tauri::command]
pub fn format_time_range(start: String, end: String) -> Result<String> {
    datetime::format_time_range(&start, &end)
}

/// Format a meeting time with duration
#[tauri::command]
pub fn format_meeting_time(start: String, duration_minutes: i32) -> Result<String> {
    datetime::format_meeting_time(&start, duration_minutes)
}

/// Calculate end time from start and duration
#[tauri::command]
pub fn calculate_end_time(start: String, duration_minutes: i32) -> Result<String> {
    datetime::calculate_end_time(&start, duration_minutes)
}

/// Check if a datetime is in the past
#[tauri::command]
pub fn is_past(datetime: String) -> Result<bool> {
    datetime::is_past(&datetime)
}

/// Check if a datetime is today
#[tauri::command]
pub fn is_today(datetime: String) -> Result<bool> {
    datetime::is_today(&datetime)
}

/// Get the start and end of a day in ISO format
#[tauri::command]
pub fn get_day_bounds(date: String) -> Result<(String, String)> {
    datetime::get_day_bounds(&date)
}

/// Get the start and end of a month in ISO format
#[tauri::command]
pub fn get_month_bounds(year: i32, month: u32) -> Result<(String, String)> {
    datetime::get_month_bounds(year, month)
}

// ==========================================
// RRULE Commands
// ==========================================

/// Build an RRULE string from a RecurrenceRule
#[tauri::command]
pub fn build_rrule(rule: RecurrenceRule) -> String {
    rrule::build_rrule(&rule)
}

/// Parse an RRULE string into a RecurrenceRule
#[tauri::command]
pub fn parse_rrule(rrule_str: String) -> Result<ParsedRRule> {
    rrule::parse_rrule(&rrule_str)
}

/// Validate an RRULE string
#[tauri::command]
pub fn validate_rrule(rrule_str: String) -> Result<bool> {
    rrule::validate_rrule(&rrule_str)
}

/// Expand a recurring event to get all occurrences within a date range
#[tauri::command]
pub fn expand_rrule(
    rrule_str: String,
    start_date: String,
    range_start: String,
    range_end: String,
    max_occurrences: Option<u32>,
) -> Result<Vec<RecurrenceOccurrence>> {
    rrule::expand_rrule(&rrule_str, &start_date, &range_start, &range_end, max_occurrences)
}

/// Get a human-readable description of a recurrence rule
#[tauri::command]
pub fn describe_rrule(rule: RecurrenceRule) -> String {
    rrule::describe_rrule(&rule)
}

/// Get the next occurrence of a recurring event after a given date
#[tauri::command]
pub fn get_next_occurrence(
    rrule_str: String,
    start_date: String,
    after: String,
) -> Result<Option<String>> {
    rrule::get_next_occurrence(&rrule_str, &start_date, &after)
}

// ==========================================
// Calendar Grid Commands
// ==========================================

/// Generate a calendar grid for a specific month
#[tauri::command]
pub fn generate_calendar_grid(year: i32, month: u32) -> Result<CalendarGrid> {
    calendar_grid::generate_calendar_grid(year, month)
}

/// Generate a minimal calendar grid (only current month days)
#[tauri::command]
pub fn generate_month_days(year: i32, month: u32) -> Result<Vec<CalendarDay>> {
    calendar_grid::generate_month_days(year, month)
}

/// Get weekday headers for calendar display
#[tauri::command]
pub fn get_weekday_headers(start_on_sunday: bool) -> Vec<WeekdayHeader> {
    calendar_grid::get_weekday_headers(start_on_sunday)
}

/// Navigate to previous month
#[tauri::command]
pub fn previous_month(year: i32, month: u32) -> (i32, u32) {
    calendar_grid::previous_month(year, month)
}

/// Navigate to next month
#[tauri::command]
pub fn next_month(year: i32, month: u32) -> (i32, u32) {
    calendar_grid::next_month(year, month)
}

/// Get current year and month
#[tauri::command]
pub fn current_month() -> (i32, u32) {
    calendar_grid::current_month()
}

/// Check if a date string falls within a specific month
#[tauri::command]
pub fn is_in_month(date: String, year: i32, month: u32) -> bool {
    calendar_grid::is_in_month(&date, year, month)
}

/// Get the week number for a date
#[tauri::command]
pub fn get_week_number(date: String) -> Result<u32> {
    calendar_grid::get_week_number(&date)
}
