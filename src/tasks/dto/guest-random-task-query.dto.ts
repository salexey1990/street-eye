import { IsEnum, IsArray, ArrayMinSize, ArrayMaxSize } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Level, Category, Locale } from '@prisma/client';
import { Transform } from 'class-transformer';

export class GuestRandomTaskQueryDto {
  @ApiProperty({ enum: Level })
  @IsEnum(Level)
  level: Level;

  @ApiProperty({ type: [String], enum: Category, isArray: true })
  @Transform(({ value }) => (Array.isArray(value) ? value : [value]))
  @IsArray()
  @IsEnum(Category, { each: true })
  @ArrayMinSize(1)
  @ArrayMaxSize(2)
  categories: Category[];

  @ApiProperty({ enum: Locale })
  @IsEnum(Locale)
  locale: Locale;
}
