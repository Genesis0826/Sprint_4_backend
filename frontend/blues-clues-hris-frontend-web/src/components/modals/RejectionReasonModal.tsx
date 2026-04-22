"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { X, AlertCircle } from "lucide-react";
import { toast } from "sonner";

export interface RejectionReasonModalProps {
  isOpen: boolean;
  candidateName: string;
  applicationId: string;
  onConfirm: (applicationId: string, reason: string) => Promise<void>;
  onCancel: () => void;
}

const REJECTION_REASONS = [
  { id: "skills_mismatch", label: "Skills Mismatch" },
  { id: "experience_gap", label: "Experience Gap" },
  { id: "culture_fit", label: "Culture Fit" },
  { id: "salary_expectation", label: "Salary Expectation" },
  { id: "communication", label: "Communication" },
  { id: "timeline", label: "Timeline Availability" },
  { id: "other", label: "Other (Please specify)" },
];

export function RejectionReasonModal({
  isOpen,
  candidateName,
  applicationId,
  onConfirm,
  onCancel,
}: RejectionReasonModalProps) {
  const [selectedReason, setSelectedReason] = useState<string>("");
  const [customReason, setCustomReason] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const finalReason = selectedReason === "other" ? customReason : selectedReason;

  const handleSubmit = async () => {
    // Validation
    if (!selectedReason) {
      toast.error("Please select a rejection reason");
      return;
    }

    if (selectedReason === "other" && !customReason.trim()) {
      toast.error("Please provide a custom reason");
      return;
    }

    setIsSubmitting(true);
    try {
      await onConfirm(applicationId, finalReason);
      // Reset form on success
      setSelectedReason("");
      setCustomReason("");
    } catch (error) {
      console.error("Failed to reject application:", error);
      // Error toast is handled by parent
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-lg animate-in zoom-in-95 duration-200 overflow-hidden">
        
        {/* Header */}
        <div className="relative bg-[linear-gradient(135deg,#dc2626_0%,#991b1b_100%)] px-6 py-5">
          <div className="absolute inset-0 opacity-[0.03] pointer-events-none"
            style={{ backgroundImage: "radial-gradient(circle, white 1px, transparent 1px)", backgroundSize: "24px 24px" }} />
          
          <div className="relative flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="h-10 w-10 rounded-lg bg-red-500/20 border border-red-400/30 flex items-center justify-center shrink-0 mt-0.5">
                <AlertCircle className="h-5 w-5 text-red-400" />
              </div>
              <div>
                <h2 className="font-bold text-lg text-white leading-tight">Reject Candidate</h2>
                <p className="text-xs text-white/60 mt-1">{candidateName}</p>
              </div>
            </div>
            <button 
              onClick={onCancel}
              className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 border border-white/15 transition-colors shrink-0 cursor-pointer"
            >
              <X className="h-4 w-4 text-white/70" />
            </button>
          </div>

          <p className="text-xs text-white/70 mt-4 leading-relaxed">
            Please select a reason for rejection. This helps us improve our recruiting process and provides candidates with constructive feedback.
          </p>
        </div>

        {/* Body */}
        <div className="overflow-y-auto max-h-[calc(100vh-300px)] p-6 space-y-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-3">
              Rejection Reason
            </p>
            
            <div className="space-y-2">
              {REJECTION_REASONS.map((reason) => (
                <label 
                  key={reason.id}
                  className="flex items-center gap-3 p-3 rounded-lg border border-border cursor-pointer hover:bg-muted/40 transition-colors"
                >
                  <input
                    type="radio"
                    name="rejection_reason"
                    value={reason.id}
                    checked={selectedReason === reason.id}
                    onChange={(e) => setSelectedReason(e.target.value)}
                    className="h-4 w-4 text-red-600 cursor-pointer"
                    disabled={isSubmitting}
                  />
                  <span className="text-sm font-medium text-foreground">{reason.label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Custom reason input */}
          {selectedReason === "other" && (
            <div className="pt-2 space-y-2">
              <label htmlFor="custom-rejection-reason" className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                Please specify
              </label>
              <Input
                id="custom-rejection-reason"
                type="text"
                placeholder="Enter custom rejection reason..."
                value={customReason}
                onChange={(e) => setCustomReason(e.target.value)}
                disabled={isSubmitting}
                className="min-h-10 bg-muted/30 border-border focus-visible:ring-red-500/20"
                maxLength={200}
              />
              <p className="text-xs text-muted-foreground">{customReason.length} / 200</p>
            </div>
          )}

          {/* Info box */}
          <div className="mt-5 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
            <p className="text-xs text-amber-700 dark:text-amber-300 leading-relaxed">
              <strong>Note:</strong> This action will update the applicant's status to "Rejected" and send them a notification.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-border px-6 py-4 flex gap-3">
          <Button 
            variant="outline" 
            className="flex-1"
            onClick={onCancel}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button 
            className="flex-1 bg-red-600 hover:bg-red-700 text-white"
            onClick={handleSubmit}
            disabled={isSubmitting || !selectedReason || (selectedReason === "other" && !customReason.trim())}
          >
            {isSubmitting ? "Processing..." : "Confirm Rejection"}
          </Button>
        </div>
      </div>
    </div>
  );
}
