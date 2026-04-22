import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';

export class UpdateOffboardingStatusDto {
  @ApiProperty({ enum: ['Manager_Acknowledged', 'HR_Accepted', 'Completed'] })
  @IsIn(['Manager_Acknowledged', 'HR_Accepted', 'Completed'])
  status: string;
}
