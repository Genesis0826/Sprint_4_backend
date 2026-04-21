import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';

export class UpdateChecklistItemDto {
  @ApiProperty({ enum: ['Pending', 'Completed'] })
  @IsIn(['Pending', 'Completed'])
  status: string;
}
