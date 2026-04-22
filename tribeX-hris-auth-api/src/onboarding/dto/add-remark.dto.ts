import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty } from 'class-validator';

export const SUPPORTED_TAB_TAGS = [
  'Documents',
  'Tasks',
  'Equipment',
  'Profile',
  'Forms',
  'HR Forms',
  'documents',
  'tasks',
  'equipment',
  'profile',
  'forms',
  'hr_forms',
] as const;

export class AddRemarkDto {
  @ApiProperty() @IsString() @IsNotEmpty()
  session_id: string;

  @ApiProperty({ enum: SUPPORTED_TAB_TAGS, description: 'Tab/category for the remark' })
  @IsString()
  @IsNotEmpty()
  tab_tag: string;

  @ApiProperty() @IsString() @IsNotEmpty()
  remark_text: string;
}
