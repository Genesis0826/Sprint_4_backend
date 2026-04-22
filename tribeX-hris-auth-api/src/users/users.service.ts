import {
  Injectable,
  BadRequestException,
  ConflictException,
  NotFoundException,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SupabaseService } from '../supabase/supabase.service';
import { MailService } from '../mail/mail.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CreateUserDto } from './dto/create-users.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { CreateChangeRequestDto } from './dto/create-change-request.dto';
import { ReviewChangeRequestDto } from './dto/review-change-request.dto';
import * as crypto from 'node:crypto';

type UserListRow = {
  user_id: string;
  employee_id: string;
  username: string;
  first_name: string;
  last_name: string;
  email: string;
  role_id: string | null;
  department_id: string | null;
  start_date: string | null;
  account_status: string | null;
  avatar_url?: string | null;
};

type RoleRow = {
  role_id: string;
  role_name: string | null;
};

type FeatureRow = {
  feature_id: string;
  feature_name: string | null;
  module_group: string | null;
  is_active: boolean | null;
};

type RoleFeatureRow = {
  role_id: string;
  feature_id: string;
  can_read: boolean | null;
  can_create: boolean | null;
  can_update: boolean | null;
  can_delete: boolean | null;
};

const PERMISSION_COLUMNS = {
  read: 'can_read',
  create: 'can_create',
  update: 'can_update',
  delete: 'can_delete',
} as const;

const PERMISSION_KEYS = Object.keys(
  PERMISSION_COLUMNS,
) as Array<keyof typeof PERMISSION_COLUMNS>;

const ROLE_DISPLAY_ORDER = [
  'System Admin',
  'Admin',
  'HR Officer',
  'HR Recruiter',
  'HR Interviewer',
  'Manager',
  'Group Head',
  'Active Employee',
  'Employee',
  'Applicant',
] as const;

const EXCLUDED_HRIS_ROLE_NAMES = new Set(['System Admin', 'Admin']);

type PermissionKey = keyof typeof PERMISSION_COLUMNS;

type PermissionSet = Record<PermissionKey, boolean>;

type RolePermissionSetting = {
  role_name: string;
  permissions: PermissionSet;
};

type LifecycleModuleSetting = {
  module_id: string;
  name: string;
  description: string;
  icon: string;
  roles: RolePermissionSetting[];
};

type LifecycleModuleDefinition = Omit<LifecycleModuleSetting, 'roles'> & {
  matches: (feature: FeatureRow) => boolean;
};

const normalizeFeatureText = (value: string | null) =>
  value?.trim().toLowerCase() ?? '';

