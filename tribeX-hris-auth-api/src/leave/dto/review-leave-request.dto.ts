import { Transform } from 'class-transformer';
import { IsString, IsIn, IsOptional } from 'class-validator';

export class ReviewLeaveRequestDto {
  @IsString()
  @Transform(({ value }) =>
    typeof value === 'string'
      ? value.charAt(0).toUpperCase() + value.slice(1).toLowerCase()
      : value,
  )
  @IsIn(['Approved', 'Rejected'])
  status: 'Approved' | 'Rejected';

  @IsOptional()
  @IsString()
  rejection_reason?: string;
}
