"use client";

import { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import {
  CheckCircle, Clock, AlertTriangle, Upload, FileText, Shield, Download, Loader2, X,
} from "lucide-react";
import {
  getOffboardingCase,
  setOffboardingCase,
  type OffboardingCase,
  type ChecklistItem,
} from "@/data/offboardingStore";

// ── Constants ──────────────────────────────────────────────────────────────────

const RESIGNATION_REASONS = [
  "Career Growth",
  "Better Opportunity",
  "Personal Reasons",
  "Relocation",
  "Further Education",
  "Health Reasons",
  "Other",
];

type OffboardingStatus = OffboardingCase["status"];

// ── Helpers ───────────────────────────────────────────────────────────────────

function getStepLabelClass(active: boolean, done: boolean): string {
  if (active) return "font-semibold text-slate-800";
  if (done)   return "text-slate-500";
  return "text-slate-300";
}

function calcProgressPct(done: boolean, verified: number, total: number): number {
  if (done)       return 100;
  if (total > 0)  return (verified / total) * 100;
  return 0;
}

function getStatusStep(status: OffboardingStatus): number {
  if (status === "submitted")            return 1;
  if (status === "manager_acknowledged") return 2;
  if (status === "hr_accepted")          return 3;
  if (status === "completed")            return 4;
  return 0;
}

function getStatusMessage(status: OffboardingStatus): string | null {
  if (status === "submitted")
    return "Your resignation has been submitted and is awaiting manager acknowledgment.";
  if (status === "manager_acknowledged")
    return "Your resignation has been acknowledged by your manager and is currently being processed by HR.";
  if (status === "hr_accepted")
    return "Your resignation has been accepted by HR. Please complete the checklist items below.";
  if (status === "completed")
    return "Your offboarding process has been completed successfully.";
  return null;
}

function getStatusMessageColor(_status: OffboardingStatus): string {
  return "bg-green-50 border border-green-100 text-green-700";
}

function getChecklistBadge(item: ChecklistItem): { label: string; cls: string } {
  if (item.status === "verified")
    return { label: "Verified",  cls: "bg-green-100 text-green-700 border border-green-200" };
  if (item.status === "disputed")
    return { label: "Disputed",  cls: "bg-red-100 text-red-700 border border-red-200" };
  if (item.proofUploaded)
    return { label: "Submitted", cls: "bg-blue-50 text-blue-600 border border-blue-200" };
  return { label: "Pending",    cls: "bg-slate-100 text-slate-500 border border-slate-200" };
}

// ── Sub-components ─────────────────────────────────────────────────────────────

const STEPS = [
  { step: 1, label: "Submitted" },
  { step: 2, label: "Manager Acknowledged" },
  { step: 3, label: "HR Accepted" },
  { step: 4, label: "Completed" },
];

function StatusTimeline({ status }: { readonly status: OffboardingStatus }) {
  const current = getStatusStep(status);
  return (
    <div className="flex items-start">
      {STEPS.map(({ step, label }, idx) => {
        const done   = current >= step;
        const active = current === step;
        const isLast = idx === STEPS.length - 1;
        return (
          <div key={step} className="flex items-start flex-1 last:flex-none">
            <div className="flex flex-col items-center">
              <div className={`h-7 w-7 rounded-full flex items-center justify-center border-2 shrink-0 ${done ? "bg-slate-900 border-slate-900" : "bg-white border-slate-200"}`}>
                {done
                  ? <CheckCircle className="size-4 text-white" />
                  : <span className="text-xs text-slate-400">{step}</span>
                }
              </div>
              <p className={`text-xs mt-1.5 text-center w-24 leading-tight ${getStepLabelClass(active, done)}`}>
                {label}
              </p>
            </div>
            {!isLast && (
              <div className={`h-0.5 flex-1 mt-3.5 mx-1 ${current > step ? "bg-slate-900" : "bg-slate-200"}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

function ChecklistRow({
  item,
  canUpload,
  uploading,
  onUpload,
}: {
  readonly item: ChecklistItem;
  readonly canUpload: boolean;
  readonly uploading: boolean;
  readonly onUpload: (id: number, file: File) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const badge    = getChecklistBadge(item);

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) onUpload(item.id, file);
  }

  const showUpload = canUpload && !item.proofUploaded && item.status !== "verified";

  return (
    <div className="flex items-center justify-between border rounded-md px-4 py-3">
      <div className="flex items-center gap-3">
        {item.status === "verified" && <CheckCircle className="size-4 text-green-500 shrink-0" />}
        {item.status === "disputed" && <AlertTriangle className="size-4 text-red-500 shrink-0" />}
        {item.status !== "verified" && item.status !== "disputed" && <Clock className="size-4 text-slate-400 shrink-0" />}
        <div>
          <p className="text-sm font-medium">{item.label}</p>
          {item.proofUploaded && item.proofFileName && (
            <p className="text-xs text-slate-400 flex items-center gap-1 mt-0.5">
              <FileText className="size-3" /> {item.proofFileName}
            </p>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <Badge className={badge.cls}>{badge.label}</Badge>
        {showUpload && (
          <>
            <input ref={inputRef} type="file" className="hidden" onChange={handleFile} />
            <Button
              size="sm"
              disabled={uploading}
              onClick={() => inputRef.current?.click()}
              className="bg-slate-900 hover:bg-slate-800 text-white h-8 gap-1.5 text-xs px-3"
            >
              {uploading
                ? <Loader2 className="size-3.5 animate-spin" />
                : <Upload className="size-3.5" />
              }
              Upload Proof
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function EmployeeOffboardingPage() {
  const [data, setData]           = useState<OffboardingCase | null>(null);
  const [reason, setReason]       = useState("");
  const [lastDay, setLastDay]     = useState("");
  const [letter, setLetter]       = useState("");
  const [letterMode, setLetterMode] = useState<"type" | "upload">("type");
  const [letterFile, setLetterFile] = useState<File | null>(null);
  const [editing, setEditing]     = useState(false);
  const [editLetter, setEditLetter]   = useState("");
  const [editLastDay, setEditLastDay] = useState("");
  const [editReason, setEditReason]   = useState("");
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = () => setData(getOffboardingCase());
    load();
    globalThis.addEventListener("offboarding-updated", load);
    globalThis.addEventListener("storage", load);
    return () => {
      globalThis.removeEventListener("offboarding-updated", load);
      globalThis.removeEventListener("storage", load);
    };
  }, []);

  if (!data) return null;

  const isNotSubmitted = data.status === "not_submitted";
  const isRejected     = data.status === "rejected";
  const isSubmitted    = !isNotSubmitted && !isRejected;
  const isHrAccepted   = data.status === "hr_accepted";
  const isCompleted    = data.status === "completed";

  const verifiedCount = data.checklistItems.filter(i => i.status === "verified").length;
  const totalItems    = data.checklistItems.length;
  const progressPct   = calcProgressPct(isCompleted, verifiedCount, totalItems);

  const salary      = Number.parseFloat(data.salaryBalance ?? "0") || 0;
  const deductAmt   = Number.parseFloat(data.deductions    ?? "0") || 0;
  const addAmt      = Number.parseFloat(data.additionalPay ?? "0") || 0;
  const totalAmount = Math.max(0, salary - deductAmt + addAmt);

  const formValid = reason && lastDay;
  const statusMsg = getStatusMessage(data.status);

  async function handleSubmit() {
    if (!formValid) return;
    setLoadingAction("submit");
    setError(null);
    try {
      const today = new Date().toISOString().split("T")[0];
      setOffboardingCase({
        ...data!,
        offboardingType:   "Resignation",
        reason,
        lastWorkingDay:    lastDay,
        resignationLetter: letter,
        submittedDate:     today,
        status:            "submitted",
      });
    } catch {
      setError("Failed to submit resignation. Please try again.");
    } finally {
      setLoadingAction(null);
    }
  }

  async function handleUpload(id: number, file: File) {
    setLoadingAction(`upload-${id}`);
    setError(null);
    try {
      const today = new Date().toISOString().split("T")[0];
      setOffboardingCase({
        ...data!,
        checklistItems: data!.checklistItems.map(i =>
          i.id === id
            ? { ...i, proofUploaded: true, proofFileName: file.name, proofDate: today, status: "pending_review" }
            : i
        ),
      });
    } catch {
      setError("Failed to upload proof. Please try again.");
    } finally {
      setLoadingAction(null);
    }
  }

  function handleEditStart() {
    setEditLetter(data!.resignationLetter);
    setEditLastDay(data!.lastWorkingDay);
    setEditReason(data!.reason);
    setEditing(true);
  }

  async function handleEditSave() {
    setLoadingAction("save");
    setError(null);
    try {
      setOffboardingCase({
        ...data!,
        resignationLetter: editLetter,
        lastWorkingDay:    editLastDay,
        reason:            editReason,
      });
      setEditing(false);
    } catch {
      setError("Failed to save changes. Please try again.");
    } finally {
      setLoadingAction(null);
    }
  }

  return (
    <div className="p-6 space-y-6">

      {/* ── Error Banner ── */}
      {error && (
        <div className="flex items-center justify-between bg-red-50 border border-red-200 rounded-md px-4 py-3 text-sm text-red-700">
          <span>{error}</span>
          <button type="button" onClick={() => setError(null)} className="ml-4 text-red-400 hover:text-red-600">
            <X className="size-4" />
          </button>
        </div>
      )}

      {/* ── Rejection Notice ── */}
      {isRejected && (
        <Card className="border-red-200">
          <CardContent className="pt-5 pb-4 flex items-start gap-3">
            <AlertTriangle className="size-5 text-red-500 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-red-700">Offboarding Request Rejected</p>
              <p className="text-sm text-red-600 mt-1">
                Your offboarding request has been rejected. Please contact HR or your manager for more information.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Submission Form ── */}
      {isNotSubmitted && (
        <Card>
          <CardHeader>
            <CardTitle>Resignation Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Type Manually / Upload File toggle */}
            <div className="flex">
              <button
                type="button"
                onClick={() => setLetterMode("type")}
                className={`flex items-center gap-1.5 px-4 py-2 text-sm rounded-l-md border ${letterMode === "type" ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"}`}
              >
                <FileText className="size-4" /> Type Manually
              </button>
              <button
                type="button"
                onClick={() => setLetterMode("upload")}
                className={`flex items-center gap-1.5 px-4 py-2 text-sm rounded-r-md border-t border-r border-b ${letterMode === "upload" ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"}`}
              >
                <Upload className="size-4" /> Upload File
              </button>
            </div>
            {letterMode === "type" ? (
              <div className="space-y-2">
                <Label>Resignation Letter</Label>
                <Textarea
                  placeholder="Write your resignation letter here..."
                  value={letter}
                  onChange={e => setLetter(e.target.value)}
                  className="min-h-36 bg-slate-50 resize-none"
                />
              </div>
            ) : (
              <div className="space-y-1.5">
                <Label>Upload Resignation Letter</Label>
                <label className="flex items-center justify-center gap-2 border border-dashed rounded-md py-5 cursor-pointer hover:bg-slate-50 bg-slate-50">
                  <input type="file" accept=".pdf,.doc,.docx" className="hidden" onChange={e => setLetterFile(e.target.files?.[0] ?? null)} />
                  <Upload className="size-4 text-slate-400" />
                  <span className="text-sm text-slate-500">Click to upload or drag and drop</span>
                </label>
                {letterFile && (
                  <div className="flex items-center justify-between border rounded-md px-3 py-2.5 bg-white">
                    <div className="flex items-center gap-2 min-w-0">
                      <FileText className="size-4 text-slate-500 shrink-0" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{letterFile.name}</p>
                        <p className="text-xs text-slate-400">{(letterFile.size / 1024).toFixed(2)} KB</p>
                      </div>
                    </div>
                    <button type="button" onClick={() => setLetterFile(null)} className="ml-3 text-slate-400 hover:text-slate-600 shrink-0">
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
                <Input type="date" value={lastDay} onChange={e => setLastDay(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Reason for Leaving</Label>
                <select
                  value={reason}
                  onChange={e => setReason(e.target.value)}
                  className="w-full border border-input rounded-md px-3 py-2 text-sm bg-background h-10"
                >
                  <option value="">Select a reason</option>
                  {RESIGNATION_REASONS.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
            </div>
            <Button
              onClick={handleSubmit}
              disabled={!formValid || loadingAction === "submit"}
              className="w-full bg-slate-900 hover:bg-slate-800 text-white disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loadingAction === "submit"
                ? <Loader2 className="size-4 animate-spin mr-2" />
                : null
              }
              Submit Resignation
            </Button>
          </CardContent>
        </Card>
      )}

      {/* ── Resignation Status ── */}
      {isSubmitted && (
        <Card>
          <CardHeader>
            <CardTitle>Resignation Status</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <StatusTimeline status={data.status} />
            {statusMsg && (
              <p className={`text-sm rounded-md px-4 py-3 ${getStatusMessageColor(data.status)}`}>
                {statusMsg}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Offboarding Progress ── */}
      {isSubmitted && (
        <Card>
          <CardHeader>
            <CardTitle>Offboarding Progress</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex items-center justify-between text-sm text-slate-500">
              <span>Overall Completion</span>
              <span>{verifiedCount} of {totalItems} items</span>
            </div>
            <Progress value={progressPct} className="[&>div]:bg-slate-900" />
          </CardContent>
        </Card>
      )}

      {/* ── Offboarding Checklist ── */}
      {isSubmitted && (
        <Card>
          <CardHeader>
            <CardTitle>Offboarding Checklist</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {data.checklistItems.map(item => (
              <ChecklistRow
                key={item.id}
                item={item}
                canUpload={isHrAccepted}
                uploading={loadingAction === `upload-${item.id}`}
                onUpload={handleUpload}
              />
            ))}
          </CardContent>
        </Card>
      )}

      {/* ── Resignation Details (view/edit after submission) ── */}
      {isSubmitted && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Resignation Details</CardTitle>
            {!isCompleted && !isHrAccepted && (
              editing ? (
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => setEditing(false)}>Cancel</Button>
                  <Button size="sm" disabled={loadingAction === "save"} onClick={handleEditSave} className="bg-slate-900 hover:bg-slate-800 text-white">
                    {loadingAction === "save" ? <Loader2 className="size-3.5 animate-spin mr-1" /> : null}
                    Save
                  </Button>
                </div>
              ) : (
                <Button size="sm" variant="ghost" onClick={handleEditStart} className="text-slate-500 hover:text-slate-800">
                  Edit
                </Button>
              )
            )}
            {isHrAccepted && (
              <span className="text-xs text-slate-400">Locked — HR is processing</span>
            )}
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label className="text-xs text-slate-500">Resignation Letter</Label>
              {editing ? (
                <Textarea
                  value={editLetter}
                  onChange={e => setEditLetter(e.target.value)}
                  className="min-h-28 bg-slate-50 resize-none"
                />
              ) : (
                <div className="border rounded-md px-3 py-2.5 bg-slate-50 text-sm text-slate-700 min-h-16 whitespace-pre-wrap">
                  {data.resignationLetter || <span className="text-slate-400">No resignation letter provided</span>}
                </div>
              )}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-xs text-slate-500">Last Working Day</Label>
                {editing ? (
                  <Input type="date" value={editLastDay} onChange={e => setEditLastDay(e.target.value)} />
                ) : (
                  <div className="flex items-center gap-2 border rounded-md px-3 py-2.5 text-sm">
                    <Clock className="size-4 text-slate-400 shrink-0" />
                    {data.lastWorkingDay}
                  </div>
                )}
              </div>
              <div className="space-y-2">
                <Label className="text-xs text-slate-500">Reason for Leaving</Label>
                {editing ? (
                  <select
                    value={editReason}
                    onChange={e => setEditReason(e.target.value)}
                    className="w-full border border-input rounded-md px-3 py-2 text-sm bg-background h-10"
                  >
                    <option value="">Select a reason</option>
                    {RESIGNATION_REASONS.map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                ) : (
                  <div className="flex items-center gap-2 border rounded-md px-3 py-2.5 text-sm">
                    <FileText className="size-4 text-slate-400 shrink-0" />
                    {data.reason}
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Final Pay (read-only, shown when payment released or completed) ── */}
      {isSubmitted && data.paymentReleased && (
        <Card>
          <CardHeader>
            <CardTitle>Final Pay</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="border rounded-md px-3 py-2.5">
                <p className="text-xs text-slate-500 mb-0.5">Salary Balance</p>
                <p className="text-sm font-medium">
                  ${salary.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                </p>
              </div>
              <div className="border rounded-md px-3 py-2.5">
                <p className="text-xs text-slate-500 mb-0.5">Deductions</p>
                <p className="text-sm font-medium text-red-600">
                  -${deductAmt.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                </p>
              </div>
              <div className="border rounded-md px-3 py-2.5">
                <p className="text-xs text-slate-500 mb-0.5">Additional Pay</p>
                <p className="text-sm font-medium text-green-600">
                  +${addAmt.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                </p>
              </div>
              <div className="border rounded-md px-3 py-2.5 bg-slate-50">
                <p className="text-xs text-slate-500 mb-0.5">Total Amount</p>
                <p className="text-sm font-medium">
                  ${totalAmount.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                </p>
              </div>
            </div>
            <div className="flex items-center justify-between border rounded-md px-4 py-3 bg-green-50 border-green-100">
              <div>
                <p className="text-sm font-medium text-slate-700">Payment Status</p>
                <p className="text-xs text-slate-500 mt-0.5">Your final payment has been processed and released</p>
              </div>
              <Badge className="bg-green-100 text-green-700 border border-green-200">Released</Badge>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Clearance Certificate (shown when generated) ── */}
      {isSubmitted && data.clearanceGenerated && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div className="flex items-center gap-2">
              <Shield className="size-5 text-green-600" />
              <div>
                <CardTitle>Clearance Certificate</CardTitle>
                {data.clearanceDate && (
                  <p className="text-xs text-slate-400 mt-0.5">Generated on {data.clearanceDate}</p>
                )}
              </div>
            </div>
            <Button size="sm" className="bg-slate-900 hover:bg-slate-800 text-white gap-1.5">
              <Download className="size-4" /> Download
            </Button>
          </CardHeader>
          <CardContent>
            <div className="border rounded-md px-4 py-6 text-center space-y-3">
              <Shield className="size-10 text-green-500 mx-auto" />
              <p className="font-bold text-sm tracking-widest">CLEARANCE CERTIFICATE</p>
              <hr />
              <p className="text-sm text-slate-600 leading-relaxed">
                This is to certify that <strong>{data.employeeName}</strong>,{" "}
                {data.position} from the {data.department} department, has completed all offboarding
                requirements and returned all company property. All financial obligations have been settled.
              </p>
              {data.clearanceDate && (
                <p className="text-sm text-blue-600">
                  This certificate is issued on <strong>{data.clearanceDate}</strong> as proof of
                  successful completion of the offboarding process.
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Account Status (read-only, shown when completed) ── */}
      {isCompleted && (
        <Card>
          <CardHeader>
            <CardTitle>Account Status</CardTitle>
          </CardHeader>
          <CardContent>
            {data.accountStatus === "active" && (
              <div className="flex items-center justify-between border rounded-md px-4 py-3 bg-green-50 border-green-100">
                <div>
                  <p className="text-sm font-medium">Account Active</p>
                  <p className="text-xs text-slate-500 mt-0.5">Your account is still active</p>
                </div>
                <Badge className="bg-green-100 text-green-700 border border-green-200">Active</Badge>
              </div>
            )}
            {data.accountStatus === "deactivated" && (
              <div className="flex items-center justify-between border rounded-md px-4 py-3 bg-yellow-50 border-yellow-100">
                <div>
                  <p className="text-sm font-medium">Account Deactivated</p>
                  <p className="text-xs text-slate-500 mt-0.5">Access has been disabled</p>
                </div>
                <Badge className="bg-yellow-100 text-yellow-700 border border-yellow-200">Deactivated</Badge>
              </div>
            )}
            {data.accountStatus === "archived" && (
              <div className="flex items-center justify-between border rounded-md px-4 py-3 bg-slate-50 border-slate-200">
                <div>
                  <p className="text-sm font-medium">Account Archived</p>
                  <p className="text-xs text-slate-500 mt-0.5">Your account has been archived for record-keeping</p>
                </div>
                <Badge className="bg-slate-100 text-slate-500 border border-slate-200">Archived</Badge>
              </div>
            )}
          </CardContent>
        </Card>
      )}

    </div>
  );
}
