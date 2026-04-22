"use client";

import { useEffect, useRef, useState } from "react";
import {
  getUserInfo,
  getAccessToken,
  parseJwt,
  type StoredUser,
} from "@/lib/authStorage";
import { getEmployeeProfile, updateEmployeeProfile, updateMyEmergencyContacts, type EmergencyContact, authFetch } from "@/lib/authApi";
import { API_BASE_URL } from "@/lib/api";
import { submitChangeRequest, getMyChangeRequests } from "@/lib/changeRequestApi";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Camera,
  Lock,
  Loader2,
  Pencil,
  Clock,
  Upload,
  User,
  CreditCard,
  MapPin,
  CheckCircle2,
  Download,
  X as XIcon,
  Plus,
  Phone,
  Mail,
  UsersRound,
  Trash2,
  Building2,
} from "lucide-react";
import { DateOfBirthPicker } from "@/components/ui/date-of-birth-picker";
import { toast } from "sonner";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ExtendedProfile {
  phone: string;
  personalEmail: string;
  address: string;
  dob: string;
  placeOfBirth: string;
  nationality: string;
  civilStatus: string;
}

interface BankInfo {
  bankName: string;
  accountNumber: string;
  accountName: string;
}

type PendingSection = "legal-name" | "bank" | null;

interface ApprovalModalState {
  open: boolean;
  section: "legal-name" | "bank";
}

// ─── Permission Badge ──────────────────────────────────────────────────────────

function PermBadge({ type }: { type: "self" | "approval" | "system" | "immutable" }) {
  const map = {
    self: {
      label: "Self-service",
      cls: "bg-green-100 text-green-700 border border-green-200",
    },
    approval: {
      label: "Requires HR Approval",
      cls: "bg-amber-100 text-amber-700 border border-amber-200",
    },
    system: {
      label: "System-managed",
      cls: "bg-gray-100 text-gray-500 border border-gray-200",
    },
    immutable: {
      label: "Immutable",
      cls: "bg-slate-100 text-slate-500 border border-slate-200",
    },
  } as const;
  const { label, cls } = map[type];
  return (
    <span
      className={`inline-flex items-center text-[10px] font-bold uppercase tracking-wide rounded-full px-2 py-0.5 ${cls}`}
    >
      {label}
    </span>
  );
}

// ─── Field Row ─────────────────────────────────────────────────────────────────

function FieldRow({
  label,
  permType,
  children,
}: {
  label: string;
  permType: "self" | "approval" | "system" | "immutable";
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
          {label}
        </span>
        <PermBadge type={permType} />
      </div>
      {children}
    </div>
  );
}

// ─── Approval Modal ────────────────────────────────────────────────────────────

