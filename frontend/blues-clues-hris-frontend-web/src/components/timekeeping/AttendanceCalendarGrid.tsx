"use client";

import { useState, useEffect } from "react";
import { CalendarDays, CalendarRange, Clock, ChevronLeft, ChevronRight } from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

export type CalendarDayStatus =
  | "present"
  | "late"
  | "absent"
  | "future"
  | "no-schedule"
  | null;

export type CalendarDayData = {
  date: string; // YYYY-MM-DD
  status: CalendarDayStatus;
  timeIn?: string | null;
  timeOut?: string | null;
  hoursWorked?: number | null;
  absenceReason?: string | null;
};

export type CalendarViewMode = "month" | "week" | "day";

interface AttendanceCalendarGridProps {
  mode: CalendarViewMode;
  referenceDate: Date;
  days: CalendarDayData[];
  onDayClick?: (date: string, data: CalendarDayData | null) => void;
  showModeToggle?: boolean;
  onModeChange?: (mode: CalendarViewMode) => void;
  /** When provided, adds prev/next arrows + a clickable month/year label that opens an inline month/year picker */
  onNavigate?: (newRef: Date) => void;
  loading?: boolean;
}

const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// ─── Status config ────────────────────────────────────────────────────────────

const STATUS_CELL: Record<
  NonNullable<CalendarDayStatus>,
  { cell: string; dot: string; label: string }
> = {
  present:      { cell: "bg-green-100 border-green-300 text-green-800",   dot: "bg-green-500",   label: "Present"     },
  late:         { cell: "bg-amber-100 border-amber-300 text-amber-800",   dot: "bg-amber-500",   label: "Late"        },
  absent:       { cell: "bg-red-100 border-red-300 text-red-800",         dot: "bg-red-500",     label: "Absent"      },
  future:       { cell: "bg-background border-border/50 text-muted-foreground opacity-50",dot: "bg-muted", label: "Future"  },
  "no-schedule":{ cell: "bg-slate-50 border-slate-200 text-slate-400",   dot: "bg-slate-300",   label: "No Schedule" },
};

const WEEKDAY_HEADERS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const WEEKDAY_SHORT   = ["S", "M", "T", "W", "T", "F", "S"];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function toLocaleDateStr(date: Date): string {
  return date.toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });
}

function parseTs(ts: string): Date {
  return new Date(ts.includes("Z") || ts.includes("+") ? ts : ts + "Z");
}

function formatTimeShort(ts: string): string {
  return parseTs(ts).toLocaleTimeString("en-US", {
    hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Asia/Manila",
  });
}

function buildMonthMatrix(year: number, month: number): (string | null)[] {
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (string | null)[] = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push(
      `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`
    );
  }
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

function buildWeekDates(ref: Date): string[] {
  const day = ref.getDay();
  const sunday = new Date(ref);
  sunday.setDate(ref.getDate() - day);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(sunday);
    d.setDate(sunday.getDate() + i);
    return toLocaleDateStr(d);
  });
}

// ─── Sub-renderers ────────────────────────────────────────────────────────────

function DayCell({
  dateStr,
  data,
  compact,
  onClick,
}: {
  dateStr: string;
  data: CalendarDayData | null;
  compact?: boolean;
  onClick?: () => void;
}) {
  const today = toLocaleDateStr(new Date());
  const isToday = dateStr === today;
  const status = data?.status ?? null;
  const cfg = status ? STATUS_CELL[status] : null;

  return (
    <button
      onClick={onClick}
      className={[
        "relative flex flex-col rounded-xl border transition-all duration-150 text-left",
        onClick ? "cursor-pointer hover:shadow-md hover:scale-[1.02]" : "cursor-default",
        compact ? "p-1.5 min-h-[3.5rem]" : "p-3 min-h-[5.5rem]",
        cfg ? cfg.cell : "bg-background border-border/50 text-muted-foreground",
        isToday ? "ring-2 ring-primary ring-offset-1" : "",
      ].join(" ")}
    >
      {/* Day number */}
      <span className={[
        "font-bold leading-none",
        compact ? "text-xs" : "text-sm",
        isToday ? "text-primary" : "",
      ].join(" ")}>
        {Number(dateStr.split("-")[2])}
      </span>

      {/* Status dot */}
      {cfg && (
        <span className={`absolute top-1.5 right-1.5 h-1.5 w-1.5 rounded-full ${cfg.dot}`} />
      )}

      {/* Time snippet */}
      {!compact && data?.timeIn && (
        <span className="mt-auto text-[10px] font-medium leading-none opacity-80 truncate">
          {formatTimeShort(data.timeIn)}
        </span>
      )}

      {/* Hours badge */}
      {!compact && data?.hoursWorked != null && data.hoursWorked > 0 && (
        <span className="mt-0.5 text-[9px] font-bold leading-none opacity-70">
          {data.hoursWorked.toFixed(1)}h
        </span>
      )}
    </button>
  );
}

