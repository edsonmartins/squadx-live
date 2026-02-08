/**
 * TypeScript bindings for Rust utility commands
 *
 * These functions call the Rust backend for date/time formatting,
 * RRULE parsing, and calendar grid generation.
 */

import { invoke } from "@tauri-apps/api/core";

// ==========================================
// DateTime Types
// ==========================================

export type DateTimeFormat =
  | "time"
  | "time_with_seconds"
  | "short_date"
  | "long_date"
  | "full_date"
  | "date_time"
  | "relative"
  | "iso8601";

export interface FormattedDateTime {
  formatted: string;
  timestamp: number;
  is_today: boolean;
  is_tomorrow: boolean;
  is_past: boolean;
}

// ==========================================
// RRULE Types
// ==========================================

export type RecurrenceFrequency = "daily" | "weekly" | "monthly" | "yearly";

export interface RecurrenceRule {
  frequency: RecurrenceFrequency;
  interval?: number;
  weekdays?: number[];
  end_date?: string;
  count?: number;
}

export interface ParsedRRule {
  rule: RecurrenceRule;
  description: string;
  is_valid: boolean;
}

export interface RecurrenceOccurrence {
  date: string;
  is_original: boolean;
  occurrence_index: number;
}

// ==========================================
// Calendar Grid Types
// ==========================================

export interface CalendarDay {
  date: string;
  day: number;
  is_current_month: boolean;
  is_today: boolean;
  is_past: boolean;
  is_weekend: boolean;
  weekday: number;
  week_number: number;
}

export interface CalendarGrid {
  year: number;
  month: number;
  month_name: string;
  month_name_short: string;
  days: CalendarDay[];
  first_day: string;
  last_day: string;
  days_in_month: number;
  week_numbers: number[];
}

export interface WeekdayHeader {
  index: number;
  name: string;
  short_name: string;
  letter: string;
}

// ==========================================
// DateTime Functions
// ==========================================

/**
 * Format a datetime string according to the specified format
 */
export async function formatDateTime(
  datetime: string,
  format: DateTimeFormat
): Promise<FormattedDateTime> {
  return invoke<FormattedDateTime>("format_datetime", { datetime, format });
}

/**
 * Format a time range (start - end)
 */
export async function formatTimeRange(
  start: string,
  end: string
): Promise<string> {
  return invoke<string>("format_time_range", { start, end });
}

/**
 * Format a meeting time with duration
 */
export async function formatMeetingTime(
  start: string,
  durationMinutes: number
): Promise<string> {
  return invoke<string>("format_meeting_time", {
    start,
    duration_minutes: durationMinutes,
  });
}

/**
 * Calculate end time from start and duration
 */
export async function calculateEndTime(
  start: string,
  durationMinutes: number
): Promise<string> {
  return invoke<string>("calculate_end_time", {
    start,
    duration_minutes: durationMinutes,
  });
}

/**
 * Check if a datetime is in the past
 */
export async function isPast(datetime: string): Promise<boolean> {
  return invoke<boolean>("is_past", { datetime });
}

/**
 * Check if a datetime is today
 */
export async function isToday(datetime: string): Promise<boolean> {
  return invoke<boolean>("is_today", { datetime });
}

/**
 * Get the start and end of a day in ISO format
 */
export async function getDayBounds(
  date: string
): Promise<[string, string]> {
  return invoke<[string, string]>("get_day_bounds", { date });
}

/**
 * Get the start and end of a month in ISO format
 */
export async function getMonthBounds(
  year: number,
  month: number
): Promise<[string, string]> {
  return invoke<[string, string]>("get_month_bounds", { year, month });
}

// ==========================================
// RRULE Functions
// ==========================================

/**
 * Build an RRULE string from a RecurrenceRule
 */
export async function buildRRule(rule: RecurrenceRule): Promise<string> {
  return invoke<string>("build_rrule", { rule });
}

/**
 * Parse an RRULE string into a RecurrenceRule
 */
export async function parseRRule(rruleStr: string): Promise<ParsedRRule> {
  return invoke<ParsedRRule>("parse_rrule", { rrule_str: rruleStr });
}

/**
 * Validate an RRULE string
 */
export async function validateRRule(rruleStr: string): Promise<boolean> {
  return invoke<boolean>("validate_rrule", { rrule_str: rruleStr });
}

/**
 * Expand a recurring event to get all occurrences within a date range
 */
export async function expandRRule(
  rruleStr: string,
  startDate: string,
  rangeStart: string,
  rangeEnd: string,
  maxOccurrences?: number
): Promise<RecurrenceOccurrence[]> {
  return invoke<RecurrenceOccurrence[]>("expand_rrule", {
    rrule_str: rruleStr,
    start_date: startDate,
    range_start: rangeStart,
    range_end: rangeEnd,
    max_occurrences: maxOccurrences,
  });
}

/**
 * Get a human-readable description of a recurrence rule
 */
