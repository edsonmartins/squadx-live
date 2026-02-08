/**
 * TypeScript bindings for Rust search and filter commands
 *
 * These functions call the Rust backend for searching conversations,
 * messages, meetings, and team members.
 */

import { invoke } from "@tauri-apps/api/core";
import type { Conversation, Message, TeamMember } from "../types/chat";
import type { Meeting } from "../types/calendar";

// ==========================================
// Chat Search
// ==========================================

/**
 * Search conversations by name or participant name
 *
 * @param query - Search query (case-insensitive)
 * @returns Matching conversations sorted by updated_at
 */
export async function searchConversations(
  query: string
): Promise<Conversation[]> {
  return invoke<Conversation[]>("search_conversations", { query });
}

/**
 * Search messages in a conversation by content
 *
 * @param conversationId - Conversation to search in
 * @param query - Search query (case-insensitive)
 * @param limit - Maximum results (default: 50)
 * @returns Matching messages
 */
export async function searchMessages(
  conversationId: string,
  query: string,
  limit?: number
): Promise<Message[]> {
  return invoke<Message[]>("search_messages", {
    conversationId,
    query,
    limit,
  });
}

/**
 * Search team members by name
 *
 * @param query - Search query (case-insensitive)
 * @returns Matching team members
 */
export async function searchTeamMembers(
  query: string
): Promise<TeamMember[]> {
  return invoke<TeamMember[]>("search_team_members", { query });
}

// ==========================================
// Calendar Search & Filter
// ==========================================

/**
 * Filter criteria for meetings
 */
export interface MeetingFilter {
  /** Filter by status (scheduled, ongoing, completed, cancelled) */
  status?: string;
  /** Filter by participant user ID */
  participant_id?: string;
  /** Filter by organizer user ID */
  organizer_id?: string;
  /** Filter by title (case-insensitive search) */
  title_search?: string;
  /** Only show meetings where I haven't responded yet */
  pending_response?: boolean;
}

/**
 * Filter meetings based on criteria
 *
 * @param startDate - Start of date range (ISO 8601)
 * @param endDate - End of date range (ISO 8601)
 * @param filter - Filter criteria
 * @returns Filtered meetings
 */
export async function filterMeetings(
  startDate: string,
  endDate: string,
  filter: MeetingFilter
): Promise<Meeting[]> {
  return invoke<Meeting[]>("filter_meetings", {
    startDate,
    endDate,
    filter,
  });
}

/**
 * Get meetings for a specific date (optimized)
 *
 * @param date - Date in YYYY-MM-DD format
 * @returns Meetings for that date (excluding cancelled)
 */
export async function getMeetingsForDate(date: string): Promise<Meeting[]> {
  return invoke<Meeting[]>("get_meetings_for_date", { date });
}

/**
 * Search meetings by title or description
 *
 * @param query - Search query (case-insensitive)
 * @param limit - Maximum results (default: 20)
 * @returns Matching upcoming meetings
 */
export async function searchMeetings(
  query: string,
  limit?: number
): Promise<Meeting[]> {
  return invoke<Meeting[]>("search_meetings", { query, limit });
}

// ==========================================
// Helper Functions
// ==========================================

/**
 * Debounce helper for search input
 */
export function debounce<T extends (...args: unknown[]) => unknown>(
  fn: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timeoutId: ReturnType<typeof setTimeout>;
  return (...args: Parameters<T>) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), delay);
  };
}

/**
 * Highlight search matches in text
 *
 * @param text - Original text
 * @param query - Search query
 * @returns Array of { text, isMatch } segments
 */
export function highlightMatches(
  text: string,
  query: string
): Array<{ text: string; isMatch: boolean }> {
  if (!query.trim()) {
    return [{ text, isMatch: false }];
  }

  const regex = new RegExp(`(${escapeRegExp(query)})`, "gi");
  const parts = text.split(regex);

  return parts
    .filter((part) => part.length > 0)
    .map((part) => ({
      text: part,
      isMatch: part.toLowerCase() === query.toLowerCase(),
    }));
}

function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
