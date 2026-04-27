import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import * as crypto from 'node:crypto';
import { SupabaseService } from '../supabase/supabase.service';
import { FileLeaveRequestDto } from './dto/file-leave-request.dto';
import { ReviewLeaveRequestDto } from './dto/review-leave-request.dto';

const DEFAULT_LEAVE_ALLOCATIONS: Record<string, number> = {
  'Vacation Leave': 15,
  'Sick Leave': 10,
  'Emergency Leave': 3,
  'Personal Leave': 2,
};

@Injectable()
export class LeaveService {
  private readonly logger = new Logger(LeaveService.name);

  constructor(private readonly supabaseService: SupabaseService) {}

  // ──────────────────────────────────────────────────────────────
  // EMPLOYEE: Get own leave balances
  // GET /leave/balances
  // Returns shape expected by frontend payrollApi:
  //   [{ type, remaining, total }]
  // ──────────────────────────────────────────────────────────────
  async getMyLeaveBalances(userId: string, companyId: string) {
    const supabase = this.supabaseService.getClient();
    const year = new Date().getFullYear();

    const { data, error } = await supabase
      .from('time_leave_balances')
      .select('leave_type, allocated_days, used_days')
      .eq('user_id', userId)
      .eq('company_id', companyId)
      .eq('year', year);

    if (error) throw new Error(error.message);

    const rows = data ?? [];

    // Merge DB rows with defaults so all 4 types always appear
    const result = Object.entries(DEFAULT_LEAVE_ALLOCATIONS).map(
      ([type, defaultTotal]) => {
        const row = rows.find((r) => r.leave_type === type);
        const total = row ? Number(row.allocated_days) : defaultTotal;
        const used = row ? Number(row.used_days) : 0;
        return {
          type: type.replace(' Leave', '') as string,
          remaining: Math.max(0, total - used),
          total,
        };
      },
    );

    return result;
  }

  // ──────────────────────────────────────────────────────────────
  // EMPLOYEE: File a leave request
  // POST /leave/requests
  // ──────────────────────────────────────────────────────────────
  async fileLeaveRequest(
    userId: string,
    companyId: string,
    dto: FileLeaveRequestDto,
  ) {
    const supabase = this.supabaseService.getClient();

    const start = new Date(dto.start_date);
    const end = new Date(dto.end_date);

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      throw new BadRequestException('Invalid date format. Use YYYY-MM-DD.');
    }
    if (end < start) {
      throw new BadRequestException('end_date must be on or after start_date.');
    }

    const msPerDay = 1000 * 60 * 60 * 24;
    const totalDays =
      Math.round((end.getTime() - start.getTime()) / msPerDay) + 1;

    // Check for sufficient balance for tracked leave types
    if (DEFAULT_LEAVE_ALLOCATIONS[dto.leave_type] !== undefined) {
      const year = start.getFullYear();
      const { data: balRow } = await supabase
        .from('time_leave_balances')
        .select('allocated_days, used_days')
        .eq('user_id', userId)
        .eq('company_id', companyId)
        .eq('leave_type', dto.leave_type)
        .eq('year', year)
        .maybeSingle();

      const allocated = balRow
        ? Number(balRow.allocated_days)
        : (DEFAULT_LEAVE_ALLOCATIONS[dto.leave_type] ?? 0);
      const used = balRow ? Number(balRow.used_days) : 0;
      const remaining = allocated - used;

      if (totalDays > remaining) {
        throw new BadRequestException(
          `Insufficient ${dto.leave_type} balance. Remaining: ${remaining} day(s), requested: ${totalDays}.`,
        );
      }
    }

    const { data, error } = await supabase
      .from('time_leave_requests')
      .insert({
        request_id: crypto.randomUUID(),
        user_id: userId,
        company_id: companyId,
        leave_type: dto.leave_type,
        start_date: dto.start_date,
        end_date: dto.end_date,
        total_days: totalDays,
        reason: dto.reason ?? null,
        status: 'Pending',
      })
      .select()
      .single();

    if (error) throw new Error(error.message);

