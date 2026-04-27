import { API_BASE_URL } from "./api";
import { getAccessToken } from "./authStorage";

function headers() {
  return {
    Authorization: `Bearer ${getAccessToken()}`,
    "Content-Type": "application/json",
  };
}

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const msg = Array.isArray(body?.message)
      ? body.message.join(", ")
      : body?.message || `Request failed (${res.status})`;
    throw new Error(msg);
  }
  return res.json();
}

// ── Types ─────────────────────────────────────────────────────────────────────

export type OffboardingStatus =
  | "Submitted"
  | "Manager_Acknowledged"
  | "HR_Accepted"
  | "Completed"
  | "Rejected";

export type OffboardingType = "Resignation" | "Termination" | "End of Contract";

export interface OffboardingCaseSummary {
  case_id: string;
  employee_id: string;
  initiated_by_id: string;
  offboarding_type: OffboardingType;
  status: OffboardingStatus;
  last_working_day: string;
  rejection_reason: string | null;
  created_at: string;
  updated_at: string;
  employee_name: string | null;
}

export interface ChecklistItem {
  item_id: string;
  case_id: string;
  item_name: string;
  status: string; // Pending | Submitted | Verified | Disputed
  cleared_by_id: string | null;
  cleared_at: string | null;
}

export interface KnowledgeTransfer {
  kt_id: string;
  case_id: string;
  transfer_notes: string | null;
  status: string;
  signed_off_by_id: string | null;
  signed_off_at: string | null;
}

export interface SystemAccessItem {
  access_id: string;
  case_id: string;
  system_name: string;
  status: string; // Active | Revoked
  revoked_by_id: string | null;
  revoked_at: string | null;
}

export interface FinalPay {
  pay_id: string;
  case_id: string;
  salary_balance: number;
  leave_encashment: number;
  additional_pay: number;
  deductions: number;
  total_amount: number;
  status: string;
  transfer_confirmed_at: string | null;
  payroll_reference?: {
    payslip_id: string;
    net_pay: string;
    gross_pay: string;
    total_deductions: string;
    created_at: string;
    status: string;
    period: {
      period_id: string;
      cutoff_start_date: string;
      cutoff_end_date: string;
      payout_date: string;
    } | null;
  } | null;
  settlement_payslip?: {
    payslip_id: string;
    basic_pay_earned: string;
    total_allowances: string;
    gross_pay: string;
    tax_deduction: string;
    statutory_deductions: string;
    total_deductions: string;
    net_pay: string;
    status: string;
    employee_ack_status: string;
    created_at: string;
    period: {
      period_id: string;
      cutoff_start_date: string;
      cutoff_end_date: string;
      payout_date: string;
      status: string;
    } | null;
  } | null;
}

export interface ResignationDetails {
  resignation_id: string;
  case_id: string;
  reason: string;
  resignation_letter: string | null;
  document_url: string | null;
  document_name: string | null;
}

export interface TerminationDetails {
  termination_id: string;
  case_id: string;
  reason: string;
  termination_details: string | null;
  document_url: string | null;
  document_name: string | null;
}

export interface ClearanceDocument {
  document_id: string;
  case_id: string;
  document_type: string;
  document_name: string;
  status: string;
  released_by: string;
  released_at: string;
  notes: string | null;
}

export interface VacantPosition {
  status: string; // 'Pending Review' | 'Opened'
  job_posting_id: string | null;
}

export interface OffboardingCaseDetail extends OffboardingCaseSummary {
  resignation_details: ResignationDetails | null;
  termination_details: TerminationDetails | null;
  checklist_items: ChecklistItem[];
  knowledge_transfer: KnowledgeTransfer | null;
  system_access: SystemAccessItem[];
  final_pay: FinalPay | null;
  clearance_documents: ClearanceDocument[];
  vacant_position: VacantPosition | null;
}

export interface EmployeeUser {
  user_id: string;
  first_name: string;
  last_name: string;
  email?: string;
  employee_id?: string;
}

// ── Employee API ──────────────────────────────────────────────────────────────

export async function getMyOffboardingCase(): Promise<OffboardingCaseDetail | null> {
  const res = await fetch(`${API_BASE_URL}/offboarding/employee/cases/my`, {
    headers: headers(),
  });
  if (res.status === 404) return null;
  return handleResponse<OffboardingCaseDetail>(res);
}

