import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, IsIn } from 'class-validator';

export class UpdateKnowledgeTransferDto {
  @ApiProperty({ required: false }) @IsString() @IsOptional() transfer_notes?: string;

  @ApiProperty({ required: false, enum: ['sign_off'] })
  @IsOptional() @IsIn(['sign_off'])
  action?: string;
}