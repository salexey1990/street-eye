import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { Inject, forwardRef } from '@nestjs/common';
import { SessionStatus, TaskSession, Task } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TasksService } from '../tasks/tasks.service';
import { BadgesService } from '../badges/badges.service';
import { CreateSessionDto } from './dto/create-session.dto';
import { UpdateSessionDto } from './dto/update-session.dto';
import { SessionsQueryDto } from './dto/sessions-query.dto';
import { TaskSessionDto } from './dto/task-session.dto';

const TERMINAL_STATUSES: SessionStatus[] = ['COMPLETED', 'SKIPPED'];

@Injectable()
export class SessionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tasksService: TasksService,
    @Inject(forwardRef(() => BadgesService))
    private readonly badgesService: BadgesService,
  ) {}

  private toTaskSessionDto(
    session: TaskSession & { task: Task },
    locale: string,
  ): TaskSessionDto {
    return {
      id: session.id,
      status: session.status,
      startedAt: session.startedAt.toISOString(),
      completedAt: session.completedAt?.toISOString() ?? null,
      task: this.tasksService.toDto(session.task, locale),
    };
  }

  async create(userId: string, dto: CreateSessionDto, locale: string): Promise<TaskSessionDto> {
    const activeSession = await this.prisma.taskSession.findFirst({
      where: { userId, status: 'ACTIVE' },
    });

    if (activeSession) {
      throw new ConflictException('ACTIVE_SESSION_EXISTS');
    }

    const task = await this.prisma.task.findUnique({
      where: { id: dto.taskId },
    });

    if (!task) {
      throw new NotFoundException('Task not found');
    }

    const session = await this.prisma.taskSession.create({
      data: { userId, taskId: dto.taskId, status: 'ACTIVE' },
      include: { task: true },
    });

    return this.toTaskSessionDto(session, locale);
  }

  async getActive(userId: string, locale: string): Promise<TaskSessionDto> {
    const session = await this.prisma.taskSession.findFirst({
      where: { userId, status: 'ACTIVE' },
      include: { task: true },
    });

    if (!session) {
      throw new NotFoundException('No active session');
    }

    return this.toTaskSessionDto(session, locale);
  }

  async updateStatus(
    id: string,
    userId: string,
    dto: UpdateSessionDto,
    locale: string,
  ): Promise<TaskSessionDto> {
    const session = await this.prisma.taskSession.findUnique({
      where: { id },
    });

    if (!session) throw new NotFoundException('Session not found');
    if (session.userId !== userId) throw new ForbiddenException();

    if (TERMINAL_STATUSES.includes(session.status)) {
      throw new ConflictException('Cannot modify a closed session');
    }

    if (dto.status === 'ACTIVE') {
      throw new BadRequestException('Cannot set status back to ACTIVE');
    }

    const data: Record<string, unknown> = { status: dto.status };
    if (dto.status === 'COMPLETED') {
      data.completedAt = new Date();
    }

    const updated = await this.prisma.taskSession.update({
      where: { id },
      data,
      include: { task: true },
    });

    if (dto.status === 'COMPLETED') {
      void this.badgesService.checkAndAward(userId);
    }

    return this.toTaskSessionDto(updated, locale);
  }

  async findAll(userId: string, query: SessionsQueryDto, locale: string) {
    const { status, limit = 20, cursor } = query;

    const where: Record<string, unknown> = { userId };
    if (status) where.status = status;

    const sessions = await this.prisma.taskSession.findMany({
      where,
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      orderBy: { startedAt: 'desc' },
      include: { task: true },
    });

    const hasMore = sessions.length > limit;
    const items = hasMore ? sessions.slice(0, limit) : sessions;
    const nextCursor = hasMore ? items[items.length - 1].id : null;

    return {
      items: items.map((s) => this.toTaskSessionDto(s, locale)),
      nextCursor,
      hasMore,
    };
  }
}