export async function describeRRule(rule: RecurrenceRule): Promise<string> {
  return invoke<string>("describe_rrule", { rule });
}

/**
 * Get the next occurrence of a recurring event after a given date
 */
export async function getNextOccurrence(
  rruleStr: string,
  startDate: string,
  after: string
): Promise<string | null> {
  return invoke<string | null>("get_next_occurrence", {
    rrule_str: rruleStr,
    start_date: startDate,
    after,
  });
}

// ==========================================
// Calendar Grid Functions
// ==========================================

/**
 * Generate a calendar grid for a specific month
 */
export async function generateCalendarGrid(
  year: number,
  month: number
): Promise<CalendarGrid> {
  return invoke<CalendarGrid>("generate_calendar_grid", { year, month });
}

/**
 * Generate a minimal calendar grid (only current month days)
 */
export async function generateMonthDays(
  year: number,
  month: number
): Promise<CalendarDay[]> {
  return invoke<CalendarDay[]>("generate_month_days", { year, month });
}

/**
 * Get weekday headers for calendar display
 */
export async function getWeekdayHeaders(
  startOnSunday: boolean = true
): Promise<WeekdayHeader[]> {
  return invoke<WeekdayHeader[]>("get_weekday_headers", {
    start_on_sunday: startOnSunday,
  });
}

/**
 * Navigate to previous month
 */
export async function previousMonth(
  year: number,
  month: number
): Promise<[number, number]> {
  return invoke<[number, number]>("previous_month", { year, month });
}

/**
 * Navigate to next month
 */
export async function nextMonth(
  year: number,
  month: number
): Promise<[number, number]> {
  return invoke<[number, number]>("next_month", { year, month });
}

/**
 * Get current year and month
 */
export async function currentMonth(): Promise<[number, number]> {
  return invoke<[number, number]>("current_month", {});
}

/**
 * Check if a date string falls within a specific month
 */
export async function isInMonth(
  date: string,
  year: number,
  month: number
): Promise<boolean> {
  return invoke<boolean>("is_in_month", { date, year, month });
}

/**
 * Get the week number for a date
 */
export async function getWeekNumber(date: string): Promise<number> {
  return invoke<number>("get_week_number", { date });
}

// ==========================================
// Utility Hooks Helpers
// ==========================================

/**
 * Cache for calendar grids to avoid repeated backend calls
 */
const gridCache = new Map<string, CalendarGrid>();

/**
 * Get calendar grid with caching
 */
export async function getCalendarGridCached(
  year: number,
  month: number
): Promise<CalendarGrid> {
  const key = `${year}-${month}`;

  if (gridCache.has(key)) {
    return gridCache.get(key)!;
  }

  const grid = await generateCalendarGrid(year, month);
  gridCache.set(key, grid);

  // Keep cache size reasonable (last 12 months)
  if (gridCache.size > 12) {
    const firstKey = gridCache.keys().next().value;
    if (firstKey) {
      gridCache.delete(firstKey);
    }
  }

  return grid;
}

/**
 * Clear the calendar grid cache
 */
export function clearCalendarGridCache(): void {
  gridCache.clear();
}

/**
 * Invalidate a specific month in the cache
 */
export function invalidateCalendarGridCache(year: number, month: number): void {
  gridCache.delete(`${year}-${month}`);
}

// ==========================================
// Cache Management (Rust Backend)
// ==========================================

export interface CacheStats {
  meetings_months_cached: number;
  meetings_by_id_cached: number;
  meetings_has_upcoming: boolean;
  messages_conversations_cached: number;
  presence_users_cached: number;
  presence_has_team_members: boolean;
}

/**
 * Get cache statistics from the Rust backend
 */
export async function getCacheStats(): Promise<CacheStats> {
  return invoke<CacheStats>("get_cache_stats", {});
}

/**
 * Invalidate all caches in the Rust backend
 */
export async function invalidateAllCaches(): Promise<void> {
  await invoke("invalidate_all_caches", {});
  // Also clear frontend cache
  clearCalendarGridCache();
}

/**
 * Cleanup expired cache entries in the Rust backend
 */
export async function cleanupCaches(): Promise<void> {
  return invoke("cleanup_caches", {});
}

/**
 * Invalidate meeting cache for a specific month
 */
export async function invalidateMeetingMonth(
  year: number,
  month: number
): Promise<void> {
  await invoke("invalidate_meeting_month", { year, month });
  // Also invalidate frontend calendar grid cache
  invalidateCalendarGridCache(year, month);
}

/**
 * Invalidate message cache for a conversation
 */
export async function invalidateConversationMessages(
  conversationId: string
): Promise<void> {
  return invoke("invalidate_conversation_messages", {
    conversation_id: conversationId,
  });
}

/**
 * Invalidate all presence cache
 */
export async function invalidatePresenceCache(): Promise<void> {
  return invoke("invalidate_presence_cache", {});
}
