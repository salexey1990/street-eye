import { IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RefreshDto {
  @ApiProperty({
    description: 'Refresh token received from /auth/login or /auth/refresh',
    example: 'a1b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef123456ab',
  })
  @IsString()
  refreshToken: string;
}
