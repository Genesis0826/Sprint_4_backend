"use client";

import { useEffect, useMemo, useState } from "react";
import { Building2, Loader2, Save, Users } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getDirectorySnapshot, updateDirectoryUser, type DirectoryDepartment, type DirectoryRole, type DirectoryUser } from "@/lib/hrDirectoryApi";

type RowDraft = {
  role_id: string;
  department_id: string;
  job_position: string;
};

const NONE_ROLE = "__none_role__";
const NONE_DEPARTMENT = "__none_dept__";

export default function HRDirectoryPage() {
  const [users, setUsers] = useState<DirectoryUser[]>([]);
  const [roles, setRoles] = useState<DirectoryRole[]>([]);
  const [departments, setDepartments] = useState<DirectoryDepartment[]>([]);
  const [draftByUser, setDraftByUser] = useState<Record<string, RowDraft>>({});
  const [savingUserId, setSavingUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const roleMap = useMemo(() => new Map(roles.map((role) => [role.role_id, role.role_name])), [roles]);
  const deptMap = useMemo(
    () => new Map(departments.map((department) => [department.department_id, department.department_name])),
    [departments],
  );

  useEffect(() => {
    getDirectorySnapshot()
      .then((snapshot) => {
        setUsers(snapshot.users);
        setRoles(snapshot.roles);
        setDepartments(snapshot.departments);
        const initialDrafts: Record<string, RowDraft> = {};
        for (const user of snapshot.users) {
          initialDrafts[user.user_id] = {
            role_id: user.role_id ?? NONE_ROLE,
            department_id: user.department_id ?? NONE_DEPARTMENT,
            job_position: user.job_position ?? "",
          };
        }
        setDraftByUser(initialDrafts);
      })
      .catch((err) => toast.error(err instanceof Error ? err.message : "Failed to load directory"))
      .finally(() => setLoading(false));
  }, []);

  const updateDraft = (userId: string, patch: Partial<RowDraft>) => {
    setDraftByUser((prev) => ({
      ...prev,
      [userId]: {
        role_id: prev[userId]?.role_id ?? NONE_ROLE,
        department_id: prev[userId]?.department_id ?? NONE_DEPARTMENT,
        job_position: prev[userId]?.job_position ?? "",
        ...patch,
      },
    }));
  };

  const saveUser = async (user: DirectoryUser) => {
    const draft = draftByUser[user.user_id];
    if (!draft) return;

    const nextRole = draft.role_id === NONE_ROLE ? null : draft.role_id;
    const nextDepartment = draft.department_id === NONE_DEPARTMENT ? null : draft.department_id;
    const nextJobPosition = draft.job_position.trim() || null;

    if (nextRole === user.role_id && nextDepartment === user.department_id && nextJobPosition === (user.job_position ?? null)) {
      toast.message("No changes to save.");
      return;
    }

    setSavingUserId(user.user_id);
    try {
      await updateDirectoryUser(user.user_id, {
        role_id: nextRole,
        department_id: nextDepartment,
        job_position: nextJobPosition,
      });

      setUsers((prev) =>
        prev.map((item) =>
          item.user_id === user.user_id
            ? {
                ...item,
                role_id: nextRole,
                department_id: nextDepartment,
                job_position: nextJobPosition,
              }
            : item,
        ),
      );
      toast.success("Directory record updated.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update directory record.");
    } finally {
      setSavingUserId(null);
    }
  };

  if (loading) {
    return (
      <div className="min-h-60 flex items-center justify-center gap-2 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span className="text-sm">Loading employee directory...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-[26px] border border-slate-200 bg-[linear-gradient(135deg,#0f172a_0%,#172554_52%,#134e4a_100%)] text-white px-8 py-10 shadow-sm">
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/65 mb-2">HR Operations</p>
        <h1 className="text-2xl font-bold tracking-tight mb-1">Directory Management</h1>
        <p className="text-sm text-white/75 max-w-2xl">
          Maintain employee role and department assignments with instant save controls.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-muted-foreground">Total Employees</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold">{users.length}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-muted-foreground">Departments</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold">{departments.length}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-muted-foreground">Role Profiles</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold">{roles.length}</CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg font-bold tracking-tight">
            <Users className="h-4 w-4 text-primary" /> Employee Directory
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {users.map((user) => {
            const roleDraft = draftByUser[user.user_id]?.role_id ?? NONE_ROLE;
            const departmentDraft = draftByUser[user.user_id]?.department_id ?? NONE_DEPARTMENT;
            const jobPositionDraft = draftByUser[user.user_id]?.job_position ?? "";
            const saving = savingUserId === user.user_id;
            const accountStatus = user.account_status ?? "Unknown";

            return (
              <div key={user.user_id} className="border rounded-lg p-4 bg-muted/20">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <p className="text-sm font-bold tracking-tight">
                      {user.first_name} {user.last_name}
                    </p>
                    <p className="text-xs text-muted-foreground">{user.email}</p>
                    <div className="mt-2 flex items-center gap-2">
                      <Badge variant="outline">{user.employee_id || "No employee ID"}</Badge>
                      <Badge variant="secondary">{accountStatus}</Badge>
                    </div>
                  </div>

                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 lg:w-full lg:max-w-4xl">
                    <Select value={roleDraft} onValueChange={(value) => updateDraft(user.user_id, { role_id: value })}>
                      <SelectTrigger className="h-9">
                        <SelectValue placeholder="Select role" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NONE_ROLE}>Unassigned</SelectItem>
                        {roles.map((role) => (
                          <SelectItem key={role.role_id} value={role.role_id}>
                            {role.role_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    <Select
                      value={departmentDraft}
                      onValueChange={(value) => updateDraft(user.user_id, { department_id: value })}
                    >
                      <SelectTrigger className="h-9">
                        <SelectValue placeholder="Select department" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NONE_DEPARTMENT}>Unassigned</SelectItem>
                        {departments.map((department) => (
                          <SelectItem key={department.department_id} value={department.department_id}>
                            {department.department_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    <Input
                      value={jobPositionDraft}
                      onChange={(event) => updateDraft(user.user_id, { job_position: event.target.value })}
                      className="h-9"
                      placeholder="Job position"
                    />
                  </div>
                </div>

                <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
                  <div className="flex items-center gap-2">
                    <Building2 className="h-3.5 w-3.5" />
                    <span>Current: {deptMap.get(user.department_id ?? "") ?? "Unassigned"}</span>
                    <span>·</span>
                    <span>Role: {roleMap.get(user.role_id ?? "") ?? "Unassigned"}</span>
                    <span>·</span>
                    <span>Position: {user.job_position || "Unassigned"}</span>
                  </div>
                  <Button size="sm" onClick={() => void saveUser(user)} disabled={saving} className="h-8 px-3">
                    {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                    Save
                  </Button>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}