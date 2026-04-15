import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  Inject,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateJournalEntryDto } from './dto/create-journal-entry.dto';
import { UpdateJournalEntryDto } from './dto/update-journal-entry.dto';
import { JournalQueryDto } from './dto/journal-query.dto';
import type Redis from 'ioredis';

const STATS_CACHE_TTL = 300; // 5 minutes
const statsKey = (userId: string) => `journal:stats:${userId}`;

type EntryWithSession = {
  id: string;
  userId: string;
  sessionId: string;
  note: string | null;
  selfRating: string;
  hasPhoto: boolean;
  createdAt: Date;
  updatedAt: Date;
  session: {
    task: { category: string; level: string };
  };
};

@Injectable()
export class JournalService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject('REDIS_CLIENT') private readonly redis: Redis,
  ) {}

  async create(userId: string, dto: CreateJournalEntryDto) {
    const session = await this.prisma.taskSession.findUnique({
      where: { id: dto.sessionId },
    });

    if (!session) throw new NotFoundException('Session not found');
    if (session.userId !== userId) throw new ForbiddenException();
    if (session.status !== 'COMPLETED') {
      throw new ConflictException('Session must be COMPLETED to create a journal entry');
    }

    const existing = await this.prisma.journalEntry.findUnique({
      where: { sessionId: dto.sessionId },
    });
    if (existing) throw new ConflictException('Journal entry already exists for this session');

    const entry = await this.prisma.journalEntry.create({
      data: {
        userId,
        sessionId: dto.sessionId,
        note: dto.note,
        selfRating: dto.selfRating,
        hasPhoto: dto.hasPhoto ?? false,
      },
      include: {
        session: { include: { task: { select: { category: true, level: true } } } },
      },
    });

    await this.redis.del(statsKey(userId));
    return this.toDto(entry);
  }

  async findAll(userId: string, query: JournalQueryDto) {
    const { category, selfRating, limit = 20, cursor } = query;

    const where: Record<string, unknown> = { userId };
    if (category) where.session = { task: { category } };
    if (selfRating) where.selfRating = selfRating;

    const entries = await this.prisma.journalEntry.findMany({
      where,
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      orderBy: { createdAt: 'desc' },
      include: {
        session: { include: { task: { select: { category: true, level: true } } } },
      },
    });

    const hasMore = entries.length > limit;
    const items = hasMore ? entries.slice(0, limit) : entries;

    return {
      items: items.map((e) => this.toDto(e)),
      nextCursor: hasMore ? items[items.length - 1].id : null,
      hasMore,
    };
  }

  async findOne(userId: string, id: string) {
    const entry = await this.prisma.journalEntry.findUnique({
      where: { id },
      include: {
        session: { include: { task: { select: { category: true, level: true } } } },
      },
    });

    if (!entry) throw new NotFoundException('Journal entry not found');
    if (entry.userId !== userId) throw new ForbiddenException();

    return this.toDto(entry);
  }

  async update(userId: string, id: string, dto: UpdateJournalEntryDto) {
    const entry = await this.prisma.journalEntry.findUnique({ where: { id } });
    if (!entry) throw new NotFoundException('Journal entry not found');
    if (entry.userId !== userId) throw new ForbiddenException();

    const updated = await this.prisma.journalEntry.update({
      where: { id },
      data: dto,
      include: {
        session: { include: { task: { select: { category: true, level: true } } } },
      },
    });

    await this.redis.del(statsKey(userId));
    return this.toDto(updated);
  }

  async remove(userId: string, id: string) {
    const entry = await this.prisma.journalEntry.findUnique({ where: { id } });
    if (!entry) throw new NotFoundException('Journal entry not found');
    if (entry.userId !== userId) throw new ForbiddenException();

    await this.prisma.journalEntry.delete({ where: { id } });
    await this.redis.del(statsKey(userId));

    return { deleted: true };
  }

  async getStats(userId: string) {
    const cached = await this.redis.get(statsKey(userId));
    if (cached) return JSON.parse(cached) as ReturnType<typeof this.computeStats>;

    const stats = await this.computeStats(userId);
    await this.redis.set(statsKey(userId), JSON.stringify(stats), 'EX', STATS_CACHE_TTL);
    return stats;
  }

  private async computeStats(userId: string) {
    const [completedSessions, totalSkipped, journalEntries] = await Promise.all([
      this.prisma.taskSession.findMany({
        where: { userId, status: 'COMPLETED' },
        select: { completedAt: true, task: { select: { category: true } } },
        orderBy: { completedAt: 'asc' },
      }),
      this.prisma.taskSession.count({ where: { userId, status: 'SKIPPED' } }),
      this.prisma.journalEntry.findMany({
        where: { userId },
        select: { selfRating: true },
      }),
    ]);

    const byCategory = { VISUAL: 0, TECHNICAL: 0, SOCIAL: 0, RESTRICTION: 0 };
    for (const s of completedSessions) {
      byCategory[s.task.category as keyof typeof byCategory]++;
    }

    const byRating = { SUCCESS: 0, PARTIAL: 0, FAILED: 0 };
    for (const e of journalEntries) {
      byRating[e.selfRating as keyof typeof byRating]++;
    }

    const { currentStreak, longestStreak } = this.computeStreaks(completedSessions);

    return {
      totalCompleted: completedSessions.length,
      totalSkipped,
      currentStreak,
      longestStreak,
      byCategory,
      byRating,
    };
  }

  computeStreaks(sessions: { completedAt: Date | null }[]): {
    currentStreak: number;
    longestStreak: number;
  } {
    const dateSet = new Set<string>();
    for (const s of sessions) {
      if (s.completedAt) {
        dateSet.add(s.completedAt.toISOString().slice(0, 10));
      }
    }

    if (dateSet.size === 0) return { currentStreak: 0, longestStreak: 0 };

    const sorted = Array.from(dateSet).sort();

    // Compute longest streak
    let longestStreak = 1;
    let run = 1;
    for (let i = 1; i < sorted.length; i++) {
      const diff = this.dayDiff(sorted[i - 1], sorted[i]);
      if (diff === 1) {
        run++;
        if (run > longestStreak) longestStreak = run;
      } else {
        run = 1;
      }
    }

    // Compute current streak: walk back from the last date
    const today = new Date(Date.now()).toISOString().slice(0, 10);
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    const lastDate = sorted[sorted.length - 1];

    if (lastDate !== today && lastDate !== yesterday) {
      return { currentStreak: 0, longestStreak };
    }

    let currentStreak = 1;
    for (let i = sorted.length - 2; i >= 0; i--) {
      const diff = this.dayDiff(sorted[i], sorted[i + 1]);
      if (diff === 1) {
        currentStreak++;
      } else {
        break;
      }
    }

    return { currentStreak, longestStreak };
  }

  private dayDiff(dateStrA: string, dateStrB: string): number {
    const a = new Date(dateStrA).getTime();
    const b = new Date(dateStrB).getTime();
    return Math.round((b - a) / 86400000);
  }

  private toDto(entry: EntryWithSession) {
    return {
      id: entry.id,
      sessionId: entry.sessionId,
      category: entry.session.task.category,
      level: entry.session.task.level,
      note: entry.note,
      selfRating: entry.selfRating,
      hasPhoto: entry.hasPhoto,
      createdAt: entry.createdAt.toISOString(),
      updatedAt: entry.updatedAt.toISOString(),
    };
  }
}
