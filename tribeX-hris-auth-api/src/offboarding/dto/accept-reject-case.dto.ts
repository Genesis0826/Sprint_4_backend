import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString } from 'class-validator';

export class AcceptRejectCaseDto {
  @ApiProperty({ enum: ['Accepted', 'Rejected'] })
  @IsIn(['Accepted', 'Rejected'])
  action: string;

  @ApiProperty({ required: false, description: 'Required when action is Rejected' })
  @IsString()
  @IsOptional()
  rejection_reason?: string;
}