function ApprovalModal({
  state,
  currentLegalName,
  currentBank,
  onClose,
  onSubmit,
}: {
  state: ApprovalModalState;
  currentLegalName: { first: string; middle: string; last: string };
  currentBank: { bankName: string; accountNumber: string; accountName: string };
  onClose: () => void;
  onSubmit: (reason: string, file: File | null, values: Record<string, string>) => void;
}) {
  const [reason, setReason] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const [nameDraft, setNameDraft] = useState({ ...currentLegalName });
  const [bankDraft, setBankDraft] = useState({ ...currentBank });

  // Re-seed drafts when modal opens
  const prevOpen = useRef(false);
  if (state.open && !prevOpen.current) {
    prevOpen.current = true;
    nameDraft.first = currentLegalName.first;
    nameDraft.middle = currentLegalName.middle;
    nameDraft.last = currentLegalName.last;
    bankDraft.bankName = currentBank.bankName;
    bankDraft.accountNumber = currentBank.accountNumber;
    bankDraft.accountName = currentBank.accountName;
  }
  if (!state.open) prevOpen.current = false;

  const handleSubmit = () => {
    if (!reason.trim()) {
      toast.error("Please provide a reason for the change request.");
      return;
    }
    if (reason.trim().length < 5) {
      toast.error("Reason must be at least 5 characters.");
      return;
    }
    const values: Record<string, string> =
      state.section === "bank"
        ? {
            bank_name: bankDraft.bankName.trim(),
            bank_account_number: bankDraft.accountNumber.trim(),
            bank_account_name: bankDraft.accountName.trim(),
          }
        : {
            first_name: nameDraft.first.trim(),
            middle_name: nameDraft.middle.trim(),
            last_name: nameDraft.last.trim(),
          };
    onSubmit(reason.trim(), file, values);
    setReason("");
    setFile(null);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped) setFile(dropped);
  };

  const fieldLabel = state.section === "legal-name" ? "Legal Name" : "Bank Account";

  return (
    <Dialog open={state.open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base font-bold tracking-tight">
            Request Changes — {fieldLabel}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pt-1">
          {/* Section-specific fields */}
          {state.section === "legal-name" ? (
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
                  First Name
                </label>
                <Input
                  value={nameDraft.first}
                  onChange={(e) => setNameDraft({ ...nameDraft, first: e.target.value })}
                  placeholder="First"
                  className="h-9 text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
                  Middle
                </label>
                <Input
                  value={nameDraft.middle}
                  onChange={(e) => setNameDraft({ ...nameDraft, middle: e.target.value })}
                  placeholder="Middle"
                  className="h-9 text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
                  Last Name
                </label>
                <Input
                  value={nameDraft.last}
                  onChange={(e) => setNameDraft({ ...nameDraft, last: e.target.value })}
                  placeholder="Last"
                  className="h-9 text-sm"
                />
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
                  Bank Name
                </label>
                <Input
                  value={bankDraft.bankName}
                  onChange={(e) => setBankDraft({ ...bankDraft, bankName: e.target.value })}
                  placeholder="e.g. BDO, BPI, Metrobank"
                  className="h-9 text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
                  Account Number
                </label>
                <Input
                  value={bankDraft.accountNumber}
                  onChange={(e) => setBankDraft({ ...bankDraft, accountNumber: e.target.value })}
                  placeholder="00000-0000000-0"
                  className="h-9 text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
                  Account Name
                </label>
                <Input
                  value={bankDraft.accountName}
                  onChange={(e) => setBankDraft({ ...bankDraft, accountName: e.target.value })}
                  placeholder="Full name on account"
                  className="h-9 text-sm"
                />
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
              Reason <span className="text-red-500">*</span>
            </label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Explain why you need this change..."
              className="min-h-[90px] rounded-md border bg-transparent px-3 shadow-xs resize-none text-sm"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
              Supporting Document (optional)
            </label>
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={handleDrop}
              onClick={() => fileRef.current?.click()}
              className={`border-2 border-dashed rounded-lg p-5 text-center cursor-pointer transition-all duration-200 ${
                dragging
                  ? "border-primary bg-primary/5"
                  : "border-border hover:border-primary/50 hover:bg-muted/30"
              }`}
            >
              <Upload className="h-5 w-5 mx-auto mb-2 text-muted-foreground" />
              {file ? (
                <p className="text-sm font-medium text-foreground">{file.name}</p>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Drag a file here or <span className="text-primary font-semibold">browse</span>
                </p>
              )}
              <input
                ref={fileRef}
                type="file"
                className="hidden"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </div>
          </div>

          <div className="flex gap-2 pt-1">
            <Button onClick={handleSubmit} className="flex-1">
              Submit Request
            </Button>
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function EmployeeProfilePage() {
  const [user, setUser] = useState<StoredUser | null>(null);
  const [jwtPayload, setJwtPayload] = useState<Record<string, string> | null>(null);
  const [profilePhoto, setProfilePhoto] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const photoInputRef = useRef<HTMLInputElement>(null);

  // Extended profile state
  const [extended, setExtended] = useState<ExtendedProfile>({ phone: "", personalEmail: "", address: "", dob: "", placeOfBirth: "", nationality: "", civilStatus: "" });
  const [extendedEditing, setExtendedEditing] = useState(false);
  const [extendedDraft, setExtendedDraft] = useState<ExtendedProfile>({ ...extended });
  const [extendedSaving, setExtendedSaving] = useState(false);

  // Emergency contacts state
  const [emergencyContacts, setEmergencyContacts] = useState<EmergencyContact[]>([]);
  const [ecEditing, setEcEditing] = useState(false);
  const [ecDraft, setEcDraft] = useState<EmergencyContact[]>([]);
  const [ecSaving, setEcSaving] = useState(false);

  // Bank state (read-only on page; editing happens in modal)
  const [bank, setBank] = useState<BankInfo>({ bankName: "", accountNumber: "", accountName: "" });
  const [submittingRequest, setSubmittingRequest] = useState(false);
  const [assignedDepartment, setAssignedDepartment] = useState("");

  // Legal name state (read-only on page; editing happens in modal)
  const [legalName, setLegalName] = useState({ first: "", middle: "", last: "" });

  // Pending approvals
  const [pendingSection, setPendingSection] = useState<PendingSection>(null);

  // Approval modal
  const [approvalModal, setApprovalModal] = useState<ApprovalModalState>({ open: false, section: "legal-name" });

  // Onboarding import banner — only shown for converted employees
  const [showImportBanner, setShowImportBanner] = useState(false);
  const [importDismissed, setImportDismissed] = useState(false);
  const [importing, setImporting] = useState(false);
  const [cachedStagingData, setCachedStagingData] = useState<{
    first_name?: string; last_name?: string; middle_name?: string;
    phone_number?: string; complete_address?: string; date_of_birth?: string;
    place_of_birth?: string; nationality?: string; civil_status?: string; personal_email?: string;
  } | null>(null);

  // ── Load from API on mount ────────────────────────────────────────────────
  useEffect(() => {
    const storedUser = getUserInfo();
    setUser(storedUser);

    const token = getAccessToken();
    if (token) {
      const payload = parseJwt(token);
      setJwtPayload(payload);
    }

    Promise.all([
      getEmployeeProfile(),
      getMyChangeRequests(),
    ])
      .then(([p, changeReqs]) => {
        if (p.avatar_url) setProfilePhoto(p.avatar_url);
        setLegalName({ first: p.first_name ?? "", middle: p.middle_name ?? "", last: p.last_name ?? "" });
        const ext: ExtendedProfile = { phone: p.personal_email ? "" : "", personalEmail: p.personal_email ?? "", address: p.complete_address ?? "", dob: p.date_of_birth ?? "", placeOfBirth: p.place_of_birth ?? "", nationality: p.nationality ?? "", civilStatus: p.civil_status ?? "" };
        const jwtPhone = token ? parseJwt(token)?.phone_number ?? "" : "";
        ext.phone = jwtPhone;
        setExtended(ext);
        setExtendedDraft(ext);
        const bk: BankInfo = { bankName: p.bank_name ?? "", accountNumber: p.bank_account_number ?? "", accountName: p.bank_account_name ?? "" };
        setBank(bk);
        setAssignedDepartment(p.department_name?.trim() ?? "");
        const ec = p.emergency_contacts ?? [];
        setEmergencyContacts(ec);
        setEcDraft(ec);
        if (p.employee_id) setJwtPayload((prev) => ({ ...(prev ?? {}), employee_id: p.employee_id! }));

        const pendingLegal = changeReqs.find(r => r.field_type === 'legal_name' && r.status === 'pending');
        const pendingBank  = changeReqs.find(r => r.field_type === 'bank'       && r.status === 'pending');
        if (pendingLegal)     setPendingSection('legal-name');
        else if (pendingBank) setPendingSection('bank');

        const isEmpty = !p.date_of_birth && !p.complete_address && !p.nationality && !p.civil_status;
        if (isEmpty) {
          authFetch(`${API_BASE_URL}/users/me/onboarding-staging`)
            .then(r => r.ok ? r.json() : null)
            .then((staging) => {
              if (staging) {
                setCachedStagingData(staging);
                setShowImportBanner(true);
              }
            })
            .catch(() => {});
        }
      })
      .catch(() => toast.error("Failed to load profile."))
      .finally(() => setLoading(false));
  }, []);

  // ── Photo upload ──────────────────────────────────────────────────────────
  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const b64 = ev.target?.result as string;
      setProfilePhoto(b64);
      try {
        await updateEmployeeProfile({ avatar_url: b64 });
        toast.success("Profile photo updated.");
      } catch {
        toast.error("Failed to save profile photo.");
      }
    };
    reader.readAsDataURL(file);
  };

  // ── Contact & Address save ────────────────────────────────────────────────
  const handleExtendedSave = async () => {
    setExtendedSaving(true);
    try {
      await updateEmployeeProfile({
        personal_email:   extendedDraft.personalEmail.trim() || null as any,
        date_of_birth:    extendedDraft.dob || null as any,
        place_of_birth:   extendedDraft.placeOfBirth.trim() || null as any,
        nationality:      extendedDraft.nationality.trim() || null as any,
        civil_status:     extendedDraft.civilStatus || null as any,
        complete_address: extendedDraft.address.trim() || null as any,
      });
      setExtended(extendedDraft);
      setExtendedEditing(false);
      toast.success("Contact information saved.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed.");
    } finally {
      setExtendedSaving(false);
    }
  };

  const handleExtendedCancel = () => {
    setExtendedDraft(extended);
    setExtendedEditing(false);
  };

  // ── Approval modal ────────────────────────────────────────────────────────
  const openApprovalModal = (section: "legal-name" | "bank") => {
    setApprovalModal({ open: true, section });
  };

  const handleApprovalSubmit = async (reason: string, _file: File | null, values: Record<string, string>) => {
    const section = approvalModal.section;
    setSubmittingRequest(true);
    try {
      await submitChangeRequest({
        field_type: section === "bank" ? "bank" : "legal_name",
        requested_changes: values,
        reason,
      });
      setPendingSection(section);
      setApprovalModal({ ...approvalModal, open: false });
      toast.success("Change request submitted — awaiting HR approval.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to submit change request.");
    } finally {
      setSubmittingRequest(false);
    }
  };

  // ── Onboarding import ────────────────────────────────────────────────────
  const handleOnboardingImport = async () => {
    setImporting(true);
    try {
      let data = cachedStagingData;
      if (!data) {
        const res = await authFetch(`${API_BASE_URL}/users/me/onboarding-staging`);
        if (!res.ok) {
          const err = await res.json().catch(() => ({})) as { message?: string };
          throw new Error(err.message || "Onboarding data not found.");
        }
        data = await res.json();
      }
      if (!data) throw new Error("No onboarding data available.");

      const imported: ExtendedProfile = {
        phone:         data.phone_number     || extended.phone,
        personalEmail: data.personal_email   || extended.personalEmail,
        address:       data.complete_address || extended.address,
        dob:           data.date_of_birth    || extended.dob,
        placeOfBirth:  data.place_of_birth   || extended.placeOfBirth,
        nationality:   data.nationality      || extended.nationality,
        civilStatus:   data.civil_status     || extended.civilStatus,
      };

      await updateEmployeeProfile({
        personal_email:   imported.personalEmail.trim() || null as any,
        date_of_birth:    imported.dob || null as any,
        place_of_birth:   imported.placeOfBirth.trim() || null as any,
        nationality:      imported.nationality.trim() || null as any,
        civil_status:     imported.civilStatus || null as any,
        complete_address: imported.address.trim() || null as any,
      });

      setExtended(imported);
      setExtendedDraft(imported);
      setShowImportBanner(false);
      toast.success("Onboarding details imported and saved to your profile.");
    } catch (err: any) {
      toast.error(err?.message ?? "Could not import onboarding data.");
    } finally {
      setImporting(false);
    }
  };

  const handleEcSave = async () => {
    setEcSaving(true);
    try {
      await updateMyEmergencyContacts(ecDraft);
      setEmergencyContacts(ecDraft);
      setEcEditing(false);
      toast.success("Emergency contacts saved.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed.");
    } finally {
      setEcSaving(false);
    }
  };

  const handleEcCancel = () => {
    setEcDraft(emergencyContacts);
    setEcEditing(false);
  };

  const updateEcField = (idx: number, field: keyof EmergencyContact, value: string) => {
    setEcDraft((prev) => prev.map((c, i) => i === idx ? { ...c, [field]: value } : c));
  };

  const addEcContact = () => {
    setEcDraft((prev) => [...prev, { contact_name: "", relationship: "", emergency_phone_number: "", emergency_email_address: "" }]);
  };

  const removeEcContact = (idx: number) => {
    setEcDraft((prev) => prev.filter((_, i) => i !== idx));
  };

  const employeeId = jwtPayload?.employee_id ?? "EMP-XXXX";
  const displayName =
    [legalName.first, legalName.middle, legalName.last].filter(Boolean).join(" ") ||
    user?.name ||
    "Employee";
  const initials = displayName.charAt(0).toUpperCase();

  if (loading || !user) {
    return (
      <div className="flex items-center justify-center min-h-[200px] gap-2 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span className="text-sm">Loading profile...</span>
      </div>
    );
  }

  return (
    <div className="animate-in fade-in duration-500 space-y-0">
      {/* Hero Banner */}
      <div className="rounded-[26px] bg-[linear-gradient(135deg,#0f172a_0%,#172554_52%,#134e4a_100%)] text-white px-8 py-10 mb-6 shadow-sm">
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/60 mb-2">
          Employee Portal
        </p>
        <h1 className="text-2xl font-bold tracking-tight mb-1">My Profile</h1>
        <p className="text-sm text-white/70 max-w-xl">
          Manage your personal information, contact details, and account settings.
        </p>
      </div>

      {/* Onboarding import banner */}
      {showImportBanner && !importDismissed && (
        <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-5 py-4 flex items-start gap-4">
          <div className="h-9 w-9 rounded-xl bg-amber-100 border border-amber-200 flex items-center justify-center shrink-0">
            <Download className="h-4 w-4 text-amber-600" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-amber-800">
              Some of your onboarding details are available to import into your profile.
            </p>
            <p className="text-xs text-amber-700 mt-0.5">
              Your contact information, address, and civil details from onboarding can be copied here in one click.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button
              size="sm"
              onClick={handleOnboardingImport}
              disabled={importing}
              className="h-8 px-3 text-xs bg-amber-600 hover:bg-amber-700 text-white"
            >
              {importing ? <><Loader2 className="h-3 w-3 animate-spin mr-1.5" />Importing…</> : "Import Details"}
            </Button>
            <button
              onClick={() => setImportDismissed(true)}
              className="h-7 w-7 rounded-md flex items-center justify-center text-amber-500 hover:bg-amber-100 transition-colors cursor-pointer"
              title="Dismiss"
            >
              <XIcon className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      <div className="flex flex-col md:flex-row gap-6 items-start">
        {/* ── Left Sidebar ──────────────────────────────────────────────────── */}
        <div className="w-full md:w-[280px] md:sticky md:top-6 shrink-0">
          <div className="bg-card border rounded-xl shadow-sm p-5 space-y-4">
            {/* Avatar */}
            <div className="flex flex-col items-center gap-3">
              <div className="relative group cursor-pointer" onClick={() => photoInputRef.current?.click()}>
                <div className="h-24 w-24 rounded-full border-4 border-primary/20 overflow-hidden bg-primary/10 flex items-center justify-center text-3xl font-bold text-primary">
                  {profilePhoto ? (
                    <img src={profilePhoto} alt="Profile" className="h-full w-full object-cover" />
                  ) : (
                    initials
                  )}
                </div>
                <div className="absolute inset-0 rounded-full bg-black/40 opacity-0 group-hover:opacity-100 transition-all duration-200 flex items-center justify-center">
                  <Camera className="h-5 w-5 text-white" />
                </div>
                <input
                  ref={photoInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handlePhotoChange}
                />
              </div>

              <div className="text-center">
                <p className="text-base font-bold tracking-tight">{displayName}</p>
                <span className="inline-flex items-center mt-1 text-[10px] font-bold uppercase tracking-wide rounded-full px-2.5 py-0.5 bg-primary text-white">
                  {user.role}
                </span>
              </div>

              <div className="flex items-center gap-1.5 bg-muted/60 rounded-full px-3 py-1">
                <Lock className="h-3 w-3 text-muted-foreground" />
                <span className="text-[11px] font-semibold text-muted-foreground">{employeeId}</span>
              </div>
              <div className="flex items-center gap-1.5 bg-muted/60 rounded-full px-3 py-1">
                <Building2 className="h-3 w-3 text-muted-foreground" />
                <span className="text-[11px] font-semibold text-muted-foreground">
                  {assignedDepartment || "No department assigned"}
                </span>
              </div>
            </div>

            <div className="border-t border-border" />

            {/* Section nav */}
            <nav className="space-y-1">
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground px-2 mb-2">
                Sections
              </p>
              {[
                { id: "personal-info", label: "Personal Info", icon: User },
                { id: "contact-address", label: "Contact & Address", icon: MapPin },
                { id: "bank-account", label: "Bank Account", icon: CreditCard },
                { id: "emergency-contacts", label: "Emergency Contacts", icon: UsersRound },
              ].map(({ id, label, icon: Icon }) => (
                <a
                  key={id}
                  href={`#${id}`}
                  className="flex items-center gap-2.5 px-3 py-2 rounded-md text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all duration-200 cursor-pointer"
                >
                  <Icon className="h-4 w-4" />
                  {label}
                </a>
              ))}
            </nav>
          </div>
        </div>

        {/* ── Right Content ──────────────────────────────────────────────────── */}
        <div className="flex-1 min-w-0 space-y-6">

          {/* ── Section 1: Personal Information ───────────────────────────── */}
          <section id="personal-info" className="bg-card border rounded-xl shadow-sm p-6 space-y-5 scroll-mt-6">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold tracking-tight">Personal Information</h2>
              {pendingSection === "legal-name" ? null : (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 px-3 text-xs cursor-pointer"
                  onClick={() => openApprovalModal("legal-name")}
                >
                  <Pencil className="h-3.5 w-3.5 mr-1.5" />
                  Request Change
                </Button>
              )}
            </div>

            {pendingSection === "legal-name" && (
              <div className="flex items-center gap-2.5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
                <Clock className="h-4 w-4 text-amber-600 shrink-0" />
                <p className="text-sm text-amber-700 font-medium">
                  Awaiting HR Approval — your request is pending review.
                </p>
              </div>
            )}

            {/* Legal name — read-only; changes happen via modal */}
            <div className="grid sm:grid-cols-3 gap-4">
              <FieldRow label="First Name" permType="approval">
                <Input
                  value={legalName.first || "—"}
                  readOnly
                  className="h-9 rounded-md border bg-muted/40 px-3 shadow-xs text-muted-foreground"
                />
              </FieldRow>
              <FieldRow label="Middle Name" permType="approval">
                <Input
                  value={legalName.middle || "—"}
                  readOnly
                  className="h-9 rounded-md border bg-muted/40 px-3 shadow-xs text-muted-foreground"
                />
              </FieldRow>
              <FieldRow label="Last Name" permType="approval">
                <Input
                  value={legalName.last || "—"}
                  readOnly
                  className="h-9 rounded-md border bg-muted/40 px-3 shadow-xs text-muted-foreground"
                />
              </FieldRow>
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <FieldRow label="Work Email" permType="system">
                <Input
                  value={user.email}
                  disabled
                  className="h-9 rounded-md border bg-muted/40 px-3 shadow-xs text-muted-foreground"
                />
              </FieldRow>
              <FieldRow label="Username" permType="system">
                <Input
                  value={user.name}
                  disabled
                  className="h-9 rounded-md border bg-muted/40 px-3 shadow-xs text-muted-foreground"
                />
              </FieldRow>
              <FieldRow label="Employee ID" permType="immutable">
                <div className="relative">
                  <Input
                    value={employeeId}
                    disabled
                    className="h-9 rounded-md border bg-muted/40 px-3 shadow-xs text-muted-foreground pr-8"
                  />
                  <Lock className="absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                </div>
              </FieldRow>
              <FieldRow label="Department" permType="system">
                <div className="relative">
                  <Input
                    value={assignedDepartment || "—"}
                    disabled
                    className="h-9 rounded-md border bg-muted/40 px-3 shadow-xs text-muted-foreground pr-8"
                  />
                  <Building2 className="absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                </div>
              </FieldRow>
            </div>
          </section>

          {/* ── Section 2: Contact & Address ───────────────────────────────── */}
          <section id="contact-address" className="bg-card border rounded-xl shadow-sm p-6 space-y-5 scroll-mt-6">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold tracking-tight">Contact & Address</h2>
              {extendedEditing ? (
                <div className="flex gap-2">
                  <Button size="sm" className="h-8 px-3 text-xs cursor-pointer" onClick={handleExtendedSave} disabled={extendedSaving}>
                    {extendedSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />}Save
                  </Button>
                  <Button size="sm" variant="outline" className="h-8 px-3 text-xs cursor-pointer" onClick={handleExtendedCancel} disabled={extendedSaving}>
                    Cancel
                  </Button>
                </div>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 px-3 text-xs cursor-pointer"
                  onClick={() => setExtendedEditing(true)}
                >
                  <Pencil className="h-3.5 w-3.5 mr-1.5" />
                  Edit
                </Button>
              )}
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <FieldRow label="Phone Number" permType="self">
                <Input
                  value={extendedDraft.phone}
                  onChange={(e) => setExtendedDraft({ ...extendedDraft, phone: e.target.value })}
                  disabled={!extendedEditing}
                  placeholder="+63 900 000 0000"
                  className="h-9 rounded-md border bg-transparent px-3 shadow-xs disabled:bg-muted/40 disabled:text-muted-foreground"
                />
              </FieldRow>
              <FieldRow label="Personal Email" permType="self">
                <Input
                  value={extendedDraft.personalEmail}
                  onChange={(e) => setExtendedDraft({ ...extendedDraft, personalEmail: e.target.value })}
                  disabled={!extendedEditing}
                  placeholder="personal@email.com"
                  type="email"
                  className="h-9 rounded-md border bg-transparent px-3 shadow-xs disabled:bg-muted/40 disabled:text-muted-foreground"
                />
              </FieldRow>
              <FieldRow label="Date of Birth" permType="self">
                <DateOfBirthPicker
                  value={extendedDraft.dob}
                  onChange={(iso) => setExtendedDraft({ ...extendedDraft, dob: iso })}
                  disabled={!extendedEditing}
                />
              </FieldRow>
              <FieldRow label="Place of Birth" permType="self">
                <Input
                  value={extendedDraft.placeOfBirth}
                  onChange={(e) => setExtendedDraft({ ...extendedDraft, placeOfBirth: e.target.value })}
                  disabled={!extendedEditing}
                  placeholder="City, Province"
                  className="h-9 rounded-md border bg-transparent px-3 shadow-xs disabled:bg-muted/40 disabled:text-muted-foreground"
                />
              </FieldRow>
              <FieldRow label="Nationality" permType="self">
                <Input
                  value={extendedDraft.nationality}
                  onChange={(e) => setExtendedDraft({ ...extendedDraft, nationality: e.target.value })}
                  disabled={!extendedEditing}
                  placeholder="e.g. Filipino"
                  className="h-9 rounded-md border bg-transparent px-3 shadow-xs disabled:bg-muted/40 disabled:text-muted-foreground"
                />
              </FieldRow>
              <FieldRow label="Civil Status" permType="self">
                {extendedEditing ? (
                  <Select
                    value={extendedDraft.civilStatus}
                    onValueChange={(val) => setExtendedDraft({ ...extendedDraft, civilStatus: val })}
                  >
                    <SelectTrigger className="h-9 rounded-md border bg-transparent px-3 shadow-xs">
                      <SelectValue placeholder="Select status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Single">Single</SelectItem>
                      <SelectItem value="Married">Married</SelectItem>
                      <SelectItem value="Widowed">Widowed</SelectItem>
                      <SelectItem value="Separated">Separated</SelectItem>
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    value={extendedDraft.civilStatus || "—"}
                    disabled
                    className="h-9 rounded-md border bg-muted/40 px-3 shadow-xs text-muted-foreground"
                  />
                )}
              </FieldRow>
            </div>

            <FieldRow label="Complete Address" permType="self">
              <Textarea
                value={extendedDraft.address}
                onChange={(e) => setExtendedDraft({ ...extendedDraft, address: e.target.value })}
                disabled={!extendedEditing}
                placeholder="Street, Barangay, City, Province, ZIP"
                className="min-h-[80px] rounded-md border bg-transparent px-3 shadow-xs resize-none disabled:bg-muted/40 disabled:text-muted-foreground"
              />
            </FieldRow>
          </section>

          {/* ── Section 3: Bank Account ────────────────────────────────────── */}
          <section id="bank-account" className="bg-card border rounded-xl shadow-sm p-6 space-y-5 scroll-mt-6">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold tracking-tight">Bank Account</h2>
              {pendingSection === "bank" ? null : (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 px-3 text-xs cursor-pointer"
                  onClick={() => openApprovalModal("bank")}
                >
                  <Pencil className="h-3.5 w-3.5 mr-1.5" />
                  Request Change
                </Button>
              )}
            </div>

            {pendingSection === "bank" && (
              <div className="flex items-center gap-2.5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
                <Clock className="h-4 w-4 text-amber-600 shrink-0" />
                <p className="text-sm text-amber-700 font-medium">
                  Awaiting HR Approval — your request is pending review.
                </p>
              </div>
            )}

            {/* Bank fields — read-only; changes happen via modal */}
            <div className="grid sm:grid-cols-2 gap-4">
              <FieldRow label="Bank Name" permType="approval">
                <Input
                  value={bank.bankName || "—"}
                  readOnly
                  className="h-9 rounded-md border bg-muted/40 px-3 shadow-xs text-muted-foreground"
                />
              </FieldRow>
              <FieldRow label="Account Number" permType="approval">
                <Input
                  value={bank.accountNumber || "—"}
                  readOnly
                  className="h-9 rounded-md border bg-muted/40 px-3 shadow-xs text-muted-foreground"
                />
              </FieldRow>
              <FieldRow label="Account Name" permType="approval">
                <Input
                  value={bank.accountName || "—"}
                  readOnly
                  className="h-9 rounded-md border bg-muted/40 px-3 shadow-xs text-muted-foreground"
                />
              </FieldRow>
            </div>
          </section>

          {/* ── Section 4: Emergency Contacts ─────────────────────────────── */}
          <section id="emergency-contacts" className="bg-card border rounded-xl shadow-sm p-6 space-y-5 scroll-mt-6">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold tracking-tight">Emergency Contacts</h2>
              {ecEditing ? (
                <div className="flex gap-2">
                  <Button size="sm" className="h-8 px-3 text-xs cursor-pointer" onClick={handleEcSave} disabled={ecSaving}>
                    {ecSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />}Save
                  </Button>
                  <Button size="sm" variant="outline" className="h-8 px-3 text-xs cursor-pointer" onClick={handleEcCancel} disabled={ecSaving}>
                    Cancel
                  </Button>
                </div>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 px-3 text-xs cursor-pointer"
                  onClick={() => { setEcDraft(emergencyContacts); setEcEditing(true); }}
                >
                  <Pencil className="h-3.5 w-3.5 mr-1.5" />
                  Edit
                </Button>
              )}
            </div>

            {/* View mode */}
            {!ecEditing && (
              emergencyContacts.length === 0 ? (
                <p className="text-sm text-muted-foreground italic">No emergency contacts on file.</p>
              ) : (
                <div className="space-y-3">
                  {emergencyContacts.map((c, idx) => (
                    <div key={idx} className="rounded-xl border border-border bg-muted/20 p-4 grid sm:grid-cols-2 gap-3">
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground mb-0.5">Name</p>
                        <p className="text-sm font-semibold text-foreground">{c.contact_name || "—"}</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground mb-0.5">Relationship</p>
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
              )
            )}

            {/* Edit mode */}
            {ecEditing && (
              <div className="space-y-4">
                {ecDraft.map((c, idx) => (
                  <div key={idx} className="rounded-xl border border-border bg-muted/10 p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide">Contact {idx + 1}</p>
                      <button
                        onClick={() => removeEcContact(idx)}
                        className="h-6 w-6 rounded-md flex items-center justify-center text-red-400 hover:bg-red-50 hover:text-red-600 transition-colors cursor-pointer"
                        title="Remove contact"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <div className="grid sm:grid-cols-2 gap-3">
                      <FieldRow label="Name" permType="self">
                        <Input
                          value={c.contact_name}
                          onChange={(e) => updateEcField(idx, "contact_name", e.target.value)}
                          placeholder="Full name"
                          className="h-9 rounded-md border bg-transparent px-3 shadow-xs"
                        />
                      </FieldRow>
                      <FieldRow label="Relationship" permType="self">
                        <Input
                          value={c.relationship}
                          onChange={(e) => updateEcField(idx, "relationship", e.target.value)}
                          placeholder="e.g. Father, Spouse"
                          className="h-9 rounded-md border bg-transparent px-3 shadow-xs"
                        />
                      </FieldRow>
                      <FieldRow label="Phone" permType="self">
                        <Input
                          value={c.emergency_phone_number}
                          onChange={(e) => updateEcField(idx, "emergency_phone_number", e.target.value)}
                          placeholder="+63 900 000 0000"
                          className="h-9 rounded-md border bg-transparent px-3 shadow-xs"
                        />
                      </FieldRow>
                      <FieldRow label="Email (optional)" permType="self">
                        <Input
                          value={c.emergency_email_address ?? ""}
                          onChange={(e) => updateEcField(idx, "emergency_email_address", e.target.value)}
                          placeholder="email@example.com"
                          type="email"
                          className="h-9 rounded-md border bg-transparent px-3 shadow-xs"
                        />
                      </FieldRow>
                    </div>
                  </div>
                ))}
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full h-9 text-xs border-dashed cursor-pointer"
                  onClick={addEcContact}
                >
                  <Plus className="h-3.5 w-3.5 mr-1.5" />
                  Add Contact
                </Button>
              </div>
            )}
          </section>
        </div>
      </div>

      {/* Approval Modal */}
      <ApprovalModal
        state={approvalModal}
        currentLegalName={legalName}
        currentBank={bank}
        onClose={() => setApprovalModal({ ...approvalModal, open: false })}
        onSubmit={handleApprovalSubmit}
      />
    </div>
  );
}
