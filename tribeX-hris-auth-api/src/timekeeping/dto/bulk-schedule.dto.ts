import { IsArray, IsBoolean, IsEnum, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { UpsertScheduleDto } from './upsert-schedule.dto';

export class BulkScheduleDto {
  @ApiProperty({
    enum: ['company', 'department', 'employees'],
    description: 'Scope of the bulk schedule assignment',
  })
  @IsEnum(['company', 'department', 'employees'])
  scope: 'company' | 'department' | 'employees';

  @ApiPropertyOptional({
    description: 'Department ID — required when scope is "department"',
    example: 'uuid-dept-id',
  })
  @IsOptional()
  @IsString()
  department_id?: string;

  @ApiPropertyOptional({
    description: 'Array of user_ids — required when scope is "employees"',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  user_ids?: string[];

  @ApiPropertyOptional({
    description: 'Array of employee_ids — fallback when user_ids are unavailable',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  employee_ids?: string[];

  @ApiProperty({ type: () => UpsertScheduleDto })
  @ValidateNested()
  @Type(() => UpsertScheduleDto)
  schedule: UpsertScheduleDto;

  @ApiPropertyOptional({
    description: 'Effective date in YYYY-MM-DD format (informational only)',
    example: '2026-04-15',
  })
  @IsOptional()
  @IsString()
  effective_date?: string;

  @ApiPropertyOptional({
    description: 'When true, employees who already have an individually-assigned schedule will be skipped',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  skip_individual?: boolean;
}
