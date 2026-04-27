"use client";

import { useEffect, useRef, useState } from "react";
import {
  getUserInfo,
  getAccessToken,
  parseJwt,
  type StoredUser,
} from "@/lib/authStorage";
import { getEmployeeProfile, updateEmployeeProfile } from "@/lib/authApi";
import { submitChangeRequest, getMyChangeRequests } from "@/lib/changeRequestApi";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  User,
  CreditCard,
  MapPin,
  CheckCircle2,
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
  emergencyContactName: string;
  emergencyContactPhone: string;
  emergencyContactRelationship: string;
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
  fieldLabel: string;
  newValue: string;
}

async function compressImageToDataUrl(file: File, maxSize = 1024, quality = 0.82): Promise<string> {
  const imageBitmap = await createImageBitmap(file);
  const ratio = Math.min(1, maxSize / Math.max(imageBitmap.width, imageBitmap.height));
  const targetWidth = Math.max(1, Math.round(imageBitmap.width * ratio));
  const targetHeight = Math.max(1, Math.round(imageBitmap.height * ratio));

  const canvas = document.createElement("canvas");
  canvas.width = targetWidth;
  canvas.height = targetHeight;

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Image compression is not supported in this browser.");

  ctx.drawImage(imageBitmap, 0, 0, targetWidth, targetHeight);
  imageBitmap.close();

  return canvas.toDataURL("image/jpeg", quality);
}

// ─── Permission Badge ──────────────────────────────────────────────────────────