const LIFECYCLE_MODULE_DEFINITIONS: LifecycleModuleDefinition[] = [
  {
    module_id: 'recruitment',
    name: 'Recruitment',
    description: 'Job postings, candidate screening, interviews',
    icon: 'recruitment',
    matches: (feature) => {
      const featureName = normalizeFeatureText(feature.feature_name);
      const moduleGroup = normalizeFeatureText(feature.module_group);
      return (
        featureName === 'recruitment' || moduleGroup === 'recruitment'
      );
    },
  },
  {
    module_id: 'onboarding',
    name: 'Onboarding',
    description: 'New hire paperwork, orientation, training setup',
    icon: 'onboarding',
    matches: (feature) => {
      const featureName = normalizeFeatureText(feature.feature_name);
      const moduleGroup = normalizeFeatureText(feature.module_group);
      return featureName === 'onboarding' || moduleGroup === 'onboarding';
    },
  },
  {
    module_id: 'compensation',
    name: 'Compensation & Benefits',
    description: 'Payroll, benefits administration, salary reviews',
    icon: 'compensation',
    matches: (feature) => {
      const featureName = normalizeFeatureText(feature.feature_name);
      const moduleGroup = normalizeFeatureText(feature.module_group);
      return (
        featureName === 'payroll' ||
        featureName === 'compensation' ||
        moduleGroup === 'compensation'
      );
    },
  },
  {
    module_id: 'performance',
    name: 'Performance Management',
    description: 'Goal setting, appraisals, performance reviews',
    icon: 'performance',
    matches: (feature) => {
      const featureName = normalizeFeatureText(feature.feature_name);
      const moduleGroup = normalizeFeatureText(feature.module_group);
      return featureName === 'performance' || moduleGroup === 'performance';
    },
  },
  {
    module_id: 'offboarding',
    name: 'Offboarding',
    description: 'Exit interviews, clearance, account deactivation',
    icon: 'offboarding',
    matches: (feature) => {
      const featureName = normalizeFeatureText(feature.feature_name);
      const moduleGroup = normalizeFeatureText(feature.module_group);
      return featureName === 'offboarding' || moduleGroup === 'offboarding';
    },
  },
];

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly mailService: MailService,
    private readonly config: ConfigService,
    private readonly auditService: AuditService,
    private readonly notificationsService: NotificationsService,
  ) {}

  // All queries filter by company_id. company_id comes from req.user.

  private buildEmptyPermissionSet(): PermissionSet {
    return {
      read: false,
      create: false,
      update: false,
      delete: false,
    };
  }

  private compareRoleNames(a: string, b: string) {
    const aIndex = ROLE_DISPLAY_ORDER.indexOf(
      a as (typeof ROLE_DISPLAY_ORDER)[number],
    );
    const bIndex = ROLE_DISPLAY_ORDER.indexOf(
      b as (typeof ROLE_DISPLAY_ORDER)[number],
    );

    if (aIndex === -1 && bIndex === -1) return a.localeCompare(b);
    if (aIndex === -1) return 1;
    if (bIndex === -1) return -1;
    return aIndex - bIndex;
  }

  private parseModuleRoleEntry(
    roleEntry: unknown,
    moduleId: string,
    roleNames: string[],
  ): { roleName: string; permissions: PermissionSet } {
    if (!roleEntry || typeof roleEntry !== 'object') {
      throw new BadRequestException(
        `Module "${moduleId}" has an invalid role entry.`,
      );
    }
    const roleRecord = roleEntry as Record<string, unknown>;
    const roleName = roleRecord.role_name;
    if (typeof roleName !== 'string' || !roleName.trim()) {
      throw new BadRequestException(`Module "${moduleId}" is missing a role_name.`);
    }
    if (!roleNames.includes(roleName)) {
      throw new BadRequestException(
        `Module "${moduleId}" includes an unknown role "${roleName}".`,
      );
    }
    const permissions = roleRecord.permissions;
    if (!permissions || typeof permissions !== 'object' || Array.isArray(permissions)) {
      throw new BadRequestException(
        `Module "${moduleId}" must include a permissions object for "${roleName}".`,
      );
    }
    const permissionMap = permissions as Record<string, unknown>;
    const normalizedPermissions = {} as PermissionSet;
    for (const permissionKey of PERMISSION_KEYS) {
      const permVal = permissionMap[permissionKey];
      if (typeof permVal !== 'boolean') {
        throw new BadRequestException(
          `Module "${moduleId}" is missing a boolean "${permissionKey}" permission for "${roleName}".`,
        );
      }
      normalizedPermissions[permissionKey] = permVal;
    }
    return { roleName, permissions: normalizedPermissions };
  }

  private normalizeLifecycleModules(
    input: unknown,
    roleNames: string[],
  ): LifecycleModuleSetting[] {
    if (!Array.isArray(input) || input.length === 0) {
      throw new BadRequestException(
        'Lifecycle permissions must be a non-empty array.',
      );
    }

    const providedById = new Map<string, Record<string, unknown>>();

    for (const item of input) {
      if (!item || typeof item !== 'object') {
        throw new BadRequestException(
          'Each lifecycle permission entry must be an object.',
        );
      }
      const entry = item as Record<string, unknown>;
      const moduleId = entry.module_id;
      if (typeof moduleId !== 'string' || !moduleId.trim()) {
        throw new BadRequestException('Each entry must include a module_id.');
      }
      if (providedById.has(moduleId)) {
        throw new BadRequestException(`Duplicate lifecycle module "${moduleId}" found.`);
      }
      providedById.set(moduleId, entry);
    }

    for (const moduleId of providedById.keys()) {
      if (!LIFECYCLE_MODULE_DEFINITIONS.some((d) => d.module_id === moduleId)) {
        throw new BadRequestException(`Unknown lifecycle module "${moduleId}".`);
      }
    }

    return LIFECYCLE_MODULE_DEFINITIONS.map((defaultModule) => {
      const provided = providedById.get(defaultModule.module_id);
      const providedRoles = Array.isArray(provided?.roles) ? provided.roles : [];

      const providedRolesByName = new Map<string, PermissionSet>();
      for (const roleEntry of providedRoles) {
        const { roleName, permissions } = this.parseModuleRoleEntry(
          roleEntry,
          defaultModule.module_id,
          roleNames,
        );
        if (providedRolesByName.has(roleName)) {
          throw new BadRequestException(
            `Module "${defaultModule.module_id}" includes duplicate role "${roleName}".`,
          );
        }
        providedRolesByName.set(roleName, permissions);
      }

      return {
        ...defaultModule,
        roles: roleNames.map((roleName) => ({
          role_name: roleName,
          permissions: providedRolesByName.get(roleName) ?? this.buildEmptyPermissionSet(),
        })),
      };
    });
  }

  private async validateDepartmentBelongsToCompany(
    supabase: ReturnType<SupabaseService['getClient']>,
    dto: { department_id?: string },
    companyId: string,
  ): Promise<void> {
    if (!dto.department_id) return;
    const { data: departmentRow, error: departmentError } = await supabase
      .from('department')
      .select('department_id, company_id')
      .eq('department_id', dto.department_id)
      .maybeSingle();
    if (departmentError) throw new InternalServerErrorException(departmentError.message);
    if (!departmentRow) throw new BadRequestException('Selected department does not exist.');
    if (departmentRow.company_id && departmentRow.company_id !== companyId) {
      throw new BadRequestException('Selected department belongs to a different company.');
    }
  }

  private async validateRoleBelongsToCompany(
    supabase: ReturnType<SupabaseService['getClient']>,
    roleId: string,
    companyId: string,
  ): Promise<void> {
    const { data: roleRow, error: roleError } = await supabase
      .from('role')
      .select('role_id, company_id')
      .eq('role_id', roleId)
      .maybeSingle();
    if (roleError) throw new InternalServerErrorException(roleError.message);
    if (!roleRow) throw new BadRequestException('Selected role does not exist.');
    if (roleRow.company_id && roleRow.company_id !== companyId) {
      throw new BadRequestException('Selected role belongs to a different company.');
    }
  }

  private normalizeOptionalString(value: unknown): string | null | undefined {
    if (value === undefined) return undefined;
    if (value === null) return null;
    if (typeof value !== 'string') return String(value);
    const normalized = value.trim();
    return normalized.length > 0 ? normalized : null;
  }

  private throwInsertUserError(insertError: { message: string; code?: string }): never {
    const dbCode = (insertError as any)?.code as string | undefined;
    if (dbCode === '23505') {
      throw new ConflictException('A user with the same username or email already exists.');
    }
    if (dbCode === '23503') {
      throw new BadRequestException('Invalid role or department selected.');
    }
    throw new BadRequestException(insertError.message);
  }

  private collectModuleRows(
    module: LifecycleModuleSetting,
    roleGroups: { role_name: string; role_ids: string[] }[],
    moduleFeatureIds: string[],
    rowsToUpsert: RoleFeatureRow[],
  ): void {
    for (const roleSetting of module.roles) {
      const roleGroup = roleGroups.find((g) => g.role_name === roleSetting.role_name);
      if (!roleGroup) continue;
      for (const roleId of roleGroup.role_ids) {
        for (const featureId of moduleFeatureIds) {
          rowsToUpsert.push({
            role_id: roleId,
            feature_id: featureId,
            can_read: roleSetting.permissions.read,
            can_create: roleSetting.permissions.create,
            can_update: roleSetting.permissions.update,
            can_delete: roleSetting.permissions.delete,
          });
        }
      }
    }
  }

  private mapRoleIdsByRoleName(roles: RoleRow[]) {
    const grouped = new Map<string, string[]>();

    for (const role of roles) {
      const roleName = role.role_name?.trim();
      if (!roleName || EXCLUDED_HRIS_ROLE_NAMES.has(roleName)) continue;

      if (!grouped.has(roleName)) {
        grouped.set(roleName, []);
      }

      grouped.get(roleName)?.push(role.role_id);
    }

    return [...grouped.entries()]
      .map(([role_name, role_ids]) => ({
        role_name,
        role_ids,
      }))
      .sort((left, right) =>
        this.compareRoleNames(left.role_name, right.role_name),
      );
  }

  private mapFeatureIdsByModule(features: FeatureRow[]) {
    return Object.fromEntries(
      LIFECYCLE_MODULE_DEFINITIONS.map((module) => [
        module.module_id,
        features
          .filter((feature) => module.matches(feature))
          .map((feature) => feature.feature_id),
      ]),
    ) as Record<string, string[]>;
  }

  async getLifecyclePermissions(companyId: string) {
    if (!companyId) {
      throw new BadRequestException('Your account has no company assignment.');
    }

    const supabase = this.supabaseService.getClient();
    const [{ data: roles, error: rolesError }, { data: features, error: featuresError }] =
      await Promise.all([
        supabase
          .from('role')
          .select('role_id, role_name')
          .eq('company_id', companyId),
        supabase
          .from('feature')
          .select('feature_id, feature_name, module_group, is_active')
          .eq('is_active', true),
      ]);

    if (rolesError) throw new InternalServerErrorException(rolesError.message);
    if (featuresError)
      throw new InternalServerErrorException(featuresError.message);

    const roleGroups = this.mapRoleIdsByRoleName((roles ?? []) as RoleRow[]);
    const featureIdsByModule = this.mapFeatureIdsByModule(
      (features ?? []) as FeatureRow[],
    );
    const allRoleIds = [...new Set(roleGroups.flatMap((group) => group.role_ids))];
    const allFeatureIds = [
      ...new Set(Object.values(featureIdsByModule).flat()),
    ];

    let roleFeatureRows: RoleFeatureRow[] = [];
    if (allRoleIds.length > 0 && allFeatureIds.length > 0) {
      const { data, error } = await supabase
        .from('role_feature')
        .select(
          'role_id, feature_id, can_read, can_create, can_update, can_delete',
        )
        .in('role_id', allRoleIds)
        .in('feature_id', allFeatureIds);

      if (error) {
        throw new InternalServerErrorException(error.message);
      }

      roleFeatureRows = (data ?? []) as RoleFeatureRow[];
    }

    const roleFeatureMap = new Map(
      roleFeatureRows.map((row) => [`${row.role_id}:${row.feature_id}`, row]),
    );

    return LIFECYCLE_MODULE_DEFINITIONS.map((module) => {
      const moduleFeatureIds = featureIdsByModule[module.module_id] ?? [];

      return {
        module_id: module.module_id,
        name: module.name,
        description: module.description,
        icon: module.icon,
        roles: roleGroups.map((roleGroup) => {
          const permissions = {} as PermissionSet;

          for (const permissionKey of PERMISSION_KEYS) {
            const column = PERMISSION_COLUMNS[permissionKey];

            permissions[permissionKey] =
              moduleFeatureIds.length > 0 &&
              roleGroup.role_ids.length > 0 &&
              roleGroup.role_ids.every((roleId) =>
                moduleFeatureIds.every(
                  (featureId) =>
                    roleFeatureMap.get(`${roleId}:${featureId}`)?.[column] ===
                    true,
                ),
              );
          }

          return {
            role_name: roleGroup.role_name,
            permissions,
          };
        }),
      };
    });
  }

  async saveLifecyclePermissions(
    modules: unknown[],
    companyId: string,
    adminUserId: string,
  ) {
    if (!companyId) {
      throw new BadRequestException('Your account has no company assignment.');
    }

    const supabase = this.supabaseService.getClient();

    const [{ data: roles, error: rolesError }, { data: features, error: featuresError }] =
      await Promise.all([
        supabase
          .from('role')
          .select('role_id, role_name')
          .eq('company_id', companyId),
        supabase
          .from('feature')
          .select('feature_id, feature_name, module_group, is_active')
          .eq('is_active', true),
      ]);

    if (rolesError) throw new InternalServerErrorException(rolesError.message);
    if (featuresError)
      throw new InternalServerErrorException(featuresError.message);

    const roleGroups = this.mapRoleIdsByRoleName(
      (roles ?? []) as RoleRow[],
    );
    const roleNames = roleGroups.map((role) => role.role_name);
    const featureIdsByModule = this.mapFeatureIdsByModule(
      (features ?? []) as FeatureRow[],
    );
    const normalizedModules = this.normalizeLifecycleModules(modules, roleNames);

    const rowsToUpsert: RoleFeatureRow[] = [];

    for (const module of normalizedModules) {
      const moduleFeatureIds = featureIdsByModule[module.module_id] ?? [];
      if (moduleFeatureIds.length === 0) {
        throw new BadRequestException(
          `No features are configured in the database for "${module.name}".`,
        );
      }
      this.collectModuleRows(module, roleGroups, moduleFeatureIds, rowsToUpsert);
    }

    if (rowsToUpsert.length > 0) {
      const { error } = await supabase
        .from('role_feature')
        .upsert(rowsToUpsert, { onConflict: 'role_id,feature_id' });

      if (error) {
        throw new InternalServerErrorException(error.message);
      }
    }

    await this.auditService.log(
      'Global lifecycle permissions updated',
      adminUserId,
      companyId,
    );

    return this.getLifecyclePermissions(companyId);
  }

  async getCompanies(companyId?: string) {
    const supabase = this.supabaseService.getClient();
    const baseQuery = supabase
      .from('company')
      .select('company_id, company_name')
      .order('company_name');
    const { data, error } = companyId
      ? await baseQuery.eq('company_id', companyId)
      : await baseQuery;
    if (error) throw new Error(error.message);
    return data ?? [];
  }

  async getCompanyInfo(companyId: string) {
    const supabase = this.supabaseService.getClient();
    const { data, error } = await supabase
      .from('company')
      .select('company_id, company_name, slug')
      .eq('company_id', companyId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) throw new NotFoundException('Company not found');
    return data;
  }

  private async getNextEmployeeNumber(companyId: string): Promise<number> {
    const supabase = this.supabaseService.getClient();

    // Optimistic concurrency control on last_number to avoid duplicates.
    for (let attempt = 0; attempt < 5; attempt++) {
      const { data: seqRow, error: seqReadError } = await supabase
        .from('employee_id_sequence')
        .select('last_number')
        .eq('company_id', companyId)
        .maybeSingle();

      if (seqReadError)
        throw new InternalServerErrorException(seqReadError.message);

      if (!seqRow) {
        const { error: seedError } = await supabase
          .from('employee_id_sequence')
          .insert({ company_id: companyId, last_number: 0 });
        if (seedError && (seedError as any).code !== '23505') {
          throw new InternalServerErrorException(seedError.message);
        }
        continue;
      }

      const current = Number(seqRow.last_number ?? 0);
      const next = current + 1;

      const { data: updatedRow, error: seqUpdateError } = await supabase
        .from('employee_id_sequence')
        .update({ last_number: next })
        .eq('company_id', companyId)
        .eq('last_number', current)
        .select('last_number')
        .maybeSingle();

      if (seqUpdateError)
        throw new InternalServerErrorException(seqUpdateError.message);
      if (updatedRow) return Number(updatedRow.last_number);
    }

    throw new InternalServerErrorException(
      'Could not generate employee number due to concurrent updates. Please try again.',
    );
  }

  private async getInviteExpiryMap(userIds: string[]) {
    if (userIds.length === 0) return {} as Record<string, string | null>;

    const { data, error } = await this.supabaseService
      .getClient()
      .from('user_invites')
      .select('user_id, expires_at')
      .is('used_at', null)
      .in('user_id', userIds)
      .order('expires_at', { ascending: false });

    if (error) throw new Error(error.message);

    const map: Record<string, string | null> = {};
    for (const row of data ?? []) {
      if (!map[row.user_id]) map[row.user_id] = row.expires_at;
    }
    return map;
  }

  private async getLastLoginMap(userIds: string[]) {
    if (userIds.length === 0) return {} as Record<string, string | null>;

    const { data, error } = await this.supabaseService
      .getClient()
      .from('login_history')
      .select('user_id, li_timestamp')
      .eq('status', 'SUCCESS')
      .in('user_id', userIds)
      .order('li_timestamp', { ascending: false });

    if (error) throw new Error(error.message);

    const lastLoginByUser: Record<string, string | null> = {};
    for (const row of data ?? []) {
      if (!lastLoginByUser[row.user_id]) {
        lastLoginByUser[row.user_id] = row.li_timestamp;
      }
    }

    return lastLoginByUser;
  }

  private async inheritDepartmentScheduleForEmployee(
    companyId: string,
    departmentId: string,
    employeeId: string,
    updaterName: string | null,
  ): Promise<void> {
    const supabase = this.supabaseService.getClient();

    const { data: existingSchedule, error: existingScheduleError } = await supabase
      .from('schedules')
      .select('schedule_source')
      .eq('employee_id', employeeId)
      .maybeSingle();

    if (existingScheduleError) {
      throw new Error(existingScheduleError.message);
    }

    if ((existingSchedule as { schedule_source?: string | null } | null)?.schedule_source === 'individual') {
      // Preserve manually-assigned schedules.
      return;
    }

    const { data: departmentMembers, error: departmentMembersError } = await supabase
      .from('user_profile')
      .select('employee_id')
      .eq('company_id', companyId)
      .eq('department_id', departmentId)
      .not('employee_id', 'is', null)
      .neq('employee_id', employeeId)
      .limit(200);

    if (departmentMembersError) {
      throw new Error(departmentMembersError.message);
    }

    const memberEmployeeIds = (departmentMembers ?? [])
      .map((member: { employee_id?: string | null }) => member.employee_id)
      .filter((id): id is string => typeof id === 'string' && id.length > 0);

    if (memberEmployeeIds.length === 0) return;

    const { data: departmentSchedule, error: departmentScheduleError } = await supabase
      .from('schedules')
      .select('start_time, end_time, break_start, break_end, workdays, is_nightshift')
      .in('employee_id', memberEmployeeIds)
      .neq('schedule_source', 'individual')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (departmentScheduleError) {
      throw new Error(departmentScheduleError.message);
    }

    if (!departmentSchedule) return;

    const { error: upsertError } = await supabase.from('schedules').upsert(
      {
        employee_id: employeeId,
        start_time: departmentSchedule.start_time,
        end_time: departmentSchedule.end_time,
        break_start: departmentSchedule.break_start ?? '00:00',
        break_end: departmentSchedule.break_end ?? '00:00',
        workdays: departmentSchedule.workdays,
        is_nightshift: departmentSchedule.is_nightshift ?? false,
        // Use an existing, DB-safe source value for inherited department schedules.
        schedule_source: 'bulk',
        updated_by_name: updaterName,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'employee_id' },
    );

    if (upsertError) {
      throw new Error(upsertError.message);
    }
  }

  async getRoles(companyId: string) {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('role')
      .select('role_id, role_name')
      .eq('company_id', companyId)
      .order('role_name');

    if (error) throw new Error(error.message);
    return data ?? [];
  }

  async createDepartment(name: string, companyId: string, performedBy: string) {
    const supabase = this.supabaseService.getClient();

    const { data, error } = await supabase
      .from('department')
      .insert({ department_name: name, company_id: companyId })
      .select('department_id, department_name')
      .single();

    if (error) {
      if (error.code === '23505') {
        await this.auditService.logIncident(
          `Department creation failed: "${name}" already exists`,
          'WARNING',
          { companyId, performedBy },
        );
        throw new ConflictException(`Department "${name}" already exists`);
      }
      await this.auditService.logIncident(
        `Department creation failed: "${name}" — ${error.message}`,
        'ERROR',
        { companyId, performedBy },
      );
      throw new Error(error.message);
    }

    await this.auditService.log(
      `Department created: "${name}"`,
      performedBy,
      companyId,
    );
    return data;
  }

  async renameDepartment(id: string, name: string, companyId: string, performedBy: string) {
    const supabase = this.supabaseService.getClient();
    const { data, error } = await supabase
      .from('department')
      .update({ department_name: name })
      .eq('department_id', id)
      .eq('company_id', companyId)
      .select('department_id, department_name')
      .single();
    if (error) throw new Error(error.message);
    if (!data) throw new NotFoundException('Department not found.');
    await this.auditService.log(
      `Department renamed to "${name}"`,
      performedBy,
      companyId,
    );
    return data;
  }

  async deleteDepartment(id: string, companyId: string, performedBy: string) {
    const supabase = this.supabaseService.getClient();

    // Fetch name before deletion so the audit log is human-readable
    const { data: dept } = await supabase
      .from('department')
      .select('department_name')
      .eq('department_id', id)
      .eq('company_id', companyId)
      .single();

    // Unassign all users in this department first
    await supabase
      .from('user_profile')
      .update({ department_id: null })
      .eq('department_id', id)
      .eq('company_id', companyId);

    const { error } = await supabase
      .from('department')
      .delete()
      .eq('department_id', id)
      .eq('company_id', companyId);
    if (error) throw new Error(error.message);
    await this.auditService.log(
      `Department deleted: "${dept?.department_name ?? 'Unknown'}"`,
      performedBy,
      companyId,
    );
    return { deleted: true };
  }

  async getDepartments(companyId: string) {
    if (!companyId) return [];
    const { data, error } = await this.supabaseService
      .getClient()
      .from('department')
      .select('department_id, department_name')
      .eq('company_id', companyId)
      .order('department_name');
    if (error) throw new Error(error.message);
    return data ?? [];
  }

  async findAll(companyId: string) {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('user_profile')
      .select(
        'user_id, employee_id, username, first_name, last_name, email, role_id, department_id, start_date, account_status, avatar_url',
      )
      .eq('company_id', companyId)
      .order('first_name');

    if (error) throw new Error(error.message);

    const users = (data ?? []) as UserListRow[];
    const userIds = users.map((user) => user.user_id);

    const [lastLoginByUser, inviteExpiryByUser] = await Promise.all([
      this.getLastLoginMap(userIds),
      this.getInviteExpiryMap(userIds),
    ]);

    return users.map((user) => ({
      ...user,
      last_login: lastLoginByUser[user.user_id] ?? null,
      invite_expires_at: inviteExpiryByUser[user.user_id] ?? null,
    }));
  }

  async findOne(id: string, companyId: string) {
    const supabase = this.supabaseService.getClient();
    const { data, error } = await supabase
      .from('user_profile')
      .select(
        'user_id, employee_id, username, first_name, middle_name, last_name, email, role_id, department_id, start_date, account_status, personal_email, date_of_birth, place_of_birth, nationality, civil_status, complete_address, bank_name, bank_account_number, bank_account_name, avatar_url, emergency_contacts',
      )
      .eq('user_id', id)
      .eq('company_id', companyId)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!data) return data;

    const lastLoginByUser = await this.getLastLoginMap([id]);

    // If user_profile has no contacts yet, fall back to staging (covers pre-migration employees)
    let emergency_contacts = Array.isArray((data as any).emergency_contacts) ? (data as any).emergency_contacts : [];
    if (emergency_contacts.length === 0) {
      const staging = await this.resolveOnboardingStaging(id, data.email);
      emergency_contacts = this.extractEmergencyContacts(staging);
    }

    return {
      ...data,
      last_login: lastLoginByUser[id] ?? null,
      emergency_contacts,
    };
  }

  async stats(companyId: string) {
    const { count, error } = await this.supabaseService
      .getClient()
      .from('user_profile')
      .select('*', { count: 'exact', head: true })
      .eq('company_id', companyId);

    if (error) throw new Error(error.message);
    return { total: count ?? 0 };
  }

  async create(
    dto: CreateUserDto,
    companyId: string,
    adminUserId: string,
  ) {
    const supabase = this.supabaseService.getClient();
    const user_id = crypto.randomUUID();
    const email = dto.email.trim();

    const nextNumber = await this.getNextEmployeeNumber(companyId);
    const employee_id = `empno-${String(nextNumber).padStart(5, '0')}`;

    const { data: existingUsername } = await supabase
      .from('user_profile')
      .select('user_id')
      .eq('username', dto.username)
      .maybeSingle();

    if (existingUsername) {
      throw new ConflictException(
        `Username "${dto.username}" is already taken`,
      );
    }

    const { data: roleRow, error: roleError } = await supabase
      .from('role')
      .select('role_id, company_id')
      .eq('role_id', dto.role_id)
      .maybeSingle();
    if (roleError) throw new InternalServerErrorException(roleError.message);
    if (!roleRow)
      throw new BadRequestException('Selected role does not exist.');
    if (roleRow.company_id && roleRow.company_id !== companyId) {
      throw new BadRequestException(
        'Selected role belongs to a different company.',
      );
    }

    await this.validateDepartmentBelongsToCompany(supabase, dto, companyId);

    const { error: insertError } = await supabase.from('user_profile').insert({
      user_id,
      email,
      first_name: dto.first_name,
      last_name: dto.last_name,
      role_id: dto.role_id,
      company_id: companyId,
      employee_id,
      username: dto.username,
      account_status: 'Pending',
      ...(dto.department_id ? { department_id: dto.department_id } : {}),
      ...(dto.start_date ? { start_date: dto.start_date } : {}),
    });

    if (insertError) {
      this.throwInsertUserError(insertError);
    }

    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();

    const { error: inviteError } = await supabase.from('user_invites').insert({
      invite_id: crypto.randomUUID(),
      user_id,
      token_hash: tokenHash,
      expires_at: expiresAt,
    });

    if (inviteError)
      throw new InternalServerErrorException(inviteError.message);

    const appUrl =
      this.config.get<string>('APP_URL') ?? 'http://localhost:3000';
    const inviteLink = `${appUrl}/set-password?token=${rawToken}`;

    try {
      await this.mailService.sendInvite(email, inviteLink);
    } catch (emailError) {
      console.log('[create] email error:', emailError?.message ?? emailError);
      console.log('==========================================');
      console.log('DEV MODE - invite link (copy and open in browser):');
      console.log(`Invite recipient: ${email}`);
      console.log(inviteLink);
      console.log('==========================================');
    }

    await this.auditService.log(
      `User created: ${email}`,
      adminUserId,
      companyId,
      user_id,
    );

    return {
      user_id,
      employee_id,
      email,
      username: dto.username,
      invite_expires_at: expiresAt,
    };
  }

  async update(
    id: string,
    dto: UpdateUserDto,
    companyId: string,
    adminUserId: string,
  ) {
    const supabase = this.supabaseService.getClient();

    const { data: user, error: findError } = await supabase
      .from('user_profile')
      .select(
        'user_id, email, first_name, last_name, role_id, department_id, start_date',
      )
      .eq('user_id', id)
      .eq('company_id', companyId)
      .maybeSingle();

    if (findError) throw new BadRequestException(findError.message);
    if (!user) throw new NotFoundException('User not found in your company');

    const updates: Record<string, any> = {};
    const normalizedFirstName = this.normalizeOptionalString(dto.first_name);
    const normalizedLastName = this.normalizeOptionalString(dto.last_name);
    const normalizedRoleId = this.normalizeOptionalString(dto.role_id);
    const normalizedDepartmentId = this.normalizeOptionalString(
      dto.department_id,
    );
    const normalizedStartDate = this.normalizeOptionalString(dto.start_date);

    if (normalizedFirstName !== undefined) {
      if (!normalizedFirstName) {
        throw new BadRequestException('first_name cannot be empty.');
      }
      updates.first_name = normalizedFirstName;
    }

    if (normalizedLastName !== undefined) {
      if (!normalizedLastName) {
        throw new BadRequestException('last_name cannot be empty.');
      }
      updates.last_name = normalizedLastName;
    }

    if (normalizedRoleId !== undefined) {
      if (!normalizedRoleId) {
        throw new BadRequestException('role_id is required.');
      }
      await this.validateRoleBelongsToCompany(supabase, normalizedRoleId, companyId);
      updates.role_id = normalizedRoleId;
    }

    if (normalizedDepartmentId !== undefined) {
      if (normalizedDepartmentId) {
        await this.validateDepartmentBelongsToCompany(
          supabase,
          { department_id: normalizedDepartmentId },
          companyId,
        );
      }
      updates.department_id = normalizedDepartmentId;
    }

    if (normalizedStartDate !== undefined) {
      updates.start_date = normalizedStartDate;
    }

    // Extended profile fields (System Admin only; HR can read but not write these via admin update)
    const extendedFields = [
      'middle_name', 'personal_email', 'date_of_birth', 'place_of_birth',
      'nationality', 'civil_status', 'complete_address',
      'bank_name', 'bank_account_number', 'bank_account_name',
    ] as const;
    for (const field of extendedFields) {
      if (dto[field] !== undefined) {
        updates[field] = dto[field] ?? null;
      }
    }

    if (Object.keys(updates).length === 0) {
      return { message: 'No fields to update' };
    }

    const { data: updatedUser, error: updateError } = await supabase
      .from('user_profile')
      .update(updates)
      .eq('user_id', id)
      .eq('company_id', companyId)
      .select(
        'user_id, employee_id, username, first_name, middle_name, last_name, email, role_id, department_id, start_date, account_status, personal_email, date_of_birth, place_of_birth, nationality, civil_status, complete_address, bank_name, bank_account_number, bank_account_name, avatar_url',
      )
      .maybeSingle();

    if (updateError) throw new BadRequestException(updateError.message);
    if (!updatedUser)
      throw new NotFoundException('User not found in your company');

    if (normalizedDepartmentId !== undefined && updatedUser.employee_id) {
      try {
        const { data: updater } = await supabase
          .from('user_profile')
          .select('first_name, last_name')
          .eq('user_id', adminUserId)
          .maybeSingle();

        const updaterName = updater
          ? `${updater.first_name ?? ''} ${updater.last_name ?? ''}`.trim() || null
          : null;

        if (normalizedDepartmentId) {
          await this.inheritDepartmentScheduleForEmployee(
            companyId,
            normalizedDepartmentId,
            updatedUser.employee_id,
            updaterName,
          );
        }
      } catch (scheduleError) {
        this.logger.warn(
          `Could not sync department schedule for user ${id}: ${
            scheduleError instanceof Error ? scheduleError.message : String(scheduleError)
          }`,
        );
      }
    }

    const changes = Object.keys(updates)
      .map((field) => {
        const before = user[field] ?? null;
        const after = updates[field] ?? null;
        return `${field}: "${before}" -> "${after}"`;
      })
      .join(', ');

    await this.auditService.log(
      `User profile updated: ${user.email} - ${changes}`,
      adminUserId,
      companyId,
      id,
    );

    const [lastLoginByUser, inviteExpiryByUser] = await Promise.all([
      this.getLastLoginMap([id]),
      this.getInviteExpiryMap([id]),
    ]);

    return {
      ...updatedUser,
      last_login: lastLoginByUser[id] ?? null,
      invite_expires_at: inviteExpiryByUser[id] ?? null,
    };
  }

  async remove(id: string, companyId: string, adminUserId: string) {
    const supabase = this.supabaseService.getClient();

    const { data: user, error: findError } = await supabase
      .from('user_profile')
      .select('user_id, email')
      .eq('user_id', id)
      .eq('company_id', companyId)
      .maybeSingle();

    if (findError) throw new BadRequestException(findError.message);
    if (!user) throw new NotFoundException('User not found in your company');

    const { error: deactivateError } = await supabase
      .from('user_profile')
      .update({ account_status: 'Inactive' })
      .eq('user_id', id)
      .eq('company_id', companyId);

    if (deactivateError) throw new BadRequestException(deactivateError.message);

    // Revoke all active refresh sessions so the user is immediately logged out
    await supabase
      .from('refresh_session')
      .update({ revoked_at: new Date().toISOString() })
      .eq('user_id', id)
      .is('revoked_at', null);

    await this.auditService.log(
      `User deactivated: ${user.email}`,
      adminUserId,
      companyId,
      id,
    );

    return { message: 'User deactivated successfully' };
  }

  async assignCompanyEmail(userId: string, newEmail: string, companyId: string, adminUserId: string) {
    const supabase = this.supabaseService.getClient();

    const { data: user, error: findError } = await supabase
      .from('user_profile')
      .select('user_id, email, personal_email')
      .eq('user_id', userId)
      .eq('company_id', companyId)
      .maybeSingle();

    if (findError) throw new BadRequestException(findError.message);
    if (!user) throw new NotFoundException('Employee not found in your company');

    // Ensure no other employee already uses this email
    const { data: taken } = await supabase
      .from('user_profile')
      .select('user_id')
      .eq('email', newEmail)
      .neq('user_id', userId)
      .maybeSingle();

    if (taken) throw new ConflictException('This email is already in use by another employee');

    await supabase.from('user_profile').update({ email: newEmail }).eq('user_id', userId);

    // Revoke active sessions so the employee must log in again with the new email
    await supabase
      .from('refresh_session')
      .update({ revoked_at: new Date().toISOString() })
      .eq('user_id', userId)
      .is('revoked_at', null);

    await this.auditService.log(
      `Company email assigned: ${user.email} → ${newEmail}`,
      adminUserId,
      companyId,
      userId,
    );

    return { message: 'Company email assigned successfully', email: newEmail };
  }

  async resendInvite(id: string, companyId: string, adminUserId: string) {
    const supabase = this.supabaseService.getClient();

    const { data: user, error: findError } = await supabase
      .from('user_profile')
      .select('user_id, email, account_status, password_hash')
      .eq('user_id', id)
      .eq('company_id', companyId)
      .maybeSingle();

    if (findError) throw new BadRequestException(findError.message);
    if (!user) throw new NotFoundException('User not found in your company');
    if (user.account_status === 'Inactive')
      throw new BadRequestException('Cannot resend invite to a deactivated account.');
    if (user.password_hash)
      throw new BadRequestException('User has already activated their account.');

    // Revoke all existing unused invites
    await supabase
      .from('user_invites')
      .delete()
      .eq('user_id', id)
      .is('used_at', null);

    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();

    const { error: inviteError } = await supabase.from('user_invites').insert({
      invite_id: crypto.randomUUID(),
      user_id: id,
      token_hash: tokenHash,
      expires_at: expiresAt,
    });

    if (inviteError) throw new InternalServerErrorException(inviteError.message);

    const appUrl = this.config.get<string>('APP_URL') ?? 'http://localhost:3000';
    const inviteLink = `${appUrl}/set-password?token=${rawToken}`;

    try {
      await this.mailService.sendInvite(user.email, inviteLink);
    } catch (emailError) {
      console.log('[resendInvite] email error:', emailError?.message ?? emailError);
      console.log('==========================================');
      console.log('DEV MODE - invite link (copy and open in browser):');
      console.log(`Invite recipient: ${user.email}`);
      console.log(inviteLink);
      console.log('==========================================');
    }

    await this.auditService.log(
      `Invite resent to: ${user.email}`,
      adminUserId,
      companyId,
      id,
    );

    return { message: `Invite resent to ${user.email}.`, invite_expires_at: expiresAt };
  }

  async reactivate(id: string, companyId: string, adminUserId: string) {
    const supabase = this.supabaseService.getClient();

    const { data: user, error: findError } = await supabase
      .from('user_profile')
      .select('user_id, email, account_status, password_hash')
      .eq('user_id', id)
      .eq('company_id', companyId)
      .maybeSingle();

    if (findError) throw new BadRequestException(findError.message);
    if (!user) throw new NotFoundException('User not found in your company');
    if (user.account_status !== 'Inactive')
      throw new BadRequestException('User is not inactive');

    const nextStatus = user.password_hash ? 'Active' : 'Pending';

    const { error: updateError } = await supabase
      .from('user_profile')
      .update({ account_status: nextStatus })
      .eq('user_id', id)
      .eq('company_id', companyId);

    if (updateError) throw new BadRequestException(updateError.message);

    await this.auditService.log(
      `User reactivated: ${user.email} -> ${nextStatus}`,
      adminUserId,
      companyId,
      id,
    );

    return { message: `User reactivated successfully as ${nextStatus}` };
  }

  private async resolveOnboardingStaging(userId: string, userEmail: string): Promise<any | null> {
    const supabase = this.supabaseService.getClient();

    // Primary: session already re-linked to userId
    let { data: session } = await supabase
      .from('onboarding_sessions')
      .select('session_id')
      .eq('account_id', userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    // Fallback: pre-fix converted employees whose session still points to applicant_id
    if (!session) {
      const { data: applicant } = await supabase
        .from('applicant_profile')
        .select('applicant_id')
        .eq('email', userEmail)
        .eq('status', 'converted_employee')
        .maybeSingle();

      if (applicant) {
        const { data: fallback } = await supabase
          .from('onboarding_sessions')
          .select('session_id')
          .eq('account_id', applicant.applicant_id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (fallback) {
          session = fallback;
          // Auto-heal: re-link so future calls hit the primary path
          await supabase
            .from('onboarding_sessions')
            .update({ account_id: userId })
            .eq('session_id', fallback.session_id);
        }
      }
    }

    if (!session) return null;

    const { data: staging } = await supabase
      .from('employee_staging')
      .select('*')
      .eq('session_id', session.session_id)
      .maybeSingle();

    return staging ?? null;
  }

  private extractEmergencyContacts(staging: any): any[] {
    if (!staging) return [];
    if (Array.isArray(staging.emergency_contacts) && staging.emergency_contacts.length > 0) {
      return staging.emergency_contacts;
    }
    if (staging.contact_name) {
      return [{
        contact_name: staging.contact_name,
        relationship: staging.relationship ?? '',
        emergency_phone_number: staging.emergency_phone_number ?? '',
        emergency_email_address: staging.emergency_email_address ?? null,
      }];
    }
    return [];
  }

  async getMe(userId: string) {
    const supabase = this.supabaseService.getClient();
    const { data, error } = await supabase
      .from('user_profile')
      .select(
        'user_id, employee_id, first_name, middle_name, last_name, email, username, department_id, department:department_id(department_name), start_date, personal_email, date_of_birth, place_of_birth, nationality, civil_status, complete_address, bank_name, bank_account_number, bank_account_name, avatar_url, emergency_contacts',
      )
      .eq('user_id', userId)
      .maybeSingle();
    if (error || !data) throw new NotFoundException('Profile not found');

    const patch: Record<string, any> = {};

    // Auto-heal from staging: fill null profile fields + migrate contacts into user_profile
    const staging = await this.resolveOnboardingStaging(userId, data.email);
    if (staging) {
      if (!data.middle_name      && staging.middle_name)       patch.middle_name      = staging.middle_name;
      if (!data.personal_email   && staging.email_address)     patch.personal_email   = staging.email_address;
      if (!data.date_of_birth    && staging.date_of_birth)     patch.date_of_birth    = staging.date_of_birth;
      if (!data.place_of_birth   && staging.place_of_birth)    patch.place_of_birth   = staging.place_of_birth;
      if (!data.nationality      && staging.nationality)        patch.nationality      = staging.nationality;
      if (!data.civil_status     && staging.civil_status)       patch.civil_status     = staging.civil_status;
      if (!data.complete_address && staging.complete_address)   patch.complete_address = staging.complete_address;

      // Migrate emergency contacts from staging into user_profile if not yet stored there
      const storedContacts = Array.isArray((data as any).emergency_contacts) ? (data as any).emergency_contacts : [];
      if (storedContacts.length === 0) {
        const fromStaging = this.extractEmergencyContacts(staging);
        if (fromStaging.length > 0) patch.emergency_contacts = fromStaging;
      }
    }

    if (Object.keys(patch).length > 0) {
      await supabase.from('user_profile').update(patch).eq('user_id', userId);
      Object.assign(data, patch);
    }

    const departmentRelation = (data as any).department;
    const rawDepartmentName = Array.isArray(departmentRelation)
      ? departmentRelation[0]?.department_name
      : departmentRelation?.department_name;
    const department_name =
      typeof rawDepartmentName === 'string' && rawDepartmentName.trim()
        ? rawDepartmentName.trim()
        : null;

    return {
      ...data,
      department_name,
    };
  }

  async updateEmergencyContacts(userId: string, contacts: Array<{
    contact_name: string;
    relationship: string;
    emergency_phone_number: string;
    emergency_email_address?: string;
  }>) {
    const supabase = this.supabaseService.getClient();

    // Primary: write directly to user_profile (works for ALL employees)
    const { error } = await supabase
      .from('user_profile')
      .update({ emergency_contacts: contacts })
      .eq('user_id', userId);

    if (error) throw new InternalServerErrorException('Failed to update emergency contacts');

    // Also sync to employee_staging if a session exists (keeps staging consistent)
    try {
      const { data: userRow } = await supabase
        .from('user_profile').select('email').eq('user_id', userId).maybeSingle();
      if (userRow) {
        const staging = await this.resolveOnboardingStaging(userId, userRow.email);
        if (staging) {
          const first = contacts[0];
          await supabase.from('employee_staging').update({
            emergency_contacts: contacts,
            contact_name: first?.contact_name ?? '',
            relationship: first?.relationship ?? '',
            emergency_phone_number: first?.emergency_phone_number ?? '',
            emergency_email_address: first?.emergency_email_address ?? null,
          }).eq('session_id', staging.session_id);
        }
      }
    } catch {
      // non-fatal: staging sync failure doesn't block the save
    }

    return { message: 'Emergency contacts updated', emergency_contacts: contacts };
  }

  async updateMe(userId: string, body: {
    middle_name?: string;
    personal_email?: string;
    date_of_birth?: string;
    place_of_birth?: string;
    nationality?: string;
    civil_status?: string;
    complete_address?: string;
    bank_name?: string;
    bank_account_number?: string;
    bank_account_name?: string;
    avatar_url?: string;
  }) {
    const allowed = ['middle_name','personal_email','date_of_birth','place_of_birth','nationality','civil_status','complete_address','bank_name','bank_account_number','bank_account_name','avatar_url'];
    const patch: Record<string,any> = {};
    for (const key of allowed) {
      if (body[key as keyof typeof body] !== undefined) patch[key] = body[key as keyof typeof body];
    }
    if (Object.keys(patch).length === 0) return { message: 'Nothing to update' };

    const supabase = this.supabaseService.getClient();
    const { data, error } = await supabase
      .from('user_profile')
      .update(patch)
      .eq('user_id', userId)
      .select('user_id, employee_id, first_name, middle_name, last_name, email, username, department_id, start_date, personal_email, date_of_birth, place_of_birth, nationality, civil_status, complete_address, bank_name, bank_account_number, bank_account_name, avatar_url')
      .maybeSingle();
    if (error) throw new InternalServerErrorException('Failed to update profile');
    return data;
  }

  // ─── B2: Onboarding staging import ─────────────────────────────────────────

  async getOnboardingStaging(userId: string) {
    const supabase = this.supabaseService.getClient();

    // The onboarding session was originally created with account_id = applicant_id,
    // then re-linked to the new user_id after approval. Look up by current user_id.
    const { data: session } = await supabase
      .from('onboarding_sessions')
      .select('session_id')
      .eq('account_id', userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!session) throw new NotFoundException('No onboarding session found for this account.');

    const { data: staging } = await supabase
      .from('employee_staging')
      .select('first_name, last_name, middle_name, phone_number, complete_address, date_of_birth, place_of_birth, nationality, civil_status, email_address')
      .eq('session_id', session.session_id)
      .maybeSingle();

    if (!staging) throw new NotFoundException('No onboarding staging data found.');

    return {
      first_name:       staging.first_name       ?? null,
      last_name:        staging.last_name        ?? null,
      middle_name:      staging.middle_name      ?? null,
      phone_number:     staging.phone_number     ?? null,
      complete_address: staging.complete_address ?? null,
      date_of_birth:    staging.date_of_birth    ?? null,
      place_of_birth:   staging.place_of_birth   ?? null,
      nationality:      staging.nationality      ?? null,
      civil_status:     staging.civil_status     ?? null,
      personal_email:   staging.email_address    ?? null,
    };
  }

  // =========================================================
  // EMPLOYEE DOCUMENTS
  // =========================================================

  async getMyDocuments(userId: string) {
    const supabase = this.supabaseService.getClient();

    const { data, error } = await supabase
      .from('employee_documents')
      .select('*')
      .eq('user_id', userId)
      .order('uploaded_at', { ascending: false });

    if (error) throw new BadRequestException(error.message);

    // Generate fresh signed URLs for file_path entries that look like storage paths
    const withUrls = await Promise.all(
      (data || []).map(async (doc: any) => {
        if (doc.file_path && !doc.file_path.startsWith('http')) {
          const { data: urlData } = await supabase.storage
            .from('employee-documents')
            .createSignedUrl(doc.file_path, 60 * 60 * 24 * 7);
          return { ...doc, file_url: urlData?.signedUrl || null };
        }
        // Onboarding-seeded docs store the URL directly in file_path
        return { ...doc, file_url: doc.file_path };
      }),
    );

    return withUrls;
  }

  async uploadEmployeeDocument(userId: string, docType: string, file: Express.Multer.File) {
    if (!file) throw new BadRequestException('No file uploaded.');

    const allowed = [
      'application/pdf',
      'image/jpeg',
      'image/png',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ];
    if (!allowed.includes(file.mimetype)) {
      throw new BadRequestException('Invalid file type. Allowed: PDF, JPG, PNG, DOC, DOCX.');
    }
    if (file.size > 5 * 1024 * 1024) {
      throw new BadRequestException('File too large. Maximum 5 MB.');
    }

    const supabase = this.supabaseService.getClient();
    const filePath = `${userId}/${docType}/${Date.now()}_${file.originalname}`;

    const { error: uploadErr } = await supabase.storage
      .from('employee-documents')
      .upload(filePath, file.buffer, { contentType: file.mimetype });

    if (uploadErr) throw new BadRequestException(`Upload failed: ${uploadErr.message}`);

    const { data: urlData } = await supabase.storage
      .from('employee-documents')
      .createSignedUrl(filePath, 60 * 60 * 24 * 7);

    const { data, error } = await supabase
      .from('employee_documents')
      .insert({
        id: crypto.randomUUID(),
        user_id: userId,
        document_type: docType,
        file_path: filePath,
        file_name: file.originalname,
        file_size: file.size,
        status: 'pending',
        uploaded_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) throw new BadRequestException(error.message);
    return { ...data, file_url: urlData?.signedUrl || null };
  }

  async deleteEmployeeDocument(userId: string, docId: string) {
    const supabase = this.supabaseService.getClient();

    const { data: doc } = await supabase
      .from('employee_documents')
      .select('*')
      .eq('id', docId)
      .eq('user_id', userId)
      .maybeSingle();

    if (!doc) throw new NotFoundException('Document not found.');
    if (doc.status === 'approved') {
      throw new BadRequestException('Cannot delete an approved document.');
    }

    // Only delete from storage if it's a real storage path (not a seeded URL)
    if (doc.file_path && !doc.file_path.startsWith('http')) {
      await supabase.storage.from('employee-documents').remove([doc.file_path]);
    }

    const { error } = await supabase
      .from('employee_documents')
      .delete()
      .eq('id', docId);

    if (error) throw new BadRequestException(error.message);
    return { message: 'Document deleted' };
  }

  async approveEmployeeDocument(docId: string, reviewerId: string) {
    const supabase = this.supabaseService.getClient();

    const { error } = await supabase
      .from('employee_documents')
      .update({
        status: 'approved',
        reviewed_by: reviewerId,
        reviewed_at: new Date().toISOString(),
        hr_notes: null,
      })
      .eq('id', docId);

    if (error) throw new BadRequestException(error.message);
    return { message: 'Document approved', id: docId };
  }

  async rejectEmployeeDocument(docId: string, reviewerId: string, hrNotes: string) {
    const supabase = this.supabaseService.getClient();

    const { error } = await supabase
      .from('employee_documents')
      .update({
        status: 'rejected',
        reviewed_by: reviewerId,
        reviewed_at: new Date().toISOString(),
        hr_notes: hrNotes,
      })
      .eq('id', docId);

    if (error) throw new BadRequestException(error.message);
    return { message: 'Document rejected', id: docId };
  }

  async getPendingEmployeeDocuments(companyId: string) {
    const supabase = this.supabaseService.getClient();

    // Get all user_ids belonging to this company first, then filter documents directly
    const { data: companyUsers, error: usersError } = await supabase
      .from('user_profile')
      .select('user_id')
      .eq('company_id', companyId);

    if (usersError) throw new BadRequestException(usersError.message);

    const userIds = (companyUsers || []).map((u: any) => u.user_id);
    if (userIds.length === 0) return [];

    const { data, error } = await supabase
      .from('employee_documents')
      .select('*')
      .in('user_id', userIds)
      .eq('status', 'pending')
      .order('uploaded_at', { ascending: true });

    if (error) throw new BadRequestException(error.message);

    // Enrich each doc with user_profile and signed URL
    const withUrls = await Promise.all(
      (data || []).map(async (doc: any) => {
        const { data: profile } = await supabase
          .from('user_profile')
          .select('user_id, first_name, last_name, employee_id')
          .eq('user_id', doc.user_id)
          .single();

        let fileUrl = doc.file_path;
        if (doc.file_path && !doc.file_path.startsWith('http')) {
          const { data: urlData } = await supabase.storage
            .from('employee-documents')
            .createSignedUrl(doc.file_path, 60 * 60 * 24);
          fileUrl = urlData?.signedUrl || doc.file_path;
        }
        return { ...doc, user_profile: profile ?? null, file_url: fileUrl };
      }),
    );

    return withUrls;
  }

  // ─── B3: Document replacement request ──────────────────────────────────────

  async submitDocumentReplacement(
    userId: string,
    docId: string,
    reason: string,
    file: Express.Multer.File,
    proofFile?: Express.Multer.File,
  ) {
    const supabase = this.supabaseService.getClient();

    // Verify ownership and approved status
    const { data: doc, error: docErr } = await supabase
      .from('employee_documents')
      .select('id, user_id, status, document_type')
      .eq('id', docId)
      .eq('user_id', userId)
      .maybeSingle();

    if (docErr) throw new InternalServerErrorException(docErr.message);
    if (!doc) throw new NotFoundException('Document not found.');
    if (doc.status !== 'approved')
      throw new BadRequestException('Only approved documents can be replaced.');

    // Reject if a pending replacement already exists
    const { data: existing } = await supabase
      .from('document_replacement_requests')
      .select('id')
      .eq('document_id', docId)
      .eq('status', 'pending')
      .maybeSingle();

    if (existing) throw new ConflictException('A replacement request is already pending for this document.');

    // Upload new file to employee-documents/replacements/
    const filePath = `${userId}/replacements/${Date.now()}_${file.originalname}`;
    const { error: uploadErr } = await supabase.storage
      .from('employee-documents')
      .upload(filePath, file.buffer, { contentType: file.mimetype, upsert: false });
    if (uploadErr) throw new InternalServerErrorException(`File upload failed: ${uploadErr.message}`);

    const { data: urlData } = supabase.storage.from('employee-documents').getPublicUrl(filePath);
    const newFileUrl = urlData.publicUrl;

    // Upload optional proof file
    let proofUrl: string | null = null;
    if (proofFile) {
      const proofPath = `${userId}/replacements/proof_${Date.now()}_${proofFile.originalname}`;
      const { error: proofUploadErr } = await supabase.storage
        .from('employee-documents')
        .upload(proofPath, proofFile.buffer, { contentType: proofFile.mimetype, upsert: false });
      if (!proofUploadErr) {
        proofUrl = supabase.storage.from('employee-documents').getPublicUrl(proofPath).data.publicUrl;
      }
    }

    const { data: request, error: insertErr } = await supabase
      .from('document_replacement_requests')
      .insert({
        id: crypto.randomUUID(),
        document_id: docId,
        employee_id: userId,
        new_file_url: newFileUrl,
        new_file_path: filePath,
        reason,
        proof_url: proofUrl,
        status: 'pending',
        created_at: new Date().toISOString(),
      })
      .select('id, status')
      .single();

    if (insertErr) throw new InternalServerErrorException(insertErr.message);

    return { replacement_request_id: request.id, status: 'pending' };
  }

  // =========================================================
  // PROFILE CHANGE REQUESTS
  // =========================================================

  async submitChangeRequest(employeeId: string, companyId: string, dto: CreateChangeRequestDto) {
    const supabase = this.supabaseService.getClient();

    const { data: existingPending, error: existingPendingError } = await supabase
      .from('profile_change_requests')
      .select('request_id')
      .eq('employee_id', employeeId)
      .eq('field_type', dto.field_type)
      .eq('status', 'pending')
      .maybeSingle();
    if (existingPendingError) throw new BadRequestException(existingPendingError.message);
    if (existingPending) {
      const fieldLabel = dto.field_type === 'legal_name' ? 'legal name' : 'bank account';
      throw new ConflictException(`You already have a pending ${fieldLabel} change request.`);
    }

    const { data, error } = await supabase
      .from('profile_change_requests')
      .insert({
        employee_id: employeeId,
        company_id: companyId,
        field_type: dto.field_type,
        requested_changes: dto.requested_changes,
        reason: dto.reason,
        supporting_doc_url: dto.supporting_doc_url ?? null,
        status: 'pending',
      })
      .select()
      .single();

    if (error) throw new BadRequestException(error.message);

    // Notify HR — fire-and-forget
    const fieldLabel = dto.field_type === 'legal_name' ? 'Legal Name' : 'Bank Account';
    this.notificationsService.notifyAllHRInCompany(companyId, {
      type: 'PROFILE_CHANGE_SUBMITTED',
      title: 'Profile Change Request',
      message: `An employee has submitted a ${fieldLabel} change request for review.`,
      metadata: { request_id: data.request_id, employee_id: employeeId, field_type: dto.field_type },
    }).catch(() => {});

    // Audit — fire-and-forget
    this.auditService.log(
      `PROFILE_CHANGE_REQUEST_SUBMITTED: ${dto.field_type}`,
      employeeId,
      companyId,
    ).catch(() => {});

    return data;
  }

  async getMyChangeRequests(employeeId: string) {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('profile_change_requests')
      .select('*')
      .eq('employee_id', employeeId)
      .order('created_at', { ascending: false });

    if (error) throw new BadRequestException(error.message);
    return data ?? [];
  }

  async getChangeRequestsForCompany(companyId: string, status?: string) {
    let query = this.supabaseService
      .getClient()
      .from('profile_change_requests')
      .select('*, employee:employee_id(first_name, last_name, employee_id, email)')
      .eq('company_id', companyId)
      .order('created_at', { ascending: false });

    if (status) {
      query = query.eq('status', status) as any;
    }

    const { data, error } = await query;
    if (error) throw new BadRequestException(error.message);
    return data ?? [];
  }

  async reviewChangeRequest(
    requestId: string,
    reviewerId: string,
    companyId: string,
    dto: ReviewChangeRequestDto,
  ) {
    const supabase = this.supabaseService.getClient();

    const { data: request, error: fetchErr } = await supabase
      .from('profile_change_requests')
      .select('*, employee:employee_id(first_name, last_name, email)')
      .eq('request_id', requestId)
      .eq('company_id', companyId)
      .single();

    if (fetchErr || !request) throw new NotFoundException('Change request not found.');
    if (request.status !== 'pending') throw new BadRequestException('This request has already been reviewed.');

    // Update request status
    const { data: updated, error: updateErr } = await supabase
      .from('profile_change_requests')
      .update({
        status: dto.status,
        reviewed_by: reviewerId,
        review_reason: dto.review_reason,
        reviewed_at: new Date().toISOString(),
      })
      .eq('request_id', requestId)
      .select()
      .single();

    if (updateErr) throw new BadRequestException(updateErr.message);

    // If approved, apply changes to user_profile
    if (dto.status === 'approved') {
      const changes = request.requested_changes as Record<string, string>;

      if (request.field_type === 'legal_name') {
        const nameUpdate: Record<string, string> = {};
        if (changes.first_name) nameUpdate.first_name = changes.first_name;
        if (changes.middle_name !== undefined) nameUpdate.middle_name = changes.middle_name;
        if (changes.last_name) nameUpdate.last_name = changes.last_name;
        if (Object.keys(nameUpdate).length > 0) {
          await supabase.from('user_profile').update(nameUpdate).eq('user_id', request.employee_id);
        }
      } else if (request.field_type === 'bank') {
        const bankUpdate: Record<string, string> = {};
        if (changes.bank_name) bankUpdate.bank_name = changes.bank_name;
        if (changes.bank_account_number) bankUpdate.bank_account_number = changes.bank_account_number;
        if (changes.bank_account_name) bankUpdate.bank_account_name = changes.bank_account_name;
        if (Object.keys(bankUpdate).length > 0) {
          await supabase.from('user_profile').update(bankUpdate).eq('user_id', request.employee_id);
        }
      }
    }

    const employee = (request as any).employee;
    const fieldLabel = request.field_type === 'legal_name' ? 'Legal Name' : 'Bank Account';

    // Notify employee — fire-and-forget
    this.notificationsService.createNotification({
      userId: request.employee_id,
      companyId,
      type: 'PROFILE_CHANGE_REVIEWED',
      title: dto.status === 'approved' ? `${fieldLabel} Change Approved` : `${fieldLabel} Change Rejected`,
      message: dto.status === 'approved'
        ? `Your ${fieldLabel} change request has been approved.`
        : `Your ${fieldLabel} change request was rejected. Reason: ${dto.review_reason}`,
      metadata: { request_id: requestId, field_type: request.field_type, status: dto.status },
    }).catch(() => {});

    // Send email — fire-and-forget
    if (employee?.email) {
      this.mailService.sendProfileChangeReviewedEmail({
        to: employee.email,
        employeeName: `${employee.first_name} ${employee.last_name}`,
        fieldType: request.field_type,
        status: dto.status,
        reviewReason: dto.review_reason,
      }).catch(() => {});
    }

    // Audit — fire-and-forget
    this.auditService.log(
      `PROFILE_CHANGE_REQUEST_REVIEWED (${dto.status}): ${request.field_type}`,
      reviewerId,
      companyId,
      request.employee_id,
    ).catch(() => {});

    return updated;
  }
}
