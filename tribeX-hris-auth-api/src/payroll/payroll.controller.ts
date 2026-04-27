import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  Req,
  UseGuards,
  HttpCode,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { PayrollService } from './payroll.service';
import { RunPayrollCutoffDto } from './dto/run-payroll-cutoff.dto';
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

@ApiTags('Payroll')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('payroll')
export class PayrollController {
  constructor(private readonly payrollService: PayrollService) {}

  // ── EMPLOYEE ──────────────────────────────────────────────────

  @Get('me/payslips')
  @ApiOperation({
    summary: 'Employee: Get own payslips',
    description: 'Returns all payslips for the authenticated employee, newest first.',
  })
  getMyPayslips(@Req() req: any) {
    return this.payrollService.getMyPayslips(req.user.sub_userid);
  }

  // ── HR ────────────────────────────────────────────────────────

  @Get('ledger')
  @UseGuards(RolesGuard)
  @Roles(...HR_AND_ABOVE)
  @ApiOperation({
    summary: 'HR: Get payroll ledger for a cutoff date',
    description:
      'Returns all payslip entries for the specified payout/cutoff date. ' +
      'If cutoff is omitted, returns the most recent period.',
  })
  @ApiQuery({ name: 'cutoff', required: false, example: '2026-03-31' })
  getPayrollLedger(@Req() req: any, @Query('cutoff') cutoff?: string) {
    return this.payrollService.getPayrollLedger(req.user.company_id, cutoff);
  }

  @Post('cutoff/run')
  @HttpCode(200)
  @UseGuards(RolesGuard)
  @Roles(...HR_AND_ABOVE)
  @ApiOperation({
    summary: 'HR: Run payroll for a cutoff date',
    description:
      'Generates payslips for all active employees for the given cutoff date. ' +
      'Creates or updates the cnb_payroll_periods record and marks it Processed.',
  })
  runPayrollCutoff(@Req() req: any, @Body() dto: RunPayrollCutoffDto) {
    return this.payrollService.runPayrollCutoff(
      req.user.company_id,
      req.user.sub_userid,
      dto.cutoff_date,
    );
  }
}
