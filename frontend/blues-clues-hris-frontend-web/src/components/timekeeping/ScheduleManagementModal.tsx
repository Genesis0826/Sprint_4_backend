"use client";

import { useState, useMemo } from "react";
import { X, Building2, Globe, Clock, ChevronDown, CheckCircle2, Users, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { authFetch } from "@/lib/authApi";
import { API_BASE_URL } from "@/lib/api";

// ─── Types ────────────────────────────────────────────────────────────────────

type ApplyScope = "company" | "department" | "employees";

type ScheduleSeed = {
  start_time?: string | null;
  end_time?: string | null;
  break_start?: string | null;
  break_end?: string | null;
  workdays?: string | null;
  is_nightshift?: boolean | null;
};

export type ScheduleTemplate = {
  id: string;
  label: string;
  startTime: string;
  endTime: string;
  breakStart: string;
  breakEnd: string;
  workdays: string[];
  isNightShift: boolean;
};

const SCHEDULE_TEMPLATES: ScheduleTemplate[] = [
  { id: "standard",   label: "Standard (9:00 AM-6:00 PM)", startTime: "09:00", endTime: "18:00", breakStart: "12:00", breakEnd: "13:00", workdays: ["MON","TUE","WED","THU","FRI"], isNightShift: false },
  { id: "early",      label: "Early (7:00 AM-4:00 PM)", startTime: "07:00", endTime: "16:00", breakStart: "11:00", breakEnd: "12:00", workdays: ["MON","TUE","WED","THU","FRI"], isNightShift: false },
  { id: "late",       label: "Late Shift (12:00 PM-9:00 PM)", startTime: "12:00", endTime: "21:00", breakStart: "15:00", breakEnd: "16:00", workdays: ["MON","TUE","WED","THU","FRI"], isNightShift: false },
  { id: "night",      label: "Night Shift (9:00 PM-6:00 AM)", startTime: "21:00", endTime: "06:00", breakStart: "01:00", breakEnd: "02:00", workdays: ["MON","TUE","WED","THU","FRI"], isNightShift: true  },
  { id: "halfday_am", label: "Half Day AM (9:00 AM-1:00 PM)", startTime: "09:00", endTime: "13:00", breakStart: "11:30", breakEnd: "12:00", workdays: ["MON","TUE","WED","THU","FRI"], isNightShift: false },
  { id: "halfday_pm", label: "Half Day PM (1:00 PM-6:00 PM)", startTime: "13:00", endTime: "18:00", breakStart: "15:30", breakEnd: "16:00", workdays: ["MON","TUE","WED","THU","FRI"], isNightShift: false },
  { id: "custom",     label: "Custom...", startTime: "09:00", endTime: "18:00", breakStart: "12:00", breakEnd: "13:00", workdays: ["MON","TUE","WED","THU","FRI"], isNightShift: false },
];

const WEEKDAYS = ["MON","TUE","WED","THU","FRI","SAT","SUN"];
const WEEKDAY_LABELS: Record<string, string> = {
  MON: "M", TUE: "T", WED: "W", THU: "T", FRI: "F", SAT: "S", SUN: "S",
};
const WEEKDAY_FULL: Record<string, string> = {
  MON: "Mon", TUE: "Tue", WED: "Wed", THU: "Thu", FRI: "Fri", SAT: "Sat", SUN: "Sun",
};

function normalizeTimeForInput(value: string | null | undefined): string | null {
  if (!value) return null;
  const match = value.match(/^(\d{1,2}):(\d{2})/);
  if (!match) return null;
  const hh = match[1].padStart(2, "0");
  return `${hh}:${match[2]}`;
}

function parseWorkdaysInput(value: string | null | undefined): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map(day => day.trim().toUpperCase())
    .filter(day => WEEKDAYS.includes(day));
}

function resolveInitialTemplateId(
  schedule: ScheduleSeed | undefined,
  parsedDays: string[],
): string {
  if (!schedule) return "standard";
  const start = normalizeTimeForInput(schedule.start_time);
  const end = normalizeTimeForInput(schedule.end_time);
  const breakStart = normalizeTimeForInput(schedule.break_start);
  const breakEnd = normalizeTimeForInput(schedule.break_end);
  const isNight = Boolean(schedule.is_nightshift);
  if (!start || !end) return "custom";

  const matched = SCHEDULE_TEMPLATES.find((template) =>
    template.id !== "custom" &&
    template.startTime === start &&
    template.endTime === end &&
    template.breakStart === breakStart &&
    template.breakEnd === breakEnd &&
    template.isNightShift === isNight &&
    template.workdays.length === parsedDays.length &&
    template.workdays.every((day) => parsedDays.includes(day))
  );

  return matched?.id ?? "custom";
}

