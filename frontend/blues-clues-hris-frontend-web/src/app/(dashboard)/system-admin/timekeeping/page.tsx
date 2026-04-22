"use client";

import type React from "react";
import { useState, useMemo, useEffect, useCallback } from "react";
import {
  Clock, Search, ChevronLeft, ChevronRight,
  Users, TrendingUp, Timer, BarChart2, MapPin, MapPinOff,
  CalendarDays, CalendarRange, LayoutGrid, Calendar, Settings2,
  Download,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { authFetch } from "@/lib/authApi";
import { API_BASE_URL } from "@/lib/api";
import { ScheduleManagementModal, type DepartmentOption } from "@/components/timekeeping/ScheduleManagementModal";
import { EmployeeScheduleEditModal } from "@/components/timekeeping/EmployeeScheduleEditModal";
import { AttendanceCalendarGrid, type CalendarDayData, type CalendarViewMode } from "@/components/timekeeping/AttendanceCalendarGrid";
import { ScheduleRosterTable } from "@/components/timekeeping/ScheduleRosterTable";

// ─── Types ────────────────────────────────────────────────────────────────────

type UserRow = {
  user_id: string;
  employee_id: string;
  first_name: string;
  last_name: string;
  department_id: string | null;
  department: { department_name?: string | null } | Array<{ department_name?: string | null }> | null;
  department_name?: string | null;
};

type PunchRow = {
  log_id: string;
  employee_id: string;
  log_type: "time-in" | "time-out" | "absence";
  timestamp: string;
  latitude: number | null;
  longitude: number | null;
  ip_address: string | null;
  is_mock_location: string;
  log_status: string;
  absence_reason: string | null;
};

type RosterEntry = {
  user_id: string;
  employee_id: string;
  first_name: string;
  last_name: string;
  department_name: string | null;
  time_in: string | null;
  time_out: string | null;
  hours_worked: number | null;
  status: "present" | "late" | "clocked-in" | "absent" | "excused";
  gps_verified: boolean;
  absence_reason: string | null;
};

type ViewMode = "day" | "week" | "month";
type StatusFilter = RosterEntry["status"] | "all";

type ScheduleModalPreset = {
  scope: "company" | "department" | "employees";
  departmentId?: string;
  schedule?: {
    start_time?: string | null;
    end_time?: string | null;
    break_start?: string | null;
    break_end?: string | null;
    workdays?: string | null;
    is_nightshift?: boolean | null;
  } | null;
} | null;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseTs(ts: string): Date {
  return new Date(ts.includes("Z") || ts.includes("+") ? ts : ts + "Z");
}

function toDateString(date: Date): string {
  return date.toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });
}

function formatDisplayDate(date: Date): string {
  return date.toLocaleDateString("en-US", {
    weekday: "short", month: "long", day: "numeric", year: "numeric",
    timeZone: "Asia/Manila",
  });
}

function isToday(date: Date): boolean {
  return toDateString(date) === toDateString(new Date());
}

function formatTime(timestamp: string | null): string {
  if (!timestamp) return "—";
  return parseTs(timestamp).toLocaleTimeString("en-US", {
    hour: "2-digit", minute: "2-digit", hour12: true, timeZone: "Asia/Manila",
  });
}

function formatHours(timeIn: string | null, timeOut: string | null): string {
  if (!timeIn || !timeOut) return "—";
  return `${((parseTs(timeOut).getTime() - parseTs(timeIn).getTime()) / 3600000).toFixed(2)}h`;
}

function computeHoursDecimal(timeIn: string | null, timeOut: string | null): number | null {
  if (!timeIn || !timeOut) return null;
  return (parseTs(timeOut).getTime() - parseTs(timeIn).getTime()) / 3600000;
}

function isLate(timeIn: string): boolean {
  return Number.parseInt(
    parseTs(timeIn).toLocaleString("en-US", { hour: "numeric", hour12: false, timeZone: "Asia/Manila" }), 10
  ) >= 9;
}

