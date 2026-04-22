"use client";

import { useState, useEffect } from "react";
import { authFetch } from "@/lib/authApi";
import { API_BASE_URL } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  X, User, MapPin, CreditCard, Briefcase, ClipboardList,
  Lock, Pencil, Loader2, CheckCircle2, AlertTriangle, Hash,
  Building2, Calendar, Shield, Mail, Phone, Globe, Heart,
  Home, Banknote, AtSign, Clock, ChevronRight, Eye, EyeOff,
  UserCheck, UsersRound,
} from "lucide-react";
import { toast } from "sonner";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Role { role_id: string; role_name: string; }
export interface Department { department_id: string; department_name: string; }

export interface EmployeeRecord {
  user_id: string;
  employee_id: string;
  username: string;
  first_name: string;
  middle_name?: string | null;
  last_name: string;
  email: string;
  role_id: string | null;
  department_id: string | null;
  start_date: string | null;
  account_status: "Active" | "Inactive" | "Pending";
  last_login: string | null;
  invite_expires_at?: string | null;
  personal_email?: string | null;
  date_of_birth?: string | null;
  place_of_birth?: string | null;
  nationality?: string | null;
  civil_status?: string | null;
  complete_address?: string | null;
  bank_name?: string | null;
  bank_account_number?: string | null;
  bank_account_name?: string | null;
  avatar_url?: string | null;
  emergency_contacts?: Array<{
    contact_name: string;
    relationship: string;
    emergency_phone_number: string;
    emergency_email_address?: string | null;
  }> | null;
}

export interface OnboardingInfo {
  progress_percentage: number;
  status: string;
}

export type ViewerRole = "System Admin" | "HR" | "Manager";

interface Props {
  employee: EmployeeRecord;
  roles: Role[];
  departments: Department[];
  onboardingInfo?: OnboardingInfo | null;
  viewerRole: ViewerRole;
  onClose: () => void;
  onUpdated?: (updated: EmployeeRecord) => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STATUS_STYLES: Record<string, string> = {
  Active:   "bg-green-100 text-green-700 border-green-200",
  Inactive: "bg-red-100 text-red-700 border-red-200",
  Pending:  "bg-amber-100 text-amber-700 border-amber-200",
};

async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !(init.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const headersObj: Record<string, string> = {};
  headers.forEach((v, k) => { headersObj[k] = v; });
  const res = await authFetch(`${API_BASE_URL}${path}`, { ...init, headers: headersObj });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as any)?.message || "Request failed");
  return data as T;
}

function fmt(dateStr: string | null | undefined) {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  return Number.isNaN(d.getTime()) ? dateStr : d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}

function fmtDob(dateStr: string | null | undefined) {
  if (!dateStr) return "—";
  const d = new Date(dateStr + "T00:00:00");
  return Number.isNaN(d.getTime()) ? dateStr : d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}

function fmtDateTime(dateStr: string | null | undefined) {
  if (!dateStr) return "Never";
  const d = new Date(dateStr);
  return Number.isNaN(d.getTime()) ? "Unknown" : d.toLocaleString("en-US", { year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const cls = STATUS_STYLES[status] ?? "bg-gray-100 text-gray-700 border-gray-200";
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase border ${cls}`}>
      {status}
    </span>
  );
}

function RoleBadge({ viewerRole }: { viewerRole: ViewerRole }) {
  const map: Record<ViewerRole, { label: string; cls: string }> = {
    "System Admin": { label: "Full Edit Access", cls: "bg-violet-100 text-violet-700 border-violet-200" },
    "HR":           { label: "Employment Edit", cls: "bg-blue-100 text-blue-700 border-blue-200" },
    "Manager":      { label: "View Only", cls: "bg-gray-100 text-gray-600 border-gray-200" },
  };
  const { label, cls } = map[viewerRole];
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide rounded-full px-2.5 py-0.5 border ${cls}`}>
      {viewerRole === "System Admin" ? <Shield className="h-2.5 w-2.5" /> : viewerRole === "HR" ? <UserCheck className="h-2.5 w-2.5" /> : <Eye className="h-2.5 w-2.5" />}
      {label}
    </span>
  );
}

