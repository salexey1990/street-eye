import { IsEnum } from 'class-validator';
import { SessionStatus } from '@prisma/client';

export class UpdateSessionDto {
  @IsEnum(SessionStatus, {
    message: 'status must be COMPLETED, SKIPPED, or SAVED_FOR_LATER',
  })
  status: SessionStatus;
}
