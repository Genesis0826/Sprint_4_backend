"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { UserMinus, Plus, X, CheckCircle, Clock, FileText, Search, Loader2, Upload } from "lucide-react";
import {
  getOffboardingCases,
  addNewOffboardingCase,
  updateOffboardingCaseById,
  type OffboardingCase,
} from "@/data/offboardingStore";

// ── Constants ─────────────────────────────────────────────────────────────────

const OFFBOARDING_TYPES = ["Termination", "End of Contract"];

const REASONS: Record<string, string[]> = {
  Termination:       ["Performance Issues", "Policy Violation", "Redundancy", "Restructuring", "Other"],
  "End of Contract": ["Contract Expired", "Project Completed", "Fixed-Term End", "Other"],
};

type InitiateForm = {
  employeeName: string;
  department: string;
  position: string;
  details: string;
  lastWorkingDay: string;
  reason: string;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function getNotificationBadge(status: OffboardingCase["status"]): { label: string; cls: string } {
  if (status === "submitted")            return { label: "Review Required", cls: "bg-yellow-100 text-yellow-700 border border-yellow-200" };
  if (status === "manager_acknowledged") return { label: "Acknowledged",    cls: "bg-green-100 text-green-700 border border-green-200" };
  if (status === "hr_accepted")          return { label: "HR In Progress",  cls: "bg-blue-100 text-blue-700 border border-blue-200" };
  if (status === "completed")            return { label: "Completed",       cls: "bg-green-100 text-green-700 border border-green-200" };
  return { label: "Rejected", cls: "bg-red-100 text-red-700 border border-red-200" };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function filterCases(
  cases: OffboardingCase[],
  search: string,
  statusFilter: string
): OffboardingCase[] {
  return cases.filter(c => {
    const matchesSearch =
      search.trim() === "" ||
      c.employeeName.toLowerCase().includes(search.toLowerCase()) ||
      c.department.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === "all" || c.status === statusFilter;
    return matchesSearch && matchesStatus;
  });
}

function isFormValid(form: InitiateForm): boolean {
  return !!(form.employeeName.trim() && form.department.trim() && form.position.trim() && form.lastWorkingDay && form.reason);
}

function isCaseActionable(c: OffboardingCase | null): boolean {
  return c !== null && c.status !== "not_submitted" && c.status !== "rejected";
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function ManagerOffboardingPage() {
  const [cases, setCases] = useState<OffboardingCase[]>([]);
  const [showInitiateForm, setShowInitiateForm] = useState(false);
  const [offboardingType, setOffboardingType] = useState("Termination");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [transferNotes, setTransferNotes] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [detailsMode, setDetailsMode] = useState<"type" | "upload">("type");
  const [detailsFile, setDetailsFile] = useState<File | null>(null);
  const [form, setForm] = useState<InitiateForm>({
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

  // Sync transfer notes when selected case changes
  useEffect(() => {
    const c = cases.find(x => x.id === selectedId);
    if (c) setTransferNotes(c.transferNotes);
  }, [selectedId, cases]);

  const visibleCases  = cases.filter(c => c.status !== "not_submitted" && c.status !== "rejected");
  const filteredCases = filterCases(visibleCases, search, statusFilter);
  const selectedCase = cases.find(c => c.id === selectedId) ?? null;
  const hasPendingReview = selectedCase?.status === "submitted";
  const isActionable    = isCaseActionable(selectedCase);
  const canAcknowledge  = selectedCase?.status === "submitted";
  const initiateLabel   = offboardingType === "End of Contract" ? "Initiate End of Contract" : "Initiate Termination";
  const formValid       = isFormValid(form);

  async function handleInitiate() {
    if (!formValid) return;
    setLoadingAction("initiate");
    setError(null);
    try {
      const today = new Date().toISOString().split("T")[0];
      const created = addNewOffboardingCase({
        employeeName:    form.employeeName,
        department:      form.department,
        position:        form.position,
        offboardingType: offboardingType,
        lastWorkingDay:  form.lastWorkingDay,
        reason:          form.reason,
        resignationLetter: form.details,
        submittedDate:   today,
        initiatedBy:     "Manager",
        status:          "submitted",
      });
      setSelectedId(created.id);
      setShowInitiateForm(false);
      setForm({ employeeName: "", department: "", position: "", details: "", lastWorkingDay: "", reason: "" });
      setDetailsMode("type");
      setDetailsFile(null);
    } catch {
      setError("Failed to initiate offboarding. Please try again.");
    } finally {
      setLoadingAction(null);
    }
  }

  async function handleAcknowledge() {
    if (!selectedCase) return;
    setLoadingAction("acknowledge");
    setError(null);
    try {
      updateOffboardingCaseById(selectedCase.id, { status: "manager_acknowledged" });
    } catch {
      setError("Failed to acknowledge case. Please try again.");
    } finally {
      setLoadingAction(null);
    }
  }

  async function handleSignOff() {
    if (!selectedCase) return;
    setLoadingAction("signoff");
    setError(null);
    try {
      updateOffboardingCaseById(selectedCase.id, { transferNotes });
    } catch {
      setError("Failed to save transfer notes. Please try again.");
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

      {/* Page header */}
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

      {/* ── Initiate Form ── */}
      {showInitiateForm && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UserMinus className="size-5" /> Initiate Offboarding for Team Member
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Offboarding Type</Label>
              <select
                value={offboardingType}
                onChange={e => { setOffboardingType(e.target.value); setForm(f => ({ ...f, reason: "" })); }}
                className="w-full border border-input rounded-md px-3 py-2 text-sm bg-background h-10"
              >
                {OFFBOARDING_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Employee Name</Label>
                <Input placeholder="John Doe" value={form.employeeName} onChange={e => setForm(f => ({ ...f, employeeName: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Department</Label>
                <Input placeholder="Engineering" value={form.department} onChange={e => setForm(f => ({ ...f, department: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Position</Label>
              <Input placeholder="Software Engineer" value={form.position} onChange={e => setForm(f => ({ ...f, position: e.target.value }))} />
            </div>
            {/* Type Manually / Upload File toggle */}
            <div className="flex">
              <button
                type="button"
                onClick={() => setDetailsMode("type")}
                className={`flex items-center gap-1.5 px-4 py-2 text-sm rounded-l-md border ${detailsMode === "type" ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"}`}
              >
                <FileText className="size-4" /> Type Manually
              </button>
              <button
                type="button"
                onClick={() => setDetailsMode("upload")}
                className={`flex items-center gap-1.5 px-4 py-2 text-sm rounded-r-md border-t border-r border-b ${detailsMode === "upload" ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"}`}
              >
                <Upload className="size-4" /> Upload File
              </button>
            </div>
            {detailsMode === "type" ? (
              <div className="space-y-2">
                <Label>{offboardingType === "End of Contract" ? "Contract Completion Details" : "Termination Details"}</Label>
                <Textarea
                  placeholder={offboardingType === "End of Contract" ? "Enter contract completion details..." : "Enter termination details..."}
                  value={form.details}
                  onChange={e => setForm(f => ({ ...f, details: e.target.value }))}
                  className="min-h-28 bg-slate-50 resize-none"
                />
              </div>
            ) : (
              <div className="space-y-1.5">
                <Label>Upload Document</Label>
                <label className="flex items-center justify-center gap-2 border border-dashed rounded-md py-5 cursor-pointer hover:bg-slate-50 bg-slate-50">
                  <input type="file" accept=".pdf,.doc,.docx" className="hidden" onChange={e => setDetailsFile(e.target.files?.[0] ?? null)} />
                  <Upload className="size-4 text-slate-400" />
                  <span className="text-sm text-slate-500">Click to upload or drag and drop</span>
                </label>
                {detailsFile && (
                  <div className="flex items-center justify-between border rounded-md px-3 py-2.5 bg-white">
                    <div className="flex items-center gap-2 min-w-0">
                      <FileText className="size-4 text-slate-500 shrink-0" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{detailsFile.name}</p>
                        <p className="text-xs text-slate-400">{(detailsFile.size / 1024).toFixed(2)} KB</p>
                      </div>
                    </div>
                    <button type="button" onClick={() => setDetailsFile(null)} className="ml-3 text-slate-400 hover:text-slate-600 shrink-0">
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
                <Input type="date" value={form.lastWorkingDay} onChange={e => setForm(f => ({ ...f, lastWorkingDay: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Reason</Label>
                <select
                  value={form.reason}
                  onChange={e => setForm(f => ({ ...f, reason: e.target.value }))}
                  className="w-full border border-input rounded-md px-3 py-2 text-sm bg-background h-10"
                >
                  <option value="">Select a reason</option>
                  {(REASONS[offboardingType] ?? []).map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
            </div>
            <Button
              onClick={handleInitiate}
              disabled={!formValid || loadingAction === "initiate"}
              className="w-full bg-rose-400 hover:bg-rose-500 text-white disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loadingAction === "initiate"
                ? <Loader2 className="size-4 animate-spin mr-2" />
                : <UserMinus className="size-4 mr-2" />
              }
              {initiateLabel}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* ── Empty state ── */}
      {!showInitiateForm && visibleCases.length === 0 && (
        <Card>
          <CardContent className="py-12 flex flex-col items-center justify-center text-center gap-2">
            <UserMinus className="size-10 text-slate-200" />
            <p className="text-sm font-medium text-slate-500">No offboarding cases yet</p>
            <p className="text-xs text-slate-400">Incoming resignations will appear here, or you can initiate one above.</p>
          </CardContent>
        </Card>
      )}

      {/* ── Offboarding Notifications ── */}
      {visibleCases.length > 0 && (
        <Card>
          <CardHeader><CardTitle>Offboarding Notifications</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {/* Search + Filter */}
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-slate-400" />
                <Input
                  placeholder="Search by name or department..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
              <select
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value)}
                className="border border-input rounded-md px-3 py-2 text-sm bg-background h-10 shrink-0"
              >
                <option value="all">All Statuses</option>
                <option value="submitted">Review Required</option>
                <option value="manager_acknowledged">Acknowledged</option>
                <option value="hr_accepted">HR In Progress</option>
                <option value="completed">Completed</option>
              </select>
            </div>
            {/* Results */}
            {filteredCases.length > 0 ? filteredCases.map(c => {
              const badge = getNotificationBadge(c.status);
              const isSelected = selectedId === c.id;
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setSelectedId(c.id)}
                  className={`w-full text-left flex items-center justify-between border rounded-md px-4 py-3 transition-colors hover:bg-slate-50 ${isSelected ? "border-slate-400 bg-slate-50" : ""}`}
                >
                  <div className="flex items-center gap-3">
                    <div className="h-9 w-9 bg-slate-100 rounded-full flex items-center justify-center shrink-0">
                      <UserMinus className="size-4 text-slate-400" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold">{c.employeeName}</p>
                      <p className="text-xs text-slate-500">{c.department} • Submitted {c.submittedDate}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge variant="outline" className="text-slate-500 bg-slate-100">{c.offboardingType}</Badge>
                    <Badge className={badge.cls}>{badge.label}</Badge>
                  </div>
                </button>
              );
            }) : (
              <p className="text-sm text-slate-400 text-center py-4">No cases match your search</p>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Offboarding Review ── */}
      {isActionable && selectedCase && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Offboarding Review</CardTitle>
            {hasPendingReview ? (
              <Badge className="bg-yellow-100 text-yellow-700 border border-yellow-200">Pending Review</Badge>
            ) : (
              <Badge className="bg-green-100 text-green-700 border border-green-200">Acknowledged</Badge>
            )}
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid grid-cols-2 gap-x-8 gap-y-4">
              <div>
                <p className="text-xs text-slate-500 mb-0.5">Employee Name</p>
                <p className="text-sm font-medium">{selectedCase.employeeName}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500 mb-0.5">Department</p>
                <p className="text-sm font-medium">{selectedCase.department}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500 mb-0.5">Position</p>
                <p className="text-sm font-medium">{selectedCase.position}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500 mb-0.5">Offboarding Type</p>
                <p className="text-sm font-medium">{selectedCase.offboardingType}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500 mb-0.5">Last Working Day</p>
                <p className="text-sm font-medium">{selectedCase.lastWorkingDay}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500 mb-0.5">Reason</p>
                <p className="text-sm font-medium">{selectedCase.reason}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500 mb-0.5">Submitted Date</p>
                <p className="text-sm font-medium">{selectedCase.submittedDate}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500 mb-0.5">Initiated By</p>
                <p className="text-sm font-medium">{selectedCase.initiatedBy}</p>
              </div>
            </div>
            {selectedCase.initiatedBy === "Employee" && selectedCase.resignationLetter && (
              <div>
                <p className="text-xs text-slate-500 mb-2">Resignation Letter</p>
                <div className="border rounded-md px-4 py-3 flex items-start gap-2 text-sm text-slate-700">
                  <FileText className="size-4 text-slate-400 shrink-0 mt-0.5" />
                  <span className="whitespace-pre-wrap">{selectedCase.resignationLetter}</span>
                </div>
              </div>
            )}
            {selectedCase.offboardingType === "End of Contract" && selectedCase.resignationLetter && (
              <div>
                <p className="text-xs text-slate-500 mb-2">Contract Completion Details</p>
                <div className="border rounded-md px-4 py-3 flex items-start gap-2 text-sm text-slate-700">
                  <FileText className="size-4 text-slate-400 shrink-0 mt-0.5" />
                  <span className="whitespace-pre-wrap">{selectedCase.resignationLetter}</span>
                </div>
              </div>
            )}
            <Button
              onClick={handleAcknowledge}
              disabled={!canAcknowledge || loadingAction === "acknowledge"}
              className="w-full bg-slate-900 hover:bg-slate-800 text-white disabled:opacity-70 disabled:cursor-not-allowed"
            >
              {loadingAction === "acknowledge"
                ? <Loader2 className="size-4 animate-spin mr-2" />
                : <CheckCircle className="size-4 mr-2" />
              }
              {canAcknowledge ? "Acknowledge & Send to HR" : "Already Acknowledged"}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* ── Employee Checklist Progress ── */}
      {isActionable && selectedCase && (
        <Card>
          <CardHeader><CardTitle>Employee Checklist Progress</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {selectedCase.checklistItems.map(item => (
              <div key={item.id} className="flex items-center justify-between border rounded-md px-4 py-3">
                <div className="flex items-center gap-3">
                  {item.status === "verified"
                    ? <CheckCircle className="size-4 text-green-500" />
                    : <Clock className="size-4 text-slate-400" />
                  }
                  <span className="text-sm font-medium">{item.label}</span>
                </div>
                {item.status === "verified" ? (
                  <Badge className="bg-green-100 text-green-700 border border-green-200">Verified</Badge>
                ) : (
                  <Badge variant="outline" className="text-slate-500 bg-slate-100">Not Started</Badge>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* ── Knowledge Transfer Sign-Off ── */}
      {isActionable && selectedCase && (
        <Card>
          <CardHeader><CardTitle>Knowledge Transfer Sign-Off</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Transfer Notes</Label>
              <Textarea
                placeholder="Add notes about knowledge transfer completion, documentation handover, etc..."
                value={transferNotes}
                onChange={e => setTransferNotes(e.target.value)}
                className="min-h-28 bg-slate-50 resize-none"
              />
            </div>
            <Button onClick={handleSignOff} disabled={loadingAction === "signoff"} className="w-full bg-slate-900 hover:bg-slate-800 text-white">
              {loadingAction === "signoff"
                ? <Loader2 className="size-4 animate-spin mr-2" />
                : <CheckCircle className="size-4 mr-2" />
              }
              Sign Off Knowledge Transfer
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
