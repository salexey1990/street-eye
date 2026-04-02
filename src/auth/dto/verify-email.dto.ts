import { IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class VerifyEmailDto {
  @ApiProperty({
    description: 'Token from the verification email link',
    example: '7f3d2a1e9c8b4f6a0d5e2c8b7a3f1d9e4c2a8b6f0d3e7a1c5b9f2d4e8a0c6b1',
  })
  @IsString()
  token: string;
}
