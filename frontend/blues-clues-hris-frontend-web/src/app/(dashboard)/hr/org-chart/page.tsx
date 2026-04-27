"use client";

import { useEffect, useMemo, useState } from "react";
import { GitBranch, Loader2, Users } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getDirectorySnapshot, type DirectoryDepartment, type DirectoryRole, type DirectoryUser } from "@/lib/hrDirectoryApi";

type DepartmentGroup = {
  department: DirectoryDepartment | null;
  members: DirectoryUser[];
};

const leadRoleKeywords = ["manager", "head", "lead", "hr officer", "admin", "system admin"];

export default function HROrgChartPage() {
  const [users, setUsers] = useState<DirectoryUser[]>([]);
  const [roles, setRoles] = useState<DirectoryRole[]>([]);
  const [departments, setDepartments] = useState<DirectoryDepartment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getDirectorySnapshot()
      .then((snapshot) => {
        setUsers(snapshot.users);
        setRoles(snapshot.roles);
        setDepartments(snapshot.departments);
      })
      .catch((err) => toast.error(err instanceof Error ? err.message : "Failed to load org chart"))
      .finally(() => setLoading(false));
  }, []);

  const roleMap = useMemo(() => new Map(roles.map((role) => [role.role_id, role.role_name])), [roles]);

  const groupedDepartments = useMemo<DepartmentGroup[]>(() => {
    const departmentMap = new Map<string, DirectoryUser[]>();
    for (const user of users) {
      const key = user.department_id ?? "__unassigned__";
      const rows = departmentMap.get(key) ?? [];
      rows.push(user);
      departmentMap.set(key, rows);
    }

    return [...departmentMap.entries()]
      .map(([key, members]) => ({
        department: key === "__unassigned__" ? null : departments.find((department) => department.department_id === key) ?? null,
        members,
      }))
      .sort((left, right) => {
        const leftName = left.department?.department_name ?? "Unassigned";
        const rightName = right.department?.department_name ?? "Unassigned";
        return leftName.localeCompare(rightName);
      });
  }, [departments, users]);

  const identifyLeads = (members: DirectoryUser[]) =>
    members.filter((member) => {
      const roleName = (roleMap.get(member.role_id ?? "") ?? "").toLowerCase();
      return leadRoleKeywords.some((keyword) => roleName.includes(keyword));
    });

  if (loading) {
    return (
      <div className="min-h-60 flex items-center justify-center gap-2 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span className="text-sm">Loading organization chart...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-[26px] border border-slate-200 bg-[linear-gradient(135deg,#0f172a_0%,#172554_52%,#134e4a_100%)] text-white px-8 py-10 shadow-sm">
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/65 mb-2">HR Operations</p>
        <h1 className="text-2xl font-bold tracking-tight mb-1">Organization Chart</h1>
        <p className="text-sm text-white/75 max-w-2xl">
          Department-level team composition with highlighted reporting leads.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-muted-foreground">Departments</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold">{groupedDepartments.length}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-muted-foreground">Total Members</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold">{users.length}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-muted-foreground">Detected Leads</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold">
            {groupedDepartments.reduce((count, group) => count + identifyLeads(group.members).length, 0)}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {groupedDepartments.map((group) => {
          const leads = identifyLeads(group.members);
          const contributors = group.members.filter((member) => !leads.some((lead) => lead.user_id === member.user_id));

          return (
            <Card key={group.department?.department_id ?? "unassigned"}>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-lg font-bold tracking-tight">
                  <GitBranch className="h-4 w-4 text-primary" />
                  {group.department?.department_name ?? "Unassigned Department"}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.18em] text-muted-foreground mb-2">Leads</p>
                  {leads.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No manager/head role detected in this group yet.</p>
                  ) : (
                    <div className="space-y-2">
                      {leads.map((member) => (
                        <div key={member.user_id} className="rounded-md border bg-primary/5 p-3">
                          <p className="text-sm font-semibold">
                            {member.first_name} {member.last_name}
                          </p>
                          <p className="text-xs text-muted-foreground">{member.email}</p>
                          <Badge className="mt-2" variant="secondary">
                            {roleMap.get(member.role_id ?? "") ?? "Unassigned Role"}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.18em] text-muted-foreground mb-2">Team Members</p>
                  {contributors.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No additional members in this department.</p>
                  ) : (
                    <div className="space-y-2">
                      {contributors.map((member) => (
                        <div key={member.user_id} className="rounded-md border p-3 bg-muted/20">
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <p className="text-sm font-medium">
                                {member.first_name} {member.last_name}
                              </p>
                              <p className="text-xs text-muted-foreground">{member.email}</p>
                            </div>
                            <Badge variant="outline">{roleMap.get(member.role_id ?? "") ?? "Unassigned"}</Badge>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="pt-1 text-xs text-muted-foreground flex items-center gap-2">
                  <Users className="h-3.5 w-3.5" />
                  <span>{group.members.length} total team members</span>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}