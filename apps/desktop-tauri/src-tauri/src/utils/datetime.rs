//! Date and time utilities using chrono
//!
//! Provides consistent date/time formatting and manipulation functions
//! that can be called from the frontend via Tauri commands.

use chrono::{DateTime, Datelike, Duration, Local, NaiveDate, TimeZone, Utc};
use serde::{Deserialize, Serialize};

use crate::{Error, Result};

/// Supported date/time format types
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum DateTimeFormat {
    /// Time only: "14:30"
    Time,
    /// Time with seconds: "14:30:45"
    TimeWithSeconds,
    /// Short date: "07/02/2026"
    ShortDate,
    /// Long date: "7 de fevereiro de 2026"
    LongDate,
    /// Full date with weekday: "sexta-feira, 7 de fevereiro de 2026"
    FullDate,
    /// Date and time: "07/02/2026 14:30"
    DateTime,
    /// Relative: "Hoje", "Amanhã", "há 5 minutos"
    Relative,
    /// ISO 8601: "2026-02-07T14:30:00Z"
    Iso8601,
}

/// Formatted date/time result
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FormattedDateTime {
    pub formatted: String,
    pub timestamp: i64,
    pub is_today: bool,
    pub is_tomorrow: bool,
    pub is_past: bool,
}

/// Format a datetime string according to the specified format
pub fn format_datetime(datetime_str: &str, format: DateTimeFormat) -> Result<FormattedDateTime> {
    let dt = parse_datetime(datetime_str)?;
    let local_dt = dt.with_timezone(&Local);
    let now = Local::now();
    let today = now.date_naive();
    let tomorrow = today + Duration::days(1);
    let dt_date = local_dt.date_naive();

    let formatted = match format {
        DateTimeFormat::Time => local_dt.format("%H:%M").to_string(),
        DateTimeFormat::TimeWithSeconds => local_dt.format("%H:%M:%S").to_string(),
        DateTimeFormat::ShortDate => local_dt.format("%d/%m/%Y").to_string(),
        DateTimeFormat::LongDate => format_long_date(&local_dt),
        DateTimeFormat::FullDate => format_full_date(&local_dt),
        DateTimeFormat::DateTime => local_dt.format("%d/%m/%Y %H:%M").to_string(),
        DateTimeFormat::Relative => format_relative(&local_dt, &now),
        DateTimeFormat::Iso8601 => dt.format("%Y-%m-%dT%H:%M:%SZ").to_string(),
    };

    Ok(FormattedDateTime {
        formatted,
        timestamp: dt.timestamp(),
        is_today: dt_date == today,
        is_tomorrow: dt_date == tomorrow,
        is_past: local_dt < now,
    })
}

/// Format a time range (e.g., "14:30 - 15:30")
pub fn format_time_range(start_str: &str, end_str: &str) -> Result<String> {
    let start = parse_datetime(start_str)?;
    let end = parse_datetime(end_str)?;

    let start_local = start.with_timezone(&Local);
    let end_local = end.with_timezone(&Local);

    Ok(format!(
        "{} - {}",
        start_local.format("%H:%M"),
        end_local.format("%H:%M")
    ))
}

/// Format a meeting time with duration
pub fn format_meeting_time(start_str: &str, duration_minutes: i32) -> Result<String> {
    let start = parse_datetime(start_str)?;
    let end = start + Duration::minutes(duration_minutes as i64);

    let start_local = start.with_timezone(&Local);
    let end_local = end.with_timezone(&Local);

    Ok(format!(
        "{} - {} ({} min)",
        start_local.format("%H:%M"),
        end_local.format("%H:%M"),
        duration_minutes
    ))
}

/// Calculate end time from start and duration
pub fn calculate_end_time(start_str: &str, duration_minutes: i32) -> Result<String> {
    let start = parse_datetime(start_str)?;
    let end = start + Duration::minutes(duration_minutes as i64);
    Ok(end.format("%Y-%m-%dT%H:%M:%SZ").to_string())
}

/// Check if a datetime is in the past
pub fn is_past(datetime_str: &str) -> Result<bool> {
    let dt = parse_datetime(datetime_str)?;
    Ok(dt < Utc::now())
}

/// Check if a datetime is today
pub fn is_today(datetime_str: &str) -> Result<bool> {
    let dt = parse_datetime(datetime_str)?;
    let local_dt = dt.with_timezone(&Local);
    let today = Local::now().date_naive();
    Ok(local_dt.date_naive() == today)
}

/// Get the start and end of a day in ISO format
pub fn get_day_bounds(date_str: &str) -> Result<(String, String)> {
    let date = NaiveDate::parse_from_str(date_str, "%Y-%m-%d")
        .map_err(|e| Error::Parse(format!("Invalid date format: {}", e)))?;

    let start = Local
        .from_local_datetime(&date.and_hms_opt(0, 0, 0).unwrap())
        .single()
        .ok_or_else(|| Error::Parse("Invalid local datetime".to_string()))?;

    let end = Local
        .from_local_datetime(&date.and_hms_opt(23, 59, 59).unwrap())
        .single()
        .ok_or_else(|| Error::Parse("Invalid local datetime".to_string()))?;

    Ok((
        start.with_timezone(&Utc).format("%Y-%m-%dT%H:%M:%SZ").to_string(),
        end.with_timezone(&Utc).format("%Y-%m-%dT%H:%M:%SZ").to_string(),
    ))
}

