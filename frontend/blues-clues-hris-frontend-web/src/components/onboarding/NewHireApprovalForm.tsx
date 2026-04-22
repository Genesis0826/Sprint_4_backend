"use client";

import { useState, useEffect, useRef } from "react";
import {
  getMyOnboarding,
  saveOnboarding,
  submitOnboarding,
  getApplicantProfile,
  OnboardingSubmission,
} from "@/lib/authApi";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  CheckCircle, Clock, AlertTriangle, Send, RefreshCw,
  Plus, Minus, Loader2, User, Phone, KeyRound, Briefcase,
  ChevronRight,
} from "lucide-react";
import { toast } from "sonner";

// ─── Types ────────────────────────────────────────────────────────────────────

type EmergencyContact = {
  contact_name: string;
  relationship: string;
  emergency_phone_number: string;
  emergency_email_address: string;
};

type FormData = {
  first_name: string;
  last_name: string;
  phone: string;
  address: string;
  date_of_birth: string;
  nationality: string;
  civil_status: string;
  preferred_username: string;
};

// ─── DOB Picker ───────────────────────────────────────────────────────────────

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function getDaysInMonth(month: number, year: number) {
  return new Date(year, month, 0).getDate();
}

function DOBPicker({
  value,
  onChange,
  disabled,
}: Readonly<{ value: string; onChange: (v: string) => void; disabled?: boolean }>) {
  // Internal state so partial selections (e.g. picking Month before Day/Year)
  // are preserved without snapping back to blank.
  const fromValue = (v: string) => {
    const parts = v ? v.split("-") : ["", "", ""];
    return { y: parts[0] ?? "", m: parts[1] ?? "", d: parts[2] ?? "" };
  };
  const initial = fromValue(value);
  const [selYear,  setSelYear]  = useState(initial.y);
  const [selMonth, setSelMonth] = useState(initial.m);
  const [selDay,   setSelDay]   = useState(initial.d);

  // Sync when parent value changes (e.g. autofill overwrites the field)
  const prevValue = useRef(value);
  useEffect(() => {
    if (value !== prevValue.current) {
      prevValue.current = value;
      const { y, m, d } = fromValue(value);
      setSelYear(y);
      setSelMonth(m);
      setSelDay(d);
    }
  }, [value]);

  const numYear  = parseInt(selYear)  || 0;
  const numMonth = parseInt(selMonth) || 0;
  const maxDay   = numYear && numMonth ? getDaysInMonth(numMonth, numYear) : 31;

  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 100 }, (_, i) => currentYear - i);
  const days  = Array.from({ length: maxDay }, (_, i) => i + 1);

  // Only notify parent when all three parts are filled; never reset to ""
  // mid-selection so the selects don't snap back.
  function tryEmit(y: string, m: string, d: string) {
    if (y && m && d) {
      const clampedDay = Math.min(parseInt(d), getDaysInMonth(parseInt(m), parseInt(y)));
      onChange(`${y}-${m.padStart(2, "0")}-${String(clampedDay).padStart(2, "0")}`);
    }
  }

  const selectClass =
    "flex h-9 w-full rounded-lg border border-slate-200 bg-white px-3 py-1 text-sm text-slate-800 shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-slate-50 cursor-pointer";

  return (
    <div className="grid grid-cols-3 gap-2">
      <select
        value={selMonth}
        onChange={(e) => { setSelMonth(e.target.value); tryEmit(selYear, e.target.value, selDay); }}
        disabled={disabled}
        className={selectClass}
        aria-label="Month"
      >
        <option value="">Month</option>
        {MONTHS.map((m, i) => (
          <option key={m} value={String(i + 1).padStart(2, "0")}>{m}</option>
        ))}
      </select>
      <select
        value={selDay}
        onChange={(e) => { setSelDay(e.target.value); tryEmit(selYear, selMonth, e.target.value); }}
        disabled={disabled}
        className={selectClass}
        aria-label="Day"
      >
        <option value="">Day</option>
        {days.map((d) => (
          <option key={d} value={String(d).padStart(2, "0")}>{d}</option>
        ))}
      </select>
      <select
        value={selYear}
        onChange={(e) => { setSelYear(e.target.value); tryEmit(e.target.value, selMonth, selDay); }}
        disabled={disabled}
        className={selectClass}
        aria-label="Year"
      >
        <option value="">Year</option>
        {years.map((y) => (
          <option key={y} value={String(y)}>{y}</option>
        ))}
      </select>
    </div>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const emptyContact = (): EmergencyContact => ({
  contact_name: "",
  relationship: "",
  emergency_phone_number: "",
  emergency_email_address: "",
});

const emptyForm = (): FormData => ({
  first_name: "",
  last_name: "",
  phone: "",
  address: "",
  date_of_birth: "",
  nationality: "",
  civil_status: "",
  preferred_username: "",
});

function seedForm(sub: OnboardingSubmission | null): FormData {
  if (!sub) return emptyForm();
  return {
    first_name: sub.first_name ?? "",
    last_name: sub.last_name ?? "",
    phone: sub.phone ?? "",
    address: sub.address ?? "",
    date_of_birth: sub.date_of_birth ? sub.date_of_birth.slice(0, 10) : "",
    nationality: sub.nationality ?? "",
    civil_status: sub.civil_status ?? "",
    preferred_username: sub.preferred_username ?? "",
  };
}

function seedContacts(sub: OnboardingSubmission | null): EmergencyContact[] {
  if (!sub) return [emptyContact()];
  const legacy: EmergencyContact = {
    contact_name: sub.emergency_contact_name ?? "",
    relationship: sub.emergency_contact_relationship ?? "",
    emergency_phone_number: sub.emergency_contact_phone ?? "",
    emergency_email_address: "",
  };
  if (legacy.contact_name || legacy.emergency_phone_number) return [legacy];
  return [emptyContact()];
}

function normalizeForm(form: FormData): FormData {
  return {
    first_name: form.first_name.trim(),
    last_name: form.last_name.trim(),
    phone: form.phone.trim(),
    address: form.address.trim(),
    date_of_birth: form.date_of_birth.trim(),
    nationality: form.nationality.trim(),
    civil_status: form.civil_status.trim(),
    preferred_username: form.preferred_username.trim(),
  };
}

function getMissingRequiredFields(form: FormData, contacts: EmergencyContact[]): string[] {
  const required: Array<[keyof FormData, string]> = [
    ["first_name", "first name"],
    ["last_name", "last name"],
    ["phone", "phone"],
    ["address", "address"],
    ["date_of_birth", "date of birth"],
    ["nationality", "nationality"],
    ["civil_status", "civil status"],
    ["preferred_username", "preferred username"],
  ];
  const missing = required
    .filter(([key]) => !form[key].trim())
    .map(([, label]) => label);

  const primaryContact = contacts[0];
  if (!primaryContact?.contact_name.trim()) missing.push("emergency contact name");
  if (!primaryContact?.emergency_phone_number.trim()) missing.push("emergency contact phone");
  if (!primaryContact?.relationship.trim()) missing.push("emergency contact relationship");

  return missing;
}

// Normalize a date string to YYYY-MM-DD; returns null for empty/invalid values
// so Postgres never receives an empty string for a date column.
function toDateOnly(raw: string | null | undefined): string | null {
  if (!raw) return null;
  // ISO timestamp → slice to date portion only
  return raw.slice(0, 10) || null;
}

function buildSavePayload(form: FormData, contacts: EmergencyContact[]) {
  const normalized = normalizeForm(form);
  const primary = contacts[0] ?? emptyContact();
  return {
    ...normalized,
    // Send null instead of "" so Postgres date columns don't error
    date_of_birth: toDateOnly(normalized.date_of_birth),
    emergency_contact_name: primary.contact_name.trim(),
    emergency_contact_phone: primary.emergency_phone_number.trim(),
    emergency_contact_relationship: primary.relationship.trim(),
    emergency_contacts: contacts.map((c) => ({
      contact_name: c.contact_name.trim(),
      relationship: c.relationship.trim(),
      emergency_phone_number: c.emergency_phone_number.trim(),
      emergency_email_address: c.emergency_email_address.trim(),
    })),
  };
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function FieldLabel({ htmlFor, children, required }: Readonly<{ htmlFor?: string; children: React.ReactNode; required?: boolean }>) {
  return (
    <label htmlFor={htmlFor} className="text-xs font-semibold text-slate-500 uppercase tracking-wide block mb-1.5">
      {children}
      {required && <span className="text-red-500 ml-0.5 normal-case">*</span>}
    </label>
  );
}

function StyledInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <Input
      {...props}
      className="h-9 border-slate-200 bg-white text-slate-800 placeholder:text-slate-400 focus-visible:ring-blue-500/40 focus-visible:border-blue-400 disabled:bg-slate-50 disabled:text-slate-500 transition-colors"
    />
  );
}

