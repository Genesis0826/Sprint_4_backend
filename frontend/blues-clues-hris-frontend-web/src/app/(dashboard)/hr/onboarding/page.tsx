"use client";

import HROnboardingOfficerView from "@/components/onboarding/HROnboardingOfficerView";

export default function HROnboardingPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Onboarding</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Review new hire submissions and manage onboarding progress.
        </p>
      </div>

      <HROnboardingOfficerView />
    </div>
  );
}
