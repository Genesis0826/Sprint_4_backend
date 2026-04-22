import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class ReleaseClearanceDto {
  @ApiProperty({ required: false }) @IsString() @IsOptional() notes?: string;
}
