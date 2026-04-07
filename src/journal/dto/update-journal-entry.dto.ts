import { IsOptional, IsString, MaxLength, IsEnum, IsBoolean } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { SelfRating } from '@prisma/client';

export class UpdateJournalEntryDto {
  @ApiPropertyOptional({ example: 'Updated note with reflection.', maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;

  @ApiPropertyOptional({ enum: SelfRating, example: 'PARTIAL' })
  @IsOptional()
  @IsEnum(SelfRating)
  selfRating?: SelfRating;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  hasPhoto?: boolean;
}
