import {
  IsEmail,
  IsString,
  MinLength,
  IsOptional,
  IsEnum,
  IsArray,
  ArrayMinSize,
  ArrayMaxSize,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Level, Category, Locale } from '@prisma/client';

export class RegisterDto {
  @ApiProperty({ example: 'user@example.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'Password123', minLength: 8 })
  @IsString()
  @MinLength(8)
  password: string;

  @ApiPropertyOptional({ enum: Level, description: 'From onboarding step 3. Default: BEGINNER' })
  @IsOptional()
  @IsEnum(Level)
  level?: Level;

  @ApiPropertyOptional({
    type: [String],
    enum: Category,
    description: 'From onboarding step 4. 1–2 categories. Default: [VISUAL]',
  })
  @IsOptional()
  @IsArray()
  @IsEnum(Category, { each: true })
  @ArrayMinSize(1)
  @ArrayMaxSize(2)
  preferredCategories?: Category[];

  @ApiPropertyOptional({ enum: Locale, description: 'From onboarding step 2. Default: EN' })
  @IsOptional()
  @IsEnum(Locale)
  locale?: Locale;
}
