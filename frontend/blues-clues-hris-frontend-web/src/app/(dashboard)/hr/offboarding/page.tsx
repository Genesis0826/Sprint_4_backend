"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Clock, CheckCircle, AlertTriangle, UserMinus, Plus, X, Check,
  KeyRound, DollarSign, Shield, Eye, FileText, Download, Archive, Loader2, Upload,
} from "lucide-react";
import {
  getOffboardingCases,
  updateOffboardingCaseById,
  addNewOffboardingCase,
  type OffboardingCase,
  type ChecklistItem,
  type SystemAccessItem,
} from "@/data/offboardingStore";

// ── Constants ──────────────────────────────────────────────────────────────────

const OFFBOARDING_TYPES = ["Termination", "End of Contract"];

const INITIATE_REASONS: Record<string, string[]> = {
  Termination:       ["Performance Issues", "Policy Violation", "Redundancy", "Restructuring", "Other"],
  "End of Contract": ["Contract Expired", "Project Completed", "Fixed-Term End", "Other"],
};

type AccountStatus    = OffboardingCase["accountStatus"];
type ChecklistStatus  = ChecklistItem["status"];
type OffboardingStatus = OffboardingCase["status"];

type InitiateForm = {
  offboardingType: string;
  employeeName: string;
  department: string;
  position: string;
  details: string;
  lastWorkingDay: string;
  reason: string;
};

// ── Pure helpers ───────────────────────────────────────────────────────────────

function getAccountStatusBg(s: AccountStatus): string {
  if (s === "active")      return "bg-green-50 border-green-100";
  if (s === "deactivated") return "bg-yellow-50 border-yellow-100";
  return "bg-slate-50 border-slate-200";
}

function getAccountStatusDesc(s: AccountStatus): string {
  if (s === "active")      return "Employee account is currently active";
  if (s === "deactivated") return "Access has been disabled. Account can be archived.";
  return "Account is archived for record-keeping purposes";
}

function getAccountStatusBadgeCls(s: AccountStatus): string {
  if (s === "active")      return "bg-green-100 text-green-700 border border-green-200";
  if (s === "deactivated") return "bg-yellow-100 text-yellow-700 border border-yellow-200";
  return "bg-slate-100 text-slate-500 border border-slate-200";
}

function getAccountStatusLabel(s: AccountStatus): string {
  if (s === "active")      return "Active";
  if (s === "deactivated") return "Deactivated";
  return "Archived";
}

function getEmployeeBadgeCls(status: OffboardingStatus): string {
  return status === "completed"
    ? "bg-green-100 text-green-700 border border-green-200"
    : "bg-blue-100 text-blue-700 border border-blue-200";
}

function getEmployeeBadgeLabel(status: OffboardingStatus): string {
  if (status === "completed")   return "Completed";
  if (status === "hr_accepted") return "In Progress";
  return "Manager Acknowledged";
}

function getModalStatus(status: ChecklistStatus | undefined): string {
  if (status === "verified") return "Verified";
  if (status === "disputed") return "Disputed";
  return "Pending Review";
}

function getModalStatusColor(status: ChecklistStatus | undefined): string {
  if (status === "verified") return "bg-green-100 text-green-700 border-green-200";
  if (status === "disputed") return "bg-red-100 text-red-700 border-red-200";
  return "bg-yellow-100 text-yellow-700 border-yellow-200";
}

function fmtPay(raw: string): string {
  const stripped = raw.replaceAll(",", "");
  const n = Number.parseFloat(stripped);
  if (!stripped || Number.isNaN(n) || n === 0) return "";
  const [intPart, decPart] = stripped.split(".");
  const formatted = new Intl.NumberFormat("en-US").format(Number.parseInt(intPart, 10));
  return decPart === undefined ? formatted : `${formatted}.${decPart}`;
}

function parsePay(input: string): string {
  const clean = input.replaceAll(/[^0-9.]/g, "");
  const parts = clean.split(".");
  return parts.length > 2 ? `${parts[0]}.${parts.slice(1).join("")}` : clean;
}

