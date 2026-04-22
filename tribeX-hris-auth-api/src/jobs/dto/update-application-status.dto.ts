import { IsString, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateApplicationStatusDto {
  @ApiProperty({
    description: 'New status for the application',
    example: 'shortlisted',
    enum: [
      'pending',
      'under_review',
      'shortlisted',
      'rejected',
      'hold',
      'first_interview',
      'technical_interview',
      'final_interview',
      'hired',
      'withdrawn'
    ],
  })
  @IsString()
  status: string;

  @ApiPropertyOptional({
    description: 'Reason for rejection (required when status is rejected)',
    example: 'Skills Mismatch',
  })
  @IsString()
  @IsOptional()
  rejection_reason?: string;
}
