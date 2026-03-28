import { IsOptional, IsEnum, IsArray, ArrayMinSize, ArrayMaxSize } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Level, Category, Locale } from '@prisma/client';

export class UpdateUserDto {
  @ApiPropertyOptional({ enum: Level, example: Level.INTERMEDIATE })
  @IsOptional()
  @IsEnum(Level)
  level?: Level;

  @ApiPropertyOptional({
    enum: Category,
    isArray: true,
    example: [Category.VISUAL, Category.SOCIAL],
    minItems: 1,
    maxItems: 4,
  })
  @IsOptional()
  @IsArray()
  @IsEnum(Category, { each: true })
  @ArrayMinSize(1)
  @ArrayMaxSize(4)
  preferredCategories?: Category[];

  @ApiPropertyOptional({ enum: Locale, example: Locale.RU })
  @IsOptional()
  @IsEnum(Locale)
  locale?: Locale;
}