// ─── Step Progress ─────────────────────────────────────────────────────────────

const STEPS = [
  { label: "Personal Info", icon: User },
  { label: "Emergency Contact", icon: Phone },
  { label: "Account Setup", icon: KeyRound },
];

function StepProgress() {
  return (
    <div className="flex items-center gap-0 mb-6">
      {STEPS.map((step, i) => {
        const Icon = step.icon;
        return (
          <div key={step.label} className="flex items-center gap-0 flex-1">
            <div className="flex flex-col items-center gap-1 flex-1">
              <div className="size-8 rounded-full bg-blue-900/10 border-2 border-blue-700 flex items-center justify-center shrink-0">
                <Icon className="size-3.5 text-blue-700" />
              </div>
              <span className="text-[10px] font-medium text-slate-500 whitespace-nowrap hidden sm:block">{step.label}</span>
            </div>
            {i < STEPS.length - 1 && (
              <div className="flex-1 h-px bg-slate-200 mb-4 mx-1" />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Section Card ─────────────────────────────────────────────────────────────

function SectionCard({
  icon: Icon,
  title,
  description,
  accentColor = "blue",
  children,
  action,
}: Readonly<{
  icon: React.ElementType;
  title: string;
  description?: string;
  accentColor?: "blue" | "teal" | "indigo";
  children: React.ReactNode;
  action?: React.ReactNode;
}>) {
  const accent = {
    blue:   "border-l-blue-700",
    teal:   "border-l-teal-600",
    indigo: "border-l-indigo-600",
  }[accentColor];

  const iconBg = {
    blue:   "bg-blue-50 text-blue-700",
    teal:   "bg-teal-50 text-teal-700",
    indigo: "bg-indigo-50 text-indigo-700",
  }[accentColor];

  return (
    <div className={`bg-white rounded-xl border border-slate-200 border-l-4 ${accent} shadow-sm overflow-hidden`}>
      <div className="px-5 pt-4 pb-3 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className={`size-9 rounded-lg ${iconBg} flex items-center justify-center shrink-0`}>
            <Icon className="size-4" />
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-800">{title}</p>
            {description && <p className="text-xs text-slate-400 mt-0.5">{description}</p>}
          </div>
        </div>
        {action}
      </div>
      <div className="px-5 pb-5 pt-1 space-y-4">
        {children}
      </div>
    </div>
  );
}

const selectClass =
  "flex h-9 w-full rounded-lg border border-slate-200 bg-white px-3 py-1 text-sm text-slate-800 shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-slate-50 cursor-pointer";

// ─── Main Component ───────────────────────────────────────────────────────────

export function NewHireApprovalForm({ onSubmitted }: { onSubmitted?: () => void } = {}) {
  const [submission, setSubmission]   = useState<OnboardingSubmission | null>(null);
  const [form, setForm]               = useState<FormData>(emptyForm());
  const [contacts, setContacts]       = useState<EmergencyContact[]>([emptyContact()]);
  const [loading, setLoading]         = useState(true);
  const [autofilling, setAutofilling] = useState(false);
  const [saving, setSaving]           = useState(false);
  const [submitting, setSubmitting]   = useState(false);
  const [saveError, setSaveError]     = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [savedOk, setSavedOk]         = useState(false);

  useEffect(() => {
    getMyOnboarding()
      .then((data) => {
        setSubmission(data);
        setForm(seedForm(data));
        setContacts(seedContacts(data));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const set = (field: keyof FormData, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setSavedOk(false);
  };

  const setContact = (index: number, field: keyof EmergencyContact, value: string) => {
    setContacts((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
    setSavedOk(false);
  };

  const addContact = () => setContacts((prev) => [...prev, emptyContact()]);
  const removeContact = (index: number) => setContacts((prev) => prev.filter((_, i) => i !== index));

  // Always prefer fresh profile data — use ?? so null/undefined falls back to form but any real value (including "") overrides
  const handleAutofill = async () => {
    setAutofilling(true);
    try {
      const profile = await getApplicantProfile();
      setForm((prev) => ({
        ...prev,
        first_name:    profile.first_name    != null ? profile.first_name    : prev.first_name,
        last_name:     profile.last_name     != null ? profile.last_name     : prev.last_name,
        phone:         profile.phone_number  != null ? profile.phone_number  : prev.phone,
        address:       profile.complete_address != null ? profile.complete_address : prev.address,
        // Slice to YYYY-MM-DD — profile may return a full ISO timestamp
        date_of_birth: profile.date_of_birth != null ? (profile.date_of_birth.slice(0, 10) || prev.date_of_birth) : prev.date_of_birth,
        nationality:   profile.nationality      != null ? profile.nationality      : prev.nationality,
        civil_status:  profile.civil_status     != null ? profile.civil_status     : prev.civil_status,
      }));
      setSavedOk(false);
      toast.success("Profile data applied — review and save before submitting.");
    } catch {
      toast.error("Could not load profile data. Please fill in the fields manually.");
    } finally {
      setAutofilling(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setSaveError(null);
    setSavedOk(false);
    try {
      const payload = buildSavePayload(form, contacts);
      const updated = await saveOnboarding(payload);
      setSubmission(updated as OnboardingSubmission);
      setForm(seedForm(updated as OnboardingSubmission));
      setContacts(seedContacts(updated as OnboardingSubmission));
      setSavedOk(true);
    } catch (err: any) {
      setSaveError(err?.message || "Failed to save. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const handleSubmit = async () => {
    const payload = buildSavePayload(normalizeForm(form), contacts);
    const missing = getMissingRequiredFields(normalizeForm(form), contacts);
    if (missing.length > 0) {
      setSubmitError(`Please complete required fields before submitting: ${missing.join(", ")}.`);
      return;
    }

    setSubmitting(true);
    setSubmitError(null);
    setSavedOk(false);
    try {
      const saved = await saveOnboarding(payload);
      setSubmission(saved);
      setForm(seedForm(saved));
      setContacts(seedContacts(saved));
      const updated = await submitOnboarding();
      setSubmission(updated);
      toast.success("Submitted! HR will review your profile shortly.");
      onSubmitted?.();
    } catch (err: any) {
      setSubmitError(err?.message || "Failed to submit. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="size-7 animate-spin text-blue-700" />
          <p className="text-sm text-slate-500">Loading your onboarding form…</p>
        </div>
      </div>
    );
  }

  if (!submission) {
    return (
      <div className="min-h-screen flex items-center justify-center p-8">
        <div className="text-center space-y-2 max-w-md">
          <h2 className="text-xl font-semibold text-slate-800">No onboarding record found.</h2>
          <p className="text-slate-500">Please contact HR if you believe this is an error.</p>
        </div>
      </div>
    );
  }

  const status = submission.status;
  const isReadOnly = status === "submitted" || status === "approved";

  return (
    <div className="flex gap-6 items-start">

      {/* ── LEFT STICKY PANEL ── */}
      <aside className="hidden lg:flex w-72 xl:w-80 shrink-0 flex-col gap-4 sticky top-0">

        {/* Hero */}
        <div className="bg-blue-900 rounded-2xl p-6 text-white shadow-md">
          <div className="size-12 rounded-xl bg-white/10 flex items-center justify-center mb-4">
            <Briefcase className="size-6 text-white" />
          </div>
          <h2 className="text-xl font-bold leading-tight">Welcome Aboard!</h2>
          <p className="text-blue-200 text-sm mt-1.5 leading-relaxed">
            Complete all three sections below. HR will review and activate your employee account.
          </p>
          {submission.job_postings?.title && (
            <span className="inline-flex items-center gap-1.5 mt-3 bg-white/10 border border-white/20 text-white rounded-full px-3 py-1 text-xs font-medium">
              <Briefcase className="size-3" />
              {submission.job_postings.title}
            </span>
          )}
        </div>

        {/* Step progress */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-3">Your Progress</p>
          <div className="flex flex-col gap-3">
            {[
              { label: "Personal Information", icon: User, color: "text-blue-700 bg-blue-50" },
              { label: "Emergency Contact",    icon: Phone, color: "text-teal-700 bg-teal-50" },
              { label: "Account Setup",        icon: KeyRound, color: "text-indigo-700 bg-indigo-50" },
            ].map(({ label, icon: Icon, color }, i) => (
              <div key={label} className="flex items-center gap-3">
                <div className={`size-8 rounded-lg ${color} flex items-center justify-center shrink-0`}>
                  <Icon className="size-3.5" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-slate-700 truncate">{label}</p>
                  <p className="text-[10px] text-slate-400">Section {i + 1} of 3</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Status banners */}
        {status === "submitted" && (
          <div className="flex items-start gap-3 bg-blue-50 border border-blue-200 rounded-xl px-4 py-3">
            <Clock className="size-4 text-blue-600 shrink-0 mt-0.5" />
            <p className="text-xs text-blue-800">
              <strong>Submitted</strong> — awaiting HR review. You&apos;ll be notified once processed.
            </p>
          </div>
        )}
        {status === "approved" && (
          <div className="flex items-start gap-3 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3">
            <CheckCircle className="size-4 text-emerald-600 shrink-0 mt-0.5" />
            <p className="text-xs text-emerald-800">
              <strong>Approved!</strong> Check your email for your employee account credentials.
            </p>
          </div>
        )}
        {status === "rejected" && submission.hr_notes && (
          <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
            <AlertTriangle className="size-4 text-amber-600 shrink-0 mt-0.5" />
            <div className="text-xs text-amber-800">
              <p className="font-semibold">HR requested changes:</p>
              <p className="mt-0.5">{submission.hr_notes}</p>
            </div>
          </div>
        )}
      </aside>

      {/* ── RIGHT FORM AREA ── */}
      <div className="flex-1 min-w-0">

        {/* Mobile-only header (shown when sidebar is hidden) */}
        <div className="lg:hidden mb-4">
          <div className="flex items-start gap-3 mb-3">
            <div className="size-10 rounded-xl bg-blue-900 flex items-center justify-center shrink-0">
              <Briefcase className="size-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900">Welcome Aboard!</h2>
              <p className="text-slate-500 text-xs mt-0.5">Complete all sections and submit for HR review.</p>
            </div>
          </div>
          {status === "submitted" && (
            <div className="flex items-start gap-2 bg-blue-50 border border-blue-200 rounded-xl px-3 py-2.5 mb-3">
              <Clock className="size-4 text-blue-600 shrink-0 mt-0.5" />
              <p className="text-xs text-blue-800"><strong>Submitted</strong> — awaiting HR review.</p>
            </div>
          )}
        </div>

        <div className="space-y-4">
          <div className="space-y-4 pr-2">

            {/* ── Section 1: Personal Information ── */}
            <SectionCard
              icon={User}
              title="Personal Information"
              description="Fields marked * are required to submit."
              accentColor="blue"
              action={!isReadOnly ? (
                <button
                  type="button"
                  onClick={handleAutofill}
                  disabled={autofilling}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-900 text-white text-xs font-medium hover:bg-blue-800 disabled:opacity-60 transition-colors cursor-pointer shadow-sm"
                >
                  {autofilling
                    ? <><Loader2 className="size-3 animate-spin" />Filling…</>
                    : <><RefreshCw className="size-3" />Auto-fill from profile</>
                  }
                </button>
              ) : undefined}
            >
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <FieldLabel htmlFor="first_name" required>First Name</FieldLabel>
                  <StyledInput id="first_name" value={form.first_name} onChange={(e) => set("first_name", e.target.value)} disabled={isReadOnly} placeholder="Juan" />
                </div>
                <div>
                  <FieldLabel htmlFor="last_name" required>Last Name</FieldLabel>
                  <StyledInput id="last_name" value={form.last_name} onChange={(e) => set("last_name", e.target.value)} disabled={isReadOnly} placeholder="Dela Cruz" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <FieldLabel htmlFor="phone" required>Phone Number</FieldLabel>
                  <StyledInput id="phone" type="tel" value={form.phone} onChange={(e) => set("phone", e.target.value)} disabled={isReadOnly} placeholder="+63 917 000 0000" />
                </div>
                <div>
                  <FieldLabel required>Date of Birth</FieldLabel>
                  <DOBPicker value={form.date_of_birth} onChange={(v) => set("date_of_birth", v)} disabled={isReadOnly} />
                </div>
              </div>

              <div>
                <FieldLabel htmlFor="address" required>Complete Address</FieldLabel>
                <StyledInput id="address" value={form.address} onChange={(e) => set("address", e.target.value)} disabled={isReadOnly} placeholder="Street, Barangay, City, Province, ZIP" />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <FieldLabel htmlFor="nationality" required>Nationality</FieldLabel>
                  <StyledInput id="nationality" value={form.nationality} onChange={(e) => set("nationality", e.target.value)} disabled={isReadOnly} placeholder="e.g. Filipino" />
                </div>
                <div>
                  <FieldLabel htmlFor="civil_status" required>Civil Status</FieldLabel>
                  <select id="civil_status" value={form.civil_status} onChange={(e) => set("civil_status", e.target.value)} disabled={isReadOnly} className={selectClass}>
                    <option value="">Select…</option>
                    <option value="Single">Single</option>
                    <option value="Married">Married</option>
                    <option value="Widowed">Widowed</option>
                    <option value="Separated">Separated</option>
                  </select>
                </div>
              </div>
            </SectionCard>

            {/* ── Section 2: Emergency Contacts ── */}
            <SectionCard
              icon={Phone}
              title="Emergency Contacts"
              description="At least one contact required."
              accentColor="teal"
              action={!isReadOnly ? (
                <button
                  type="button"
                  onClick={addContact}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 text-xs font-medium hover:bg-slate-50 transition-colors cursor-pointer"
                >
                  <Plus className="size-3.5" />Add Contact
                </button>
              ) : undefined}
            >
              <div className="space-y-3">
                {contacts.map((contact, index) => (
                  <div key={index} className="rounded-lg border border-slate-100 bg-slate-50/70 p-4 space-y-3">
                    {contacts.length > 1 && (
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Contact {index + 1}</span>
                        {!isReadOnly && (
                          <button
                            type="button"
                            onClick={() => removeContact(index)}
                            className="size-6 rounded-md flex items-center justify-center hover:bg-red-50 text-slate-400 hover:text-red-600 transition-colors cursor-pointer"
                            title="Remove contact"
                          >
                            <Minus className="size-3.5" />
                          </button>
                        )}
                      </div>
                    )}
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <FieldLabel htmlFor={`ec_name_${index}`} required={index === 0}>Full Name</FieldLabel>
                        <StyledInput id={`ec_name_${index}`} value={contact.contact_name} onChange={(e) => setContact(index, "contact_name", e.target.value)} disabled={isReadOnly} placeholder="e.g. Maria Santos" />
                      </div>
                      <div>
                        <FieldLabel htmlFor={`ec_rel_${index}`} required={index === 0}>Relationship</FieldLabel>
                        <StyledInput id={`ec_rel_${index}`} value={contact.relationship} onChange={(e) => setContact(index, "relationship", e.target.value)} disabled={isReadOnly} placeholder="e.g. Mother" />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <FieldLabel htmlFor={`ec_phone_${index}`} required={index === 0}>Phone Number</FieldLabel>
                        <StyledInput id={`ec_phone_${index}`} type="tel" value={contact.emergency_phone_number} onChange={(e) => setContact(index, "emergency_phone_number", e.target.value)} disabled={isReadOnly} placeholder="+63 9XX XXX XXXX" />
                      </div>
                      <div>
                        <FieldLabel htmlFor={`ec_email_${index}`}>Email (optional)</FieldLabel>
                        <StyledInput id={`ec_email_${index}`} type="email" value={contact.emergency_email_address} onChange={(e) => setContact(index, "emergency_email_address", e.target.value)} disabled={isReadOnly} placeholder="email@example.com" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </SectionCard>

            {/* ── Section 3: Account Setup ── */}
            <SectionCard
              icon={KeyRound}
              title="Account Setup"
              description="Choose your preferred employee username for logging in."
              accentColor="indigo"
            >
              <div>
                <FieldLabel htmlFor="preferred_username" required>Preferred Username</FieldLabel>
                <StyledInput id="preferred_username" value={form.preferred_username} onChange={(e) => set("preferred_username", e.target.value)} disabled={isReadOnly} placeholder="e.g. jdelacruz" />
                <p className="text-xs text-slate-400 mt-1.5">This will be your login username once HR approves your account.</p>
              </div>
            </SectionCard>

            {/* ── Actions ── */}
            {!isReadOnly && (
              <div className="space-y-3 pb-4 pt-1">
                {saveError && (
                  <Alert className="bg-red-50 border-red-200">
                    <AlertDescription className="text-red-700 text-sm">{saveError}</AlertDescription>
                  </Alert>
                )}
                {submitError && (
                  <Alert className="bg-red-50 border-red-200">
                    <AlertDescription className="text-red-700 text-sm">{submitError}</AlertDescription>
                  </Alert>
                )}
                {savedOk && (
                  <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-2.5">
                    <CheckCircle className="size-4 text-emerald-600 shrink-0" />
                    <p className="text-sm text-emerald-700">Draft saved successfully.</p>
                  </div>
                )}
                <div className="flex gap-3">
                  <Button
                    variant="outline"
                    className="flex-1 cursor-pointer border-slate-200 text-slate-700 hover:bg-slate-50 hover:text-slate-900 transition-colors"
                    onClick={handleSave}
                    disabled={saving || submitting}
                  >
                    {saving
                      ? <><Loader2 className="size-4 mr-2 animate-spin" />Saving…</>
                      : "Save Draft"
                    }
                  </Button>
                  <Button
                    className="flex-1 cursor-pointer bg-blue-900 hover:bg-blue-800 text-white transition-colors shadow-sm"
                    onClick={handleSubmit}
                    disabled={saving || submitting}
                  >
                    {submitting
                      ? <><Loader2 className="size-4 mr-2 animate-spin" />Submitting…</>
                      : <><Send className="size-4 mr-2" />Submit for Review</>
                    }
                  </Button>
                </div>
                <p className="text-center text-xs text-slate-400">
                  After submitting, HR will review your profile. You&apos;ll be notified via email.
                </p>
              </div>
            )}

            {/* Read-only continue hint */}
            {isReadOnly && status === "submitted" && (
              <div className="flex items-center gap-2 justify-center text-sm text-slate-500 py-2 pb-4">
                <ChevronRight className="size-4" />
                <span>Continue filling your onboarding checklist while HR reviews your profile.</span>
              </div>
            )}

          </div>

        </div>
      </div>
    </div>
  );
}
