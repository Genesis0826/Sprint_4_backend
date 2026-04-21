import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsDateString, IsOptional, IsUUID, IsIn } from 'class-validator';
import { Type } from 'class-transformer';
import { ValidateNested } from 'class-validator';

export class ResignationDetailsDto {
  @ApiProperty() @IsString() @IsNotEmpty() reason: string;
  @ApiProperty({ required: false }) @IsString() @IsOptional() resignation_letter?: string;
  @ApiProperty({ required: false }) @IsString() @IsOptional() document_url?: string;
  @ApiProperty({ required: false }) @IsString() @IsOptional() document_name?: string;
}

export class TerminationDetailsDto {
  @ApiProperty() @IsString() @IsNotEmpty() reason: string;
  @ApiProperty({ required: false }) @IsString() @IsOptional() termination_details?: string;
  @ApiProperty({ required: false }) @IsString() @IsOptional() document_url?: string;
  @ApiProperty({ required: false }) @IsString() @IsOptional() document_name?: string;
}

export class CreateOffboardingCaseDto {
  @ApiProperty() @IsUUID() employee_id: string;

  @ApiProperty({ enum: ['Resignation', 'Termination', 'End of Contract'] })
  @IsIn(['Resignation', 'Termination', 'End of Contract'])
offboarding_type: string;

  @ApiProperty() @IsDateString() last_working_day: string;

  @ApiProperty({ required: false })
  @IsOptional() @ValidateNested() @Type(() => ResignationDetailsDto)
  resignation?: ResignationDetailsDto;

  @ApiProperty({ required: false })
  @IsOptional() @ValidateNested() @Type(() => TerminationDetailsDto)
  termination?: TerminationDetailsDto;
}