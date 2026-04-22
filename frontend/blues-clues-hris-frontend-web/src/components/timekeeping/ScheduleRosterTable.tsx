"use client";

import { useState, useEffect, useMemo } from "react";
import { Search, CalendarDays, Users, RefreshCw } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { authFetch } from "@/lib/authApi";
import { API_BASE_URL } from "@/lib/api";

// ─── Types ────────────────────────────────────────────────────────────────────

type ScheduleSource = "bulk" | "department" | "individual" | "default" | null;
type SourceFilter = "all" | "custom" | "standard" | "department" | "default" | "unset";

type RosterEntry = {
  user_id: string;
  employee_id: string;
  first_name: string;
  last_name: string;
  department_id: string | null;
  department_name: string | null;
  department?: { department_name?: string | null } | Array<{ department_name?: string | null }> | null;
  schedule: {
    start_time: string | null;
    end_time: string | null;
    break_start: string | null;
    break_end: string | null;
    workdays: string | null;
    is_nightshift: boolean | null;
    schedule_source: ScheduleSource;
    updated_by_name: string | null;
    updated_at: string | null;
  } | null;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatClock(value: string | null | undefined): string {
  if (!value) return "—";
  const match = value.match(/^(\d{1,2}):(\d{2})/);
  if (!match) return value;
  const h = Number.parseInt(match[1], 10);
  if (Number.isNaN(h)) return value;
  const suffix = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${match[2]} ${suffix}`;
}

function parseWorkdays(wd: string | null): string[] {
  if (!wd) return [];
  return wd.toUpperCase().split(",").map(d => d.trim()).filter(Boolean);
}

const DAY_ABBR: Record<string, string> = {
  MON: "M", TUE: "T", WED: "W", THU: "T", THURS: "T", FRI: "F", SAT: "S", SUN: "S",
};
const ALL_DAYS = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];

function normalizeScheduleSource(
  source: unknown,
  hasSchedule: boolean,
): ScheduleSource {
  if (source === "individual" || source === "bulk" || source === "department" || source === "default") {
    return source;
  }
  return hasSchedule ? "default" : null;
}

const KNOWN_TEMPLATES: Array<{ start: string; end: string; name: string }> = [
  { start: "09:00", end: "18:00", name: "Standard" },
  { start: "07:00", end: "16:00", name: "Early" },
  { start: "12:00", end: "21:00", name: "Late" },
  { start: "21:00", end: "06:00", name: "Night" },
  { start: "09:00", end: "13:00", name: "Half Day AM" },
  { start: "13:00", end: "18:00", name: "Half Day PM" },
];

function resolveTemplateName(startTime: string | null, endTime: string | null): string {
  if (!startTime || !endTime) return "Bulk";
  const st = startTime.substring(0, 5);
  const et = endTime.substring(0, 5);
  return KNOWN_TEMPLATES.find(t => t.start === st && t.end === et)?.name ?? "Bulk";
}

function normalizeRosterEntry(row: RosterEntry): RosterEntry {
  const relation = (row as {
    department?: { department_name?: string | null } | Array<{ department_name?: string | null }> | null;
  }).department;
  const normalizedDepartmentName =
    (typeof row.department_name === "string" && row.department_name.trim()) ||
    (Array.isArray(relation)
      ? relation[0]?.department_name?.trim()
      : relation?.department_name?.trim()) ||
    null;

  if (!row.schedule) {
    return {
      ...row,
      department_name: normalizedDepartmentName,
    };
  }
  return {
    ...row,
    department_name: normalizedDepartmentName,
    schedule: {
      ...row.schedule,
      schedule_source: normalizeScheduleSource(row.schedule.schedule_source, true),
    },
  };
}

// ─── Source Badge ─────────────────────────────────────────────────────────────

function SourceBadge({ source, startTime, endTime }: {
  readonly source: ScheduleSource;
  readonly startTime?: string | null;
  readonly endTime?: string | null;
}) {
  if (source === "individual") {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-md bg-violet-100 text-violet-700 border border-violet-200 whitespace-nowrap">
        Custom
      </span>
    );
  }
  if (source === "bulk") {
    const name = resolveTemplateName(startTime ?? null, endTime ?? null);
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-md bg-sky-100 text-sky-700 border border-sky-200 whitespace-nowrap">
        {name}
      </span>
    );
  }
  if (source === "department") {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-700 border border-emerald-200 whitespace-nowrap">
        Department
      </span>
    );
  }
  if (source === "default") {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-md bg-blue-100 text-blue-700 border border-blue-200 whitespace-nowrap">
        Default
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-md bg-slate-100 text-slate-400 border border-slate-200 whitespace-nowrap">
      Unset
    </span>
  );
}

// ─── Workday Dots ─────────────────────────────────────────────────────────────

function WorkdayDots({ workdays }: { readonly workdays: string[] }) {
  return (
    <div className="flex gap-0.5">
      {ALL_DAYS.map(d => (
        <span
          key={d}
          title={d}
          className={[
            "h-5 w-5 rounded-full text-[9px] font-bold flex items-center justify-center",
            workdays.includes(d)
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-muted-foreground",
          ].join(" ")}
        >
          {DAY_ABBR[d]}
        </span>
      ))}
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ScheduleRosterTable({
  canEdit,
  refreshKey,
  onEditEmployee,
  onEditDepartment,
}: Readonly<{
  canEdit: boolean;
  refreshKey?: number;
  onEditEmployee: (userId: string, name: string, schedule: RosterEntry["schedule"]) => void;
  onEditDepartment?: (departmentId: string, departmentName: string, schedule: RosterEntry["schedule"]) => void;
}>) {
  const [roster, setRoster]           = useState<RosterEntry[]>([]);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState<string | null>(null);
  const [search, setSearch]           = useState("");
  const [deptFilter, setDeptFilter]   = useState("all");
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");

  const fetchRoster = () => {
    setLoading(true);
    setError(null);
    authFetch(`${API_BASE_URL}/timekeeping/schedules`)
      .then(r => r.ok ? r.json() : Promise.reject(r.statusText))
      .then((data: RosterEntry[]) => setRoster(data.map(normalizeRosterEntry)))
      .catch(() => setError("Failed to load schedule roster."))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchRoster(); }, [refreshKey]);

  const departments = useMemo(() => {
    const set = new Set(roster.map(r => r.department_name).filter(Boolean) as string[]);
    return Array.from(set).sort();
  }, [roster]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return roster.filter(r => {
      const name = `${r.first_name} ${r.last_name}`.toLowerCase();
      const matchSearch = !q || name.includes(q) || r.employee_id.toLowerCase().includes(q);
      const matchDept   = deptFilter === "all" || r.department_name === deptFilter;
      const source = r.schedule?.schedule_source ?? null;
      const matchSource =
        sourceFilter === "all" ? true :
        sourceFilter === "custom" ? source === "individual" :
        sourceFilter === "standard" ? source === "bulk" || source === "default" || source === "department" :
        sourceFilter === "department" ? source === "department" :
        sourceFilter === "default" ? source === "default" :
        !r.schedule || source === null;
      return matchSearch && matchDept && matchSource;
    });
  }, [roster, search, deptFilter, sourceFilter]);

  const departmentSchedules = useMemo(() => {
    type DepartmentSummary = {
      department_id: string;
      department_name: string;
      members: number;
      withSchedule: number;
      schedule: RosterEntry["schedule"];
    };

    const grouped = new Map<string, DepartmentSummary>();

    for (const row of roster) {
      if (!row.department_id || !row.department_name) continue;
      const key = row.department_id;
      const current = grouped.get(key) ?? {
        department_id: row.department_id,
        department_name: row.department_name,
        members: 0,
        withSchedule: 0,
        schedule: null,
      };
      current.members += 1;
      if (row.schedule) current.withSchedule += 1;
      grouped.set(key, current);
    }

    const byLatest = (a: RosterEntry["schedule"], b: RosterEntry["schedule"]) =>
      new Date(b?.updated_at ?? 0).getTime() - new Date(a?.updated_at ?? 0).getTime();

    for (const summary of grouped.values()) {
      const rows = roster.filter((row) => row.department_id === summary.department_id);
      const preferred = rows
        .map((row) => row.schedule)
        .filter((sched): sched is NonNullable<RosterEntry["schedule"]> =>
          Boolean(
            sched &&
            (sched.schedule_source === "department" ||
              sched.schedule_source === "bulk" ||
              sched.schedule_source === "default"),
          ),
        )
        .sort(byLatest);

      const fallback = rows
        .map((row) => row.schedule)
        .filter((sched): sched is NonNullable<RosterEntry["schedule"]> => Boolean(sched))
        .sort(byLatest);

      summary.schedule = preferred[0] ?? fallback[0] ?? null;
    }

    return Array.from(grouped.values()).sort((a, b) =>
      a.department_name.localeCompare(b.department_name),
    );
  }, [roster]);

  const customCount = roster.filter(r => r.schedule?.schedule_source === "individual").length;
  const unsetCount  = roster.filter(r => !r.schedule || r.schedule?.schedule_source === null).length;

  return (
    <div className="space-y-4">

      {/* Summary chips */}
      <div className="flex flex-wrap gap-2">
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border bg-card text-xs font-semibold">
          <Users className="h-3.5 w-3.5 text-muted-foreground" />
          {roster.length} employees
        </div>
        {customCount > 0 && (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-violet-200 bg-violet-50 text-xs font-semibold text-violet-700">
            {customCount} with custom schedules
          </div>
        )}
        {unsetCount > 0 && (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-amber-200 bg-amber-50 text-xs font-semibold text-amber-700">
            {unsetCount} without a schedule
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search employee..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-8 h-9 text-sm"
          />
        </div>

        <select
          value={deptFilter}
          onChange={e => setDeptFilter(e.target.value)}
          className="h-9 px-3 text-sm border border-border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 cursor-pointer"
        >
          <option value="all">All Departments</option>
          {departments.map(d => <option key={d} value={d}>{d}</option>)}
        </select>

        <select
          value={sourceFilter}
          onChange={e => setSourceFilter(e.target.value as SourceFilter)}
          className="h-9 px-3 text-sm border border-border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 cursor-pointer"
        >
          <option value="all">All Sources</option>
          <option value="custom">Custom only</option>
          <option value="standard">Standard only</option>
          <option value="department">Department only</option>
          <option value="default">Default only</option>
          <option value="unset">Unset only</option>
        </select>

        <Button
          variant="outline"
          size="icon"
          className="h-9 w-9 shrink-0"
          onClick={fetchRoster}
          title="Refresh"
        >
          <RefreshCw className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Department Schedule View */}
      <div className="rounded-xl border border-border overflow-hidden">
        <div className="px-4 py-3 border-b border-border bg-muted/20">
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
            Department Schedule View
          </p>
        </div>
        {loading ? (
          <div className="py-10 text-center text-sm text-muted-foreground">
            Loading department schedules...
          </div>
        ) : error ? (
          <div className="py-10 text-center text-sm text-destructive">
            Failed to load department schedules.
          </div>
        ) : departmentSchedules.length === 0 ? (
          <div className="py-10 text-center text-sm text-muted-foreground">
            No departments available yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="px-4 py-3 text-left text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Department</th>
                  <th className="px-4 py-3 text-left text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Coverage</th>
                  <th className="px-4 py-3 text-left text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Shift</th>
                  <th className="px-4 py-3 text-left text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Break</th>
                  <th className="px-4 py-3 text-left text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Work Days</th>
                  <th className="px-4 py-3 text-left text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Source</th>
                  {canEdit && onEditDepartment && (
                    <th className="px-4 py-3 text-right text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Action</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {departmentSchedules.map((dept) => {
                  const sched = dept.schedule;
                  const workdays = parseWorkdays(sched?.workdays ?? null);
                  return (
                    <tr key={dept.department_id} className="hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-3">
                        <p className="font-semibold">{dept.department_name}</p>
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {dept.withSchedule} / {dept.members} scheduled
                      </td>
                      <td className="px-4 py-3">
                        {sched ? (
                          <div className="flex items-center gap-1 text-xs font-semibold">
                            {formatClock(sched.start_time)}
                            <span className="text-muted-foreground">→</span>
                            {formatClock(sched.end_time)}
                            {sched.is_nightshift && (
                              <span className="text-[9px] bg-indigo-100 text-indigo-700 border border-indigo-200 px-1 py-0.5 rounded font-bold ml-1">Night</span>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground italic">No shared schedule</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {sched?.break_start && sched?.break_end
                          ? `${formatClock(sched.break_start)} - ${formatClock(sched.break_end)}`
                          : <span className="italic">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        {workdays.length > 0 ? (
                          <WorkdayDots workdays={workdays} />
                        ) : (
                          <span className="text-xs text-muted-foreground italic">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <SourceBadge
                          source={sched?.schedule_source ?? null}
                          startTime={sched?.start_time}
                          endTime={sched?.end_time}
                        />
                      </td>
                      {canEdit && onEditDepartment && (
                        <td className="px-4 py-3 text-right">
                          <button
                            onClick={() => onEditDepartment(dept.department_id, dept.department_name, sched)}
                            className="flex items-center gap-1.5 text-xs font-semibold text-primary hover:text-primary/80 transition-colors cursor-pointer ml-auto"
                          >
                            <CalendarDays className="h-3.5 w-3.5" />
                            {sched ? "Edit Dept" : "Set Dept Schedule"}
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Table */}
      <div className="rounded-xl border border-border overflow-hidden">
        {loading ? (
          <div className="py-16 text-center text-sm text-muted-foreground">Loading schedule roster...</div>
        ) : error ? (
          <div className="py-16 text-center text-sm text-destructive">{error}</div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center text-sm text-muted-foreground">No employees match your filters.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="px-4 py-3 text-left text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Employee</th>
                <th className="px-4 py-3 text-left text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Department</th>
                <th className="px-4 py-3 text-left text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Shift</th>
                <th className="px-4 py-3 text-left text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Break</th>
                <th className="px-4 py-3 text-left text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Work Days</th>
                <th className="px-4 py-3 text-left text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Source</th>
                <th className="px-4 py-3 text-left text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Last Updated By</th>
                {canEdit && (
                  <th className="px-4 py-3 text-right text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Action</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map(row => {
                const s = row.schedule;
                const workdays = parseWorkdays(s?.workdays ?? null);
                const name = `${row.first_name} ${row.last_name}`.trim();
                return (
                  <tr key={row.user_id} className="hover:bg-muted/20 transition-colors">
                    {/* Employee */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <div className="h-8 w-8 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-xs shrink-0 border border-primary/10">
                          {row.first_name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p className="font-semibold leading-tight">{name}</p>
                          <p className="text-[10px] text-muted-foreground font-mono">{row.employee_id}</p>
                        </div>
                      </div>
                    </td>

                    {/* Department */}
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {row.department_name ?? <span className="italic">—</span>}
                    </td>

                    {/* Shift */}
                    <td className="px-4 py-3">
                      {s ? (
                        <div className="flex items-center gap-1 text-xs font-semibold">
                          {formatClock(s.start_time)}
                          <span className="text-muted-foreground">→</span>
                          {formatClock(s.end_time)}
                          {s.is_nightshift && (
                            <span className="text-[9px] bg-indigo-100 text-indigo-700 border border-indigo-200 px-1 py-0.5 rounded font-bold ml-1">Night</span>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground italic">No schedule</span>
                      )}
                    </td>

                    {/* Break */}
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {s?.break_start && s?.break_end
                        ? `${formatClock(s.break_start)} - ${formatClock(s.break_end)}`
                        : <span className="italic">—</span>
                      }
                    </td>

                    {/* Work Days */}
                    <td className="px-4 py-3">
                      {workdays.length > 0
                        ? <WorkdayDots workdays={workdays} />
                        : <span className="text-xs text-muted-foreground italic">—</span>
                      }
                    </td>

                    {/* Source */}
                    <td className="px-4 py-3">
                      <SourceBadge
                        source={s?.schedule_source ?? null}
                        startTime={s?.start_time}
                        endTime={s?.end_time}
                      />
                    </td>

                    {/* Last Updated By */}
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {s?.updated_by_name ? (
                        <div>
                          <p className="font-medium text-foreground">{s.updated_by_name}</p>
                          {s.updated_at && (
                            <p className="text-[10px]">
                              {new Date(s.updated_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                            </p>
                          )}
                        </div>
                      ) : (
                        <span className="italic">—</span>
                      )}
                    </td>

                    {/* Action */}
                    {canEdit && (
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => onEditEmployee(row.user_id, name, s)}
                          className="flex items-center gap-1.5 text-xs font-semibold text-primary hover:text-primary/80 transition-colors cursor-pointer ml-auto"
                        >
                          <CalendarDays className="h-3.5 w-3.5" />
                          {canEdit ? "Edit" : "View"}
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {!loading && !error && (
        <p className="text-[10px] text-muted-foreground">
          Showing {filtered.length} of {roster.length} employees
          {customCount > 0 && (
            <> · <span className="text-violet-600 font-semibold">{customCount} with custom (individually-set) schedules</span></>
          )}
        </p>
      )}
    </div>
  );
}
