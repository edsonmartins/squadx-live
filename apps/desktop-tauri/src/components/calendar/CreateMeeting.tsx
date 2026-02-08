import { useState, useEffect } from "react";
import { X, Plus, User, Loader2, Search, Check, Clock, CalendarIcon, Repeat } from "lucide-react";
import type { TeamMember } from "../../types/chat";
import type { CreateMeetingParams, RecurrenceRule, RecurrenceFrequency } from "../../types/calendar";
import { buildRRule } from "../../types/calendar";

interface CreateMeetingProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (params: CreateMeetingParams) => Promise<void>;
  getTeamMembers: () => Promise<TeamMember[]>;
  initialDate?: Date;
}

export function CreateMeeting({
  isOpen,
  onClose,
  onCreate,
  getTeamMembers,
  initialDate,
}: CreateMeetingProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("09:00");
  const [duration, setDuration] = useState(30);
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [showRecurrence, setShowRecurrence] = useState(false);
  const [recurrence, setRecurrence] = useState<RecurrenceRule | null>(null);

  useEffect(() => {
    if (isOpen) {
      // Reset form
      setTitle("");
      setDescription("");
      setSelectedMembers([]);
      setSearchQuery("");
      setShowRecurrence(false);
      setRecurrence(null);
      setDuration(30);

      // Set initial date
      const targetDate = initialDate || new Date();
      setDate(targetDate.toISOString().split("T")[0]);
      setTime("09:00");

      loadMembers();
    }
  }, [isOpen, initialDate]);

  const loadMembers = async () => {
    setIsLoading(true);
    try {
      const members = await getTeamMembers();
      setTeamMembers(members);
    } catch (err) {
      console.error("Failed to load team members:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const filteredMembers = teamMembers.filter((member) =>
    member.display_name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const toggleMember = (userId: string) => {
    setSelectedMembers((prev) =>
      prev.includes(userId)
        ? prev.filter((id) => id !== userId)
        : [...prev, userId]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!title.trim() || !date || !time) return;

    setIsCreating(true);
    try {
      const scheduledAt = new Date(`${date}T${time}`).toISOString();

      const params: CreateMeetingParams = {
        title: title.trim(),
        description: description.trim() || undefined,
        scheduled_at: scheduledAt,
        duration_minutes: duration,
        attendee_ids: selectedMembers,
        recurrence_rule: recurrence ? buildRRule(recurrence) : undefined,
      };

      await onCreate(params);
      onClose();
    } catch (err) {
      console.error("Failed to create meeting:", err);
    } finally {
      setIsCreating(false);
    }
  };

  const durationOptions = [
    { value: 15, label: "15 min" },
    { value: 30, label: "30 min" },
    { value: 45, label: "45 min" },
    { value: 60, label: "1 hora" },
    { value: 90, label: "1h 30min" },
    { value: 120, label: "2 horas" },
  ];

  const weekDays = [
    { value: 0, label: "D" },
    { value: 1, label: "S" },
    { value: 2, label: "T" },
    { value: 3, label: "Q" },
    { value: 4, label: "Q" },
    { value: 5, label: "S" },
    { value: 6, label: "S" },
  ];

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-lg bg-slate-800 shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-700 px-4 py-3 sticky top-0 bg-slate-800">
          <h2 className="text-lg font-semibold text-white">Nova Reuniao</h2>
          <button
            onClick={onClose}
            className="rounded p-1 text-slate-400 hover:bg-slate-700 hover:text-white"
          >
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {/* Title */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">
              Titulo *
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Nome da reuniao..."
              className="w-full rounded-lg border border-slate-600 bg-slate-700 px-3 py-2 text-white placeholder-slate-400 focus:border-primary-500 focus:outline-none"
              required
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">
              Descricao
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Detalhes da reuniao..."
              rows={2}
              className="w-full rounded-lg border border-slate-600 bg-slate-700 px-3 py-2 text-white placeholder-slate-400 focus:border-primary-500 focus:outline-none resize-none"
            />
          </div>

          {/* Date and Time */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">
                <CalendarIcon size={14} className="inline mr-1" />
                Data *
              </label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full rounded-lg border border-slate-600 bg-slate-700 px-3 py-2 text-white focus:border-primary-500 focus:outline-none"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">
                <Clock size={14} className="inline mr-1" />
                Horario *
              </label>
              <input
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                className="w-full rounded-lg border border-slate-600 bg-slate-700 px-3 py-2 text-white focus:border-primary-500 focus:outline-none"
                required
              />
            </div>
          </div>

          {/* Duration */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">
              Duracao
            </label>
            <div className="flex flex-wrap gap-2">
              {durationOptions.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setDuration(opt.value)}
                  className={`px-3 py-1 rounded-full text-sm ${
                    duration === opt.value
                      ? "bg-primary-600 text-white"
                      : "bg-slate-700 text-slate-300 hover:bg-slate-600"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Recurrence */}
          <div>
            <button
              type="button"
              onClick={() => setShowRecurrence(!showRecurrence)}
              className="flex items-center gap-2 text-sm text-slate-400 hover:text-white"
            >
              <Repeat size={16} />
              {recurrence ? "Editar recorrencia" : "Adicionar recorrencia"}
            </button>

            {showRecurrence && (
              <div className="mt-3 p-3 bg-slate-700 rounded-lg space-y-3">
                <div>
                  <label className="block text-sm text-slate-300 mb-1">Frequencia</label>
                  <select
                    value={recurrence?.frequency || ""}
                    onChange={(e) => {
                      const freq = e.target.value as RecurrenceFrequency;
                      if (freq) {
                        setRecurrence({
                          frequency: freq,
                          interval: 1,
                          weekdays: freq === "weekly" ? [new Date().getDay()] : undefined,
                        });
                      } else {
                        setRecurrence(null);
                      }
                    }}
                    className="w-full rounded-lg border border-slate-600 bg-slate-600 px-3 py-2 text-white"
                  >
                    <option value="">Nenhuma</option>
                    <option value="daily">Diaria</option>
                    <option value="weekly">Semanal</option>
                    <option value="monthly">Mensal</option>
                  </select>
                </div>

                {recurrence?.frequency === "weekly" && (
                  <div>
                    <label className="block text-sm text-slate-300 mb-1">Dias da semana</label>
                    <div className="flex gap-1">
                      {weekDays.map((day) => (
                        <button
                          key={day.value}
                          type="button"
                          onClick={() => {
                            const weekdays = recurrence.weekdays || [];
                            const newWeekdays = weekdays.includes(day.value)
                              ? weekdays.filter((d) => d !== day.value)
                              : [...weekdays, day.value];
                            setRecurrence({ ...recurrence, weekdays: newWeekdays });
                          }}
                          className={`w-8 h-8 rounded-full text-sm ${
                            recurrence.weekdays?.includes(day.value)
                              ? "bg-primary-600 text-white"
                              : "bg-slate-600 text-slate-300"
                          }`}
                        >
                          {day.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {recurrence && (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm text-slate-300 mb-1">Termina em</label>
                      <input
                        type="date"
                        value={recurrence.endDate?.split("T")[0] || ""}
                        onChange={(e) =>
                          setRecurrence({
                            ...recurrence,
                            endDate: e.target.value ? new Date(e.target.value).toISOString() : undefined,
                            count: undefined,
                          })
                        }
                        className="w-full rounded-lg border border-slate-600 bg-slate-600 px-3 py-2 text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-sm text-slate-300 mb-1">Ou apos (vezes)</label>
                      <input
                        type="number"
                        min="1"
                        value={recurrence.count || ""}
                        onChange={(e) =>
                          setRecurrence({
                            ...recurrence,
                            count: e.target.value ? parseInt(e.target.value) : undefined,
                            endDate: undefined,
                          })
                        }
                        placeholder="Ex: 10"
                        className="w-full rounded-lg border border-slate-600 bg-slate-600 px-3 py-2 text-white"
                      />
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Attendees */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">
              Participantes
            </label>

            {/* Selected members */}
            {selectedMembers.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-2">
                {selectedMembers.map((userId) => {
                  const member = teamMembers.find((m) => m.user_id === userId);
                  return (
                    <span
                      key={userId}
                      className="flex items-center gap-1 bg-primary-600/30 text-primary-300 px-2 py-1 rounded-full text-sm"
                    >
                      {member?.display_name || userId}
                      <button
                        type="button"
                        onClick={() => toggleMember(userId)}
                        className="hover:text-white"
                      >
                        <X size={14} />
                      </button>
                    </span>
                  );
                })}
              </div>
            )}

            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar membros..."
                className="w-full rounded-lg border border-slate-600 bg-slate-700 py-2 pl-10 pr-4 text-white placeholder-slate-400 focus:border-primary-500 focus:outline-none"
              />
            </div>

            {/* Members list */}
            <div className="mt-2 max-h-40 overflow-y-auto space-y-1">
              {isLoading ? (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="h-5 w-5 animate-spin text-primary-500" />
                </div>
              ) : filteredMembers.length === 0 ? (
                <p className="text-center text-slate-400 py-2 text-sm">
                  Nenhum membro encontrado
                </p>
              ) : (
                filteredMembers.map((member) => (
                  <button
                    key={member.user_id}
                    type="button"
                    onClick={() => toggleMember(member.user_id)}
                    className="flex w-full items-center gap-3 rounded-lg p-2 hover:bg-slate-700"
                  >
                    <div
                      className={`flex h-5 w-5 items-center justify-center rounded border ${
                        selectedMembers.includes(member.user_id)
                          ? "border-primary-500 bg-primary-600"
                          : "border-slate-500"
                      }`}
                    >
                      {selectedMembers.includes(member.user_id) && (
                        <Check size={12} className="text-white" />
                      )}
                    </div>
                    {member.avatar_url ? (
                      <img
                        src={member.avatar_url}
                        alt={member.display_name}
                        className="h-8 w-8 rounded-full object-cover"
                      />
                    ) : (
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-600">
                        <User size={16} className="text-slate-300" />
                      </div>
                    )}
                    <span className="text-white">{member.display_name}</span>
                  </button>
                ))
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-4 border-t border-slate-700">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-slate-300 hover:text-white"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={!title.trim() || !date || !time || isCreating}
              className="flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-white hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isCreating ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plus size={18} />
              )}
              Criar Reuniao
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
