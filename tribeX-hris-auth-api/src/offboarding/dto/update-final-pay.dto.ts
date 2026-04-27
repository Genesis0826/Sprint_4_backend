import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, Min } from 'class-validator';

export class UpdateFinalPayDto {
  @ApiProperty() @IsNumber() @Min(0) salary_balance: number;
  @ApiProperty() @IsNumber() @Min(0) leave_encashment: number;
  @ApiProperty() @IsNumber() @Min(0) additional_pay: number;
  @ApiProperty() @IsNumber() @Min(0) deductions: number;
}