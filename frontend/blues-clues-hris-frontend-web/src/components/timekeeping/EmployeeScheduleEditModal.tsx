"use client";

import { useEffect, useMemo, useState } from "react";
import { X, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { authFetch } from "@/lib/authApi";
import { API_BASE_URL } from "@/lib/api";

// ─── Types ────────────────────────────────────────────────────────────────────

type HalfDayMode = "none" | "am" | "pm";

const WEEKDAYS = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];
const WEEKDAY_LABELS: Record<string, string> = {
  MON: "M", TUE: "T", WED: "W", THU: "T", FRI: "F", SAT: "S", SUN: "S",
};
const WEEKDAY_FULL: Record<string, string> = {
  MON: "Mon", TUE: "Tue", WED: "Wed", THU: "Thu", FRI: "Fri", SAT: "Sat", SUN: "Sun",
};

type QuickTemplate = {
  id: string;
  label: string;
  startTime: string;
  endTime: string;
  breakStart: string;
  breakEnd: string;
  isNightShift: boolean;
};

const QUICK_TEMPLATES: QuickTemplate[] = [
  { id: "std",     label: "Standard (9:00 AM-6:00 PM)", startTime: "09:00", endTime: "18:00", breakStart: "12:00", breakEnd: "13:00", isNightShift: false },
  { id: "early",   label: "Early (7:00 AM-4:00 PM)", startTime: "07:00", endTime: "16:00", breakStart: "11:00", breakEnd: "12:00", isNightShift: false },
  { id: "night",   label: "Night Shift (9:00 PM-6:00 AM)", startTime: "21:00", endTime: "06:00", breakStart: "01:00", breakEnd: "02:00", isNightShift: true  },
  { id: "custom",  label: "Custom",         startTime: "09:00", endTime: "18:00", breakStart: "12:00", breakEnd: "13:00", isNightShift: false },
];

// ─── Component ────────────────────────────────────────────────────────────────

