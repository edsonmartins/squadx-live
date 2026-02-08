//! RRULE (RFC 5545) parsing and building utilities
//!
//! Provides functions to parse, build, and expand recurrence rules
//! for calendar events.

use chrono::{DateTime, TimeZone, Utc};
use rrule::{RRuleSet, Tz};
use serde::{Deserialize, Serialize};

use crate::{Error, Result};

/// Recurrence frequency
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum RecurrenceFrequency {
    Daily,
    Weekly,
    Monthly,
    Yearly,
}

impl RecurrenceFrequency {
    #[allow(dead_code)]
    fn to_rrule_frequency(&self) -> rrule::Frequency {
        match self {
            RecurrenceFrequency::Daily => rrule::Frequency::Daily,
            RecurrenceFrequency::Weekly => rrule::Frequency::Weekly,
            RecurrenceFrequency::Monthly => rrule::Frequency::Monthly,
            RecurrenceFrequency::Yearly => rrule::Frequency::Yearly,
        }
    }

    fn from_str(s: &str) -> Option<Self> {
        match s.to_uppercase().as_str() {
            "DAILY" => Some(RecurrenceFrequency::Daily),
            "WEEKLY" => Some(RecurrenceFrequency::Weekly),
            "MONTHLY" => Some(RecurrenceFrequency::Monthly),
            "YEARLY" => Some(RecurrenceFrequency::Yearly),
            _ => None,
        }
    }
}

/// Recurrence rule configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RecurrenceRule {
    pub frequency: RecurrenceFrequency,
    #[serde(default = "default_interval")]
    pub interval: u32,
    /// Days of week (0 = Sunday, 6 = Saturday)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub weekdays: Option<Vec<u32>>,
    /// End date in ISO format
    #[serde(skip_serializing_if = "Option::is_none")]
    pub end_date: Option<String>,
    /// Number of occurrences
    #[serde(skip_serializing_if = "Option::is_none")]
    pub count: Option<u32>,
}

fn default_interval() -> u32 {
    1
}

/// Expanded occurrence of a recurring event
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RecurrenceOccurrence {
    pub date: String,
    pub is_original: bool,
    pub occurrence_index: u32,
}

/// Result of parsing an RRULE string
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ParsedRRule {
    pub rule: RecurrenceRule,
    pub description: String,
    pub is_valid: bool,
}

/// Build an RRULE string from a RecurrenceRule
pub fn build_rrule(rule: &RecurrenceRule) -> String {
    let mut parts = Vec::new();

    // Frequency
    let freq = match rule.frequency {
        RecurrenceFrequency::Daily => "DAILY",
        RecurrenceFrequency::Weekly => "WEEKLY",
        RecurrenceFrequency::Monthly => "MONTHLY",
        RecurrenceFrequency::Yearly => "YEARLY",
    };
    parts.push(format!("FREQ={}", freq));

    // Interval
    if rule.interval > 1 {
        parts.push(format!("INTERVAL={}", rule.interval));
    }

    // Weekdays (for weekly recurrence)
    if let Some(ref weekdays) = rule.weekdays {
        if !weekdays.is_empty() {
            let day_names = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];
            let days: Vec<&str> = weekdays
                .iter()
                .filter_map(|&d| day_names.get(d as usize).copied())
                .collect();
            if !days.is_empty() {
                parts.push(format!("BYDAY={}", days.join(",")));
            }
        }
    }

    // End condition
    if let Some(ref end_date) = rule.end_date {
        if let Ok(dt) = parse_datetime(end_date) {
            let until = dt.format("%Y%m%dT%H%M%SZ").to_string();
            parts.push(format!("UNTIL={}", until));
        }
    } else if let Some(count) = rule.count {
        parts.push(format!("COUNT={}", count));
    }

    parts.join(";")
}

