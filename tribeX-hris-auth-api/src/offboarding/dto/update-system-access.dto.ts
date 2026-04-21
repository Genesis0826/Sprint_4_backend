import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';

export class UpdateSystemAccessDto {
  @ApiProperty({ enum: ['Active', 'Revoked'] })
  @IsIn(['Active', 'Revoked'])
  status: string;
}