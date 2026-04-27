import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import * as crypto from 'node:crypto';
import { SupabaseService } from '../supabase/supabase.service';

@Injectable()
export class PayrollService {
  private readonly logger = new Logger(PayrollService.name);

  constructor(private readonly supabaseService: SupabaseService) {}

  // ──────────────────────────────────────────────────────────────
  // EMPLOYEE: Get own payslips
  // GET /payroll/me/payslips
  // Returns shape expected by frontend payrollApi.ts PayslipEntry[]
  // ──────────────────────────────────────────────────────────────
  async getMyPayslips(userId: string) {
    const supabase = this.supabaseService.getClient();

    const { data, error } = await supabase
      .from('cnb_payslips')
      .select(
        `payslip_id, basic_pay_earned, total_allowances, gross_pay,
         tax_deduction, total_deductions, net_pay, status, employee_ack_status,
         acknowledged_at, created_at,
         period:period_id(period_id, cutoff_start_date, cutoff_end_date, payout_date)`,
      )
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) throw new Error(error.message);

    return (data ?? []).map((row: any) => ({
      payslip_id: row.payslip_id,
      pay_period: row.period
        ? this.formatPayPeriod(row.period.cutoff_start_date, row.period.cutoff_end_date)
        : 'Unknown',
      basic_pay: parseFloat(row.basic_pay_earned) || 0,
      allowances: parseFloat(row.total_allowances) || 0,
      deductions: parseFloat(row.total_deductions) || 0,
      tax: parseFloat(row.tax_deduction) || 0,
      net_pay: parseFloat(row.net_pay) || 0,
      status: row.status,
      employee_ack_status: row.employee_ack_status,
      created_at: row.created_at,
      payout_date: row.period?.payout_date ?? null,
    }));
  }

  // ──────────────────────────────────────────────────────────────
  // HR: Get payroll ledger (all employees for a cutoff)
  // GET /payroll/ledger?cutoff=YYYY-MM-DD
  // Returns shape expected by frontend PayrollLedgerEntry[]
  // ──────────────────────────────────────────────────────────────
  async getPayrollLedger(companyId: string, cutoffDate?: string) {
    const supabase = this.supabaseService.getClient();

    // Find the matching period(s)
    let periodQuery = supabase
      .from('cnb_payroll_periods')
      .select('period_id, cutoff_start_date, cutoff_end_date, payout_date, status')
      .eq('company_id', companyId)
      .order('payout_date', { ascending: false });

    if (cutoffDate) {
      periodQuery = periodQuery.eq('payout_date', cutoffDate) as any;
    }

    const { data: periods, error: periodsErr } = await periodQuery.limit(1);
    if (periodsErr) throw new Error(periodsErr.message);

    if (!periods || periods.length === 0) {
      return [];
    }

    const period = periods[0] as any;

    const { data: payslips, error: payslipsErr } = await supabase
      .from('cnb_payslips')
      .select(
        `payslip_id, user_id, basic_pay_earned, gross_pay, total_deductions, net_pay, status`,
      )
      .eq('period_id', period.period_id)
      .eq('company_id', companyId);

    if (payslipsErr) throw new Error(payslipsErr.message);

    if (!payslips || payslips.length === 0) return [];

    // Enrich with employee info
    const userIds = payslips.map((p: any) => p.user_id);
    const { data: users } = await supabase
      .from('user_profile')
      .select('user_id, employee_id, first_name, last_name')
      .in('user_id', userIds);

    const userMap = new Map(
      (users ?? []).map((u: any) => [
        u.user_id,
        { employee_id: u.employee_id, name: `${u.first_name} ${u.last_name}` },
      ]),
    );

    return payslips.map((p: any) => {
      const emp = userMap.get(p.user_id);
      return {
        payroll_id: p.payslip_id,
        employee_id: emp?.employee_id ?? p.user_id,
        employee_name: emp?.name ?? 'Unknown',
        cutoff_date: period.payout_date,
        gross_pay: parseFloat(p.gross_pay) || 0,
        deductions: parseFloat(p.total_deductions) || 0,
        net_pay: parseFloat(p.net_pay) || 0,
        status: this.mapPayslipStatus(p.status),
      };
    });
  }

  // ──────────────────────────────────────────────────────────────
  // HR: Run (generate) payroll for a cutoff date
  // POST /payroll/cutoff/run   { cutoff_date: "YYYY-MM-DD" }
  // ──────────────────────────────────────────────────────────────
  async runPayrollCutoff(companyId: string, actorId: string, cutoffDate: string) {
    const supabase = this.supabaseService.getClient();

    if (!cutoffDate || !/^\d{4}-\d{2}-\d{2}$/.test(cutoffDate)) {
      throw new BadRequestException('cutoff_date must be YYYY-MM-DD format.');
    }

    // Find or create a payroll period for this cutoff
    let period: any;

    const { data: existing } = await supabase
      .from('cnb_payroll_periods')
      .select('*')
      .eq('company_id', companyId)
      .eq('payout_date', cutoffDate)
      .maybeSingle();

    if (existing) {
      if (existing.status === 'Processed') {
        throw new BadRequestException(
          `Payroll for cutoff ${cutoffDate} has already been processed.`,
        );
      }
      period = existing;
    } else {
      // Auto-create a period if one doesn't exist
      const cutoffEnd = new Date(cutoffDate);
      const cutoffStart = new Date(cutoffEnd);
      cutoffStart.setDate(1); // default: 1st of the month

      const { data: created, error: createErr } = await supabase
        .from('cnb_payroll_periods')
        .insert({
          period_id: crypto.randomUUID(),
          company_id: companyId,
          cutoff_start_date: cutoffStart.toISOString().split('T')[0],
          cutoff_end_date: cutoffDate,
          payout_date: cutoffDate,
          status: 'Draft',
          processed_by: actorId,
        })
        .select()
        .single();

      if (createErr) throw new Error(createErr.message);
      period = created;
    }

    // Get all active employees for this company
    const { data: employees, error: empErr } = await supabase
      .from('user_profile')
      .select('user_id, employee_id, first_name, last_name')
      .eq('company_id', companyId)
      .eq('account_status', 'Active');

    if (empErr) throw new Error(empErr.message);
    if (!employees || employees.length === 0) {
      throw new BadRequestException('No active employees found for payroll generation.');
    }

    // Mark period as Processing
    await supabase
      .from('cnb_payroll_periods')
      .update({ status: 'Processing', processed_by: actorId })
      .eq('period_id', period.period_id);

    let generated = 0;
    let skipped = 0;

    for (const employee of employees) {
      // Skip if payslip already exists for this period
      const { data: existingSlip } = await supabase
        .from('cnb_payslips')
        .select('payslip_id')
        .eq('period_id', period.period_id)
        .eq('user_id', employee.user_id)
        .maybeSingle();

      if (existingSlip) { skipped++; continue; }

      try {
        await this.generatePayslipForEmployee(
          supabase,
          employee.user_id,
          companyId,
          period,
        );
        generated++;
      } catch (err) {
        this.logger.warn(
          `Skipped payslip for ${employee.user_id}: ${(err as Error).message}`,
        );
        skipped++;
      }
    }

    // Mark period as Processed
    await supabase
      .from('cnb_payroll_periods')
      .update({
        status: 'Processed',
        processed_at: new Date().toISOString(),
      })
      .eq('period_id', period.period_id);

    // Write audit trail
    await supabase.from('cnb_audit_trail').insert({
      audit_id: crypto.randomUUID(),
      company_id: companyId,
      actor_id: actorId,
      action_type: 'PAYROLL_RUN',
      target_table: 'cnb_payroll_periods',
      target_record_id: period.period_id,
      new_value: JSON.stringify({ cutoff_date: cutoffDate, generated, skipped }),
      timestamp: new Date().toISOString(),
    });

    this.logger.log(
      `Payroll run complete — period: ${period.period_id}, generated: ${generated}, skipped: ${skipped}`,
    );

    return {
      message: `Payroll processed for cutoff ${cutoffDate}.`,
      period_id: period.period_id,
      generated,
      skipped,
    };
  }

  // ──────────────────────────────────────────────────────────────
  // INTERNAL: Compute and insert one payslip
  // ──────────────────────────────────────────────────────────────
  private async generatePayslipForEmployee(
    supabase: ReturnType<SupabaseService['getClient']>,
    userId: string,
    companyId: string,
    period: any,
  ) {
    // 1. Latest salary baseline
    const { data: salaryRow } = await supabase
      .from('cnb_salary_baselines')
      .select('basic_salary, pay_frequency')
      .eq('user_id', userId)
      .eq('company_id', companyId)
      .lte('effective_date', period.cutoff_end_date)
      .order('effective_date', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!salaryRow) throw new Error('No salary baseline found.');

    const basicSalary = parseFloat(salaryRow.basic_salary) || 0;

    // 2. Active benefits / allowances
    const { data: benefitRows } = await supabase
      .from('cnb_employee_benefits')
      .select('amount, benefit:benefit_id(benefit_type, taxable)')
      .eq('user_id', userId)
      .lte('effective_date', period.cutoff_end_date);

    let totalAllowances = 0;
    for (const b of benefitRows ?? []) {
      const amt = parseFloat(b.amount) || 0;
      const bType = (b as any).benefit?.benefit_type ?? '';
      if (bType !== 'one_time_incentive') {
        totalAllowances += amt;
      }
    }

    // 3. Gross pay = basic + allowances (simplified; timesheet adjustments can be added here)
    const grossPay = basicSalary + totalAllowances;

    // 4. Tax deduction via tax brackets
    const taxDeduction = await this.computeTax(supabase, companyId, grossPay, period.cutoff_end_date);

    // 5. Statutory deductions (SSS, PhilHealth, Pag-IBIG) — flat rates as placeholder
    const statutoryDeductions = this.computeStatutory(basicSalary);

    // 6. Total deductions and net pay
    const totalDeductions = taxDeduction + statutoryDeductions;
    const netPay = grossPay - totalDeductions;

    const { error } = await supabase.from('cnb_payslips').insert({
      payslip_id: crypto.randomUUID(),
      period_id: period.period_id,
      user_id: userId,
      company_id: companyId,
      basic_pay_earned: basicSalary.toFixed(2),
      total_allowances: totalAllowances.toFixed(2),
      gross_pay: grossPay.toFixed(2),
      tax_deduction: taxDeduction.toFixed(2),
      statutory_deductions: statutoryDeductions.toFixed(2),
      total_deductions: totalDeductions.toFixed(2),
      net_pay: netPay.toFixed(2),
      status: 'Pending Review',
      employee_ack_status: 'Pending',
    });

    if (error) throw new Error(error.message);
  }

  // ──────────────────────────────────────────────────────────────
  // INTERNAL: Compute income tax from cnb_tax_brackets
  // ──────────────────────────────────────────────────────────────
  private async computeTax(
    supabase: ReturnType<SupabaseService['getClient']>,
    companyId: string,
    grossPay: number,
    referenceDate: string,
  ): Promise<number> {
    const year = new Date(referenceDate).getFullYear();

    const { data: bracket } = await supabase
      .from('cnb_tax_brackets')
      .select('base_tax_amount, min_salary, excess_percentage')
      .eq('company_id', companyId)
      .eq('effective_year', year)
      .lte('min_salary', grossPay)
      .gte('max_salary', grossPay)
      .limit(1)
      .maybeSingle();

    if (!bracket) return 0;

    const excess = grossPay - Number(bracket.min_salary);
    const tax =
      Number(bracket.base_tax_amount) +
      excess * (Number(bracket.excess_percentage) / 100);

    return Math.max(0, tax);
  }

  // ──────────────────────────────────────────────────────────────
  // INTERNAL: Compute statutory deductions (SSS + PhilHealth + Pag-IBIG)
  // Using 2024 Philippine standard rates as defaults
  // ──────────────────────────────────────────────────────────────
  private computeStatutory(basicSalary: number): number {
    // SSS: ~4.5% employee share, capped at ~900/month
    const sss = Math.min(basicSalary * 0.045, 900);
    // PhilHealth: 5% total, employee pays 2.5%, capped at ~2,500/month
    const philhealth = Math.min(basicSalary * 0.025, 2500);
    // Pag-IBIG: 2%, capped at 200/month
    const pagibig = Math.min(basicSalary * 0.02, 200);

    return sss + philhealth + pagibig;
  }

  // ──────────────────────────────────────────────────────────────
  // UTILITY
  // ──────────────────────────────────────────────────────────────
  private formatPayPeriod(start: string, end: string): string {
    const s = new Date(start);
    const e = new Date(end);
    const months = [
      'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
      'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
    ];
    const sMonth = months[s.getMonth()];
    const eMonth = months[e.getMonth()];
    const year = e.getFullYear();

    if (s.getMonth() === e.getMonth()) {
      return `${sMonth} ${s.getDate()}–${e.getDate()}, ${year}`;
    }
    return `${sMonth} ${s.getDate()} – ${eMonth} ${e.getDate()}, ${year}`;
  }

  private mapPayslipStatus(status: string): 'draft' | 'processed' | 'released' {
    const map: Record<string, 'draft' | 'processed' | 'released'> = {
      'Pending Review': 'draft',
      Approved: 'processed',
      Released: 'released',
      'Final Pay': 'released',
    };
    return map[status] ?? 'draft';
  }
}
