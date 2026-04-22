// Shared localStorage store — keeps Employee, Manager, and HR views in sync.

export type ChecklistStatus = "pending_review" | "verified" | "disputed";

export type OffboardingStatus =
  | "not_submitted"
  | "submitted"
  | "manager_acknowledged"
  | "hr_accepted"
  | "completed"
  | "rejected";

export type ChecklistItem = {
  id: number;
  label: string;
  status: ChecklistStatus;
  proofUploaded: boolean;
  proofFileName?: string;
  proofDate?: string;
};

export type SystemAccessItem = {
  id: number;
  label: string;
  revoked: boolean;
  revokedDate?: string;
};

export type OffboardingCase = {
  id: string;
  // Employee info
  employeeName: string;
  department: string;
  position: string;
  // Resignation / offboarding details
  offboardingType: string;
  lastWorkingDay: string;
  reason: string;
  submittedDate: string;
  initiatedBy: "Employee" | "Manager" | "HR";
  resignationLetter: string;
  // Workflow status
  status: OffboardingStatus;
  // Manager fields
  transferNotes: string;
  // HR fields
  checklistItems: ChecklistItem[];
  systemAccess: SystemAccessItem[];
  salaryBalance: string;
  deductions: string;
  additionalPay: string;
  paymentReleased: boolean;
  accountStatus: "active" | "deactivated" | "archived";
  clearanceGenerated: boolean;
  clearanceDate: string;
};

// ── Keys ──────────────────────────────────────────────────────────────────────
const SINGLE_KEY = "hris_offboarding_case";   // current employee's own case
const CASES_KEY  = "hris_offboarding_cases";  // all cases (multi-case list)

// ── Default data factories ────────────────────────────────────────────────────
function makeEmployeeChecklist(): ChecklistItem[] {
  return [
    { id: 1, label: "Company ID Card",   status: "pending_review", proofUploaded: false },
    { id: 2, label: "Laptop Return",      status: "pending_review", proofUploaded: false },
    { id: 3, label: "Access Card Return", status: "pending_review", proofUploaded: false },
  ];
}

function makeExtendedChecklist(): ChecklistItem[] {
  return [
    { id: 1, label: "Company ID Card",          status: "pending_review", proofUploaded: false },
    { id: 2, label: "Laptop Return",             status: "pending_review", proofUploaded: false },
    { id: 3, label: "Access Card Return",        status: "pending_review", proofUploaded: false },
    { id: 4, label: "Exit Interview Scheduled",  status: "pending_review", proofUploaded: false },
    { id: 5, label: "Knowledge Transfer Complete", status: "pending_review", proofUploaded: false },
  ];
}

function makeSystemAccess(): SystemAccessItem[] {
  return [
    { id: 1, label: "Email",                 revoked: false },
    { id: 2, label: "VPN",                   revoked: false },
    { id: 3, label: "Database",              revoked: false },
    { id: 4, label: "Internal Applications", revoked: false },
    { id: 5, label: "Cloud Storage",         revoked: false },
  ];
}

export const DEFAULT_CASE: OffboardingCase = {
  id: "employee",
  employeeName: "Current User",
  department: "Engineering",
  position: "Software Engineer",
  offboardingType: "Resignation",
  lastWorkingDay: "",
  reason: "",
  submittedDate: "",
  initiatedBy: "Employee",
  resignationLetter: "",
  status: "not_submitted",
  transferNotes: "",
  checklistItems: makeEmployeeChecklist(),
  systemAccess: makeSystemAccess(),
  salaryBalance: "0.00",
  deductions: "0.00",
  additionalPay: "0.00",
  paymentReleased: false,
  accountStatus: "active",
  clearanceGenerated: false,
  clearanceDate: "",
};

// ── Single-case API (employee view) ───────────────────────────────────────────
export function getOffboardingCase(): OffboardingCase {
  if (typeof globalThis.window === "undefined") return { ...DEFAULT_CASE };
  try {
    const stored = localStorage.getItem(SINGLE_KEY);
    if (stored) return JSON.parse(stored) as OffboardingCase;
  } catch { /* ignore */ }
  return { ...DEFAULT_CASE };
}

export function setOffboardingCase(data: OffboardingCase): void {
  if (typeof globalThis.window === "undefined") return;
  localStorage.setItem(SINGLE_KEY, JSON.stringify(data));
  syncToArray(data);
  globalThis.dispatchEvent(new Event("offboarding-updated"));
}

export function resetOffboardingCase(): void {
  setOffboardingCase({ ...DEFAULT_CASE, checklistItems: makeEmployeeChecklist(), systemAccess: makeSystemAccess() });
}

// ── Multi-case API (manager / HR views) ───────────────────────────────────────
export function getOffboardingCases(): OffboardingCase[] {
  if (typeof globalThis.window === "undefined") return [];
  try {
    const stored = localStorage.getItem(CASES_KEY);
    if (stored) return JSON.parse(stored) as OffboardingCase[];
  } catch { /* ignore */ }
  // Bootstrap: include employee case if already submitted
  try {
    const single = localStorage.getItem(SINGLE_KEY);
    if (single) {
      const c = JSON.parse(single) as OffboardingCase;
      if (c.status !== "not_submitted") return [c];
    }
  } catch { /* ignore */ }
  return [];
}

export function setOffboardingCases(cases: OffboardingCase[]): void {
  if (typeof globalThis.window === "undefined") return;
  localStorage.setItem(CASES_KEY, JSON.stringify(cases));
  // Keep single-case store in sync for employee view
  const emp = cases.find(c => c.id === "employee");
  if (emp) localStorage.setItem(SINGLE_KEY, JSON.stringify(emp));
  globalThis.dispatchEvent(new Event("offboarding-updated"));
}

export function updateOffboardingCaseById(id: string, patch: Partial<OffboardingCase>): void {
  const cases = getOffboardingCases();
  const idx = cases.findIndex(c => c.id === id);
  if (idx < 0) return;
  cases[idx] = { ...cases[idx], ...patch };
  setOffboardingCases(cases);
}

export function addNewOffboardingCase(overrides: Partial<OffboardingCase>): OffboardingCase {
  const newCase: OffboardingCase = {
    ...DEFAULT_CASE,
    id: `case_${Date.now()}`,
    checklistItems: makeExtendedChecklist(),
    systemAccess: makeSystemAccess(),
    ...overrides,
  };
  const cases = getOffboardingCases();
  cases.push(newCase);
  setOffboardingCases(cases);
  return newCase;
}

// ── Internal helpers ──────────────────────────────────────────────────────────
function syncToArray(data: OffboardingCase): void {
  if (typeof globalThis.window === "undefined") return;
  try {
    const raw = localStorage.getItem(CASES_KEY);
    const cases: OffboardingCase[] = raw ? JSON.parse(raw) : [];
    const idx = cases.findIndex(c => c.id === data.id);
    if (idx >= 0) {
      cases[idx] = data;
    } else if (data.status !== "not_submitted") {
      cases.push(data);
    }
    localStorage.setItem(CASES_KEY, JSON.stringify(cases));
  } catch { /* ignore */ }
}
