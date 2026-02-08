import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, UnlistenFn } from "@tauri-apps/api/event";
import type {
  Meeting,
  CreateMeetingParams,
  UpdateMeetingParams,
  GoogleCalendarStatus,
} from "../types/calendar";

export function useCalendar() {
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [upcomingMeetings, setUpcomingMeetings] = useState<Meeting[]>([]);
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [googleStatus, _setGoogleStatus] = useState<GoogleCalendarStatus>({
    connected: false,
    sync_enabled: false,
  });

  // Load meetings for a date range
  const loadMeetings = useCallback(async (startDate: Date, endDate: Date) => {
    try {
      setIsLoading(true);
      setError(null);

      const start = startDate.toISOString();
      const end = endDate.toISOString();

      const result = await invoke<Meeting[]>("get_meetings", {
        startDate: start,
        endDate: end,
      });

      setMeetings(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      console.error("Failed to load meetings:", err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Load meetings for the current month
  const loadMonthMeetings = useCallback(async (date: Date) => {
    const year = date.getFullYear();
    const month = date.getMonth();

    // Start of month
    const startDate = new Date(year, month, 1);
    // End of month
    const endDate = new Date(year, month + 1, 0, 23, 59, 59);

    await loadMeetings(startDate, endDate);
  }, [loadMeetings]);

  // Load upcoming meetings
  const loadUpcoming = useCallback(async (limit = 5) => {
    try {
      const result = await invoke<Meeting[]>("get_upcoming_meetings", { limit });
      setUpcomingMeetings(result);
    } catch (err) {
      console.error("Failed to load upcoming meetings:", err);
    }
  }, []);

  // Get a single meeting
  const getMeeting = useCallback(async (meetingId: string): Promise<Meeting | null> => {
    try {
      return await invoke<Meeting | null>("get_meeting", { meetingId });
    } catch (err) {
      console.error("Failed to get meeting:", err);
      return null;
    }
  }, []);

  // Create a new meeting
  const createMeeting = useCallback(async (params: CreateMeetingParams): Promise<Meeting> => {
    try {
      setError(null);
      const meeting = await invoke<Meeting>("create_meeting", { params });

      // Add to local state
      setMeetings((prev) => [...prev, meeting].sort(
        (a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime()
      ));

      // Refresh upcoming
      await loadUpcoming();

      return meeting;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      throw err;
    }
  }, [loadUpcoming]);

  // Update a meeting
  const updateMeeting = useCallback(async (meetingId: string, params: UpdateMeetingParams) => {
    try {
      setError(null);
      await invoke("update_meeting", { meetingId, params });

      // Refresh meetings
      await loadMonthMeetings(selectedDate);
      await loadUpcoming();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      throw err;
    }
  }, [loadMonthMeetings, loadUpcoming, selectedDate]);

  // Cancel a meeting
  const cancelMeeting = useCallback(async (meetingId: string) => {
    try {
      setError(null);
      await invoke("cancel_meeting", { meetingId });

      // Update local state
      setMeetings((prev) =>
        prev.map((m) =>
          m.id === meetingId ? { ...m, status: 'cancelled' as const } : m
        )
      );

      // Refresh upcoming
      await loadUpcoming();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      throw err;
    }
  }, [loadUpcoming]);

  // Delete a meeting
  const deleteMeeting = useCallback(async (meetingId: string) => {
    try {
      setError(null);
      await invoke("delete_meeting", { meetingId });

      // Remove from local state
      setMeetings((prev) => prev.filter((m) => m.id !== meetingId));

      // Refresh upcoming
      await loadUpcoming();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      throw err;
    }
  }, [loadUpcoming]);

  // Respond to a meeting
  const respondToMeeting = useCallback(async (
    meetingId: string,
    response: 'accepted' | 'declined' | 'tentative'
  ) => {
    try {
      setError(null);
      await invoke("respond_to_meeting", { meetingId, response });

      // Refresh meetings
      await loadMonthMeetings(selectedDate);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      throw err;
    }
  }, [loadMonthMeetings, selectedDate]);

  // Add attendee to meeting
  const addAttendee = useCallback(async (meetingId: string, userId: string) => {
    try {
      setError(null);
      await invoke("add_meeting_attendee", { meetingId, userId });

      // Refresh meeting
      const updated = await getMeeting(meetingId);
      if (updated) {
        setMeetings((prev) =>
          prev.map((m) => (m.id === meetingId ? updated : m))
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      throw err;
    }
  }, [getMeeting]);

  // Remove attendee from meeting
  const removeAttendee = useCallback(async (meetingId: string, userId: string) => {
    try {
      setError(null);
      await invoke("remove_meeting_attendee", { meetingId, userId });

      // Refresh meeting
      const updated = await getMeeting(meetingId);
      if (updated) {
        setMeetings((prev) =>
          prev.map((m) => (m.id === meetingId ? updated : m))
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      throw err;
    }
  }, [getMeeting]);

  // Start a meeting (create session)
  const startMeeting = useCallback(async (meetingId: string): Promise<string> => {
    try {
      setError(null);
      const sessionId = await invoke<string>("start_meeting", { meetingId });

      // Update local state
      setMeetings((prev) =>
        prev.map((m) =>
          m.id === meetingId
            ? { ...m, session_id: sessionId, status: 'ongoing' as const }
            : m
        )
      );

      return sessionId;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      throw err;
    }
  }, []);

  // Get meetings for a specific date
  const getMeetingsForDate = useCallback((date: Date): Meeting[] => {
    const dateStr = date.toISOString().split('T')[0];
    return meetings.filter((meeting) => {
      if (meeting.status === 'cancelled') return false;
      const meetingDate = meeting.scheduled_at.split('T')[0];
      return meetingDate === dateStr;
    });
  }, [meetings]);

  // Change selected date and load that month
  const changeDate = useCallback(async (date: Date) => {
    setSelectedDate(date);

    // Check if we need to load a different month
    const currentMonth = selectedDate.getMonth();
    const currentYear = selectedDate.getFullYear();
    const newMonth = date.getMonth();
    const newYear = date.getFullYear();

    if (currentMonth !== newMonth || currentYear !== newYear) {
      await loadMonthMeetings(date);
    }
  }, [selectedDate, loadMonthMeetings]);

  // Navigate to previous month
  const previousMonth = useCallback(async () => {
    const newDate = new Date(selectedDate);
    newDate.setMonth(newDate.getMonth() - 1);
    await changeDate(newDate);
  }, [selectedDate, changeDate]);

  // Navigate to next month
  const nextMonth = useCallback(async () => {
    const newDate = new Date(selectedDate);
    newDate.setMonth(newDate.getMonth() + 1);
    await changeDate(newDate);
  }, [selectedDate, changeDate]);

  // Go to today
  const goToToday = useCallback(async () => {
    await changeDate(new Date());
  }, [changeDate]);

  // Google Calendar integration (placeholders)
  const connectGoogle = useCallback(async () => {
    // TODO: Implement Google OAuth flow
    console.log("Google Calendar connection not yet implemented");
  }, []);

  const disconnectGoogle = useCallback(async () => {
    // TODO: Implement Google disconnect
    console.log("Google Calendar disconnect not yet implemented");
  }, []);

  const syncWithGoogle = useCallback(async () => {
    // TODO: Implement Google sync
    console.log("Google Calendar sync not yet implemented");
  }, []);

  // Initial load
  useEffect(() => {
    loadMonthMeetings(selectedDate);
    loadUpcoming();
  }, []);

  // Listen for realtime updates
  useEffect(() => {
    let unlistenMeetingUpdated: UnlistenFn | undefined;

    const setupListeners = async () => {
      unlistenMeetingUpdated = await listen<Meeting>("calendar:meeting-updated", (event) => {
        const meeting = event.payload;
        setMeetings((prev) =>
          prev.map((m) => (m.id === meeting.id ? meeting : m))
        );
      });
    };

    setupListeners();

    return () => {
      unlistenMeetingUpdated?.();
    };
  }, []);

  return {
    // State
    meetings,
    upcomingMeetings,
    selectedDate,
    isLoading,
    error,
    googleStatus,

    // Actions
    loadMeetings,
    loadMonthMeetings,
    loadUpcoming,
    getMeeting,
    createMeeting,
    updateMeeting,
    cancelMeeting,
    deleteMeeting,
    respondToMeeting,
    addAttendee,
    removeAttendee,
    startMeeting,
    getMeetingsForDate,
    changeDate,
    previousMonth,
    nextMonth,
    goToToday,
    setSelectedDate,

    // Google Calendar
    connectGoogle,
    disconnectGoogle,
    syncWithGoogle,
  };
}
