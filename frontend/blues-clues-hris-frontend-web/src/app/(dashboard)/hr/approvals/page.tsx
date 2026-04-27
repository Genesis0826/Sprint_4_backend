"use client";

import { useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, Eye, Loader2, XCircle } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import HRProfileChangeRequestsView from "@/components/onboarding/HRProfileChangeRequestsView";
import { getHRChangeRequests, reviewChangeRequest, type ChangeRequest } from "@/lib/changeRequestApi";
import { authFetch } from "@/lib/authApi";
import { API_BASE_URL } from "@/lib/api";
import { toast } from "sonner";

type LeaveRequestApiRow = {
  request_id: string;
  start_date: string;
  end_date: string;
  leave_type: string;
  reason: string | null;
  status: string;
  created_at: string;
  employee?: {
    user_id: string;
    employee_id: string | null;
    first_name: string | null;
    last_name: string | null;
    email: string | null;
  } | null;
};

type LeaveApprovalRow = {
  request_id: string;
  employee_id: string;
  employee_name: string;
  email: string;
  requested_at: string;
  reason: string;
  notes: string | null;
  status: string;
  start_date: string;
  end_date: string;
};

function formatDateTime(ts: string) {
  return new Date(ts).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function StatusBadge({ status }: Readonly<{ status: string }>) {
  const normalized = status.toUpperCase();
  if (normalized === "APPROVED") {
    return <Badge className="bg-emerald-100 text-emerald-700 border border-emerald-200">Approved</Badge>;
  }
  if (normalized === "REJECTED") {
    return <Badge className="bg-red-100 text-red-700 border border-red-200">Rejected</Badge>;
  }
  return <Badge className="bg-amber-100 text-amber-700 border border-amber-200">Pending</Badge>;
}

export default function HRApprovalsPage() {
  const [loadingLeave, setLoadingLeave] = useState(true);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [leaveRows, setLeaveRows] = useState<LeaveApprovalRow[]>([]);
  const [profileRows, setProfileRows] = useState<ChangeRequest[]>([]);
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [reviewingProfileId, setReviewingProfileId] = useState<string | null>(null);
  const [selectedLeave, setSelectedLeave] = useState<LeaveApprovalRow | null>(null);
  const [selectedProfile, setSelectedProfile] = useState<ChangeRequest | null>(null);
  const [profileTabRefreshSignal, setProfileTabRefreshSignal] = useState(0);

  async function loadLeaveApprovals() {
    setLoadingLeave(true);
    try {
      const leaveRes = await authFetch(`${API_BASE_URL}/timekeeping/leave-requests?status=Pending`);
      const leaveData = (await leaveRes.json().catch(() => [])) as LeaveRequestApiRow[];

      if (!leaveRes.ok) {
        throw new Error("Failed to load leave requests");
      }

      const leaveItems = leaveData
        .map((row) => {
          const employee = row.employee ?? null;
          return {
            request_id: row.request_id,
            employee_id: employee?.employee_id ?? "N/A",
            employee_name: employee
              ? `${employee.first_name ?? ""} ${employee.last_name ?? ""}`.trim() || "Unknown Employee"
              : "Unknown Employee",
            email: employee?.email ?? "",
            requested_at: row.created_at,
            reason: row.leave_type ?? "Other",
            notes: row.reason,
            status: row.status ?? "Pending",
            start_date: row.start_date,
            end_date: row.end_date,
          } satisfies LeaveApprovalRow;
        })
        .sort((a, b) => b.requested_at.localeCompare(a.requested_at));

      setLeaveRows(leaveItems);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load leave approvals");
      setLeaveRows([]);
    } finally {
      setLoadingLeave(false);
    }
  }

  async function loadProfileApprovals() {
    setLoadingProfile(true);
    try {
      const data = await getHRChangeRequests("pending");
      setProfileRows(data.filter((item) => item.status === "pending"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load profile change requests");
      setProfileRows([]);
    } finally {
      setLoadingProfile(false);
    }
  }

  useEffect(() => {
    void loadLeaveApprovals();
    void loadProfileApprovals();
  }, []);

  async function handleLeaveReview(requestId: string, status: "approved" | "rejected") {
    setReviewingId(requestId);
    try {
      const res = await authFetch(`${API_BASE_URL}/timekeeping/leave-requests/${requestId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });

      if (res.status === 404) {
        toast.error("Leave review endpoint is not available yet. See backend handoff note.");
        return;
      }

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error((data as { message?: string }).message || "Failed to review leave request");
      }

      setLeaveRows((prev) => prev.filter((row) => row.request_id !== requestId));
      toast.success(`Leave request ${status}.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to review leave request");
    } finally {
      setReviewingId(null);
    }
  }

  async function handleProfileReview(requestId: string, status: "approved" | "rejected") {
    setReviewingProfileId(requestId);
    try {
      await reviewChangeRequest(requestId, {
        status,
        review_reason: status === "approved" ? "Approved by HR" : "Rejected by HR",
      });
      setProfileRows((prev) => prev.filter((row) => row.request_id !== requestId));
      setProfileTabRefreshSignal((prev) => prev + 1);
      toast.success(`Profile request ${status}.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to review profile change request");
    } finally {
      setReviewingProfileId(null);
    }
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="rounded-[26px] border border-slate-200 bg-[linear-gradient(135deg,#0f172a_0%,#172554_52%,#134e4a_100%)] text-white px-8 py-10 shadow-sm">
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/65 mb-2">HR Operations</p>
        <h1 className="text-2xl font-bold tracking-tight mb-1">Approval Inbox</h1>
        <p className="text-sm text-white/75 max-w-2xl">
          Review pending profile change requests and leave submissions through separate approval queues.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Profile Change Requests</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold tracking-tight">{loadingProfile ? "..." : profileRows.length}</p>
            <p className="text-xs text-muted-foreground">Pending employee profile updates awaiting HR action.</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Leave Requests</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold tracking-tight">{loadingLeave ? "..." : leaveRows.length}</p>
            <p className="text-xs text-muted-foreground">Pending leave submissions awaiting approval or rejection.</p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="profile" className="space-y-4">
        <TabsList className="grid w-full max-w-xl grid-cols-2 rounded-xl bg-slate-100 p-1">
          <TabsTrigger value="profile" className="rounded-lg">
            Profile Changes
            <Badge variant="secondary" className="ml-2">
              {loadingProfile ? "..." : profileRows.length}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="leave" className="rounded-lg">
            Leave Requests
            <Badge variant="secondary" className="ml-2">
              {loadingLeave ? "..." : leaveRows.length}
            </Badge>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="profile" className="space-y-4">
          <HRProfileChangeRequestsView refreshSignal={profileTabRefreshSignal} />
        </TabsContent>

        <TabsContent value="leave" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base font-bold tracking-tight">Pending Leave Requests</CardTitle>
            </CardHeader>
            <CardContent>
              {loadingLeave && (
                <div className="flex items-center gap-2 text-muted-foreground text-sm">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading leave requests...
                </div>
              )}

              {!loadingLeave && leaveRows.length === 0 && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <AlertCircle className="h-4 w-4" />
                  No pending leave requests found.
                </div>
              )}

              {!loadingLeave && leaveRows.length > 0 && (
                <div className="space-y-3">
                  {leaveRows.map((row) => {
                    const busy = reviewingId === row.request_id;
                    return (
                      <div key={row.request_id} className="border rounded-lg p-4 flex flex-col gap-3">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-sm font-semibold">{row.employee_name}</p>
                            <p className="text-xs text-muted-foreground">{row.employee_id} {row.email ? `• ${row.email}` : ""}</p>
                            <p className="text-xs text-muted-foreground mt-1">Requested {formatDateTime(row.requested_at)}</p>
                          </div>
                          <StatusBadge status={row.status} />
                        </div>

                        <div className="text-sm">
                          <span className="font-medium">Reason:</span> {row.reason}
                        </div>

                        <div className="text-xs text-muted-foreground">
                          Dates: {row.start_date} to {row.end_date}
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setSelectedLeave(row)}
                            className="cursor-pointer"
                          >
                            <Eye className="h-3.5 w-3.5 mr-1.5" />
                            View Details
                          </Button>
                          <Button
                            size="sm"
                            onClick={() => void handleLeaveReview(row.request_id, "approved")}
                            disabled={busy}
                            className="bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer"
                          >
                            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />}
                            Approve
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => void handleLeaveReview(row.request_id, "rejected")}
                            disabled={busy}
                            className="border-destructive text-destructive hover:bg-destructive/10 cursor-pointer"
                          >
                            <XCircle className="h-3.5 w-3.5 mr-1.5" />
                            Reject
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={!!selectedLeave} onOpenChange={(open) => !open && setSelectedLeave(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Leave Request Details</DialogTitle>
            <DialogDescription>
              Review the submitted reason and notes before taking action.
            </DialogDescription>
          </DialogHeader>
          {selectedLeave && (
            <div className="space-y-2 text-sm">
              <p><span className="font-semibold">Employee:</span> {selectedLeave.employee_name}</p>
              <p><span className="font-semibold">Employee ID:</span> {selectedLeave.employee_id}</p>
              <p><span className="font-semibold">Requested At:</span> {formatDateTime(selectedLeave.requested_at)}</p>
              <p><span className="font-semibold">Date Range:</span> {selectedLeave.start_date} to {selectedLeave.end_date}</p>
              <p><span className="font-semibold">Reason:</span> {selectedLeave.reason}</p>
              <p><span className="font-semibold">Notes:</span> {selectedLeave.notes || "—"}</p>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!selectedProfile} onOpenChange={(open) => !open && setSelectedProfile(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Profile Change Details</DialogTitle>
            <DialogDescription>
              Review requested field updates before approval.
            </DialogDescription>
          </DialogHeader>
          {selectedProfile && (
            <div className="space-y-2 text-sm">
              <p>
                <span className="font-semibold">Employee:</span>{" "}
                {selectedProfile.employee
                  ? `${selectedProfile.employee.first_name} ${selectedProfile.employee.last_name}`
                  : "Unknown Employee"}
              </p>
              <p><span className="font-semibold">Type:</span> {selectedProfile.field_type === "legal_name" ? "Legal Name" : "Bank Account"}</p>
              <p><span className="font-semibold">Submitted:</span> {formatDateTime(selectedProfile.created_at)}</p>
              <p><span className="font-semibold">Reason:</span> {selectedProfile.reason}</p>
              <div>
                <p className="font-semibold">Requested Changes:</p>
                <div className="mt-1 space-y-1">
                  {Object.entries(selectedProfile.requested_changes).map(([key, value]) => (
                    <p key={key}>
                      <span className="text-muted-foreground">{key}:</span> {value}
                    </p>
                  ))}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