export async function submitResignation(payload: {
  employee_id: string;
  reason: string;
  last_working_day: string;
  resignation_letter?: string | null;
  // REVISION: document upload is now required
  document_url: string;
  document_name: string;
}): Promise<OffboardingCaseSummary> {
  const res = await fetch(`${API_BASE_URL}/offboarding/employee/cases`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      employee_id: payload.employee_id,
      offboarding_type: "Resignation",
      last_working_day: payload.last_working_day,
      resignation: {
        reason: payload.reason,
        resignation_letter: payload.resignation_letter ?? null,
        // REVISION: required document fields
        document_url: payload.document_url,
        document_name: payload.document_name,
      },
    }),
  });
  return handleResponse<OffboardingCaseSummary>(res);
}

export async function acknowledgeChecklistItem(
  caseId: string,
  itemId: string,
): Promise<ChecklistItem> {
  const res = await fetch(
    `${API_BASE_URL}/offboarding/employee/cases/${caseId}/checklist/${itemId}/acknowledge`,
    { method: "PATCH", headers: headers() },
  );
  return handleResponse<ChecklistItem>(res);
}

// ── Manager API ───────────────────────────────────────────────────────────────

export async function getManagerCases(): Promise<OffboardingCaseSummary[]> {
  const res = await fetch(`${API_BASE_URL}/offboarding/manager/cases`, {
    headers: headers(),
  });
  return handleResponse<OffboardingCaseSummary[]>(res);
}

export async function getManagerCaseDetail(caseId: string): Promise<OffboardingCaseDetail> {
  const res = await fetch(`${API_BASE_URL}/offboarding/manager/cases/${caseId}`, {
    headers: headers(),
  });
  return handleResponse<OffboardingCaseDetail>(res);
}

export async function initiateTermination(payload: {
  employee_id: string;
  offboarding_type: string;
  reason: string;
  termination_details?: string | null;
  last_working_day: string;
}): Promise<OffboardingCaseSummary> {
  const res = await fetch(`${API_BASE_URL}/offboarding/employee/cases`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      employee_id: payload.employee_id,
      offboarding_type: payload.offboarding_type,
      last_working_day: payload.last_working_day,
      termination: {
        reason: payload.reason,
        termination_details: payload.termination_details ?? null,
      },
    }),
  });
  return handleResponse<OffboardingCaseSummary>(res);
}

export async function acknowledgeCase(caseId: string): Promise<void> {
  const res = await fetch(
    `${API_BASE_URL}/offboarding/manager/cases/${caseId}/status`,
    {
      method: "PATCH",
      headers: headers(),
      body: JSON.stringify({ status: "Manager_Acknowledged" }),
    },
  );
  await handleResponse<unknown>(res);
}

export async function saveKnowledgeTransfer(
  caseId: string,
  notes: string,
  signOff: boolean,
): Promise<void> {
  const res = await fetch(
    `${API_BASE_URL}/offboarding/manager/cases/${caseId}/knowledge-transfer`,
    {
      method: "PATCH",
      headers: headers(),
      body: JSON.stringify({
        transfer_notes: notes,
        ...(signOff ? { action: "sign_off" } : {}),
      }),
    },
  );
  await handleResponse<unknown>(res);
}

// ── HR API ────────────────────────────────────────────────────────────────────

export async function getHRCases(filters?: {
  status?: string;
  offboarding_type?: string;
}): Promise<OffboardingCaseSummary[]> {
  const params = new URLSearchParams();
  if (filters?.status) params.set("status", filters.status);
  if (filters?.offboarding_type) params.set("offboarding_type", filters.offboarding_type);
  const qs = params.toString();
  const res = await fetch(
    `${API_BASE_URL}/offboarding/hr/cases${qs ? `?${qs}` : ""}`,
    { headers: headers() },
  );
  return handleResponse<OffboardingCaseSummary[]>(res);
}

export async function getHRCaseDetail(caseId: string): Promise<OffboardingCaseDetail> {
  const res = await fetch(`${API_BASE_URL}/offboarding/hr/cases/${caseId}`, {
    headers: headers(),
  });
  return handleResponse<OffboardingCaseDetail>(res);
}

export async function getHRFinalPay(caseId: string): Promise<FinalPay> {
  const res = await fetch(
    `${API_BASE_URL}/offboarding/hr/cases/${caseId}/final-pay`,
    { method: "GET", headers: headers() },
  );
  return handleResponse<FinalPay>(res);
}