function calcProgress(verified: number, total: number, done: boolean) {
  if (done) return { pct: 100, percent: 100, count: total };
  const pct = total > 0 ? (verified / total) * 100 : 0;
  return { pct, percent: Math.round(pct), count: verified };
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function ChecklistStatusBadge({ status }: { readonly status: ChecklistStatus }) {
  if (status === "verified") {
    return <Badge className="bg-green-100 text-green-700 border border-green-200">Verified</Badge>;
  }
  if (status === "disputed") {
    return <Badge className="bg-red-100 text-red-500 border border-red-200">Disputed</Badge>;
  }
  return <Badge className="bg-yellow-100 text-yellow-700 border border-yellow-200">Pending Review</Badge>;
}

function SystemAccessRow({
  item,
  onRevoke,
  isRevoking,
}: {
  readonly item: SystemAccessItem;
  readonly onRevoke: (id: number) => void;
  readonly isRevoking: boolean;
}) {
  return (
    <div className={`flex items-center justify-between border rounded-md px-3 py-2.5 ${item.revoked ? "bg-red-50 border-red-100" : ""}`}>
      <div>
        <p className="text-sm">{item.label}</p>
        {item.revoked && <p className="text-xs text-red-400">Revoked on {item.revokedDate}</p>}
      </div>
      {item.revoked ? (
        <Badge variant="outline" className="border-red-200 text-red-500 bg-red-50">Revoked</Badge>
      ) : (
        <Button size="sm" onClick={() => onRevoke(item.id)} disabled={isRevoking} className="bg-red-600 hover:bg-red-700 text-white h-7 px-3 text-xs">
          {isRevoking ? <Loader2 className="size-3.5 animate-spin mr-1" /> : null}
          Revoke
        </Button>
      )}
    </div>
  );
}

function ChecklistRow({
  item,
  employeeName,
  onView,
  onVerify,
  onFlag,
  isVerifying,
  isFlagging,
}: {
  readonly item: ChecklistItem;
  readonly employeeName: string;
  readonly onView: () => void;
  readonly onVerify: (id: number) => void;
  readonly onFlag: (id: number) => void;
  readonly isVerifying: boolean;
  readonly isFlagging: boolean;
}) {
  return (
    <div className="flex items-center justify-between border rounded-md px-4 py-3">
      <div>
        <p className="text-sm font-medium">{employeeName}</p>
        <p className={`text-xs mt-0.5 ${item.proofUploaded ? "text-blue-500" : "text-slate-400"}`}>{item.label}</p>
      </div>
      <div className="flex items-center gap-2">
        <ChecklistStatusBadge status={item.status} />
        <Button variant="outline" size="sm" onClick={onView} className="flex items-center gap-1.5 h-8">
          <Eye className="size-3.5" /> View
        </Button>
        {item.status === "pending_review" && item.proofUploaded && (
          <>
            <Button size="sm" onClick={() => onVerify(item.id)} disabled={isVerifying || isFlagging} className="bg-green-100 hover:bg-green-200 text-green-700 border border-green-200 h-8 px-3 text-xs">
              {isVerifying ? <Loader2 className="size-3.5 animate-spin mr-1" /> : <CheckCircle className="size-3.5 mr-1" />} Verify
            </Button>
            <Button size="sm" onClick={() => onFlag(item.id)} disabled={isFlagging || isVerifying} className="bg-yellow-100 hover:bg-yellow-200 text-yellow-700 border border-yellow-200 h-8 px-3 text-xs">
              {isFlagging ? <Loader2 className="size-3.5 animate-spin mr-1" /> : <AlertTriangle className="size-3.5 mr-1" />} Flag
            </Button>
          </>
        )}
        {item.status === "disputed" && (
          <Button size="sm" className="bg-blue-100 hover:bg-blue-200 text-blue-700 border border-blue-200 h-8 px-3 text-xs">
            Send Notification
          </Button>
        )}
      </div>
    </div>
  );
}

function OverviewCaseRow({
  c,
  isSelected,
  onSelect,
}: {
  readonly c: OffboardingCase;
  readonly isSelected: boolean;
  readonly onSelect: (id: string) => void;
}) {
  const cVerified          = c.checklistItems.filter(i => i.status === "verified").length;
  const cTotal             = c.checklistItems.length;
  const cDone              = c.status === "completed";
  const { pct, percent, count } = calcProgress(cVerified, cTotal, cDone);
  const badgeCls = cDone
    ? "bg-green-100 text-green-700 border border-green-200"
    : "bg-blue-100 text-blue-700 border border-blue-200";
  return (
    <button
      type="button"
      onClick={() => onSelect(c.id)}
      className={`w-full text-left border rounded-md px-4 py-3 space-y-2 hover:bg-slate-50 ${isSelected ? "border-slate-400 bg-slate-50" : ""}`}
    >
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium">{c.employeeName}</p>
          <p className="text-xs text-slate-400">{c.department}</p>
        </div>
        <Badge className={badgeCls}>{cDone ? "Completed" : "In Progress"}</Badge>
      </div>
      <div className="space-y-1">
        <div className="flex items-center justify-between text-xs text-slate-500">
          <span>Progress</span>
          <span>{count} of {cTotal} items ({percent}%)</span>
        </div>
        <Progress value={pct} className="[&>div]:bg-green-500" />
      </div>
    </button>
  );
}

const ITEM_STATUS_CONFIG = {
  verified: { keyPrefix: "verify", error: "Failed to verify item. Please try again." },
  disputed: { keyPrefix: "flag",   error: "Failed to flag item. Please try again." },
} as const;

function parseMoney(val: string | undefined): number {
  return Number.parseFloat(val ?? "0") || 0;
}

function computeCaseFlags(c: OffboardingCase | null) {
  const isPending    = c?.status === "manager_acknowledged";
  const isInProgress = c?.status === "hr_accepted";
  const isCompleted  = c?.status === "completed";
  return {
    isPending,
    isCompleted,
    hasCase:      isPending || isInProgress || isCompleted,
    showProgress: isInProgress || isCompleted,
  };
}

function computeChecklistState(items: ChecklistItem[]) {
  const verified = items.filter(i => i.status === "verified").length;
  return { allVerified: items.length > 0 && verified === items.length };
}

function computeCanGenerateClearance(paymentReleased: boolean | undefined, allVerified: boolean): boolean {
  return !!paymentReleased && allVerified;
}

const PAYMENT_STATUS_CLS: Record<string, string> = {
  "true":  "bg-green-50 border-green-100",
  "false": "bg-yellow-50 border-yellow-100",
};

function isInitiateFormValid(form: InitiateForm): boolean {
  return !!(form.employeeName.trim() && form.department.trim() && form.position.trim() && form.lastWorkingDay && form.reason);
}

function findModalItem(
  viewItem: { label: string } | null,
  selectedCase: OffboardingCase | null
): ChecklistItem | null {
  if (!viewItem || !selectedCase) return null;
  return selectedCase.checklistItems.find(i => i.label === viewItem.label) ?? null;
}

// ── Page Component ─────────────────────────────────────────────────────────────

export default function HROffboardingPage() {
  const [cases, setCases] = useState<OffboardingCase[]>([]);
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null);
  const [showInitiateForm, setShowInitiateForm] = useState(false);
  const [showClearanceModal, setShowClearanceModal] = useState(false);
  const [viewItem, setViewItem] = useState<{ label: string } | null>(null);
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hrDetailsMode, setHrDetailsMode] = useState<"type" | "upload">("type");
  const [hrDetailsFile, setHrDetailsFile] = useState<File | null>(null);
  const [initiateForm, setInitiateForm] = useState<InitiateForm>({
    offboardingType: "Termination",
    employeeName: "", department: "", position: "", details: "", lastWorkingDay: "", reason: "",
  });

  useEffect(() => {
    const load = () => setCases(getOffboardingCases());
    load();
    globalThis.addEventListener("offboarding-updated", load);
    globalThis.addEventListener("storage", load);
    return () => {
      globalThis.removeEventListener("offboarding-updated", load);
      globalThis.removeEventListener("storage", load);
    };
  }, []);

  const selectedCase = cases.find(c => c.id === selectedCaseId) ?? null;

  const { isPending, isCompleted, hasCase, showProgress } = computeCaseFlags(selectedCase);

  const totalActive    = cases.filter(c => c.status === "hr_accepted").length;
  const totalCompleted = cases.filter(c => c.status === "completed").length;
  const pendingReview  = cases.filter(c => c.status === "manager_acknowledged").length;
  const incomingCases  = cases.filter(c => c.status === "manager_acknowledged");
  const overviewCases  = cases.filter(c => c.status === "hr_accepted" || c.status === "completed");

  const salary      = parseMoney(selectedCase?.salaryBalance);
  const deductAmt   = parseMoney(selectedCase?.deductions);
  const addAmt      = parseMoney(selectedCase?.additionalPay);
  const totalAmount = Math.max(0, salary - deductAmt + addAmt);

  const checklistItems = selectedCase?.checklistItems ?? [];
  const { allVerified } = computeChecklistState(checklistItems);
  const canGenerateClearance = computeCanGenerateClearance(selectedCase?.paymentReleased, allVerified);

  const modalItem        = findModalItem(viewItem, selectedCase);
  const modalHasProof    = !!modalItem?.proofUploaded;
  const modalProofName   = modalItem?.proofFileName;
  const modalProofDate   = modalItem?.proofDate;
  const modalStatus      = getModalStatus(modalItem?.status);
  const modalStatusColor = getModalStatusColor(modalItem?.status);

  const initiateLabel     = initiateForm.offboardingType === "End of Contract" ? "Initiate End of Contract" : "Initiate Termination";
  const initiateFormValid = isInitiateFormValid(initiateForm);

  function update(id: string, patch: Partial<OffboardingCase>) { updateOffboardingCaseById(id, patch); }

  async function handleInitiate() {
    if (!initiateFormValid) return;
    setLoadingAction("initiate");
    setError(null);
    try {
      const today   = new Date().toISOString().split("T")[0];
      const created = addNewOffboardingCase({
        employeeName: initiateForm.employeeName, department: initiateForm.department,
        position: initiateForm.position, offboardingType: initiateForm.offboardingType,
        lastWorkingDay: initiateForm.lastWorkingDay, reason: initiateForm.reason,
        resignationLetter: initiateForm.details, submittedDate: today,
        initiatedBy: "HR", status: "hr_accepted",
      });
      setSelectedCaseId(created.id);
      setShowInitiateForm(false);
      setInitiateForm({ offboardingType: "Termination", employeeName: "", department: "", position: "", details: "", lastWorkingDay: "", reason: "" });
      setHrDetailsMode("type");
      setHrDetailsFile(null);
    } catch {
      setError("Failed to initiate offboarding. Please try again.");
    } finally {
      setLoadingAction(null);
    }
  }

  async function handleAccept(id: string) {
    setLoadingAction(`accept-${id}`);
    setError(null);
    try { update(id, { status: "hr_accepted" }); setSelectedCaseId(id); }
    catch { setError("Failed to accept case. Please try again."); }
    finally { setLoadingAction(null); }
  }

  async function handleReject(id: string) {
    setLoadingAction(`reject-${id}`);
    setError(null);
    try { update(id, { status: "rejected" }); if (selectedCaseId === id) setSelectedCaseId(null); }
    catch { setError("Failed to reject case. Please try again."); }
    finally { setLoadingAction(null); }
  }

  async function handleRevoke(itemId: number) {
    if (!selectedCase) return;
    setLoadingAction(`revoke-${itemId}`);
    setError(null);
    try {
      const today = new Date().toISOString().split("T")[0];
      update(selectedCase.id, { systemAccess: selectedCase.systemAccess.map(a => a.id === itemId ? { ...a, revoked: true, revokedDate: today } : a) });
    } catch { setError("Failed to revoke access. Please try again."); }
    finally { setLoadingAction(null); }
  }

  async function handleRevokeAll() {
    if (!selectedCase) return;
    setLoadingAction("revoke-all");
    setError(null);
    try {
      const today = new Date().toISOString().split("T")[0];
      update(selectedCase.id, { systemAccess: selectedCase.systemAccess.map(a => a.revoked ? a : { ...a, revoked: true, revokedDate: today }) });
    } catch { setError("Failed to revoke all access. Please try again."); }
    finally { setLoadingAction(null); }
  }

  async function handleSetItemStatus(itemId: number, status: "verified" | "disputed") {
    if (!selectedCase) return;
    const { keyPrefix, error } = ITEM_STATUS_CONFIG[status];
    setLoadingAction(`${keyPrefix}-${itemId}`);
    setError(null);
    try { update(selectedCase.id, { checklistItems: selectedCase.checklistItems.map(i => i.id === itemId ? { ...i, status } : i) }); }
    catch { setError(error); }
    finally { setLoadingAction(null); }
  }

  async function handleReleasePayment() {
    if (!selectedCase) return;
    setLoadingAction("release-payment");
    setError(null);
    try { update(selectedCase.id, { paymentReleased: true }); }
    catch { setError("Failed to release payment. Please try again."); }
    finally { setLoadingAction(null); }
  }

  async function handleSetAccountStatus(status: "deactivated" | "archived") {
    if (!selectedCase) return;
    const key = status === "deactivated" ? "deactivate" : "archive";
    setLoadingAction(key);
    setError(null);
    try { update(selectedCase.id, { accountStatus: status }); }
    catch { setError(`Failed to ${key} account. Please try again.`); }
    finally { setLoadingAction(null); }
  }

  async function handleConfirmClearance() {
    if (!selectedCase) return;
    setLoadingAction("clearance");
    setError(null);
    try {
      const today = new Date().toISOString().split("T")[0];
      update(selectedCase.id, { status: "completed", clearanceGenerated: true, clearanceDate: today });
      setShowClearanceModal(false);
    } catch { setError("Failed to generate clearance. Please try again."); }
    finally { setLoadingAction(null); }
  }

  return (
    <div className="p-6 space-y-6">

      {/* ── Checklist Item Details Modal ── */}
      <Dialog open={!!viewItem} onOpenChange={() => setViewItem(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Checklist Item Details</DialogTitle></DialogHeader>
          {viewItem && selectedCase && (
            <div className="space-y-3 pt-2">
              <div className="border rounded-md px-3 py-2.5">
                <p className="text-xs text-slate-400 mb-0.5">Employee</p>
                <p className="text-sm font-medium">{selectedCase.employeeName}</p>
              </div>
              <div className="border rounded-md px-3 py-2.5">
                <p className="text-xs text-slate-400 mb-0.5">Checklist Item</p>
                <p className="text-sm font-medium">{viewItem.label}</p>
              </div>
              <div className="border rounded-md px-3 py-2.5">
                <p className="text-xs text-slate-400 mb-1">Status</p>
                <Badge className={`border ${modalStatusColor}`}>{modalStatus}</Badge>
              </div>
              {modalItem?.status !== "disputed" && (
                <div className="border rounded-md px-3 py-3 space-y-3">
                  <p className="text-xs text-slate-400">Uploaded Proof</p>
                  {modalHasProof ? (
                    <>
                      <div className="flex items-center justify-between bg-slate-50 border rounded-md px-3 py-2.5">
                        <div className="flex items-center gap-2">
                          <FileText className="size-4 text-slate-500 shrink-0" />
                          <div>
                            <p className="text-sm font-medium">{modalProofName}</p>
                            <p className="text-xs text-slate-400">Uploaded on {modalProofDate}</p>
                          </div>
                        </div>
                        <Button size="sm" className="bg-slate-900 hover:bg-slate-800 text-white h-7 px-3 text-xs shrink-0">
                          <Download className="size-3 mr-1" /> Download
                        </Button>
                      </div>
                      <div className="bg-slate-100 rounded-md flex flex-col items-center justify-center py-8 gap-2">
                        <FileText className="size-8 text-slate-300" />
                        <p className="text-xs text-slate-400">Proof document preview</p>
                        <p className="text-xs text-slate-400">Click download to view full document</p>
                      </div>
                    </>
                  ) : (
                    <div className="bg-slate-50 border border-dashed rounded-md flex flex-col items-center justify-center py-8 gap-2">
                      <FileText className="size-8 text-slate-300" />
                      <p className="text-xs text-slate-500 font-medium">No proof uploaded yet</p>
                      <p className="text-xs text-slate-400">Employee has not submitted proof for this item</p>
                    </div>
                  )}
                </div>
              )}
              {modalHasProof && modalItem?.status === "pending_review" && (
                <div className="grid grid-cols-2 gap-3 pt-1">
                  <Button onClick={() => { handleSetItemStatus(modalItem.id, "verified"); setViewItem(null); }} className="bg-green-100 hover:bg-green-200 text-green-700 border border-green-200">
                    <CheckCircle className="size-4 mr-2" /> Verify
                  </Button>
                  <Button onClick={() => { handleSetItemStatus(modalItem.id, "disputed"); setViewItem(null); }} className="bg-yellow-100 hover:bg-yellow-200 text-yellow-700 border border-yellow-200">
                    <AlertTriangle className="size-4 mr-2" /> Flag
                  </Button>
                </div>
              )}
              {modalItem?.status === "disputed" && (
                <div className="bg-red-50 border border-red-100 rounded-md px-4 py-3 text-sm text-red-700">
                  Note: This item has been flagged as disputed. Send notification to employee for resubmission.
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Clearance Confirmation Modal ── */}
      <Dialog open={showClearanceModal} onOpenChange={setShowClearanceModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Shield className="size-5 text-green-600" /> Generate Clearance Certificate
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="border rounded-md px-4 py-5 text-center space-y-3">
              <Shield className="size-10 text-green-500 mx-auto" />
              <p className="font-bold text-sm tracking-widest">CLEARANCE CERTIFICATE</p>
              <hr />
              <p className="text-sm text-slate-600 leading-relaxed">
                This is to certify that <strong>{selectedCase?.employeeName}</strong>,{" "}
                {selectedCase?.position} from the {selectedCase?.department} department, has
                completed all offboarding requirements and returned all company property. All financial obligations have been settled.
              </p>
              <p className="text-sm text-slate-600">
                This certificate is issued on{" "}
                <strong>{new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}</strong>{" "}
                as proof of successful completion of the offboarding process.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Button variant="outline" onClick={() => setShowClearanceModal(false)}>Cancel</Button>
              <Button onClick={handleConfirmClearance} disabled={loadingAction === "clearance"} className="bg-slate-900 hover:bg-slate-800 text-white">
                {loadingAction === "clearance" ? <Loader2 className="size-4 animate-spin mr-2" /> : <Shield className="size-4 mr-2" />}
                Confirm &amp; Generate
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Error Banner ── */}
      {error && (
        <div className="flex items-center justify-between bg-red-50 border border-red-200 rounded-md px-4 py-3 text-sm text-red-700">
          <span>{error}</span>
          <button type="button" onClick={() => setError(null)} className="ml-4 text-red-400 hover:text-red-600">
            <X className="size-4" />
          </button>
        </div>
      )}

      {/* ── Page Header ── */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Offboarding Management</h1>
        {showInitiateForm ? (
          <Button onClick={() => setShowInitiateForm(false)} className="bg-slate-900 hover:bg-slate-800 text-white">
            <X className="size-4 mr-2" /> Cancel
          </Button>
        ) : (
          <Button onClick={() => setShowInitiateForm(true)} className="bg-slate-900 hover:bg-slate-800 text-white">
            <Plus className="size-4 mr-2" /> Initiate Offboarding
          </Button>
        )}
      </div>

      {/* ── Initiate Offboarding Form ── */}
      {showInitiateForm && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><UserMinus className="size-5" /> Initiate Offboarding</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Offboarding Type</Label>
              <select value={initiateForm.offboardingType} onChange={e => setInitiateForm(f => ({ ...f, offboardingType: e.target.value, reason: "" }))} className="w-full border border-input rounded-md px-3 py-2 text-sm bg-background h-10">
                {OFFBOARDING_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Employee Name</Label>
                <Input placeholder="John Doe" value={initiateForm.employeeName} onChange={e => setInitiateForm(f => ({ ...f, employeeName: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Department</Label>
                <Input placeholder="Engineering" value={initiateForm.department} onChange={e => setInitiateForm(f => ({ ...f, department: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Position</Label>
              <Input placeholder="Software Engineer" value={initiateForm.position} onChange={e => setInitiateForm(f => ({ ...f, position: e.target.value }))} />
            </div>
            {/* Type Manually / Upload File toggle */}
            <div className="flex">
              <button
                type="button"
                onClick={() => setHrDetailsMode("type")}
                className={`flex items-center gap-1.5 px-4 py-2 text-sm rounded-l-md border ${hrDetailsMode === "type" ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"}`}
              >
                <FileText className="size-4" /> Type Manually
              </button>
              <button
                type="button"
                onClick={() => setHrDetailsMode("upload")}
                className={`flex items-center gap-1.5 px-4 py-2 text-sm rounded-r-md border-t border-r border-b ${hrDetailsMode === "upload" ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"}`}
              >
                <Upload className="size-4" /> Upload File
              </button>
            </div>
            {hrDetailsMode === "type" ? (
              <div className="space-y-2">
                <Label>{initiateForm.offboardingType} Details</Label>
                <Textarea placeholder={`Enter ${initiateForm.offboardingType.toLowerCase()} details...`} value={initiateForm.details} onChange={e => setInitiateForm(f => ({ ...f, details: e.target.value }))} className="min-h-28 bg-slate-50 resize-none" />
              </div>
            ) : (
              <div className="space-y-1.5">
                <Label>Upload Document</Label>
                <label className="flex items-center justify-center gap-2 border border-dashed rounded-md py-5 cursor-pointer hover:bg-slate-50 bg-slate-50">
                  <input type="file" accept=".pdf,.doc,.docx" className="hidden" onChange={e => setHrDetailsFile(e.target.files?.[0] ?? null)} />
                  <Upload className="size-4 text-slate-400" />
                  <span className="text-sm text-slate-500">Click to upload or drag and drop</span>
                </label>
                {hrDetailsFile && (
                  <div className="flex items-center justify-between border rounded-md px-3 py-2.5 bg-white">
                    <div className="flex items-center gap-2 min-w-0">
                      <FileText className="size-4 text-slate-500 shrink-0" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{hrDetailsFile.name}</p>
                        <p className="text-xs text-slate-400">{(hrDetailsFile.size / 1024).toFixed(2)} KB</p>
                      </div>
                    </div>
                    <button type="button" onClick={() => setHrDetailsFile(null)} className="ml-3 text-slate-400 hover:text-slate-600 shrink-0">
                      <X className="size-4" />
                    </button>
                  </div>
                )}
                <p className="text-xs text-slate-400">Supported formats: PDF, DOC, DOCX (Max 10MB)</p>
              </div>
            )}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Last Working Day</Label>
                <Input type="date" value={initiateForm.lastWorkingDay} onChange={e => setInitiateForm(f => ({ ...f, lastWorkingDay: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Reason</Label>
                <select value={initiateForm.reason} onChange={e => setInitiateForm(f => ({ ...f, reason: e.target.value }))} className="w-full border border-input rounded-md px-3 py-2 text-sm bg-background h-10">
                  <option value="">Select a reason</option>
                  {(INITIATE_REASONS[initiateForm.offboardingType] ?? []).map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
            </div>
            <Button onClick={handleInitiate} disabled={!initiateFormValid || loadingAction === "initiate"} className="w-full bg-rose-400 hover:bg-rose-500 text-white disabled:opacity-50 disabled:cursor-not-allowed">
              {loadingAction === "initiate" ? <Loader2 className="size-4 animate-spin mr-2" /> : <UserMinus className="size-4 mr-2" />}
              {initiateLabel}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* ── Stats ── */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-5 pb-4">
            <div className="flex items-start justify-between">
              <div><p className="text-sm text-slate-500">Total Offboarding</p><p className="text-3xl font-bold mt-1">{totalActive}</p><p className="text-xs text-slate-400 mt-1">Active cases</p></div>
              <Clock className="size-5 text-blue-400 shrink-0" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 pb-4">
            <div className="flex items-start justify-between">
              <div><p className="text-sm text-slate-500">Completed</p><p className="text-3xl font-bold mt-1">{totalCompleted}</p><p className="text-xs text-slate-400 mt-1">All time</p></div>
              <CheckCircle className="size-5 text-green-400 shrink-0" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 pb-4">
            <div className="flex items-start justify-between">
              <div><p className="text-sm text-slate-500">Pending Review</p><p className="text-3xl font-bold mt-1">{pendingReview}</p><p className="text-xs text-slate-400 mt-1">Require action</p></div>
              <AlertTriangle className="size-5 text-yellow-400 shrink-0" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Incoming Offboarding Requests ── */}
      <Card>
        <CardHeader><CardTitle>Incoming Offboarding Requests</CardTitle></CardHeader>
        <CardContent>
          {incomingCases.length > 0 ? (
            <table className="w-full text-sm table-fixed">
              <thead>
                <tr className="border-b">
                  {["Employee Name", "Department", "Type", "Submitted Date", "Status", "Actions"].map(h => (
                    <th key={h} className={`py-2 px-2 font-semibold text-slate-700 whitespace-nowrap ${h === "Actions" ? "text-right w-24" : "text-left"}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {incomingCases.map(c => (
                  <tr key={c.id} onClick={() => setSelectedCaseId(c.id)} className={`border-b last:border-0 cursor-pointer hover:bg-slate-50 ${selectedCaseId === c.id ? "bg-slate-50" : ""}`}>
                    <td className="py-3 px-2 font-medium whitespace-nowrap">{c.employeeName}</td>
                    <td className="py-3 px-2 whitespace-nowrap">{c.department}</td>
                    <td className="py-3 px-2"><Badge variant="outline" className="text-slate-500 bg-slate-50">{c.offboardingType}</Badge></td>
                    <td className="py-3 px-2 whitespace-nowrap">{c.submittedDate}</td>
                    <td className="py-3 px-2"><Badge className="bg-blue-100 text-blue-700 border border-blue-200 whitespace-nowrap">Manager Acknowledged</Badge></td>
                    <td className="py-3 px-2 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button type="button" onClick={e => { e.stopPropagation(); handleAccept(c.id); }} disabled={loadingAction === `accept-${c.id}` || loadingAction === `reject-${c.id}`} className="h-8 w-8 rounded-full border border-green-200 bg-green-50 flex items-center justify-center hover:bg-green-100 disabled:opacity-50">
                          {loadingAction === `accept-${c.id}` ? <Loader2 className="size-4 animate-spin text-green-600" /> : <Check className="size-4 text-green-600" />}
                        </button>
                        <button type="button" onClick={e => { e.stopPropagation(); handleReject(c.id); }} disabled={loadingAction === `accept-${c.id}` || loadingAction === `reject-${c.id}`} className="h-8 w-8 rounded-full border border-red-200 bg-red-50 flex items-center justify-center hover:bg-red-100 disabled:opacity-50">
                          {loadingAction === `reject-${c.id}` ? <Loader2 className="size-4 animate-spin text-red-600" /> : <X className="size-4 text-red-600" />}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="text-sm text-slate-400 text-center py-4">No pending requests</p>
          )}
        </CardContent>
      </Card>

      {/* ── Selected Employee ── */}
      {hasCase && selectedCase && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Selected Employee</CardTitle>
            <Badge className={getEmployeeBadgeCls(selectedCase.status)}>{getEmployeeBadgeLabel(selectedCase.status)}</Badge>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              {([{ label: "Employee", value: selectedCase.employeeName }, { label: "Department", value: selectedCase.department }, { label: "Type", value: selectedCase.offboardingType }] as const).map(({ label, value }) => (
                <div key={label} className="border rounded-md px-3 py-2.5">
                  <p className="text-xs text-slate-400 mb-0.5">{label}</p>
                  <p className="text-sm font-medium">{value}</p>
                </div>
              ))}
            </div>
            {isPending && (
              <div className="grid grid-cols-2 gap-3 pt-1">
                <Button onClick={() => handleAccept(selectedCase.id)} disabled={loadingAction === `accept-${selectedCase.id}` || loadingAction === `reject-${selectedCase.id}`} className="bg-slate-900 hover:bg-slate-800 text-white">
                  {loadingAction === `accept-${selectedCase.id}` ? <Loader2 className="size-4 animate-spin mr-2" /> : <Check className="size-4 mr-2" />}
                  Accept Offboarding
                </Button>
                <Button onClick={() => handleReject(selectedCase.id)} disabled={loadingAction === `accept-${selectedCase.id}` || loadingAction === `reject-${selectedCase.id}`} className="bg-red-600 hover:bg-red-700 text-white">
                  {loadingAction === `reject-${selectedCase.id}` ? <Loader2 className="size-4 animate-spin mr-2" /> : <X className="size-4 mr-2" />}
                  Reject
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── System Access + Final Pay ── */}
      {showProgress && selectedCase && (
        <div className="grid grid-cols-2 gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <KeyRound className="size-4 text-orange-500" /> System Access Revocation
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {selectedCase.systemAccess.map(item => (
                <SystemAccessRow key={item.id} item={item} onRevoke={handleRevoke} isRevoking={loadingAction === `revoke-${item.id}`} />
              ))}
              <div className="bg-blue-50 border border-blue-100 rounded-md px-3 py-2.5 text-xs text-blue-700">
                Revoke system access immediately to disable employee access to critical systems.
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <DollarSign className="size-4 text-green-600" /> Final Pay
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-slate-500">Salary Balance</Label>
                <Input
                  type="text"
                  placeholder="0.00"
                  value={fmtPay(selectedCase.salaryBalance)}
                  onChange={e => update(selectedCase.id, { salaryBalance: parsePay(e.target.value) })}
                  className="bg-slate-50"
                  disabled={isCompleted}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-slate-500">Deductions</Label>
                <Input
                  type="text"
                  placeholder="0.00"
                  value={fmtPay(selectedCase.deductions)}
                  onChange={e => update(selectedCase.id, { deductions: parsePay(e.target.value) })}
                  className="bg-slate-50"
                  disabled={isCompleted}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-slate-500">Additional Pay</Label>
                <Input
                  type="text"
                  placeholder="0.00"
                  value={fmtPay(selectedCase.additionalPay)}
                  onChange={e => update(selectedCase.id, { additionalPay: parsePay(e.target.value) })}
                  className="bg-slate-50"
                  disabled={isCompleted}
                />
              </div>
              <div className="flex items-center justify-between text-sm font-medium pt-1">
                <span className="text-slate-500">Total Amount</span>
                <span>${totalAmount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              </div>
              <div className={`flex items-center justify-between text-sm border rounded-md px-3 py-2.5 ${PAYMENT_STATUS_CLS[String(selectedCase.paymentReleased)]}`}>
                <span className="text-slate-600">{selectedCase.paymentReleased ? "Payment Released" : "Payment Pending"}</span>
                <span className="font-medium">${totalAmount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              </div>
              {!selectedCase.paymentReleased && (
                <Button onClick={handleReleasePayment} disabled={loadingAction === "release-payment"} className="w-full bg-slate-900 hover:bg-slate-800 text-white">
                  {loadingAction === "release-payment" ? <Loader2 className="size-4 animate-spin mr-2" /> : null}
                  Release Payment
                </Button>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── Checklist Verification ── */}
      {showProgress && selectedCase && (
        <Card>
          <CardHeader><CardTitle>Checklist Verification</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {selectedCase.checklistItems.map(item => (
              <ChecklistRow key={item.id} item={item} employeeName={selectedCase.employeeName} onView={() => setViewItem({ label: item.label })} onVerify={id => handleSetItemStatus(id, "verified")} onFlag={id => handleSetItemStatus(id, "disputed")} isVerifying={loadingAction === `verify-${item.id}`} isFlagging={loadingAction === `flag-${item.id}`} />
            ))}
          </CardContent>
        </Card>
      )}

      {/* ── Offboarding Overview ── */}
      {overviewCases.length > 0 && (
        <Card>
          <CardHeader><CardTitle>Offboarding Overview</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {overviewCases.map(c => (
              <OverviewCaseRow key={c.id} c={c} isSelected={selectedCaseId === c.id} onSelect={setSelectedCaseId} />
            ))}
          </CardContent>
        </Card>
      )}

      {/* ── Clearance Certificate ── */}
      {showProgress && selectedCase && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="size-5 text-blue-500" /> Clearance Certificate
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {!selectedCase.clearanceGenerated && !canGenerateClearance && (
              <div className="bg-yellow-50 border border-yellow-100 rounded-md px-4 py-3 text-sm text-yellow-700">
                Verify all checklist items and release final pay to generate clearance.
              </div>
            )}
            {selectedCase.clearanceGenerated && (
              <div className="bg-green-50 border border-green-100 rounded-md px-4 py-3 text-sm text-green-700">
                All requirements met. Clearance certificate has been generated.
              </div>
            )}
            <div className="border rounded-md px-4 py-4 text-sm text-slate-600 text-center leading-relaxed">
              This is to certify that <strong>{selectedCase.employeeName}</strong>,{" "}
              {selectedCase.position} from the {selectedCase.department} department, has completed
              all offboarding requirements and returned all company property. All financial obligations have been settled.
            </div>
            {!selectedCase.clearanceGenerated && (
              <Button onClick={() => setShowClearanceModal(true)} disabled={!canGenerateClearance} className="w-full bg-slate-700 hover:bg-slate-600 text-white disabled:opacity-50 disabled:cursor-not-allowed">
                <Shield className="size-4 mr-2" /> Generate Clearance
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Account Management ── */}
      {isCompleted && selectedCase && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UserMinus className="size-4 text-orange-500" /> Account Management
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className={`flex items-center justify-between border rounded-md px-4 py-3 ${getAccountStatusBg(selectedCase.accountStatus)}`}>
              <div>
                <p className="text-sm font-semibold">Account Status</p>
                <p className="text-xs text-slate-500 mt-0.5">{getAccountStatusDesc(selectedCase.accountStatus)}</p>
              </div>
              <Badge className={getAccountStatusBadgeCls(selectedCase.accountStatus)}>{getAccountStatusLabel(selectedCase.accountStatus)}</Badge>
            </div>
            {selectedCase.accountStatus === "active" && (
              <Button onClick={() => handleSetAccountStatus("deactivated")} disabled={loadingAction === "deactivate"} className="w-full bg-red-600 hover:bg-red-700 text-white">
                {loadingAction === "deactivate" ? <Loader2 className="size-4 animate-spin mr-2" /> : <UserMinus className="size-4 mr-2" />}
                Deactivate Account
              </Button>
            )}
            {selectedCase.accountStatus === "deactivated" && (
              <Button onClick={() => handleSetAccountStatus("archived")} disabled={loadingAction === "archive"} className="w-full bg-slate-400 hover:bg-slate-500 text-white">
                {loadingAction === "archive" ? <Loader2 className="size-4 animate-spin mr-2" /> : <Archive className="size-4 mr-2" />}
                Archive Account
              </Button>
            )}
            <div className="bg-blue-50 border border-blue-100 rounded-md px-3 py-2.5 text-xs text-blue-600">
              Note: Deactivation disables access. Archiving preserves data for compliance while marking the account as inactive. Data is never deleted.
            </div>
          </CardContent>
        </Card>
      )}

    </div>
  );
}