// ─── Exported types ───────────────────────────────────────────────────────────

export type DepartmentOption = { id: string; name: string };

export type EmployeeOption = {
  user_id?: string | null;
  employee_id: string;
  first_name: string;
  last_name: string;
  department_id: string | null;
  department_name: string | null;
};

// ─── Component ────────────────────────────────────────────────────────────────

export function ScheduleManagementModal({
  employeeCount,
  departments,
  employees = [],
  initialScope,
  initialDepartmentId,
  initialSchedule,
  onClose,
  onApplied,
}: Readonly<{
  employeeCount: number;
  departments: DepartmentOption[];
  employees?: EmployeeOption[];
  initialScope?: ApplyScope;
  initialDepartmentId?: string;
  initialSchedule?: ScheduleSeed | null;
  onClose: () => void;
  onApplied?: () => void;
}>) {
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

  const initialDeptId =
    initialDepartmentId && departments.some(d => d.id === initialDepartmentId)
      ? initialDepartmentId
      : (departments[0]?.id ?? "");
  const initialDeptName = departments.find(d => d.id === initialDeptId)?.name ?? "";
  const initialParsedDays = parseWorkdaysInput(initialSchedule?.workdays).length > 0
    ? parseWorkdaysInput(initialSchedule?.workdays)
    : ["MON","TUE","WED","THU","FRI"];
  const initialTemplateId = resolveInitialTemplateId(initialSchedule ?? undefined, initialParsedDays);

  const [scope, setScope]                     = useState<ApplyScope>(initialScope ?? "company");
  const [selectedDept, setSelectedDept]       = useState(initialDeptName);
  const [selectedDeptId, setSelectedDeptId]   = useState(initialDeptId);
  const [skipIndividual, setSkipIndividual]   = useState(true); // default: skip individually-set schedules
  const [templateId, setTemplateId]           = useState(initialTemplateId);
  const [effectiveDate, setEffectiveDate]     = useState(() => {
    const d = new Date(); return d.toISOString().split("T")[0];
  });
  const [confirmed, setConfirmed]             = useState(false);
  const [submitting, setSubmitting]           = useState(false);
  const [done, setDone]                       = useState(false);
  const [applyError, setApplyError]           = useState<string | null>(null);
  const [affectedResult, setAffectedResult]   = useState<number | null>(null);

  // Custom template overrides
  const [customStart,      setCustomStart]      = useState(normalizeTimeForInput(initialSchedule?.start_time) ?? "09:00");
  const [customEnd,        setCustomEnd]        = useState(normalizeTimeForInput(initialSchedule?.end_time) ?? "18:00");
  const [customBreakStart, setCustomBreakStart] = useState(normalizeTimeForInput(initialSchedule?.break_start) ?? "12:00");
  const [customBreakEnd,   setCustomBreakEnd]   = useState(normalizeTimeForInput(initialSchedule?.break_end) ?? "13:00");
  const [customDays,       setCustomDays]       = useState<string[]>(initialParsedDays);
  const [customNight,      setCustomNight]      = useState(Boolean(initialSchedule?.is_nightshift));

  // Employees scope state
  const [empSearch,        setEmpSearch]        = useState("");
  const [empDeptFilter,    setEmpDeptFilter]    = useState("");
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState<Set<string>>(new Set());

  const isCustom = templateId === "custom";
  const template = SCHEDULE_TEMPLATES.find(t => t.id === templateId) ?? SCHEDULE_TEMPLATES[0];

  const previewStart      = isCustom ? customStart      : template.startTime;
  const previewEnd        = isCustom ? customEnd        : template.endTime;
  const previewBreakStart = isCustom ? customBreakStart : template.breakStart;
  const previewBreakEnd   = isCustom ? customBreakEnd   : template.breakEnd;
  const previewDays       = isCustom ? customDays       : template.workdays;
  const previewNight      = isCustom ? customNight      : template.isNightShift;

  // Filtered employees for the employee picker
  const filteredEmployees = useMemo(() => {
    let list = employees;
    if (empDeptFilter) list = list.filter(e => e.department_id === empDeptFilter);
    if (empSearch.trim()) {
      const q = empSearch.toLowerCase();
      list = list.filter(e =>
        `${e.first_name} ${e.last_name}`.toLowerCase().includes(q) ||
        e.employee_id.toLowerCase().includes(q)
      );
    }
    return list;
  }, [employees, empDeptFilter, empSearch]);

  const allVisibleSelected =
    filteredEmployees.length > 0 &&
    filteredEmployees.every(e => selectedEmployeeIds.has(e.employee_id));

  const someVisibleSelected =
    filteredEmployees.some(e => selectedEmployeeIds.has(e.employee_id)) && !allVisibleSelected;

  const toggleSelectAll = () => {
    setSelectedEmployeeIds(prev => {
      const next = new Set(prev);
      if (allVisibleSelected) {
        filteredEmployees.forEach(e => next.delete(e.employee_id));
      } else {
        filteredEmployees.forEach(e => next.add(e.employee_id));
      }
      return next;
    });
  };

  const toggleEmployee = (employeeId: string) => {
    setSelectedEmployeeIds(prev => {
      const next = new Set(prev);
      if (next.has(employeeId)) next.delete(employeeId);
      else next.add(employeeId);
      return next;
    });
  };

  const departmentEmployeeCount = useMemo(() => {
    if (!selectedDeptId) return 0;
    return employees.filter(e => e.department_id === selectedDeptId).length;
  }, [employees, selectedDeptId]);

  const affectedCount =
    scope === "company"    ? employeeCount :
    scope === "department" ? departmentEmployeeCount :
    selectedEmployeeIds.size;

  const toggleDay = (day: string) => {
    setCustomDays(prev =>
      prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]
    );
  };

  const handleApply = async () => {
    if (!confirmed) { setConfirmed(true); return; }
    setApplyError(null);
    setSubmitting(true);
    try {
      const selectedEmployees = employees.filter(e => selectedEmployeeIds.has(e.employee_id));
      const selectedUserIds = selectedEmployees
        .map(e => e.user_id)
        .filter((id): id is string => typeof id === "string" && id.length > 0);
      const selectedEmployeeIdsPayload = selectedEmployees.map(e => e.employee_id);

      const res = await authFetch(`${API_BASE_URL}/timekeeping/schedules/bulk`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scope,
          department_id:   scope === "department" ? selectedDeptId : undefined,
          user_ids:        scope === "employees" ? selectedUserIds : undefined,
          employee_ids:    scope === "employees" ? selectedEmployeeIdsPayload : undefined,
          skip_individual: scope !== "employees" ? skipIndividual : undefined,
          schedule: {
            start_time:    previewStart,
            end_time:      previewEnd,
            break_start:   previewBreakStart,
            break_end:     previewBreakEnd,
            workdays:      previewDays.join(","),
            is_nightshift: previewNight,
          },
          effective_date: effectiveDate,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { message?: string };
        throw new Error(err?.message || "Failed to apply schedule.");
      }
      const result = await res.json() as { affected: number };
      setAffectedResult(result.affected);
      onApplied?.();
      setDone(true);
    } catch (e: unknown) {
      setApplyError(e instanceof Error ? e.message : "An error occurred.");
      setConfirmed(false);
    } finally {
      setSubmitting(false);
    }
  };

  // ── Success screen ──────────────────────────────────────────────────────────

  if (done) {
    const scopeLabel =
      scope === "company"    ? "All employees have" :
      scope === "department" ? `${selectedDept} department has` :
      `${affectedResult ?? selectedEmployeeIds.size} selected employee${(affectedResult ?? selectedEmployeeIds.size) !== 1 ? "s have" : " has"}`;

    return (
      <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/40 backdrop-blur-sm">
        <div className="bg-card border border-border rounded-2xl shadow-2xl p-8 max-w-sm w-full mx-4 text-center animate-in fade-in duration-300">
          <div className="h-14 w-14 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 className="h-7 w-7 text-green-600" />
          </div>
          <h3 className="text-lg font-bold mb-1">Schedule Applied</h3>
          <p className="text-sm text-muted-foreground mb-2">
            {scopeLabel} been assigned the <strong>{isCustom ? "Custom" : template.label}</strong> schedule, effective {effectiveDate}.
          </p>
          {affectedResult != null && (
            <p className="text-xs text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2 mb-4">
              {affectedResult} employee{affectedResult !== 1 ? "s" : ""} updated.
            </p>
          )}
          <Button onClick={onClose} className="w-full mt-2">Done</Button>
        </div>
      </div>
    );
  }

  // ── Main modal ──────────────────────────────────────────────────────────────

  const applyDisabled =
    submitting ||
    (scope === "department" && !selectedDeptId) ||
    (scope === "employees" && selectedEmployeeIds.size === 0);

  return (
    <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-lg mx-4 animate-in fade-in duration-300 flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
          <div>
            <h2 className="text-base font-bold">Assign Schedule</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Apply a work schedule to employees in your company</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-muted transition-colors cursor-pointer">
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 p-6 space-y-5">

          {/* ── Scope selector ────────────────────────────────────────────── */}
          <div>
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-2">Apply To</p>
            <div className="grid grid-cols-3 gap-2">
              {([
                { id: "company",    label: "Whole Company", icon: Globe,     desc: `${employeeCount} employees` },
                { id: "department", label: "Department",    icon: Building2, desc: `${departments.length} dept${departments.length !== 1 ? "s" : ""}` },
                { id: "employees",  label: "Employees",     icon: Users,     desc: selectedEmployeeIds.size > 0 ? `${selectedEmployeeIds.size} selected` : "pick employees" },
              ] as { id: ApplyScope; label: string; icon: React.ElementType; desc: string }[]).map(({ id, label, icon: Icon, desc }) => (
                <button
                  key={id}
                  onClick={() => setScope(id)}
                  className={[
                    "flex flex-col items-center gap-1.5 p-3 rounded-xl border text-xs font-semibold transition-all cursor-pointer",
                    scope === id
                      ? "bg-primary/5 border-primary text-primary"
                      : "border-border text-muted-foreground hover:border-primary/50",
                  ].join(" ")}
                >
                  <Icon className="h-5 w-5" />
                  {label}
                  <span className="text-[10px] font-normal opacity-70">{desc}</span>
                </button>
              ))}
            </div>
          </div>

          {/* ── Department picker ─────────────────────────────────────────── */}
          {scope === "department" && departments.length > 0 && (
            <div>
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1.5">Department</p>
              <div className="relative">
                <select
                  value={selectedDeptId}
                  onChange={e => {
                    const opt = departments.find(d => d.id === e.target.value);
                    setSelectedDeptId(e.target.value);
                    setSelectedDept(opt?.name ?? "");
                  }}
                  className="w-full h-9 pl-3 pr-8 text-sm border border-border rounded-md bg-background appearance-none focus:outline-none focus:ring-2 focus:ring-primary/20 cursor-pointer"
                >
                  {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
              </div>
            </div>
          )}

          {/* ── Employee picker ───────────────────────────────────────────── */}
          {scope === "employees" && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Select Employees</p>
                {selectedEmployeeIds.size > 0 && (
                  <span className="text-[10px] bg-primary/10 text-primary border border-primary/20 rounded-full px-2 py-0.5 font-bold">
                    {selectedEmployeeIds.size} selected
                  </span>
                )}
              </div>

              {/* Filters row */}
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                  <Input
                    placeholder="Search name or ID..."
                    value={empSearch}
                    onChange={e => setEmpSearch(e.target.value)}
                    className="h-8 pl-8 text-xs"
                  />
                </div>
                {departments.length > 0 && (
                  <div className="relative w-40 shrink-0">
                    <select
                      value={empDeptFilter}
                      onChange={e => setEmpDeptFilter(e.target.value)}
                      className="w-full h-8 pl-2.5 pr-7 text-xs border border-border rounded-md bg-background appearance-none focus:outline-none focus:ring-2 focus:ring-primary/20 cursor-pointer"
                    >
                      <option value="">All departments</option>
                      {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                    </select>
                    <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                  </div>
                )}
              </div>

              {/* Employee list */}
              <div className="border border-border rounded-xl overflow-hidden">

                {/* Select-all header */}
                <div className="flex items-center gap-3 px-3 py-2 bg-muted/30 border-b border-border">
                  <input
                    type="checkbox"
                    checked={allVisibleSelected}
                    ref={el => { if (el) el.indeterminate = someVisibleSelected; }}
                    onChange={toggleSelectAll}
                    disabled={filteredEmployees.length === 0}
                    className="h-4 w-4 rounded border-border cursor-pointer accent-primary"
                  />
                  <span className="text-[11px] font-semibold text-muted-foreground">
                    {filteredEmployees.length === 0
                      ? "No employees found"
                      : `Select all (${filteredEmployees.length})`}
                  </span>
                </div>

                {/* Scrollable rows */}
                <div className="max-h-48 overflow-y-auto divide-y divide-border">
                  {filteredEmployees.length === 0 ? (
                    <div className="px-3 py-6 text-center text-xs text-muted-foreground">
                      No employees match your filter.
                    </div>
                  ) : (
                    filteredEmployees.map(emp => {
                      const checked = selectedEmployeeIds.has(emp.employee_id);
                      return (
                        <label
                          key={emp.user_id ?? emp.employee_id}
                          className={[
                            "flex items-center gap-3 px-3 py-2.5 cursor-pointer transition-colors",
                            checked ? "bg-primary/5" : "hover:bg-muted/30",
                          ].join(" ")}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleEmployee(emp.employee_id)}
                            className="h-4 w-4 rounded border-border cursor-pointer accent-primary shrink-0"
                          />
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-semibold text-foreground truncate">
                              {emp.first_name} {emp.last_name}
                            </p>
                            <p className="text-[10px] text-muted-foreground font-mono">{emp.employee_id}</p>
                          </div>
                          {emp.department_name && (
                            <span className="text-[10px] bg-muted text-muted-foreground border border-border rounded px-1.5 py-0.5 shrink-0 max-w-[80px] truncate">
                              {emp.department_name}
                            </span>
                          )}
                        </label>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ── Skip individual schedules option (company / dept scope only) ── */}
          {scope !== "employees" && (
            <label className="flex items-start gap-3 p-3 rounded-xl border border-border bg-muted/20 cursor-pointer hover:bg-muted/30 transition-colors">
              <input
                type="checkbox"
                checked={skipIndividual}
                onChange={e => setSkipIndividual(e.target.checked)}
                className="h-4 w-4 rounded border-border cursor-pointer accent-primary mt-0.5 shrink-0"
              />
              <div>
                <p className="text-xs font-semibold text-foreground">Skip individually-assigned schedules</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  Employees whose schedules were manually set by HR will not be overridden. Uncheck to apply to everyone.
                </p>
              </div>
            </label>
          )}

          {/* ── Template picker ───────────────────────────────────────────── */}
          <div>
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1.5">Schedule Template</p>
            <div className="relative">
              <select
                value={templateId}
                onChange={e => setTemplateId(e.target.value)}
                className="w-full h-9 pl-3 pr-8 text-sm border border-border rounded-md bg-background appearance-none focus:outline-none focus:ring-2 focus:ring-primary/20 cursor-pointer"
              >
                {SCHEDULE_TEMPLATES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            </div>
          </div>

          {/* ── Custom template fields ────────────────────────────────────── */}
          {isCustom && (
            <div className="p-4 rounded-xl border border-border bg-muted/20 space-y-3">
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Custom Schedule</p>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Start Time</label>
                  <Input type="time" value={customStart} onChange={e => setCustomStart(e.target.value)} className="h-9 text-sm" />
                  <p className="text-[10px] text-muted-foreground mt-1">{formatScheduleClock(customStart)}</p>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">End Time</label>
                  <Input type="time" value={customEnd} onChange={e => setCustomEnd(e.target.value)} className="h-9 text-sm" />
                  <p className="text-[10px] text-muted-foreground mt-1">{formatScheduleClock(customEnd)}</p>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Break Start</label>
                  <Input type="time" value={customBreakStart} onChange={e => setCustomBreakStart(e.target.value)} className="h-9 text-sm" />
                  <p className="text-[10px] text-muted-foreground mt-1">{formatScheduleClock(customBreakStart)}</p>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Break End</label>
                  <Input type="time" value={customBreakEnd} onChange={e => setCustomBreakEnd(e.target.value)} className="h-9 text-sm" />
                  <p className="text-[10px] text-muted-foreground mt-1">{formatScheduleClock(customBreakEnd)}</p>
                </div>
              </div>

              <div>
                <label className="text-xs text-muted-foreground mb-1.5 block">Work Days</label>
                <div className="flex gap-1.5">
                  {WEEKDAYS.map(d => (
                    <button
                      key={d}
                      onClick={() => toggleDay(d)}
                      title={WEEKDAY_FULL[d]}
                      className={[
                        "h-8 w-8 rounded-full text-xs font-bold transition-all cursor-pointer border",
                        customDays.includes(d)
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-background text-muted-foreground border-border hover:border-primary/50",
                      ].join(" ")}
                    >
                      {WEEKDAY_LABELS[d]}
                    </button>
                  ))}
                </div>
              </div>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={customNight}
                  onChange={e => setCustomNight(e.target.checked)}
                  className="h-4 w-4 rounded border-border"
                />
                <span className="text-sm text-foreground">Night Shift</span>
                <span className="text-xs text-muted-foreground">(crosses midnight)</span>
              </label>
            </div>
          )}

          {/* ── Schedule preview ──────────────────────────────────────────── */}
          <div className="p-4 rounded-xl bg-primary/5 border border-primary/15 space-y-2">
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Preview</p>
            <div className="flex items-center gap-4 text-sm">
              <div className="flex items-center gap-1.5 text-foreground font-semibold">
                <Clock className="h-4 w-4 text-primary" />
                {formatScheduleClock(previewStart)} -&gt; {formatScheduleClock(previewEnd)}
                {previewNight && <span className="text-[9px] bg-indigo-100 text-indigo-700 border border-indigo-200 px-1.5 py-0.5 rounded font-bold ml-1">Night</span>}
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Break: {formatScheduleClock(previewBreakStart)} - {formatScheduleClock(previewBreakEnd)}
            </p>
            <div className="flex gap-1.5">
              {WEEKDAYS.map(d => (
                <span
                  key={d}
                  className={[
                    "h-6 w-6 rounded-full text-[10px] font-bold flex items-center justify-center",
                    previewDays.includes(d) ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
                  ].join(" ")}
                >
                  {WEEKDAY_LABELS[d]}
                </span>
              ))}
            </div>
          </div>

          {/* ── Effective date ────────────────────────────────────────────── */}
          <div>
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1.5">Effective Date</p>
            <Input
              type="date"
              value={effectiveDate}
              onChange={e => setEffectiveDate(e.target.value)}
              className="h-9 text-sm w-full"
            />
          </div>

          {/* ── Confirm warning ───────────────────────────────────────────── */}
          {confirmed && (
            <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700">
              This will update the schedule for{" "}
              <strong>
                {scope === "company"
                  ? `all ${employeeCount} employees`
                  : scope === "department"
                  ? `the ${selectedDept} department`
                  : `${selectedEmployeeIds.size} selected employee${selectedEmployeeIds.size !== 1 ? "s" : ""}`}
              </strong>, effective <strong>{effectiveDate}</strong>. This action cannot be undone.
            </div>
          )}
        </div>

        {/* ── Footer ────────────────────────────────────────────────────────── */}
        <div className="px-6 py-4 border-t border-border shrink-0 bg-muted/10 space-y-2">
          {applyError && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {applyError}
            </p>
          )}
          {scope === "employees" && selectedEmployeeIds.size === 0 && !applyError && (
            <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              Select at least one employee to apply the schedule.
            </p>
          )}
          <div className="flex items-center justify-between gap-3">
            <Button variant="outline" onClick={onClose} className="cursor-pointer">Cancel</Button>
            <Button
              onClick={handleApply}
              disabled={applyDisabled}
              className="gap-2 cursor-pointer"
            >
              {submitting ? (
                <><div className="h-3.5 w-3.5 rounded-full border-2 border-primary-foreground/30 border-t-primary-foreground animate-spin" /> Applying...</>
              ) : confirmed ? (
                <>Confirm - Apply to {affectedCount} {affectedCount === 1 ? "employee" : "employees"}</>
              ) : (
                <>Apply to {affectedCount} {affectedCount === 1 ? "employee" : "employees"} -&gt;</>
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
