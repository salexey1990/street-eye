import { IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ResetPasswordDto {
  @ApiProperty({ description: 'Token from the password reset email link' })
  @IsString()
  token: string;

  @ApiProperty({ example: 'NewPassword456', minLength: 8 })
  @IsString()
  @MinLength(8)
  newPassword: string;
}
