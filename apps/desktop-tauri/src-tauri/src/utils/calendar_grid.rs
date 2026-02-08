//! Calendar grid generation utilities
//!
//! Provides functions to generate calendar grid data for month views,
//! including handling of days from previous/next months to fill the grid.

use chrono::{Datelike, Duration, Local, NaiveDate};
use serde::{Deserialize, Serialize};

use crate::{Error, Result};

/// A single day in the calendar grid
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CalendarDay {
    /// The date in YYYY-MM-DD format
    pub date: String,
    /// Day of the month (1-31)
    pub day: u32,
    /// Whether this day is in the current displayed month
    pub is_current_month: bool,
    /// Whether this day is today
    pub is_today: bool,
    /// Whether this day is in the past
    pub is_past: bool,
    /// Whether this day is a weekend (Saturday or Sunday)
    pub is_weekend: bool,
    /// Day of week (0 = Sunday, 6 = Saturday)
    pub weekday: u32,
    /// ISO week number
    pub week_number: u32,
}

/// Calendar grid data for a month view
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CalendarGrid {
    /// Year being displayed
    pub year: i32,
    /// Month being displayed (1-12)
    pub month: u32,
    /// Month name in Portuguese
    pub month_name: String,
    /// Short month name in Portuguese
    pub month_name_short: String,
    /// All days in the grid (typically 42 days for 6 weeks)
    pub days: Vec<CalendarDay>,
    /// First day of the actual month
    pub first_day: String,
    /// Last day of the actual month
    pub last_day: String,
    /// Number of days in the month
    pub days_in_month: u32,
    /// Week numbers covered by this grid
    pub week_numbers: Vec<u32>,
}

/// Weekday header information
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WeekdayHeader {
    pub index: u32,
    pub name: String,
    pub short_name: String,
    pub letter: String,
}

/// Generate a calendar grid for a specific month
pub fn generate_calendar_grid(year: i32, month: u32) -> Result<CalendarGrid> {
    if month < 1 || month > 12 {
        return Err(Error::Parse(format!("Invalid month: {}", month)));
    }

    let today = Local::now().date_naive();

    // First day of the month
    let first_day = NaiveDate::from_ymd_opt(year, month, 1)
        .ok_or_else(|| Error::Parse("Invalid date".to_string()))?;

    // Last day of the month
    let last_day = if month == 12 {
        NaiveDate::from_ymd_opt(year + 1, 1, 1)
    } else {
        NaiveDate::from_ymd_opt(year, month + 1, 1)
    }
    .ok_or_else(|| Error::Parse("Invalid date calculation".to_string()))?
        - Duration::days(1);

    let days_in_month = last_day.day();

    // Calculate start of grid (Sunday of the week containing the first day)
    let first_day_weekday = first_day.weekday().num_days_from_sunday();
    let grid_start = first_day - Duration::days(first_day_weekday as i64);

    // Generate 42 days (6 weeks) for consistent grid
    let mut days = Vec::with_capacity(42);
    let mut week_numbers = Vec::new();
    let mut current_week = 0u32;

    for i in 0..42 {
        let date = grid_start + Duration::days(i);
        let weekday = date.weekday().num_days_from_sunday();
        let week_num = date.iso_week().week();

        if weekday == 0 || i == 0 {
            if !week_numbers.contains(&week_num) {
                week_numbers.push(week_num);
            }
            current_week = week_num;
        }

        let is_current_month = date.month() == month && date.year() == year;

        days.push(CalendarDay {
            date: date.format("%Y-%m-%d").to_string(),
            day: date.day(),
            is_current_month,
            is_today: date == today,
            is_past: date < today,
            is_weekend: weekday == 0 || weekday == 6,
            weekday,
            week_number: current_week,
        });
    }

    Ok(CalendarGrid {
        year,
        month,
        month_name: month_name_full(month),
        month_name_short: month_name_short(month),
        days,
        first_day: first_day.format("%Y-%m-%d").to_string(),
        last_day: last_day.format("%Y-%m-%d").to_string(),
        days_in_month,
        week_numbers,
    })
}

/// Generate a minimal calendar grid (only current month days)
pub fn generate_month_days(year: i32, month: u32) -> Result<Vec<CalendarDay>> {
    if month < 1 || month > 12 {
        return Err(Error::Parse(format!("Invalid month: {}", month)));
    }

    let today = Local::now().date_naive();

    let first_day = NaiveDate::from_ymd_opt(year, month, 1)
        .ok_or_else(|| Error::Parse("Invalid date".to_string()))?;

    let last_day = if month == 12 {
        NaiveDate::from_ymd_opt(year + 1, 1, 1)
    } else {
        NaiveDate::from_ymd_opt(year, month + 1, 1)
    }
    .ok_or_else(|| Error::Parse("Invalid date calculation".to_string()))?
        - Duration::days(1);

    let mut days = Vec::new();

    let mut current = first_day;
    while current <= last_day {
        let weekday = current.weekday().num_days_from_sunday();

        days.push(CalendarDay {
            date: current.format("%Y-%m-%d").to_string(),
            day: current.day(),
            is_current_month: true,
            is_today: current == today,
            is_past: current < today,
            is_weekend: weekday == 0 || weekday == 6,
            weekday,
            week_number: current.iso_week().week(),
        });

        current += Duration::days(1);
    }

    Ok(days)
}

