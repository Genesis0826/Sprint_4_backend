import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class UploadSfiaResumeDto {
  @IsString()
  @IsNotEmpty()
  job_posting_id: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  file_name: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  mime_type: string;

  @IsString()
  @IsNotEmpty()
  content_base64: string;
}