// ─── Month View ───────────────────────────────────────────────────────────────

function MonthView({
  referenceDate,
  days,
  onDayClick,
}: {
  referenceDate: Date;
  days: CalendarDayData[];
  onDayClick?: (date: string, data: CalendarDayData | null) => void;
}) {
  const year  = referenceDate.getFullYear();
  const month = referenceDate.getMonth();
  const cells = buildMonthMatrix(year, month);
  const dayMap = Object.fromEntries(days.map(d => [d.date, d]));

  return (
    <div>
      {/* Day-of-week headers */}
      <div className="grid grid-cols-7 mb-1">
        {WEEKDAY_HEADERS.map(h => (
          <div key={h} className="text-center text-[10px] font-bold text-muted-foreground uppercase tracking-widest py-1">
            {h}
          </div>
        ))}
      </div>

      {/* Calendar cells */}
      <div className="grid grid-cols-7 gap-1">
        {cells.map((dateStr, i) => (
          dateStr ? (
            <DayCell
              key={dateStr}
              dateStr={dateStr}
              data={dayMap[dateStr] ?? null}
              compact
              onClick={onDayClick ? () => onDayClick(dateStr, dayMap[dateStr] ?? null) : undefined}
            />
          ) : (
            <div key={`blank-${i}`} className="min-h-[3.5rem]" />
          )
        ))}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3 mt-4 pt-3 border-t border-border">
        {(["present", "late", "absent", "no-schedule", "future"] as CalendarDayStatus[]).map(s => {
          const cfg = STATUS_CELL[s!];
          return (
            <div key={s} className="flex items-center gap-1.5">
              <span className={`h-2.5 w-2.5 rounded-full ${cfg.dot}`} />
              <span className="text-[10px] text-muted-foreground font-medium">{cfg.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Week View ────────────────────────────────────────────────────────────────

function WeekView({
  referenceDate,
  days,
  onDayClick,
}: {
  referenceDate: Date;
  days: CalendarDayData[];
  onDayClick?: (date: string, data: CalendarDayData | null) => void;
}) {
  const weekDates = buildWeekDates(referenceDate);
  const today     = toLocaleDateStr(new Date());
  const dayMap    = Object.fromEntries(days.map(d => [d.date, d]));

  return (
    <div className="grid grid-cols-7 gap-2">
      {weekDates.map((dateStr, i) => {
        const data   = dayMap[dateStr] ?? null;
        const status = data?.status ?? null;
        const cfg    = status ? STATUS_CELL[status] : null;
        const isToday = dateStr === today;
        const dayNum  = Number(dateStr.split("-")[2]);

        return (
          <button
            key={dateStr}
            onClick={onDayClick ? () => onDayClick(dateStr, data) : undefined}
            className={[
              "flex flex-col items-center rounded-xl border p-3 min-h-[8rem] transition-all",
              onDayClick ? "cursor-pointer hover:shadow-md" : "cursor-default",
              cfg ? cfg.cell : "bg-background border-border/50 text-muted-foreground",
              isToday ? "ring-2 ring-primary ring-offset-1" : "",
            ].join(" ")}
          >
            {/* Day label */}
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
              {WEEKDAY_SHORT[i]}
            </span>
            <span className={`text-lg font-bold leading-tight ${isToday ? "text-primary" : ""}`}>
              {dayNum}
            </span>

            {/* Status dot */}
            {cfg && (
              <span className={`h-2 w-2 rounded-full ${cfg.dot} mt-1`} />
            )}

            {/* Times */}
            {data?.timeIn && (
              <span className="text-[10px] font-medium mt-2 leading-none">
                {formatTimeShort(data.timeIn)}
              </span>
            )}
            {data?.timeOut && (
              <span className="text-[10px] text-muted-foreground leading-none mt-0.5">
                {formatTimeShort(data.timeOut)}
              </span>
            )}
            {data?.hoursWorked != null && data.hoursWorked > 0 && (
              <span className="mt-auto text-[9px] font-bold opacity-70">
                {data.hoursWorked.toFixed(1)}h
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// ─── Day View ─────────────────────────────────────────────────────────────────

function DayView({
  referenceDate,
  days,
}: {
  referenceDate: Date;
  days: CalendarDayData[];
}) {
  const dateStr = toLocaleDateStr(referenceDate);
  const data    = days.find(d => d.date === dateStr) ?? null;
  const status  = data?.status ?? null;
  const cfg     = status ? STATUS_CELL[status] : null;

  const longDate = referenceDate.toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric", year: "numeric",
    timeZone: "Asia/Manila",
  });

  const durationStr = (() => {
    if (!data?.timeIn || !data?.timeOut) return null;
    const diff = parseTs(data.timeOut).getTime() - parseTs(data.timeIn).getTime();
    const h = Math.floor(diff / 3_600_000);
    const m = Math.floor((diff % 3_600_000) / 60_000);
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  })();

  return (
    <div className={`rounded-2xl border p-6 ${cfg ? cfg.cell : "bg-muted/10 border-border"}`}>
      <div className="flex items-start justify-between mb-5">
        <div>
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1">
            Attendance Record
          </p>
          <h3 className="text-lg font-bold text-foreground">{longDate}</h3>
        </div>
        {cfg && (
          <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full border ${cfg.cell}`}>
            {cfg.label}
          </span>
        )}
      </div>

      {!data || (!data.timeIn && !data.absenceReason) ? (
        <p className="text-sm text-muted-foreground text-center py-4">
          {status === "future"
            ? "No records yet for this future date."
            : status === "no-schedule"
              ? "No schedule or attendance record for this day."
              : "No attendance recorded for this day."}
        </p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="space-y-0.5">
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Clock In</p>
            <p className="text-base font-bold">{data.timeIn ? formatTimeShort(data.timeIn) : "—"}</p>
          </div>
          <div className="space-y-0.5">
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Clock Out</p>
            <p className="text-base font-bold">{data.timeOut ? formatTimeShort(data.timeOut) : "—"}</p>
          </div>
          <div className="space-y-0.5">
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Duration</p>
            <p className="text-base font-bold">{durationStr ?? "—"}</p>
          </div>
          <div className="space-y-0.5">
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Hours</p>
            <p className="text-base font-bold">{data.hoursWorked != null ? `${data.hoursWorked.toFixed(2)}h` : "—"}</p>
          </div>
          {data.absenceReason && (
            <div className="col-span-2 sm:col-span-4 space-y-0.5">
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Absence Reason</p>
              <p className="text-sm font-medium">{data.absenceReason}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function AttendanceCalendarGrid({
  mode,
  referenceDate,
  days,
  onDayClick,
  showModeToggle = true,
  onModeChange,
  onNavigate,
  loading = false,
}: AttendanceCalendarGridProps) {
  // ── Inline month/year picker state ────────────────────────────────────────
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerYear, setPickerYear] = useState(referenceDate.getFullYear());

  // Close picker and sync year when referenceDate changes externally
  useEffect(() => {
    setPickerOpen(false);
    setPickerYear(referenceDate.getFullYear());
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [referenceDate.getFullYear(), referenceDate.getMonth()]);

  function handlePickMonth(month: number) {
    onNavigate?.(new Date(pickerYear, month, 1));
    setPickerOpen(false);
  }

  const monthYearLabel = referenceDate.toLocaleDateString("en-US", {
    month: "long", year: "numeric",
  });

  if (loading) {
    return (
      <div className="space-y-2">
        {showModeToggle && <div className="h-9 w-56 rounded-lg bg-muted animate-pulse" />}
        <div className="grid grid-cols-7 gap-1 mt-3">
          {Array.from({ length: 35 }).map((_, i) => (
            <div key={i} className="min-h-[3.5rem] rounded-xl bg-muted animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* ── Top bar: mode toggle + (optional) month/year nav ─────────────── */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        {/* Mode toggle */}
        {showModeToggle && onModeChange && (
          <div className="flex items-center gap-1 p-1 bg-muted/30 rounded-lg w-fit border border-border">
            {([
              { m: "month" as CalendarViewMode, icon: CalendarDays, label: "Month" },
              { m: "week"  as CalendarViewMode, icon: CalendarRange, label: "Week" },
              { m: "day"   as CalendarViewMode, icon: Clock,         label: "Day" },
            ]).map(({ m, icon: Icon, label }) => (
              <button
                key={m}
                onClick={() => { onModeChange(m); setPickerOpen(false); }}
                className={[
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all cursor-pointer",
                  mode === m
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                ].join(" ")}
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
              </button>
            ))}
          </div>
        )}

        {/* Month/year navigation (only when onNavigate is provided) */}
        {onNavigate && (
          <div className="flex items-center gap-1">
            <button
              onClick={() => onNavigate(new Date(referenceDate.getFullYear(), referenceDate.getMonth() - 1, 1))}
              className="h-7 w-7 flex items-center justify-center rounded-lg border border-border hover:bg-muted/60 transition-colors cursor-pointer text-muted-foreground"
              aria-label="Previous month"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>

            {/* Clickable month/year label — opens inline picker */}
            <button
              onClick={() => { setPickerOpen(v => !v); setPickerYear(referenceDate.getFullYear()); }}
              className={[
                "h-7 px-3 flex items-center gap-1 rounded-lg border text-xs font-semibold transition-colors cursor-pointer",
                pickerOpen
                  ? "bg-primary text-primary-foreground border-primary"
                  : "border-border hover:bg-muted/60 text-foreground",
              ].join(" ")}
              title="Click to jump to a month or year"
            >
              {monthYearLabel}
              <span className={`text-[9px] leading-none ${pickerOpen ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
                {pickerOpen ? "▴" : "▾"}
              </span>
            </button>

            <button
              onClick={() => onNavigate(new Date(referenceDate.getFullYear(), referenceDate.getMonth() + 1, 1))}
              className="h-7 w-7 flex items-center justify-center rounded-lg border border-border hover:bg-muted/60 transition-colors cursor-pointer text-muted-foreground"
              aria-label="Next month"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* ── Inline month/year picker ──────────────────────────────────────── */}
      {pickerOpen && onNavigate && (
        <div className="rounded-2xl border border-border bg-muted/10 p-4 animate-in fade-in slide-in-from-top-1 duration-200">
          {/* Year selector */}
          <div className="flex items-center justify-between mb-3">
            <button
              onClick={() => setPickerYear(y => y - 1)}
              className="h-7 w-7 flex items-center justify-center rounded-lg hover:bg-muted transition-colors cursor-pointer text-muted-foreground"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="font-bold text-sm text-foreground">{pickerYear}</span>
            <button
              onClick={() => setPickerYear(y => y + 1)}
              className="h-7 w-7 flex items-center justify-center rounded-lg hover:bg-muted transition-colors cursor-pointer text-muted-foreground"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          {/* 3×4 month grid */}
          <div className="grid grid-cols-3 gap-2">
            {MONTHS_SHORT.map((m, i) => {
              const isSelected =
                pickerYear === referenceDate.getFullYear() && i === referenceDate.getMonth();
              return (
                <button
                  key={m}
                  onClick={() => handlePickMonth(i)}
                  className={[
                    "rounded-xl py-2 text-sm font-semibold transition-all duration-150 cursor-pointer",
                    isSelected
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-foreground hover:bg-primary/10 hover:text-primary",
                  ].join(" ")}
                >
                  {m}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Calendar content ─────────────────────────────────────────────── */}
      {!pickerOpen && mode === "month" && (
        <MonthView referenceDate={referenceDate} days={days} onDayClick={onDayClick} />
      )}
      {!pickerOpen && mode === "week" && (
        <WeekView referenceDate={referenceDate} days={days} onDayClick={onDayClick} />
      )}
      {!pickerOpen && mode === "day" && (
        <DayView referenceDate={referenceDate} days={days} />
      )}
    </div>
  );
}

