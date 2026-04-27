import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as crypto from 'node:crypto';
import { SupabaseService } from '../supabase/supabase.service';

type SalaryBaselineInput = {
  user_id: string;
  company_id: string;
  pay_frequency: string;
  basic_salary: number;
  effective_date: string;
};

type BenefitCatalogInput = {
  company_id: string;
  benefit_name: string;
  benefit_type: string;
  taxable: boolean;
};

type AssignBenefitInput = {
  user_id: string;
  benefit_id: string;
  amount: number;
  effective_date: string;
};

type StatutoryIdsInput = {
  tin_number?: string;
  sss_number?: string;
  philhealth_number?: string;
  pagibig_number?: string;
};

type TaxBracketInput = {
  effective_year: number;
  min_salary: number;
  max_salary: number;
  base_tax_amount: number;
  excess_percentage: number;
};

@Injectable()
export class CnbService {
  constructor(private readonly supabaseService: SupabaseService) {}

  private roundCurrency(value: number): number {
    return Math.round(value * 100) / 100;
  }

  private parseIsoDate(value: string): Date {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException(`Invalid date value: ${value}`);
    }
    return date;
  }

  private toDateKey(date: Date): string {
    return date.toISOString().split('T')[0];
  }

  private isWeekday(date: Date): boolean {
    const day = date.getUTCDay();
    return day >= 1 && day <= 5;
  }

  private listWeekdayKeys(startDate: string, endDate: string): string[] {
    const start = this.parseIsoDate(`${startDate}T00:00:00.000Z`);
    const end = this.parseIsoDate(`${endDate}T00:00:00.000Z`);
    const keys: string[] = [];

    for (const cursor = new Date(start); cursor <= end; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
      if (this.isWeekday(cursor)) {
        keys.push(this.toDateKey(cursor));
      }
    }

    return keys;
  }

  private countWeekdaysInMonth(referenceDate: string): number {
    const base = this.parseIsoDate(`${referenceDate}T00:00:00.000Z`);
    const start = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), 1));
    const end = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + 1, 0));
    return this.listWeekdayKeys(this.toDateKey(start), this.toDateKey(end)).length || 22;
  }

  private normalizePayFrequency(payFrequency: string | null | undefined): 'daily' | 'monthly' | 'semi-monthly' {
    const normalized = String(payFrequency ?? '').trim().toLowerCase();
    if (normalized === 'daily') return 'daily';
    if (normalized === 'monthly') return 'monthly';
    return 'semi-monthly';
  }

  private detectUnpaidLeave(leaveType: string | null | undefined): boolean {
    const normalized = String(leaveType ?? '').trim().toLowerCase();
    return normalized.includes('unpaid') || normalized.includes('lwop');
  }

  private async writeAudit(input: {
    companyId: string;
    actorId: string;
    actionType: string;
    targetTable: string;
    targetRecordId: string;
    oldValue?: unknown;
    newValue?: unknown;
  }) {
    const supabase = this.supabaseService.getClient();
    const { error } = await supabase.from('cnb_audit_trail').insert({
      audit_id: crypto.randomUUID(),
      company_id: input.companyId,
      actor_id: input.actorId,
      action_type: input.actionType,
      target_table: input.targetTable,
      target_record_id: input.targetRecordId,
      old_value: input.oldValue ? JSON.stringify(input.oldValue) : null,
      new_value: input.newValue ? JSON.stringify(input.newValue) : null,
      timestamp: new Date().toISOString(),
    });

    if (error) throw new Error(error.message);
  }

  async getSalaryBaseline(userId: string, companyId: string) {
    const supabase = this.supabaseService.getClient();

    const { data, error } = await supabase
      .from('cnb_salary_baselines')
      .select('*')
      .eq('user_id', userId)
      .eq('company_id', companyId)
      .order('effective_date', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw new Error(error.message);
    return data ?? null;
  }

  async setSalaryBaseline(dto: SalaryBaselineInput, actorId: string) {
    const supabase = this.supabaseService.getClient();
    const { data, error } = await supabase
      .from('cnb_salary_baselines')
      .insert(dto)
      .select('*')
      .single();

    if (error) throw new Error(error.message);

    await this.writeAudit({
      companyId: dto.company_id,
      actorId,
      actionType: 'SALARY_BASELINE_SET',
      targetTable: 'cnb_salary_baselines',
      targetRecordId: String(data?.baseline_id ?? data?.id ?? crypto.randomUUID()),
      newValue: data,
    });

    return data;
  }

  async getBenefitsCatalog(companyId: string) {
    const supabase = this.supabaseService.getClient();
    const { data, error } = await supabase
      .from('cnb_benefits_catalog')
      .select('*')
      .eq('company_id', companyId)
      .eq('is_active', true)
      .order('benefit_name', { ascending: true });

    if (error) throw new Error(error.message);
    return data ?? [];
  }

  async createBenefit(dto: BenefitCatalogInput, actorId: string) {
    const supabase = this.supabaseService.getClient();
    const { data, error } = await supabase
      .from('cnb_benefits_catalog')
      .insert({
        benefit_id: crypto.randomUUID(),
        ...dto,
      })
      .select('*')
      .single();

    if (error) throw new Error(error.message);

    await this.writeAudit({
      companyId: dto.company_id,
      actorId,
      actionType: 'BENEFIT_CATALOG_CREATE',
      targetTable: 'cnb_benefits_catalog',
      targetRecordId: String(data?.benefit_id ?? crypto.randomUUID()),
      newValue: data,
    });

    return data;
  }

  async getEmployeeBenefits(userId: string, companyId: string) {
    const supabase = this.supabaseService.getClient();
    const { data: mappings, error: mappingError } = await supabase
      .from('cnb_employee_benefits')
      .select('mapping_id, user_id, benefit_id, amount, effective_date')
      .eq('user_id', userId)
      .order('effective_date', { ascending: false });

    if (mappingError) throw new Error(mappingError.message);
    const rows = mappings ?? [];
    if (!rows.length) return [];

    const benefitIds = rows.map((row) => row.benefit_id).filter(Boolean);
    const { data: catalogRows, error: catalogError } = await supabase
      .from('cnb_benefits_catalog')
      .select('benefit_id, benefit_name, benefit_type, taxable, company_id')
      .in('benefit_id', benefitIds)
      .eq('company_id', companyId);

    if (catalogError) throw new Error(catalogError.message);

    const catalogById = new Map(
      (catalogRows ?? []).map((row) => [row.benefit_id, row]),
    );

    return rows
      .filter((row) => catalogById.has(row.benefit_id))
      .map((row) => {
      const catalog = catalogById.get(row.benefit_id);
      return {
        ...row,
        benefit_name: catalog?.benefit_name ?? null,
        benefit_type: catalog?.benefit_type ?? null,
        taxable: catalog?.taxable ?? null,
      };
      });
  }

  async assignBenefit(
    companyId: string,
    dto: AssignBenefitInput,
    actorId: string,
  ) {
    const supabase = this.supabaseService.getClient();

    const { data: catalog, error: catalogError } = await supabase
      .from('cnb_benefits_catalog')
      .select('benefit_id, company_id')
      .eq('benefit_id', dto.benefit_id)
      .eq('company_id', companyId)
      .maybeSingle();

    if (catalogError) throw new Error(catalogError.message);
    if (!catalog) throw new NotFoundException('Benefit type not found.');

    const { data, error } = await supabase
      .from('cnb_employee_benefits')
      .insert(dto)
      .select('*')
      .single();

    if (error) throw new Error(error.message);

    await this.writeAudit({
      companyId,
      actorId,
      actionType: 'EMPLOYEE_BENEFIT_ASSIGN',
      targetTable: 'cnb_employee_benefits',
      targetRecordId: String(data?.mapping_id ?? crypto.randomUUID()),
      newValue: data,
    });

    return data;
  }

  async removeEmployeeBenefit(
    mappingId: string,
    companyId: string,
    actorId: string,
  ) {
    const supabase = this.supabaseService.getClient();
    const { data: mapping, error: mappingError } = await supabase
      .from('cnb_employee_benefits')
      .select('mapping_id, benefit_id, user_id, amount, effective_date')
      .eq('mapping_id', mappingId)
      .maybeSingle();

    if (mappingError) throw new Error(mappingError.message);
    if (!mapping) throw new NotFoundException('Employee benefit mapping not found.');

    const { data: catalog, error: catalogError } = await supabase
      .from('cnb_benefits_catalog')
      .select('benefit_id, company_id')
      .eq('benefit_id', mapping.benefit_id)
      .eq('company_id', companyId)
      .maybeSingle();

    if (catalogError) throw new Error(catalogError.message);
    if (!catalog) throw new NotFoundException('Benefit not found for this company.');

    const { error } = await supabase
      .from('cnb_employee_benefits')
      .delete()
      .eq('mapping_id', mappingId);

    if (error) throw new Error(error.message);

    await this.writeAudit({
      companyId,
      actorId,
      actionType: 'EMPLOYEE_BENEFIT_REMOVE',
      targetTable: 'cnb_employee_benefits',
      targetRecordId: mappingId,
      oldValue: mapping,
    });

    return { mapping_id: mappingId, deleted: true };
  }

  async getStatutoryIds(userId: string, companyId: string) {
    const supabase = this.supabaseService.getClient();
    const { data, error } = await supabase
      .from('cnb_statutory_ids')
      .select('*')
      .eq('user_id', userId)
      .eq('company_id', companyId)
      .maybeSingle();

    if (error) throw new Error(error.message);
    return data ?? null;
  }

  async saveStatutoryIds(
    userId: string,
    companyId: string,
    dto: StatutoryIdsInput,
    actorId: string,
  ) {
    const supabase = this.supabaseService.getClient();
    const { data: before, error: beforeError } = await supabase
      .from('cnb_statutory_ids')
      .select('*')
      .eq('user_id', userId)
      .eq('company_id', companyId)
      .maybeSingle();

    if (beforeError) throw new Error(beforeError.message);

    const payload = {
      user_id: userId,
      company_id: companyId,
      tin_number: dto.tin_number ?? null,
      sss_number: dto.sss_number ?? null,
      philhealth_number: dto.philhealth_number ?? null,
      pagibig_number: dto.pagibig_number ?? null,
      updated_at: new Date().toISOString(),
    };

    const query = before
      ? supabase
          .from('cnb_statutory_ids')
          .update(payload)
          .eq('statutory_id', before.statutory_id)
      : supabase.from('cnb_statutory_ids').insert(payload);

    const { data, error } = await query.select('*').single();

    if (error) throw new Error(error.message);

    await this.writeAudit({
      companyId,
      actorId,
      actionType: 'STATUTORY_IDS_SAVE',
      targetTable: 'cnb_statutory_ids',
      targetRecordId: String(data?.statutory_id ?? `${userId}:${companyId}`),
      oldValue: before ?? null,
      newValue: data,
    });

    return data;
  }

  async getTaxBrackets(companyId: string, year?: number) {
    const supabase = this.supabaseService.getClient();
    let query = supabase
      .from('cnb_tax_brackets')
      .select('*')
      .eq('company_id', companyId)
      .order('effective_year', { ascending: true })
      .order('min_salary', { ascending: true });

    if (year) {
      query = query.eq('effective_year', year) as typeof query;
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return data ?? [];
  }

  async createTaxBracket(
    companyId: string,
    dto: TaxBracketInput,
    actorId: string,
  ) {
    if (dto.max_salary < dto.min_salary) {
      throw new BadRequestException('max_salary must be greater than or equal to min_salary.');
    }

    const supabase = this.supabaseService.getClient();
    const { data, error } = await supabase
      .from('cnb_tax_brackets')
      .insert({
        bracket_id: crypto.randomUUID(),
        company_id: companyId,
        ...dto,
      })
      .select('*')
      .single();

    if (error) throw new Error(error.message);

    await this.writeAudit({
      companyId,
      actorId,
      actionType: 'TAX_BRACKET_CREATE',
      targetTable: 'cnb_tax_brackets',
      targetRecordId: String(data?.bracket_id ?? crypto.randomUUID()),
      newValue: data,
    });

    return data;
  }

  async deleteTaxBracket(bracketId: string, companyId: string, actorId: string) {
    const supabase = this.supabaseService.getClient();
    const { data: existing, error: findError } = await supabase
      .from('cnb_tax_brackets')
      .select('*')
      .eq('bracket_id', bracketId)
      .eq('company_id', companyId)
      .maybeSingle();

    if (findError) throw new Error(findError.message);
    if (!existing) throw new NotFoundException('Tax bracket not found.');

    const { error } = await supabase
      .from('cnb_tax_brackets')
      .delete()
      .eq('bracket_id', bracketId)
      .eq('company_id', companyId);

    if (error) throw new Error(error.message);

    await this.writeAudit({
      companyId,
      actorId,
      actionType: 'TAX_BRACKET_DELETE',
      targetTable: 'cnb_tax_brackets',
      targetRecordId: bracketId,
      oldValue: existing,
    });

    return { bracket_id: bracketId, deleted: true };
  }

  async reviewPayslip(
    payslipId: string,
    status: 'Approved' | 'Correction Needed',
    reviewerId: string,
    companyId: string,
  ) {
    const supabase = this.supabaseService.getClient();

    const { data: before, error: beforeError } = await supabase
      .from('cnb_payslips')
      .select('*')
      .eq('payslip_id', payslipId)
      .eq('company_id', companyId)
      .maybeSingle();

    if (beforeError) throw new Error(beforeError.message);
    if (!before) throw new NotFoundException('Payslip not found.');

    const { data, error } = await supabase
      .from('cnb_payslips')
      .update({ status })
      .eq('payslip_id', payslipId)
      .eq('company_id', companyId)
      .select('*')
      .single();

    if (error) throw new Error(error.message);

    await this.writeAudit({
      companyId,
      actorId: reviewerId,
      actionType: 'PAYSLIP_REVIEW',
      targetTable: 'cnb_payslips',
      targetRecordId: payslipId,
      oldValue: before,
      newValue: status,
    });

    return data;
  }

  async getMyCompensation(userId: string, companyId: string) {
    const [salary, benefits, statutory] = await Promise.all([
      this.getSalaryBaseline(userId, companyId),
      this.getEmployeeBenefits(userId, companyId),
      this.getStatutoryIds(userId, companyId),
    ]);

    return { salary, benefits, statutory };
  }

  async getMyPayslips(userId: string, companyId: string) {
    const supabase = this.supabaseService.getClient();
    const { data, error } = await supabase
      .from('cnb_payslips')
      .select(
        `*, period:period_id(period_id, cutoff_start_date, cutoff_end_date, payout_date, status)`,
      )
      .eq('user_id', userId)
      .eq('company_id', companyId)
      .order('created_at', { ascending: false });

    if (error) throw new Error(error.message);
    return data ?? [];
  }

  async getPayslipDetail(payslipId: string, companyId: string) {
    const supabase = this.supabaseService.getClient();
    const { data, error } = await supabase
      .from('cnb_payslips')
      .select(
        `*, period:period_id(period_id, cutoff_start_date, cutoff_end_date, payout_date, status)`,
      )
      .eq('payslip_id', payslipId)
      .eq('company_id', companyId)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!data) throw new NotFoundException('Payslip not found.');

    const benefits = await this.getEmployeeBenefits(data.user_id, companyId);

    let breakdown: unknown = null;
    if (data.other_deductions) {
      try { breakdown = JSON.parse(data.other_deductions); } catch { /* ignore */ }
    }

    return { ...data, benefits, breakdown };
  }

  async getPayslipDetailForUser(
    payslipId: string,
    requestor: { sub_userid: string; company_id: string; role_name: string },
  ) {
    const data = await this.getPayslipDetail(payslipId, requestor.company_id);
    const privilegedRoles = new Set([
      'Admin',
      'System Admin',
      'HR Officer',
      'HR Recruiter',
      'HR Interviewer',
    ]);

    if (data.user_id !== requestor.sub_userid && !privilegedRoles.has(requestor.role_name)) {
      throw new ForbiddenException('You can only access your own payslip details.');
    }

    return data;
  }

  private computeMonthlyStatutoryDeductions(monthlyGross: number) {
    const sss = Math.min(monthlyGross * 0.045, 1350);
    const philhealth = Math.min(monthlyGross * 0.025, 1750);
    const pagibig = Math.min(monthlyGross * 0.02, 100);
    return { sss, philhealth, pagibig, total: sss + philhealth + pagibig };
  }

  private async getAttendanceAndLeaveSummary(
    userId: string,
    companyId: string,
    startDate: string,
    endDate: string,
  ) {
    const supabase = this.supabaseService.getClient();
    const scheduledDayKeys = this.listWeekdayKeys(startDate, endDate);
    const scheduledDaySet = new Set(scheduledDayKeys);

    const { data: profile, error: profileError } = await supabase
      .from('user_profile')
      .select('employee_id')
      .eq('user_id', userId)
      .eq('company_id', companyId)
      .maybeSingle();

    if (profileError) throw new Error(profileError.message);

    const workedDayKeys = new Set<string>();
    if (profile?.employee_id) {
      const { data: attendanceLogs, error: attendanceError } = await supabase
        .from('attendance_time_logs')
        .select('log_type, timestamp, log_status')
        .eq('employee_id', profile.employee_id)
        .gte('timestamp', `${startDate}T00:00:00.000Z`)
        .lte('timestamp', `${endDate}T23:59:59.999Z`);

      if (attendanceError) throw new Error(attendanceError.message);

      for (const log of attendanceLogs ?? []) {
        if (log.log_status === 'REJECTED') continue;
        if (log.log_type !== 'time-in' && log.log_type !== 'time-out') continue;
        const dateKey = String(log.timestamp).split('T')[0];
        if (scheduledDaySet.has(dateKey)) {
          workedDayKeys.add(dateKey);
        }
      }
    }

    const { data: leaveRequests, error: leaveError } = await supabase
      .from('time_leave_requests')
      .select('leave_type, start_date, end_date')
      .eq('user_id', userId)
      .eq('company_id', companyId)
      .eq('status', 'Approved')
      .lte('start_date', endDate)
      .gte('end_date', startDate);

    if (leaveError) throw new Error(leaveError.message);

    const paidLeaveDayKeys = new Set<string>();
    const unpaidLeaveDayKeys = new Set<string>();

    for (const request of leaveRequests ?? []) {
      const overlapStart = request.start_date > startDate ? request.start_date : startDate;
      const overlapEnd = request.end_date < endDate ? request.end_date : endDate;

      for (const dateKey of this.listWeekdayKeys(overlapStart, overlapEnd)) {
        if (!scheduledDaySet.has(dateKey)) continue;
        if (this.detectUnpaidLeave(request.leave_type)) {
          unpaidLeaveDayKeys.add(dateKey);
        } else {
          paidLeaveDayKeys.add(dateKey);
        }
      }
    }

    const payableDayKeys = new Set<string>([...workedDayKeys, ...paidLeaveDayKeys]);
    for (const dateKey of unpaidLeaveDayKeys) {
      payableDayKeys.delete(dateKey);
    }

    return {
      scheduledDays: scheduledDayKeys.length,
      workedDays: workedDayKeys.size,
      paidLeaveDays: paidLeaveDayKeys.size,
      unpaidLeaveDays: unpaidLeaveDayKeys.size,
      payableDays: Math.min(payableDayKeys.size, scheduledDayKeys.length),
    };
  }

  private async buildCompensationSnapshot(
    userId: string,
    companyId: string,
    startDate: string,
    endDate: string,
  ) {
    const [salary, benefits, brackets, attendance] = await Promise.all([
      this.getSalaryBaseline(userId, companyId),
      this.getEmployeeBenefits(userId, companyId),
      this.getTaxBrackets(companyId, new Date(startDate).getFullYear()),
      this.getAttendanceAndLeaveSummary(userId, companyId, startDate, endDate),
    ]);

    if (!salary) {
      throw new BadRequestException(`No salary baseline found for user ${userId}.`);
    }

    const payFrequency = this.normalizePayFrequency(salary.pay_frequency);
    const regularBenefits = benefits.filter(
      (benefit) =>
        benefit.benefit_type !== 'one_time_incentive' &&
        benefit.benefit_type !== '13th_month',
    );
    const oneTimeBenefits = benefits.filter(
      (benefit) =>
        benefit.benefit_type === 'one_time_incentive' ||
        benefit.benefit_type === '13th_month',
    );

    const totalAllowances = regularBenefits.reduce(
      (sum, benefit) => sum + Number(benefit.amount),
      0,
    );
    const additionalOneTimePay = oneTimeBenefits.reduce(
      (sum, benefit) => sum + Number(benefit.amount),
      0,
    );

    const scheduledDays = Math.max(attendance.scheduledDays, 1);
    const monthlyBusinessDays = this.countWeekdaysInMonth(startDate);
    const monthlyBasicEquivalent =
      payFrequency === 'daily'
        ? Number(salary.basic_salary) * 22
        : payFrequency === 'monthly'
          ? Number(salary.basic_salary)
          : Number(salary.basic_salary) * 2;

    const fullPeriodBasic =
      payFrequency === 'daily'
        ? Number(salary.basic_salary) * attendance.scheduledDays
        : payFrequency === 'monthly'
          ? (monthlyBasicEquivalent / monthlyBusinessDays) * attendance.scheduledDays
          : Number(salary.basic_salary);

    const attendanceFactor =
      attendance.scheduledDays > 0 && attendance.payableDays > 0
        ? Math.min(attendance.payableDays / scheduledDays, 1)
        : 1;

    const earnedBasicPay = fullPeriodBasic * attendanceFactor;
    const grossPay = earnedBasicPay + totalAllowances;
    const monthlyGrossEquivalent =
      monthlyBasicEquivalent +
      (payFrequency === 'semi-monthly' ? totalAllowances * 2 : totalAllowances);
    const monthlyTax = this.computeIncomeTax(monthlyGrossEquivalent, brackets);
    const monthlyStatutory = this.computeMonthlyStatutoryDeductions(monthlyGrossEquivalent);
    const periodProportion =
      monthlyBasicEquivalent > 0
        ? Math.min(earnedBasicPay / monthlyBasicEquivalent, 1)
        : 1;
    const taxForPeriod = monthlyTax * periodProportion;
    const statutory = {
      sss: monthlyStatutory.sss * periodProportion,
      philhealth: monthlyStatutory.philhealth * periodProportion,
      pagibig: monthlyStatutory.pagibig * periodProportion,
      total: monthlyStatutory.total * periodProportion,
    };
    const totalDeductions = taxForPeriod + statutory.total;
    const netPay = grossPay - totalDeductions;

    return {
      salary,
      payFrequency,
      regularBenefits,
      oneTimeBenefits,
      attendance,
      monthlyBusinessDays,
      totalAllowances,
      additionalOneTimePay,
      monthlyBasicEquivalent,
      earnedBasicPay: this.roundCurrency(earnedBasicPay),
      grossPay: this.roundCurrency(grossPay),
      monthlyGrossEquivalent: this.roundCurrency(monthlyGrossEquivalent),
      taxForPeriod: this.roundCurrency(taxForPeriod),
      statutory: {
        sss: this.roundCurrency(statutory.sss),
        philhealth: this.roundCurrency(statutory.philhealth),
        pagibig: this.roundCurrency(statutory.pagibig),
        total: this.roundCurrency(statutory.total),
      },
      totalDeductions: this.roundCurrency(totalDeductions),
      netPay: this.roundCurrency(netPay),
    };
  }

  async computeOffboardingFinalPay(
    userId: string,
    companyId: string,
    lastWorkingDay: string,
  ) {
    const endDate = this.toDateKey(this.parseIsoDate(`${lastWorkingDay}T00:00:00.000Z`));
    const end = this.parseIsoDate(`${endDate}T00:00:00.000Z`);
    const start =
      end.getUTCDate() <= 15
        ? new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), 1))
        : new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), 16));

    const snapshot = await this.buildCompensationSnapshot(
      userId,
      companyId,
      this.toDateKey(start),
      endDate,
    );

    const supabase = this.supabaseService.getClient();
    const { data: leaveBalances, error: leaveError } = await supabase
      .from('time_leave_balances')
      .select('leave_type, allocated_days, used_days')
      .eq('user_id', userId)
      .eq('company_id', companyId)
      .eq('year', end.getUTCFullYear());

    if (leaveError) throw new Error(leaveError.message);

    const dailyRate = snapshot.monthlyBasicEquivalent / 22;
    const remainingLeaveDays = (leaveBalances ?? []).reduce((sum, balance) => {
      const remaining = Number(balance.allocated_days) - Number(balance.used_days);
      return remaining > 0 ? sum + remaining : sum;
    }, 0);
    const leaveEncashment = this.roundCurrency(remainingLeaveDays * dailyRate);
    const additionalPay = this.roundCurrency(
      snapshot.totalAllowances + snapshot.additionalOneTimePay,
    );
    const deductions = this.roundCurrency(snapshot.taxForPeriod + snapshot.statutory.total);
    const totalAmount = this.roundCurrency(
      snapshot.earnedBasicPay + leaveEncashment + additionalPay - deductions,
    );

    return {
      salary_balance: snapshot.earnedBasicPay,
      leave_encashment: leaveEncashment,
      additional_pay: additionalPay,
      deductions,
      total_amount: totalAmount,
      breakdown: {
        covered_period_start: this.toDateKey(start),
        covered_period_end: endDate,
        attendance: snapshot.attendance,
        monthly_basic_equivalent: snapshot.monthlyBasicEquivalent,
        regular_benefits_total: this.roundCurrency(snapshot.totalAllowances),
        one_time_benefits_total: this.roundCurrency(snapshot.additionalOneTimePay),
        remaining_leave_days: this.roundCurrency(remainingLeaveDays),
        statutory: snapshot.statutory,
        tax: snapshot.taxForPeriod,
      },
    };
  }

  // ──────────────────────────────────────────────────────────────
  // PAYROLL COMPUTATION ENGINE
  // ──────────────────────────────────────────────────────────────

  // Income tax from company-configured brackets (monthly basis)
  private computeIncomeTax(
    monthlyGross: number,
    brackets: Array<{
      min_salary: number;
      max_salary: number;
      base_tax_amount: number;
      excess_percentage: number;
    }>,
  ): number {
    if (!brackets.length) return 0;
    const sorted = [...brackets].sort((a, b) => a.min_salary - b.min_salary);
    // Find the bracket this salary falls into
    const bracket =
      sorted.find(
        (b) =>
          monthlyGross >= Number(b.min_salary) &&
          monthlyGross <= Number(b.max_salary),
      ) ?? (monthlyGross > Number(sorted[sorted.length - 1].max_salary)
        ? sorted[sorted.length - 1]
        : null);
    if (!bracket) return 0;
    const excess = Math.max(0, monthlyGross - Number(bracket.min_salary));
    return (
      Number(bracket.base_tax_amount) +
      (excess * Number(bracket.excess_percentage)) / 100
    );
  }

  // Core: compute payslip for one employee in one payroll period
  async computeEmployeePayslip(
    userId: string,
    companyId: string,
    periodId: string,
    actorId: string,
  ) {
    const supabase = this.supabaseService.getClient();
    const { data: period, error: periodError } = await supabase
      .from('cnb_payroll_periods')
      .select('cutoff_start_date, cutoff_end_date')
      .eq('period_id', periodId)
      .eq('company_id', companyId)
      .maybeSingle();

    if (periodError) throw new Error(periodError.message);
    if (!period) throw new NotFoundException('Payroll period not found.');

    const snapshot = await this.buildCompensationSnapshot(
      userId,
      companyId,
      period.cutoff_start_date,
      period.cutoff_end_date,
    );

    // Itemised breakdown stored as JSON in other_deductions
    const breakdown = {
      sss: snapshot.statutory.sss,
      philhealth: snapshot.statutory.philhealth,
      pagibig: snapshot.statutory.pagibig,
      attendance: snapshot.attendance,
      benefits: snapshot.regularBenefits.map((benefit) => ({
        name: benefit.benefit_name,
        type: benefit.benefit_type,
        amount: Number(benefit.amount),
      })),
    };

    const payslipData = {
      payslip_id: crypto.randomUUID(),
      period_id: periodId,
      user_id: userId,
      company_id: companyId,
      basic_pay_earned: String(snapshot.earnedBasicPay),
      total_allowances: String(this.roundCurrency(snapshot.totalAllowances)),
      gross_pay: String(snapshot.grossPay),
      tax_deduction: String(snapshot.taxForPeriod),
      statutory_deductions: String(snapshot.statutory.total),
      other_deductions: JSON.stringify(breakdown),
      total_deductions: String(snapshot.totalDeductions),
      net_pay: String(snapshot.netPay),
      status: 'Pending Review',
      employee_ack_status: 'Pending',
    };

    // Upsert: one payslip per user per period
    const { data: existing } = await supabase
      .from('cnb_payslips')
      .select('payslip_id, status, employee_ack_status, acknowledged_at')
      .eq('user_id', userId)
      .eq('period_id', periodId)
      .maybeSingle();

    const preservedState = existing
      ? {
          status: existing.status ?? payslipData.status,
          employee_ack_status:
            existing.employee_ack_status ?? payslipData.employee_ack_status,
          acknowledged_at: existing.acknowledged_at ?? null,
        }
      : {};

    const upsertQuery = existing
      ? supabase
          .from('cnb_payslips')
          .update({ ...payslipData, ...preservedState })
          .eq('payslip_id', existing.payslip_id)
      : supabase.from('cnb_payslips').insert(payslipData);

    const { data: saved, error } = await upsertQuery.select('*').single();
    if (error) throw new Error(error.message);

    await this.writeAudit({
      companyId,
      actorId,
      actionType: 'PAYSLIP_COMPUTED',
      targetTable: 'cnb_payslips',
      targetRecordId: String(saved?.payslip_id ?? payslipData.payslip_id),
      newValue: {
        gross: snapshot.grossPay,
        tax: snapshot.taxForPeriod,
        net: snapshot.netPay,
        attendance: snapshot.attendance,
      },
    });

    return { ...saved, breakdown, benefits: snapshot.regularBenefits };
  }

  // Run payroll for all employees in a company for a given cutoff period
  async runPayrollCutoff(
    companyId: string,
    cutoffStartDate: string,
    cutoffEndDate: string,
    payoutDate: string,
    actorId: string,
  ) {
    const supabase = this.supabaseService.getClient();

    // Create or reuse payroll period
    const { data: existingPeriod } = await supabase
      .from('cnb_payroll_periods')
      .select('period_id')
      .eq('company_id', companyId)
      .eq('cutoff_start_date', cutoffStartDate)
      .eq('cutoff_end_date', cutoffEndDate)
      .maybeSingle();

    let periodId: string;
    if (existingPeriod) {
      periodId = existingPeriod.period_id;
    } else {
      const periodData = {
        period_id: crypto.randomUUID(),
        company_id: companyId,
        cutoff_start_date: cutoffStartDate,
        cutoff_end_date: cutoffEndDate,
        payout_date: payoutDate,
        status: 'Draft',
        processed_by: actorId,
        processed_at: new Date().toISOString(),
      };
      const { data: newPeriod, error: periodErr } = await supabase
        .from('cnb_payroll_periods')
        .insert(periodData)
        .select('period_id')
        .single();
      if (periodErr) throw new Error(periodErr.message);
      periodId = newPeriod.period_id;
    }

    // Get all employees in the company who have an employee_id assigned.
    // We do NOT filter by account_status because test/demo environments
    // often leave employees as 'pending'. Employees without a salary
    // baseline will be caught and skipped during computation.
    const { data: employees, error: empErr } = await supabase
      .from('user_profile')
      .select('user_id, first_name, last_name, employee_id')
      .eq('company_id', companyId)
      .not('employee_id', 'is', null);

    if (empErr) throw new Error(empErr.message);
    const activeEmployees = employees ?? [];

    const results: Array<{
      user_id: string;
      name: string;
      employee_id: string | null;
      payslip?: unknown;
      error?: string;
    }> = [];

    for (const emp of activeEmployees) {
      try {
        const payslip = await this.computeEmployeePayslip(
          emp.user_id,
          companyId,
          periodId,
          actorId,
        );
        results.push({
          user_id: emp.user_id,
          name: `${emp.first_name} ${emp.last_name}`,
          employee_id: emp.employee_id,
          payslip,
        });
      } catch (err) {
        results.push({
          user_id: emp.user_id,
          name: `${emp.first_name} ${emp.last_name}`,
          employee_id: emp.employee_id,
          error: err instanceof Error ? err.message : 'Computation failed',
        });
      }
    }

    return {
      period_id: periodId,
      cutoff_start_date: cutoffStartDate,
      cutoff_end_date: cutoffEndDate,
      payout_date: payoutDate,
      total_employees: activeEmployees.length,
      computed: results.filter((r) => !r.error).length,
      skipped: results.filter((r) => !!r.error).length,
      results,
    };
  }

  async getPayrollPeriods(companyId: string) {
    const supabase = this.supabaseService.getClient();
    const { data, error } = await supabase
      .from('cnb_payroll_periods')
      .select('*')
      .eq('company_id', companyId)
      .order('cutoff_end_date', { ascending: false });

    if (error) throw new Error(error.message);
    return data ?? [];
  }

  async getPayslipsForPeriod(periodId: string, companyId: string) {
    const supabase = this.supabaseService.getClient();
    const { data, error } = await supabase
      .from('cnb_payslips')
      .select('*')
      .eq('period_id', periodId)
      .eq('company_id', companyId)
      .order('created_at', { ascending: true });

    if (error) throw new Error(error.message);
    const rows = data ?? [];
    if (!rows.length) return [];

    // Attach employee names
    const userIds = rows.map((r) => r.user_id);
    const { data: profiles } = await supabase
      .from('user_profile')
      .select('user_id, first_name, last_name, employee_id')
      .in('user_id', userIds);

    const profileMap = new Map(
      (profiles ?? []).map((p) => [p.user_id, p]),
    );

    return rows.map((row) => ({
      ...row,
      employee: profileMap.get(row.user_id) ?? null,
      breakdown: row.other_deductions
        ? (() => {
            try { return JSON.parse(row.other_deductions); } catch { return null; }
          })()
        : null,
    }));
  }

  // 13th month = (total basic salary earned in the year) / 12
  // Approximation: uses the current salary baseline × months elapsed in year
  async compute13thMonthPay(userId: string, companyId: string, year: number) {
    const salary = await this.getSalaryBaseline(userId, companyId);
    if (!salary) {
      return {
        year,
        monthly_salary: 0,
        months_eligible: 0,
        thirteenth_month_pay: 0,
        note: 'No salary baseline found.',
      };
    }

    const currentYear = new Date().getFullYear();
    const monthsEligible =
      year < currentYear ? 12 : new Date().getMonth() + 1;

    // basic_salary stored is per-payroll-period; normalise to monthly
    const perPeriod = Number(salary.basic_salary);
    const monthly =
      salary.pay_frequency === 'semi-monthly' ? perPeriod * 2 : perPeriod;

    const thirteenthMonthPay =
      Math.floor(((monthly * monthsEligible) / 12) * 100) / 100;

    return {
      year,
      pay_frequency: salary.pay_frequency,
      monthly_salary: monthly,
      months_eligible: monthsEligible,
      thirteenth_month_pay: thirteenthMonthPay,
    };
  }
}
