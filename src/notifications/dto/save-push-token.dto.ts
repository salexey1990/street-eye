import { IsString, IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Platform } from '@prisma/client';

export class SavePushTokenDto {
  @ApiProperty({ example: 'ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]' })
  @IsString()
  token: string;

  @ApiProperty({ enum: Platform })
  @IsEnum(Platform)
  platform: Platform;
}
