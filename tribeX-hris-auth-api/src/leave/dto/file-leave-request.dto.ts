import { IsString, IsOptional, IsIn } from 'class-validator';

export const LEAVE_TYPES = [
  'Vacation Leave',
  'Sick Leave',
  'Emergency Leave',
  'Personal Leave',
  'WFH / Remote',
  'Other',
] as const;

export type LeaveType = (typeof LEAVE_TYPES)[number];

export class FileLeaveRequestDto {
  @IsString()
  @IsIn(LEAVE_TYPES as unknown as string[])
  leave_type: LeaveType;

  @IsString()
  start_date: string; // YYYY-MM-DD

  @IsString()
  end_date: string; // YYYY-MM-DD

  @IsOptional()
  @IsString()
  reason?: string;
}
