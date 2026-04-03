import { IsString, IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Platform } from '@prisma/client';

export class VerifyPurchaseDto {
  @ApiProperty({ description: 'App Store receipt data or Google Play purchase token' })
  @IsString()
  receipt: string;

  @ApiProperty({ enum: Platform })
  @IsEnum(Platform)
  platform: Platform;

  @ApiProperty({ example: 'streeteye_premium_monthly' })
  @IsString()
  productId: string;
}
