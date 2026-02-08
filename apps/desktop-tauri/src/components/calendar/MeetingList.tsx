import { Calendar, Clock, Users, Play, Check, X, HelpCircle } from "lucide-react";
import type { Meeting } from "../../types/calendar";
import { formatMeetingTime, getResponseStatusColor } from "../../types/calendar";

interface MeetingListProps {
  meetings: Meeting[];
  title?: string;
  emptyMessage?: string;
  currentUserId: string;
  onMeetingClick: (meeting: Meeting) => void;
  onStartMeeting?: (meeting: Meeting) => void;
  onRespondMeeting?: (meeting: Meeting, response: 'accepted' | 'declined' | 'tentative') => void;
}

export function MeetingList({
  meetings,
  title = "Reunioes",
  emptyMessage = "Nenhuma reuniao agendada",
  currentUserId,
  onMeetingClick,
  onStartMeeting,
  onRespondMeeting,
}: MeetingListProps) {
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    if (date.toDateString() === today.toDateString()) {
      return "Hoje";
    } else if (date.toDateString() === tomorrow.toDateString()) {
      return "Amanha";
    }

    return date.toLocaleDateString("pt-BR", {
      weekday: "short",
      day: "numeric",
      month: "short",
    });
  };

  const getMyResponse = (meeting: Meeting) => {
    const attendee = meeting.attendees.find((a) => a.user_id === currentUserId);
    return attendee?.response_status || "invited";
  };

  const isOrganizer = (meeting: Meeting) => meeting.organizer_id === currentUserId;

  if (meetings.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <Calendar className="h-12 w-12 text-slate-500 mb-3" />
        <p className="text-slate-400">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {title && (
        <h3 className="text-sm font-medium text-slate-400 uppercase tracking-wide">
          {title}
        </h3>
      )}

      <div className="space-y-2">
        {meetings.map((meeting) => {
          const myResponse = getMyResponse(meeting);
          const amOrganizer = isOrganizer(meeting);
          const canStart = amOrganizer && meeting.status === "scheduled" && !meeting.session_id;
          const needsResponse = !amOrganizer && myResponse === "invited";

          return (
            <div
              key={meeting.id}
              className="bg-slate-700 rounded-lg p-3 hover:bg-slate-600 transition-colors cursor-pointer"
              onClick={() => onMeetingClick(meeting)}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  {/* Title and status */}
                  <div className="flex items-center gap-2">
                    <h4 className="font-medium text-white truncate">
                      {meeting.title}
                    </h4>
                    {meeting.status === "ongoing" && (
                      <span className="flex items-center gap-1 text-xs bg-green-600/30 text-green-400 px-2 py-0.5 rounded-full">
                        <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
                        Em andamento
                      </span>
                    )}
                  </div>

                  {/* Date and time */}
                  <div className="flex items-center gap-3 mt-1 text-sm text-slate-400">
                    <span className="flex items-center gap-1">
                      <Calendar size={14} />
                      {formatDate(meeting.scheduled_at)}
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock size={14} />
                      {formatMeetingTime(meeting)}
                    </span>
                  </div>

                  {/* Attendees */}
                  <div className="flex items-center gap-2 mt-2">
                    <Users size={14} className="text-slate-400" />
                    <div className="flex -space-x-1">
                      {meeting.attendees.slice(0, 4).map((attendee) => (
                        <div
                          key={attendee.user_id}
                          className={`w-6 h-6 rounded-full bg-slate-500 border-2 border-slate-700 flex items-center justify-center text-xs font-medium text-white ${getResponseStatusColor(attendee.response_status)}`}
                          title={`${attendee.display_name} - ${attendee.response_status}`}
                        >
                          {attendee.display_name.charAt(0).toUpperCase()}
                        </div>
                      ))}
                      {meeting.attendees.length > 4 && (
                        <div className="w-6 h-6 rounded-full bg-slate-600 border-2 border-slate-700 flex items-center justify-center text-xs text-slate-300">
                          +{meeting.attendees.length - 4}
                        </div>
                      )}
                    </div>
                    <span className="text-xs text-slate-500">
                      {meeting.attendees.filter((a) => a.response_status === "accepted").length}/
                      {meeting.attendees.length} confirmados
                    </span>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex flex-col gap-1" onClick={(e) => e.stopPropagation()}>
                  {canStart && onStartMeeting && (
                    <button
                      onClick={() => onStartMeeting(meeting)}
                      className="flex items-center gap-1 text-xs bg-primary-600 text-white px-2 py-1 rounded hover:bg-primary-700"
                    >
                      <Play size={12} />
                      Iniciar
                    </button>
                  )}

                  {meeting.session_id && meeting.status === "ongoing" && (
                    <button
                      onClick={() => onMeetingClick(meeting)}
                      className="flex items-center gap-1 text-xs bg-green-600 text-white px-2 py-1 rounded hover:bg-green-700"
                    >
                      <Play size={12} />
                      Entrar
                    </button>
                  )}

                  {needsResponse && onRespondMeeting && (
                    <div className="flex gap-1">
                      <button
                        onClick={() => onRespondMeeting(meeting, "accepted")}
                        className="p-1 rounded bg-green-600/20 text-green-400 hover:bg-green-600/40"
                        title="Aceitar"
                      >
                        <Check size={14} />
                      </button>
                      <button
                        onClick={() => onRespondMeeting(meeting, "tentative")}
                        className="p-1 rounded bg-yellow-600/20 text-yellow-400 hover:bg-yellow-600/40"
                        title="Talvez"
                      >
                        <HelpCircle size={14} />
                      </button>
                      <button
                        onClick={() => onRespondMeeting(meeting, "declined")}
                        className="p-1 rounded bg-red-600/20 text-red-400 hover:bg-red-600/40"
                        title="Recusar"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
