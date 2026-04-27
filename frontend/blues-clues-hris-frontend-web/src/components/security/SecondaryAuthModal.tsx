"use client";

import { useState } from "react";
import { Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import { verifySecondaryAuth } from "@/lib/securityApi";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

type SecondaryAuthModalProps = {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  onVerified: () => void;
  title?: string;
  description?: string;
};

export function SecondaryAuthModal({
  open,
  onOpenChange,
  onVerified,
  title = "Security Verification",
  description = "Confirm your account password to continue.",
}: Readonly<SecondaryAuthModalProps>) {
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleVerify = async () => {
    setSubmitting(true);
    try {
      await verifySecondaryAuth(password);
      toast.success("Verification successful.");
      setPassword("");
      onOpenChange(false);
      onVerified();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Verification failed.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base font-bold tracking-tight">
            <ShieldCheck className="h-4 w-4 text-primary" />
            {title}
          </DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          <Input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Enter password"
            autoComplete="current-password"
            className="h-10"
          />

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setPassword("");
                onOpenChange(false);
              }}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button type="button" onClick={handleVerify} disabled={submitting || !password.trim()}>
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Verify"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}