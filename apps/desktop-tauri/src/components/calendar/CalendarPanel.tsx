import { useState, useCallback } from "react";
import { ChevronLeft, ChevronRight, Plus, Calendar, Settings } from "lucide-react";
import { useCalendar } from "../../hooks/useCalendar";
import { useChat } from "../../hooks/useChat";
import { CalendarGrid } from "./CalendarGrid";
import { MeetingList } from "./MeetingList";
import { CreateMeeting } from "./CreateMeeting";
import { MeetingDetail } from "./MeetingDetail";
import { GoogleCalendarConnect } from "./GoogleCalendarConnect";
import type { Meeting } from "../../types/calendar";

interface CalendarPanelProps {
  currentUserId: string;
  onJoinSession?: (sessionId: string) => void;
}

export function CalendarPanel({ currentUserId, onJoinSession }: CalendarPanelProps) {
  const {
    upcomingMeetings,
    selectedDate,
    isLoading,
    error,
    previousMonth,
    nextMonth,
    goToToday,
    changeDate,
    getMeetingsForDate,
    createMeeting,
    startMeeting,
    respondToMeeting,
    loadMonthMeetings,
    loadUpcoming,
  } = useCalendar();

  const { getTeamMembers } = useChat();

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedMeeting, setSelectedMeeting] = useState<Meeting | null>(null);
  const [showSettings, setShowSettings] = useState(false);

  const selectedDateMeetings = getMeetingsForDate(selectedDate);

  const monthYearLabel = selectedDate.toLocaleDateString("pt-BR", {
    month: "long",
    year: "numeric",
  });

  const handleMeetingClick = useCallback((meeting: Meeting) => {
    setSelectedMeeting(meeting);
  }, []);

  const handleStartMeeting = useCallback(async (meeting: Meeting) => {
    try {
      const sessionId = await startMeeting(meeting.id);
      if (onJoinSession) {
        onJoinSession(sessionId);
      }
    } catch (err) {
      console.error("Failed to start meeting:", err);
    }
  }, [startMeeting, onJoinSession]);

  const handleRespondMeeting = useCallback(async (
    meeting: Meeting,
    response: 'accepted' | 'declined' | 'tentative'
  ) => {
    try {
      await respondToMeeting(meeting.id, response);
    } catch (err) {
      console.error("Failed to respond to meeting:", err);
    }
  }, [respondToMeeting]);

  const handleCreateMeeting = useCallback(async (params: any) => {
    await createMeeting(params);
  }, [createMeeting]);

  const handleMeetingUpdated = useCallback(async () => {
    await loadMonthMeetings(selectedDate);
    await loadUpcoming();
    // Refresh selected meeting if still viewing it
    if (selectedMeeting) {
      const updated = getMeetingsForDate(new Date(selectedMeeting.scheduled_at))
        .find((m) => m.id === selectedMeeting.id);
      if (updated) {
        setSelectedMeeting(updated);
      }
    }
  }, [loadMonthMeetings, loadUpcoming, selectedDate, selectedMeeting, getMeetingsForDate]);

  const handleMeetingDeleted = useCallback(async () => {
    setSelectedMeeting(null);
    await loadMonthMeetings(selectedDate);
    await loadUpcoming();
  }, [loadMonthMeetings, loadUpcoming, selectedDate]);

  const handleJoinFromMeeting = useCallback((sessionId: string) => {
    setSelectedMeeting(null);
    if (onJoinSession) {
      onJoinSession(sessionId);
    }
  }, [onJoinSession]);

  return (
    <div className="flex h-full bg-slate-800">
      {/* Left side - Calendar */}
      <div className="w-80 flex flex-col border-r border-slate-700 p-4">
        {/* Header with navigation */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-white capitalize">
            {monthYearLabel}
          </h2>
          <div className="flex items-center gap-1">
            <button
              onClick={goToToday}
              className="px-2 py-1 text-xs text-slate-400 hover:text-white hover:bg-slate-700 rounded"
            >
              Hoje
            </button>
            <button
              onClick={previousMonth}
              className="p-1 text-slate-400 hover:text-white hover:bg-slate-700 rounded"
            >
              <ChevronLeft size={18} />
            </button>
            <button
              onClick={nextMonth}
              className="p-1 text-slate-400 hover:text-white hover:bg-slate-700 rounded"
            >
              <ChevronRight size={18} />
            </button>
          </div>
        </div>

        {/* Calendar Grid */}
        <CalendarGrid
          selectedDate={selectedDate}
          onDateSelect={changeDate}
          getMeetingsForDate={getMeetingsForDate}
        />

        {/* Create button */}
        <button
          onClick={() => setShowCreateModal(true)}
          className="mt-4 flex items-center justify-center gap-2 w-full py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
        >
          <Plus size={18} />
          Nova Reuniao
        </button>

        {/* Upcoming meetings */}
        <div className="mt-6 flex-1 overflow-y-auto">
          <MeetingList
            meetings={upcomingMeetings}
            title="Proximas Reunioes"
            emptyMessage="Nenhuma reuniao proxima"
            currentUserId={currentUserId}
            onMeetingClick={handleMeetingClick}
            onStartMeeting={handleStartMeeting}
            onRespondMeeting={handleRespondMeeting}
          />
        </div>

        {/* Settings button */}
        <button
          onClick={() => setShowSettings(!showSettings)}
          className="mt-4 flex items-center justify-center gap-2 w-full py-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg"
        >
          <Settings size={16} />
          Configuracoes
        </button>

        {/* Settings panel */}
        {showSettings && (
          <div className="mt-3">
            <GoogleCalendarConnect />
          </div>
        )}
      </div>

      {/* Right side - Selected date meetings */}
      <div className="flex-1 p-6 overflow-y-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold text-white">
              {selectedDate.toLocaleDateString("pt-BR", {
                weekday: "long",
                day: "numeric",
                month: "long",
              })}
            </h2>
            <p className="text-slate-400">
              {selectedDateMeetings.length === 0
                ? "Nenhuma reuniao agendada"
                : `${selectedDateMeetings.length} reuniao(s) agendada(s)`}
            </p>
          </div>

          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
          >
            <Plus size={18} />
            Agendar
          </button>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary-500 border-t-transparent" />
          </div>
        ) : error ? (
          <div className="bg-red-900/30 border border-red-700 rounded-lg p-4 text-red-300">
            {error}
          </div>
        ) : selectedDateMeetings.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Calendar className="h-16 w-16 text-slate-600 mb-4" />
            <h3 className="text-lg font-medium text-white mb-2">
              Nenhuma reuniao
            </h3>
            <p className="text-slate-400 mb-4">
              Nao ha reunioes agendadas para este dia
            </p>
            <button
              onClick={() => setShowCreateModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
            >
              <Plus size={18} />
              Agendar Reuniao
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {selectedDateMeetings.map((meeting) => (
              <div
                key={meeting.id}
                onClick={() => handleMeetingClick(meeting)}
                className="bg-slate-700 rounded-lg p-4 cursor-pointer hover:bg-slate-600 transition-colors"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="text-lg font-medium text-white">
                      {meeting.title}
                    </h3>
                    {meeting.description && (
                      <p className="text-slate-400 mt-1">{meeting.description}</p>
                    )}
                  </div>
                  {meeting.status === "ongoing" && (
                    <span className="flex items-center gap-1 text-sm bg-green-600/30 text-green-400 px-3 py-1 rounded-full">
                      <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                      Em andamento
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-4 mt-4 text-sm text-slate-400">
                  <span>
                    {new Date(meeting.scheduled_at).toLocaleTimeString("pt-BR", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                    {" - "}
                    {new Date(
                      new Date(meeting.scheduled_at).getTime() +
                        meeting.duration_minutes * 60000
                    ).toLocaleTimeString("pt-BR", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                  <span>|</span>
                  <span>{meeting.duration_minutes} min</span>
                  <span>|</span>
                  <span>
                    {meeting.attendees.filter((a) => a.response_status === "accepted").length}/
                    {meeting.attendees.length} confirmados
                  </span>
                </div>

                <div className="flex items-center justify-between mt-4">
                  <div className="flex -space-x-2">
                    {meeting.attendees.slice(0, 5).map((attendee) => (
                      <div
                        key={attendee.user_id}
                        className="w-8 h-8 rounded-full bg-slate-600 border-2 border-slate-700 flex items-center justify-center text-sm font-medium text-white"
                        title={attendee.display_name}
                      >
                        {attendee.display_name.charAt(0).toUpperCase()}
                      </div>
                    ))}
                    {meeting.attendees.length > 5 && (
                      <div className="w-8 h-8 rounded-full bg-slate-600 border-2 border-slate-700 flex items-center justify-center text-xs text-slate-300">
                        +{meeting.attendees.length - 5}
                      </div>
                    )}
                  </div>

                  <div className="flex gap-2">
                    {meeting.organizer_id === currentUserId &&
                      meeting.status === "scheduled" &&
                      !meeting.session_id && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleStartMeeting(meeting);
                          }}
                          className="px-3 py-1 bg-primary-600 text-white rounded hover:bg-primary-700"
                        >
                          Iniciar
                        </button>
                      )}
                    {meeting.session_id && meeting.status === "ongoing" && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (onJoinSession) onJoinSession(meeting.session_id!);
                        }}
                        className="px-3 py-1 bg-green-600 text-white rounded hover:bg-green-700"
                      >
                        Entrar
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Create Meeting Modal */}
      <CreateMeeting
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onCreate={handleCreateMeeting}
        getTeamMembers={getTeamMembers}
        initialDate={selectedDate}
      />

      {/* Meeting Detail Modal */}
      {selectedMeeting && (
        <MeetingDetail
          meeting={selectedMeeting}
          currentUserId={currentUserId}
          isOpen={!!selectedMeeting}
          onClose={() => setSelectedMeeting(null)}
          onStartMeeting={handleJoinFromMeeting}
          onMeetingUpdated={handleMeetingUpdated}
          onMeetingDeleted={handleMeetingDeleted}
        />
      )}
    </div>
  );
}
