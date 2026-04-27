import { IsString, IsOptional } from 'class-validator';

export class RunPayrollCutoffDto {
  @IsString()
  cutoff_date: string; // YYYY-MM-DD — must match an existing cnb_payroll_periods payout_date
}