function PermBadge({ type }: Readonly<{ type: "self" | "approval" | "system" | "immutable" }>) {
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
}: Readonly<{
  label: string;
  permType: "self" | "approval" | "system" | "immutable";
  children: React.ReactNode;
}>) {
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
  onClose,
  onSubmit,
}: Readonly<{
  state: ApprovalModalState;
  onClose: () => void;
  onSubmit: (reason: string) => void;
}>) {
  const [reason, setReason] = useState("");
  const valueFieldId = "change-request-value";
  const reasonFieldId = "change-request-reason";

  const handleSubmit = () => {
    if (!reason.trim()) {
      toast.error("Please provide a reason for the change request.");
      return;
    }
    onSubmit(reason.trim());
    setReason("");
  };

  return (
    <Dialog open={state.open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base font-bold tracking-tight">
            Request Changes — {state.fieldLabel}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pt-1">
          <div className="space-y-1.5">
            <label htmlFor={valueFieldId} className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
              New Value
            </label>
            <Input
              id={valueFieldId}
              value={state.newValue}
              readOnly
              className="h-9 rounded-md border bg-muted/30 px-3 shadow-xs text-sm"
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor={reasonFieldId} className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
              Reason <span className="text-red-500">*</span>
            </label>
            <Textarea
              id={reasonFieldId}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Explain why you need this change..."
              className="min-h-22.5 rounded-md border bg-transparent px-3 shadow-xs resize-none text-sm"
            />
          </div>

          <p className="text-xs text-muted-foreground">
            Supporting document attachment is not yet available in this flow.
          </p>

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
  const [extended, setExtended] = useState<ExtendedProfile>({ phone: "", personalEmail: "", address: "", dob: "", placeOfBirth: "", nationality: "", civilStatus: "", emergencyContactName: "", emergencyContactPhone: "", emergencyContactRelationship: "" });
  const [extendedEditing, setExtendedEditing] = useState(false);
  const [extendedDraft, setExtendedDraft] = useState<ExtendedProfile>({ ...extended });
  const [extendedSaving, setExtendedSaving] = useState(false);

  // Bank state
  const [bank, setBank] = useState<BankInfo>({ bankName: "", accountNumber: "", accountName: "" });
  const [bankDraft, setBankDraft] = useState<BankInfo>({ ...bank });

  // Legal name state
  const [legalName, setLegalName] = useState({ first: "", middle: "", last: "" });
  const [legalNameDraft, setLegalNameDraft] = useState({ first: "", middle: "", last: "" });

  // Pending approvals
  const [pendingSection, setPendingSection] = useState<PendingSection>(null);

  // Approval modal
  const [approvalModal, setApprovalModal] = useState<ApprovalModalState>({ open: false, section: "legal-name", fieldLabel: "", newValue: "" });

  // ── Load from API on mount ────────────────────────────────────────────────
  useEffect(() => {
    const storedUser = getUserInfo();
    setUser(storedUser);

    const token = getAccessToken();
    if (token) {
      const payload = parseJwt(token);
      setJwtPayload(payload);
    }

    getEmployeeProfile()
      .then(async (p) => {
        if (p.avatar_url) setProfilePhoto(p.avatar_url);
        setLegalName({ first: p.first_name ?? "", middle: p.middle_name ?? "", last: p.last_name ?? "" });
        setLegalNameDraft({ first: p.first_name ?? "", middle: p.middle_name ?? "", last: p.last_name ?? "" });
        const ext: ExtendedProfile = {
          phone: p.phone_number ?? "",
          personalEmail: p.personal_email ?? "",
          address: p.complete_address ?? "",
          dob: p.date_of_birth ?? "",
          placeOfBirth: p.place_of_birth ?? "",
          nationality: p.nationality ?? "",
          civilStatus: p.civil_status ?? "",
          emergencyContactName: p.emergency_contact_name ?? "",
          emergencyContactPhone: p.emergency_contact_phone ?? "",
          emergencyContactRelationship: p.emergency_contact_relationship ?? "",
        };
        if (!ext.phone) {
          const jwtPhone = token ? parseJwt(token)?.phone_number ?? "" : "";
          ext.phone = jwtPhone;
        }
        setExtended(ext);
        setExtendedDraft(ext);
        const bk: BankInfo = { bankName: p.bank_name ?? "", accountNumber: p.bank_account_number ?? "", accountName: p.bank_account_name ?? "" };
        setBank(bk);
        setBankDraft(bk);
        if (p.employee_id) {
          const employeeIdFromProfile = p.employee_id;
          setJwtPayload((prev) => (prev ? { ...prev, employee_id: employeeIdFromProfile } : { employee_id: employeeIdFromProfile }));
        }

        // Restore pending state from DB, but don't fail profile render if this call fails.
        try {
          const changeReqs = await getMyChangeRequests();
          const pendingLegal = changeReqs.find(r => r.field_type === 'legal_name' && r.status === 'pending');
          const pendingBank  = changeReqs.find(r => r.field_type === 'bank'       && r.status === 'pending');
          if (pendingLegal)      setPendingSection('legal-name');
          else if (pendingBank)  setPendingSection('bank');
        } catch {
          setPendingSection(null);
        }
      })
      .catch((err) => toast.error(err instanceof Error ? err.message : "Failed to load profile."))
      .finally(() => setLoading(false));
  }, []);

  // ── Photo upload ──────────────────────────────────────────────────────────
  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    void (async () => {
      try {
        const b64 = await compressImageToDataUrl(file);
      setProfilePhoto(b64);
        await updateEmployeeProfile({ avatar_url: b64 });
        toast.success("Profile photo updated.");
      } catch {
        toast.error("Failed to save profile photo.");
      }
    })();
  };

  // ── Contact & Address save ────────────────────────────────────────────────
  const handleExtendedSave = async () => {
    setExtendedSaving(true);
    try {
      await updateEmployeeProfile({
        phone_number: extendedDraft.phone.trim() || null,
        personal_email: extendedDraft.personalEmail.trim() || null,
        date_of_birth: extendedDraft.dob || null,
        place_of_birth: extendedDraft.placeOfBirth.trim() || null,
        nationality: extendedDraft.nationality.trim() || null,
        civil_status: extendedDraft.civilStatus || null,
        complete_address: extendedDraft.address.trim() || null,
        emergency_contact_name: extendedDraft.emergencyContactName.trim() || null,
        emergency_contact_phone: extendedDraft.emergencyContactPhone.trim() || null,
        emergency_contact_relationship: extendedDraft.emergencyContactRelationship.trim() || null,
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

  // ── Approval modal open ───────────────────────────────────────────────────
  const openApprovalModal = (
    section: "legal-name" | "bank",
    fieldLabel: string,
    newValue: string
  ) => {
    setApprovalModal({ open: true, section, fieldLabel, newValue });
  };

  const handleApprovalSubmit = async (reason: string) => {
    const section = approvalModal.section;
    try {
      const requestedChanges: Record<string, string> =
        section === "bank"
          ? {
              bank_name:           bankDraft.bankName.trim(),
              bank_account_number: bankDraft.accountNumber.trim(),
              bank_account_name:   bankDraft.accountName.trim(),
            }
          : {
              first_name:  legalNameDraft.first.trim(),
              middle_name: legalNameDraft.middle.trim(),
              last_name:   legalNameDraft.last.trim(),
            };

      await submitChangeRequest({
        field_type: section === "bank" ? "bank" : "legal_name",
        requested_changes: requestedChanges,
        reason,
      });

      setPendingSection(section);
      setApprovalModal({ ...approvalModal, open: false });
      toast.success("Change request submitted — awaiting HR approval.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to submit change request.");
    }
  };

  const employeeId = jwtPayload?.employee_id ?? "EMP-XXXX";
  const displayName =
    [legalName.first, legalName.middle, legalName.last].filter(Boolean).join(" ") ||
    user?.name ||
    "Employee";
  const initials = displayName.charAt(0).toUpperCase();

  if (loading || !user) {
    return (
      <div className="flex items-center justify-center min-h-50 gap-2 text-muted-foreground">
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

      <div className="flex flex-col md:flex-row gap-6 items-start">
        {/* ── Left Sidebar ──────────────────────────────────────────────────── */}
        <div className="w-full md:w-70 md:sticky md:top-6 shrink-0">
          <div className="bg-card border rounded-xl shadow-sm p-5 space-y-4">
            {/* Avatar */}
            <div className="flex flex-col items-center gap-3">
              <button
                type="button"
                className="relative group cursor-pointer"
                onClick={() => photoInputRef.current?.click()}
              >
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
              </button>

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
                { id: "emergency-contact", label: "Emergency Contact", icon: User },
                { id: "bank-account", label: "Bank Account", icon: CreditCard },
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
                  onClick={() => {
                    openApprovalModal(
                      "legal-name",
                      "Legal Name",
                      [legalNameDraft.first, legalNameDraft.middle, legalNameDraft.last]
                        .filter(Boolean)
                        .join(" ")
                    );
                  }}
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

            <div className="grid sm:grid-cols-3 gap-4">
              <FieldRow label="First Name" permType="approval">
                <Input
                  value={legalNameDraft.first}
                  onChange={(e) => setLegalNameDraft({ ...legalNameDraft, first: e.target.value })}
                  className="h-9 rounded-md border bg-transparent px-3 shadow-xs"
                  placeholder="First name"
                  disabled={pendingSection === "legal-name"}
                />
              </FieldRow>
              <FieldRow label="Middle Name" permType="approval">
                <Input
                  value={legalNameDraft.middle}
                  onChange={(e) => setLegalNameDraft({ ...legalNameDraft, middle: e.target.value })}
                  className="h-9 rounded-md border bg-transparent px-3 shadow-xs"
                  placeholder="Middle name"
                  disabled={pendingSection === "legal-name"}
                />
              </FieldRow>
              <FieldRow label="Last Name" permType="approval">
                <Input
                  value={legalNameDraft.last}
                  onChange={(e) => setLegalNameDraft({ ...legalNameDraft, last: e.target.value })}
                  className="h-9 rounded-md border bg-transparent px-3 shadow-xs"
                  placeholder="Last name"
                  disabled={pendingSection === "legal-name"}
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
                className="min-h-20 rounded-md border bg-transparent px-3 shadow-xs resize-none disabled:bg-muted/40 disabled:text-muted-foreground"
              />
            </FieldRow>
          </section>

          {/* ── Section 3: Emergency Contact ─────────────────────────────── */}
          <section id="emergency-contact" className="bg-card border rounded-xl shadow-sm p-6 space-y-5 scroll-mt-6">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold tracking-tight">Emergency Contact</h2>
              {extendedEditing ? (
                <span className="text-xs font-medium text-muted-foreground">Included in current edit session</span>
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
              <FieldRow label="Contact Name" permType="self">
                <Input
                  value={extendedDraft.emergencyContactName}
                  onChange={(e) => setExtendedDraft({ ...extendedDraft, emergencyContactName: e.target.value })}
                  disabled={!extendedEditing}
                  placeholder="Full name"
                  className="h-9 rounded-md border bg-transparent px-3 shadow-xs disabled:bg-muted/40 disabled:text-muted-foreground"
                />
              </FieldRow>
              <FieldRow label="Relationship" permType="self">
                <Input
                  value={extendedDraft.emergencyContactRelationship}
                  onChange={(e) => setExtendedDraft({ ...extendedDraft, emergencyContactRelationship: e.target.value })}
                  disabled={!extendedEditing}
                  placeholder="e.g. Spouse, Parent, Sibling"
                  className="h-9 rounded-md border bg-transparent px-3 shadow-xs disabled:bg-muted/40 disabled:text-muted-foreground"
                />
              </FieldRow>
              <FieldRow label="Contact Phone" permType="self">
                <Input
                  value={extendedDraft.emergencyContactPhone}
                  onChange={(e) => setExtendedDraft({ ...extendedDraft, emergencyContactPhone: e.target.value })}
                  disabled={!extendedEditing}
                  placeholder="+63 900 000 0000"
                  className="h-9 rounded-md border bg-transparent px-3 shadow-xs disabled:bg-muted/40 disabled:text-muted-foreground"
                />
              </FieldRow>
            </div>
          </section>

          {/* ── Section 4: Bank Account ────────────────────────────────────── */}
          <section id="bank-account" className="bg-card border rounded-xl shadow-sm p-6 space-y-5 scroll-mt-6">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold tracking-tight">Bank Account</h2>
              {pendingSection === "bank" ? null : (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 px-3 text-xs cursor-pointer"
                  onClick={() => {
                    openApprovalModal(
                      "bank",
                      "Bank Account",
                      `${bankDraft.bankName} — ${bankDraft.accountNumber}`
                    );
                  }}
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

            <div className="grid sm:grid-cols-2 gap-4">
              <FieldRow label="Bank Name" permType="approval">
                <Input
                  value={bankDraft.bankName}
                  onChange={(e) => setBankDraft({ ...bankDraft, bankName: e.target.value })}
                  placeholder="e.g. BDO"
                  disabled={pendingSection === "bank"}
                  className="h-9 rounded-md border bg-transparent px-3 shadow-xs disabled:bg-muted/40 disabled:text-muted-foreground"
                />
              </FieldRow>
              <FieldRow label="Account Number" permType="approval">
                <Input
                  value={bankDraft.accountNumber}
                  onChange={(e) => setBankDraft({ ...bankDraft, accountNumber: e.target.value })}
                  placeholder="00000-0000000-0"
                  disabled={pendingSection === "bank"}
                  className="h-9 rounded-md border bg-transparent px-3 shadow-xs disabled:bg-muted/40 disabled:text-muted-foreground"
                />
              </FieldRow>
              <FieldRow label="Account Name" permType="approval">
                <Input
                  value={bankDraft.accountName}
                  onChange={(e) => setBankDraft({ ...bankDraft, accountName: e.target.value })}
                  placeholder="Full name on account"
                  disabled={pendingSection === "bank"}
                  className="h-9 rounded-md border bg-transparent px-3 shadow-xs disabled:bg-muted/40 disabled:text-muted-foreground"
                />
              </FieldRow>
            </div>
          </section>
        </div>
      </div>

      {/* Approval Modal */}
      <ApprovalModal
        state={approvalModal}
        onClose={() => setApprovalModal({ ...approvalModal, open: false })}
        onSubmit={handleApprovalSubmit}
      />
    </div>
  );
}
