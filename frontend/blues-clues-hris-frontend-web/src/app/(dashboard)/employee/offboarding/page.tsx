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
  getMyOffboardingCase,
  submitResignation,
  acknowledgeChecklistItem,
  type OffboardingCaseDetail,
  type ChecklistItem,
} from "@/lib/offboardingApi";
import { getUserInfo } from "@/lib/authStorage";

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

function getStatusStep(status: string): number {
  if (status === "Submitted")            return 1;
  if (status === "Manager_Acknowledged") return 2;
  if (status === "HR_Accepted")          return 3;
  if (status === "Completed")            return 4;
  return 0;
}

function getStatusMessage(status: string): string | null {
  if (status === "Submitted")
    return "Your resignation has been submitted and is awaiting manager acknowledgment.";
  if (status === "Manager_Acknowledged")
    return "Your resignation has been acknowledged by your manager and is currently being processed by HR.";
  if (status === "HR_Accepted")
    return "Your resignation has been accepted by HR. Please complete the checklist items below.";
  if (status === "Completed")
    return "Your offboarding process has been completed successfully.";
  return null;
}

function getChecklistBadge(item: ChecklistItem): { label: string; cls: string } {
  if (item.status === "Verified")
    return { label: "Verified",  cls: "bg-green-100 text-green-700 border border-green-200" };
  if (item.status === "Disputed")
    return { label: "Disputed",  cls: "bg-red-100 text-red-700 border border-red-200" };
  if (item.status === "Submitted")
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

function StatusTimeline({ status }: { readonly status: string }) {
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
  readonly onUpload: (id: string, file: File) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const badge    = getChecklistBadge(item);
  const isActioned = item.status === "Submitted" || item.status === "Verified" || item.status === "Disputed";
  const showUpload = canUpload && !isActioned;

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) onUpload(item.item_id, file);
  }

  return (
    <div className="flex items-center justify-between border rounded-md px-4 py-3">
      <div className="flex items-center gap-3">
        {item.status === "Verified"  && <CheckCircle className="size-4 text-green-500 shrink-0" />}
        {item.status === "Disputed"  && <AlertTriangle className="size-4 text-red-500 shrink-0" />}
        {item.status !== "Verified" && item.status !== "Disputed" && <Clock className="size-4 text-slate-400 shrink-0" />}
        <div>
          <p className="text-sm font-medium">{item.item_name}</p>
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
  const [data, setData]             = useState<OffboardingCaseDetail | null | undefined>(undefined);
  const [reason, setReason]         = useState("");
  const [lastDay, setLastDay]       = useState("");
  const [letter, setLetter]         = useState("");
  const [letterMode, setLetterMode] = useState<"type" | "upload">("type");
  const [letterFile, setLetterFile] = useState<File | null>(null);
  // REVISION: track uploaded document URL and name (now required)
  const [docUrl, setDocUrl]         = useState<string>("");
  const [docName, setDocName]       = useState<string>("");
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function fetchCase() {
    try {
      const result = await getMyOffboardingCase();
      setData(result);
    } catch {
      setData(null);
    }
  }

  useEffect(() => { fetchCase(); }, []);

  // Loading state
  if (data === undefined) {
    return (
      <div className="p-6 flex items-center justify-center min-h-64">
        <Loader2 className="size-6 animate-spin text-slate-400" />
      </div>
    );
  }

  const isNotSubmitted = data === null;
  const isRejected     = data?.status === "Rejected";
  const isSubmitted    = !isNotSubmitted && !isRejected;
  const isHrAccepted   = data?.status === "HR_Accepted";
  const isCompleted    = data?.status === "Completed";

  const checklistItems  = data?.checklist_items ?? [];
  const verifiedCount   = checklistItems.filter(i => i.status === "Verified").length;
  const totalItems      = checklistItems.length;
  const progressPct     = calcProgressPct(!!isCompleted, verifiedCount, totalItems);

  const finalPay: OffboardingCaseDetail["final_pay"] | null = data?.final_pay ?? null;
  const settlementPayslip = finalPay ? (finalPay as NonNullable<OffboardingCaseDetail["final_pay"]>).settlement_payslip ?? null : null;
  const payrollReference = finalPay ? (finalPay as NonNullable<OffboardingCaseDetail["final_pay"]>).payroll_reference ?? null : null;
  const salary      = Number(finalPay?.salary_balance  ?? 0);
  const leaveAmt    = Number(finalPay?.leave_encashment ?? 0);
  const deductAmt   = Number(finalPay?.deductions      ?? 0);
  const addAmt      = Number(finalPay?.additional_pay  ?? 0);
  const totalAmount = Number(finalPay?.total_amount    ?? Math.max(0, salary + leaveAmt - deductAmt + addAmt));

  const paymentReleased   = finalPay?.status === "Payment Released" || finalPay?.status === "Transfer Confirmed";
  const hasSettlementData = !!finalPay || !!settlementPayslip || !!payrollReference;
  const clearanceDoc      = data?.clearance_documents?.[0] ?? null;
  const clearanceGenerated = !!clearanceDoc;
  const clearanceDate     = clearanceDoc?.released_at
    ? new Date(clearanceDoc.released_at).toLocaleDateString()
    : null;

  // REVISION: document upload is now required (docUrl must be set)
  const formValid = reason && lastDay && docUrl;
  const statusMsg = data ? getStatusMessage(data.status) : null;

  async function handleSubmit() {
    if (!formValid) return;
    setLoadingAction("submit");
    setError(null);
    try {
      const userInfo = getUserInfo();
      if (!userInfo?.user_id) throw new Error("Could not determine your user ID. Please re-login.");
      await submitResignation({
        employee_id: userInfo.user_id,
        reason,
        last_working_day: lastDay,
        resignation_letter: letter || null,
        // REVISION: now required fields
        document_url: docUrl,
        document_name: docName,
      });
      await fetchCase();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit resignation. Please try again.");
    } finally {
      setLoadingAction(null);
    }
  }

  async function handleUpload(itemId: string, _file: File) {
    if (!data) return;
    setLoadingAction(`upload-${itemId}`);
    setError(null);
    try {
      await acknowledgeChecklistItem(data.case_id, itemId);
      await fetchCase();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to upload proof. Please try again.");
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
              {data?.rejection_reason && (
                <p className="text-sm text-red-600 mt-1">Reason: {data.rejection_reason}</p>
              )}
              <p className="text-sm text-red-600 mt-1">
                Please contact HR or your manager for more information.
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

            {/* REVISION: Required resignation document upload */}
            <div className="space-y-2">
              <Label className="flex items-center gap-1">
                Supporting Document <span className="text-red-500 ml-0.5">*</span>
                <span className="text-xs text-slate-400 font-normal ml-1">(signed resignation doc — PDF, DOC, DOCX)</span>
              </Label>
              {docUrl ? (
                <div className="flex items-center gap-3 p-3 rounded-md border border-green-200 bg-green-50">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-green-800 truncate">{docName}</p>
                    <p className="text-xs text-green-600">Document uploaded ✓</p>
                  </div>
                  <button type="button" onClick={() => { setDocUrl(""); setDocName(""); }}
                    className="text-slate-400 hover:text-red-500 shrink-0 text-xs underline">
                    Remove
                  </button>
                </div>
              ) : (
                <label className="flex flex-col items-center justify-center w-full h-24 border-2 border-dashed border-slate-200 rounded-md cursor-pointer hover:border-slate-400 hover:bg-slate-50 transition-colors">
                  <span className="text-sm text-slate-500">Click to upload your resignation document</span>
                  <span className="text-xs text-slate-400 mt-1">PDF, DOC, DOCX — required</span>
                  <input type="file" accept=".pdf,.doc,.docx" className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      // TODO: replace with actual storage upload that returns a persisted URL
                      setDocUrl(URL.createObjectURL(file));
                      setDocName(file.name);
                    }}
                  />
                </label>
              )}
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
      {isSubmitted && data && (
        <Card>
          <CardHeader>
            <CardTitle>Resignation Status</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <StatusTimeline status={data.status} />
            {statusMsg && (
              <p className="text-sm rounded-md px-4 py-3 bg-green-50 border border-green-100 text-green-700">
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
      {isSubmitted && checklistItems.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Offboarding Checklist</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {checklistItems.map(item => (
              <ChecklistRow
                key={item.item_id}
                item={item}
                canUpload={!!isHrAccepted}
                uploading={loadingAction === `upload-${item.item_id}`}
                onUpload={handleUpload}
              />
            ))}
          </CardContent>
        </Card>
      )}

      {/* ── Resignation Details (view after submission) ── */}
      {isSubmitted && data && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Resignation Details</CardTitle>
            {isHrAccepted && (
              <span className="text-xs text-slate-400">Locked — HR is processing</span>
            )}
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label className="text-xs text-slate-500">Resignation Letter</Label>
              <div className="border rounded-md px-3 py-2.5 bg-slate-50 text-sm text-slate-700 min-h-16 whitespace-pre-wrap">
                {data.resignation_details?.resignation_letter || <span className="text-slate-400">No resignation letter provided</span>}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-xs text-slate-500">Last Working Day</Label>
                <div className="flex items-center gap-2 border rounded-md px-3 py-2.5 text-sm">
                  <Clock className="size-4 text-slate-400 shrink-0" />
                  {data.last_working_day}
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-xs text-slate-500">Reason for Leaving</Label>
                <div className="flex items-center gap-2 border rounded-md px-3 py-2.5 text-sm">
                  <FileText className="size-4 text-slate-400 shrink-0" />
                  {data.resignation_details?.reason ?? data.termination_details?.reason ?? "—"}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Final Pay ── */}
      {isSubmitted && hasSettlementData && (
        <Card>
          <CardHeader>
            <CardTitle>Final Pay & Settlement</CardTitle>
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
                <p className="text-xs text-slate-500 mb-0.5">Leave Encashment</p>
                <p className="text-sm font-medium text-green-600">
                  +${leaveAmt.toLocaleString("en-US", { minimumFractionDigits: 2 })}
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
                <p className="text-xs text-slate-500 mt-0.5">
                  {paymentReleased
                    ? "Your final payment has been processed and released"
                    : "Your final settlement is connected to payroll and pending HR release"}
                </p>
              </div>
              <Badge className={paymentReleased ? "bg-green-100 text-green-700 border border-green-200" : "bg-amber-100 text-amber-700 border border-amber-200"}>
                {finalPay?.status ?? "Connected"}
              </Badge>
            </div>
            {settlementPayslip && (
              <div className="rounded-md border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-900 space-y-1">
                <p className="font-medium">Connected Final Settlement Slip</p>
                <p className="text-xs text-blue-800">Slip ID: {settlementPayslip.payslip_id}</p>
                {settlementPayslip.period?.payout_date && (
                  <p className="text-xs text-blue-800">
                    Payout Date: {new Date(settlementPayslip.period.payout_date).toLocaleDateString()}
                  </p>
                )}
                <p className="text-xs text-blue-800">
                  Net Pay: ${Number(settlementPayslip.net_pay).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </p>
              </div>
            )}
            {payrollReference && (
              <div className="rounded-md border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 space-y-1">
                <p className="font-medium">Latest Payroll Reference</p>
                <p className="text-xs">Slip ID: {payrollReference.payslip_id}</p>
                {payrollReference.period?.cutoff_start_date && payrollReference.period?.cutoff_end_date && (
                  <p className="text-xs">
                    Coverage: {new Date(payrollReference.period.cutoff_start_date).toLocaleDateString()} to{" "}
                    {new Date(payrollReference.period.cutoff_end_date).toLocaleDateString()}
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Clearance Certificate ── */}
      {isSubmitted && clearanceGenerated && data && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div className="flex items-center gap-2">
              <Shield className="size-5 text-green-600" />
              <div>
                <CardTitle>Clearance Certificate</CardTitle>
                {clearanceDate && (
                  <p className="text-xs text-slate-400 mt-0.5">Generated on {clearanceDate}</p>
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
                This is to certify that <strong>{data.employee_name}</strong> has completed all
                offboarding requirements and returned all company property. All financial obligations
                have been settled.
              </p>
              {clearanceDate && (
                <p className="text-sm text-blue-600">
                  This certificate is issued on <strong>{clearanceDate}</strong> as proof of
                  successful completion of the offboarding process.
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

    </div>
  );
}