/// Get weekday headers for calendar display
pub fn get_weekday_headers(start_on_sunday: bool) -> Vec<WeekdayHeader> {
    let weekdays = if start_on_sunday {
        vec![
            (0, "Domingo", "Dom", "D"),
            (1, "Segunda-feira", "Seg", "S"),
            (2, "Terça-feira", "Ter", "T"),
            (3, "Quarta-feira", "Qua", "Q"),
            (4, "Quinta-feira", "Qui", "Q"),
            (5, "Sexta-feira", "Sex", "S"),
            (6, "Sábado", "Sáb", "S"),
        ]
    } else {
        vec![
            (1, "Segunda-feira", "Seg", "S"),
            (2, "Terça-feira", "Ter", "T"),
            (3, "Quarta-feira", "Qua", "Q"),
            (4, "Quinta-feira", "Qui", "Q"),
            (5, "Sexta-feira", "Sex", "S"),
            (6, "Sábado", "Sáb", "S"),
            (0, "Domingo", "Dom", "D"),
        ]
    };

    weekdays
        .into_iter()
        .map(|(index, name, short_name, letter)| WeekdayHeader {
            index,
            name: name.to_string(),
            short_name: short_name.to_string(),
            letter: letter.to_string(),
        })
        .collect()
}

/// Navigate to previous month
pub fn previous_month(year: i32, month: u32) -> (i32, u32) {
    if month == 1 {
        (year - 1, 12)
    } else {
        (year, month - 1)
    }
}

/// Navigate to next month
pub fn next_month(year: i32, month: u32) -> (i32, u32) {
    if month == 12 {
        (year + 1, 1)
    } else {
        (year, month + 1)
    }
}

/// Get current year and month
pub fn current_month() -> (i32, u32) {
    let today = Local::now();
    (today.year(), today.month())
}

/// Check if a date string falls within a specific month
pub fn is_in_month(date_str: &str, year: i32, month: u32) -> bool {
    if let Ok(date) = NaiveDate::parse_from_str(date_str, "%Y-%m-%d") {
        date.year() == year && date.month() == month
    } else if let Ok(dt) = chrono::DateTime::parse_from_rfc3339(date_str) {
        let date = dt.date_naive();
        date.year() == year && date.month() == month
    } else {
        false
    }
}

/// Get the week number for a date
pub fn get_week_number(date_str: &str) -> Result<u32> {
    let date = NaiveDate::parse_from_str(date_str, "%Y-%m-%d")
        .or_else(|_| {
            chrono::DateTime::parse_from_rfc3339(date_str)
                .map(|dt| dt.date_naive())
        })
        .map_err(|e| Error::Parse(format!("Invalid date: {}", e)))?;

    Ok(date.iso_week().week())
}

// ==========================================
// Helper Functions
// ==========================================

fn month_name_full(month: u32) -> String {
    match month {
        1 => "Janeiro",
        2 => "Fevereiro",
        3 => "Março",
        4 => "Abril",
        5 => "Maio",
        6 => "Junho",
        7 => "Julho",
        8 => "Agosto",
        9 => "Setembro",
        10 => "Outubro",
        11 => "Novembro",
        12 => "Dezembro",
        _ => "?",
    }
    .to_string()
}

fn month_name_short(month: u32) -> String {
    match month {
        1 => "Jan",
        2 => "Fev",
        3 => "Mar",
        4 => "Abr",
        5 => "Mai",
        6 => "Jun",
        7 => "Jul",
        8 => "Ago",
        9 => "Set",
        10 => "Out",
        11 => "Nov",
        12 => "Dez",
        _ => "?",
    }
    .to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_generate_calendar_grid() {
        let grid = generate_calendar_grid(2026, 2).unwrap();
        assert_eq!(grid.year, 2026);
        assert_eq!(grid.month, 2);
        assert_eq!(grid.days.len(), 42);
        assert_eq!(grid.days_in_month, 28);
        assert_eq!(grid.month_name, "Fevereiro");
    }

    #[test]
    fn test_generate_month_days() {
        let days = generate_month_days(2026, 2).unwrap();
        assert_eq!(days.len(), 28);
        assert!(days.iter().all(|d| d.is_current_month));
    }

    #[test]
    fn test_navigation() {
        assert_eq!(previous_month(2026, 1), (2025, 12));
        assert_eq!(previous_month(2026, 6), (2026, 5));
        assert_eq!(next_month(2026, 12), (2027, 1));
        assert_eq!(next_month(2026, 6), (2026, 7));
    }

    #[test]
    fn test_weekday_headers() {
        let headers = get_weekday_headers(true);
        assert_eq!(headers.len(), 7);
        assert_eq!(headers[0].short_name, "Dom");
        assert_eq!(headers[1].short_name, "Seg");
    }

    #[test]
    fn test_is_in_month() {
        assert!(is_in_month("2026-02-15", 2026, 2));
        assert!(!is_in_month("2026-03-01", 2026, 2));
        assert!(is_in_month("2026-02-15T10:30:00Z", 2026, 2));
    }
}
