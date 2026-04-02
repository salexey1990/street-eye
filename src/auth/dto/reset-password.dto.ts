import { IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ResetPasswordDto {
  @ApiProperty({
    description: 'Token from the password reset email link',
    example: '3e1c9a7b5d2f8e4a6c0b7d3f1e9c5a2b8d4f0e6c3a7b1d5f9e2c4a8b6d0f3e7c',
  })
  @IsString()
  token: string;

  @ApiProperty({ example: 'NewPassword456', minLength: 8 })
  @IsString()
  @MinLength(8)
  newPassword: string;
}