function InfoRow({ icon: Icon, label, value, masked }: {
  icon: React.ElementType; label: string; value?: string | null; masked?: boolean;
}) {
  const [show, setShow] = useState(!masked);
  const display = value || "—";
  return (
    <div className="flex items-start gap-3 py-2.5 border-b border-border/40 last:border-0">
      <div className="h-7 w-7 rounded-lg bg-muted flex items-center justify-center shrink-0 mt-0.5">
        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-0.5">{label}</p>
        {masked && value ? (
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium text-foreground">{show ? display : "••••••••"}</p>
            <button onClick={() => setShow(s => !s)} className="text-muted-foreground hover:text-foreground transition-colors">
              {show ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            </button>
          </div>
        ) : (
          <p className="text-sm font-medium text-foreground truncate">{display}</p>
        )}
      </div>
    </div>
  );
}

function SectionHeader({ title, icon: Icon, editable, onEdit, editing, saving, onSave, onCancel }: {
  title: string; icon: React.ElementType; editable?: boolean;
  onEdit?: () => void; editing?: boolean; saving?: boolean;
  onSave?: () => void; onCancel?: () => void;
}) {
  return (
    <div className="flex items-center justify-between mb-4">
      <div className="flex items-center gap-2">
        <div className="h-6 w-6 rounded-md bg-primary/10 flex items-center justify-center">
          <Icon className="h-3.5 w-3.5 text-primary" />
        </div>
        <h3 className="text-sm font-bold text-foreground">{title}</h3>
      </div>
      {editable && !editing && (
        <Button size="sm" variant="outline" className="h-7 px-2.5 text-xs gap-1 cursor-pointer" onClick={onEdit}>
          <Pencil className="h-3 w-3" /> Edit
        </Button>
      )}
      {editing && (
        <div className="flex gap-1.5">
          <Button size="sm" className="h-7 px-2.5 text-xs gap-1 cursor-pointer" onClick={onSave} disabled={saving}>
            {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />} Save
          </Button>
          <Button size="sm" variant="outline" className="h-7 px-2.5 text-xs cursor-pointer" onClick={onCancel} disabled={saving}>
            Cancel
          </Button>
        </div>
      )}
    </div>
  );
}

function OnboardingProgress({ info }: { info: OnboardingInfo }) {
  const pct = info.progress_percentage;
  const statusLabel = info.status === "approved" ? "Completed" : info.status;
  const barColor = pct === 100 ? "bg-green-500" : pct >= 60 ? "bg-blue-500" : "bg-amber-500";
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-foreground capitalize">{statusLabel}</p>
          <p className="text-xs text-muted-foreground mt-0.5">Onboarding progress</p>
        </div>
        <span className={`text-2xl font-bold ${pct === 100 ? "text-green-600" : pct >= 60 ? "text-blue-600" : "text-amber-600"}`}>
          {pct}%
        </span>
      </div>
      <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-500 ${barColor}`} style={{ width: `${pct}%` }} />
      </div>
      {pct === 100 && (
        <div className="flex items-center gap-2 text-green-600 text-xs font-medium">
          <CheckCircle2 className="h-3.5 w-3.5" /> Onboarding completed & approved
        </div>
      )}
    </div>
  );
}

// ─── Confirmation Dialog ───────────────────────────────────────────────────────

function ConfirmEditDialog({
  fields,
  onConfirm,
  onCancel,
  saving,
}: {
  fields: Array<{ label: string; before: string; after: string }>;
  onConfirm: () => void;
  onCancel: () => void;
  saving: boolean;
}) {
  const changed = fields.filter(f => f.before !== f.after);
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
      <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-md animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-center gap-3 px-6 py-5 border-b border-border">
          <div className="p-2 bg-amber-100 rounded-lg text-amber-600 shrink-0">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <div>
            <h3 className="font-bold text-foreground">Confirm Changes</h3>
            <p className="text-xs text-muted-foreground">Review before saving to employee record</p>
          </div>
        </div>
        <div className="px-6 py-5 space-y-3">
          {changed.length === 0 ? (
            <p className="text-sm text-muted-foreground">No changes detected.</p>
          ) : changed.map((f, i) => (
            <div key={i} className="rounded-lg bg-muted/40 border border-border px-4 py-3 space-y-1">
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{f.label}</p>
              <div className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground line-through">{f.before || "—"}</span>
                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <span className="font-semibold text-foreground">{f.after || "—"}</span>
              </div>
            </div>
          ))}
        </div>
        <div className="flex gap-3 px-6 pb-6">
          <Button variant="outline" className="flex-1" onClick={onCancel} disabled={saving}>Cancel</Button>
          <Button className="flex-1" onClick={onConfirm} disabled={saving || changed.length === 0}>
            {saving ? <><Loader2 className="h-4 w-4 animate-spin mr-1.5" />Saving…</> : "Confirm & Save"}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Tab Definitions ──────────────────────────────────────────────────────────

const TABS = [
  { id: "overview",   label: "Overview",   icon: User },
  { id: "personal",   label: "Personal",   icon: Shield },
  { id: "contact",    label: "Contact",    icon: MapPin },
  { id: "bank",       label: "Bank",       icon: CreditCard },
  { id: "emergency",  label: "Emergency",  icon: UsersRound },
  { id: "onboarding", label: "Onboarding", icon: ClipboardList },
] as const;

type TabId = typeof TABS[number]["id"];

// ─── Main Component ────────────────────────────────────────────────────────────

export function EmployeeProfileSheet({
  employee: initialEmployee,
  roles,
  departments,
  onboardingInfo,
  viewerRole,
  onClose,
  onUpdated,
}: Props) {
  const [profile, setProfile] = useState<EmployeeRecord>(initialEmployee);
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [activeTab, setActiveTab] = useState<TabId>("overview");

  // Employment edit state (HR + System Admin)
  const [editingEmployment, setEditingEmployment] = useState(false);
  const [employmentDraft, setEmploymentDraft] = useState({
    first_name: initialEmployee.first_name,
    middle_name: initialEmployee.middle_name ?? "",
    last_name: initialEmployee.last_name,
    role_id: initialEmployee.role_id ?? "",
    department_id: initialEmployee.department_id ?? "",
    start_date: initialEmployee.start_date ?? "",
  });
  const [confirmEmployment, setConfirmEmployment] = useState(false);
  const [savingEmployment, setSavingEmployment] = useState(false);

  // Extended edit state (System Admin only)
  const [editingPersonal, setEditingPersonal] = useState(false);
  const [personalDraft, setPersonalDraft] = useState({
    date_of_birth: initialEmployee.date_of_birth ?? "",
    place_of_birth: initialEmployee.place_of_birth ?? "",
    nationality: initialEmployee.nationality ?? "",
    civil_status: initialEmployee.civil_status ?? "",
  });
  const [confirmPersonal, setConfirmPersonal] = useState(false);
  const [savingPersonal, setSavingPersonal] = useState(false);

  const [editingContact, setEditingContact] = useState(false);
  const [contactDraft, setContactDraft] = useState({
    personal_email: initialEmployee.personal_email ?? "",
    complete_address: initialEmployee.complete_address ?? "",
  });
  const [confirmContact, setConfirmContact] = useState(false);
  const [savingContact, setSavingContact] = useState(false);

  const [editingBank, setEditingBank] = useState(false);
  const [bankDraft, setBankDraft] = useState({
    bank_name: initialEmployee.bank_name ?? "",
    bank_account_number: initialEmployee.bank_account_number ?? "",
    bank_account_name: initialEmployee.bank_account_name ?? "",
  });
  const [confirmBank, setConfirmBank] = useState(false);
  const [savingBank, setSavingBank] = useState(false);

  // Fetch full extended profile on open
  useEffect(() => {
    setLoadingProfile(true);
    apiFetch<EmployeeRecord>(`/users/${initialEmployee.user_id}`)
      .then((data) => {
        setProfile(data);
        setEmploymentDraft({
          first_name: data.first_name,
          middle_name: data.middle_name ?? "",
          last_name: data.last_name,
          role_id: data.role_id ?? "",
          department_id: data.department_id ?? "",
          start_date: data.start_date ?? "",
        });
        setPersonalDraft({
          date_of_birth: data.date_of_birth ?? "",
          place_of_birth: data.place_of_birth ?? "",
          nationality: data.nationality ?? "",
          civil_status: data.civil_status ?? "",
        });
        setContactDraft({
          personal_email: data.personal_email ?? "",
          complete_address: data.complete_address ?? "",
        });
        setBankDraft({
          bank_name: data.bank_name ?? "",
          bank_account_number: data.bank_account_number ?? "",
          bank_account_name: data.bank_account_name ?? "",
        });
      })
      .catch(() => {/* silently use initialEmployee data */})
      .finally(() => setLoadingProfile(false));
  }, [initialEmployee.user_id]);

  const displayName = [profile.first_name, profile.middle_name, profile.last_name].filter(Boolean).join(" ");
  const roleName = roles.find(r => r.role_id === profile.role_id)?.role_name ?? "—";
  const deptName = departments.find(d => d.department_id === profile.department_id)?.department_name ?? "—";
  const initials = displayName.charAt(0).toUpperCase();

  const canEditEmployment = viewerRole === "System Admin" || viewerRole === "HR";
  const canEditPersonal   = viewerRole === "System Admin";
  const canEditContact    = viewerRole === "System Admin";
  const canEditBank       = viewerRole === "System Admin";
  const canSeeBank        = viewerRole === "System Admin" || viewerRole === "HR";

  // ── Save helpers ──────────────────────────────────────────────────────────
  const saveEmployment = async () => {
    setSavingEmployment(true);
    try {
      const updated = await apiFetch<EmployeeRecord>(`/users/${profile.user_id}`, {
        method: "PATCH",
        body: JSON.stringify({
          first_name: employmentDraft.first_name.trim() || undefined,
          middle_name: employmentDraft.middle_name.trim() || null,
          last_name: employmentDraft.last_name.trim() || undefined,
          role_id: employmentDraft.role_id || null,
          department_id: employmentDraft.department_id || null,
          start_date: employmentDraft.start_date || null,
        }),
      });
      const merged = { ...profile, ...updated };
      setProfile(merged);
      onUpdated?.(merged);
      setEditingEmployment(false);
      setConfirmEmployment(false);
      toast.success("Employment details updated.");
    } catch (err: any) {
      toast.error(err?.message || "Failed to save.");
    } finally {
      setSavingEmployment(false);
    }
  };

  const savePersonal = async () => {
    setSavingPersonal(true);
    try {
      const updated = await apiFetch<EmployeeRecord>(`/users/${profile.user_id}`, {
        method: "PATCH",
        body: JSON.stringify({
          date_of_birth:  personalDraft.date_of_birth  || null,
          place_of_birth: personalDraft.place_of_birth.trim() || null,
          nationality:    personalDraft.nationality.trim()    || null,
          civil_status:   personalDraft.civil_status          || null,
        }),
      });
      const merged = { ...profile, ...updated };
      setProfile(merged);
      onUpdated?.(merged);
      setEditingPersonal(false);
      setConfirmPersonal(false);
      toast.success("Personal details updated.");
    } catch (err: any) {
      toast.error(err?.message || "Failed to save.");
    } finally {
      setSavingPersonal(false);
    }
  };

  const saveContact = async () => {
    setSavingContact(true);
    try {
      const updated = await apiFetch<EmployeeRecord>(`/users/${profile.user_id}`, {
        method: "PATCH",
        body: JSON.stringify({
          personal_email:   contactDraft.personal_email.trim()  || null,
          complete_address: contactDraft.complete_address.trim() || null,
        }),
      });
      const merged = { ...profile, ...updated };
      setProfile(merged);
      onUpdated?.(merged);
      setEditingContact(false);
      setConfirmContact(false);
      toast.success("Contact details updated.");
    } catch (err: any) {
      toast.error(err?.message || "Failed to save.");
    } finally {
      setSavingContact(false);
    }
  };

  const saveBank = async () => {
    setSavingBank(true);
    try {
      const updated = await apiFetch<EmployeeRecord>(`/users/${profile.user_id}`, {
        method: "PATCH",
        body: JSON.stringify({
          bank_name:           bankDraft.bank_name.trim()           || null,
          bank_account_number: bankDraft.bank_account_number.trim() || null,
          bank_account_name:   bankDraft.bank_account_name.trim()   || null,
        }),
      });
      const merged = { ...profile, ...updated };
      setProfile(merged);
      onUpdated?.(merged);
      setEditingBank(false);
      setConfirmBank(false);
      toast.success("Bank account updated.");
    } catch (err: any) {
      toast.error(err?.message || "Failed to save.");
    } finally {
      setSavingBank(false);
    }
  };

  // Visible tabs
  const visibleTabs = TABS.filter(t => {
    if (t.id === "bank" && !canSeeBank) return false;
    if (t.id === "onboarding" && !onboardingInfo) return false;
    return true;
  });

  const fieldCls = "h-9 rounded-md border bg-transparent px-3 shadow-xs text-sm disabled:bg-muted/40 disabled:text-muted-foreground";

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-50 flex">
        <button
          type="button"
          className="absolute inset-0 bg-black/40 backdrop-blur-sm cursor-default"
          aria-label="Close"
          onClick={onClose}
        />

        {/* Panel */}
        <div className="relative ml-auto h-full w-full max-w-2xl bg-background shadow-2xl flex flex-col animate-in slide-in-from-right duration-300">

          {/* ── Header ──────────────────────────────────────────────────────── */}
          <div className="shrink-0 bg-[linear-gradient(135deg,#0f172a_0%,#172554_60%,#134e4a_100%)] text-white px-6 py-6">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-4">
                {/* Avatar */}
                <div className="h-16 w-16 rounded-2xl overflow-hidden bg-white/10 border-2 border-white/20 flex items-center justify-center text-white font-bold text-2xl shrink-0">
                  {profile.avatar_url ? (
                    <img src={profile.avatar_url} alt={displayName} className="h-full w-full object-cover" />
                  ) : initials}
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/60 mb-1">Employee Profile</p>
                  <h2 className="text-xl font-bold leading-tight">{displayName || profile.email}</h2>
                  <p className="text-sm text-white/70 mt-0.5">{profile.email}</p>
                  <div className="flex items-center gap-2 mt-2 flex-wrap">
                    <StatusBadge status={profile.account_status} />
                    <RoleBadge viewerRole={viewerRole} />
                  </div>
                </div>
              </div>
              <button
                onClick={onClose}
                className="p-2 rounded-lg hover:bg-white/10 text-white/60 hover:text-white transition-colors shrink-0"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Quick stat chips */}
            <div className="flex items-center gap-3 mt-5 flex-wrap">
              {[
                { icon: Hash,      val: profile.employee_id || "—" },
                { icon: Shield,    val: roleName },
                { icon: Building2, val: deptName },
                { icon: Calendar,  val: profile.start_date ? fmt(profile.start_date) : "No start date" },
              ].map(({ icon: Icon, val }, i) => (
                <div key={i} className="flex items-center gap-1.5 bg-white/10 rounded-full px-3 py-1 text-xs font-medium text-white/85 border border-white/15">
                  <Icon className="h-3 w-3 text-white/50 shrink-0" />
                  {val}
                </div>
              ))}
            </div>
          </div>

          {/* ── Tab bar ─────────────────────────────────────────────────────── */}
          <div className="shrink-0 flex items-center gap-0 border-b border-border bg-muted/20 px-2 overflow-x-auto">
            {visibleTabs.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setActiveTab(id)}
                className={`flex items-center gap-1.5 px-4 py-3 text-xs font-semibold whitespace-nowrap border-b-2 transition-all duration-200 cursor-pointer ${
                  activeTab === id
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
              </button>
            ))}
          </div>

          {/* ── Body ────────────────────────────────────────────────────────── */}
          <div className="flex-1 overflow-y-auto">
            {loadingProfile ? (
              <div className="flex items-center justify-center h-full gap-2 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" />
                <span className="text-sm">Loading profile…</span>
              </div>
            ) : (
              <div className="p-6 space-y-6">

                {/* ── Overview ──────────────────────────────────────────────── */}
                {activeTab === "overview" && (
                  <div className="space-y-6">
                    {/* Account info */}
                    <div className="bg-card border border-border rounded-xl p-5">
                      <SectionHeader title="Account" icon={User} />
                      <div className="space-y-0.5">
                        <InfoRow icon={Hash}      label="Employee ID"  value={profile.employee_id} />
                        <InfoRow icon={AtSign}    label="Username"     value={profile.username} />
                        <InfoRow icon={Mail}      label="Work Email"   value={profile.email} />
                        <InfoRow icon={Clock}     label="Last Login"   value={fmtDateTime(profile.last_login)} />
                        <InfoRow icon={Calendar}  label="Start Date"   value={fmt(profile.start_date)} />
                      </div>
                    </div>

                    {/* Employment */}
                    <div className="bg-card border border-border rounded-xl p-5">
                      <SectionHeader title="Employment" icon={Briefcase} />
                      <div className="space-y-0.5">
                        <InfoRow icon={Shield}    label="Role"        value={roleName} />
                        <InfoRow icon={Building2} label="Department"  value={deptName} />
                      </div>
                    </div>

                    {/* Status notice for pending */}
                    {profile.account_status === "Pending" && profile.invite_expires_at && (
                      <div className="rounded-xl bg-amber-50 border border-amber-200 p-4">
                        <p className="text-sm font-semibold text-amber-800 mb-0.5">Invite Pending</p>
                        <p className="text-xs text-amber-700">Expires {fmtDateTime(profile.invite_expires_at)}</p>
                      </div>
                    )}
                    {profile.account_status === "Inactive" && (
                      <div className="rounded-xl bg-red-50 border border-red-200 p-4 flex items-center gap-3">
                        <AlertTriangle className="h-4 w-4 text-red-500 shrink-0" />
                        <p className="text-sm text-red-700 font-medium">This account is deactivated.</p>
                      </div>
                    )}
                  </div>
                )}

                {/* ── Personal ──────────────────────────────────────────────── */}
                {activeTab === "personal" && (
                  <div className="space-y-5">
                    {/* Employment / Identity — editable by HR + Admin */}
                    <div className="bg-card border border-border rounded-xl p-5">
                      <SectionHeader
                        title="Identity & Employment"
                        icon={Briefcase}
                        editable={canEditEmployment}
                        editing={editingEmployment}
                        saving={savingEmployment}
                        onEdit={() => setEditingEmployment(true)}
                        onSave={() => setConfirmEmployment(true)}
                        onCancel={() => { setEditingEmployment(false); setEmploymentDraft({ first_name: profile.first_name, middle_name: profile.middle_name ?? "", last_name: profile.last_name, role_id: profile.role_id ?? "", department_id: profile.department_id ?? "", start_date: profile.start_date ?? "" }); }}
                      />

                      {!canEditEmployment && (
                        <div className="flex items-center gap-2 mb-4 rounded-lg bg-muted/40 border border-border px-3 py-2">
                          <Eye className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          <p className="text-xs text-muted-foreground">Read-only — managers cannot edit employee records</p>
                        </div>
                      )}

                      <div className="grid sm:grid-cols-3 gap-3 mb-4">
                        {[
                          { label: "First Name",  key: "first_name"  },
                          { label: "Middle Name", key: "middle_name" },
                          { label: "Last Name",   key: "last_name"   },
                        ].map(({ label, key }) => (
                          <div key={key} className="space-y-1.5">
                            <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{label}</label>
                            <Input
                              value={(employmentDraft as any)[key]}
                              onChange={e => setEmploymentDraft(d => ({ ...d, [key]: e.target.value }))}
                              disabled={!editingEmployment}
                              className={fieldCls}
                              placeholder={key === "middle_name" ? "Optional" : label}
                            />
                          </div>
                        ))}
                      </div>

                      <div className="grid sm:grid-cols-2 gap-3 mb-4">
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Role</label>
                          {editingEmployment ? (
                            <Select value={employmentDraft.role_id} onValueChange={v => setEmploymentDraft(d => ({ ...d, role_id: v }))}>
                              <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Select role" /></SelectTrigger>
                              <SelectContent>
                                {roles.map(r => <SelectItem key={r.role_id} value={r.role_id}>{r.role_name}</SelectItem>)}
                              </SelectContent>
                            </Select>
                          ) : (
                            <Input value={roleName} disabled className={fieldCls} />
                          )}
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Department</label>
                          {editingEmployment ? (
                            <Select value={employmentDraft.department_id || "__none__"} onValueChange={v => setEmploymentDraft(d => ({ ...d, department_id: v === "__none__" ? "" : v }))}>
                              <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Select department" /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="__none__">— None —</SelectItem>
                                {departments.map(dept => <SelectItem key={dept.department_id} value={dept.department_id}>{dept.department_name}</SelectItem>)}
                              </SelectContent>
                            </Select>
                          ) : (
                            <Input value={deptName} disabled className={fieldCls} />
                          )}
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Start Date</label>
                          <Input
                            type={editingEmployment ? "date" : "text"}
                            value={editingEmployment ? employmentDraft.start_date : fmt(profile.start_date)}
                            onChange={e => setEmploymentDraft(d => ({ ...d, start_date: e.target.value }))}
                            disabled={!editingEmployment}
                            className={fieldCls}
                          />
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Work Email</label>
                          <div className="relative">
                            <Input value={profile.email} disabled className={`${fieldCls} pr-8`} />
                            <Lock className="absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Personal Demographics — System Admin only editable */}
                    <div className="bg-card border border-border rounded-xl p-5">
                      <SectionHeader
                        title="Personal Demographics"
                        icon={User}
                        editable={canEditPersonal}
                        editing={editingPersonal}
                        saving={savingPersonal}
                        onEdit={() => setEditingPersonal(true)}
                        onSave={() => setConfirmPersonal(true)}
                        onCancel={() => { setEditingPersonal(false); setPersonalDraft({ date_of_birth: profile.date_of_birth ?? "", place_of_birth: profile.place_of_birth ?? "", nationality: profile.nationality ?? "", civil_status: profile.civil_status ?? "" }); }}
                      />

                      {!canEditPersonal && (
                        <div className="flex items-center gap-2 mb-4 rounded-lg bg-muted/40 border border-border px-3 py-2">
                          <Lock className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          <p className="text-xs text-muted-foreground">Employee self-service — only System Admin can update these</p>
                        </div>
                      )}

                      {!editingPersonal ? (
                        <div className="space-y-0.5">
                          <InfoRow icon={Calendar} label="Date of Birth"  value={fmtDob(profile.date_of_birth)} />
                          <InfoRow icon={MapPin}   label="Place of Birth" value={profile.place_of_birth} />
                          <InfoRow icon={Globe}    label="Nationality"    value={profile.nationality} />
                          <InfoRow icon={Heart}    label="Civil Status"   value={profile.civil_status} />
                        </div>
                      ) : (
                        <div className="grid sm:grid-cols-2 gap-3">
                          <div className="space-y-1.5">
                            <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Date of Birth</label>
                            <Input type="date" value={personalDraft.date_of_birth} onChange={e => setPersonalDraft(d => ({ ...d, date_of_birth: e.target.value }))} className={fieldCls} />
                          </div>
                          <div className="space-y-1.5">
                            <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Place of Birth</label>
                            <Input value={personalDraft.place_of_birth} onChange={e => setPersonalDraft(d => ({ ...d, place_of_birth: e.target.value }))} placeholder="City, Province" className={fieldCls} />
                          </div>
                          <div className="space-y-1.5">
                            <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Nationality</label>
                            <Input value={personalDraft.nationality} onChange={e => setPersonalDraft(d => ({ ...d, nationality: e.target.value }))} placeholder="e.g. Filipino" className={fieldCls} />
                          </div>
                          <div className="space-y-1.5">
                            <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Civil Status</label>
                            <Select value={personalDraft.civil_status || "__none__"} onValueChange={v => setPersonalDraft(d => ({ ...d, civil_status: v === "__none__" ? "" : v }))}>
                              <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Select" /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="__none__">— Not set —</SelectItem>
                                {["Single","Married","Widowed","Separated"].map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* ── Contact ───────────────────────────────────────────────── */}
                {activeTab === "contact" && (
                  <div className="bg-card border border-border rounded-xl p-5">
                    <SectionHeader
                      title="Contact & Address"
                      icon={MapPin}
                      editable={canEditContact}
                      editing={editingContact}
                      saving={savingContact}
                      onEdit={() => setEditingContact(true)}
                      onSave={() => setConfirmContact(true)}
                      onCancel={() => { setEditingContact(false); setContactDraft({ personal_email: profile.personal_email ?? "", complete_address: profile.complete_address ?? "" }); }}
                    />

                    {!canEditContact && (
                      <div className="flex items-center gap-2 mb-4 rounded-lg bg-muted/40 border border-border px-3 py-2">
                        <Lock className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        <p className="text-xs text-muted-foreground">Employee self-service — only System Admin can update these</p>
                      </div>
                    )}

                    {!editingContact ? (
                      <div className="space-y-0.5">
                        <InfoRow icon={Mail}  label="Personal Email"   value={profile.personal_email} />
                        <InfoRow icon={Home}  label="Complete Address" value={profile.complete_address} />
                      </div>
                    ) : (
                      <div className="space-y-4">
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Personal Email</label>
                          <Input type="email" value={contactDraft.personal_email} onChange={e => setContactDraft(d => ({ ...d, personal_email: e.target.value }))} placeholder="personal@email.com" className={fieldCls} />
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Complete Address</label>
                          <Textarea value={contactDraft.complete_address} onChange={e => setContactDraft(d => ({ ...d, complete_address: e.target.value }))} placeholder="Street, Barangay, City, Province, ZIP" className="min-h-[90px] rounded-md border bg-transparent px-3 shadow-xs resize-none text-sm" />
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* ── Bank ──────────────────────────────────────────────────── */}
                {activeTab === "bank" && canSeeBank && (
                  <div className="space-y-4">
                    {viewerRole === "HR" && (
                      <div className="flex items-center gap-2.5 rounded-xl bg-blue-50 border border-blue-200 px-4 py-3">
                        <Shield className="h-4 w-4 text-blue-600 shrink-0" />
                        <p className="text-sm text-blue-700 font-medium">
                          HR view — bank details are read-only. Employees update via change requests.
                        </p>
                      </div>
                    )}
                    <div className="bg-card border border-border rounded-xl p-5">
                      <SectionHeader
                        title="Bank Account"
                        icon={CreditCard}
                        editable={canEditBank}
                        editing={editingBank}
                        saving={savingBank}
                        onEdit={() => setEditingBank(true)}
                        onSave={() => setConfirmBank(true)}
                        onCancel={() => { setEditingBank(false); setBankDraft({ bank_name: profile.bank_name ?? "", bank_account_number: profile.bank_account_number ?? "", bank_account_name: profile.bank_account_name ?? "" }); }}
                      />

                      {!editingBank ? (
                        <div className="space-y-0.5">
                          <InfoRow icon={Banknote} label="Bank Name"       value={profile.bank_name} />
                          <InfoRow icon={Hash}     label="Account Number"  value={profile.bank_account_number} masked />
                          <InfoRow icon={User}     label="Account Name"    value={profile.bank_account_name} />
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {[
                            { label: "Bank Name",       key: "bank_name",           ph: "e.g. BDO, BPI, Metrobank" },
                            { label: "Account Number",  key: "bank_account_number", ph: "00000-0000000-0" },
                            { label: "Account Name",    key: "bank_account_name",   ph: "Full name on account" },
                          ].map(({ label, key, ph }) => (
                            <div key={key} className="space-y-1.5">
                              <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{label}</label>
                              <Input value={(bankDraft as any)[key]} onChange={e => setBankDraft(d => ({ ...d, [key]: e.target.value }))} placeholder={ph} className={fieldCls} />
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* ── Emergency Contacts ────────────────────────────────────── */}
                {activeTab === "emergency" && (
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 rounded-xl bg-muted/40 border border-border px-4 py-3">
                      <Lock className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      <p className="text-xs text-muted-foreground">Employee self-service — contacts are updated by the employee from their own profile.</p>
                    </div>
                    <div className="bg-card border border-border rounded-xl p-5">
                      <SectionHeader title="Emergency Contacts" icon={UsersRound} />
                      {(!profile.emergency_contacts || profile.emergency_contacts.length === 0) ? (
                        <p className="text-sm text-muted-foreground italic">No emergency contacts on file.</p>
                      ) : (
                        <div className="space-y-3">
                          {profile.emergency_contacts.map((c, idx) => (
                            <div key={idx} className="rounded-xl border border-border bg-muted/20 p-4 grid sm:grid-cols-2 gap-2.5">
                              <div>
                                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-0.5">Name</p>
                                <p className="text-sm font-semibold text-foreground">{c.contact_name || "—"}</p>
                              </div>
                              <div>
                                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-0.5">Relationship</p>
                                <p className="text-sm text-foreground">{c.relationship || "—"}</p>
                              </div>
                              <div className="flex items-center gap-2">
                                <Phone className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                <p className="text-sm text-foreground">{c.emergency_phone_number || "—"}</p>
                              </div>
                              {c.emergency_email_address && (
                                <div className="flex items-center gap-2">
                                  <Mail className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                  <p className="text-sm text-foreground">{c.emergency_email_address}</p>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* ── Onboarding ────────────────────────────────────────────── */}
                {activeTab === "onboarding" && onboardingInfo && (
                  <div className="space-y-4">
                    <div className="bg-card border border-border rounded-xl p-5">
                      <SectionHeader title="Onboarding Progress" icon={ClipboardList} />
                      <OnboardingProgress info={onboardingInfo} />
                    </div>

                    {onboardingInfo.status === "approved" && (
                      <div className="rounded-xl bg-green-50 border border-green-200 px-5 py-4 flex items-center gap-3">
                        <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0" />
                        <div>
                          <p className="text-sm font-semibold text-green-800">Converted Employee</p>
                          <p className="text-xs text-green-700 mt-0.5">This employee was onboarded through the HRIS portal.</p>
                        </div>
                      </div>
                    )}

                    {onboardingInfo.status !== "approved" && (
                      <div className="rounded-xl bg-amber-50 border border-amber-200 px-5 py-4 flex items-center gap-3">
                        <Clock className="h-5 w-5 text-amber-600 shrink-0" />
                        <div>
                          <p className="text-sm font-semibold text-amber-800 capitalize">Status: {onboardingInfo.status}</p>
                          <p className="text-xs text-amber-700 mt-0.5">Onboarding is still in progress or pending approval.</p>
                        </div>
                      </div>
                    )}
                  </div>
                )}

              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Confirmation Dialogs ──────────────────────────────────────────────── */}
      {confirmEmployment && (
        <ConfirmEditDialog
          fields={[
            { label: "First Name",  before: profile.first_name,             after: employmentDraft.first_name },
            { label: "Middle Name", before: profile.middle_name ?? "",       after: employmentDraft.middle_name },
            { label: "Last Name",   before: profile.last_name,              after: employmentDraft.last_name },
            { label: "Role",        before: roles.find(r => r.role_id === profile.role_id)?.role_name ?? "",         after: roles.find(r => r.role_id === employmentDraft.role_id)?.role_name ?? "" },
            { label: "Department",  before: departments.find(d => d.department_id === profile.department_id)?.department_name ?? "", after: departments.find(d => d.department_id === employmentDraft.department_id)?.department_name ?? "" },
            { label: "Start Date",  before: fmt(profile.start_date),        after: fmt(employmentDraft.start_date || null) },
          ]}
          onConfirm={saveEmployment}
          onCancel={() => setConfirmEmployment(false)}
          saving={savingEmployment}
        />
      )}
      {confirmPersonal && (
        <ConfirmEditDialog
          fields={[
            { label: "Date of Birth",  before: fmtDob(profile.date_of_birth),  after: fmtDob(personalDraft.date_of_birth || null) },
            { label: "Place of Birth", before: profile.place_of_birth ?? "",    after: personalDraft.place_of_birth },
            { label: "Nationality",    before: profile.nationality ?? "",        after: personalDraft.nationality },
            { label: "Civil Status",   before: profile.civil_status ?? "",       after: personalDraft.civil_status },
          ]}
          onConfirm={savePersonal}
          onCancel={() => setConfirmPersonal(false)}
          saving={savingPersonal}
        />
      )}
      {confirmContact && (
        <ConfirmEditDialog
          fields={[
            { label: "Personal Email",   before: profile.personal_email ?? "",   after: contactDraft.personal_email },
            { label: "Complete Address", before: profile.complete_address ?? "",  after: contactDraft.complete_address },
          ]}
          onConfirm={saveContact}
          onCancel={() => setConfirmContact(false)}
          saving={savingContact}
        />
      )}
      {confirmBank && (
        <ConfirmEditDialog
          fields={[
            { label: "Bank Name",       before: profile.bank_name ?? "",           after: bankDraft.bank_name },
            { label: "Account Number",  before: profile.bank_account_number ?? "", after: bankDraft.bank_account_number },
            { label: "Account Name",    before: profile.bank_account_name ?? "",   after: bankDraft.bank_account_name },
          ]}
          onConfirm={saveBank}
          onCancel={() => setConfirmBank(false)}
          saving={savingBank}
        />
      )}
    </>
  );
}
