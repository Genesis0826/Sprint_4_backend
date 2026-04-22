import { IsString, IsOptional } from 'class-validator';

export class CreateNotificationDto {
  @IsString()
  applicant_id: string;

  @IsString()
  message: string;

  @IsString()
  @IsOptional()
  notification_type?: string; // 'status_update', 'message', etc.

  @IsString()
  @IsOptional()
  job_posting_id?: string; // FK to job_postings table (optional)
}
