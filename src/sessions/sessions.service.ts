import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { Inject, forwardRef } from '@nestjs/common';
import { SessionStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TasksService } from '../tasks/tasks.service';
import { BadgesService } from '../badges/badges.service';
import { CreateSessionDto } from './dto/create-session.dto';
import { UpdateSessionDto } from './dto/update-session.dto';
import { SessionsQueryDto } from './dto/sessions-query.dto';

const TERMINAL_STATUSES: SessionStatus[] = ['COMPLETED', 'SKIPPED'];

@Injectable()
export class SessionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tasksService: TasksService,
    @Inject(forwardRef(() => BadgesService))
    private readonly badgesService: BadgesService,
  ) {}

  async create(userId: string, dto: CreateSessionDto) {
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
    });

    return {
      id: session.id,
      taskId: session.taskId,
      status: session.status,
      startedAt: session.startedAt.toISOString(),
      completedAt: null,
    };
  }

  async getActive(userId: string, locale: string) {
    const session = await this.prisma.taskSession.findFirst({
      where: { userId, status: 'ACTIVE' },
      include: { task: true },
    });

    if (!session) {
      throw new NotFoundException('No active session');
    }

    return {
      ...this.tasksService.toDto(session.task, locale),
      sessionId: session.id,
      startedAt: session.startedAt.toISOString(),
    };
  }

  async updateStatus(id: string, userId: string, dto: UpdateSessionDto) {
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
    });

    if (dto.status === 'COMPLETED') {
      void this.badgesService.checkAndAward(userId);
    }

    return {
      id: updated.id,
      taskId: updated.taskId,
      status: updated.status,
      startedAt: updated.startedAt.toISOString(),
      completedAt: updated.completedAt?.toISOString() ?? null,
    };
  }

  async findAll(userId: string, query: SessionsQueryDto) {
    const { status, limit = 20, cursor } = query;

    const where: Record<string, unknown> = { userId };
    if (status) where.status = status;

    const sessions = await this.prisma.taskSession.findMany({
      where,
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      orderBy: { startedAt: 'desc' },
      include: { task: { select: { id: true, category: true, level: true } } },
    });

    const hasMore = sessions.length > limit;
    const items = hasMore ? sessions.slice(0, limit) : sessions;
    const nextCursor = hasMore ? items[items.length - 1].id : null;

    return {
      items: items.map((s) => ({
        id: s.id,
        taskId: s.taskId,
        category: s.task.category,
        level: s.task.level,
        status: s.status,
        startedAt: s.startedAt.toISOString(),
        completedAt: s.completedAt?.toISOString() ?? null,
      })),
      nextCursor,
      hasMore,
    };
  }
}