/// Get the start and end of a month in ISO format
pub fn get_month_bounds(year: i32, month: u32) -> Result<(String, String)> {
    let first_day = NaiveDate::from_ymd_opt(year, month, 1)
        .ok_or_else(|| Error::Parse("Invalid year/month".to_string()))?;

    let last_day = if month == 12 {
        NaiveDate::from_ymd_opt(year + 1, 1, 1)
    } else {
        NaiveDate::from_ymd_opt(year, month + 1, 1)
    }
    .ok_or_else(|| Error::Parse("Invalid date calculation".to_string()))?
        - Duration::days(1);

    let start = Local
        .from_local_datetime(&first_day.and_hms_opt(0, 0, 0).unwrap())
        .single()
        .ok_or_else(|| Error::Parse("Invalid local datetime".to_string()))?;

    let end = Local
        .from_local_datetime(&last_day.and_hms_opt(23, 59, 59).unwrap())
        .single()
        .ok_or_else(|| Error::Parse("Invalid local datetime".to_string()))?;

    Ok((
        start.with_timezone(&Utc).format("%Y-%m-%dT%H:%M:%SZ").to_string(),
        end.with_timezone(&Utc).format("%Y-%m-%dT%H:%M:%SZ").to_string(),
    ))
}

// ==========================================
// Helper Functions
// ==========================================

fn parse_datetime(s: &str) -> Result<DateTime<Utc>> {
    // Try ISO 8601 with Z suffix
    if let Ok(dt) = DateTime::parse_from_rfc3339(s) {
        return Ok(dt.with_timezone(&Utc));
    }

    // Try without timezone (assume UTC)
    if let Ok(dt) = chrono::NaiveDateTime::parse_from_str(s, "%Y-%m-%dT%H:%M:%S") {
        return Ok(Utc.from_utc_datetime(&dt));
    }

    // Try date only
    if let Ok(date) = NaiveDate::parse_from_str(s, "%Y-%m-%d") {
        let dt = date.and_hms_opt(0, 0, 0).unwrap();
        return Ok(Utc.from_utc_datetime(&dt));
    }

    Err(Error::Parse(format!(
        "Unable to parse datetime: {}",
        s
    )))
}

fn format_long_date(dt: &DateTime<Local>) -> String {
    let day = dt.day();
    let month = month_name_pt(dt.month());
    let year = dt.year();
    format!("{} de {} de {}", day, month, year)
}

fn format_full_date(dt: &DateTime<Local>) -> String {
    let weekday = weekday_name_pt(dt.weekday().num_days_from_sunday());
    let day = dt.day();
    let month = month_name_pt(dt.month());
    let year = dt.year();
    format!("{}, {} de {} de {}", weekday, day, month, year)
}

fn format_relative(dt: &DateTime<Local>, now: &DateTime<Local>) -> String {
    let today = now.date_naive();
    let tomorrow = today + Duration::days(1);
    let yesterday = today - Duration::days(1);
    let dt_date = dt.date_naive();

    if dt_date == today {
        let diff = *now - *dt;
        if diff.num_seconds() < 0 {
            // Future today
            format!("Hoje às {}", dt.format("%H:%M"))
        } else if diff.num_minutes() < 1 {
            "Agora".to_string()
        } else if diff.num_minutes() < 60 {
            format!("há {} minutos", diff.num_minutes())
        } else {
            format!("Hoje às {}", dt.format("%H:%M"))
        }
    } else if dt_date == tomorrow {
        format!("Amanhã às {}", dt.format("%H:%M"))
    } else if dt_date == yesterday {
        format!("Ontem às {}", dt.format("%H:%M"))
    } else if dt_date > today && dt_date < today + Duration::days(7) {
        let weekday = weekday_name_pt(dt.weekday().num_days_from_sunday());
        format!("{} às {}", weekday, dt.format("%H:%M"))
    } else {
        format_long_date(dt)
    }
}

fn month_name_pt(month: u32) -> &'static str {
    match month {
        1 => "janeiro",
        2 => "fevereiro",
        3 => "março",
        4 => "abril",
        5 => "maio",
        6 => "junho",
        7 => "julho",
        8 => "agosto",
        9 => "setembro",
        10 => "outubro",
        11 => "novembro",
        12 => "dezembro",
        _ => "?",
    }
}

fn weekday_name_pt(weekday: u32) -> &'static str {
    match weekday {
        0 => "domingo",
        1 => "segunda-feira",
        2 => "terça-feira",
        3 => "quarta-feira",
        4 => "quinta-feira",
        5 => "sexta-feira",
        6 => "sábado",
        _ => "?",
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_format_time() {
        let result = format_datetime("2026-02-07T14:30:00Z", DateTimeFormat::Time).unwrap();
        assert!(!result.formatted.is_empty());
    }

    #[test]
    fn test_meeting_time() {
        let result = format_meeting_time("2026-02-07T14:30:00Z", 60).unwrap();
        assert!(result.contains("60 min"));
    }

    #[test]
    fn test_month_bounds() {
        let (start, end) = get_month_bounds(2026, 2).unwrap();
        assert!(start.contains("2026-02-01"));
        assert!(end.contains("2026-02-28"));
    }
}
