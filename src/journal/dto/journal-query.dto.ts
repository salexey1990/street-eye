import { IsOptional, IsEnum, IsInt, IsString, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Category, SelfRating } from '@prisma/client';

export class JournalQueryDto {
  @ApiPropertyOptional({ enum: Category, example: 'VISUAL' })
  @IsOptional()
  @IsEnum(Category)
  category?: Category;

  @ApiPropertyOptional({ enum: SelfRating, example: 'SUCCESS' })
  @IsOptional()
  @IsEnum(SelfRating)
  selfRating?: SelfRating;

  @ApiPropertyOptional({ example: 20, minimum: 1, maximum: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;

  @ApiPropertyOptional({ description: 'Cursor (last entry id from previous page)' })
  @IsOptional()
  @IsString()
  cursor?: string;
}
