import { Injectable, NotFoundException } from '@nestjs/common';
import { Category, Level, Task } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TasksQueryDto } from './dto/tasks-query.dto';
import { TaskDto } from './dto/task.dto';
import { GuestRandomTaskQueryDto } from './dto/guest-random-task-query.dto';

@Injectable()
export class TasksService {
  constructor(private readonly prisma: PrismaService) {}

  async findRandom(userId: string, locale: string): Promise<TaskDto> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { level: true, preferredCategories: true },
    });

    const recentSessions = await this.prisma.taskSession.findMany({
      where: { userId },
      orderBy: { startedAt: 'desc' },
      take: 5,
      select: { taskId: true },
    });
    const recentTaskIds = recentSessions.map((s) => s.taskId);

    const categories =
      user.preferredCategories.length > 0
        ? user.preferredCategories
        : undefined;

    let task = await this.findRandomTask(
      user.level,
      categories,
      recentTaskIds,
    );

    if (!task && recentTaskIds.length > 0) {
      task = await this.findRandomTask(user.level, categories, []);
    }

    if (!task) {
      throw new NotFoundException('No tasks available for your filters');
    }

    return this.toDto(task, locale);
  }

  async findRandomGuest(query: GuestRandomTaskQueryDto): Promise<TaskDto> {
    const task = await this.findRandomTask(query.level, query.categories, []);
    if (!task) throw new NotFoundException('No tasks available for your filters');
    return this.toDto(task, query.locale.toLowerCase());
  }

  async findById(id: string, locale: string): Promise<TaskDto> {
    const task = await this.prisma.task.findUnique({ where: { id } });
    if (!task) throw new NotFoundException('Task not found');
    return this.toDto(task, locale);
  }

  async findAll(query: TasksQueryDto, locale: string) {
    const { level, category, tags, limit = 20, page = 1 } = query;

    const where: Record<string, unknown> = { isActive: true };
    if (level) where.level = level;
    if (category) where.category = category;
    if (tags && tags.length > 0) {
      where.tags = { hasSome: tags };
    }

    const [tasks, total] = await Promise.all([
      this.prisma.task.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.task.count({ where }),
    ]);

    return {
      items: tasks.map((t) => this.toDto(t, locale)),
      total,
      page,
      limit,
    };
  }

  private async findRandomTask(
    level: string,
    categories: string[] | undefined,
    excludeIds: string[],
  ): Promise<Task | null> {
    const where: Record<string, unknown> = { isActive: true, level };
    if (categories) where.category = { in: categories };
    if (excludeIds.length > 0) where.id = { notIn: excludeIds };

    const count = await this.prisma.task.count({ where });
    if (count === 0) return null;

    const skip = Math.floor(Math.random() * count);
    const tasks = await this.prisma.task.findMany({
      where,
      skip,
      take: 1,
    });

    return tasks[0] ?? null;
  }

  toDto(task: Task, locale: string): TaskDto {
    const l = locale === 'ru' ? 'ru' : 'en';
    return {
      id: task.id,
      title: task[`title_${l}`],
      description: task[`description_${l}`],
      tip: task[`tip_${l}`],
      category: task.category,
      level: task.level,
      durationMins: task.durationMins,
      tags: task.tags,
    };
  }
}
