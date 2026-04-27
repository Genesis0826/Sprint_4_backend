import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import * as crypto from 'node:crypto';
import { SupabaseService } from '../supabase/supabase.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CnbService } from '../cnb/cnb.service';
import { CreateOffboardingCaseDto } from './dto/create-case.dto';
import { UpdateKnowledgeTransferDto } from './dto/update-knowledge-transfer.dto';
import { UpdateFinalPayDto } from './dto/update-final-pay.dto';
import { ConfigureChecklistTemplateDto } from './dto/configure-checklist-template.dto';

@Injectable()
export class OffboardingService {
  private readonly logger = new Logger(OffboardingService.name);

  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly auditService: AuditService,
    private readonly notificationsService: NotificationsService,
    private readonly cnbService: CnbService,
  ) {}

  private roundCurrency(value: number): number {
    return Math.round(value * 100) / 100;
  }

  private async getFinalSettlementPayslip(caseId: string, companyId: string) {
    const supabase = this.supabaseService.getClient();
    const { data, error } = await supabase
      .from('cnb_payslips')
      .select(
        'payslip_id, basic_pay_earned, total_allowances, gross_pay, tax_deduction, statutory_deductions, total_deductions, net_pay, status, employee_ack_status, created_at, period:period_id(period_id, cutoff_start_date, cutoff_end_date, payout_date, status)',
      )
      .eq('company_id', companyId)
      .ilike('other_deductions', `%\"settlement_case_id\":\"${caseId}\"%`)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw new BadRequestException(error.message);
    return data ?? null;
  }

  private async ensureFinalSettlementPeriod(
    caseId: string,
    companyId: string,
    lastWorkingDay: string,
    processedBy: string,
  ) {
    const supabase = this.supabaseService.getClient();
    const { data: existing, error: existingError } = await supabase
      .from('cnb_payroll_periods')
      .select('period_id')
      .eq('company_id', companyId)
      .eq('payout_date', lastWorkingDay)
      .eq('status', 'Final Settlement')
      .maybeSingle();

    if (existingError) throw new BadRequestException(existingError.message);
    if (existing) return existing.period_id;

    const { data, error } = await supabase
      .from('cnb_payroll_periods')
      .insert({
        period_id: crypto.randomUUID(),
        company_id: companyId,
        cutoff_start_date: lastWorkingDay,
        cutoff_end_date: lastWorkingDay,
        payout_date: lastWorkingDay,
        status: 'Final Settlement',
        processed_by: processedBy,
        processed_at: new Date().toISOString(),
      })
      .select('period_id')
      .single();

    if (error) throw new BadRequestException(error.message);
    return data.period_id;
  }

  private async syncFinalSettlementPayslip(input: {
    caseId: string;
    companyId: string;
    employeeId: string;
    actorId: string;
    lastWorkingDay: string;
    finalPay: {
      salary_balance: number;
      leave_encashment: number;
      additional_pay: number;
      deductions: number;
      total_amount: number;
      status: string;
    };
  }) {
    const supabase = this.supabaseService.getClient();
    const periodId = await this.ensureFinalSettlementPeriod(
      input.caseId,
      input.companyId,
      input.lastWorkingDay,
      input.actorId,
    );

    const breakdown = {
      settlement_case_id: input.caseId,
      settlement_type: 'offboarding_final_pay',
      leave_encashment: this.roundCurrency(input.finalPay.leave_encashment),
      additional_pay: this.roundCurrency(input.finalPay.additional_pay),
      deductions: this.roundCurrency(input.finalPay.deductions),
    };

    const payslipPayload = {
      period_id: periodId,
      user_id: input.employeeId,
      company_id: input.companyId,
      basic_pay_earned: String(this.roundCurrency(input.finalPay.salary_balance)),
      total_allowances: String(this.roundCurrency(input.finalPay.leave_encashment + input.finalPay.additional_pay)),
      gross_pay: String(this.roundCurrency(
        input.finalPay.salary_balance +
        input.finalPay.leave_encashment +
        input.finalPay.additional_pay,
      )),
      tax_deduction: '0',
      statutory_deductions: '0',
      other_deductions: JSON.stringify(breakdown),
      total_deductions: String(this.roundCurrency(input.finalPay.deductions)),
      net_pay: String(this.roundCurrency(input.finalPay.total_amount)),
      status: input.finalPay.status === 'Transfer Confirmed' ? 'Transfer Confirmed' : 'Final Pay',
      employee_ack_status: 'Pending',
    };

    const { data: existing, error: existingError } = await supabase
      .from('cnb_payslips')
      .select('payslip_id, employee_ack_status, acknowledged_at')
      .eq('period_id', periodId)
      .eq('user_id', input.employeeId)
      .maybeSingle();
    if (existingError) throw new BadRequestException(existingError.message);

    const query = existing
      ? supabase
          .from('cnb_payslips')
          .update({
            ...payslipPayload,
            employee_ack_status: existing.employee_ack_status ?? 'Pending',
            acknowledged_at: existing.acknowledged_at ?? null,
          })
          .eq('payslip_id', existing.payslip_id)
      : supabase
          .from('cnb_payslips')
          .insert({
            payslip_id: crypto.randomUUID(),
            ...payslipPayload,
          });

    const { data, error } = await query.select('*').single();
    if (error) throw new BadRequestException(error.message);
    return data;
  }

  private async getLinkedPayrollReference(
    employeeId: string,
    companyId: string,
    lastWorkingDay?: string | null,
  ) {
    const supabase = this.supabaseService.getClient();
    let query = supabase
      .from('cnb_payslips')
      .select(
        'payslip_id, net_pay, gross_pay, total_deductions, created_at, status, period:period_id(period_id, cutoff_start_date, cutoff_end_date, payout_date)',
      )
      .eq('user_id', employeeId)
      .eq('company_id', companyId)
      .not('other_deductions', 'ilike', '%"settlement_type":"offboarding_final_pay"%')
      .order('created_at', { ascending: false });

    const { data, error } = await query.limit(1).maybeSingle();
    if (error) throw new BadRequestException(error.message);
    return data ?? null;
  }

  private async recomputeFinalPayFromCompensation(caseId: string) {
    const supabase = this.supabaseService.getClient();
    const { data: offboardingCase } = await supabase
      .from('offboarding_cases')
      .select('case_id, employee_id, initiated_by_id, last_working_day')
      .eq('case_id', caseId)
      .maybeSingle();

    if (!offboardingCase) {
      throw new NotFoundException('Offboarding case not found.');
    }

    const { data: employee } = await supabase
      .from('user_profile')
      .select('company_id')
      .eq('user_id', (offboardingCase as any).employee_id)
      .maybeSingle();

    const companyId = (employee as any)?.company_id;
    if (!companyId) {
      throw new BadRequestException('Employee company context is missing.');
    }
    if (!(offboardingCase as any).last_working_day) {
      throw new BadRequestException('Last working day is required before computing final pay.');
    }

    const computed = await this.cnbService.computeOffboardingFinalPay(
      (offboardingCase as any).employee_id,
      companyId,
      (offboardingCase as any).last_working_day,
    );

    const payload = {
      case_id: caseId,
      salary_balance: computed.salary_balance,
      leave_encashment: computed.leave_encashment,
      additional_pay: computed.additional_pay,
      deductions: computed.deductions,
      total_amount: computed.total_amount,
      status: 'Ready for Review',
    };

    const { data, error } = await supabase
      .from('final_pay')
      .upsert(payload, { onConflict: 'case_id' })
      .select('*')
      .single();

    if (error) throw new BadRequestException(error.message);

    const settlement_payslip = await this.syncFinalSettlementPayslip({
      caseId,
      companyId,
      employeeId: (offboardingCase as any).employee_id,
      actorId: (offboardingCase as any).initiated_by_id ?? (offboardingCase as any).employee_id,
      lastWorkingDay: (offboardingCase as any).last_working_day,
      finalPay: {
        salary_balance: computed.salary_balance,
        leave_encashment: computed.leave_encashment,
        additional_pay: computed.additional_pay,
        deductions: computed.deductions,
        total_amount: computed.total_amount,
        status: 'Ready for Review',
      },
    });

    return {
      ...(data as any),
      computed_breakdown: computed.breakdown,
      settlement_payslip,
    };
  }

  // =========================================================
  // SYSTEM ADMIN — Tenant module + role permissions
  // =========================================================

  async enableOffboardingModule(companyId: string, performedBy: string) {
    const supabase = this.supabaseService.getClient();
    const { error } = await supabase
      .from('tenant_modules')
      .upsert({ company_id: companyId, module_name: 'offboarding', status: 'Active' },
        { onConflict: 'company_id,module_name' });
    if (error) throw new BadRequestException(error.message);

    this.auditService.log(`OFFBOARDING_MODULE_ENABLED for company ${companyId}`, performedBy, companyId)
      .catch(err => this.logger.error('Audit failed in enableOffboardingModule', err));

    return { message: 'Offboarding module enabled', company_id: companyId, status: 'Active' };
  }

  async disableOffboardingModule(companyId: string, performedBy: string) {
    const supabase = this.supabaseService.getClient();
    const { error } = await supabase
      .from('tenant_modules')
      .upsert({ company_id: companyId, module_name: 'offboarding', status: 'Inactive' },
        { onConflict: 'company_id,module_name' });
    if (error) throw new BadRequestException(error.message);

    this.auditService.log(`OFFBOARDING_MODULE_DISABLED for company ${companyId}`, performedBy, companyId)
      .catch(err => this.logger.error('Audit failed in disableOffboardingModule', err));

    return { message: 'Offboarding module disabled', company_id: companyId, status: 'Inactive' };
  }

  async getOffboardingAuditLogs(filters?: { company_id?: string; employee_id?: string }) {
    const supabase = this.supabaseService.getClient();
    let query = supabase
      .from('admin_audit_logs')
      .select('*, performer:user_profile!admin_audit_logs_performed_by_fkey(first_name, last_name)')
      .ilike('action', 'OFFBOARDING%')
      .order('timestamp', { ascending: false })
      .limit(100);

    if (filters?.company_id) query = (query as any).eq('company_id', filters.company_id);
    if (filters?.employee_id) query = (query as any).eq('target_user_id', filters.employee_id);

    const { data, error } = await query;
    if (error) throw new BadRequestException(error.message);
    return data ?? [];
  }

  // =========================================================
  // HR — Checklist Template Configuration (Phase 1)
  // =========================================================

  async configureChecklistTemplate(dto: ConfigureChecklistTemplateDto, companyId: string, hrUserId: string) {
    const supabase = this.supabaseService.getClient();
    const templateId = crypto.randomUUID();

    const { data: template, error: tErr } = await supabase
      .from('offboarding_checklist_templates')
      .insert({
        template_id: templateId,
        company_id: companyId,
        template_name: dto.template_name,
        employee_type: dto.employee_type ?? null,
        created_by: hrUserId,
      })
      .select().single();
    if (tErr) throw new BadRequestException(tErr.message);

    if (dto.items?.length > 0) {
      const rows = dto.items.map(item => ({
        item_id: crypto.randomUUID(),
        template_id: templateId,
        item_name: item.item_name,
        description: item.description ?? null,
        is_required: item.is_required,
      }));
      const { error: iErr } = await supabase.from('offboarding_checklist_template_items').insert(rows);
      if (iErr) throw new BadRequestException(iErr.message);
    }

    this.auditService.log(`OFFBOARDING_TEMPLATE_CREATED: ${dto.template_name}`, hrUserId, companyId)
      .catch(err => this.logger.error('Audit failed in configureChecklistTemplate', err));

    return { ...template, items: dto.items };
  }

  async getChecklistTemplates(companyId: string) {
    const supabase = this.supabaseService.getClient();
    const { data, error } = await supabase
      .from('offboarding_checklist_templates')
      .select('*, offboarding_checklist_template_items(*)')
      .eq('company_id', companyId)
      .order('created_at', { ascending: false });
    if (error) throw new BadRequestException(error.message);
    return data ?? [];
  }

  // =========================================================
  // CASES — Create, Read, Status
  // =========================================================

  async createCase(dto: CreateOffboardingCaseDto, initiatedById: string) {
    const supabase = this.supabaseService.getClient();

    // 1. Validate employee exists + get company_id
    const { data: employee, error: empErr } = await supabase
      .from('user_profile')
      .select('user_id, first_name, last_name, company_id, email, department_id')
      .eq('user_id', dto.employee_id)
      .maybeSingle();
    if (empErr || !employee) throw new NotFoundException('Employee not found.');

    // 2. Check no active case already exists
    const { data: existing } = await supabase
      .from('offboarding_cases')
      .select('case_id')
      .eq('employee_id', dto.employee_id)
      .not('status', 'in', '("Completed","Rejected")')
      .maybeSingle();
    if (existing) throw new BadRequestException('Employee already has an active offboarding case.');

    // 3. Insert main case — initial status is 'Submitted' (Pending in callflow)
    const { data: newCase, error: caseErr } = await supabase
      .from('offboarding_cases')
      .insert({
        employee_id: dto.employee_id,
        initiated_by_id: initiatedById,
        offboarding_type: dto.offboarding_type,
        last_working_day: dto.last_working_day,
        status: 'Submitted',
      })
      .select().single();
    if (caseErr) throw new BadRequestException(caseErr.message);

    const caseId = (newCase as any).case_id;
    const emp = employee as any;
    const employeeName = `${emp.first_name} ${emp.last_name}`;

    // 4. Insert resignation or termination details
    if (dto.offboarding_type === 'Resignation' && dto.resignation) {
      await supabase.from('resignation_details').insert({ case_id: caseId, ...dto.resignation });
    }
    if (dto.offboarding_type === 'Termination' && dto.termination) {
      await supabase.from('termination_details').insert({ case_id: caseId, ...dto.termination });
    }

    // 5. Seed knowledge_transfer row
    await supabase.from('knowledge_transfer').insert({ case_id: caseId });

    // 6. Seed final_pay row
    await supabase.from('final_pay').insert({ case_id: caseId });

    // 7. Seed default system_access rows
    const defaultSystems = ['Email', 'HRIS System', 'Timekeeping System'];
    await supabase.from('system_access').insert(
      defaultSystems.map(s => ({ case_id: caseId, system_name: s })),
    );

    // 8. Notify HR AND Manager simultaneously (callflow: Employee Phase 1)
    this.notificationsService.notifyAllHRInCompany(emp.company_id, {
      type: 'OFFBOARDING_SUBMITTED',
      title: 'New Offboarding Case',
      message: `${employeeName} has submitted an offboarding request (${dto.offboarding_type}).`,
      metadata: { case_id: caseId, employee_id: dto.employee_id },
    }).catch(err => this.logger.error('Failed to notify HR in createCase', err));

    // FIX #2: Notify manager — look up the employee's direct manager and notify them
    // role_name lives in the role table (joined via role_id), not directly on user_profile
    if (emp.department_id) {
      const { data: managers } = await supabase
        .from('user_profile')
        .select('user_id, role:role_id(role_name)')
        .eq('company_id', emp.company_id)
        .eq('department_id', emp.department_id)
        .then(res => ({
          ...res,
          data: (res.data ?? []).filter((u: any) => u.role?.role_name === 'Manager'),
        }));
      if (managers && managers.length > 0) {
        await Promise.allSettled(
          (managers as any[]).map(mgr =>
            this.notificationsService.createNotification({
              userId: mgr.user_id,
              companyId: emp.company_id,
              type: 'OFFBOARDING_SUBMITTED',
              title: 'Team Member Resignation Submitted',
              message: `${employeeName} has submitted a resignation request. Please acknowledge it in the offboarding section.`,
              metadata: { case_id: caseId, employee_id: dto.employee_id },
            }).catch(err => this.logger.error('Failed to notify manager in createCase', err))
          )
        );
      }
    }

    // Audit
    this.auditService.log(
      `OFFBOARDING_CASE_CREATED: case ${caseId} type=${dto.offboarding_type}`,
      initiatedById, emp.company_id, dto.employee_id,
    ).catch(err => this.logger.error('Audit failed in createCase', err));

    this.logger.log(`Offboarding case created: ${caseId}`);
    return newCase;
  }

  async getMyCaseByEmployeeId(userId: string) {
    const supabase = this.supabaseService.getClient();
    const { data } = await supabase
      .from('offboarding_cases')
      .select('case_id')
      .eq('employee_id', userId)
      .order('created_at', { ascending: false })
      .limit(1).maybeSingle();
    if (!data) return null;
    return this.getCaseById((data as any).case_id);
  }

  async getAllCases(filters?: { status?: string; offboarding_type?: string }) {
    const supabase = this.supabaseService.getClient();
    let query = supabase.from('offboarding_cases').select('*').order('created_at', { ascending: false });
    if (filters?.status) query = (query as any).eq('status', filters.status);
    if (filters?.offboarding_type) query = (query as any).eq('offboarding_type', filters.offboarding_type);

    const { data: cases, error } = await query;
    if (error) throw new BadRequestException(error.message);

    return Promise.all((cases ?? []).map(async (c: any) => {
      const { data: emp } = await supabase
        .from('user_profile').select('first_name, last_name').eq('user_id', c.employee_id).maybeSingle();
      return { ...c, employee_name: emp ? `${(emp as any).first_name} ${(emp as any).last_name}` : null };
    }));
  }

  async getCaseById(caseId: string) {
    const supabase = this.supabaseService.getClient();
    const { data: c, error } = await supabase
      .from('offboarding_cases').select('*').eq('case_id', caseId).maybeSingle();
    if (error || !c) throw new NotFoundException('Offboarding case not found.');

    const { data: emp } = await supabase
      .from('user_profile').select('first_name, last_name, company_id').eq('user_id', (c as any).employee_id).maybeSingle();

    const [resignation, termination, checklist, kt, systemAccess, finalPay, clearance, vacantPosition] = await Promise.all([
      supabase.from('resignation_details').select('*').eq('case_id', caseId).maybeSingle().then(r => r.data),
      supabase.from('termination_details').select('*').eq('case_id', caseId).maybeSingle().then(r => r.data),
      supabase.from('checklist_items').select('*').eq('case_id', caseId).then(r => r.data ?? []),
      supabase.from('knowledge_transfer').select('*').eq('case_id', caseId).maybeSingle().then(r => r.data),
      supabase.from('system_access').select('*').eq('case_id', caseId).then(r => r.data ?? []),
      supabase.from('final_pay').select('*').eq('case_id', caseId).maybeSingle().then(r => r.data),
      supabase.from('clearance_documents').select('*').eq('case_id', caseId).then(r => r.data ?? []),
      supabase.from('offboarding_vacant_positions').select('status, job_posting_id').eq('case_id', caseId).maybeSingle().then(r => r.data),
    ]);

    const payroll_reference = await this.getLinkedPayrollReference(
      (c as any).employee_id,
      (emp as any)?.company_id ?? '',
      (c as any).last_working_day ?? null,
    );
    const settlement_payslip = await this.getFinalSettlementPayslip(
      caseId,
      (emp as any)?.company_id ?? '',
    );

    return {
      ...(c as any),
      employee_name: emp ? `${(emp as any).first_name} ${(emp as any).last_name}` : null,
      resignation_details: resignation ?? null,
      termination_details: termination ?? null,
      checklist_items: checklist,
      knowledge_transfer: kt ?? null,
      system_access: systemAccess,
      final_pay: finalPay ? { ...(finalPay as any), payroll_reference, settlement_payslip } : null,
      clearance_documents: clearance,
      vacant_position: vacantPosition ?? null,
    };
  }

  // =========================================================
  // HR — Accept or Reject Resignation (Phase 3)
  // =========================================================

  async acceptRejectCase(caseId: string, action: string, hrUserId: string, rejectionReason?: string) {
    const supabase = this.supabaseService.getClient();

    const { data: c } = await supabase
      .from('offboarding_cases').select('*').eq('case_id', caseId).maybeSingle();
    if (!c) throw new NotFoundException('Case not found.');
    if ((c as any).status !== 'Submitted' && (c as any).status !== 'Manager_Acknowledged') {
      throw new BadRequestException('Case must be in Submitted or Manager_Acknowledged status to accept/reject.');
    }
    if (action === 'Rejected' && !rejectionReason) {
      throw new BadRequestException('rejection_reason is required when rejecting a case.');
    }

    const newStatus = action === 'Accepted' ? 'HR_Accepted' : 'Rejected';
    const { error } = await supabase
      .from('offboarding_cases')
      .update({ status: newStatus, updated_at: new Date().toISOString(),
        ...(action === 'Rejected' ? { rejection_reason: rejectionReason } : {}) })
      .eq('case_id', caseId);
    if (error) throw new BadRequestException(error.message);

    const { data: emp } = await supabase
      .from('user_profile').select('company_id, email, first_name, last_name').eq('user_id', (c as any).employee_id).maybeSingle();
    const companyId = (emp as any)?.company_id ?? '';

    // Notify employee of acceptance or rejection
    this.notificationsService.createNotification({
      userId: (c as any).employee_id,
      companyId,
      type: action === 'Accepted' ? 'OFFBOARDING_ACCEPTED' : 'OFFBOARDING_REJECTED',
      title: action === 'Accepted' ? 'Resignation Accepted' : 'Resignation Rejected',
      message: action === 'Accepted'
        ? 'Your resignation has been formally accepted. Your offboarding checklist is now available.'
        : `Your resignation has been rejected. Reason: ${rejectionReason}`,
      metadata: { case_id: caseId },
    }).catch(err => this.logger.error('Notification failed in acceptRejectCase', err));

    // If accepted: generate checklist from template
    if (action === 'Accepted') {
      await this.generateChecklistFromTemplate(caseId, (c as any).employee_id, companyId);
      await this.recomputeFinalPayFromCompensation(caseId);
    }

    this.auditService.log(
      `OFFBOARDING_CASE_${action.toUpperCase()}: case ${caseId}${action === 'Rejected' ? ` reason: ${rejectionReason}` : ''}`,
      hrUserId, companyId, (c as any).employee_id,
    ).catch(err => this.logger.error('Audit failed in acceptRejectCase', err));

    this.logger.log(`Case ${caseId} ${action} by HR ${hrUserId}`);
    return { case_id: caseId, status: newStatus };
  }

  // Auto-generate checklist from template on acceptance
  private async generateChecklistFromTemplate(caseId: string, employeeId: string, companyId: string) {
    const supabase = this.supabaseService.getClient();

    // Get company's checklist template
    const { data: template } = await supabase
      .from('offboarding_checklist_templates')
      .select('template_id')
      .eq('company_id', companyId)
      .order('created_at', { ascending: false })
      .limit(1).maybeSingle();

    if (!template) {
      this.logger.warn(`No checklist template found for company ${companyId}. Using defaults.`);
      // Fall back to default items
      const defaults = [
        'Return laptop/device', 'Return company ID / access card',
        'Knowledge transfer documentation', 'Clear personal files from company systems',
        'Return parking pass (if applicable)',
      ];
      await supabase.from('checklist_items').insert(
        defaults.map(name => ({ case_id: caseId, item_name: name, status: 'Pending' }))
      );
      return;
    }

    const { data: templateItems } = await supabase
      .from('offboarding_checklist_template_items')
      .select('*')
      .eq('template_id', (template as any).template_id);

    if (templateItems && templateItems.length > 0) {
      await supabase.from('checklist_items').insert(
        templateItems.map((ti: any) => ({
          case_id: caseId,
          item_name: ti.item_name,
          status: 'Pending',
        }))
      );
    }

    // Notify employee that checklist has been assigned
    this.notificationsService.createNotification({
      userId: employeeId, companyId,
      type: 'OFFBOARDING_CHECKLIST_ASSIGNED',
      title: 'Offboarding Checklist Assigned',
      message: 'Your offboarding checklist has been generated. Please complete all items before your last working day.',
      metadata: { case_id: caseId },
    }).catch(err => this.logger.error('Failed to notify employee of checklist', err));
  }

  // =========================================================
  // STATUS — General update (Manager acknowledge, HR complete)
  // =========================================================

  async updateStatus(caseId: string, newStatus: string, user: { sub_userid: string; role_name: string }) {
    const supabase = this.supabaseService.getClient();

    const { data: c } = await supabase
      .from('offboarding_cases').select('*').eq('case_id', caseId).maybeSingle();
    if (!c) throw new NotFoundException('Case not found.');

    // Validate transition order
    const order = ['Submitted', 'Manager_Acknowledged', 'HR_Accepted', 'Completed'];
    const currentIdx = order.indexOf((c as any).status);
    const newIdx = order.indexOf(newStatus);
    if (newIdx !== currentIdx + 1) {
      throw new BadRequestException(
        `Cannot transition from "${(c as any).status}" to "${newStatus}". Must follow: ${order.join(' → ')}`,
      );
    }

    // Role permission per transition
    const hrRoles = ['HR Officer', 'HR Recruiter', 'Admin', 'System Admin'];
    const managerRoles = ['Manager', ...hrRoles];
    if (newStatus === 'Manager_Acknowledged' && !managerRoles.includes(user.role_name)) {
      throw new ForbiddenException('Only a Manager or HR can acknowledge the case.');
    }
    if (['HR_Accepted', 'Completed'].includes(newStatus) && !hrRoles.includes(user.role_name)) {
      throw new ForbiddenException('Only HR can set this status.');
    }

    // Pre-completion checks
    if (newStatus === 'Completed') {
      await this.validateCompletionReadiness(caseId);
    }

    const { data: updated, error } = await supabase
      .from('offboarding_cases')
      .update({ status: newStatus, updated_at: new Date().toISOString() })
      .eq('case_id', caseId).select().single();
    if (error) throw new BadRequestException(error.message);

    const { data: emp } = await supabase
      .from('user_profile').select('company_id').eq('user_id', (c as any).employee_id).maybeSingle();
    const companyId = (emp as any)?.company_id ?? '';

    // If Manager_Acknowledged → notify HR
    if (newStatus === 'Manager_Acknowledged') {
      this.notificationsService.notifyAllHRInCompany(companyId, {
        type: 'OFFBOARDING_MANAGER_ACKNOWLEDGED',
        title: 'Manager Acknowledged Offboarding',
        message: `The manager has acknowledged the offboarding case. Please formally process it.`,
        metadata: { case_id: caseId },
      }).catch(err => this.logger.error('Failed to notify HR in updateStatus', err));
    }

    // If Completed → deactivate employee + trigger job posting
    if (newStatus === 'Completed') {
      await this.deactivateEmployee((c as any).employee_id, user.sub_userid, companyId, caseId);
    }

    // Notify employee of status change
    this.notificationsService.createNotification({
      userId: (c as any).employee_id, companyId,
      type: 'OFFBOARDING_STATUS_UPDATED',
      title: 'Offboarding Status Updated',
      message: `Your offboarding status has been updated to: ${newStatus}`,
      metadata: { case_id: caseId, status: newStatus },
    }).catch(err => this.logger.error('Notification failed in updateStatus', err));

    this.auditService.log(
      `OFFBOARDING_STATUS_UPDATED: case ${caseId} → ${newStatus}`,
      user.sub_userid, companyId, (c as any).employee_id,
    ).catch(err => this.logger.error('Audit failed in updateStatus', err));

    this.logger.log(`Case ${caseId} → ${newStatus}`);
    return updated;
  }

  private async validateCompletionReadiness(caseId: string): Promise<void> {
    const supabase = this.supabaseService.getClient();
    const issues: string[] = [];

    const { data: checklistItems } = await supabase
      .from('checklist_items').select('status').eq('case_id', caseId);
    const incomplete = (checklistItems ?? []).filter((i: any) => i.status !== 'Verified' && i.status !== 'Completed');
    if (incomplete.length > 0) issues.push(`${incomplete.length} checklist item(s) not yet verified`);

    const { data: kt } = await supabase
      .from('knowledge_transfer').select('status').eq('case_id', caseId).maybeSingle();
    if (!kt || (kt as any).status !== 'Signed Off') issues.push('Knowledge transfer not signed off');

    const { data: systems } = await supabase
      .from('system_access').select('status').eq('case_id', caseId);
    const active = (systems ?? []).filter((s: any) => s.status !== 'Revoked');
    if (active.length > 0) issues.push(`${active.length} system access record(s) not revoked`);

    const { data: pay } = await supabase
      .from('final_pay').select('status').eq('case_id', caseId).maybeSingle();
    if (!pay || !['Payment Released', 'Transfer Confirmed'].includes((pay as any).status)) {
      issues.push('Final pay not released');
    }

    if (issues.length > 0) {
      throw new BadRequestException(
        `Cannot complete case. Resolve these first: ${issues.join('; ')}.`
      );
    }
  }

  // =========================================================
  // EMPLOYEE DEACTIVATION + VACANCY TRIGGER (Phase 14 / Touchpoint Out 2)
  // =========================================================

  private async deactivateEmployee(employeeId: string, performedBy: string, companyId: string, caseId: string) {
    const supabase = this.supabaseService.getClient();

    // 1. Set employee account_status = Inactive, offboarding_status = Ended
    await supabase
      .from('user_profile')
      .update({ account_status: 'Inactive', offboarding_status: 'Ended', offboarded_at: new Date().toISOString() })
      .eq('user_id', employeeId);

    // 2. Get employee's position/department for job posting trigger
    const { data: emp } = await supabase
      .from('user_profile')
      .select('first_name, last_name, department_id, email')
      .eq('user_id', employeeId).maybeSingle();

    // 3. Create a vacant position record for HR to review and re-open
    // Always insert regardless of department_id — row must exist for triggerJobPosting to work
    await supabase.from('offboarding_vacant_positions').insert({
      case_id: caseId,
      employee_id: employeeId,
      department_id: (emp as any)?.department_id ?? null,
      company_id: companyId,
      status: 'Pending Review',
      created_at: new Date().toISOString(),
    });

    this.auditService.log(
      `OFFBOARDING_EMPLOYEE_DEACTIVATED: employee ${employeeId}`,
      performedBy, companyId, employeeId,
    ).catch(err => this.logger.error('Audit failed in deactivateEmployee', err));

    this.logger.log(`Employee ${employeeId} deactivated after offboarding completion`);
  }

  // =========================================================
  // HR — Flag Vacancy + Trigger Job Posting (Phase 13)
  // =========================================================

  async triggerJobPosting(caseId: string, hrUserId: string) {
    const supabase = this.supabaseService.getClient();

    const { data: c } = await supabase
      .from('offboarding_cases').select('employee_id').eq('case_id', caseId).maybeSingle();
    if (!c) throw new NotFoundException('Case not found.');

    const { data: emp } = await supabase
      .from('user_profile')
      .select('first_name, last_name, department_id, company_id')
      .eq('user_id', (c as any).employee_id).maybeSingle();
    if (!emp) throw new NotFoundException('Employee profile not found.');

    const e = emp as any;
    const positionTitle = `${e.first_name} ${e.last_name}'s Vacated Position`;

    // Create job posting in recruitment module
    const jobPostingId = crypto.randomUUID();
    const { error: jpErr } = await supabase.from('job_postings').insert({
      job_posting_id: jobPostingId,
      company_id: e.company_id,
      title: positionTitle,
      description: `Position vacated due to offboarding of ${e.first_name} ${e.last_name}.`,
      department_id: e.department_id ?? null,
      status: 'open',
      posted_at: new Date().toISOString(),
    });
    if (jpErr) throw new BadRequestException(jpErr.message);

    // Update vacant position to Opened
    await supabase.from('offboarding_vacant_positions')
      .update({ status: 'Opened', job_posting_id: jobPostingId })
      .eq('case_id', caseId);

    // Notify HR of re-opened position
    this.notificationsService.notifyAllHRInCompany(e.company_id, {
      type: 'OFFBOARDING_POSITION_REOPENED',
      title: 'Vacant Position Re-Opened',
      message: `The position vacated by ${e.first_name} ${e.last_name} has been re-opened for recruitment.`,
      metadata: { case_id: caseId, job_posting_id: jobPostingId },
    }).catch(err => this.logger.error('Notification failed in triggerJobPosting', err));

    // FIX #5: Notify managers in the same department that the position is now open for hiring
    // role_name lives in the role table (joined via role_id), not directly on user_profile
    if (e.department_id) {
      const { data: managers } = await supabase
        .from('user_profile')
        .select('user_id, role:role_id(role_name)')
        .eq('company_id', e.company_id)
        .eq('department_id', e.department_id)
        .then(res => ({
          ...res,
          data: (res.data ?? []).filter((u: any) => u.role?.role_name === 'Manager'),
        }));
      if (managers && managers.length > 0) {
        await Promise.allSettled(
          (managers as any[]).map(mgr =>
            this.notificationsService.createNotification({
              userId: mgr.user_id,
              companyId: e.company_id,
              type: 'OFFBOARDING_POSITION_REOPENED',
              title: 'Vacant Position Re-Opened for Recruitment',
              message: `The position vacated by ${e.first_name} ${e.last_name} in your team has been re-opened. The hiring process will begin shortly.`,
              metadata: { case_id: caseId, job_posting_id: jobPostingId },
            }).catch(err => this.logger.error('Failed to notify manager of re-opened position', err))
          )
        );
      }
    }

    this.auditService.log(
      `OFFBOARDING_JOB_POSTING_TRIGGERED: case ${caseId} posting ${jobPostingId}`,
      hrUserId, e.company_id, (c as any).employee_id,
    ).catch(err => this.logger.error('Audit failed in triggerJobPosting', err));

    return { message: 'Job posting created', job_posting_id: jobPostingId };
  }

  // =========================================================
  // CHECKLIST
  // =========================================================

  async getChecklist(caseId: string) {
    const { data, error } = await this.supabaseService.getClient()
      .from('checklist_items').select('*').eq('case_id', caseId);
    if (error) throw new BadRequestException(error.message);
    return data ?? [];
  }

  async addChecklistItem(caseId: string, itemName: string) {
    if (!itemName?.trim()) throw new BadRequestException('item_name is required.');
    const { data, error } = await this.supabaseService.getClient()
      .from('checklist_items')
      .insert({ case_id: caseId, item_name: itemName.trim(), status: 'Pending' })
      .select().single();
    if (error) throw new BadRequestException(error.message);
    return data;
  }

  async updateChecklistItem(itemId: string, status: string, userId: string) {
    const supabase = this.supabaseService.getClient();

    const { data: item } = await supabase
      .from('checklist_items').select('item_id, case_id').eq('item_id', itemId).maybeSingle();
    if (!item) throw new NotFoundException('Checklist item not found.');

    // Callflow statuses: Pending → Submitted (employee) → Verified / Disputed (HR)
    const update: Record<string, any> = { status };
    if (status === 'Verified' || status === 'Completed') {
      update.cleared_by_id = userId;
      update.cleared_at = new Date().toISOString();
    } else if (status === 'Pending') {
      update.cleared_by_id = null;
      update.cleared_at = null;
    }

    const { data, error } = await supabase
      .from('checklist_items').update(update).eq('item_id', itemId).select().single();
    if (error) throw new BadRequestException(error.message);

    // If all items verified → notify employee (callflow: Employee Phase 6)
    if (status === 'Verified') {
      const { data: allItems } = await supabase
        .from('checklist_items').select('status').eq('case_id', (item as any).case_id);
      const allVerified = (allItems ?? []).every((i: any) => i.status === 'Verified' || i.status === 'Completed');
      if (allVerified) {
        const { data: c } = await supabase
          .from('offboarding_cases').select('employee_id').eq('case_id', (item as any).case_id).maybeSingle();
        if (c) {
          const { data: emp } = await supabase
            .from('user_profile').select('company_id').eq('user_id', (c as any).employee_id).maybeSingle();
          this.notificationsService.createNotification({
            userId: (c as any).employee_id,
            companyId: (emp as any)?.company_id ?? '',
            type: 'OFFBOARDING_CHECKLIST_COMPLETE',
            title: 'Clearance Process Complete',
            message: 'All your offboarding checklist items have been verified. Clearance confirmed.',
            metadata: { case_id: (item as any).case_id },
          }).catch(err => this.logger.error('Failed to notify checklist complete', err));
        }
      }
    }

    // Log to activity logs
    this.auditService.log(
      `OFFBOARDING_CHECKLIST_ITEM_UPDATED: item ${itemId} → ${status}`,
      userId, '', '',
    ).catch(err => this.logger.error('Audit failed in updateChecklistItem', err));

    return data;
  }

  // Employee acknowledges return of company asset (callflow: Employee Phase 5)
  async acknowledgeAssetReturn(itemId: string, employeeId: string) {
    const supabase = this.supabaseService.getClient();
    const { data: item } = await supabase
      .from('checklist_items').select('item_id, case_id').eq('item_id', itemId).maybeSingle();
    if (!item) throw new NotFoundException('Checklist item not found.');

    const { data, error } = await supabase
      .from('checklist_items')
      .update({ status: 'Submitted' })
      .eq('item_id', itemId).select().single();
    if (error) throw new BadRequestException(error.message);

    this.auditService.log(
      `OFFBOARDING_ASSET_RETURN_ACKNOWLEDGED: item ${itemId}`,
      employeeId, '', '',
    ).catch(err => this.logger.error('Audit failed in acknowledgeAssetReturn', err));

    return data;
  }

  // =========================================================
  // KNOWLEDGE TRANSFER
  // =========================================================

  async getKnowledgeTransfer(caseId: string) {
    const { data, error } = await this.supabaseService.getClient()
      .from('knowledge_transfer').select('*').eq('case_id', caseId).maybeSingle();
    if (error) throw new BadRequestException(error.message);
    return data;
  }

  async updateKnowledgeTransfer(caseId: string, dto: UpdateKnowledgeTransferDto, userId: string) {
    const supabase = this.supabaseService.getClient();
    const update: Record<string, any> = {};
    if (dto.transfer_notes !== undefined) update.transfer_notes = dto.transfer_notes;
    if (dto.action === 'sign_off') {
      update.status = 'Signed Off';
      update.signed_off_by_id = userId;
      update.signed_off_at = new Date().toISOString();
    }
    if (Object.keys(update).length === 0) {
      throw new BadRequestException('Nothing to update. Provide transfer_notes or action: sign_off.');
    }

    const { data, error } = await supabase
      .from('knowledge_transfer').update(update).eq('case_id', caseId).select().single();
    if (error) throw new BadRequestException(error.message);

    // If signed off → notify HR and log (callflow: Manager Phase 4)
    if (dto.action === 'sign_off') {
      const { data: c } = await supabase
        .from('offboarding_cases').select('employee_id').eq('case_id', caseId).maybeSingle();
      if (c) {
        const { data: emp } = await supabase
          .from('user_profile').select('company_id').eq('user_id', (c as any).employee_id).maybeSingle();
        this.notificationsService.notifyAllHRInCompany((emp as any)?.company_id ?? '', {
          type: 'OFFBOARDING_KT_SIGNED_OFF',
          title: 'Knowledge Transfer Signed Off',
          message: `Knowledge transfer for offboarding case ${caseId} has been signed off by manager.`,
          metadata: { case_id: caseId },
        }).catch(err => this.logger.error('Failed to notify HR of KT sign-off', err));

        this.auditService.log(
          `OFFBOARDING_KT_SIGNED_OFF: case ${caseId}`,
          userId, (emp as any)?.company_id ?? '', (c as any).employee_id,
        ).catch(err => this.logger.error('Audit failed in KT sign-off', err));
      }
    }
    return data;
  }

  // =========================================================
  // SYSTEM ACCESS
  // =========================================================

  async getSystemAccess(caseId: string) {
    const { data, error } = await this.supabaseService.getClient()
      .from('system_access').select('*').eq('case_id', caseId);
    if (error) throw new BadRequestException(error.message);
    return data ?? [];
  }

  async addSystemAccess(caseId: string, systemName: string) {
    if (!systemName?.trim()) throw new BadRequestException('system_name is required.');
    const { data, error } = await this.supabaseService.getClient()
      .from('system_access')
      .insert({ case_id: caseId, system_name: systemName.trim() })
      .select().single();
    if (error) throw new BadRequestException(error.message);
    return data;
  }

  async revokeSystemAccess(accessId: string, userId: string) {
    const supabase = this.supabaseService.getClient();
    const { data: row } = await supabase
      .from('system_access').select('access_id').eq('access_id', accessId).maybeSingle();
    if (!row) throw new NotFoundException('System access record not found.');

    const { data, error } = await supabase
      .from('system_access')
      .update({ status: 'Revoked', revoked_by_id: userId, revoked_at: new Date().toISOString() })
      .eq('access_id', accessId).select().single();
    if (error) throw new BadRequestException(error.message);
    return data;
  }

  // =========================================================
  // FINAL PAY (Phases 8–10)
  // =========================================================

  async getFinalPay(caseId: string) {
    const supabase = this.supabaseService.getClient();
    const { data: caseRow } = await supabase
      .from('offboarding_cases')
      .select('employee_id, last_working_day')
      .eq('case_id', caseId)
      .maybeSingle();
    const { data: employee } = await supabase
      .from('user_profile')
      .select('company_id')
      .eq('user_id', (caseRow as any)?.employee_id ?? '')
      .maybeSingle();
    const { data, error } = await supabase
      .from('final_pay').select('*').eq('case_id', caseId).maybeSingle();
    if (error) throw new BadRequestException(error.message);
    if (!data) {
      return this.recomputeFinalPayFromCompensation(caseId);
    }

    const requiresRecompute =
      [data.salary_balance, data.leave_encashment, data.additional_pay, data.deductions, data.total_amount]
        .some((value) => value === null || value === undefined) ||
      (
        Number(data.salary_balance ?? 0) === 0 &&
        Number(data.leave_encashment ?? 0) === 0 &&
        Number(data.additional_pay ?? 0) === 0 &&
        Number(data.total_amount ?? 0) === 0 &&
        data.status !== 'Payment Released' &&
        data.status !== 'Transfer Confirmed'
      );

    const resolved = !requiresRecompute ? data : await this.recomputeFinalPayFromCompensation(caseId);
    const payroll_reference = caseRow && employee
      ? await this.getLinkedPayrollReference(
          (caseRow as any).employee_id,
          (employee as any).company_id ?? '',
          (caseRow as any).last_working_day ?? null,
        )
      : null;
    const settlement_payslip = employee
      ? await this.getFinalSettlementPayslip(caseId, (employee as any).company_id ?? '')
      : null;

    return {
      ...(resolved as any),
      payroll_reference,
      settlement_payslip,
    };
  }

  async updateFinalPay(caseId: string, dto: UpdateFinalPayDto) {
    // total always computed server-side — never trusted from client
    const total = this.roundCurrency(
      Number(dto.salary_balance) +
      Number(dto.leave_encashment) +
      Number(dto.additional_pay) -
      Number(dto.deductions),
    );
    const supabase = this.supabaseService.getClient();
    const { data, error } = await supabase
      .from('final_pay')
      .update({ ...dto, total_amount: total, status: 'Ready for Review' })
      .eq('case_id', caseId).select().single();
    if (error) throw new BadRequestException(error.message);

    const { data: caseRow } = await supabase
      .from('offboarding_cases')
      .select('employee_id, initiated_by_id, last_working_day')
      .eq('case_id', caseId)
      .maybeSingle();
    const { data: employee } = await supabase
      .from('user_profile')
      .select('company_id')
      .eq('user_id', (caseRow as any)?.employee_id ?? '')
      .maybeSingle();
    if (caseRow && employee && (caseRow as any).last_working_day) {
      await this.syncFinalSettlementPayslip({
        caseId,
        companyId: (employee as any).company_id ?? '',
        employeeId: (caseRow as any).employee_id,
        actorId: (caseRow as any).initiated_by_id ?? (caseRow as any).employee_id,
        lastWorkingDay: (caseRow as any).last_working_day,
        finalPay: {
          salary_balance: Number(dto.salary_balance),
          leave_encashment: Number(dto.leave_encashment),
          additional_pay: Number(dto.additional_pay),
          deductions: Number(dto.deductions),
          total_amount: total,
          status: 'Ready for Review',
        },
      });
    }

    // Notify employee that final pay is ready (callflow: Employee Phase 7)
    const { data: c } = await this.supabaseService.getClient()
      .from('offboarding_cases').select('employee_id').eq('case_id', caseId).maybeSingle();
    if (c) {
      const { data: emp } = await this.supabaseService.getClient()
        .from('user_profile').select('company_id').eq('user_id', (c as any).employee_id).maybeSingle();
      this.notificationsService.createNotification({
        userId: (c as any).employee_id,
        companyId: (emp as any)?.company_id ?? '',
        type: 'OFFBOARDING_FINAL_PAY_READY',
        title: 'Final Pay Ready for Review',
        message: 'Your final pay breakdown has been computed and is ready for review.',
        metadata: { case_id: caseId, total_amount: total },
      }).catch(err => this.logger.error('Failed to notify final pay ready', err));
    }
    return data;
  }

  async releaseFinalPay(caseId: string) {
    const supabase = this.supabaseService.getClient();
    const { data, error } = await supabase
      .from('final_pay').update({ status: 'Payment Released' }).eq('case_id', caseId).select().single();
    if (error) throw new BadRequestException(error.message);

    const { data: c } = await supabase
      .from('offboarding_cases').select('employee_id').eq('case_id', caseId).maybeSingle();
    if (c) {
      const { data: emp } = await supabase
        .from('user_profile').select('company_id').eq('user_id', (c as any).employee_id).maybeSingle();
      const { data: caseRow } = await supabase
        .from('offboarding_cases')
        .select('initiated_by_id, last_working_day')
        .eq('case_id', caseId)
        .maybeSingle();
      await this.syncFinalSettlementPayslip({
        caseId,
        companyId: (emp as any)?.company_id ?? '',
        employeeId: (c as any).employee_id,
        actorId: (caseRow as any)?.initiated_by_id ?? (c as any).employee_id,
        lastWorkingDay: (caseRow as any)?.last_working_day ?? new Date().toISOString().split('T')[0],
        finalPay: {
          salary_balance: Number((data as any).salary_balance ?? 0),
          leave_encashment: Number((data as any).leave_encashment ?? 0),
          additional_pay: Number((data as any).additional_pay ?? 0),
          deductions: Number((data as any).deductions ?? 0),
          total_amount: Number((data as any).total_amount ?? 0),
          status: 'Payment Released',
        },
      });
      this.notificationsService.createNotification({
        userId: (c as any).employee_id, companyId: (emp as any)?.company_id ?? '',
        type: 'OFFBOARDING_FINAL_PAY_RELEASED',
        title: 'Final Pay Released',
        message: 'Your final pay has been processed and released.',
        metadata: { case_id: caseId },
      }).catch(err => this.logger.error('Failed to notify final pay released', err));
    }
    this.logger.log(`Final pay released for case ${caseId}`);
    return data;
  }

  // Record bank transfer confirmation (callflow: HR Phase 10)
  async recordPayTransferConfirmation(caseId: string, hrUserId: string) {
    const supabase = this.supabaseService.getClient();
    const { data: pay } = await supabase
      .from('final_pay').select('*').eq('case_id', caseId).maybeSingle();
    if (!pay) throw new NotFoundException('Final pay record not found.');

    const { data: c } = await supabase
      .from('offboarding_cases').select('employee_id').eq('case_id', caseId).maybeSingle();
    const { data: emp } = await supabase
      .from('user_profile').select('company_id').eq('user_id', (c as any)?.employee_id ?? '').maybeSingle();

    const confirmationPayload = {
      case_id: caseId,
      employee_id: (c as any)?.employee_id,
      company_id: (emp as any)?.company_id ?? '',
      total_amount: (pay as any).total_amount,
      confirmed_by: hrUserId,
      confirmed_at: new Date().toISOString(),
      type: 'final_pay_offboarding',
    };

    const { data: existingLog, error: existingLogError } = await supabase
      .from('payroll_log')
      .select('case_id')
      .eq('case_id', caseId)
      .eq('type', 'final_pay_offboarding')
      .maybeSingle();
    if (existingLogError) throw new BadRequestException(existingLogError.message);

    if (existingLog) {
      const { error: updateLogError } = await supabase
        .from('payroll_log')
        .update(confirmationPayload)
        .eq('case_id', caseId)
        .eq('type', 'final_pay_offboarding');
      if (updateLogError) throw new BadRequestException(updateLogError.message);
    } else {
      const { error: insertLogError } = await supabase.from('payroll_log').insert(confirmationPayload);
      if (insertLogError) throw new BadRequestException(insertLogError.message);
    }

    await supabase.from('final_pay')
      .update({ status: 'Transfer Confirmed', transfer_confirmed_at: new Date().toISOString() })
      .eq('case_id', caseId);

    const { data: caseRow } = await supabase
      .from('offboarding_cases')
      .select('last_working_day')
      .eq('case_id', caseId)
      .maybeSingle();
    await this.syncFinalSettlementPayslip({
      caseId,
      companyId: (emp as any)?.company_id ?? '',
      employeeId: (c as any)?.employee_id,
      actorId: hrUserId,
      lastWorkingDay: (caseRow as any)?.last_working_day ?? new Date().toISOString().split('T')[0],
      finalPay: {
        salary_balance: Number((pay as any).salary_balance ?? 0),
        leave_encashment: Number((pay as any).leave_encashment ?? 0),
        additional_pay: Number((pay as any).additional_pay ?? 0),
        deductions: Number((pay as any).deductions ?? 0),
        total_amount: Number((pay as any).total_amount ?? 0),
        status: 'Transfer Confirmed',
      },
    });

    this.auditService.log(
      `OFFBOARDING_BANK_TRANSFER_CONFIRMED: case ${caseId}`,
      hrUserId, (emp as any)?.company_id ?? '', (c as any)?.employee_id ?? '',
    ).catch(err => this.logger.error('Audit failed in recordPayTransferConfirmation', err));

    return { message: 'Bank transfer confirmation recorded', case_id: caseId };
  }

  // =========================================================
  // CLEARANCE DOCUMENTS (Employee Phase 8 / HR Phase 11–12)
  // =========================================================

  async getClearanceDocuments(caseId: string) {
    const { data, error } = await this.supabaseService.getClient()
      .from('clearance_documents').select('*').eq('case_id', caseId);
    if (error) throw new BadRequestException(error.message);
    return data ?? [];
  }

  async releaseClearanceDocuments(caseId: string, hrUserId: string, notes?: string) {
    const supabase = this.supabaseService.getClient();

    // Guard: all checklist items must be Verified first (callflow: HR Phase 11)
    const { data: checklistItems } = await supabase
      .from('checklist_items').select('status').eq('case_id', caseId);
    const notVerified = (checklistItems ?? []).filter((i: any) => i.status !== 'Verified' && i.status !== 'Completed');
    if (notVerified.length > 0) {
      throw new BadRequestException(
        `Cannot release clearance documents. ${notVerified.length} checklist item(s) not yet verified.`
      );
    }

    // Generate clearance certificate record
    const { data: c } = await supabase
      .from('offboarding_cases').select('employee_id').eq('case_id', caseId).maybeSingle();
    const { data: emp } = await supabase
      .from('user_profile').select('first_name, last_name, company_id').eq('user_id', (c as any)?.employee_id ?? '').maybeSingle();

    const docId = crypto.randomUUID();
    const { data: doc, error: docErr } = await supabase.from('clearance_documents').insert({
      document_id: docId,
      case_id: caseId,
      document_type: 'clearance_certificate',
      document_name: `Clearance Certificate - ${(emp as any)?.first_name} ${(emp as any)?.last_name}`,
      status: 'Released',
      released_by: hrUserId,
      released_at: new Date().toISOString(),
      notes: notes ?? null,
    }).select().single();
    if (docErr) throw new BadRequestException(docErr.message);

    // Notify employee — clearance released (callflow: Employee Phase 8)
    this.notificationsService.createNotification({
      userId: (c as any)?.employee_id ?? '',
      companyId: (emp as any)?.company_id ?? '',
      type: 'OFFBOARDING_CLEARANCE_RELEASED',
      title: 'Clearance Documents Released',
      message: 'Your clearance documents are now available for download.',
      metadata: { case_id: caseId, document_id: docId },
    }).catch(err => this.logger.error('Failed to notify clearance release', err));

    this.auditService.log(
      `OFFBOARDING_CLEARANCE_RELEASED: case ${caseId}`,
      hrUserId, (emp as any)?.company_id ?? '', (c as any)?.employee_id ?? '',
    ).catch(err => this.logger.error('Audit failed in releaseClearanceDocuments', err));

    return doc;
  }
}