/// Parse an RRULE string into a RecurrenceRule
pub fn parse_rrule(rrule_str: &str) -> Result<ParsedRRule> {
    if rrule_str.is_empty() {
        return Err(Error::Parse("Empty RRULE string".to_string()));
    }

    let mut rule = RecurrenceRule {
        frequency: RecurrenceFrequency::Daily,
        interval: 1,
        weekdays: None,
        end_date: None,
        count: None,
    };

    let parts: Vec<&str> = rrule_str.split(';').collect();

    for part in parts {
        let kv: Vec<&str> = part.split('=').collect();
        if kv.len() != 2 {
            continue;
        }

        let key = kv[0].trim().to_uppercase();
        let value = kv[1].trim();

        match key.as_str() {
            "FREQ" => {
                rule.frequency = RecurrenceFrequency::from_str(value)
                    .ok_or_else(|| Error::Parse(format!("Invalid frequency: {}", value)))?;
            }
            "INTERVAL" => {
                rule.interval = value
                    .parse()
                    .map_err(|_| Error::Parse(format!("Invalid interval: {}", value)))?;
            }
            "BYDAY" => {
                let day_map = [
                    ("SU", 0u32),
                    ("MO", 1),
                    ("TU", 2),
                    ("WE", 3),
                    ("TH", 4),
                    ("FR", 5),
                    ("SA", 6),
                ];
                let weekdays: Vec<u32> = value
                    .split(',')
                    .filter_map(|d| {
                        let d = d.trim().to_uppercase();
                        // Handle prefixed days like "1MO" or "-1FR"
                        let day_code = d.trim_start_matches(|c: char| c.is_ascii_digit() || c == '-' || c == '+');
                        day_map
                            .iter()
                            .find(|(name, _)| *name == day_code)
                            .map(|(_, num)| *num)
                    })
                    .collect();
                if !weekdays.is_empty() {
                    rule.weekdays = Some(weekdays);
                }
            }
            "UNTIL" => {
                // Parse UNTIL in format YYYYMMDDTHHMMSSZ
                if value.len() >= 8 {
                    let formatted = if value.len() >= 15 {
                        format!(
                            "{}-{}-{}T{}:{}:{}Z",
                            &value[0..4],
                            &value[4..6],
                            &value[6..8],
                            &value[9..11],
                            &value[11..13],
                            &value[13..15]
                        )
                    } else {
                        format!("{}-{}-{}T00:00:00Z", &value[0..4], &value[4..6], &value[6..8])
                    };
                    rule.end_date = Some(formatted);
                }
            }
            "COUNT" => {
                rule.count = value.parse().ok();
            }
            _ => {}
        }
    }

    let description = describe_rrule(&rule);

    Ok(ParsedRRule {
        rule,
        description,
        is_valid: true,
    })
}

/// Validate an RRULE string
pub fn validate_rrule(rrule_str: &str) -> Result<bool> {
    parse_rrule(rrule_str)?;
    Ok(true)
}

/// Expand a recurring event to get all occurrences within a date range
pub fn expand_rrule(
    rrule_str: &str,
    start_date: &str,
    range_start: &str,
    range_end: &str,
    max_occurrences: Option<u32>,
) -> Result<Vec<RecurrenceOccurrence>> {
    let start_dt = parse_datetime(start_date)?;
    let range_start_dt = parse_datetime(range_start)?;
    let range_end_dt = parse_datetime(range_end)?;

    // Build RRULE with DTSTART
    let rrule_full = format!(
        "DTSTART:{}\nRRULE:{}",
        start_dt.format("%Y%m%dT%H%M%SZ"),
        rrule_str
    );

    let rrule_set: RRuleSet = rrule_full
        .parse()
        .map_err(|e| Error::Parse(format!("Invalid RRULE: {:?}", e)))?;

    let max = max_occurrences.unwrap_or(100) as usize;

    // Get occurrences - the rrule crate uses its own Tz type
    let occurrences: Vec<DateTime<Tz>> = rrule_set
        .into_iter()
        .take(max)
        .collect();

    let results: Vec<RecurrenceOccurrence> = occurrences
        .into_iter()
        .enumerate()
        .filter_map(|(idx, dt)| {
            // Convert to UTC for comparison
            let dt_utc = dt.with_timezone(&Utc);
            if dt_utc >= range_start_dt && dt_utc <= range_end_dt {
                Some(RecurrenceOccurrence {
                    date: dt_utc.format("%Y-%m-%dT%H:%M:%SZ").to_string(),
                    is_original: idx == 0,
                    occurrence_index: idx as u32,
                })
            } else if dt_utc > range_end_dt {
                None
            } else {
                // Before range, skip but count
                None
            }
        })
        .collect();

    Ok(results)
}

