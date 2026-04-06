import { IsInt, Min, Max, IsDateString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class GeneratePromoDto {
  @ApiProperty({ description: 'Number of promo codes to generate', minimum: 1, maximum: 100 })
  @IsInt()
  @Min(1)
  @Max(100)
  count: number;

  @ApiProperty({ description: 'Expiration date for the codes (ISO 8601)', example: '2026-12-31T23:59:59.000Z' })
  @IsDateString()
  expiresAt: string;
}
