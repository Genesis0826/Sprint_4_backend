"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarDays, Loader2, Plus, Send } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { fileLeaveRequestApi, getMyLeaveBalances, getMyLeaveRequests, type LeaveBalanceCard, type LeaveReason, type LeaveRequestItem } from "@/lib/authApi";
import { toast } from "sonner";

const LEAVE_REASONS: LeaveReason[] = [
  "Sick Leave",
  "Emergency Leave",
  "WFH / Remote",
  "Personal Leave",
  "Vacation Leave",
  "Other",
];

function formatDate(value: string) {
  return new Date(`${value}T00:00:00`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function EmployeeLeavePage() {
  const [balances, setBalances] = useState<LeaveBalanceCard[]>([]);
  const [requests, setRequests] = useState<LeaveRequestItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);

  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [leaveType, setLeaveType] = useState<LeaveReason>("Vacation Leave");
  const [reason, setReason] = useState("");

  const today = useMemo(() => new Date().toISOString().split("T")[0], []);
  const loadingBalanceCards: LeaveBalanceCard[] = [
    { type: "Vacation", remaining: null, total: null },
    { type: "Sick", remaining: null, total: null },
    { type: "Emergency", remaining: null, total: null },
    { type: "Personal", remaining: null, total: null },
  ];
  const balanceCards = loading
    ? loadingBalanceCards
    : balances;

  function renderBalanceContent(item: LeaveBalanceCard) {
    if (item.remaining == null || item.total == null) {
      return <p className="text-sm text-muted-foreground">Not available yet</p>;
    }
    return (
      <p className="text-2xl font-bold tracking-tight">
        {item.remaining}
        <span className="text-sm text-muted-foreground font-medium"> / {item.total}</span>
      </p>
    );
  }

  async function loadData() {
    setLoading(true);
    try {
      const [b, r] = await Promise.all([getMyLeaveBalances(), getMyLeaveRequests()]);
      setBalances(b);
      setRequests(r);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load leave data");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadData();
  }, []);

  async function handleSubmitLeave() {
    if (!startDate) {
      toast.error("Please select a start date.");
      return;
    }

    if (!endDate) {
      toast.error("Please select an end date.");
      return;
    }

    if (!reason.trim()) {
      toast.error("Please provide a reason.");
      return;
    }

    setSubmitting(true);
    try {
      await fileLeaveRequestApi({
        leave_type: leaveType,
        start_date: startDate,
        end_date: endDate,
        reason: reason.trim(),
      });
      toast.success("Leave request filed.");
      setModalOpen(false);
      setReason("");
      setStartDate("");
      setEndDate("");
      await loadData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to file leave");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="rounded-[26px] bg-[linear-gradient(135deg,#0f172a_0%,#172554_52%,#134e4a_100%)] text-white px-8 py-10 shadow-sm">
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/60 mb-2">Employee Portal</p>
        <h1 className="text-2xl font-bold tracking-tight mb-1">Leave Dashboard</h1>
        <p className="text-sm text-white/70 max-w-xl">Track your leave balances and file a leave request.</p>
      </div>

      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold tracking-tight">Balances</h2>
        <Dialog open={modalOpen} onOpenChange={setModalOpen}>
          <DialogTrigger asChild>
            <Button className="cursor-pointer">
              <Plus className="h-4 w-4 mr-2" />
              File a Leave
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>File a Leave</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <div className="space-y-1.5">
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">Start Date</p>
                <Input type="date" min={today} value={startDate} onChange={(e) => setStartDate(e.target.value)} />
              </div>

              <div className="space-y-1.5">
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">End Date</p>
                <Input type="date" min={startDate || today} value={endDate} onChange={(e) => setEndDate(e.target.value)} />
              </div>

              <div className="space-y-1.5">
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">Leave Type</p>
                <Select value={leaveType} onValueChange={(v) => setLeaveType(v as LeaveReason)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {LEAVE_REASONS.map((item) => (
                      <SelectItem key={item} value={item}>{item}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">Reason</p>
                <Textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Explain your leave request"
                  className="min-h-24"
                />
              </div>

              <Button onClick={handleSubmitLeave} disabled={submitting} className="w-full cursor-pointer">
                {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Send className="h-4 w-4 mr-2" />}
                Submit Request
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {balanceCards.map((item, idx) => (
          <Card key={loading ? idx : item.type} className="border shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">{loading ? "Loading..." : item.type}</CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="h-8 w-24 bg-muted rounded animate-pulse" />
              ) : (
                renderBalanceContent(item)
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="border shadow-sm">
        <CardHeader>
          <CardTitle className="text-base font-bold tracking-tight flex items-center gap-2">
            <CalendarDays className="h-4 w-4" />
            Recent Leave Requests
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading && (
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading requests...
            </div>
          )}
          {!loading && requests.length === 0 && (
            <p className="text-sm text-muted-foreground">No leave requests yet.</p>
          )}
          {!loading && requests.length > 0 && (
            <div className="space-y-3">
              {requests.slice(0, 10).map((req) => (
                <div key={`${req.date}-${req.reason}-${req.notes ?? ""}`} className="rounded-lg border p-3 flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold">{req.reason ?? "Leave"}</p>
                    <p className="text-xs text-muted-foreground">{formatDate(req.date)}</p>
                    {req.notes && <p className="text-sm text-muted-foreground mt-1">{req.notes}</p>}
                  </div>
                  <Badge
                    className={
                      req.status === "approved"
                        ? "bg-emerald-100 text-emerald-700 border border-emerald-200"
                        : req.status === "rejected"
                          ? "bg-rose-100 text-rose-700 border border-rose-200"
                          : "bg-amber-100 text-amber-700 border border-amber-200"
                    }
                  >
                    {req.status === "approved" ? "Approved" : req.status === "rejected" ? "Rejected" : "Pending"}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
