import { Category, Level } from '@prisma/client';

export class TaskDto {
  id: string;
  title: string;
  description: string;
  tip: string;
  category: Category;
  level: Level;
  durationMins: number;
  tags: string[];
}
