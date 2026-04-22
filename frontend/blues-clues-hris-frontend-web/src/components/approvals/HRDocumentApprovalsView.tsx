"use client";

import { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  CheckCircle2,
  XCircle,
  ExternalLink,
  Loader2,
  RefreshCw,
  FileText,
  ChevronRight,
  FileCheck,
  ShieldCheck,
  Landmark,
  FilePen,
  AlertCircle,
  Clock,
} from "lucide-react";
import {
  getPendingEmployeeDocuments,
  approveEmployeeDocument,
  rejectEmployeeDocument,
  type EmployeeDocument,
} from "@/lib/authApi";
import { toast } from "sonner";

// ─── Types ────────────────────────────────────────────────────────────────────

type PendingDoc = EmployeeDocument & {
  user_profile: { first_name: string; last_name: string; employee_id: string };
};

type EmployeeDocGroup = {
  user_id: string;
  first_name: string;
  last_name: string;
  employee_id: string;
  docs: PendingDoc[];
  latest_upload: string;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatBytes(bytes: number | null) {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

const DOC_LABELS: Record<string, string> = {
  "government-id": "Government ID",
  "tax-form": "Tax Form",
  "employment-contract": "Employment Contract",
  "bank-details": "Bank Details / Payroll Form",
  resume: "Resume / CV",
};

function docLabel(type: string) {
  return DOC_LABELS[type] ?? type.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function DocTypeIcon({ type }: { type: string }) {
  const cls = "h-4 w-4";
  if (type === "government-id") return <ShieldCheck className={cls} />;
  if (type === "bank-details") return <Landmark className={cls} />;
  if (type === "employment-contract") return <FilePen className={cls} />;
  if (type === "tax-form") return <FileCheck className={cls} />;
  return <FileText className={cls} />;
}

function employeeInitials(first: string, last: string) {
  return `${first.charAt(0)}${last.charAt(0)}`.toUpperCase();
}

// Deterministic avatar color from name
const AVATAR_COLORS = [
  "bg-blue-100 text-blue-700",
  "bg-violet-100 text-violet-700",
  "bg-emerald-100 text-emerald-700",
  "bg-amber-100 text-amber-700",
  "bg-rose-100 text-rose-700",
  "bg-cyan-100 text-cyan-700",
];

function avatarColor(name: string) {
  let n = 0;
  for (let i = 0; i < name.length; i++) n += name.charCodeAt(i);
  return AVATAR_COLORS[n % AVATAR_COLORS.length];
}

function groupByEmployee(docs: PendingDoc[]): EmployeeDocGroup[] {
  const map = new Map<string, EmployeeDocGroup>();
  for (const doc of docs) {
    const uid = doc.user_id;
    if (!map.has(uid)) {
      map.set(uid, {
        user_id: uid,
        first_name: doc.user_profile?.first_name ?? "",
        last_name: doc.user_profile?.last_name ?? "",
        employee_id: doc.user_profile?.employee_id ?? "",
        docs: [],
        latest_upload: doc.uploaded_at,
      });
    }
    const group = map.get(uid)!;
    group.docs.push(doc);
    if (doc.uploaded_at > group.latest_upload) group.latest_upload = doc.uploaded_at;
  }
  return [...map.values()].sort(
    (a, b) => new Date(b.latest_upload).getTime() - new Date(a.latest_upload).getTime()
  );
}

// ─── Employee Card ────────────────────────────────────────────────────────────

function EmployeeCard({
  group,
  onClick,
}: {
  group: EmployeeDocGroup;
  onClick: () => void;
}) {
  const initials = employeeInitials(group.first_name, group.last_name);
  const colorCls = avatarColor(`${group.first_name}${group.last_name}`);
  const fullName = `${group.first_name} ${group.last_name}`.trim();

  return (
    <button
      onClick={onClick}
      className="w-full text-left rounded-2xl border border-gray-200 bg-white hover:border-indigo-300 hover:shadow-md transition-all duration-150 p-5 flex items-center gap-4 group cursor-pointer"
    >
      {/* Avatar */}
      <div
        className={`h-11 w-11 rounded-xl flex items-center justify-center font-bold text-sm shrink-0 ${colorCls}`}
      >
        {initials}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-gray-900 truncate">{fullName}</p>
        <p className="text-xs text-gray-500 truncate">{group.employee_id}</p>
        <p className="text-xs text-gray-400 mt-0.5">
          Last submitted {formatDate(group.latest_upload)}
        </p>
      </div>

      {/* Pending count badge */}
      <div className="flex items-center gap-2 shrink-0">
        <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100 border-0 font-semibold">
          {group.docs.length} pending
        </Badge>
        <ChevronRight className="h-4 w-4 text-gray-400 group-hover:text-indigo-500 transition-colors" />
      </div>
    </button>
  );
}

// ─── Document Row (inside modal) ──────────────────────────────────────────────

type DocRowState = "idle" | "rejecting" | "processing";

function DocumentRow({
  doc,
  onApproved,
  onRejected,
}: {
  doc: PendingDoc;
  onApproved: (id: string) => void;
  onRejected: (id: string) => void;
}) {
  const [state, setState] = useState<DocRowState>("idle");
  const [notes, setNotes] = useState("");

  const handleApprove = async () => {
    setState("processing");
    try {
      await approveEmployeeDocument(doc.id);
      toast.success(`${docLabel(doc.document_type)} approved.`);
      onApproved(doc.id);
    } catch (e: any) {
      toast.error(e?.message ?? "Approval failed.");
      setState("idle");
    }
  };

  const handleReject = async () => {
    if (!notes.trim()) {
      toast.error("Please provide a rejection reason.");
      return;
    }
    setState("processing");
    try {
      await rejectEmployeeDocument(doc.id, notes.trim());
      toast.success(`${docLabel(doc.document_type)} rejected.`);
      onRejected(doc.id);
    } catch (e: any) {
      toast.error(e?.message ?? "Rejection failed.");
      setState("processing");
    }
  };

  const busy = state === "processing";

  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50/50 p-4 space-y-3">
      {/* Doc header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="h-8 w-8 rounded-lg bg-white border border-gray-200 flex items-center justify-center text-gray-500 shrink-0">
            <DocTypeIcon type={doc.document_type} />
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-900">{docLabel(doc.document_type)}</p>
            <p className="text-xs text-gray-500">
              {doc.file_name}
              {doc.file_size ? ` · ${formatBytes(doc.file_size)}` : ""}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[10px] text-gray-400 flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {formatDate(doc.uploaded_at)}
          </span>
          {doc.file_url && (
            <Button variant="outline" size="sm" className="h-7 text-xs gap-1 px-2" asChild>
              <a href={doc.file_url} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="h-3 w-3" />
                View
              </a>
            </Button>
          )}
        </div>
      </div>

      {/* Rejection notes input */}
      {state === "rejecting" && (
        <Textarea
          placeholder="Reason for rejection — the employee will see this (required)…"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          className="text-sm resize-none"
          autoFocus
        />
      )}

      {/* Actions */}
      <div className="flex items-center gap-2">
        {state !== "rejecting" ? (
          <>
            <Button
              size="sm"
              className="h-8 gap-1.5 bg-green-600 hover:bg-green-700 text-white text-xs"
              onClick={handleApprove}
              disabled={busy}
            >
              {busy ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <CheckCircle2 className="h-3.5 w-3.5" />
              )}
              Approve
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-8 gap-1.5 border-red-200 text-red-600 hover:bg-red-50 text-xs"
              onClick={() => setState("rejecting")}
              disabled={busy}
            >
              <XCircle className="h-3.5 w-3.5" />
              Reject
            </Button>
          </>
        ) : (
          <>
            <Button
              size="sm"
              variant="destructive"
              className="h-8 gap-1.5 text-xs"
              onClick={handleReject}
              disabled={busy}
            >
              {busy ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <AlertCircle className="h-3.5 w-3.5" />
              )}
              Confirm Reject
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-8 text-xs"
              onClick={() => { setState("idle"); setNotes(""); }}
              disabled={busy}
            >
              Cancel
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Employee Detail Dialog ───────────────────────────────────────────────────

function EmployeeDocDetailDialog({
  group,
  open,
  onClose,
  onGroupEmpty,
}: {
  group: EmployeeDocGroup | null;
  open: boolean;
  onClose: () => void;
  onGroupEmpty: (userId: string) => void;
}) {
  const [remaining, setRemaining] = useState<PendingDoc[]>([]);

  useEffect(() => {
    if (group) setRemaining([...group.docs]);
  }, [group]);

  const removeDoc = useCallback(
    (docId: string) => {
      setRemaining((prev) => {
        const next = prev.filter((d) => d.id !== docId);
        if (next.length === 0 && group) {
          onGroupEmpty(group.user_id);
          onClose();
        }
        return next;
      });
    },
    [group, onClose, onGroupEmpty]
  );

  if (!group) return null;

  const fullName = `${group.first_name} ${group.last_name}`.trim();
  const initials = employeeInitials(group.first_name, group.last_name);
  const colorCls = avatarColor(`${group.first_name}${group.last_name}`);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg w-full max-h-[90vh] flex flex-col p-0 gap-0 rounded-2xl overflow-hidden">
        {/* Header */}
        <DialogHeader className="px-6 py-5 border-b border-gray-100 shrink-0">
          <div className="flex items-center gap-3">
            <div
              className={`h-10 w-10 rounded-xl flex items-center justify-center font-bold text-sm shrink-0 ${colorCls}`}
            >
              {initials}
            </div>
            <div>
              <DialogTitle className="text-base font-semibold text-gray-900 leading-tight">
                {fullName}
              </DialogTitle>
              <p className="text-xs text-gray-500 mt-0.5">{group.employee_id}</p>
            </div>
            {remaining.length > 0 && (
              <Badge className="ml-auto bg-amber-100 text-amber-700 hover:bg-amber-100 border-0 font-semibold shrink-0">
                {remaining.length} pending
              </Badge>
            )}
          </div>
        </DialogHeader>

        {/* Document list */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-3">
          {remaining.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3 text-center">
              <div className="h-12 w-12 rounded-full bg-green-100 flex items-center justify-center">
                <CheckCircle2 className="h-6 w-6 text-green-600" />
              </div>
              <p className="text-sm font-medium text-gray-700">All documents reviewed</p>
              <p className="text-xs text-gray-400">The employee will be notified of your decisions.</p>
            </div>
          ) : (
            remaining.map((doc) => (
              <DocumentRow
                key={doc.id}
                doc={doc}
                onApproved={removeDoc}
                onRejected={removeDoc}
              />
            ))
          )}
        </div>

        {/* Footer note */}
        {remaining.length > 0 && (
          <div className="px-6 py-3 border-t border-gray-100 shrink-0">
            <p className="text-[11px] text-gray-400">
              Rejected documents allow the employee to resubmit a corrected version.
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function HRDocumentApprovalsView() {
  const [groups, setGroups] = useState<EmployeeDocGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<EmployeeDocGroup | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    getPendingEmployeeDocuments()
      .then((docs) => setGroups(groupByEmployee(docs as PendingDoc[])))
      .catch(() => toast.error("Failed to load pending documents."))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const openEmployee = (group: EmployeeDocGroup) => {
    setSelected(group);
    setDialogOpen(true);
  };

  const handleGroupEmpty = (userId: string) => {
    setGroups((prev) => prev.filter((g) => g.user_id !== userId));
  };

  const totalPending = groups.reduce((acc, g) => acc + g.docs.length, 0);

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {loading
            ? "Loading…"
            : groups.length === 0
            ? "No pending documents"
            : `${groups.length} employee${groups.length !== 1 ? "s" : ""} · ${totalPending} document${totalPending !== 1 ? "s" : ""} pending review`}
        </p>
        <Button variant="ghost" size="sm" onClick={load} disabled={loading} className="gap-1.5">
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-16 gap-2 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span className="text-sm">Loading documents…</span>
        </div>
      ) : groups.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3 text-center rounded-2xl border border-dashed border-gray-200 bg-gray-50/50">
          <div className="h-14 w-14 rounded-full bg-green-100 flex items-center justify-center">
            <FileCheck className="h-7 w-7 text-green-600" />
          </div>
          <p className="text-base font-semibold text-gray-700">All caught up</p>
          <p className="text-sm text-gray-400 max-w-xs">
            No employee documents are waiting for review.
          </p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {groups.map((group) => (
            <EmployeeCard
              key={group.user_id}
              group={group}
              onClick={() => openEmployee(group)}
            />
          ))}
        </div>
      )}

      {/* Detail modal */}
      <EmployeeDocDetailDialog
        group={selected}
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onGroupEmpty={handleGroupEmpty}
      />
    </div>
  );
}