    this.logger.log(
      `Leave request filed — user: ${userId}, type: ${dto.leave_type}, days: ${totalDays}`,
    );
    return data;
  }

  // ──────────────────────────────────────────────────────────────
  // EMPLOYEE: Get own leave requests
  // GET /leave/requests/me
  // ──────────────────────────────────────────────────────────────
  async getMyLeaveRequests(userId: string) {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('time_leave_requests')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) throw new Error(error.message);
    return data ?? [];
  }

  // ──────────────────────────────────────────────────────────────
  // HR/Manager: Get all leave requests for company
  // GET /leave/requests?status=Pending
  // Manually joins user_profile because time_leave_requests.user_id
  // has no FK constraint in the database schema.
  // ──────────────────────────────────────────────────────────────
  async getLeaveRequests(companyId: string, status?: string) {
    const supabase = this.supabaseService.getClient();

    let query = supabase
      .from('time_leave_requests')
      .select('*')
      .eq('company_id', companyId)
      .order('created_at', { ascending: false });

    if (status) {
      query = query.eq('status', status) as typeof query;
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);
    const rows = data ?? [];
    if (!rows.length) return [];

    // Manually fetch employee profiles (no FK on user_id)
    const userIds = [...new Set(rows.map((r) => r.user_id))];
    const { data: profiles, error: profileErr } = await supabase
      .from('user_profile')
      .select('user_id, first_name, last_name, employee_id, email')
      .in('user_id', userIds);

    if (profileErr) {
      this.logger.warn(`Failed to fetch employee profiles: ${profileErr.message}`);
    }

    const profileMap = new Map(
      (profiles ?? []).map((p) => [p.user_id, p]),
    );

    return rows.map((row) => ({
      ...row,
      employee: profileMap.get(row.user_id) ?? null,
    }));
  }

  // ──────────────────────────────────────────────────────────────
  // HR: Approve or reject a leave request
  // PATCH /leave/requests/:requestId
  // Also matches legacy route: PATCH /timekeeping/leave-requests/:logId
  // ──────────────────────────────────────────────────────────────
  async reviewLeaveRequest(
    requestId: string,
    reviewerId: string,
    companyId: string,
    dto: ReviewLeaveRequestDto,
  ) {
    const supabase = this.supabaseService.getClient();

    const { data: request, error: fetchErr } = await supabase
      .from('time_leave_requests')
      .select('*')
      .eq('request_id', requestId)
      .eq('company_id', companyId)
      .maybeSingle();

    if (fetchErr) throw new Error(fetchErr.message);
    if (!request) throw new NotFoundException('Leave request not found.');
    if (request.status !== 'Pending') {
      throw new BadRequestException('This request has already been reviewed.');
    }

    const { data: updated, error: updateErr } = await supabase
      .from('time_leave_requests')
      .update({
        status: dto.status,
        reviewed_by: reviewerId,
        reviewed_at: new Date().toISOString(),
        rejection_reason: dto.rejection_reason ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq('request_id', requestId)
      .select()
      .single();

    if (updateErr) throw new Error(updateErr.message);

    // If approved, deduct from balance
    if (dto.status === 'Approved') {
      await this.deductLeaveBalance(
        request.user_id,
        companyId,
        request.leave_type,
        Number(request.total_days),
        new Date(request.start_date).getFullYear(),
      );
    }

    this.logger.log(
      `Leave request ${dto.status} — request: ${requestId}, reviewer: ${reviewerId}`,
    );
    return updated;
  }

  // ──────────────────────────────────────────────────────────────
  // Internal: Deduct used days from time_leave_balances
  // ──────────────────────────────────────────────────────────────
  private async deductLeaveBalance(
    userId: string,
    companyId: string,
    leaveType: string,
    days: number,
    year: number,
  ) {
    const supabase = this.supabaseService.getClient();

    const { data: existing } = await supabase
      .from('time_leave_balances')
      .select('balance_id, allocated_days, used_days')
      .eq('user_id', userId)
      .eq('company_id', companyId)
      .eq('leave_type', leaveType)
      .eq('year', year)
      .maybeSingle();

    if (existing) {
      await supabase
        .from('time_leave_balances')
        .update({
          used_days: Number(existing.used_days) + days,
          updated_at: new Date().toISOString(),
        })
        .eq('balance_id', existing.balance_id);
    } else {
      // Seed a row on first use if not yet created
      const defaultAllocated = DEFAULT_LEAVE_ALLOCATIONS[leaveType] ?? 0;
      await supabase.from('time_leave_balances').insert({
        balance_id: crypto.randomUUID(),
        user_id: userId,
        company_id: companyId,
        leave_type: leaveType,
        year,
        allocated_days: defaultAllocated,
        used_days: days,
      });
    }
  }

  // ──────────────────────────────────────────────────────────────
  // HR: Seed default leave balances when a new employee joins
  // Called from onboarding touchpoint
  // ──────────────────────────────────────────────────────────────
  async seedLeaveBalancesForNewEmployee(userId: string, companyId: string) {
    const supabase = this.supabaseService.getClient();
    const year = new Date().getFullYear();

    const rows = Object.entries(DEFAULT_LEAVE_ALLOCATIONS).map(
      ([leaveType, allocated]) => ({
        balance_id: crypto.randomUUID(),
        user_id: userId,
        company_id: companyId,
        leave_type: leaveType,
        year,
        allocated_days: allocated,
        used_days: 0,
      }),
    );

    const { error } = await supabase
      .from('time_leave_balances')
      .upsert(rows, { onConflict: 'user_id,company_id,leave_type,year' });

    if (error) {
      this.logger.warn(
        `Failed to seed leave balances for ${userId}: ${error.message}`,
      );
    }
  }
}
