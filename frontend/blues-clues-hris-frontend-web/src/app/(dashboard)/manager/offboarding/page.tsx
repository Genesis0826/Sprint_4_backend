"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { UserMinus, Plus, X, CheckCircle, Clock, FileText, Search, Loader2, Upload } from "lucide-react";
import {
  getManagerCases,
  getManagerCaseDetail,
  initiateTermination,
  acknowledgeCase,
  saveKnowledgeTransfer,
  fetchCompanyEmployees,
  type OffboardingCaseSummary,
  type OffboardingCaseDetail,
  type EmployeeUser,
} from "@/lib/offboardingApi";

// ── Constants ─────────────────────────────────────────────────────────────────

const OFFBOARDING_TYPES = ["Termination", "End of Contract"];

const REASONS: Record<string, string[]> = {
  Termination:       ["Performance Issues", "Policy Violation", "Redundancy", "Restructuring", "Other"],
  "End of Contract": ["Contract Expired", "Project Completed", "Fixed-Term End", "Other"],
};

type InitiateForm = {
  details: string;
  lastWorkingDay: string;
  reason: string;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function getNotificationBadge(status: string): { label: string; cls: string } {
  if (status === "Submitted")            return { label: "Review Required", cls: "bg-yellow-100 text-yellow-700 border border-yellow-200" };
  if (status === "Manager_Acknowledged") return { label: "Acknowledged",    cls: "bg-green-100 text-green-700 border border-green-200" };
  if (status === "HR_Accepted")          return { label: "HR In Progress",  cls: "bg-blue-100 text-blue-700 border border-blue-200" };
  if (status === "Completed")            return { label: "Completed",       cls: "bg-green-100 text-green-700 border border-green-200" };
  return { label: "Rejected", cls: "bg-red-100 text-red-700 border border-red-200" };
}

function filterCases(cases: OffboardingCaseSummary[], search: string, statusFilter: string): OffboardingCaseSummary[] {
  return cases.filter(c => {
    const name = c.employee_name ?? "";
    const matchesSearch = search.trim() === "" || name.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === "all" || c.status === statusFilter;
    return matchesSearch && matchesStatus;
  });
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function ManagerOffboardingPage() {
  const [cases, setCases]         = useState<OffboardingCaseSummary[]>([]);
  const [selectedId, setSelectedId]   = useState<string | null>(null);
  const [selectedDetail, setSelectedDetail] = useState<OffboardingCaseDetail | null>(null);
  const [showInitiateForm, setShowInitiateForm] = useState(false);
  const [offboardingType, setOffboardingType]   = useState("Termination");
  const [transferNotes, setTransferNotes]       = useState("");
  const [search, setSearch]         = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [detailsMode, setDetailsMode] = useState<"type" | "upload">("type");
  const [detailsFile, setDetailsFile] = useState<File | null>(null);
  const [form, setForm] = useState<InitiateForm>({ details: "", lastWorkingDay: "", reason: "" });

  // Employee search for initiate form
  const [allEmployees, setAllEmployees]         = useState<EmployeeUser[]>([]);
  const [employeeSearch, setEmployeeSearch]     = useState("");
  const [selectedEmployee, setSelectedEmployee] = useState<EmployeeUser | null>(null);
  const [showEmployeeList, setShowEmployeeList] = useState(false);
  const [employeeLoadError, setEmployeeLoadError] = useState<string | null>(null);
  const [loadingEmployees, setLoadingEmployees] = useState(false);

  const fetchCases = useCallback(async () => {
    try {
      const data = await getManagerCases();
      setCases(data);
    } catch { /* silently ignore */ }
  }, []);

  useEffect(() => { fetchCases(); }, [fetchCases]);

  useEffect(() => {
    if (showInitiateForm && allEmployees.length === 0 && !loadingEmployees) {
      setLoadingEmployees(true);
      setEmployeeLoadError(null);
      fetchCompanyEmployees()
        .then(setAllEmployees)
        .catch(err => setEmployeeLoadError(err instanceof Error ? err.message : "Failed to load employees."))
        .finally(() => setLoadingEmployees(false));
    }
  }, [showInitiateForm, allEmployees.length, loadingEmployees]);

  useEffect(() => {
    if (!selectedId) { setSelectedDetail(null); return; }
    getManagerCaseDetail(selectedId)
      .then(detail => {
        setSelectedDetail(detail);
        setTransferNotes(detail.knowledge_transfer?.transfer_notes ?? "");
      })
      .catch(() => setSelectedDetail(null));
  }, [selectedId]);

  const visibleCases  = cases.filter(c => c.status !== "Rejected");
  const filteredCases = filterCases(visibleCases, search, statusFilter);
  const selectedCase  = cases.find(c => c.case_id === selectedId) ?? null;
  const canAcknowledge = selectedCase?.status === "Submitted";
  const isActionable   = selectedCase !== null && selectedCase.status !== "Rejected";
  const initiateLabel  = offboardingType === "End of Contract" ? "Initiate End of Contract" : "Initiate Termination";

  const filteredEmployees = employeeSearch.trim().length > 0
    ? allEmployees.filter(e =>
        `${e.first_name} ${e.last_name}`.toLowerCase().includes(employeeSearch.toLowerCase())
      ).slice(0, 8)
    : [];

  const formValid = !!(selectedEmployee && form.lastWorkingDay && form.reason);

  async function handleInitiate() {
    if (!formValid || !selectedEmployee) return;
    setLoadingAction("initiate");
    setError(null);
    try {
      const created = await initiateTermination({
        employee_id: selectedEmployee.user_id,
        offboarding_type: offboardingType,
        reason: form.reason,
        termination_details: form.details || null,
        last_working_day: form.lastWorkingDay,
      });
      await fetchCases();
      setSelectedId(created.case_id);
      setShowInitiateForm(false);
      setForm({ details: "", lastWorkingDay: "", reason: "" });
      setSelectedEmployee(null);
      setEmployeeSearch("");
      setDetailsMode("type");
      setDetailsFile(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to initiate offboarding. Please try again.");
    } finally {
      setLoadingAction(null);
    }
  }

  async function handleAcknowledge() {
    if (!selectedCase) return;
    setLoadingAction("acknowledge");
    setError(null);
    try {
      await acknowledgeCase(selectedCase.case_id);
      await fetchCases();
      setSelectedId(selectedCase.case_id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to acknowledge case. Please try again.");
    } finally {
      setLoadingAction(null);
    }
  }

  async function handleSignOff() {
    if (!selectedCase) return;
    setLoadingAction("signoff");
    setError(null);
    try {
      await saveKnowledgeTransfer(selectedCase.case_id, transferNotes, true);
      await getManagerCaseDetail(selectedCase.case_id).then(d => setSelectedDetail(d));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to sign off knowledge transfer. Please try again.");
    } finally {
      setLoadingAction(null);
    }
  }

  const ktSignedOff = selectedDetail?.knowledge_transfer?.status === "Signed Off";

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

            {/* Employee Search */}
            <div className="space-y-2 relative">
              <Label>Employee</Label>
              {selectedEmployee ? (
                <div className="flex items-center justify-between border rounded-md px-3 py-2.5 bg-slate-50">
                  <span className="text-sm font-medium">{selectedEmployee.first_name} {selectedEmployee.last_name}</span>
                  <button type="button" onClick={() => { setSelectedEmployee(null); setEmployeeSearch(""); }} className="text-slate-400 hover:text-slate-600">
                    <X className="size-4" />
                  </button>
                </div>
              ) : (
                <>
                  <div className="relative">
                    {loadingEmployees
                      ? <Loader2 className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-slate-400 animate-spin" />
                      : <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-slate-400" />
                    }
                    <Input
                      placeholder={loadingEmployees ? "Loading employees..." : "Search employee by name..."}
                      value={employeeSearch}
                      onChange={e => { setEmployeeSearch(e.target.value); setShowEmployeeList(true); }}
                      onFocus={() => setShowEmployeeList(true)}
                      className="pl-9"
                      disabled={loadingEmployees}
                    />
                  </div>
                  {employeeLoadError && (
                    <p className="text-xs text-red-500">{employeeLoadError}</p>
                  )}
                  {showEmployeeList && !loadingEmployees && (
                    filteredEmployees.length > 0 ? (
                      <div className="absolute z-10 w-full bg-white border rounded-md shadow-lg mt-1 max-h-48 overflow-y-auto">
                        {filteredEmployees.map(emp => (
                          <button
                            key={emp.user_id}
                            type="button"
                            onClick={() => { setSelectedEmployee(emp); setEmployeeSearch(""); setShowEmployeeList(false); }}
                            className="w-full text-left px-4 py-2.5 text-sm hover:bg-slate-50 border-b last:border-0"
                          >
                            <span className="font-medium">{emp.first_name} {emp.last_name}</span>
                            {emp.email && <span className="text-slate-400 ml-2 text-xs">{emp.email}</span>}
                          </button>
                        ))}
                      </div>
                    ) : employeeSearch.trim().length > 0 ? (
                      <div className="absolute z-10 w-full bg-white border rounded-md shadow-lg mt-1 px-4 py-3 text-sm text-slate-400">
                        No employees found
                      </div>
                    ) : null
                  )}
                </>
              )}
            </div>

            {/* Type / Upload toggle */}
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
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-slate-400" />
                <Input
                  placeholder="Search by name..."
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
                <option value="Submitted">Review Required</option>
                <option value="Manager_Acknowledged">Acknowledged</option>
                <option value="HR_Accepted">HR In Progress</option>
                <option value="Completed">Completed</option>
              </select>
            </div>
            {filteredCases.length > 0 ? filteredCases.map(c => {
              const badge = getNotificationBadge(c.status);
              const isSelected = selectedId === c.case_id;
              return (
                <button
                  key={c.case_id}
                  type="button"
                  onClick={() => setSelectedId(c.case_id)}
                  className={`w-full text-left flex items-center justify-between border rounded-md px-4 py-3 transition-colors hover:bg-slate-50 ${isSelected ? "border-slate-400 bg-slate-50" : ""}`}
                >
                  <div className="flex items-center gap-3">
                    <div className="h-9 w-9 bg-slate-100 rounded-full flex items-center justify-center shrink-0">
                      <UserMinus className="size-4 text-slate-400" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold">{c.employee_name ?? "—"}</p>
                      <p className="text-xs text-slate-500">Submitted {new Date(c.created_at).toLocaleDateString()}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge variant="outline" className="text-slate-500 bg-slate-100">{c.offboarding_type}</Badge>
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
            {canAcknowledge ? (
              <Badge className="bg-yellow-100 text-yellow-700 border border-yellow-200">Pending Review</Badge>
            ) : (
              <Badge className="bg-green-100 text-green-700 border border-green-200">Acknowledged</Badge>
            )}
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid grid-cols-2 gap-x-8 gap-y-4">
              <div>
                <p className="text-xs text-slate-500 mb-0.5">Employee Name</p>
                <p className="text-sm font-medium">{selectedCase.employee_name ?? "—"}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500 mb-0.5">Offboarding Type</p>
                <p className="text-sm font-medium">{selectedCase.offboarding_type}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500 mb-0.5">Last Working Day</p>
                <p className="text-sm font-medium">{selectedCase.last_working_day}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500 mb-0.5">Submitted Date</p>
                <p className="text-sm font-medium">{new Date(selectedCase.created_at).toLocaleDateString()}</p>
              </div>
            </div>
            {selectedDetail?.resignation_details?.resignation_letter && (
              <div>
                <p className="text-xs text-slate-500 mb-2">Resignation Letter</p>
                <div className="border rounded-md px-4 py-3 flex items-start gap-2 text-sm text-slate-700">
                  <FileText className="size-4 text-slate-400 shrink-0 mt-0.5" />
                  <span className="whitespace-pre-wrap">{selectedDetail.resignation_details.resignation_letter}</span>
                </div>
              </div>
            )}
            {selectedDetail?.termination_details?.termination_details && (
              <div>
                <p className="text-xs text-slate-500 mb-2">
                  {selectedCase.offboarding_type === "End of Contract" ? "Contract Completion Details" : "Termination Details"}
                </p>
                <div className="border rounded-md px-4 py-3 flex items-start gap-2 text-sm text-slate-700">
                  <FileText className="size-4 text-slate-400 shrink-0 mt-0.5" />
                  <span className="whitespace-pre-wrap">{selectedDetail.termination_details.termination_details}</span>
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
      {isActionable && selectedDetail && selectedDetail.checklist_items.length > 0 && (
        <Card>
          <CardHeader><CardTitle>Employee Checklist Progress</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {selectedDetail.checklist_items.map(item => (
              <div key={item.item_id} className="flex items-center justify-between border rounded-md px-4 py-3">
                <div className="flex items-center gap-3">
                  {item.status === "Verified"
                    ? <CheckCircle className="size-4 text-green-500" />
                    : <Clock className="size-4 text-slate-400" />
                  }
                  <span className="text-sm font-medium">{item.item_name}</span>
                </div>
                {item.status === "Verified" ? (
                  <Badge className="bg-green-100 text-green-700 border border-green-200">Verified</Badge>
                ) : item.status === "Submitted" ? (
                  <Badge className="bg-blue-100 text-blue-700 border border-blue-200">Submitted</Badge>
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
            {ktSignedOff && (
              <div className="flex items-center gap-2 bg-green-50 border border-green-100 rounded-md px-4 py-3 text-sm text-green-700">
                <CheckCircle className="size-4 shrink-0" />
                Knowledge transfer has been signed off.
              </div>
            )}
            <div className="space-y-2">
              <Label>Transfer Notes</Label>
              <Textarea
                placeholder="Add notes about knowledge transfer completion, documentation handover, etc..."
                value={transferNotes}
                onChange={e => setTransferNotes(e.target.value)}
                className="min-h-28 bg-slate-50 resize-none"
                disabled={ktSignedOff}
              />
            </div>
            {!ktSignedOff && (
              <Button onClick={handleSignOff} disabled={loadingAction === "signoff"} className="w-full bg-slate-900 hover:bg-slate-800 text-white">
                {loadingAction === "signoff"
                  ? <Loader2 className="size-4 animate-spin mr-2" />
                  : <CheckCircle className="size-4 mr-2" />
                }
                Sign Off Knowledge Transfer
              </Button>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
