import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { SavePushTokenDto } from './dto/save-push-token.dto';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async savePushToken(userId: string, dto: SavePushTokenDto): Promise<void> {
    await this.prisma.pushToken.upsert({
      where: { token: dto.token },
      update: { userId, platform: dto.platform },
      create: { userId, token: dto.token, platform: dto.platform },
    });
  }

  async deletePushToken(userId: string, token: string): Promise<void> {
    await this.prisma.pushToken.deleteMany({
      where: { userId, token },
    });
  }

  async deleteAllUserPushTokens(userId: string): Promise<void> {
    await this.prisma.pushToken.deleteMany({ where: { userId } });
  }

  async sendPush(
    userId: string,
    title: string,
    body: string,
    data?: Record<string, string>,
  ): Promise<void> {
    const tokens = await this.prisma.pushToken.findMany({ where: { userId } });
    if (!tokens.length) return;

    const expoToken = this.config.get<string>('EXPO_ACCESS_TOKEN');
    const messages = tokens.map((t) => ({ to: t.token, title, body, data }));

    try {
      await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(expoToken && { Authorization: `Bearer ${expoToken}` }),
        },
        body: JSON.stringify(messages),
      });
    } catch (error) {
      this.logger.error(`Failed to send push to user ${userId}`, error);
    }
  }

  @Cron('0 10 * * *')
  async sendDailyReminders(): Promise<void> {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    const usersWithActivity = await this.prisma.taskSession.findMany({
      where: { startedAt: { gte: today }, status: { in: ['ACTIVE', 'COMPLETED'] } },
      select: { userId: true },
      distinct: ['userId'],
    });
    const activeUserIds = new Set(usersWithActivity.map((s) => s.userId));

    const usersWithTokens = await this.prisma.pushToken.findMany({
      select: { userId: true },
      distinct: ['userId'],
    });

    for (const { userId } of usersWithTokens) {
      if (activeUserIds.has(userId)) continue;
      const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { locale: true } });
      if (!user) continue;

      const isRu = user.locale === 'RU';
      await this.sendPush(
        userId,
        isRu ? 'Время выйти на улицу' : 'Time to go outside',
        isRu ? 'Новое задание ждёт вас' : 'A new assignment is waiting for you',
      );
    }
  }

  @Cron('0 20 * * *')
  async sendStreakWarnings(): Promise<void> {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    const usersCompletedToday = await this.prisma.taskSession.findMany({
      where: { completedAt: { gte: today }, status: 'COMPLETED' },
      select: { userId: true },
      distinct: ['userId'],
    });
    const completedTodayIds = new Set(usersCompletedToday.map((s) => s.userId));

    const yesterday = new Date(today.getTime() - 86400000);
    const usersWithStreak = await this.prisma.taskSession.findMany({
      where: { completedAt: { gte: yesterday, lt: today }, status: 'COMPLETED' },
      select: { userId: true },
      distinct: ['userId'],
    });

    for (const { userId } of usersWithStreak) {
      if (completedTodayIds.has(userId)) continue;
      const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { locale: true } });
      if (!user) continue;

      const isRu = user.locale === 'RU';
      await this.sendPush(
        userId,
        isRu ? 'Серия под угрозой' : 'Streak at risk',
        isRu
          ? 'Серия прервётся сегодня. Успейте выполнить задание'
          : 'Your streak will end today. Complete your assignment in time',
      );
    }
  }
}
