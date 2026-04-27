import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';

export class UpdateChecklistItemDto {
  // Callflow statuses: Pending → Submitted (by employee) → Verified or Disputed (by HR)
  @ApiProperty({ enum: ['Pending', 'Submitted', 'Verified', 'Disputed', 'Completed'] })
  @IsIn(['Pending', 'Submitted', 'Verified', 'Disputed', 'Completed'])
  status: string;
}
