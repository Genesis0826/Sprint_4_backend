import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { CnbService } from './cnb.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

const HR_AND_ABOVE = [
  'Admin',
  'System Admin',
  'HR Officer',
  'HR Recruiter',
  'HR Interviewer',
  'Manager',
];

const CNB_OFFICER_AND_ADMIN = [
  'Admin',
  'System Admin',
  'HR Officer',
  'HR Recruiter',
];

const SYSTEM_ADMIN_ONLY = ['System Admin'];

@UseGuards(JwtAuthGuard)
@Controller('cnb')
export class CnbController {
  constructor(private readonly cnbService: CnbService) {}

  @Get('salary-baselines/:userId')
  @UseGuards(RolesGuard)
  @Roles(...CNB_OFFICER_AND_ADMIN)
  getSalaryBaseline(@Param('userId') userId: string, @Req() req: any) {
    return this.cnbService.getSalaryBaseline(userId, req.user.company_id);
  }

  @Post('salary-baselines')
  @UseGuards(RolesGuard)
  @Roles(...CNB_OFFICER_AND_ADMIN)
  setSalaryBaseline(
    @Body()
    dto: {
      user_id: string;
      pay_frequency: string;
      basic_salary: number;
      effective_date: string;
    },
    @Req() req: any,
  ) {
    return this.cnbService.setSalaryBaseline(
      { ...dto, company_id: req.user.company_id },
      req.user.sub_userid,
    );
  }

  @Get('benefits-catalog')
  @UseGuards(RolesGuard)
  @Roles(...CNB_OFFICER_AND_ADMIN)
  getBenefitsCatalog(@Req() req: any) {
    return this.cnbService.getBenefitsCatalog(req.user.company_id);
  }

  @Post('benefits-catalog')
  @UseGuards(RolesGuard)
  @Roles(...CNB_OFFICER_AND_ADMIN)
  createBenefit(
    @Body()
    dto: {
      benefit_name: string;
      benefit_type: string;
      taxable: boolean;
    },
    @Req() req: any,
  ) {
    return this.cnbService.createBenefit(
      { ...dto, company_id: req.user.company_id },
      req.user.sub_userid,
    );
  }

  @Get('employee-benefits/:userId')
  @UseGuards(RolesGuard)
  @Roles(...CNB_OFFICER_AND_ADMIN)
  getEmployeeBenefits(@Param('userId') userId: string, @Req() req: any) {
    return this.cnbService.getEmployeeBenefits(userId, req.user.company_id);
  }

  @Post('employee-benefits')
  @UseGuards(RolesGuard)
  @Roles(...CNB_OFFICER_AND_ADMIN)
  assignBenefit(
    @Body()
    dto: {
      user_id: string;
      benefit_id: string;
      amount: number;
      effective_date: string;
    },
    @Req() req: any,
  ) {
    return this.cnbService.assignBenefit(
      req.user.company_id,
      dto,
      req.user.sub_userid,
    );
  }

  @Delete('employee-benefits/:mappingId')
  @UseGuards(RolesGuard)
  @Roles(...CNB_OFFICER_AND_ADMIN)
  removeEmployeeBenefit(@Param('mappingId') mappingId: string, @Req() req: any) {
    return this.cnbService.removeEmployeeBenefit(
      mappingId,
      req.user.company_id,
      req.user.sub_userid,
    );
  }

  @Get('statutory-ids/:userId')
  @UseGuards(RolesGuard)
  @Roles(...CNB_OFFICER_AND_ADMIN)
  getStatutoryIds(@Param('userId') userId: string, @Req() req: any) {
    return this.cnbService.getStatutoryIds(userId, req.user.company_id);
  }

  @Patch('statutory-ids/:userId')
  @UseGuards(RolesGuard)
  @Roles(...CNB_OFFICER_AND_ADMIN)
  saveStatutoryIds(
    @Param('userId') userId: string,
    @Body()
    dto: {
      tin_number?: string;
      sss_number?: string;
      philhealth_number?: string;
      pagibig_number?: string;
    },
    @Req() req: any,
  ) {
    return this.cnbService.saveStatutoryIds(
      userId,
      req.user.company_id,
      dto,
      req.user.sub_userid,
    );
  }

  @Get('tax-brackets')
  @UseGuards(RolesGuard)
  @Roles(...CNB_OFFICER_AND_ADMIN)
  getTaxBrackets(@Req() req: any, @Query('year') year?: string) {
    const parsedYear = year ? Number(year) : undefined;
    return this.cnbService.getTaxBrackets(req.user.company_id, parsedYear);
  }

