import { API_BASE_URL } from './api';
import { authFetch } from './authApi';

function jsonHeaders() {
  return { 'Content-Type': 'application/json' };
}

export type ChangeRequest = {
  request_id: string;
  employee_id: string;
  field_type: 'legal_name' | 'bank';
  requested_changes: Record<string, string>;
  reason: string;
  supporting_doc_url: string | null;
  status: 'pending' | 'approved' | 'rejected';
  reviewed_by: string | null;
  review_reason: string | null;
  reviewed_at: string | null;
  created_at: string;
  employee?: { first_name: string; last_name: string; employee_id: string; email: string };
};

export async function submitChangeRequest(dto: {
  field_type: 'legal_name' | 'bank';
  requested_changes: Record<string, string>;
  reason: string;
  supporting_doc_url?: string;
}): Promise<ChangeRequest> {
  const res = await authFetch(`${API_BASE_URL}/users/me/change-requests`, {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify(dto),
  });
  if (!res.ok) throw new Error('Failed to submit change request');
  return res.json();
}

export async function getMyChangeRequests(): Promise<ChangeRequest[]> {
  const res = await authFetch(`${API_BASE_URL}/users/me/change-requests`);
  if (!res.ok) return [];
  return res.json();
}

export async function getHRChangeRequests(status?: string): Promise<ChangeRequest[]> {
  const url = status
    ? `${API_BASE_URL}/users/change-requests?status=${status}`
    : `${API_BASE_URL}/users/change-requests`;
  const res = await authFetch(url);
  if (!res.ok) return [];
  return res.json();
}

export async function reviewChangeRequest(
  requestId: string,
  body: { status: 'approved' | 'rejected'; review_reason: string },
): Promise<ChangeRequest> {
  const res = await authFetch(`${API_BASE_URL}/users/change-requests/${requestId}`, {
    method: 'PATCH',
    headers: jsonHeaders(),
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error('Failed to review change request');
  return res.json();
}