function getWeekRange(offset: number) {
  const today = new Date();
  const dow   = today.getDay();
  const monday = new Date(today); monday.setDate(today.getDate() - dow + (dow === 0 ? -6 : 1) + offset * 7);
  const sunday = new Date(monday); sunday.setDate(monday.getDate() + 6);
  const from = toDateString(monday);
  const to   = toDateString(sunday);
  const label = `${monday.toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${sunday.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;
  return { from, to, label };
}

function getMonthRange(offset: number) {
  const d = new Date();
  d.setMonth(d.getMonth() + offset, 1);
  const from  = toDateString(d);
  const last  = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  const to    = toDateString(last);
  const label = d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  return { from, to, label };
}

function buildFullRoster(users: UserRow[], punches: PunchRow[]): RosterEntry[] {
  const punchMap: Record<string, { clockIn: PunchRow | null; clockOut: PunchRow | null; absence: PunchRow | null }> = {};
  for (const p of punches) {
    if (!punchMap[p.employee_id]) punchMap[p.employee_id] = { clockIn: null, clockOut: null, absence: null };
    if (p.log_type === "time-in"  && !punchMap[p.employee_id].clockIn)  punchMap[p.employee_id].clockIn  = p;
    if (p.log_type === "time-out")                                       punchMap[p.employee_id].clockOut = p;
    if (p.log_type === "absence"  && !punchMap[p.employee_id].absence)  punchMap[p.employee_id].absence  = p;
  }
  return users.map(u => {
    const e = punchMap[u.employee_id];
    const time_in  = e?.clockIn?.timestamp  ?? null;
    const time_out = e?.clockOut?.timestamp ?? null;
    let status: RosterEntry["status"] = "absent";
    if (e?.absence) status = "excused";
    else if (time_in && time_out) status = isLate(time_in) ? "late" : "present";
    else if (time_in) status = "clocked-in";
    const departmentName =
      (typeof u.department_name === "string" && u.department_name.trim()) ||
      (Array.isArray(u.department)
        ? u.department[0]?.department_name?.trim()
        : u.department?.department_name?.trim()) ||
      null;

    return {
      user_id: u.user_id,
      employee_id: u.employee_id,
      first_name: u.first_name,
      last_name: u.last_name,
      department_name: departmentName,
      time_in,
      time_out,
      hours_worked: computeHoursDecimal(time_in, time_out),
      status,
      gps_verified: !!(e?.clockIn?.latitude && e?.clockIn?.longitude),
      absence_reason: e?.absence?.absence_reason ?? null,
    };
  });
}

function computeStats(roster: RosterEntry[]) {
  const total   = roster.length;
  const present = roster.filter(r => r.status === "present" || r.status === "clocked-in").length;
  const late    = roster.filter(r => r.status === "late").length;
  const absent  = roster.filter(r => r.status === "absent" || r.status === "excused").length;
  const totalHours = roster.reduce((s, r) => s + (r.hours_worked ?? 0), 0);
  const avgHours   = present > 0 ? totalHours / present : 0;
  const attendance_rate = total > 0 ? Math.round(((present + late) / total) * 100) : 0;
  return { total, present, late, absent, totalHours, avgHours, attendance_rate };
}

// ─── Components ───────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<RosterEntry["status"], { label: string; className: string }> = {
  "present":    { label: "Present",    className: "bg-green-100 text-green-700 border border-green-200" },
  "late":       { label: "Late",       className: "bg-amber-100 text-amber-700 border border-amber-200" },
  "clocked-in": { label: "Clocked In", className: "bg-blue-100 text-blue-700 border border-blue-200" },
  "absent":     { label: "Absent",     className: "bg-red-100 text-red-700 border border-red-200" },
  "excused":    { label: "Excused",    className: "bg-purple-100 text-purple-700 border border-purple-200" },
};

function StatusBadge({ status }: { readonly status: RosterEntry["status"] }) {
  const cfg = STATUS_CONFIG[status];
  return <span className={`px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wide ${cfg.className}`}>{cfg.label}</span>;
}

function StatCard({ icon: Icon, label, value, sub, colorClass }: {
  readonly icon: React.ElementType; readonly label: string; readonly value: string; readonly sub: string; readonly colorClass: string;
}) {
  return (
    <Card className="p-5 border-border">
      <div className="flex items-center gap-3 mb-3">
        <div className={`p-2 rounded-lg ${colorClass}`}><Icon className="h-4 w-4" /></div>
        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">{label}</p>
      </div>
      <p className="text-2xl font-bold">{value}</p>
      <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>
    </Card>
  );
}

const FILTER_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: "all",        label: "All"       },
  { value: "present",    label: "Present"   },
  { value: "late",       label: "Late"      },
  { value: "absent",     label: "Absent"    },
  { value: "clocked-in", label: "Clocked In"},
  { value: "excused",    label: "Excused"   },
];

const ITEMS_PER_PAGE = 8;

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SystemAdminTimekeepingPage() {
  const [viewMode, setViewMode]       = useState<ViewMode>("day");
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [weekOffset, setWeekOffset]   = useState(0);
  const [monthOffset, setMonthOffset] = useState(0);

  const [users, setUsers]             = useState<UserRow[]>([]);
  const [deptOptions, setDeptOptions] = useState<DepartmentOption[]>([]);
  const [allPunches, setAllPunches]   = useState<PunchRow[]>([]);
  const [roster, setRoster]           = useState<RosterEntry[]>([]);
  const [loading, setLoading]         = useState(true);
  const [fetchError, setFetchError]   = useState(false);
  const [search, setSearch]           = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [page, setPage]               = useState(1);

  // Main panel toggle
  const [mainPanel, setMainPanel] = useState<"attendance" | "schedules">("attendance");

  // Calendar
  const [showCalendar, setShowCalendar] = useState(false);
  const [calendarMode, setCalendarMode] = useState<CalendarViewMode>("month");
  const [calPickerNav, setCalPickerNav] = useState<Date | null>(null);

  // Schedule modals
  const [showScheduleModal, setShowScheduleModal]   = useState(false);
  const [scheduleModalPreset, setScheduleModalPreset] = useState<ScheduleModalPreset>(null);
  const [editScheduleFor, setEditScheduleFor]       = useState<{ userId: string; name: string; schedule?: any } | null>(null);
  const [scheduleRosterRefreshKey, setScheduleRosterRefreshKey] = useState(0);

  // Fetch departments once on mount
  useEffect(() => {
    authFetch(`${API_BASE_URL}/users/departments`)
      .then(r => r.ok ? r.json() : [])
      .then((data: { department_id: string; department_name: string }[]) => {
        setDeptOptions(data.map(d => ({ id: d.department_id, name: d.department_name })));
      })
      .catch(() => {});
  }, []);

  // Live clock
  const [liveTime, setLiveTime] = useState(() =>
    new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true, timeZone: "Asia/Manila" })
  );
  useEffect(() => {
    const id = setInterval(() =>
      setLiveTime(new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true, timeZone: "Asia/Manila" }))
    , 1000);
    return () => clearInterval(id);
  }, []);

  const weekRange  = useMemo(() => getWeekRange(weekOffset),   [weekOffset]);
  const monthRange = useMemo(() => getMonthRange(monthOffset), [monthOffset]);

  const { from, to } = useMemo(() => {
    if (viewMode === "week")  return { from: weekRange.from,  to: weekRange.to  };
    if (viewMode === "month") return { from: monthRange.from, to: monthRange.to };
    const d = toDateString(selectedDate);
    return { from: d, to: d };
  }, [viewMode, selectedDate, weekRange, monthRange]);

  const effectiveLabel = useMemo(() => {
    const fmt = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString("en-US", {
      month: "short", day: "numeric", year: "numeric", timeZone: "Asia/Manila",
    });
    return `${fmt(from)} – ${fmt(to)}`;
  }, [from, to]);

  useEffect(() => {
    setLoading(true);
    setFetchError(false);
    setPage(1);
    Promise.all([
      authFetch(`${API_BASE_URL}/timekeeping/employees`).then(r => { if (!r.ok) throw new Error(); return r.json() as Promise<UserRow[]>; }),
      authFetch(`${API_BASE_URL}/timekeeping/timesheets?from=${from}&to=${to}`).then(r => { if (!r.ok) throw new Error(); return r.json() as Promise<PunchRow[]>; }),
    ])
      .then(([u, p]) => { setUsers(u); setAllPunches(p); setRoster(buildFullRoster(u, p)); })
      .catch(() => setFetchError(true))
      .finally(() => setLoading(false));
  }, [from, to]);

  const stats = useMemo(() => computeStats(roster), [roster]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return roster.filter(r => {
      const name = `${r.first_name} ${r.last_name}`.toLowerCase();
      return (name.includes(q) || r.employee_id.toLowerCase().includes(q)) &&
        (statusFilter === "all" || r.status === statusFilter);
    });
  }, [roster, search, statusFilter]);

  const totalPages = Math.ceil(filtered.length / ITEMS_PER_PAGE);
  const paged      = filtered.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE);

  // deptOptions is fetched from /users/departments on mount (see useEffect above)

  const calendarDays = useMemo<CalendarDayData[]>(() => {
    const today = toDateString(new Date());
    const dateMap: Record<string, { hasPresent: boolean; hasAbsent: boolean }> = {};
    for (const p of allPunches) {
      const d = p.timestamp.split("T")[0];
      if (!dateMap[d]) dateMap[d] = { hasPresent: false, hasAbsent: false };
      if (p.log_type === "time-in") dateMap[d].hasPresent = true;
      if (p.log_type === "absence") dateMap[d].hasAbsent  = true;
    }
    return Object.entries(dateMap).map(([date, s]): CalendarDayData => ({
      date,
      status: date > today ? "future" : s.hasPresent ? "present" : s.hasAbsent ? "absent" : "no-schedule",
    }));
  }, [allPunches]);

  const goToPrev  = useCallback(() => setSelectedDate(d => { const n = new Date(d); n.setDate(n.getDate() - 1); return n; }), []);
  const goToNext  = useCallback(() => setSelectedDate(d => { const n = new Date(d); n.setDate(n.getDate() + 1); return n; }), []);
  const goToToday = useCallback(() => setSelectedDate(new Date()), []);

  // CSV export
  const exportCSV = useCallback(() => {
    const cleanCsvValue = (v: string) => String(v).replace(/^[—–]$/, "").replace(/"/g, '""');
    const headers = ["Employee", "Employee ID", "Department", "Time In", "Time Out", "Hours", "Status"];
    const rows = filtered.map(r => [
      `${r.first_name} ${r.last_name}`, r.employee_id,
      r.department_name ?? "", formatTime(r.time_in), formatTime(r.time_out),
      formatHours(r.time_in, r.time_out),
      r.status.charAt(0).toUpperCase() + r.status.slice(1),
    ]);
    const csv = [headers, ...rows].map(r => r.map(c => `"${cleanCsvValue(c)}"`).join(",")).join("\n");
    // UTF-8 BOM ensures Excel opens it correctly without garbled characters
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = Object.assign(document.createElement("a"), { href: url, download: `timekeeping_${from}_${to}.csv` });
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [filtered, from, to]);

  return (
    <div className="space-y-6 animate-in fade-in duration-500">

      {/* Schedule Modals */}
      {showScheduleModal && (
        <ScheduleManagementModal
          employeeCount={users.length}
          departments={deptOptions}
          employees={users.map(u => ({
            user_id: u.user_id,
            employee_id: u.employee_id,
            first_name: u.first_name,
            last_name: u.last_name,
            department_id: u.department_id,
            department_name: u.department_name ??
              (Array.isArray(u.department)
                ? (u.department[0]?.department_name ?? null)
                : (u.department as { department_name?: string | null } | null)?.department_name ?? null),
          }))}
          initialScope={scheduleModalPreset?.scope}
          initialDepartmentId={scheduleModalPreset?.departmentId}
          initialSchedule={scheduleModalPreset?.schedule}
          onClose={() => {
            setShowScheduleModal(false);
            setScheduleModalPreset(null);
          }}
          onApplied={() => {
            setScheduleRosterRefreshKey((v) => v + 1);
          }}
        />
      )}
      {editScheduleFor && (
        <EmployeeScheduleEditModal
          employeeId={editScheduleFor.userId}
          employeeName={editScheduleFor.name}
          currentSchedule={editScheduleFor.schedule ?? null}
          effectiveLabel={effectiveLabel}
          onClose={() => setEditScheduleFor(null)}
          onSaved={() => {}}
        />
      )}

      {/* ── Hero Banner ────────────────────────────────────────────────────────── */}
      <div className="rounded-[22px] border border-white/10 bg-[linear-gradient(135deg,#0f172a_0%,#172554_52%,#134e4a_100%)] px-6 py-6 md:px-8 md:py-7 relative overflow-hidden">
        <div className="absolute -top-10 -right-10 h-40 w-40 rounded-full bg-blue-500/20 blur-3xl pointer-events-none" />
        <div className="absolute -bottom-8 left-20 h-32 w-32 rounded-full bg-teal-500/20 blur-3xl pointer-events-none" />
        <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-white/10 rounded-xl border border-white/15 shrink-0">
              <Clock className="h-6 w-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white tracking-tight">System Timekeeping</h1>
              <p className="text-xs text-white/60 mt-0.5">Company-wide attendance & schedule management</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="text-2xl font-bold text-white font-mono tabular-nums leading-none">{liveTime}</p>
              <p className="text-[10px] text-white/50 uppercase tracking-widest font-bold mt-0.5">Asia/Manila</p>
            </div>
            {!loading && (
              <div className="hidden sm:flex items-center gap-2 border-l border-white/15 pl-4">
                <span className="flex flex-col items-center px-3 py-1 rounded-lg bg-green-500/15 border border-green-400/20">
                  <span className="text-lg font-bold text-green-300 leading-none">{stats.present}</span>
                  <span className="text-[9px] text-green-300/70 uppercase tracking-widest font-bold">In</span>
                </span>
                <span className="flex flex-col items-center px-3 py-1 rounded-lg bg-amber-500/15 border border-amber-400/20">
                  <span className="text-lg font-bold text-amber-300 leading-none">{stats.late}</span>
                  <span className="text-[9px] text-amber-300/70 uppercase tracking-widest font-bold">Late</span>
                </span>
                <span className="flex flex-col items-center px-3 py-1 rounded-lg bg-red-500/15 border border-red-400/20">
                  <span className="text-lg font-bold text-red-300 leading-none">{stats.absent}</span>
                  <span className="text-[9px] text-red-300/70 uppercase tracking-widest font-bold">Out</span>
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── View Controls ──────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3 flex-wrap">
          {/* Main panel toggle */}
          <div className="flex items-center border border-border rounded-lg overflow-hidden bg-background shadow-xs">
            <button
              onClick={() => setMainPanel("attendance")}
              className={`px-3.5 py-2 text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5 ${
                mainPanel === "attendance" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground hover:bg-muted/40"
              }`}
            >
              <Users className="h-3.5 w-3.5" />
              Attendance
            </button>
            <button
              onClick={() => setMainPanel("schedules")}
              className={`px-3.5 py-2 text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5 ${
                mainPanel === "schedules" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground hover:bg-muted/40"
              }`}
            >
              <CalendarDays className="h-3.5 w-3.5" />
              Schedules
            </button>
          </div>

          {mainPanel === "attendance" && (<>
            {/* Calendar toggle */}
            <div className="flex items-center border border-border rounded-lg overflow-hidden bg-background shadow-xs">
              <button
                onClick={() => setShowCalendar(v => !v)}
                className={`px-3.5 py-2 text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5 ${
                  showCalendar ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground hover:bg-muted/40"
                }`}
              >
                <Calendar className="h-3.5 w-3.5" />
                Calendar
              </button>
            </div>

            {/* View mode */}
            <div className="flex items-center border border-border rounded-lg overflow-hidden bg-background shadow-xs">
              {([
                { v: "day",   label: "Day",   icon: CalendarDays  },
                { v: "week",  label: "Week",  icon: CalendarRange },
                { v: "month", label: "Month", icon: LayoutGrid    },
              ] as { v: ViewMode; label: string; icon: React.ElementType }[]).map(({ v, label, icon: Icon }) => (
                <button
                  key={v}
                  onClick={() => { setViewMode(v); setPage(1); }}
                  className={`px-3.5 py-2 text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5 ${
                    viewMode === v ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground hover:bg-muted/40"
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {label}
                </button>
              ))}
            </div>

            {/* Day nav */}
            {viewMode === "day" && (
              <div className="flex items-center gap-1.5">
                <Button variant="outline" size="icon" className="h-9 w-9" onClick={goToPrev}><ChevronLeft className="h-4 w-4" /></Button>
                <Button variant={isToday(selectedDate) ? "default" : "outline"} className="h-9 px-4 text-xs font-bold" onClick={goToToday}>
                  {isToday(selectedDate) ? "Today" : "Go to Today"}
                </Button>
                <div className="h-9 px-3 flex items-center border border-border rounded-md text-sm font-medium bg-background min-w-40 justify-center">
                  {formatDisplayDate(selectedDate)}
                </div>
                <Button variant="outline" size="icon" className="h-9 w-9" onClick={goToNext} disabled={isToday(selectedDate)}><ChevronRight className="h-4 w-4" /></Button>
              </div>
            )}

            {/* Week nav */}
            {viewMode === "week" && (
              <div className="flex items-center gap-1.5">
                <Button variant="outline" size="icon" className="h-9 w-9" onClick={() => setWeekOffset(o => o - 1)}><ChevronLeft className="h-4 w-4" /></Button>
                {weekOffset !== 0 && <Button variant="outline" className="h-9 px-3 text-xs font-bold" onClick={() => setWeekOffset(0)}>This Week</Button>}
                <div className="h-9 px-3 flex items-center border border-border rounded-md text-sm font-medium bg-background min-w-52 justify-center">
                  <CalendarRange className="h-3.5 w-3.5 mr-2 text-muted-foreground" />{weekRange.label}
                </div>
                <Button variant="outline" size="icon" className="h-9 w-9" onClick={() => setWeekOffset(o => o + 1)} disabled={weekOffset >= 0}><ChevronRight className="h-4 w-4" /></Button>
              </div>
            )}

            {/* Month nav */}
            {viewMode === "month" && (
              <div className="flex items-center gap-1.5">
                <Button variant="outline" size="icon" className="h-9 w-9" onClick={() => setMonthOffset(o => o - 1)}><ChevronLeft className="h-4 w-4" /></Button>
                {monthOffset !== 0 && <Button variant="outline" className="h-9 px-3 text-xs font-bold" onClick={() => setMonthOffset(0)}>This Month</Button>}
                <div className="h-9 px-3 flex items-center border border-border rounded-md text-sm font-medium bg-background min-w-40 justify-center">
                  <LayoutGrid className="h-3.5 w-3.5 mr-2 text-muted-foreground" />{monthRange.label}
                </div>
                <Button variant="outline" size="icon" className="h-9 w-9" onClick={() => setMonthOffset(o => o + 1)} disabled={monthOffset >= 0}><ChevronRight className="h-4 w-4" /></Button>
              </div>
            )}
          </>)}
        </div>

        {/* Right: actions */}
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 cursor-pointer"
            onClick={() => {
              setScheduleModalPreset(null);
              setShowScheduleModal(true);
            }}
          >
            <Settings2 className="h-3.5 w-3.5" />
            Assign Schedule
          </Button>
          {mainPanel === "attendance" && (
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 cursor-pointer border-emerald-300 text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800 hover:border-emerald-400 transition-colors duration-200 disabled:opacity-40"
              disabled={filtered.length === 0}
              onClick={exportCSV}
            >
              <Download className="h-3.5 w-3.5" />
              Export CSV
            </Button>
          )}
        </div>
      </div>

      {/* ── Schedule Roster Panel ───────────────────────────────────────────────── */}
      {mainPanel === "schedules" && (
        <ScheduleRosterTable
          canEdit
          refreshKey={scheduleRosterRefreshKey}
          onEditEmployee={(userId, name, schedule) =>
            setEditScheduleFor({ userId, name, schedule })
          }
          onEditDepartment={(departmentId, _departmentName, schedule) => {
            setScheduleModalPreset({
              scope: "department",
              departmentId,
              schedule: schedule
                ? {
                    start_time: schedule.start_time,
                    end_time: schedule.end_time,
                    break_start: schedule.break_start,
                    break_end: schedule.break_end,
                    workdays: schedule.workdays,
                    is_nightshift: schedule.is_nightshift,
                  }
                : null,
            });
            setShowScheduleModal(true);
          }}
        />
      )}

      {mainPanel === "attendance" && (<>

      {/* ── Stat Cards ─────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard icon={Users}      label="Total Employees"   value={String(stats.total)}               sub="tracked"                              colorClass="bg-primary/10 text-primary" />
        <StatCard icon={TrendingUp} label="Attendance Rate"   value={`${stats.attendance_rate}%`}       sub={`${stats.present + stats.late} present`} colorClass="bg-green-50 text-green-600" />
        <StatCard icon={BarChart2}  label="Total Hours"       value={`${stats.totalHours.toFixed(1)}h`} sub={`${stats.avgHours.toFixed(1)}h avg`}  colorClass="bg-blue-50 text-blue-600" />
        <StatCard icon={Timer}      label="Compliance Issues" value={String(stats.late + stats.absent)} sub={`${stats.late} late · ${stats.absent} absent`} colorClass="bg-red-50 text-red-600" />
      </div>

      {/* ── Calendar Grid View ─────────────────────────────────────────────────── */}
      {showCalendar && (
        <div className="bg-card border border-border rounded-2xl p-6 shadow-sm animate-in fade-in duration-300">
          <div className="mb-4">
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Attendance Calendar</p>
            <p className="text-sm font-semibold text-foreground mt-0.5">Company-wide overview — click a day to view details</p>
          </div>
          <AttendanceCalendarGrid
            mode={calendarMode}
            referenceDate={calPickerNav ?? (viewMode === "day" ? selectedDate : new Date())}
            days={calendarDays}
            loading={loading}
            showModeToggle
            onModeChange={setCalendarMode}
            onNavigate={(d) => setCalPickerNav(d)}
            onDayClick={(date) => {
              setSelectedDate(new Date(date + "T00:00:00"));
              setViewMode("day");
              setShowCalendar(false);
              setCalPickerNav(null);
            }}
          />
        </div>
      )}

      {/* Roster Table */}
      <Card className="border-border overflow-hidden">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-4 bg-muted/20 border-b border-border">
          <div className="flex gap-1.5 flex-wrap">
            {FILTER_OPTIONS.map(opt => (
              <button
                key={opt.value}
                onClick={() => { setStatusFilter(opt.value); setPage(1); }}
                className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide border transition-colors cursor-pointer ${
                  statusFilter === opt.value
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background text-muted-foreground border-border hover:border-primary/50"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by name or ID..."
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1); }}
              className="pl-9 h-9 w-52 bg-background"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-[10px] font-bold text-muted-foreground bg-muted/30 border-b border-border uppercase tracking-widest">
              <tr>
                <th className="px-6 py-4">Employee</th>
                <th className="px-6 py-4">Department</th>
                <th className="px-6 py-4">Time In</th>
                <th className="px-6 py-4">Time Out</th>
                <th className="px-6 py-4">Hours</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4">GPS</th>
                <th className="px-6 py-4">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                <tr><td colSpan={8} className="px-6 py-10 text-center text-muted-foreground text-sm">Loading timekeeping data...</td></tr>
              ) : fetchError ? (
                <tr><td colSpan={8} className="px-6 py-10 text-center text-destructive text-sm">Failed to load data. Please refresh.</td></tr>
              ) : paged.length === 0 ? (
                <tr><td colSpan={8} className="px-6 py-10 text-center text-muted-foreground text-sm">
                  {search || statusFilter !== "all" ? "No records match your search." : "No entries found for this period."}
                </td></tr>
              ) : paged.map(r => (
                <tr key={r.employee_id} className="hover:bg-primary/5 transition-colors">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="h-9 w-9 bg-primary/10 text-primary rounded-full flex items-center justify-center font-bold text-xs border border-primary/5 shrink-0">
                        {r.first_name.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <p className="font-semibold">{`${r.first_name} ${r.last_name}`.trim()}</p>
                        <p className="text-[10px] text-muted-foreground font-mono">{r.employee_id}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-xs text-muted-foreground">{r.department_name ?? "—"}</td>
                  <td className="px-6 py-4 text-xs font-medium">{formatTime(r.time_in)}</td>
                  <td className="px-6 py-4 text-xs font-medium">{formatTime(r.time_out)}</td>
                  <td className="px-6 py-4 text-xs font-medium">{formatHours(r.time_in, r.time_out)}</td>
                  <td className="px-6 py-4"><StatusBadge status={r.status} /></td>
                  <td className="px-6 py-4">
                    {r.status === "absent" || r.status === "excused" ? (
                      <span className="text-muted-foreground text-xs">—</span>
                    ) : r.gps_verified ? (
                      <div className="flex items-center gap-1.5 text-green-600">
                        <MapPin className="h-3.5 w-3.5" />
                        <span className="text-[10px] font-bold uppercase tracking-wide">Verified</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5 text-muted-foreground">
                        <MapPinOff className="h-3.5 w-3.5" />
                        <span className="text-[10px] font-bold uppercase tracking-wide">No GPS</span>
                      </div>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <button
                      onClick={() => setEditScheduleFor({ userId: r.user_id, name: `${r.first_name} ${r.last_name}` })}
                      className="flex items-center gap-1.5 text-xs font-semibold text-primary hover:text-primary/80 transition-colors cursor-pointer"
                    >
                      <CalendarDays className="h-3.5 w-3.5" />
                      Edit Schedule
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="p-4 bg-muted/10 border-t border-border flex items-center justify-between">
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
            {filtered.length > 0
              ? `Showing ${(page - 1) * ITEMS_PER_PAGE + 1}–${Math.min(page * ITEMS_PER_PAGE, filtered.length)} of ${filtered.length}`
              : "No results"}
          </p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="h-8 gap-1" onClick={() => setPage(p => p - 1)} disabled={page === 1 || totalPages === 0}>
              <ChevronLeft className="h-4 w-4" /> Prev
            </Button>
            <Button variant="outline" size="sm" className="h-8 gap-1" onClick={() => setPage(p => p + 1)} disabled={page === totalPages || totalPages === 0}>
              Next <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </Card>

      </>)}
    </div>
  );
}

