import { useState, useEffect, useCallback } from "react";
import type { Meeting } from "../../types/calendar";
import {
  getCalendarGridCached,
  type CalendarDay,
  type CalendarGrid as CalendarGridType,
} from "../../lib/rust-utils";

interface CalendarGridProps {
  selectedDate: Date;
  onDateSelect: (date: Date) => void;
  getMeetingsForDate: (date: Date) => Meeting[];
}

export function CalendarGrid({
  selectedDate,
  onDateSelect,
  getMeetingsForDate,
}: CalendarGridProps) {
  const [calendarGrid, setCalendarGrid] = useState<CalendarGridType | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const year = selectedDate.getFullYear();
  const month = selectedDate.getMonth() + 1; // Rust uses 1-12, JS uses 0-11

  // Load calendar grid from Rust backend
  useEffect(() => {
    let cancelled = false;

    const loadGrid = async () => {
      setIsLoading(true);
      try {
        const grid = await getCalendarGridCached(year, month);
        if (!cancelled) {
          setCalendarGrid(grid);
        }
      } catch (err) {
        console.error("Failed to load calendar grid:", err);
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    loadGrid();

    return () => {
      cancelled = true;
    };
  }, [year, month]);

  const handleDateClick = useCallback(
    (day: CalendarDay) => {
      const date = new Date(day.date);
      onDateSelect(date);
    },
    [onDateSelect]
  );

  const isSelected = useCallback(
    (day: CalendarDay) => {
      const dayDate = new Date(day.date);
      return dayDate.toDateString() === selectedDate.toDateString();
    },
    [selectedDate]
  );

  const weekDays = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

  if (isLoading || !calendarGrid) {
    return (
      <div className="bg-slate-800 rounded-lg p-4">
        <div className="grid grid-cols-7 gap-1 mb-2">
          {weekDays.map((day) => (
            <div
              key={day}
              className="text-center text-xs font-medium text-slate-400 py-2"
            >
              {day}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {Array.from({ length: 42 }).map((_, i) => (
            <div
              key={i}
              className="aspect-square rounded-lg bg-slate-700/30 animate-pulse"
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-slate-800 rounded-lg p-4">
      {/* Week day headers */}
      <div className="grid grid-cols-7 gap-1 mb-2">
        {weekDays.map((day) => (
          <div
            key={day}
            className="text-center text-xs font-medium text-slate-400 py-2"
          >
            {day}
          </div>
        ))}
      </div>

      {/* Calendar days */}
      <div className="grid grid-cols-7 gap-1">
        {calendarGrid.days.map((day, index) => {
          const dayDate = new Date(day.date);
          const dayMeetings = getMeetingsForDate(dayDate);
          const hasMeetings = dayMeetings.length > 0;
          const selected = isSelected(day);

          return (
            <button
              key={index}
              onClick={() => handleDateClick(day)}
              className={`
                relative aspect-square flex flex-col items-center justify-start p-1 rounded-lg transition-colors
                ${day.is_current_month ? "text-white" : "text-slate-600"}
                ${day.is_today ? "bg-primary-600/30 ring-1 ring-primary-500" : ""}
                ${selected && !day.is_today ? "bg-slate-700" : ""}
                ${!selected && !day.is_today ? "hover:bg-slate-700" : ""}
              `}
            >
              <span
                className={`text-sm ${day.is_today ? "font-bold text-primary-400" : ""}`}
              >
                {day.day}
              </span>

              {/* Meeting indicators */}
              {hasMeetings && (
                <div className="flex gap-0.5 mt-0.5 flex-wrap justify-center">
                  {dayMeetings.slice(0, 3).map((meeting, i) => (
                    <div
                      key={i}
                      className={`w-1.5 h-1.5 rounded-full ${
                        meeting.status === "ongoing"
                          ? "bg-green-500"
                          : "bg-primary-500"
                      }`}
                    />
                  ))}
                  {dayMeetings.length > 3 && (
                    <span className="text-[8px] text-slate-400">
                      +{dayMeetings.length - 3}
                    </span>
                  )}
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
