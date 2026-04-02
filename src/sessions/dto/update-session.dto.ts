import { IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { SessionStatus } from '@prisma/client';

export class UpdateSessionDto {
  @ApiProperty({
    enum: ['COMPLETED', 'SKIPPED', 'SAVED_FOR_LATER'],
    example: 'COMPLETED',
    description: 'New session status. Cannot transition back to ACTIVE or modify a closed session.',
  })
  @IsEnum(SessionStatus, {
    message: 'status must be COMPLETED, SKIPPED, or SAVED_FOR_LATER',
  })
  status: SessionStatus;
}
