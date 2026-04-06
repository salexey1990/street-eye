import { IsString, Length } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RedeemPromoDto {
  @ApiProperty({
    description: 'Promo code (8 characters, uppercase alphanumeric)',
    example: 'K7X2NP4G',
  })
  @IsString()
  @Length(8, 8)
  code: string;
}