export async function initiateHROffboarding(payload: {
  employee_id: string;
  offboarding_type: string;
  reason: string;
  termination_details?: string | null;
  last_working_day: string;
}): Promise<OffboardingCaseSummary> {
  const res = await fetch(`${API_BASE_URL}/offboarding/hr/cases`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      employee_id: payload.employee_id,
      offboarding_type: payload.offboarding_type,
      last_working_day: payload.last_working_day,
      termination: {
        reason: payload.reason,
        termination_details: payload.termination_details ?? null,
      },
    }),
  });
  return handleResponse<OffboardingCaseSummary>(res);
}

export async function reviewCase(
  caseId: string,
  action: "Accepted" | "Rejected",
  rejection_reason?: string,
): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/offboarding/hr/cases/${caseId}/review`, {
    method: "PATCH",
    headers: headers(),
    body: JSON.stringify({ action, rejection_reason }),
  });
  await handleResponse<unknown>(res);
}

export async function updateHRCaseStatus(caseId: string, status: string): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/offboarding/hr/cases/${caseId}/status`, {
    method: "PATCH",
    headers: headers(),
    body: JSON.stringify({ status }),
  });
  await handleResponse<unknown>(res);
}

export async function updateChecklistItem(
  caseId: string,
  itemId: string,
  status: string,
): Promise<ChecklistItem> {
  const res = await fetch(
    `${API_BASE_URL}/offboarding/hr/cases/${caseId}/checklist/${itemId}`,
    {
      method: "PATCH",
      headers: headers(),
      body: JSON.stringify({ status }),
    },
  );
  return handleResponse<ChecklistItem>(res);
}

export async function revokeSystemAccess(
  caseId: string,
  accessId: string,
): Promise<SystemAccessItem> {
  const res = await fetch(
    `${API_BASE_URL}/offboarding/hr/cases/${caseId}/system-access/${accessId}/revoke`,
    { method: "PATCH", headers: headers() },
  );
  return handleResponse<SystemAccessItem>(res);
}

export async function updateFinalPay(
  caseId: string,
  payload: {
    salary_balance: number;
    leave_encashment: number;
    additional_pay: number;
    deductions: number;
  },
): Promise<FinalPay> {
  const res = await fetch(`${API_BASE_URL}/offboarding/hr/cases/${caseId}/final-pay`, {
    method: "PUT",
    headers: headers(),
    body: JSON.stringify(payload),
  });
  return handleResponse<FinalPay>(res);
}

export async function releaseFinalPay(caseId: string): Promise<void> {
  const res = await fetch(
    `${API_BASE_URL}/offboarding/hr/cases/${caseId}/final-pay/release`,
    { method: "PATCH", headers: headers() },
  );
  await handleResponse<unknown>(res);
}

export async function confirmBankTransfer(caseId: string): Promise<void> {
  const res = await fetch(
    `${API_BASE_URL}/offboarding/hr/cases/${caseId}/final-pay/confirm-transfer`,
    { method: "POST", headers: headers() },
  );
  await handleResponse<unknown>(res);
}

export async function releaseClearance(caseId: string): Promise<void> {
  const res = await fetch(
    `${API_BASE_URL}/offboarding/hr/cases/${caseId}/clearance-documents/release`,
    {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({}),
    },
  );
  await handleResponse<unknown>(res);
}

export async function triggerJobPosting(caseId: string): Promise<{ job_posting_id: string }> {
  const res = await fetch(
    `${API_BASE_URL}/offboarding/hr/cases/${caseId}/trigger-job-posting`,
    { method: "POST", headers: headers() },
  );
  return handleResponse<{ job_posting_id: string }>(res);
}

// ── Shared ────────────────────────────────────────────────────────────────────

export async function fetchCompanyEmployees(): Promise<EmployeeUser[]> {
  const res = await fetch(`${API_BASE_URL}/users`, { headers: headers() });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const msg = Array.isArray(body?.message) ? body.message.join(", ") : body?.message || `Request failed (${res.status})`;
    throw new Error(msg);
  }
  const data = await res.json().catch(() => []);
  return Array.isArray(data) ? data : (data.users ?? data.data ?? []);
}

export async function updateUserAccountStatus(
  userId: string,
  accountStatus: "Inactive" | "Archived",
): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/users/${userId}`, {
    method: "PATCH",
    headers: headers(),
    body: JSON.stringify({ account_status: accountStatus }),
  });
  await handleResponse<unknown>(res);
}
