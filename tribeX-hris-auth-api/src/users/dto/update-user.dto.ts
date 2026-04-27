import { IsOptional, IsString } from 'class-validator';

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  first_name?: string;

  @IsOptional()
  @IsString()
  last_name?: string;

  @IsOptional()
  @IsString()
  role_id?: string;

  @IsOptional()
  @IsString()
  department_id?: string | null;

  @IsOptional()
  @IsString()
  start_date?: string;

  @IsOptional()
  @IsString()
  account_status?: string;
}
