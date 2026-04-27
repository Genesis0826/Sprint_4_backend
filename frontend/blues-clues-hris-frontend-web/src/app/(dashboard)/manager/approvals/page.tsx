"use client";

import { useEffect, useState } from "react";
import { CheckCircle, FileText, Loader2, XCircle } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  approveEmployeeDocument,
  getPendingEmployeeDocuments,
  rejectEmployeeDocument,
  type EmployeeDocument,
} from "@/lib/authApi";
import {
  getLeaveRequestsForApproval,
  reviewLeaveRequestApi,
  type LeaveRequestForApproval,
} from "@/lib/payrollApi";

type PendingDocument = EmployeeDocument & {
  user_profile: { first_name: string; last_name: string; employee_id: string };
};

function leaveStatusColor(status: string) {
  if (status === "Approved") return "bg-emerald-100 text-emerald-700";
  if (status === "Rejected") return "bg-rose-100 text-rose-700";
  return "bg-amber-100 text-amber-700";
}

function docStatusColor(status: string) {
  if (status === "approved") return "bg-emerald-100 text-emerald-700";
  if (status === "rejected") return "bg-rose-100 text-rose-700";
  return "bg-amber-100 text-amber-700";
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function ManagerApprovalsPage() {
  const [activeTab, setActiveTab] = useState("leave");

  // Leave state
  const [leaveRequests, setLeaveRequests] = useState<LeaveRequestForApproval[]>([]);
  const [leaveLoading, setLeaveLoading] = useState(true);
  const [leaveFilter, setLeaveFilter] = useState<"all" | "Pending" | "Approved" | "Rejected">("Pending");
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [rejectDialogId, setRejectDialogId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [submittingReject, setSubmittingReject] = useState(false);

  // Document state
  const [documents, setDocuments] = useState<PendingDocument[]>([]);
  const [docsLoading, setDocsLoading] = useState(true);
  const [approvingDocId, setApprovingDocId] = useState<string | null>(null);
  const [rejectDocDialogId, setRejectDocDialogId] = useState<string | null>(null);
  const [rejectDocNotes, setRejectDocNotes] = useState("");
  const [submittingDocReject, setSubmittingDocReject] = useState(false);

  const loadLeaveRequests = async (status?: string) => {
    setLeaveLoading(true);
    try {
      const data = await getLeaveRequestsForApproval(status === "all" ? undefined : status);
      setLeaveRequests(data);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load leave requests");
    } finally {
      setLeaveLoading(false);
    }
  };

  const loadDocuments = async () => {
    setDocsLoading(true);
    try {
      const data = await getPendingEmployeeDocuments();
      setDocuments(data as PendingDocument[]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load documents");
    } finally {
      setDocsLoading(false);
    }
  };

  useEffect(() => {
    void loadLeaveRequests(leaveFilter);
  }, [leaveFilter]);

  useEffect(() => {
    void loadDocuments();
  }, []);

  const handleApproveLeave = async (requestId: string) => {
    setReviewingId(requestId);
    try {
      await reviewLeaveRequestApi(requestId, "Approved");
      toast.success("Leave request approved.");
      void loadLeaveRequests(leaveFilter);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to approve leave");
    } finally {
      setReviewingId(null);
    }
  };

  const handleRejectLeave = async () => {
    if (!rejectDialogId) return;
    setSubmittingReject(true);
    try {
      await reviewLeaveRequestApi(rejectDialogId, "Rejected", rejectReason || undefined);
      toast.success("Leave request rejected.");
      setRejectDialogId(null);
      setRejectReason("");
      void loadLeaveRequests(leaveFilter);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to reject leave");
    } finally {
      setSubmittingReject(false);
    }
  };

  const handleApproveDoc = async (docId: string) => {
    setApprovingDocId(docId);
    try {
      await approveEmployeeDocument(docId);
      toast.success("Document approved.");
      void loadDocuments();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to approve document");
    } finally {
      setApprovingDocId(null);
    }
  };

  const handleRejectDoc = async () => {
    if (!rejectDocDialogId) return;
    setSubmittingDocReject(true);
    try {
      await rejectEmployeeDocument(rejectDocDialogId, rejectDocNotes);
      toast.success("Document rejected.");
      setRejectDocDialogId(null);
      setRejectDocNotes("");
      void loadDocuments();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to reject document");
    } finally {
      setSubmittingDocReject(false);
    }
  };

  const pendingLeaveCount = leaveRequests.filter((r) => r.status === "Pending").length;
  const pendingDocCount = documents.filter((d) => d.status === "pending").length;

  return (
    <div className="space-y-6">
      <div className="rounded-[26px] bg-[linear-gradient(135deg,#0f172a_0%,#1e3a5f_52%,#134e4a_100%)] text-white px-8 py-10 shadow-sm">
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/65 mb-2">Manager Tools</p>
        <h1 className="text-2xl font-bold tracking-tight mb-1">Team Approvals</h1>
        <p className="text-sm text-white/75">Review and action team leave requests and document submissions.</p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="grid w-full max-w-sm grid-cols-2">
          <TabsTrigger value="leave" className="relative">
            Leave Approvals
            {pendingLeaveCount > 0 && (
              <span className="ml-1.5 inline-flex items-center justify-center rounded-full bg-amber-500 text-white text-[10px] font-bold h-4 min-w-4 px-1">
                {pendingLeaveCount}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="documents" className="relative">
            Document Approvals
            {pendingDocCount > 0 && (
              <span className="ml-1.5 inline-flex items-center justify-center rounded-full bg-amber-500 text-white text-[10px] font-bold h-4 min-w-4 px-1">
                {pendingDocCount}
              </span>
            )}
          </TabsTrigger>
        </TabsList>

        {/* ── LEAVE APPROVALS ── */}
        <TabsContent value="leave" className="space-y-4">
          <div className="flex items-center gap-2 flex-wrap">
            {(["Pending", "Approved", "Rejected", "all"] as const).map((f) => (
              <Button
                key={f}
                size="sm"
                variant={leaveFilter === f ? "default" : "outline"}
                onClick={() => setLeaveFilter(f)}
                className="h-8"
              >
                {f === "all" ? "All" : f}
              </Button>
            ))}
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base font-bold tracking-tight">
                Leave Requests
              </CardTitle>
            </CardHeader>
            <CardContent>
              {leaveLoading ? (
                <div className="min-h-40 flex items-center justify-center gap-2 text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span className="text-sm">Loading leave requests...</span>
                </div>
              ) : leaveRequests.length === 0 ? (
                <p className="text-sm text-muted-foreground">No leave requests found.</p>
              ) : (
                <div className="space-y-3">
                  {leaveRequests.map((req) => {
                    const isReviewing = reviewingId === req.request_id;
                    const isPending = req.status === "Pending";
                    return (
                      <div key={req.request_id} className="rounded-lg border p-4 bg-muted/10 space-y-3">
                        <div className="flex flex-col gap-1 md:flex-row md:items-start md:justify-between">
                          <div>
                            <p className="text-sm font-semibold">
                              {req.employee
                                ? `${req.employee.first_name} ${req.employee.last_name}`
                                : "Unknown Employee"}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {req.employee?.employee_id ?? ""} · {req.leave_type}
                            </p>
                          </div>
                          <Badge className={leaveStatusColor(req.status)}>{req.status}</Badge>
                        </div>

                        <div className="grid gap-2 text-xs sm:grid-cols-3">
                          <div className="rounded-md border p-2 bg-background">
                            <p className="text-muted-foreground">From</p>
                            <p className="font-semibold">{formatDate(req.start_date)}</p>
                          </div>
                          <div className="rounded-md border p-2 bg-background">
                            <p className="text-muted-foreground">To</p>
                            <p className="font-semibold">{formatDate(req.end_date)}</p>
                          </div>
                          <div className="rounded-md border p-2 bg-background">
                            <p className="text-muted-foreground">Days</p>
                            <p className="font-semibold">{req.total_days}</p>
                          </div>
                        </div>

                        {req.reason && (
                          <p className="text-xs text-muted-foreground italic">
                            Reason: {req.reason}
                          </p>
                        )}
                        {req.rejection_reason && (
                          <p className="text-xs text-rose-600 italic">
                            Rejection reason: {req.rejection_reason}
                          </p>
                        )}

                        {isPending && (
                          <div className="flex flex-wrap gap-2">
                            <Button
                              size="sm"
                              className="bg-emerald-600 hover:bg-emerald-700 text-white h-8 px-3"
                              disabled={isReviewing}
                              onClick={() => void handleApproveLeave(req.request_id)}
                            >
                              {isReviewing ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <CheckCircle className="h-3.5 w-3.5" />
                              )}
                              Approve
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="border-rose-200 text-rose-700 hover:bg-rose-50 h-8 px-3"
                              disabled={isReviewing}
                              onClick={() => {
                                setRejectDialogId(req.request_id);
                                setRejectReason("");
                              }}
                            >
                              <XCircle className="h-3.5 w-3.5" />
                              Reject
                            </Button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── DOCUMENT APPROVALS ── */}
        <TabsContent value="documents" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base font-bold tracking-tight flex items-center gap-2">
                <FileText className="h-4 w-4 text-primary" />
                Pending Documents
              </CardTitle>
            </CardHeader>
            <CardContent>
              {docsLoading ? (
                <div className="min-h-40 flex items-center justify-center gap-2 text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span className="text-sm">Loading documents...</span>
                </div>
              ) : documents.length === 0 ? (
                <p className="text-sm text-muted-foreground">No documents pending review.</p>
              ) : (
                <div className="space-y-3">
                  {documents.map((doc) => {
                    const isApproving = approvingDocId === doc.id;
                    const isPending = doc.status === "pending";
                    return (
                      <div key={doc.id} className="rounded-lg border p-4 bg-muted/10 space-y-3">
                        <div className="flex flex-col gap-1 md:flex-row md:items-start md:justify-between">
                          <div>
                            <p className="text-sm font-semibold">
                              {doc.user_profile
                                ? `${doc.user_profile.first_name} ${doc.user_profile.last_name}`
                                : "Unknown Employee"}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {doc.user_profile?.employee_id ?? ""} · {doc.document_type}
                            </p>
                          </div>
                          <Badge className={docStatusColor(doc.status)}>{doc.status}</Badge>
                        </div>

                        <div className="grid gap-2 text-xs sm:grid-cols-2">
                          <div className="rounded-md border p-2 bg-background">
                            <p className="text-muted-foreground">File</p>
                            <p className="font-semibold truncate">{doc.file_name}</p>
                          </div>
                          <div className="rounded-md border p-2 bg-background">
                            <p className="text-muted-foreground">Uploaded</p>
                            <p className="font-semibold">{formatDate(doc.uploaded_at)}</p>
                          </div>
                        </div>

                        {doc.hr_notes && (
                          <p className="text-xs text-rose-600 italic">Notes: {doc.hr_notes}</p>
                        )}

                        {doc.file_url && (
                          <a
                            href={doc.file_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-primary underline"
                          >
                            View file
                          </a>
                        )}

                        {isPending && (
                          <div className="flex flex-wrap gap-2">
                            <Button
                              size="sm"
                              className="bg-emerald-600 hover:bg-emerald-700 text-white h-8 px-3"
                              disabled={isApproving}
                              onClick={() => void handleApproveDoc(doc.id)}
                            >
                              {isApproving ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <CheckCircle className="h-3.5 w-3.5" />
                              )}
                              Approve
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="border-rose-200 text-rose-700 hover:bg-rose-50 h-8 px-3"
                              disabled={isApproving}
                              onClick={() => {
                                setRejectDocDialogId(doc.id);
                                setRejectDocNotes("");
                              }}
                            >
                              <XCircle className="h-3.5 w-3.5" />
                              Reject
                            </Button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Leave reject dialog */}
      <Dialog
        open={!!rejectDialogId}
        onOpenChange={(open) => {
          if (!open) setRejectDialogId(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Leave Request</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Provide a reason for rejection (optional).
            </p>
            <Textarea
              placeholder="Reason for rejection..."
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              rows={3}
            />
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setRejectDialogId(null)}>
                Cancel
              </Button>
              <Button
                className="bg-rose-600 hover:bg-rose-700 text-white"
                disabled={submittingReject}
                onClick={() => void handleRejectLeave()}
              >
                {submittingReject ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Confirm Reject
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Document reject dialog */}
      <Dialog
        open={!!rejectDocDialogId}
        onOpenChange={(open) => {
          if (!open) setRejectDocDialogId(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Document</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Add notes explaining why this document was rejected.
            </p>
            <Textarea
              placeholder="Notes for employee..."
              value={rejectDocNotes}
              onChange={(e) => setRejectDocNotes(e.target.value)}
              rows={3}
            />
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setRejectDocDialogId(null)}>
                Cancel
              </Button>
              <Button
                className="bg-rose-600 hover:bg-rose-700 text-white"
                disabled={submittingDocReject || !rejectDocNotes.trim()}
                onClick={() => void handleRejectDoc()}
              >
                {submittingDocReject ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Confirm Reject
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
