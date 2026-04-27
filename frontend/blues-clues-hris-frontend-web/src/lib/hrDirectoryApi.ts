import { API_BASE_URL } from "@/lib/api";
import { authFetch } from "@/lib/authApi";

export type DirectoryUser = {
  user_id: string;
  employee_id: string;
  first_name: string;
  last_name: string;
  email: string;
  role_id: string | null;
  department_id: string | null;
  job_position?: string | null;
  account_status?: string | null;
};

export type DirectoryRole = {
  role_id: string;
  role_name: string;
};

export type DirectoryDepartment = {
  department_id: string;
  department_name: string;
};

export async function getDirectorySnapshot(): Promise<{
  users: DirectoryUser[];
  roles: DirectoryRole[];
  departments: DirectoryDepartment[];
}> {
  const [usersRes, rolesRes, departmentsRes] = await Promise.all([
    authFetch(`${API_BASE_URL}/users`),
    authFetch(`${API_BASE_URL}/users/roles`),
    authFetch(`${API_BASE_URL}/users/departments`),
  ]);

  const users = (await usersRes.json().catch(() => [])) as DirectoryUser[];
  const roles = (await rolesRes.json().catch(() => [])) as DirectoryRole[];
  const departments = (await departmentsRes.json().catch(() => [])) as DirectoryDepartment[];

  if (!usersRes.ok) {
    throw new Error((users as { message?: string } & DirectoryUser[])?.message || "Failed to load directory users");
  }
  if (!rolesRes.ok) {
    throw new Error((roles as { message?: string } & DirectoryRole[])?.message || "Failed to load role options");
  }
  if (!departmentsRes.ok) {
    throw new Error((departments as { message?: string } & DirectoryDepartment[])?.message || "Failed to load department options");
  }

  return { users, roles, departments };
}

export async function updateDirectoryUser(
  userId: string,
  payload: { role_id?: string | null; department_id?: string | null; job_position?: string | null },
): Promise<void> {
  const res = await authFetch(`${API_BASE_URL}/users/${userId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data as { message?: string })?.message || "Failed to update employee directory record");
  }
}