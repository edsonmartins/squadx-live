// ==========================================
// Calendar Types
// ==========================================

export interface Meeting {
  id: string;
  organizer_id: string;
  organizer_name: string;
  title: string;
  description?: string;
  scheduled_at: string;
  duration_minutes: number;
  status: 'scheduled' | 'ongoing' | 'completed' | 'cancelled';
  session_id?: string;
  recurrence_rule?: string;
  google_event_id?: string;
  attendees: MeetingAttendee[];
  created_at?: string;
  updated_at?: string;
}

export interface MeetingAttendee {
  user_id: string;
  display_name: string;
  avatar_url?: string;
  response_status: 'invited' | 'accepted' | 'declined' | 'tentative';
  responded_at?: string;
}

export interface CreateMeetingParams {
  title: string;
  description?: string;
  scheduled_at: string;
  duration_minutes: number;
  attendee_ids: string[];
  recurrence_rule?: string;
}

export interface UpdateMeetingParams {
  title?: string;
  description?: string;
  scheduled_at?: string;
  duration_minutes?: number;
}

export type RecurrenceFrequency = 'daily' | 'weekly' | 'monthly';

export interface RecurrenceRule {
  frequency: RecurrenceFrequency;
  interval: number;
  weekdays?: number[];  // 0-6 for Sunday-Saturday
  endDate?: string;
  count?: number;
}

export interface GoogleCalendarStatus {
  connected: boolean;
  email?: string;
  sync_enabled: boolean;
}

export interface CalendarState {
  meetings: Meeting[];
  selectedDate: Date;
  upcomingMeetings: Meeting[];
  isLoading: boolean;
  error: string | null;
  googleStatus: GoogleCalendarStatus;
}

// Helper to build RRULE string from RecurrenceRule (sync version for forms)
// For async version using Rust backend, use: import { buildRRule } from '../lib/rust-utils'
export function buildRRule(rule: RecurrenceRule): string {
  const parts: string[] = [];

  // Frequency
  parts.push(`FREQ=${rule.frequency.toUpperCase()}`);

  // Interval
  if (rule.interval > 1) {
    parts.push(`INTERVAL=${rule.interval}`);
  }

  // Weekdays for weekly frequency
  if (rule.frequency === 'weekly' && rule.weekdays && rule.weekdays.length > 0) {
    const dayNames = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
    const days = rule.weekdays.map((d) => dayNames[d]).join(',');
    parts.push(`BYDAY=${days}`);
  }

  // End condition
  if (rule.endDate) {
    const date = new Date(rule.endDate);
    const until = date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
    parts.push(`UNTIL=${until}`);
  } else if (rule.count) {
    parts.push(`COUNT=${rule.count}`);
  }

  return parts.join(';');
}

// Helper to parse RRULE string to RecurrenceRule (sync version for display)
// For async version using Rust backend, use: import { parseRRule } from '../lib/rust-utils'
export function parseRRule(rrule: string): RecurrenceRule | null {
  if (!rrule) return null;

  const parts = rrule.split(';');
  const rule: Partial<RecurrenceRule> = {};

  for (const part of parts) {
    const [key, value] = part.split('=');

    switch (key) {
      case 'FREQ':
        rule.frequency = value.toLowerCase() as RecurrenceFrequency;
        break;
      case 'INTERVAL':
        rule.interval = parseInt(value, 10);
        break;
      case 'BYDAY': {
        const dayMap: Record<string, number> = {
          SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6,
        };
        rule.weekdays = value.split(',').map((d) => dayMap[d]);
        break;
      }
      case 'UNTIL':
        rule.endDate = new Date(
          value.replace(/(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z/, '$1-$2-$3T$4:$5:$6Z')
        ).toISOString();
        break;
      case 'COUNT':
        rule.count = parseInt(value, 10);
        break;
    }
  }

  if (!rule.frequency) return null;

  return {
    frequency: rule.frequency,
    interval: rule.interval || 1,
    weekdays: rule.weekdays,
    endDate: rule.endDate,
    count: rule.count,
  };
}

// Helper to get meetings for a specific date
export function getMeetingsForDate(meetings: Meeting[], date: Date): Meeting[] {
  const dateStr = date.toISOString().split('T')[0];
  return meetings.filter((meeting) => {
    const meetingDate = meeting.scheduled_at.split('T')[0];
    return meetingDate === dateStr;
  });
}

// Helper to format meeting time
export function formatMeetingTime(meeting: Meeting): string {
  const start = new Date(meeting.scheduled_at);
  const end = new Date(start.getTime() + meeting.duration_minutes * 60000);

  const formatTime = (date: Date) =>
    date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  return `${formatTime(start)} - ${formatTime(end)}`;
}

// Helper to get response status color
export function getResponseStatusColor(status: MeetingAttendee['response_status']): string {
  switch (status) {
    case 'accepted':
      return 'text-green-500';
    case 'declined':
      return 'text-red-500';
    case 'tentative':
      return 'text-yellow-500';
    default:
      return 'text-slate-400';
  }
}

// Helper to get response status label
export function getResponseStatusLabel(status: MeetingAttendee['response_status']): string {
  switch (status) {
    case 'accepted':
      return 'Aceito';
    case 'declined':
      return 'Recusado';
    case 'tentative':
      return 'Talvez';
    default:
      return 'Pendente';
  }
}
