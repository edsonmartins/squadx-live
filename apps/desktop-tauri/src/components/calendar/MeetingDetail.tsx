import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  X,
  Calendar,
  Users,
  Play,
  Trash2,
  Edit2,
  Check,
  HelpCircle,
  XCircle,
  Loader2,
  Link as LinkIcon,
  User,
  Repeat,
} from "lucide-react";
import type { Meeting } from "../../types/calendar";
import { parseRRule } from "../../types/calendar";

interface MeetingDetailProps {
  meeting: Meeting;
  currentUserId: string;
  isOpen: boolean;
  onClose: () => void;
  onStartMeeting?: (sessionId: string) => void;
  onMeetingUpdated?: () => void;
  onMeetingDeleted?: () => void;
}

export function MeetingDetail({
  meeting,
  currentUserId,
  isOpen,
  onClose,
  onStartMeeting,
  onMeetingUpdated,
  onMeetingDeleted,
}: MeetingDetailProps) {
  const [isStarting, setIsStarting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isResponding, setIsResponding] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isOrganizer = meeting.organizer_id === currentUserId;
  const myAttendee = meeting.attendees.find((a) => a.user_id === currentUserId);
  const myResponse = myAttendee?.response_status || "invited";
  const canStart = isOrganizer && meeting.status === "scheduled" && !meeting.session_id;
  const isOngoing = meeting.status === "ongoing" && meeting.session_id;

  const scheduledDate = new Date(meeting.scheduled_at);
  const endTime = new Date(scheduledDate.getTime() + meeting.duration_minutes * 60000);

  const formattedDate = scheduledDate.toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const formattedTime = `${scheduledDate.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  })} - ${endTime.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  })}`;

  const recurrence = meeting.recurrence_rule ? parseRRule(meeting.recurrence_rule) : null;

  const getRecurrenceLabel = () => {
    if (!recurrence) return null;
    switch (recurrence.frequency) {
      case "daily":
        return "Repete diariamente";
      case "weekly":
        return "Repete semanalmente";
      case "monthly":
        return "Repete mensalmente";
      default:
        return null;
    }
  };

  const handleStartMeeting = async () => {
    try {
      setIsStarting(true);
      setError(null);
      const sessionId = await invoke<string>("start_meeting", { meetingId: meeting.id });
      onStartMeeting?.(sessionId);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao iniciar reuniao");
    } finally {
      setIsStarting(false);
    }
  };

  const handleJoinMeeting = () => {
    if (meeting.session_id && onStartMeeting) {
      onStartMeeting(meeting.session_id);
      onClose();
    }
  };

  const handleRespond = async (response: "accepted" | "declined" | "tentative") => {
    try {
      setIsResponding(true);
      setError(null);
      await invoke("respond_to_meeting", { meetingId: meeting.id, response });
      onMeetingUpdated?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao responder");
    } finally {
      setIsResponding(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm("Deseja realmente excluir esta reuniao?")) return;

    try {
      setIsDeleting(true);
      setError(null);
      await invoke("delete_meeting", { meetingId: meeting.id });
      onMeetingDeleted?.();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao excluir");
    } finally {
      setIsDeleting(false);
    }
  };

  const handleSyncToGoogle = async () => {
    try {
      setIsSyncing(true);
      setError(null);
      await invoke("sync_meeting_to_google", { meetingId: meeting.id });
      onMeetingUpdated?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao sincronizar");
    } finally {
      setIsSyncing(false);
    }
  };

  const getResponseStatusBadge = (status: string) => {
    switch (status) {
      case "accepted":
        return <span className="text-xs px-2 py-0.5 rounded-full bg-green-600/30 text-green-400">Confirmado</span>;
      case "declined":
        return <span className="text-xs px-2 py-0.5 rounded-full bg-red-600/30 text-red-400">Recusado</span>;
      case "tentative":
        return <span className="text-xs px-2 py-0.5 rounded-full bg-yellow-600/30 text-yellow-400">Talvez</span>;
      default:
        return <span className="text-xs px-2 py-0.5 rounded-full bg-slate-600 text-slate-300">Pendente</span>;
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-lg bg-slate-800 shadow-xl">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-slate-700 px-4 py-3 sticky top-0 bg-slate-800">
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold text-white">{meeting.title}</h2>
              {isOngoing && (
                <span className="flex items-center gap-1 text-xs bg-green-600/30 text-green-400 px-2 py-0.5 rounded-full">
                  <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
                  Em andamento
                </span>
              )}
            </div>
            <p className="text-sm text-slate-400">Organizado por {meeting.organizer_name}</p>
          </div>
          <button
            onClick={onClose}
            className="rounded p-1 text-slate-400 hover:bg-slate-700 hover:text-white"
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {error && (
            <div className="p-3 rounded-lg bg-red-900/30 border border-red-700 text-red-300 text-sm">
              {error}
            </div>
          )}

          {/* Date and Time */}
          <div className="flex items-start gap-3">
            <Calendar size={20} className="text-slate-400 mt-0.5" />
            <div>
              <p className="text-white capitalize">{formattedDate}</p>
              <p className="text-slate-400">{formattedTime} ({meeting.duration_minutes} min)</p>
              {recurrence && (
                <p className="text-primary-400 text-sm flex items-center gap-1 mt-1">
                  <Repeat size={14} />
                  {getRecurrenceLabel()}
                </p>
              )}
            </div>
          </div>

          {/* Description */}
          {meeting.description && (
            <div className="flex items-start gap-3">
              <Edit2 size={20} className="text-slate-400 mt-0.5" />
              <p className="text-slate-300">{meeting.description}</p>
            </div>
          )}

          {/* Google Calendar */}
          {meeting.google_event_id && (
            <div className="flex items-center gap-3">
              <LinkIcon size={20} className="text-slate-400" />
              <p className="text-slate-400 text-sm">Sincronizado com Google Calendar</p>
            </div>
          )}

          {/* Attendees */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Users size={20} className="text-slate-400" />
              <span className="text-white">
                Participantes ({meeting.attendees.filter((a) => a.response_status === "accepted").length}/{meeting.attendees.length})
              </span>
            </div>
            <div className="space-y-2 pl-7">
              {meeting.attendees.map((attendee) => (
                <div
                  key={attendee.user_id}
                  className="flex items-center justify-between p-2 rounded bg-slate-700/50"
                >
                  <div className="flex items-center gap-2">
                    {attendee.avatar_url ? (
                      <img
                        src={attendee.avatar_url}
                        alt={attendee.display_name}
                        className="w-8 h-8 rounded-full object-cover"
                      />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-slate-600 flex items-center justify-center">
                        <User size={16} className="text-slate-300" />
                      </div>
                    )}
                    <span className="text-white">
                      {attendee.display_name}
                      {attendee.user_id === meeting.organizer_id && (
                        <span className="text-xs text-slate-400 ml-1">(Organizador)</span>
                      )}
                      {attendee.user_id === currentUserId && (
                        <span className="text-xs text-primary-400 ml-1">(Voce)</span>
                      )}
                    </span>
                  </div>
                  {getResponseStatusBadge(attendee.response_status)}
                </div>
              ))}
            </div>
          </div>

          {/* My Response (if not organizer) */}
          {!isOrganizer && meeting.status === "scheduled" && (
            <div className="border-t border-slate-700 pt-4">
              <p className="text-sm text-slate-400 mb-2">Sua resposta:</p>
              <div className="flex gap-2">
                <button
                  onClick={() => handleRespond("accepted")}
                  disabled={isResponding}
                  className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded ${
                    myResponse === "accepted"
                      ? "bg-green-600 text-white"
                      : "bg-green-600/20 text-green-400 hover:bg-green-600/40"
                  } disabled:opacity-50`}
                >
                  <Check size={16} />
                  Aceitar
                </button>
                <button
                  onClick={() => handleRespond("tentative")}
                  disabled={isResponding}
                  className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded ${
                    myResponse === "tentative"
                      ? "bg-yellow-600 text-white"
                      : "bg-yellow-600/20 text-yellow-400 hover:bg-yellow-600/40"
                  } disabled:opacity-50`}
                >
                  <HelpCircle size={16} />
                  Talvez
                </button>
                <button
                  onClick={() => handleRespond("declined")}
                  disabled={isResponding}
                  className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded ${
                    myResponse === "declined"
                      ? "bg-red-600 text-white"
                      : "bg-red-600/20 text-red-400 hover:bg-red-600/40"
                  } disabled:opacity-50`}
                >
                  <XCircle size={16} />
                  Recusar
                </button>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="border-t border-slate-700 pt-4 space-y-2">
            {/* Start/Join Meeting */}
            {canStart && (
              <button
                onClick={handleStartMeeting}
                disabled={isStarting}
                className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50"
              >
                {isStarting ? (
                  <Loader2 size={18} className="animate-spin" />
                ) : (
                  <Play size={18} />
                )}
                Iniciar Reuniao
              </button>
            )}

            {isOngoing && (
              <button
                onClick={handleJoinMeeting}
                className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
              >
                <Play size={18} />
                Entrar na Reuniao
              </button>
            )}

            {/* Sync to Google (if organizer and not synced) */}
            {isOrganizer && !meeting.google_event_id && (
              <button
                onClick={handleSyncToGoogle}
                disabled={isSyncing}
                className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-slate-700 text-white rounded-lg hover:bg-slate-600 disabled:opacity-50"
              >
                {isSyncing ? (
                  <Loader2 size={18} className="animate-spin" />
                ) : (
                  <LinkIcon size={18} />
                )}
                Sincronizar com Google Calendar
              </button>
            )}

            {/* Delete (if organizer) */}
            {isOrganizer && (
              <button
                onClick={handleDelete}
                disabled={isDeleting}
                className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-red-600/20 text-red-400 rounded-lg hover:bg-red-600/40 disabled:opacity-50"
              >
                {isDeleting ? (
                  <Loader2 size={18} className="animate-spin" />
                ) : (
                  <Trash2 size={18} />
                )}
                Excluir Reuniao
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