export function EmployeeScheduleEditModal({
  employeeId,
  employeeName,
  currentSchedule,
  readOnly = false,
  effectiveLabel,
  onClose,
  onSaved,
}: Readonly<{
  employeeId: string;
  employeeName: string;
  currentSchedule: {
    start_time: string;
    end_time: string;
    break_start?: string | null;
    break_end?: string | null;
    workdays: string[] | string;
    is_nightshift: boolean;
    updated_at?: string | null;
    updated_by_name?: string | null;
    schedule_source?: "bulk" | "department" | "individual" | "default" | null;
  } | null;
  readOnly?: boolean;
  effectiveLabel?: string;
  onClose: () => void;
  onSaved?: () => void;
}>) {
  const parseWorkdays = (wd: string[] | string): string[] =>
    typeof wd === "string" ? wd.toUpperCase().split(",").map(s => s.trim()) : wd.map(s => s.toUpperCase().trim());
  const formatScheduleClock = (value: string | null | undefined): string => {
    if (!value) return "-";
    const match = value.match(/^(\d{1,2}):(\d{2})/);
    if (!match) return value;
    const hours = Number.parseInt(match[1], 10);
    if (Number.isNaN(hours)) return value;
    const mins = match[2];
    const suffix = hours >= 12 ? "PM" : "AM";
    const hour12 = hours % 12 === 0 ? 12 : hours % 12;
    return `${hour12}:${mins} ${suffix}`;
  };

  const weekdayFallback = ["MON","TUE","WED","THU","FRI"];

  const [templateId,   setTemplateId]   = useState("custom");
  const [startTime,    setStartTime]    = useState(currentSchedule?.start_time ?? "09:00");
  const [endTime,      setEndTime]      = useState(currentSchedule?.end_time ?? "18:00");
  const [breakStart,   setBreakStart]   = useState(currentSchedule?.break_start ?? "12:00");
  const [breakEnd,     setBreakEnd]     = useState(currentSchedule?.break_end ?? "13:00");
  const [workdays,     setWorkdays]     = useState<string[]>(
    currentSchedule ? parseWorkdays(currentSchedule.workdays) : weekdayFallback
  );
  const [isNightShift, setIsNightShift] = useState(currentSchedule?.is_nightshift ?? false);
  const [halfDay,      setHalfDay]      = useState<HalfDayMode>("none");
  const [submitting,   setSubmitting]   = useState(false);
  const [done,         setDone]         = useState(false);
  const [saveError,    setSaveError]    = useState<string | null>(null);
  const [loadingSchedule, setLoadingSchedule] = useState(!currentSchedule);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [hasAssignedSchedule, setHasAssignedSchedule] = useState(Boolean(currentSchedule));
  const [updatedAt, setUpdatedAt] = useState<string | null>(currentSchedule?.updated_at ?? null);
  const [updatedBy, setUpdatedBy] = useState<string | null>(currentSchedule?.updated_by_name ?? null);
  const [scheduleSource, setScheduleSource] = useState<"bulk" | "department" | "individual" | "default" | null>(
    currentSchedule?.schedule_source ?? null
  );

  const hydrateSchedule = (schedule: {
    start_time?: string | null;
    end_time?: string | null;
    break_start?: string | null;
    break_end?: string | null;
    workdays?: string[] | string | null;
    is_nightshift?: boolean | null;
    updated_at?: string | null;
    updated_by_name?: string | null;
    schedule_source?: "bulk" | "department" | "individual" | "default" | null;
  } | null) => {
    setHasAssignedSchedule(Boolean(schedule));
    setStartTime(schedule?.start_time ?? "09:00");
    setEndTime(schedule?.end_time ?? "18:00");
    setBreakStart(schedule?.break_start ?? "12:00");
    setBreakEnd(schedule?.break_end ?? "13:00");
    setWorkdays(
      schedule?.workdays
        ? parseWorkdays(schedule.workdays).filter(Boolean)
        : weekdayFallback
    );
    setIsNightShift(Boolean(schedule?.is_nightshift));
    setUpdatedAt(schedule?.updated_at ?? null);
    setUpdatedBy(schedule?.updated_by_name ?? null);
    setScheduleSource(schedule?.schedule_source ?? null);
    setHalfDay("none");
    setTemplateId("custom");
  };

  useEffect(() => {
    let cancelled = false;

    if (currentSchedule) {
      hydrateSchedule(currentSchedule);
      setLoadingSchedule(false);
      setLoadError(null);
      return;
    }

    setLoadingSchedule(true);
    setLoadError(null);

    authFetch(`${API_BASE_URL}/timekeeping/employees/${employeeId}/schedule`)
      .then(async (r) => {
        if (!r.ok) {
          const err = await r.json().catch(() => ({} as { message?: string }));
          throw new Error(err.message || "Failed to load schedule.");
        }
        const raw = await r.text();
        if (!raw) return null;
        try {
          return JSON.parse(raw) as unknown;
        } catch {
          return null;
        }
      })
      .then((data) => {
        if (cancelled) return;
        hydrateSchedule((data ?? null) as any);
        setLoadError(null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setLoadError(
          err instanceof Error ? err.message : "Failed to load schedule.",
        );
      })
      .finally(() => {
        if (!cancelled) setLoadingSchedule(false);
      });

    return () => { cancelled = true; };
  }, [employeeId, currentSchedule]);

  const formattedUpdatedAt = useMemo(() => {
    if (!updatedAt) return null;
    try {
      return new Date(updatedAt).toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      });
    } catch {
      return null;
    }
  }, [updatedAt]);

  const applyTemplate = (id: string) => {
    if (readOnly) return;
    setTemplateId(id);
    const t = QUICK_TEMPLATES.find(q => q.id === id);
    if (t && id !== "custom") {
      setStartTime(t.startTime);
      setEndTime(t.endTime);
      setBreakStart(t.breakStart);
      setBreakEnd(t.breakEnd);
      setIsNightShift(t.isNightShift);
      setHalfDay("none");
    }
  };

  const applyHalfDay = (mode: HalfDayMode) => {
    if (readOnly) return;
    setHalfDay(mode);
    if (mode === "am") { setStartTime("09:00"); setEndTime("13:00"); setBreakStart("12:00"); setBreakEnd("12:30"); }
    if (mode === "pm") { setStartTime("13:00"); setEndTime("18:00"); setBreakStart("15:30"); setBreakEnd("16:00"); }
    if (mode === "none") { setStartTime("09:00"); setEndTime("18:00"); setBreakStart("12:00"); setBreakEnd("13:00"); }
  };

  const toggleDay = (day: string) => {
    if (readOnly) return;
    setWorkdays(prev => prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]);
  };

  const handleSave = async () => {
    if (readOnly) return;
    setSaveError(null);
    setSubmitting(true);
    try {
      const res = await authFetch(
        `${API_BASE_URL}/timekeeping/employees/${employeeId}/schedule`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            start_time: startTime,
            end_time: endTime,
            break_start: breakStart,
            break_end: breakEnd,
            workdays: workdays.join(","),
            is_nightshift: isNightShift,
          }),
        },
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { message?: string };
        throw new Error(err?.message || "Failed to save schedule.");
      }
      setDone(true);
      onSaved?.();
    } catch (e: unknown) {
      setSaveError(e instanceof Error ? e.message : "An error occurred.");
    } finally {
      setSubmitting(false);
    }
  };

  if (done) {
    return (
      <div className="fixed inset-0 z-70 flex items-center justify-center bg-black/40 backdrop-blur-sm">
        <div className="bg-card border border-border rounded-2xl shadow-2xl p-8 max-w-sm w-full mx-4 text-center animate-in fade-in duration-300">
          <div className="h-14 w-14 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 className="h-7 w-7 text-green-600" />
          </div>
          <h3 className="text-lg font-bold mb-1">Schedule Updated</h3>
          <p className="text-sm text-muted-foreground mb-6">
            {employeeName}'s schedule has been saved successfully.
          </p>
          <Button onClick={onClose} className="w-full">Done</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-70 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-md mx-4 animate-in fade-in duration-300 flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0 gap-3">
          <div>
            <h2 className="text-base font-bold">{readOnly ? "View Schedule" : "Edit Schedule"}</h2>
            <p className="text-xs text-muted-foreground font-mono mt-0.5">{employeeName} - {employeeId}</p>
          </div>
          {readOnly && (
            <span className="text-[10px] font-bold uppercase tracking-widest bg-blue-100 text-blue-700 border border-blue-200 px-2 py-1 rounded-md">
              View only
            </span>
          )}
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-muted transition-colors cursor-pointer">
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 p-5 space-y-4">
          {(effectiveLabel || readOnly || updatedBy || formattedUpdatedAt || scheduleSource) && (
            <div className="p-3 rounded-lg border border-border bg-muted/20 space-y-1.5">
              {effectiveLabel && (
                <p className="text-xs text-muted-foreground">
                  Effective: <span className="font-semibold text-foreground">{effectiveLabel}</span>
                </p>
              )}
              {scheduleSource && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Source:</span>
                  {scheduleSource === "individual" ? (
                    <span className="text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-md bg-violet-100 text-violet-700 border border-violet-200">
                      Custom (Individual)
                    </span>
                  ) : scheduleSource === "department" ? (
                    <span className="text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-700 border border-emerald-200">
                      Department
                    </span>
                  ) : scheduleSource === "bulk" ? (
                    <span className="text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-md bg-sky-100 text-sky-700 border border-sky-200">
                      Standard (Bulk)
                    </span>
                  ) : (
                    <span className="text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-md bg-slate-100 text-slate-500 border border-slate-200">
                      Default
                    </span>
                  )}
                </div>
              )}
              {readOnly && (
                <p className="text-xs text-blue-700">View only: editing is limited to HR and System Admin.</p>
              )}
              {(updatedBy || formattedUpdatedAt) && (
                <p className="text-xs text-muted-foreground">
                  Last updated {formattedUpdatedAt ?? "recently"}{updatedBy ? ` by ${updatedBy}` : ""}
                </p>
              )}
            </div>
          )}

          {loadingSchedule && (
            <div className="p-4 rounded-lg border border-border text-sm text-muted-foreground">
              Loading schedule...
            </div>
          )}

          {loadError && (
            <div className="p-3 rounded-lg border border-red-200 bg-red-50 text-xs text-red-700">
              {loadError}
            </div>
          )}

          {readOnly && !loadingSchedule && !loadError && !hasAssignedSchedule && (
            <div className="p-4 rounded-lg border border-border text-sm text-muted-foreground">
              No schedule assigned for this employee in the selected period.
            </div>
          )}

          {/* Quick templates */}
          <div>
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-2">Quick Template</p>
            <div className="grid grid-cols-2 gap-2">
              {QUICK_TEMPLATES.map(t => (
                <button
                  key={t.id}
                  onClick={() => !readOnly && applyTemplate(t.id)}
                  disabled={readOnly || loadingSchedule}
                  className={[
                    "px-3 py-2 rounded-lg border text-xs font-semibold transition-all cursor-pointer text-left",
                    templateId === t.id
                      ? "bg-primary/5 border-primary text-primary"
                      : "border-border text-muted-foreground hover:border-primary/50",
                    readOnly ? "opacity-60 cursor-not-allowed" : "",
                  ].join(" ")}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Half-day */}
          <div>
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-2">Half Day</p>
            <div className="flex gap-2">
              {(["none", "am", "pm"] as HalfDayMode[]).map(m => (
                <button
                  key={m}
                  onClick={() => !readOnly && applyHalfDay(m)}
                  disabled={readOnly || loadingSchedule}
                  className={[
                    "flex-1 py-1.5 rounded-lg border text-xs font-bold transition-all cursor-pointer",
                    halfDay === m
                      ? "bg-primary text-primary-foreground border-primary"
                      : "border-border text-muted-foreground hover:border-primary/50",
                    readOnly ? "opacity-60 cursor-not-allowed" : "",
                  ].join(" ")}
                >
                  {m === "none" ? "Full Day" : m === "am" ? "AM Half" : "PM Half"}
                </button>
              ))}
            </div>
          </div>

          {/* Time fields */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Start Time</label>
              <Input type="time" value={startTime} disabled={readOnly || loadingSchedule} onChange={e => { setStartTime(e.target.value); setTemplateId("custom"); }} className="h-9 text-sm" />
              <p className="text-[10px] text-muted-foreground mt-1">{formatScheduleClock(startTime)}</p>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">End Time</label>
              <Input type="time" value={endTime} disabled={readOnly || loadingSchedule} onChange={e => { setEndTime(e.target.value); setTemplateId("custom"); }} className="h-9 text-sm" />
              <p className="text-[10px] text-muted-foreground mt-1">{formatScheduleClock(endTime)}</p>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Break Start</label>
              <Input type="time" value={breakStart} disabled={readOnly || loadingSchedule} onChange={e => setBreakStart(e.target.value)} className="h-9 text-sm" />
              <p className="text-[10px] text-muted-foreground mt-1">{formatScheduleClock(breakStart)}</p>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Break End</label>
              <Input type="time" value={breakEnd} disabled={readOnly || loadingSchedule} onChange={e => setBreakEnd(e.target.value)} className="h-9 text-sm" />
              <p className="text-[10px] text-muted-foreground mt-1">{formatScheduleClock(breakEnd)}</p>
            </div>
          </div>

          {/* Work days */}
          <div>
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-2">Work Days</p>
            <div className="flex gap-1.5">
              {WEEKDAYS.map(d => (
                <button
                  key={d}
                  onClick={() => !readOnly && toggleDay(d)}
                  title={WEEKDAY_FULL[d]}
                  disabled={readOnly || loadingSchedule}
                  className={[
                    "h-9 w-9 rounded-full text-xs font-bold transition-all cursor-pointer border",
                    workdays.includes(d)
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-background text-muted-foreground border-border hover:border-primary/50",
                    readOnly ? "opacity-60 cursor-not-allowed" : "",
                  ].join(" ")}
                >
                  {WEEKDAY_LABELS[d]}
                </button>
              ))}
            </div>
          </div>

          {/* Night shift toggle */}
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={isNightShift}
              disabled={readOnly || loadingSchedule}
              onChange={e => setIsNightShift(e.target.checked)}
              className="h-4 w-4 rounded border-border"
            />
            <span className="text-sm text-foreground font-medium">Night Shift</span>
            <span className="text-xs text-muted-foreground">(schedule crosses midnight)</span>
          </label>

          {/* Summary preview */}
          <div className="p-3.5 rounded-xl bg-primary/5 border border-primary/15 text-sm space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Schedule Preview</p>
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md border border-primary/30 text-primary bg-primary/10">
                {isNightShift ? "Night Shift" : "Day Shift"}
              </span>
            </div>
            <div className="flex items-center gap-2 font-semibold text-foreground">
              <span>{formatScheduleClock(startTime)}</span>
              <span className="text-muted-foreground text-xs">-&gt;</span>
              <span>{formatScheduleClock(endTime)}</span>
              {isNightShift && (
                <span className="text-[9px] bg-indigo-100 text-indigo-700 border border-indigo-200 px-1.5 py-0.5 rounded font-bold">Night</span>
              )}
              {halfDay !== "none" && (
                <span className="text-[9px] bg-amber-100 text-amber-700 border border-amber-200 px-1.5 py-0.5 rounded font-bold uppercase">{halfDay} Half</span>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Break: {formatScheduleClock(breakStart)} - {formatScheduleClock(breakEnd)}
            </p>
            <div className="flex flex-wrap gap-1">
              {WEEKDAYS.filter(d => workdays.includes(d)).map(d => (
                <span key={d} className="px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide bg-background border border-border text-foreground">
                  {WEEKDAY_FULL[d]}
                </span>
              ))}
              {WEEKDAYS.filter(d => workdays.includes(d)).length === 0 && (
                <span className="text-xs text-muted-foreground">No workdays selected.</span>
              )}
            </div>
          </div>

        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-border shrink-0 bg-muted/10 space-y-2">
          {saveError && !readOnly && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {saveError}
            </p>
          )}
          {readOnly ? (
            <div className="flex items-center justify-end">
              <Button variant="outline" onClick={onClose} className="cursor-pointer">Close</Button>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-3">
              <Button variant="outline" onClick={onClose} className="cursor-pointer">Cancel</Button>
              <Button onClick={handleSave} disabled={submitting || loadingSchedule || workdays.length === 0} className="gap-2 cursor-pointer">
                {submitting ? (
                  <><div className="h-3.5 w-3.5 rounded-full border-2 border-primary-foreground/30 border-t-primary-foreground animate-spin" /> Saving...</>
                ) : "Save Schedule"}
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}


