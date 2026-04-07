import { Test, TestingModule } from '@nestjs/testing';
import { BadgesService } from './badges.service';
import { PrismaService } from '../prisma/prisma.service';
import { JournalService } from '../journal/journal.service';
import { NotificationsService } from '../notifications/notifications.service';

const BADGE_DEFS = [
  { id: 'b-1', key: 'FIRST_STEP', name: 'First Step', description: 'Complete your first assignment' },
  { id: 'b-2', key: 'WEEK', name: 'Week', description: 'Complete 7 assignments' },
  { id: 'b-3', key: 'STREAK_3', name: 'Streak x3', description: '3 days in a row' },
  { id: 'b-4', key: 'ALL_CATEGORIES', name: 'All Categories', description: 'All 4 categories' },
];

const mockPrisma = {
  badge: { findMany: jest.fn() },
  userBadge: { findMany: jest.fn(), createMany: jest.fn() },
  taskSession: { count: jest.fn(), findMany: jest.fn() },
  user: { findUnique: jest.fn() },
};

const mockJournalService = {
  getStats: jest.fn(),
};

const mockNotificationsService = {
  sendPush: jest.fn().mockResolvedValue(undefined),
};

describe('BadgesService', () => {
  let service: BadgesService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BadgesService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: JournalService, useValue: mockJournalService },
        { provide: NotificationsService, useValue: mockNotificationsService },
      ],
    }).compile();

    service = module.get<BadgesService>(BadgesService);
    jest.clearAllMocks();
  });

  // ─── findAll ──────────────────────────────────────────────────────────────

  describe('findAll', () => {
    it('returns all badges with earned flag', async () => {
      mockPrisma.badge.findMany.mockResolvedValue(BADGE_DEFS);
      mockPrisma.userBadge.findMany.mockResolvedValue([
        { badge: { key: 'FIRST_STEP' }, earnedAt: new Date('2026-04-01T12:00:00Z') },
      ]);

      const result = await service.findAll('user-1');

      expect(result).toHaveLength(4);
      const firstStep = result.find((b) => b.key === 'FIRST_STEP')!;
      expect(firstStep.earned).toBe(true);
      expect(firstStep.earnedAt).toBe('2026-04-01T12:00:00.000Z');

      const week = result.find((b) => b.key === 'WEEK')!;
      expect(week.earned).toBe(false);
      expect(week.earnedAt).toBeNull();
    });

    it('returns all badges as not earned for a new user', async () => {
      mockPrisma.badge.findMany.mockResolvedValue(BADGE_DEFS);
      mockPrisma.userBadge.findMany.mockResolvedValue([]);

      const result = await service.findAll('user-new');
      expect(result.every((b) => !b.earned)).toBe(true);
    });
  });

  // ─── findEarned ───────────────────────────────────────────────────────────

  describe('findEarned', () => {
    it('returns only earned badges with earnedAt', async () => {
      const earnedAt = new Date('2026-04-01T12:00:00Z');
      mockPrisma.userBadge.findMany.mockResolvedValue([
        { badge: BADGE_DEFS[0], earnedAt },
      ]);

      const result = await service.findEarned('user-1');

      expect(result).toHaveLength(1);
      expect(result[0].key).toBe('FIRST_STEP');
      expect(result[0].earnedAt).toBe('2026-04-01T12:00:00.000Z');
    });

    it('returns empty array for user with no badges', async () => {
      mockPrisma.userBadge.findMany.mockResolvedValue([]);
      const result = await service.findEarned('user-new');
      expect(result).toHaveLength(0);
    });
  });

  // ─── checkAndAward ────────────────────────────────────────────────────────

  function setupCheckAndAward({
    earnedKeys = [],
    completedCount = 0,
    completedSessions = [] as { task: { category: string } }[],
    currentStreak = 0,
  } = {}) {
    mockPrisma.userBadge.findMany.mockResolvedValue(
      earnedKeys.map((key) => ({ badge: { key } })),
    );
    mockPrisma.taskSession.count.mockResolvedValue(completedCount);
    mockPrisma.taskSession.findMany.mockResolvedValue(completedSessions);
    mockJournalService.getStats.mockResolvedValue({ currentStreak });
    mockPrisma.badge.findMany.mockImplementation(
      (args?: { where?: { key?: { in?: string[] } } }) => {
        const keys = args?.where?.key?.in;
        return Promise.resolve(keys ? BADGE_DEFS.filter((b) => keys.includes(b.key)) : BADGE_DEFS);
      },
    );
    mockPrisma.userBadge.createMany.mockResolvedValue({ count: 1 });
    mockPrisma.user.findUnique.mockResolvedValue({ locale: 'EN' });
  }

  describe('FIRST_STEP badge', () => {
    it('awards FIRST_STEP when completedCount >= 1', async () => {
      setupCheckAndAward({ completedCount: 1, currentStreak: 0 });

      await service.checkAndAward('user-1');

      expect(mockPrisma.userBadge.createMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.arrayContaining([
            expect.objectContaining({ badgeId: 'b-1' }),
          ]),
          skipDuplicates: true,
        }),
      );
    });

    it('does not award FIRST_STEP when completedCount = 0', async () => {
      setupCheckAndAward({ completedCount: 0, currentStreak: 0 });

      await service.checkAndAward('user-1');

      expect(mockPrisma.userBadge.createMany).not.toHaveBeenCalled();
    });
  });

  describe('WEEK badge', () => {
    it('awards WEEK when completedCount >= 7', async () => {
      setupCheckAndAward({ completedCount: 7, currentStreak: 0 });

      await service.checkAndAward('user-1');

      expect(mockPrisma.userBadge.createMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.arrayContaining([
            expect.objectContaining({ badgeId: 'b-2' }),
          ]),
        }),
      );
    });

    it('does not award WEEK at 6 completions', async () => {
      setupCheckAndAward({ completedCount: 6, currentStreak: 0 });

      await service.checkAndAward('user-1');

      const calls = mockPrisma.userBadge.createMany.mock.calls;
      const allAwardedIds = calls.flatMap((c: [{ data: { badgeId: string }[] }]) =>
        c[0].data.map((d) => d.badgeId),
      );
      expect(allAwardedIds).not.toContain('b-2');
    });
  });

  describe('STREAK_3 badge', () => {
    it('awards STREAK_3 when currentStreak >= 3', async () => {
      setupCheckAndAward({ completedCount: 3, currentStreak: 3 });

      await service.checkAndAward('user-1');

      expect(mockPrisma.userBadge.createMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.arrayContaining([
            expect.objectContaining({ badgeId: 'b-3' }),
          ]),
        }),
      );
    });

    it('does not award STREAK_3 when streak = 2', async () => {
      setupCheckAndAward({ completedCount: 2, currentStreak: 2 });

      await service.checkAndAward('user-1');

      const calls = mockPrisma.userBadge.createMany.mock.calls;
      const allAwardedIds = calls.flatMap((c: [{ data: { badgeId: string }[] }]) =>
        c[0].data.map((d) => d.badgeId),
      );
      expect(allAwardedIds).not.toContain('b-3');
    });
  });

  describe('ALL_CATEGORIES badge', () => {
    it('awards ALL_CATEGORIES when all 4 categories completed', async () => {
      const completedSessions = [
        { task: { category: 'VISUAL' } },
        { task: { category: 'TECHNICAL' } },
        { task: { category: 'SOCIAL' } },
        { task: { category: 'RESTRICTION' } },
      ];
      setupCheckAndAward({ completedCount: 4, completedSessions, currentStreak: 0 });

      await service.checkAndAward('user-1');

      expect(mockPrisma.userBadge.createMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.arrayContaining([
            expect.objectContaining({ badgeId: 'b-4' }),
          ]),
        }),
      );
    });

    it('does not award ALL_CATEGORIES with only 3 distinct categories', async () => {
      const completedSessions = [
        { task: { category: 'VISUAL' } },
        { task: { category: 'VISUAL' } },
        { task: { category: 'TECHNICAL' } },
        { task: { category: 'SOCIAL' } },
      ];
      setupCheckAndAward({ completedCount: 4, completedSessions, currentStreak: 0 });

      await service.checkAndAward('user-1');

      const calls = mockPrisma.userBadge.createMany.mock.calls;
      const allAwardedIds = calls.flatMap((c: [{ data: { badgeId: string }[] }]) =>
        c[0].data.map((d) => d.badgeId),
      );
      expect(allAwardedIds).not.toContain('b-4');
    });
  });

  describe('multiple badges at once', () => {
    it('awards all qualifying badges in one call', async () => {
      const completedSessions = [
        { task: { category: 'VISUAL' } },
        { task: { category: 'TECHNICAL' } },
        { task: { category: 'SOCIAL' } },
        { task: { category: 'RESTRICTION' } },
        { task: { category: 'VISUAL' } },
        { task: { category: 'VISUAL' } },
        { task: { category: 'VISUAL' } },
      ];
      setupCheckAndAward({ completedCount: 7, completedSessions, currentStreak: 4 });

      await service.checkAndAward('user-1');

      const callArg = mockPrisma.userBadge.createMany.mock.calls[0][0];
      expect(callArg.data).toHaveLength(4); // all 4 badges
    });
  });

  describe('already earned', () => {
    it('skips check entirely when all badges already earned', async () => {
      mockPrisma.userBadge.findMany.mockResolvedValue(
        ['FIRST_STEP', 'WEEK', 'STREAK_3', 'ALL_CATEGORIES'].map((key) => ({ badge: { key } })),
      );

      await service.checkAndAward('user-1');

      expect(mockPrisma.taskSession.count).not.toHaveBeenCalled();
      expect(mockPrisma.userBadge.createMany).not.toHaveBeenCalled();
    });

    it('only checks missing badges', async () => {
      setupCheckAndAward({
        earnedKeys: ['FIRST_STEP', 'WEEK'],
        completedCount: 8,
        currentStreak: 4,
        completedSessions: [
          { task: { category: 'VISUAL' } },
          { task: { category: 'TECHNICAL' } },
          { task: { category: 'SOCIAL' } },
          { task: { category: 'RESTRICTION' } },
        ],
      });

      await service.checkAndAward('user-1');

      const callArg = mockPrisma.userBadge.createMany.mock.calls[0][0];
      // Only STREAK_3 and ALL_CATEGORIES should be awarded
      expect(callArg.data).toHaveLength(2);
      const awardedIds = callArg.data.map((d: { badgeId: string }) => d.badgeId);
      expect(awardedIds).toContain('b-3');
      expect(awardedIds).toContain('b-4');
    });
  });

  describe('push notifications', () => {
    it('sends push notification for each new badge', async () => {
      setupCheckAndAward({ completedCount: 1, currentStreak: 0 });

      await service.checkAndAward('user-1');

      expect(mockNotificationsService.sendPush).toHaveBeenCalledWith(
        'user-1',
        expect.any(String),
        expect.stringContaining('First Step'),
      );
    });

    it('sends RU message when user locale is RU', async () => {
      setupCheckAndAward({ completedCount: 1, currentStreak: 0 });
      mockPrisma.user.findUnique.mockResolvedValue({ locale: 'RU' });

      await service.checkAndAward('user-1');

      expect(mockNotificationsService.sendPush).toHaveBeenCalledWith(
        'user-1',
        'Новый бейдж!',
        expect.any(String),
      );
    });

    it('does not send push if no badges awarded', async () => {
      setupCheckAndAward({ completedCount: 0, currentStreak: 0 });

      await service.checkAndAward('user-1');

      expect(mockNotificationsService.sendPush).not.toHaveBeenCalled();
    });
  });
});