  @Post('tax-brackets')
  @UseGuards(RolesGuard)
  @Roles(...SYSTEM_ADMIN_ONLY)
  createTaxBracket(
    @Req() req: any,
    @Body()
    dto: {
      effective_year: number;
      min_salary: number;
      max_salary: number;
      base_tax_amount: number;
      excess_percentage: number;
    },
  ) {
    return this.cnbService.createTaxBracket(
      req.user.company_id,
      dto,
      req.user.sub_userid,
    );
  }

  @Delete('tax-brackets/:bracketId')
  @UseGuards(RolesGuard)
  @Roles(...SYSTEM_ADMIN_ONLY)
  deleteTaxBracket(@Param('bracketId') bracketId: string, @Req() req: any) {
    return this.cnbService.deleteTaxBracket(
      bracketId,
      req.user.company_id,
      req.user.sub_userid,
    );
  }

  @Patch('payslips/:payslipId/review')
  @UseGuards(RolesGuard)
  @Roles(...CNB_OFFICER_AND_ADMIN)
  reviewPayslip(
    @Param('payslipId') payslipId: string,
    @Body() dto: { status: 'Approved' | 'Correction Needed' },
    @Req() req: any,
  ) {
    return this.cnbService.reviewPayslip(
      payslipId,
      dto.status,
      req.user.sub_userid,
      req.user.company_id,
    );
  }

  @Get('me/compensation')
  getMyCompensation(@Req() req: any) {
    return this.cnbService.getMyCompensation(
      req.user.sub_userid,
      req.user.company_id,
    );
  }

  @Get('me/payslips')
  getMyPayslips(@Req() req: any) {
    return this.cnbService.getMyPayslips(
      req.user.sub_userid,
      req.user.company_id,
    );
  }

  @Get('payslips/:payslipId')
  getPayslipDetail(@Param('payslipId') payslipId: string, @Req() req: any) {
    return this.cnbService.getPayslipDetailForUser(payslipId, req.user);
  }

  @Get('compute/13th-month/:userId')
  @UseGuards(RolesGuard)
  @Roles(...CNB_OFFICER_AND_ADMIN)
  compute13thMonth(
    @Param('userId') userId: string,
    @Req() req: any,
    @Query('year') year?: string,
  ) {
    const parsedYear = year ? Number(year) : new Date().getFullYear();
    return this.cnbService.compute13thMonthPay(
      userId,
      req.user.company_id,
      parsedYear,
    );
  }

  @Get('me/compute/13th-month')
  compute13thMonthSelf(
    @Req() req: any,
    @Query('year') year?: string,
  ) {
    const parsedYear = year ? Number(year) : new Date().getFullYear();
    return this.cnbService.compute13thMonthPay(
      req.user.sub_userid,
      req.user.company_id,
      parsedYear,
    );
  }

  // ── PAYROLL COMPUTATION ────────────────────────────────────────

  @Post('payroll/run')
  @UseGuards(RolesGuard)
  @Roles(...CNB_OFFICER_AND_ADMIN)
  runPayrollCutoff(
    @Req() req: any,
    @Body()
    dto: {
      cutoff_start_date: string;
      cutoff_end_date: string;
      payout_date: string;
    },
  ) {
    return this.cnbService.runPayrollCutoff(
      req.user.company_id,
      dto.cutoff_start_date,
      dto.cutoff_end_date,
      dto.payout_date,
      req.user.sub_userid,
    );
  }

  @Get('payroll/periods')
  @UseGuards(RolesGuard)
  @Roles(...CNB_OFFICER_AND_ADMIN)
  getPayrollPeriods(@Req() req: any) {
    return this.cnbService.getPayrollPeriods(req.user.company_id);
  }

  @Get('payroll/periods/:periodId/payslips')
  @UseGuards(RolesGuard)
  @Roles(...CNB_OFFICER_AND_ADMIN)
  getPayslipsForPeriod(
    @Param('periodId') periodId: string,
    @Req() req: any,
  ) {
    return this.cnbService.getPayslipsForPeriod(periodId, req.user.company_id);
  }

  @Post('payroll/compute/:userId')
  @UseGuards(RolesGuard)
  @Roles(...CNB_OFFICER_AND_ADMIN)
  computeSinglePayslip(
    @Param('userId') userId: string,
    @Req() req: any,
    @Body() dto: { period_id: string },
  ) {
    return this.cnbService.computeEmployeePayslip(
      userId,
      req.user.company_id,
      dto.period_id,
      req.user.sub_userid,
    );
  }
}