/// Get a human-readable description of a recurrence rule
pub fn describe_rrule(rule: &RecurrenceRule) -> String {
    let freq_text = match rule.frequency {
        RecurrenceFrequency::Daily => {
            if rule.interval == 1 {
                "Repete diariamente".to_string()
            } else {
                format!("Repete a cada {} dias", rule.interval)
            }
        }
        RecurrenceFrequency::Weekly => {
            let base = if rule.interval == 1 {
                "Repete semanalmente".to_string()
            } else {
                format!("Repete a cada {} semanas", rule.interval)
            };

            if let Some(ref weekdays) = rule.weekdays {
                if !weekdays.is_empty() {
                    let day_names = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
                    let days: Vec<&str> = weekdays
                        .iter()
                        .filter_map(|&d| day_names.get(d as usize).copied())
                        .collect();
                    format!("{} ({})", base, days.join(", "))
                } else {
                    base
                }
            } else {
                base
            }
        }
        RecurrenceFrequency::Monthly => {
            if rule.interval == 1 {
                "Repete mensalmente".to_string()
            } else {
                format!("Repete a cada {} meses", rule.interval)
            }
        }
        RecurrenceFrequency::Yearly => {
            if rule.interval == 1 {
                "Repete anualmente".to_string()
            } else {
                format!("Repete a cada {} anos", rule.interval)
            }
        }
    };

    let end_text = if let Some(ref end_date) = rule.end_date {
        if let Ok(dt) = parse_datetime(end_date) {
            format!(", até {}", dt.format("%d/%m/%Y"))
        } else {
            String::new()
        }
    } else if let Some(count) = rule.count {
        format!(", {} vezes", count)
    } else {
        String::new()
    };

    format!("{}{}", freq_text, end_text)
}

/// Get the next occurrence of a recurring event after a given date
pub fn get_next_occurrence(rrule_str: &str, start_date: &str, after: &str) -> Result<Option<String>> {
    let start_dt = parse_datetime(start_date)?;
    let after_dt = parse_datetime(after)?;

    let rrule_full = format!(
        "DTSTART:{}\nRRULE:{}",
        start_dt.format("%Y%m%dT%H%M%SZ"),
        rrule_str
    );

    let rrule_set: RRuleSet = rrule_full
        .parse()
        .map_err(|e| Error::Parse(format!("Invalid RRULE: {:?}", e)))?;

    for dt in rrule_set.into_iter().take(1000) {
        let dt_utc = dt.with_timezone(&Utc);
        if dt_utc > after_dt {
            return Ok(Some(dt_utc.format("%Y-%m-%dT%H:%M:%SZ").to_string()));
        }
    }

    Ok(None)
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
    if let Ok(date) = chrono::NaiveDate::parse_from_str(s, "%Y-%m-%d") {
        let dt = date.and_hms_opt(0, 0, 0).unwrap();
        return Ok(Utc.from_utc_datetime(&dt));
    }

    Err(Error::Parse(format!("Unable to parse datetime: {}", s)))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_build_rrule_daily() {
        let rule = RecurrenceRule {
            frequency: RecurrenceFrequency::Daily,
            interval: 1,
            weekdays: None,
            end_date: None,
            count: Some(10),
        };
        let rrule = build_rrule(&rule);
        assert_eq!(rrule, "FREQ=DAILY;COUNT=10");
    }

    #[test]
    fn test_build_rrule_weekly() {
        let rule = RecurrenceRule {
            frequency: RecurrenceFrequency::Weekly,
            interval: 1,
            weekdays: Some(vec![1, 3, 5]), // Mon, Wed, Fri
            end_date: None,
            count: None,
        };
        let rrule = build_rrule(&rule);
        assert!(rrule.contains("FREQ=WEEKLY"));
        assert!(rrule.contains("BYDAY=MO,WE,FR"));
    }

    #[test]
    fn test_parse_rrule() {
        let parsed = parse_rrule("FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,FR").unwrap();
        assert_eq!(parsed.rule.frequency, RecurrenceFrequency::Weekly);
        assert_eq!(parsed.rule.interval, 2);
        assert_eq!(parsed.rule.weekdays, Some(vec![1, 5]));
    }

    #[test]
    fn test_describe_rrule() {
        let rule = RecurrenceRule {
            frequency: RecurrenceFrequency::Weekly,
            interval: 1,
            weekdays: Some(vec![1, 3, 5]),
            end_date: None,
            count: None,
        };
        let desc = describe_rrule(&rule);
        assert!(desc.contains("semanalmente"));
        assert!(desc.contains("seg"));
        assert!(desc.contains("qua"));
        assert!(desc.contains("sex"));
    }
}
