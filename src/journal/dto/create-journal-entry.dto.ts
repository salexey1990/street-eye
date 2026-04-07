import {
  IsUUID,
  IsOptional,
  IsString,
  MaxLength,
  IsEnum,
  IsBoolean,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SelfRating } from '@prisma/client';

export class CreateJournalEntryDto {
  @ApiProperty({ example: 'c3d4e5f6-a7b8-9012-cdef-123456789012' })
  @IsUUID()
  sessionId: string;

  @ApiPropertyOptional({ example: 'Great light today, caught some amazing shadows.', maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;

  @ApiProperty({ enum: SelfRating, example: 'SUCCESS' })
  @IsEnum(SelfRating)
  selfRating: SelfRating;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  hasPhoto?: boolean;
}
