import { ApiProperty } from '@nestjs/swagger';
import { SessionStatus, Category, Level } from '@prisma/client';

class EmbeddedTaskDto {
  @ApiProperty({ example: 'b2c3d4e5-f6a7-8901-bcde-f12345678901' })
  id: string;

  @ApiProperty({ example: 'Shadows Only' })
  title: string;

  @ApiProperty({ example: 'Find and photograph only shadows — no subjects, just their shadows on surfaces.' })
  description: string;

  @ApiProperty({ example: 'Look for long shadows in the morning or evening when the sun is low.' })
  tip: string;

  @ApiProperty({ enum: Category, example: 'VISUAL' })
  category: Category;

  @ApiProperty({ enum: Level, example: 'BEGINNER' })
  level: Level;

  @ApiProperty({ example: 60 })
  durationMins: number;

  @ApiProperty({ type: [String], example: ['light', 'shadow', 'abstract'] })
  tags: string[];
}

export class TaskSessionDto {
  @ApiProperty({ example: 'c3d4e5f6-a7b8-9012-cdef-123456789012' })
  id: string;

  @ApiProperty({ enum: SessionStatus, example: 'ACTIVE' })
  status: SessionStatus;

  @ApiProperty({ example: '2026-03-15T09:30:00.000Z' })
  startedAt: string;

  @ApiProperty({ example: null, nullable: true })
  completedAt: string | null;

  @ApiProperty({ type: () => EmbeddedTaskDto })
  task: EmbeddedTaskDto;
}
