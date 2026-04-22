import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsBoolean, IsArray, ValidateNested, IsOptional } from 'class-validator';
import { Type } from 'class-transformer';

export class ChecklistTemplateItemDto {
  @ApiProperty() @IsString() @IsNotEmpty() item_name: string;
  @ApiProperty({ required: false }) @IsString() @IsOptional() description?: string;
  @ApiProperty() @IsBoolean() is_required: boolean;
}

export class ConfigureChecklistTemplateDto {
  @ApiProperty() @IsString() @IsNotEmpty() template_name: string;
  @ApiProperty({ required: false }) @IsString() @IsOptional() employee_type?: string;
  @ApiProperty({ type: [ChecklistTemplateItemDto] })
  @IsArray() @ValidateNested({ each: true }) @Type(() => ChecklistTemplateItemDto)
  items: ChecklistTemplateItemDto[];
}
