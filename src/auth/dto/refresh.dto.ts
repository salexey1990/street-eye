import { IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RefreshDto {
  @ApiProperty({ description: 'Refresh token received from /auth/login or /auth/refresh' })
  @IsString()
  refreshToken: string;
}
