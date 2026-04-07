import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { JournalService } from '../journal/journal.service';
import { NotificationsService } from '../notifications/notifications.service';

const BADGE_KEYS = ['FIRST_STEP', 'WEEK', 'STREAK_3', 'ALL_CATEGORIES'] as const;
type BadgeKey = (typeof BADGE_KEYS)[number];

@Injectable()
export class BadgesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly journalService: JournalService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async findAll(userId: string) {
    const [allBadges, userBadges] = await Promise.all([
      this.prisma.badge.findMany({ orderBy: { key: 'asc' } }),
      this.prisma.userBadge.findMany({
        where: { userId },
        include: { badge: { select: { key: true } } },
      }),
    ]);

    const earnedMap = new Map(userBadges.map((ub) => [ub.badge.key, ub.earnedAt]));

    return allBadges.map((badge) => ({
      id: badge.id,
      key: badge.key,
      name: badge.name,
      description: badge.description,
      earned: earnedMap.has(badge.key),
      earnedAt: earnedMap.get(badge.key)?.toISOString() ?? null,
    }));
  }

  async findEarned(userId: string) {
    const userBadges = await this.prisma.userBadge.findMany({
      where: { userId },
      include: { badge: true },
      orderBy: { earnedAt: 'desc' },
    });

    return userBadges.map((ub) => ({
      id: ub.badge.id,
      key: ub.badge.key,
      name: ub.badge.name,
      description: ub.badge.description,
      earnedAt: ub.earnedAt.toISOString(),
    }));
  }

  async checkAndAward(userId: string): Promise<void> {
    const alreadyEarned = await this.prisma.userBadge.findMany({
      where: { userId },
      include: { badge: { select: { key: true } } },
    });
    const earnedKeys = new Set(alreadyEarned.map((ub) => ub.badge.key));

    const missing = BADGE_KEYS.filter((k) => !earnedKeys.has(k));
    if (!missing.length) return;

    const [completedCount, completedSessions, stats] = await Promise.all([
      this.prisma.taskSession.count({ where: { userId, status: 'COMPLETED' } }),
      this.prisma.taskSession.findMany({
        where: { userId, status: 'COMPLETED' },
        select: { task: { select: { category: true } } },
      }),
      this.journalService.getStats(userId),
    ]);

    const distinctCategories = new Set(completedSessions.map((s) => s.task.category));

    const toAward: BadgeKey[] = [];
    for (const key of missing) {
      let qualifies = false;
      switch (key) {
        case 'FIRST_STEP':
          qualifies = completedCount >= 1;
          break;
        case 'WEEK':
          qualifies = completedCount >= 7;
          break;
        case 'STREAK_3':
          qualifies = stats.currentStreak >= 3;
          break;
        case 'ALL_CATEGORIES':
          qualifies = distinctCategories.size === 4;
          break;
      }
      if (qualifies) toAward.push(key);
    }

    if (!toAward.length) return;

    const badges = await this.prisma.badge.findMany({
      where: { key: { in: toAward } },
    });

    await this.prisma.userBadge.createMany({
      data: badges.map((b) => ({ userId, badgeId: b.id })),
      skipDuplicates: true,
    });

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { locale: true },
    });
    if (!user) return;

    const isRu = user.locale === 'RU';
    for (const badge of badges) {
      void this.notificationsService.sendPush(
        userId,
        isRu ? 'Новый бейдж!' : 'New badge!',
        isRu ? `Получен бейдж: ${badge.name} 🏆` : `Badge earned: ${badge.name} 🏆`,
      );
    }
  }
}
